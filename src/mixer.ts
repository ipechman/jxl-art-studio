/**
 * Preset mixing: stacks builder presets as JPEG XL layers (`NotLast` frames).
 * Rules established empirically (tools/batch4.mjs, tools/batch5.mjs):
 *  - all layers share one 16-bit canvas; 8-bit recipes scale constants ×257
 *  - a global Alpha channel gives true per-layer opacity: kBlend (normal) and
 *    kAlphaWeightedAdd (glow) weight the layer by its alpha; kMul ignores it
 *  - overlay frames MUST be full-canvas (smaller/upsampled frames crash the
 *    encoder), so move/scale is done in-tree: the alpha channel becomes a
 *    rectangular window and position-aware recipes anchor patterns to it
 *  - splines only render on the base frame, so spline presets can't overlay
 *  - Orientation/Bitdepth/GroupShift are file-global: rotation applies to the
 *    whole artwork, and the quilt recipe (GroupShift) can't be mixed at all
 */
import { PRESETS, type MixLayer, type Preset } from "./presets.ts";
import { recipeById } from "./recipes/index.ts";
import {
  defaultsOf,
  type LayerCtx,
  type ParamValues,
  type Stroke,
} from "./recipes/types.ts";

/** Virtual base preset backed by the user's live doodle (drawn strokes). */
export const DOODLE_LAYER_ID = "__doodle__";

/** The app's current doodle state, threaded into generateMix. */
export interface LiveDoodle {
  values: ParamValues;
  strokes: Stroke[];
}

export const MIX_SIZE = 512;
const MAX_LAYERS = 4;

/** Recipes whose layers carry splines — usable only as the base of a mix. */
const SPLINE_RECIPES = new Set(["sunset", "doodle", "landscape"]);

export interface MixState {
  layers: MixLayer[];
  /** Whole-artwork rotation in quarter-turns (0-3); Orientation is file-global. */
  rotate: number;
}

export const LAYER_DEFAULTS: Omit<MixLayer, "presetId"> = {
  blend: "add",
  opacity: 100,
  x: 50,
  y: 50,
  w: 100,
  h: 100,
};

/** EXIF orientation values for 0/90/180/270 degrees clockwise. */
const ORIENTATIONS = [0, 4, 2, 6];

const BLEND_KEYWORD: Record<MixLayer["blend"], string> = {
  normal: "kBlend",
  add: "kAlphaWeightedAdd",
  mul: "kMul",
};

/** Whether this layer's window sliders have any effect (see generateMix). */
export function layerWindowable(l: MixLayer): boolean {
  const preset = PRESETS.find((p) => p.id === l.presetId);
  return !(l.blend === "mul" && preset?.recipeId === "plasma");
}

export function mixablePresets(role: "base" | "overlay"): Preset[] {
  const list = PRESETS.filter((p) => {
    if (p.mode !== "builder") return false;
    const r = recipeById(p.recipeId!);
    if (!r?.layer) return false;
    if (role === "overlay" && SPLINE_RECIPES.has(r.id)) return false;
    return true;
  });
  if (role === "base") {
    list.unshift({
      id: DOODLE_LAYER_ID,
      name: "✏️ My Doodle (draw on it!)",
      mode: "builder",
      recipeId: "doodle",
    });
  }
  return list;
}

export function defaultMixState(): MixState {
  return {
    layers: [
      { ...LAYER_DEFAULTS, presetId: "golden-sunset" },
      { ...LAYER_DEFAULTS, presetId: "neon-triangles" },
    ],
    rotate: 0,
  };
}

export function randomMixState(): MixState {
  const pickFrom = (arr: Preset[]) => arr[Math.floor(Math.random() * arr.length)];
  const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const maybeRandomValues = (presetId: string) => {
    if (Math.random() > 0.35) return undefined;
    const preset = PRESETS.find((p) => p.id === presetId);
    const recipe = preset && recipeById(preset.recipeId!);
    return recipe?.randomize();
  };
  const basePreset = pickFrom(mixablePresets("base").filter((p) => p.id !== DOODLE_LAYER_ID));
  const layers: MixLayer[] = [
    { ...LAYER_DEFAULTS, presetId: basePreset.id, values: maybeRandomValues(basePreset.id) },
  ];
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const roll = Math.random();
    const blend = roll < 0.5 ? "add" : roll < 0.85 ? "normal" : "mul";
    const windowed = Math.random() < 0.45;
    const presetId = pickFrom(mixablePresets("overlay")).id;
    layers.push({
      presetId,
      blend,
      opacity: blend === "mul" ? 100 : rnd(35, 100),
      w: windowed ? rnd(30, 80) : 100,
      h: windowed ? rnd(30, 80) : 100,
      x: rnd(0, 100),
      y: rnd(0, 100),
      values: maybeRandomValues(presetId),
    });
  }
  return { layers, rotate: Math.random() < 0.2 ? rnd(1, 3) : 0 };
}

