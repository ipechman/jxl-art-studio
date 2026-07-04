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
import { PRESETS, type Preset } from "../presets.ts";
import { buildHash, parseHash } from "../share.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export class App {
  private mode: "builder" | "code" = "builder";
  private recipe: Recipe = RECIPES[0];
  private values = new Map<string, ParamValues>();
  private strokes: Stroke[] = [];
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

  private regenerate() {
    const strokes = this.pendingStroke
      ? [...this.strokes, this.pendingStroke]
      : this.strokes;
    this.code = this.recipe.generate(this.valuesFor(this.recipe), strokes);
    ($("code-editor") as HTMLTextAreaElement).value = this.code;
  }

  private refresh(debounceMs = 120) {
    clearTimeout(this.encodeTimer);
    this.encodeTimer = window.setTimeout(() => this.encodeNow(), debounceMs);
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

  private scheduleHashUpdate() {
    clearTimeout(this.hashTimer);
    this.hashTimer = window.setTimeout(async () => {
      const hash = await buildHash({
        mode: this.mode,
        code: this.lastGoodCode || this.code,
        recipeId: this.recipe.id,
        values: this.valuesFor(this.recipe),
        strokes: this.strokes,
      });
      history.replaceState(null, "", hash);
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
    const usesStrokes = Boolean(r.usesStrokes);
    $("stroke-tools").hidden = !usesStrokes;
    this.preview.drawMode = usesStrokes;
    this.preview.setDrawCursor(usesStrokes);
    this.regenerate();
    this.refresh(0);
  }

  private setMode(mode: "builder" | "code") {
    this.mode = mode;
    $("panel-builder").hidden = mode !== "builder";
    $("panel-code").hidden = mode !== "code";
    document
      .querySelectorAll<HTMLButtonElement>(".tab")
      .forEach((b) => b.classList.toggle("selected", b.dataset.tab === mode));
    const drawing = mode === "builder" && Boolean(this.recipe.usesStrokes);
    this.preview.drawMode = drawing;
    this.preview.setDrawCursor(drawing);
  }

  private wireTabs() {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        const target = b.dataset.tab as "builder" | "code";
        if (target === this.mode) return;
        if (target === "builder") {
          this.selectRecipe(this.recipe.id);
        } else {
          this.setMode("code");
          this.refresh(0);
        }
      }),
    );
  }

  private wireHeader() {
    $("btn-surprise").addEventListener("click", () => this.surprise());
    $("btn-download").addEventListener("click", () => this.downloadJxl());
    $("btn-png").addEventListener("click", () => this.exportPng());
    $("btn-share").addEventListener("click", () => this.copyLink());
  }

  private surprise() {
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
    a.download = `${this.mode === "code" ? "art" : this.recipe.id}-${this.lastBytes.length}b.jxl`;
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
    const hash = await buildHash({
      mode: this.mode,
      code: this.lastGoodCode || this.code,
      recipeId: this.recipe.id,
      values: this.valuesFor(this.recipe),
      strokes: this.strokes,
    });
    const url = `${location.origin}${location.pathname}${hash}`;
    await navigator.clipboard.writeText(url);
    toast("🔗 Link copied — anyone can open your art with it.");
  }

  private applyPreset(preset: Preset) {
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
      if (this.tool.kind === "dot") {
        this.regenerate();
        this.refresh(30);
      }
      return;
    }
    if (!this.pendingStroke) return;
    if (phase === "move") {
      if (this.tool.kind === "dot") {
        this.pendingStroke.points = [[x, y]];
      } else {
        const pts = this.pendingStroke.points;
        const [lx, ly] = pts[pts.length - 1];
        if (Math.hypot(x - lx, y - ly) >= 14) pts.push([x, y]);
      }
      this.regenerate();
      this.refresh(60);
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
    this.regenerate();
    this.refresh(0);
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
