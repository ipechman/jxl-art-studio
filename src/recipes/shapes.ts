import type { Recipe, ParamValues, LayerParts } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  caChannelTree,
  channelColors,
  indentLines as ind,
  mulberry32,
  randHex,
  randInt,
  pick,
} from "./helpers.ts";

/**
 * Logo stamp: geometric marks drawn with the propagation trick from the
 * gallery's "JXL logo overlay" — a seed segment on one row, then NE/NW
 * copies extend it into diagonal strokes. Triangles and diamonds grow via
 * cellular-automaton rules (254 widens, 128 narrows). As a mix layer the
 * silhouette lives in the alpha channel, so it floats over any base.
 */

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHAPES = [
  { value: "x", label: "✕ Cross" },
  { value: "chevron", label: "∧ Chevron" },
  { value: "v", label: "∨ Vee" },
  { value: "slash", label: "╱ Slash" },
  { value: "backslash", label: "╲ Backslash" },
  { value: "plus", label: "✚ Plus" },
  { value: "triangle", label: "▲ Triangle" },
  { value: "diamond", label: "◆ Diamond" },
];

/** Seeds at the two outer corners of the region's top row. */
function seedCorners(r: Region, t: number, on: string, off: string) {
  return `if x > ${r.x + r.w - 1}
 ${off}
 if x > ${r.x + r.w - 1 - t}
  ${on}
  if x > ${r.x + t - 1}
   ${off}
   if x > ${r.x - 1}
    ${on}
    ${off}`;
}

/** Two seeds around the region's center column, with a gap between them. */
function seedCenter(r: Region, t: number, on: string, off: string, gap = 2) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if x > ${cx + gap + t - 1}
 ${off}
 if x > ${cx + gap - 1}
  ${on}
  if x > ${cx - gap - 1}
   ${off}
   if x > ${cx - gap - t - 1}
    ${on}
    ${off}`;
}

/** OFF above and below the region so strokes stop at its edges. */
function bounded(r: Region, inner: string, off: string) {
  return `if y > ${r.y - 1}
 if y > ${r.y + r.h - 1}
  ${off}
  ${ind(inner, 2)}
 ${off}`;
}

/**
 * The shape as a tree whose leaves are `on` / `off` (works for color values
 * and for alpha). Values are numbers so CA growth rules can compare them.
 */
export function shapeTree(
  shape: string,
  r: Region,
  t: number,
  onVal: number,
  offVal: number,
): string {
  const on = `- Set ${onVal}`;
  const off = `- Set ${offVal}`;
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);

  switch (shape) {
    case "v":
      return bounded(
        r,
        `if y > ${r.y}
 if x > ${cx}
  - NE 0
  - NW 0
 ${ind(seedCorners(r, t, on, off), 1)}`,
        off,
      );
    case "chevron":
      return bounded(
        r,
        `if y > ${r.y}
 if x > ${cx}
  - NW 0
  - NE 0
 ${ind(seedCenter(r, t, on, off), 1)}`,
        off,
      );
    case "x":
      // V (arms converge) stacked on a chevron (fresh seeds diverge)
      return bounded(
        r,
        `if y > ${cy}
 if y > ${cy + 1}
  if x > ${cx}
   - NW 0
   - NE 0
  ${ind(seedCenter(r, t, on, off), 2)}
 if y > ${r.y}
  if x > ${cx}
   - NE 0
   - NW 0
  ${ind(seedCorners(r, t, on, off), 2)}`,
        off,
      );
    case "slash":
      return bounded(
        r,
        `if y > ${r.y}
 - NE 0
 if x > ${r.x + r.w - 1}
  ${off}
  if x > ${r.x + r.w - 1 - t}
   ${on}
   ${off}`,
        off,
      );
    case "backslash":
      return bounded(
        r,
        `if y > ${r.y}
 - NW 0
 if x > ${r.x + t - 1}
  ${off}
  if x > ${r.x - 1}
   ${on}
   ${off}`,
        off,
      );
    case "plus": {
      const tt = Math.floor(t / 2) + 1;
      return `if x > ${cx - tt - 1}
 if x > ${cx + tt - 1}
  if y > ${cy - tt - 1}
   if y > ${cy + tt - 1}
    ${off}
    ${on}
   ${off}
  if y > ${r.y - 1}
   if y > ${r.y + r.h - 1}
    ${off}
    ${on}
   ${off}
 if y > ${cy - tt - 1}
  if y > ${cy + tt - 1}
   ${off}
   if x > ${r.x - 1}
    ${on}
    ${off}
  ${off}`;
    }
    case "triangle":
      return bounded(r, caChannelTree(254, onVal, offVal, r.w, cx, r.y), off);
    case "diamond": {
      const grow = caChannelTree(254, onVal, offVal, r.w, cx, r.y);
      const d = onVal - offVal;
      // rule 128: on only when NW, N and NE are all on — symmetric shrink
      const shrink =
        d > 0
          ? `if N > ${offVal}
 if NW-N > ${-d}
  if N-NE > 0
   ${off}
   ${on}
  ${off}
 ${off}`
          : off;
      return bounded(r, `if y > ${cy}\n ${ind(shrink, 1)}\n ${ind(grow, 1)}`, off);
    }
    default:
      return off;
  }
}

const regionOf = (v: ParamValues, w: number, h: number): Region => {
  const size = Math.round((Math.min(w, h) * Number(v.size)) / 100);
  return {
    x: Math.round(((w - size) * Number(v.posX)) / 100),
    y: Math.round(((h - size) * Number(v.posY)) / 100),
    w: size,
    h: size,
  };
};

const thicknessOf = (v: ParamValues, r: Region) =>
  Math.max(2, Math.round((r.w * Number(v.thickness)) / 100));

export const stamp: Recipe = {
  id: "stamp",
  name: "Logo Stamp",
  emoji: "✖️",
  blurb:
    "Crisp geometric marks — crosses, chevrons, triangles — drawn the way the gallery's JXL logo was.",
  alphaDriven: true,
  params: [
    { kind: "select", id: "shape", label: "Shape", options: SHAPES, default: "x" },
    { kind: "range", id: "thickness", label: "Stroke width", min: 2, max: 20, default: 6 },
    { kind: "color", id: "color", label: "Mark color", default: "#28c8b4" },
    { kind: "color", id: "bg", label: "Background", default: "#10142e" },
    { kind: "range", id: "size", label: "Size", min: 20, max: 100, default: 70 },
    { kind: "range", id: "posX", label: "Position ←→", min: 0, max: 100, default: 50 },
    { kind: "range", id: "posY", label: "Position ↑↓", min: 0, max: 100, default: 50 },
  ],
  generate(v: ParamValues) {
    const r = regionOf(v, 512, 512);
    const t = thicknessOf(v, r);
    const color = hexToRgb(String(v.color));
    const bg = hexToRgb(String(v.bg));
    const ch = (i: number) =>
      shapeTree(String(v.shape), r, t, color[i] * 257, bg[i] * 257);
    return `Width 512 Height 512 Bitdepth 16