export function sanitizeMixState(input: {
  layers?: Partial<MixLayer>[];
  rotate?: number;
}): MixState {
  const base = mixablePresets("base").map((p) => p.id);
  const overlay = mixablePresets("overlay").map((p) => p.id);
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
  };
  const layers = (input.layers ?? [])
    .filter((l, i) => l.presetId && (i === 0 ? base : overlay).includes(l.presetId))
    .slice(0, MAX_LAYERS)
    .map((l): MixLayer => {
      let blend: MixLayer["blend"] =
        l.blend === "mul" || l.blend === "normal" ? l.blend : "add";
      // alpha-driven silhouettes (logo stamps) vanish under kMul, which
      // ignores the alpha channel — snap those back to glow
      const preset = PRESETS.find((p) => p.id === l.presetId);
      if (blend === "mul" && preset && recipeById(preset.recipeId!)?.alphaDriven) {
        blend = "add";
      }
      return {
        presetId: l.presetId!,
        blend,
        opacity: clamp(l.opacity, 5, 100, 100),
        x: clamp(l.x, 0, 100, 50),
        y: clamp(l.y, 0, 100, 50),
        w: clamp(l.w, 10, 100, 100),
        h: clamp(l.h, 10, 100, 100),
        values:
          l.values && typeof l.values === "object" && !Array.isArray(l.values)
            ? l.values
            : undefined,
      };
    });
  return {
    layers: layers.length ? layers : defaultMixState().layers,
    rotate: clamp(input.rotate, 0, 3, 0),
  };
}

function regionOf(l: MixLayer): { x: number; y: number; w: number; h: number } {
  const w = Math.max(8, Math.round((MIX_SIZE * l.w) / 100));
  const h = Math.max(8, Math.round((MIX_SIZE * l.h) / 100));
  return {
    x: Math.round(((MIX_SIZE - w) * l.x) / 100),
    y: Math.round(((MIX_SIZE - h) * l.y) / 100),
    w,
    h,
  };
}

/**
 * Wraps `inner` so pixels outside the region become `outer`. Emits only the
 * comparisons a partial window actually needs (full canvas → `inner` as-is).
 */
function rectMask(
  inner: string,
  outer: string,
  r: { x: number; y: number; w: number; h: number },
): string {
  let expr = inner;
  if (r.x + r.w < MIX_SIZE) expr = `if x > ${r.x + r.w - 1}\n ${outer}\n ${expr}`;
  if (r.x > 0) expr = `if x > ${r.x - 1}\n ${expr}\n ${outer}`;
  if (r.y + r.h < MIX_SIZE) expr = `if y > ${r.y + r.h - 1}\n ${outer}\n ${expr}`;
  if (r.y > 0) expr = `if y > ${r.y - 1}\n ${expr}\n ${outer}`;
  return expr;
}

export function generateMix(state: MixState, live?: LiveDoodle): string {
  const { layers, rotate } = state;
  const parts: string[] = [];
  let baseRct: number | undefined;
  layers.forEach((l, i) => {
    const preset: Preset | undefined =
      l.presetId === DOODLE_LAYER_ID
        ? {
            id: DOODLE_LAYER_ID,
            name: "My Doodle",
            mode: "builder",
            recipeId: "doodle",
            values: live?.values,
            strokes: live?.strokes ?? [],
          }
        : PRESETS.find((p) => p.id === l.presetId);
    const recipe = preset && recipeById(preset.recipeId!);
    if (!preset || !recipe?.layer) return;
    // Plasma's unclamped Weighted predictor explodes when it reads the 65535
    // color mask of a shade window, corrupting the file — keep it full-canvas.
    const windowable = !(l.blend === "mul" && recipe.id === "plasma");
    const region =
      i === 0 || !windowable
        ? { x: 0, y: 0, w: MIX_SIZE, h: MIX_SIZE }
        : regionOf(l);
    const alpha = Math.round((65535 * l.opacity) / 100);
    const ctx: LayerCtx = {
      width: MIX_SIZE,
      height: MIX_SIZE,
      scale: 257,
      region,
      alphaOn: alpha,
      role: i === 0 ? "base" : "overlay",
      baseRct,
    };
    const lp = recipe.layer(
      { ...defaultsOf(recipe), ...preset.values, ...l.values },
      preset.strokes ?? [],
      ctx,
    );
    const { header, splines, tree } = lp;
    if (i === 0) {
      baseRct = header ? Number(/RCT (\d+)/.exec(header)?.[1]) || undefined : undefined;
    }

    // The alpha channel (c == 3) carries opacity and the visibility window —
    // or the recipe's own silhouette (logo stamps).
    let framed: string;
    if (i === 0) {
      framed = `if c > 2\n - Set 65535\n ${tree}`;
    } else if (l.blend === "mul") {
      // kMul ignores alpha, so the window masks color with 65535 (identity)
      framed = `if c > 2\n - Set 65535\n ${rectMask(tree, "- Set 65535", region)}`;
    } else if (lp.alpha) {
      framed = `if c > 2\n ${rectMask(lp.alpha, "- Set 0", region)}\n ${tree}`;
    } else {
      framed = `if c > 2\n ${rectMask(`- Set ${alpha}`, "- Set 0", region)}\n ${tree}`;
    }

    const head: string[] = [`Width ${MIX_SIZE} Height ${MIX_SIZE}`];
    if (i === 0) {
      head.push("Bitdepth 16 Alpha");
      if (rotate) head.push(`Orientation ${ORIENTATIONS[rotate & 3]}`);
    } else {
      head.push(`BlendMode ${BLEND_KEYWORD[l.blend]}`);
    }
    if (i < layers.length - 1) head.push("NotLast");
    parts.push(
      [head.join(" "), header, i === 0 ? splines : "", framed]
        .filter(Boolean)
        .join("\n"),
    );
  });
  return parts.join("\n");
}
