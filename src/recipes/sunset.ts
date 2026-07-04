import type { Recipe, ParamValues } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  q16,
  strokeSpline,
  mulberry32,
  randInt,
  randHex,
} from "./helpers.ts";

export const sunset: Recipe = {
  id: "sunset",
  name: "Sunset & Sun",
  emoji: "🌅",
  blurb: "A sky fading into the horizon, with an optional glowing sun.",
  params: [
    { kind: "color", id: "sky", label: "Sky color", default: "#182060" },
    { kind: "color", id: "horizon", label: "Horizon color", default: "#ff8c28" },
    { kind: "toggle", id: "sun", label: "Show sun", default: true },
    { kind: "color", id: "sunColor", label: "Sun color", default: "#fff3c0" },
    { kind: "range", id: "sunSize", label: "Sun size", min: 10, max: 140, default: 60 },
    { kind: "range", id: "sunX", label: "Sun position ←→", min: 0, max: 100, default: 50 },
    { kind: "range", id: "sunY", label: "Sun height ↑↓", min: 0, max: 100, default: 55 },
  ],
  generate(v: ParamValues) {
    const w = 512;
    const h = 512;
    const top = hexToRgb(String(v.sky));
    const bot = hexToRgb(String(v.horizon));
    const d = top.map((t, i) => Math.round(((bot[i] - t) * 257) / (h - 1)));
    let splines = "";
    if (v.sun) {
      const x = (Number(v.sunX) / 100) * w;
      const y = (Number(v.sunY) / 100) * h;
      // background color at the sun's height, for correct color deltas
      const bgAtY = top.map((t, i) =>
        Math.round(t + ((bot[i] - t) * y) / (h - 1)),
      ) as [number, number, number];
      splines =
        strokeSpline(
          "dot",
          hexToRgb(String(v.sunColor)),
          bgAtY,
          Number(v.sunSize),
          130,
          [[x, y]],
          257, // Bitdepth 16
        ) + "\n";
    }
    return `Width ${w} Height ${h} Bitdepth 16
${splines}if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(`- Set ${q16(top[0])}`, `- Set ${q16(top[1])}`, `- Set ${q16(top[2])}`)}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      sky: randHex(rnd),
      horizon: randHex(rnd),
      sun: rnd() > 0.25,
      sunColor: randHex(rnd),
      sunSize: randInt(rnd, 20, 120),
      sunX: randInt(rnd, 10, 90),
      sunY: randInt(rnd, 20, 80),
    };
  },
};
