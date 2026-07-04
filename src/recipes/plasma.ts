import type { Recipe, ParamValues } from "./types.ts";
import { mulberry32, randInt, pick } from "./helpers.ts";
import { PALETTES } from "./stripes.ts";

export const plasma: Recipe = {
  id: "plasma",
  name: "Glitch Plasma",
  emoji: "⚡",
  blurb:
    "A self-correcting predictor fights a rogue starting row — organic, glitchy chaos.",
  params: [
    { kind: "range", id: "spark", label: "Spark row energy", min: 1, max: 120, default: 41 },
    { kind: "range", id: "drift", label: "Drift", min: -6, max: 6, default: -1 },
    { kind: "range", id: "trigger", label: "Trigger level", min: -200, max: 200, default: -50 },
    { kind: "range", id: "flare", label: "Flare", min: 100, max: 900, default: 320 },
    {
      kind: "select",
      id: "palette",
      label: "Palette",
      options: PALETTES,
      default: "6",
    },
  ],
  generate(v: ParamValues) {
    const drift = Number(v.drift) === 0 ? -1 : Number(v.drift);
    return `Width 512 Height 512 RCT ${Number(v.palette)}
if y > 0
 if W > ${Number(v.trigger)}
  - Weighted ${drift}
  - Set ${Number(v.flare)}
 - W ${Number(v.spark)}`;
  },
  layer(v, _strokes, ctx) {
    const s = ctx.scale;
    const drift = Number(v.drift) === 0 ? -1 : Number(v.drift);
    return {
      header: `RCT ${Number(v.palette)}`,
      tree: `if y > 0
 if W > ${Number(v.trigger) * s}
  - Weighted ${drift * s}
  - Set ${Number(v.flare) * s}
 - W ${Number(v.spark) * s}`,
    };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      spark: randInt(rnd, 3, 100),
      drift: pick(rnd, [-3, -2, -1, 1, 2]),
      trigger: randInt(rnd, -150, 100),
      flare: randInt(rnd, 150, 700),
      palette: pick(rnd, PALETTES).value,
    };
  },
};
