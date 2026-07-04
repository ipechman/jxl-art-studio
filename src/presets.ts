import type { ParamValues, Stroke } from "./recipes/types.ts";

/** One layer of a mixed artwork: a builder preset plus how it blends in. */
export interface MixLayer {
  presetId: string;
  blend: "add" | "mul";
}

export interface Preset {
  id: string;
  name: string;
  mode: "builder" | "code" | "mix";
  recipeId?: string;
  values?: ParamValues;
  strokes?: Stroke[];
  code?: string;
  layers?: MixLayer[];
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
      { presetId: "golden-sunset", blend: "add" },
      { presetId: "neon-triangles", blend: "add" },
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
