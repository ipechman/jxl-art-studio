import type { Recipe, ParamValues } from "./types.ts";
import { mulberry32, randInt, pick } from "./helpers.ts";

/**
 * Curated reversible color transforms — each gives value ramps a distinct
 * palette. Picked visually from tools/rct-probe.mjs (montage of all 42).
 */
export const PALETTES: { value: string; label: string }[] = [
  { value: "6", label: "Lime & noir" },
  { value: "13", label: "Cyan pulse" },
  { value: "20", label: "Hot magenta" },
  { value: "27", label: "Ultraviolet" },
  { value: "34", label: "Ember orange" },
  { value: "41", label: "Teal wave" },
  { value: "1", label: "Periwinkle pastel" },
  { value: "3", label: "Fresh mint" },
  { value: "8", label: "Salmon pastel" },
  { value: "0", label: "Ghost gray" },
];

export const stripes: Recipe = {
  id: "stripes",
  name: "Diagonal Stripes",
  emoji: "📐",
  blurb: "Crisp repeating bands of color, from subtle pinstripes to bold ribbons.",
  params: [
    { kind: "range", id: "step", label: "Stripe width", min: 2, max: 48, default: 8 },
    {
      kind: "select",
      id: "palette",
      label: "Palette",
      options: PALETTES,
      default: "6",
    },
    {
      kind: "select",
      id: "direction",
      label: "Direction",
      options: [
        { value: "0", label: "↘ down-right" },
        { value: "1", label: "↙ down-left" },
      ],
      default: "0",
    },
  ],
  generate(v: ParamValues) {
    // Each pixel adds `step` to its north neighbor and wraps past 254,
    // which shears the bands into diagonals (row 0 ramps via the N→W fallback).
    const orient = v.direction === "1" ? "Orientation 1\n" : "";
    return `Width 512 Height 512 RCT ${Number(v.palette)}
${orient}if N > 254
 - Set 0
 - N ${Number(v.step)}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      step: randInt(rnd, 2, 40),
      palette: pick(rnd, PALETTES).value,
      direction: pick(rnd, ["0", "1"]),
    };
  },
};
