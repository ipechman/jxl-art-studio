import type { Recipe, ParamValues } from "./types.ts";
import { hexToRgb, perChannel, q16, mulberry32, randHex, pick } from "./helpers.ts";

function verticalCode(w: number, h: number, top: number[], bottom: number[]) {
  const d = top.map((t, i) => Math.round(((bottom[i] - t) * 257) / (h - 1)));
  return `Width ${w} Height ${h} Bitdepth 16
if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(`- Set ${q16(top[0])}`, `- Set ${q16(top[1])}`, `- Set ${q16(top[2])}`)}`;
}

function horizontalCode(w: number, h: number, left: number[], right: number[]) {
  const d = left.map((t, i) => Math.round(((right[i] - t) * 257) / (w - 1)));
  return `Width ${w} Height ${h} Bitdepth 16
if x > 0
 ${perChannel(`- W ${d[0]}`, `- W ${d[1]}`, `- W ${d[2]}`)}
 ${perChannel(`- Set ${q16(left[0])}`, `- Set ${q16(left[1])}`, `- Set ${q16(left[2])}`)}`;
}

function diagonalCode(w: number, h: number, a: number[], b: number[]) {
  // value = A + d·(x+y); the Gradient predictor extends the plane exactly.
  const d = a.map((t, i) => Math.round(((b[i] - t) * 257) / (w + h - 2)));
  return `Width ${w} Height ${h} Bitdepth 16
if y > 0
 if x > 0
  - Gradient 0
  ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 if x > 0
  ${perChannel(`- W ${d[0]}`, `- W ${d[1]}`, `- W ${d[2]}`)}
  ${perChannel(`- Set ${q16(a[0])}`, `- Set ${q16(a[1])}`, `- Set ${q16(a[2])}`)}`;
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
    const a = hexToRgb(String(v.from));
    const b = hexToRgb(String(v.to));
    if (v.direction === "horizontal") return horizontalCode(size, size, a, b);
    if (v.direction === "diagonal") return diagonalCode(size, size, a, b);
    return verticalCode(size, size, a, b);
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
