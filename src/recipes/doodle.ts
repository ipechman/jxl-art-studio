import type { Recipe, ParamValues, Stroke } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  strokeSpline,
  mulberry32,
  randHex,
  type RGB,
} from "./helpers.ts";

export const DOODLE_SIZE = 512;

function buildDoodle(
  v: ParamValues,
  strokes: Stroke[],
  _w: number,
  h: number,
): { splines: string; tree: string } {
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
  const tree = `if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(
   `- Set ${Math.round(top[0] * 257)}`,
   `- Set ${Math.round(top[1] * 257)}`,
   `- Set ${Math.round(top[2] * 257)}`,
 )}`;
  return { splines, tree };
}

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
    const { splines, tree } = buildDoodle(v, strokes, DOODLE_SIZE, DOODLE_SIZE);
    return `Width ${DOODLE_SIZE} Height ${DOODLE_SIZE} Bitdepth 16
${splines ? splines + "\n" : ""}${tree}`;
  },
  layer(v, strokes, ctx) {
    const { splines, tree } = buildDoodle(v, strokes, ctx.width, ctx.height);
    return { splines, tree };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return { bgTop: randHex(rnd), bgBottom: randHex(rnd) };
  },
};
