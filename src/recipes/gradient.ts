import type { Recipe, ParamValues, LayerParts } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  channelColors,
  mulberry32,
  randHex,
  pick,
} from "./helpers.ts";

// All trees are 16-bit native (Bitdepth 16), so layers reuse them unscaled.
// Ramps are anchored to a region (rx, ry, rw, rh) so mixed layers can move;
// full-canvas regions reproduce the classic `if y > 0` seeding exactly.

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Builders take 16-bit channel triples so both plain RGB (×257) and
// base-matched YCoCg values work.
function verticalTree(r: Region, a: number[], b: number[]) {
  const d = a.map((t, i) => Math.round((b[i] - t) / (r.h - 1)));
  return `if y > ${r.y}
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(`- Set ${a[0]}`, `- Set ${a[1]}`, `- Set ${a[2]}`)}`;
}

function horizontalTree(r: Region, a: number[], b: number[]) {
  const d = a.map((t, i) => Math.round((b[i] - t) / (r.w - 1)));
  return `if x > ${r.x}
 ${perChannel(`- W ${d[0]}`, `- W ${d[1]}`, `- W ${d[2]}`)}
 ${perChannel(`- Set ${a[0]}`, `- Set ${a[1]}`, `- Set ${a[2]}`)}`;
}

function diagonalTree(r: Region, a: number[], b: number[]) {
  // value = A + d·(x+y); the Gradient predictor extends the plane exactly.
  const d = a.map((t, i) => Math.round((b[i] - t) / (r.w + r.h - 2)));
  return `if y > ${r.y}
 if x > ${r.x}
  - Gradient 0
  ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 if x > ${r.x}
  ${perChannel(`- W ${d[0]}`, `- W ${d[1]}`, `- W ${d[2]}`)}
  ${perChannel(`- Set ${a[0]}`, `- Set ${a[1]}`, `- Set ${a[2]}`)}`;
}

function buildTree(v: ParamValues, r: Region, baseRct?: number): string {
  const a = channelColors(hexToRgb(String(v.from)), baseRct).vals;
  const b = channelColors(hexToRgb(String(v.to)), baseRct).vals;
  if (v.direction === "horizontal") return horizontalTree(r, a, b);
  if (v.direction === "diagonal") return diagonalTree(r, a, b);
  return verticalTree(r, a, b);
}

export const gradient: Recipe = {
  id: "gradient",
  name: "Smooth Gradient",
  emoji: "🌈",
  blurb: "A silky blend between two colors of your choice.",
  params: [
    { kind: "color", id: "from", label: "First color", default: "#1a2060" },
    { kind: "color", id: "to", label: "Second color", default: "#ff8c28" },
    {
      kind: "select",
      id: "direction",
      label: "Direction",
      options: [
        { value: "vertical", label: "Top → bottom" },
        { value: "horizontal", label: "Left → right" },
        { value: "diagonal", label: "Corner → corner" },
      ],
      default: "vertical",
    },
    {
      kind: "select",
      id: "size",
      label: "Image size",
      options: [
        { value: "256", label: "256 × 256" },
        { value: "512", label: "512 × 512" },
        { value: "1024", label: "1024 × 1024" },
      ],
      default: "512",
    },
  ],
  generate(v: ParamValues) {
    const size = Number(v.size);
    return `Width ${size} Height ${size} Bitdepth 16\n${buildTree(v, { x: 0, y: 0, w: size, h: size })}`;
  },
  layer(v, _strokes, ctx): LayerParts {
    const r = ctx.region ?? { x: 0, y: 0, w: ctx.width, h: ctx.height };
    return {
      header: channelColors([0, 0, 0], ctx.baseRct).header,
      tree: buildTree(v, r, ctx.baseRct),
    };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      from: randHex(rnd),
      to: randHex(rnd),
      direction: pick(rnd, ["vertical", "horizontal", "diagonal"]),
      size: "512",
    };
  },
};
