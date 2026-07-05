import type { ParamValues, Stroke } from "./recipes/types.ts";

/** One layer of a mixed artwork: a builder preset plus how it sits and blends. */
export interface MixLayer {
  presetId: string;
  /** normal = alpha blend (kBlend), add = glow (kAlphaWeightedAdd), mul = shade (kMul) */
  blend: "normal" | "add" | "mul";
  /** 5..100 %. Ignored by "mul" (the codec's kMul disregards alpha). */
  opacity: number;
  /** Window position 0..100 % (where the layer's visible window sits). */
  x: number;
  y: number;
  /** Window size 10..100 % of the canvas. */
  w: number;
  h: number;
  /** Per-layer recipe parameter overrides (fine-tuning on top of the preset). */
  values?: ParamValues;
}

export interface Preset {
  id: string;
  name: string;
  mode: "builder" | "code" | "mix";
  recipeId?: string;
  values?: ParamValues;
  strokes?: Stroke[];
  code?: string;
  layers?: Partial<MixLayer>[];
  /** Quarter-turns of whole-artwork rotation for mix presets (0-3). */
  rotate?: number;
}

export const PRESETS: Preset[] = [
  {
    id: "golden-sunset",
    name: "Golden Sunset",
    mode: "builder",
    recipeId: "sunset",
    values: {
      sky: "#182060",
      horizon: "#ff8c28",
      sun: true,
      sunColor: "#fff3c0",
      sunSize: 60,
      sunX: 50,
      sunY: 55,
    },
  },
  {
    id: "island-dusk",
    name: "Island Dusk",
    mode: "builder",
    recipeId: "landscape",
    values: {
      sky: "#283c96",
      glow: "#ffa046",
      sea: "#1e285a",
      horizon: 62,
      mountains: 16,
      peaks: 5,
      jagged: 55,
      mist: 55,
      texture: "waves",
      seed: 3,
      sun: true,
      sunSize: 55,
      sunX: 58,
      sunY: 42,
    },
  },
  {
    id: "morning-mist",
    name: "Morning Mist",
    mode: "builder",
    recipeId: "mist",
    values: {
      color: "#dfe6f2",
      density: 55,
      billow: 60,
      texture: "190",
      top: "#5a74c8",
      bottom: "#e8b28c",
    },
  },
  {
    id: "turquoise-x",
    name: "Turquoise X",
    mode: "builder",
    recipeId: "stamp",
    values: {
      shape: "x",
      thickness: 6,
      color: "#28c8b4",
      bg: "#10142e",
      size: 70,
      posX: 50,
      posY: 50,
    },
  },
  {
    id: "neon-triangles",
    name: "Neon Triangles",
    mode: "builder",
    recipeId: "automaton",
    values: { rule: 90, fg: "#50ffdc", bg: "#08183c", size: "513x257", zoom: "1" },
  },
  {
    id: "amber-chaos",
    name: "Amber Chaos",
    mode: "builder",
    recipeId: "automaton",
    values: { rule: 30, fg: "#ffc850", bg: "#140c28", size: "513x257", zoom: "1" },
  },
  {
    id: "shooting-star",
    name: "Shooting Star",
    mode: "builder",
    recipeId: "doodle",
    values: { bgTop: "#060618", bgBottom: "#302858" },
    strokes: [
      {
        kind: "line",
        color: "#ffffff",
        width: 4,
        intensity: 120,
        points: [
          [80, 90],
          [200, 150],
          [330, 230],
        ],
      },
      { kind: "dot", color: "#fff8d0", width: 46, intensity: 130, points: [[356, 246]] },
      { kind: "dot", color: "#8fb4ff", width: 90, intensity: 60, points: [[120, 380]] },
    ],
  },
  {
    id: "ocean-deep",
    name: "Ocean Deep",
    mode: "builder",
    recipeId: "gradient",
    values: { from: "#02203c", to: "#3ce0c8", direction: "diagonal", size: "512" },
  },
  {
    id: "lime-ribbons",
    name: "Lime Ribbons",
    mode: "builder",
    recipeId: "stripes",
    values: { step: 8, palette: "6", direction: "0" },
  },
  {
    id: "circuit-glitch",
    name: "Circuit Glitch",
    mode: "builder",
    recipeId: "plasma",
    values: { spark: 41, drift: -1, trigger: -50, flare: 320, palette: "6" },
  },
  {
    id: "violet-silk",
    name: "Violet Silk",
    mode: "builder",
    recipeId: "warp",
    values: { a: 1, b: 1, depth: 10, palette: "27" },
  },
  {
    id: "patch-party",
    name: "Patch Party",
    mode: "builder",
    recipeId: "quilt",
    values: { cols: 4, rows: 3, seed: 42, palette: "34" },
  },
  {
    id: "sunset-fractals",
    name: "Sunset Fractals",
    mode: "mix",
    layers: [
      { presetId: "golden-sunset" },
      { presetId: "neon-triangles", blend: "add" },
    ],
  },
  {
    id: "island-mark",
    name: "Island X",
    mode: "mix",
    layers: [
      { presetId: "island-dusk" },
      { presetId: "turquoise-x", blend: "normal", opacity: 80, w: 85, h: 85, x: 50, y: 30 },
    ],
  },
  {
    id: "fractal-window",
    name: "Fractal Window",
    mode: "mix",
    layers: [
      { presetId: "ocean-deep" },
      { presetId: "amber-chaos", blend: "normal", opacity: 90, w: 55, h: 55, x: 50, y: 62 },
      { presetId: "lime-ribbons", blend: "add", opacity: 25 },
    ],
  },
  {
    id: "the-classic",
    name: "The Classic",
    mode: "code",
    code: `/* Sierpinski triangle — a JXL art classic, ~22 bytes */
Width 512
Height 512
Bitdepth 1
if y > 0
 if |W| > 0
  - N 0
  if N > 0
   - Set 0
   - Set 1
 - Set 0`,
  },
];
