/** A user-facing control on a recipe. */
export type ParamDef =
  | { kind: "color"; id: string; label: string; default: string }
  | {
      kind: "range";
      id: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
    }
  | {
      kind: "select";
      id: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | { kind: "toggle"; id: string; label: string; default: boolean };

export type ParamValues = Record<string, string | number | boolean>;

/** One freehand element drawn on the preview (doodle recipe only). */
export interface Stroke {
  kind: "line" | "dot";
  color: string; // hex
  width: number; // approximate stroke width / blob radius in px
  intensity: number; // 0..200 (%)
  points: [number, number][];
}

/** Rendering context when a recipe is one layer of a mixed artwork. */
export interface LayerCtx {
  width: number;
  height: number;
  /** Multiply 8-bit sample constants by this (257 on the 16-bit mix canvas). */
  scale: number;
  /**
   * The visible window of this layer on the canvas. Position-aware recipes
   * (gradient ramps, CA seeds) anchor their pattern here; the mixer masks
   * everything outside it. Defaults to the full canvas.
   */
  region?: { x: number; y: number; w: number; h: number };
  /** Alpha sample value meaning "fully visible at this layer's opacity". */
  alphaOn?: number;
  /** Whether this layer is the base of the mix or an overlay. */
  role?: "base" | "overlay";
  /**
   * The base layer's RCT. Frames blend in the base's transform space, so
   * color-picker overlays must emit matching-space values (handled for
   * YCoCg, RCT 6) or their colors shift.
   */
  baseRct?: number;
}

/** A recipe rendered as a mixable layer. */
export interface LayerParts {
  /** Per-frame header keywords that work on any layer (e.g. `RCT 6`). */
  header?: string;
  /** Spline blocks — only rendered on the base layer of a mix. */
  splines?: string;
  /**
   * Optional alpha-channel tree (values: ctx.alphaOn = visible, 0 = not).
   * Lets a recipe shape its own silhouette instead of the rectangular
   * window — e.g. logo stamps. Ignored for "mul" layers (kMul has no alpha).
   */
  alpha?: string;
  tree: string;
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  /** One-liner shown to non-technical users. */
  blurb: string;
  params: ParamDef[];
  /** Whether this recipe uses drawn strokes (shows draw tools on the preview). */
  usesStrokes?: boolean;
  /** Layers carry their silhouette in the alpha channel (no Shade blending). */
  alphaDriven?: boolean;
  generate(values: ParamValues, strokes: Stroke[]): string;
  /**
   * Emit this recipe as one layer of a multi-frame mix. Recipes without
   * this method (e.g. quilt, whose GroupShift is file-global) can't be mixed.
   */
  layer?(values: ParamValues, strokes: Stroke[], ctx: LayerCtx): LayerParts;
  /** Random parameter values for "Surprise me". */
  randomize(): ParamValues;
}

export function defaultsOf(recipe: Recipe): ParamValues {
  const out: ParamValues = {};
  for (const p of recipe.params) out[p.id] = p.default;
  return out;
}