${perChannel(ch(0), ch(1), ch(2))}`;
  },
  layer(v, _strokes, ctx): LayerParts {
    const full = { x: 0, y: 0, w: ctx.width, h: ctx.height };
    const rr = ctx.region ?? full;
    // the shape is drawn inside the layer window; its own size/pos params
    // then place it within that window
    const size = Math.round((Math.min(rr.w, rr.h) * Number(v.size)) / 100);
    const r: Region = {
      x: rr.x + Math.round(((rr.w - size) * Number(v.posX)) / 100),
      y: rr.y + Math.round(((rr.h - size) * Number(v.posY)) / 100),
      w: size,
      h: size,
    };
    const t = thicknessOf(v, r);
    if (ctx.role === "base") {
      const color = hexToRgb(String(v.color));
      const bg = hexToRgb(String(v.bg));
      const ch = (i: number) =>
        shapeTree(String(v.shape), r, t, color[i] * 257, bg[i] * 257);
      return { tree: perChannel(ch(0), ch(1), ch(2)) };
    }
    const { vals, header } = channelColors(hexToRgb(String(v.color)), ctx.baseRct);
    const set = (i: number) => `- Set ${vals[i]}`;
    return {
      header,
      alpha: shapeTree(String(v.shape), r, t, ctx.alphaOn ?? 65535, 0),
      tree: perChannel(set(0), set(1), set(2)),
    };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      shape: pick(rnd, SHAPES).value,
      thickness: randInt(rnd, 3, 14),
      color: randHex(rnd),
      bg: randHex(rnd),
      size: randInt(rnd, 40, 95),
      posX: randInt(rnd, 20, 80),
      posY: randInt(rnd, 20, 80),
    };
  },
};
