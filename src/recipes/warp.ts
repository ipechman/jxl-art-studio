import type { Recipe, ParamValues } from "./types.ts";
import { mulberry32, randInt, pick } from "./helpers.ts";
import { PALETTES } from "./stripes.ts";

export const warp: Recipe = {
  id: "warp",
  name: "Fractal Weave",
  emoji: "🧵",
  blurb:
    "Prediction errors feed back on themselves and weave checkered fractal cloth.",
  params: [
    { kind: "range", id: "a", label: "Weft", min: 1, max: 8, default: 1 },
    { kind: "range", id: "b", label: "Warp", min: 0, max: 8, default: 1 },
    { kind: "range", id: "depth", label: "Contrast depth", min: 8, max: 14, default: 10 },
    {
      kind: "select",
      id: "palette",
      label: "Palette",
      options: [{ value: "none", label: "Monochrome" }, ...PALETTES],
      default: "none",
    },
  ],
  generate(v: ParamValues) {
    const rct = v.palette === "none" ? "" : ` RCT ${Number(v.palette)}`;
    return `Width 512 Height 512 Bitdepth ${Number(v.depth)}${rct}
if W-NW > -1
 if NW-N > -1
  - W ${Number(v.a)}
  - NW 0
 - Select ${Number(v.b)}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      a: randInt(rnd, 1, 5),
      b: randInt(rnd, 0, 5),
      depth: randInt(rnd, 9, 12),
      palette: pick(rnd, ["none", ...PALETTES.map((p) => p.value)]),
    };
  },
};
