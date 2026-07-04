import type { Recipe, ParamValues, Stroke } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  strokeSpline,
  mulberry32,
  randHex,
  randInt,
  type RGB,
} from "./helpers.ts";

export const DOODLE_SIZE = 512;

/**
 * Freehand splines over a solid or vertically blended background.
 * Strokes come from drawing on the preview canvas.
 */
export const doodle: Recipe = {
  id: "doodle",
  name: "Doodle",
  emoji: "✏️",
  blurb:
    "Draw glowing curves right on the picture — every line becomes a real JPEG XL spline.",
  usesStrokes: true,
  params: [
    { kind: "color", id: "bgTop", label: "Background top", default: "#101030" },
    { kind: "color", id: "bgBottom", label: "Background bottom", default: "#282868" },
  ],
  generate(v: ParamValues, strokes: Stroke[]) {
    const w = DOODLE_SIZE;
    const h = DOODLE_SIZE;
    const top = hexToRgb(String(v.bgTop));
    const bot = hexToRgb(String(v.bgBottom));
    const d = top.map((t, i) => Math.round(((bot[i] - t) * 257) / (h - 1)));
    const mid = top.map((t, i) => Math.round((t + bot[i]) / 2)) as RGB;
    const splines = strokes
      .filter((s) => s.points.length > 0)
      .map((s) =>
        strokeSpline(
          s.kind,
          hexToRgb(s.color),
          mid,
          s.width,
          s.intensity,
          s.points,
          257, // Bitdepth 16
        ),
      )
      .join("\n");
    return `Width ${w} Height ${h} Bitdepth 16
${splines ? splines + "\n" : ""}if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(
   `- Set ${Math.round(top[0] * 257)}`,
   `- Set ${Math.round(top[1] * 257)}`,
   `- Set ${Math.round(top[2] * 257)}`,
 )}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    void randInt; // strokes are user-drawn; only the background is randomized
    return { bgTop: randHex(rnd), bgBottom: randHex(rnd) };
  },
};
