import { RECIPES, recipeById } from "../recipes/index.ts";
import {
  defaultsOf,
  type ParamValues,
  type Recipe,
  type Stroke,
} from "../recipes/types.ts";
import { encodeTree, decodeJxl } from "../jxl-client.ts";
import { renderControls } from "./controls.ts";
import { Preview } from "./preview.ts";
import { initGallery } from "./gallery.ts";
import { toast } from "./toast.ts";
import { PRESETS, type MixLayer, type Preset } from "../presets.ts";
import {
  DOODLE_LAYER_ID,
  LAYER_DEFAULTS,
  defaultMixState,
  generateMix,
  layerWindowable,
  mixablePresets,
  randomMixState,
  sanitizeMixState,
  type MixState,
} from "../mixer.ts";
import { buildHash, parseHash } from "../share.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export class App {
  private mode: "builder" | "code" | "mix" = "builder";
  private recipe: Recipe = RECIPES[0];
  private values = new Map<string, ParamValues>();
  private strokes: Stroke[] = [];
  private mix: MixState = defaultMixState();
  private code = "";
  private lastBytes: Uint8Array | null = null;
  private lastGoodCode = "";

  private tool: Omit<Stroke, "points"> = {
    kind: "line",
    color: "#ffffff",
    width: 6,
    intensity: 120,
  };
  private pendingStroke: Stroke | null = null;

  private seq = 0;
  private encodeTimer?: number;
  private hashTimer?: number;
  private preview!: Preview;

  init() {
    this.preview = new Preview(
      $("preview") as HTMLCanvasElement,
      $("preview-wrap"),
      $("dims-label"),
    );
    this.preview.onDraw = (phase, x, y) => this.handleDraw(phase, x, y);

    this.buildRecipeGrid();
    this.wireTabs();
    this.wireHeader();
    this.wireStrokeTools();
    this.wireEditor();
    this.wireZoom();
    initGallery($("gallery-strip"), PRESETS, (p) => this.applyPreset(p));
    window.addEventListener("resize", () => this.preview.setZoom("fit"));

    $("mix-add").addEventListener("click", () => {
      if (this.mix.layers.length >= 4) return;
      const overlays = mixablePresets("overlay");
      this.mix.layers.push({
        ...LAYER_DEFAULTS,
        presetId: overlays[Math.floor(Math.random() * overlays.length)].id,
      });
      this.enterMixMode();
    });
    ($("mix-rotate") as HTMLSelectElement).addEventListener("change", () => {
      this.mix.rotate = Number(($("mix-rotate") as HTMLSelectElement).value);
      this.regenerate();
      this.refresh();
    });

    parseHash(location.hash).then((shared) => {
      if (shared?.mode === "builder" && shared.recipeId) {
        const r = recipeById(shared.recipeId);
        if (r) {
          this.recipe = r;
          this.values.set(r.id, { ...defaultsOf(r), ...shared.values });
          this.strokes = shared.strokes ?? [];
          this.selectRecipe(r.id, false);
          return;
        }
      }
      if (shared?.mode === "mix" && shared.layers) {
        this.mix = sanitizeMixState({ layers: shared.layers, rotate: shared.rotate });
        if (shared.doodle) {
          const dr = recipeById("doodle")!;
          this.values.set(dr.id, { ...defaultsOf(dr), ...shared.doodle.v });
          this.strokes = shared.doodle.s ?? [];
        }
        this.enterMixMode();
        return;
      }
      if (shared?.mode === "code") {
        this.setMode("code");
        this.code = shared.code;
        ($("code-editor") as HTMLTextAreaElement).value = shared.code;
        this.refresh(0);
        return;
      }
      this.applyPreset(PRESETS[0]);
    });
  }

  // --- state -------------------------------------------------------------

  private valuesFor(recipe: Recipe): ParamValues {
    let v = this.values.get(recipe.id);
    if (!v) {
      v = defaultsOf(recipe);
      this.values.set(recipe.id, v);
    }
    return v;
  }

  private liveStrokes(): Stroke[] {
    return this.pendingStroke ? [...this.strokes, this.pendingStroke] : this.strokes;
  }

  private mixBaseIsDoodle(): boolean {
    return this.mix.layers[0]?.presetId === DOODLE_LAYER_ID;
  }

  private updateDrawMode() {
    const drawing =
      (this.mode === "builder" && Boolean(this.recipe.usesStrokes)) ||
      (this.mode === "mix" && this.mixBaseIsDoodle());
    $("stroke-tools").hidden = !drawing;
    this.preview.drawMode = drawing;
    this.preview.setDrawCursor(drawing);
  }

  private regenerate() {
    if (this.mode === "mix") {
      const doodle = recipeById("doodle")!;
      this.code = generateMix(this.mix, {
        values: this.valuesFor(doodle),
        strokes: this.liveStrokes(),
      });
    } else {
      this.code = this.recipe.generate(this.valuesFor(this.recipe), this.liveStrokes());
    }
    ($("code-editor") as HTMLTextAreaElement).value = this.code;
  }

  private refresh(debounceMs = 120) {
    clearTimeout(this.encodeTimer);
    this.encodeTimer = window.setTimeout(() => this.encodeNow(), debounceMs);
  }

  private encodeBusy = false;
  private encodeDirty = false;

  /**
   * Live update while drawing. `refresh()` is a debounce, which starves
   * during a continuous drag (every move resets the timer) — this instead
   * encodes immediately and coalesces whatever arrives while it's busy.
   */
  private refreshLive() {
    if (this.encodeBusy) {
      this.encodeDirty = true;
      return;
    }
    this.encodeBusy = true;
    this.encodeNow().finally(() => {
      this.encodeBusy = false;
      if (this.encodeDirty) {
        this.encodeDirty = false;
        this.refreshLive();
      }
    });
  }

  private async encodeNow() {
    const seq = ++this.seq;
    const code = this.code;
    try {
      const bytes = await encodeTree(code);
      const img = await decodeJxl(bytes);
      if (seq !== this.seq) return;
      this.lastBytes = bytes;
      this.lastGoodCode = code;
      this.preview.paint(img);
      this.updateMeter(bytes.length, img.width, img.height);
      this.showCodeError(null);
    } catch (e) {
      if (seq !== this.seq) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (this.mode === "code") this.showCodeError(msg);
      else toast("Hmm, that combination failed to build.");
    }
    this.scheduleHashUpdate();
  }

  private updateMeter(bytes: number, w: number, h: number) {
    const bar = $("meter-bar");
    const label = $("meter-label");
    const pct = Math.min(100, (bytes / 1024) * 100);
    bar.style.width = `${pct}%`;
    bar.className = bytes > 1024 ? "over" : bytes > 768 ? "warn" : "ok";
    const bpp = ((bytes * 8) / (w * h)).toFixed(4);
    label.textContent =
      bytes > 1024
        ? `${bytes} B — over the 1 KB art budget!`
        : `${bytes} B of 1 KB · ${bpp} bits/pixel`;
  }

  private showCodeError(msg: string | null) {
    const box = $("code-error");
    box.hidden = !msg;
    if (msg) box.textContent = msg;
  }

  private shareState() {
    const doodle = recipeById("doodle")!;
    return {
      mode: this.mode,
      code: this.lastGoodCode || this.code,
      recipeId: this.recipe.id,
      values: this.valuesFor(this.recipe),
      strokes: this.strokes,
      layers: this.mix.layers,
      rotate: this.mix.rotate,
      doodle: this.mixBaseIsDoodle()
        ? { v: this.valuesFor(doodle), s: this.strokes }
        : undefined,
    };
  }

  private scheduleHashUpdate() {
    clearTimeout(this.hashTimer);
    this.hashTimer = window.setTimeout(async () => {
      history.replaceState(null, "", await buildHash(this.shareState()));
    }, 400);
  }

  // --- UI wiring -----------------------------------------------------------

  private buildRecipeGrid() {
    const grid = $("recipe-grid");
    grid.innerHTML = "";
    for (const r of RECIPES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipe-card";
      btn.dataset.recipe = r.id;
      btn.innerHTML = `<span class="recipe-emoji">${r.emoji}</span><span>${r.name}</span>`;
      btn.addEventListener("click", () => this.selectRecipe(r.id));
      grid.appendChild(btn);
    }
  }

  private selectRecipe(id: string, resetPending = true) {
    const r = recipeById(id);
    if (!r) return;
    this.recipe = r;
    if (resetPending) this.pendingStroke = null;
    this.setMode("builder");
    document
      .querySelectorAll<HTMLButtonElement>(".recipe-card")
      .forEach((b) => b.classList.toggle("selected", b.dataset.recipe === id));
    $("recipe-blurb").textContent = r.blurb;
    renderControls($("controls"), r, this.valuesFor(r), (pid, val) => {
      this.valuesFor(r)[pid] = val;
      this.regenerate();
      this.refresh();
    });
    this.updateDrawMode();
    this.regenerate();
    this.refresh(0);
  }

  private setMode(mode: "builder" | "code" | "mix") {
    this.mode = mode;
    $("panel-builder").hidden = mode !== "builder";
    $("panel-code").hidden = mode !== "code";
    $("panel-mix").hidden = mode !== "mix";
    document
      .querySelectorAll<HTMLButtonElement>(".tab")
      .forEach((b) => b.classList.toggle("selected", b.dataset.tab === mode));
    this.updateDrawMode();
  }

  private wireTabs() {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        const target = b.dataset.tab as "builder" | "code" | "mix";
        if (target === this.mode) return;
        if (target === "builder") {
          this.selectRecipe(this.recipe.id);
        } else if (target === "mix") {
          this.enterMixMode();
        } else {
          this.setMode("code");
          this.refresh(0);
        }
      }),
    );
  }

  private enterMixMode() {
    this.setMode("mix");
    this.rebuildMixUI();
    this.regenerate();
    this.refresh(0);
  }

  /** Resolve a mix layer's preset, including the virtual "My Doodle" one. */
  private mixPresetFor(presetId: string): Preset | undefined {
    if (presetId === DOODLE_LAYER_ID) {
      return { id: DOODLE_LAYER_ID, name: "My Doodle", mode: "builder", recipeId: "doodle" };
    }
    return PRESETS.find((p) => p.id === presetId);
  }

  private rebuildMixUI() {
    const container = $("mix-layers");
    container.innerHTML = "";
    const layers = this.mix.layers;
    const update = (rebuild = false) => {
      if (rebuild) this.rebuildMixUI();
      this.updateDrawMode(); // the base may have become (or stopped being) a doodle
      this.regenerate();
      this.refresh();
    };

    const makeSlider = (
      parent: HTMLElement,
      name: string,
      min: number,
      max: number,
      value: number,
      onInput: (v: number) => void,
      title = "",
      enabled = true,
    ) => {
      const wrap = document.createElement("label");
      wrap.className = "mix-ctl";
      wrap.title = title;
      const span = document.createElement("span");
      span.textContent = name;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.disabled = !enabled;
      const out = document.createElement("output");
      out.textContent = String(value);
      input.addEventListener("input", () => {
        out.textContent = input.value;
        onInput(Number(input.value));
      });
      wrap.append(span, input, out);
      parent.appendChild(wrap);
    };

    const makeSection = (
      parent: HTMLElement,
      title: string,
      open = false,
    ): HTMLDivElement => {
      const details = document.createElement("details");
      details.className = "mix-section";
      details.open = open;
      const summary = document.createElement("summary");
      summary.textContent = title;
      const body = document.createElement("div");
      body.className = "mix-section-body";
      details.append(summary, body);
      parent.appendChild(details);
      return body;
    };

    layers.forEach((layer, i) => {
      const card = document.createElement("div");
      card.className = "mix-card";

      const row = document.createElement("div");
      row.className = "mix-row";
      const label = document.createElement("span");
      label.className = "mix-label";
      label.textContent = i === 0 ? "Base" : `${i + 1}`;
      label.title = i === 0 ? "The bottom layer of the stack" : `Layer ${i + 1}`;
      row.appendChild(label);

      const presetSel = document.createElement("select");
      for (const p of mixablePresets(i === 0 ? "base" : "overlay")) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        presetSel.appendChild(o);
      }
      presetSel.value = layer.presetId;
      presetSel.addEventListener("change", () => {
        layer.presetId = presetSel.value;
        layer.values = undefined; // fresh start from the newly picked preset
        update(true);
      });
      row.appendChild(presetSel);

      if (i > 0) {
        const btn = (text: string, title: string, onClick: () => void, enabled = true) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "button mix-btn";
          b.textContent = text;
          b.title = title;
          b.disabled = !enabled;
          b.addEventListener("click", onClick);
          row.appendChild(b);
        };
        btn(
          "↑",
          "Move this layer down the stack",
          () => {
            [layers[i - 1], layers[i]] = [layers[i], layers[i - 1]];
            update(true);
          },
          i > 1,
        );
        btn(
          "↓",
          "Move this layer up the stack",
          () => {
            [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
            update(true);
          },
          i < layers.length - 1,
        );
        btn("✕", "Remove this layer", () => {
          layers.splice(i, 1);
          update(true);
        });
      }
      card.appendChild(row);

      const preset = this.mixPresetFor(layer.presetId);
      const recipe = preset && recipeById(preset.recipeId!);

      if (i > 0) {
        const grid = document.createElement("div");
        grid.className = "mix-grid";

        const blendSel = document.createElement("select");
        for (const [value, text] of [
          ["add", "✨ Glow"],
          ["normal", "🖼 Normal"],
          ["mul", "🌑 Shade"],
        ]) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = text;
          blendSel.appendChild(o);
        }
        blendSel.value = layer.blend;
        blendSel.addEventListener("change", () => {
          layer.blend = blendSel.value as MixLayer["blend"];
          update(true); // opacity slider visibility depends on blend
        });
        const blendWrap = document.createElement("label");
        blendWrap.className = "mix-ctl";
        blendWrap.innerHTML = `<span>Blend</span>`;
        blendWrap.appendChild(blendSel);
        grid.appendChild(blendWrap);

        if (layer.blend !== "mul") {
          makeSlider(grid, "Opacity", 5, 100, layer.opacity, (v) => {
            layer.opacity = v;
            update();
          });
        }
        card.appendChild(grid);

        const windowable = layerWindowable(layer);
        const windowTitle = windowable
          ? ""
          : "Plasma can't be windowed in Shade mode (its predictor destabilizes at the window edge)";
        const placement = makeSection(card, "📐 Size & position");
        makeSlider(placement, "Width", 10, 100, layer.w, (v) => {
          layer.w = v;
          update();
        }, windowTitle || "How much of the canvas this layer's window covers", windowable);
        makeSlider(placement, "Height", 10, 100, layer.h, (v) => {
          layer.h = v;
          update();
        }, windowTitle, windowable);
        makeSlider(placement, "Pos ↔", 0, 100, layer.x, (v) => {
          layer.x = v;
          update();
        }, windowTitle || "Slides the window left–right (when smaller than the canvas)", windowable);
        makeSlider(placement, "Pos ↕", 0, 100, layer.y, (v) => {
          layer.y = v;
          update();
        }, windowTitle, windowable);
      }

      // Fine-tuning: the layer's full recipe controls, editing per-layer
      // overrides on top of the picked preset.
      if (recipe) {
        const fine = makeSection(
          card,
          `${recipe.emoji} ${recipe.name} settings`,
        );
        const effective = {
          ...defaultsOf(recipe),
          ...(layer.presetId === DOODLE_LAYER_ID
            ? this.valuesFor(recipe)
            : preset!.values),
          ...layer.values,
        };
        renderControls(fine, recipe, effective, (pid, val) => {
          layer.values = { ...(layer.values ?? {}), [pid]: val };
          this.regenerate();
          this.refresh();
        });
      }

      container.appendChild(card);
    });

    ($("mix-rotate") as HTMLSelectElement).value = String(this.mix.rotate);
    $("mix-add").hidden = layers.length >= 4;
  }

  private wireHeader() {
    $("btn-surprise").addEventListener("click", () => this.surprise());
    $("btn-download").addEventListener("click", () => this.downloadJxl());
    $("btn-png").addEventListener("click", () => this.exportPng());
    $("btn-share").addEventListener("click", () => this.copyLink());
  }

  private surprise() {
    if (this.mode === "mix") {
      this.mix = randomMixState();
      this.enterMixMode();
      toast("🎲 Shuffled the stack!");
      return;
    }
    // sometimes hop to a different recipe — that's half the fun of the dice
    if (this.mode === "code" || Math.random() < 0.4) {
      const others = RECIPES.filter(
        (r) => r.id !== this.recipe.id && !r.usesStrokes,
      );
      this.recipe = others[Math.floor(Math.random() * others.length)];
    }
    this.values.set(this.recipe.id, {
      ...defaultsOf(this.recipe),
      ...this.recipe.randomize(),
    });
    this.selectRecipe(this.recipe.id);
    toast("🎲 Shuffled!");
  }

  private downloadJxl() {
    if (!this.lastBytes) return;
    const blob = new Blob([this.lastBytes as unknown as BlobPart], {
      type: "image/jxl",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stem =
      this.mode === "code" ? "art" : this.mode === "mix" ? "mix" : this.recipe.id;
    a.download = `${stem}-${this.lastBytes.length}b.jxl`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Saved a real JPEG XL file — just ${this.lastBytes.length} bytes.`);
  }

  private exportPng() {
    const canvas = $("preview") as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "jxl-art.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  private async copyLink() {
    const hash = await buildHash(this.shareState());
    const url = `${location.origin}${location.pathname}${hash}`;
    await navigator.clipboard.writeText(url);
    toast("🔗 Link copied — anyone can open your art with it.");
  }

  private applyPreset(preset: Preset) {
    if (preset.mode === "mix") {
      this.mix = sanitizeMixState({ layers: preset.layers, rotate: preset.rotate });
      this.enterMixMode();
      return;
    }
    if (preset.mode === "code") {
      this.setMode("code");
      this.code = preset.code!;
      ($("code-editor") as HTMLTextAreaElement).value = this.code;
      this.refresh(0);
      return;
    }
    const r = recipeById(preset.recipeId!);
    if (!r) return;
    this.recipe = r;
    this.values.set(r.id, { ...defaultsOf(r), ...preset.values });
    this.strokes = preset.strokes ? preset.strokes.map((s) => ({ ...s })) : [];
    this.selectRecipe(r.id);
  }

  // --- stroke tools ----------------------------------------------------------

  private wireStrokeTools() {
    const kindBtns = document.querySelectorAll<HTMLButtonElement>("[data-stroke-kind]");
    kindBtns.forEach((b) =>
      b.addEventListener("click", () => {
        this.tool.kind = b.dataset.strokeKind as "line" | "dot";
        kindBtns.forEach((x) => x.classList.toggle("selected", x === b));
      }),
    );
    const color = $("stroke-color") as HTMLInputElement;
    color.addEventListener("input", () => (this.tool.color = color.value));
    const width = $("stroke-width") as HTMLInputElement;
    width.addEventListener(
      "input",
      () => (this.tool.width = Number(width.value)),
    );
    const intensity = $("stroke-intensity") as HTMLInputElement;
    intensity.addEventListener(
      "input",
      () => (this.tool.intensity = Number(intensity.value)),
    );
    $("stroke-undo").addEventListener("click", () => {
      this.strokes.pop();
      this.regenerate();
      this.refresh(0);
    });
    $("stroke-clear").addEventListener("click", () => {
      this.strokes = [];
      this.regenerate();
      this.refresh(0);
    });
  }

  private handleDraw(phase: "start" | "move" | "end", x: number, y: number) {
    if (phase === "start") {
      this.pendingStroke = { ...this.tool, points: [[x, y]] };
      this.showOverlay(x, y);
      this.regenerate();
      this.refreshLive();
      return;
    }
    if (!this.pendingStroke) return;
    if (phase === "move") {
      if (this.tool.kind === "dot") {
        this.pendingStroke.points = [[x, y]];
      } else {
        const pts = this.pendingStroke.points;
        const [lx, ly] = pts[pts.length - 1];
        if (Math.hypot(x - lx, y - ly) >= 10) pts.push([x, y]);
      }
      this.showOverlay(x, y);
      this.regenerate();
      this.refreshLive();
      return;
    }
    // end
    if (this.tool.kind === "line") {
      const pts = this.pendingStroke.points;
      const [lx, ly] = pts[pts.length - 1];
      if (Math.hypot(x - lx, y - ly) >= 4) pts.push([x, y]);
      this.pendingStroke.points = simplify(pts, 10);
    }
    this.strokes.push(this.pendingStroke);
    this.pendingStroke = null;
    // keep the instant overlay up until the real spline render lands
    this.preview.fadeOverlayOnNextPaint();
    this.regenerate();
    this.refresh(0);
  }

  /** Approximate stroke drawn instantly on the canvas while dragging. */
  private showOverlay(x: number, y: number) {
    const s = this.pendingStroke;
    if (!s) return;
    this.preview.setOverlay({
      kind: s.kind,
      color: s.color,
      width: s.width,
      points: s.kind === "dot" ? [[x, y]] : [...s.points, [x, y]],
    });
  }

  // --- code editor -------------------------------------------------------

  private wireEditor() {
    const editor = $("code-editor") as HTMLTextAreaElement;
    editor.addEventListener("input", () => {
      this.code = editor.value;
      this.refresh(250);
    });
  }

  private wireZoom() {
    document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((b) =>
      b.addEventListener("click", () => {
        const z = b.dataset.zoom!;
        this.preview.setZoom(z === "fit" ? "fit" : Number(z));
        document
          .querySelectorAll<HTMLButtonElement>("[data-zoom]")
          .forEach((x) => x.classList.toggle("selected", x === b));
      }),
    );
  }
}

/** Keep at most `max` points, evenly sampled, endpoints preserved. */
function simplify(points: [number, number][], max: number): [number, number][] {
  if (points.length <= max) return points;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  }
  return out;
}
