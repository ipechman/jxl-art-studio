import type { Recipe, ParamValues, LayerParts } from "./types.ts";
import {
  hexToRgb,
  rgbToYCoCg,
  perChannel,
  channelColors,
  indentLines as ind,
  mulberry32,
  randHex,
  randInt,
  pick,
} from "./helpers.ts";

/**
 * Mist: the landscape's fog turbulence as its own recipe. Standalone it is a
 * dreamy textured sky (luma billows over smooth YCoCg chroma). As a mix
 * overlay the turbulence lives in the ALPHA channel, so it becomes real
 * translucent fog drifting over whatever is underneath.
 */

const TEXTURES = [
  { value: "60", label: "Fine grain" },
  { value: "190", label: "Soft billows" },
  { value: "700", label: "Long streaks" },
];

// Bounded turbulence band around `mid`: soft reflectors at mid±band, flips
// gated on WGH (the Weighted predictor's own error) so no hidden channel is
// needed — works in color, luma and alpha channels alike. Seeded at (rx, ry)
// so windowed layers never bootstrap from the mask value outside the window.
function fogBand(
  mid: number,
  band: number,
  k: number,
  gate: number,
  rx = 0,
  ry = 0,
  seed = mid,
): string {
  if (k === 0) return `if y > ${ry}\n - N 0\n - Set ${seed}`;
  return `if y > ${ry}
 if x > ${rx}
  if N > ${mid + band}
   - AvgN+NE ${-k * 2}
   if N > ${mid - band}
    if WGH > ${gate}
     - AvgN+NW ${k}
     - AvgN+NE ${-k}
    - AvgN+NW ${k * 2}
  - Weighted 40
 - Set ${seed}`;
}

export const mist: Recipe = {
  id: "mist",
  name: "Mist",
  emoji: "🌫",
  blurb:
    "Drifting fog. On its own it's a dreamy textured sky; in a mix it becomes translucent haze over any layer.",
  alphaDriven: true,
  params: [
    { kind: "color", id: "color", label: "Fog color", default: "#dfe6f2" },
    { kind: "range", id: "density", label: "Density", min: 10, max: 100, default: 55 },
    { kind: "range", id: "billow", label: "Billow", min: 0, max: 100, default: 60 },
    {
      kind: "select",
      id: "texture",
      label: "Texture",
      options: TEXTURES,
      default: "190",
    },
    { kind: "color", id: "top", label: "Sky top (solo)", default: "#5a74c8" },
    { kind: "color", id: "bottom", label: "Sky bottom (solo)", default: "#e8b28c" },
  ],
  generate(v: ParamValues) {
    const { header, tree } = buildSolo(v, 512, 512, 0);
    return `Width 512 Height 512 Bitdepth 16 ${header}\n${tree}`;
  },
  layer(v, _strokes, ctx): LayerParts {
    if (ctx.role === "base") {
      const { header, tree } = buildSolo(v, ctx.width, ctx.height, ctx.region?.y ?? 0);
      return { header, tree };
    }
    // Overlay: fog density modulates the ALPHA channel; color is flat.
    const r = ctx.region ?? { x: 0, y: 0, w: ctx.width, h: ctx.height };
    const on = ctx.alphaOn ?? 65535;
    const mid = Math.round((on * Number(v.density)) / 100);
    const band = Math.max(1, Math.round(mid * 0.95));
    const k = Math.round((Number(v.billow) / 100) * 1600 * (on / 65535));
    const gate = Number(v.texture);
    const fog = channelColors(hexToRgb(String(v.color)), ctx.baseRct);
    const set = (i: number) => `- Set ${fog.vals[i]}`;
    return {
      header: fog.header,
      // seed thin so the fog fades in from the window's top edge
      alpha: fogBand(mid, band, k, gate, r.x, r.y, Math.round(mid / 4)),
      tree: perChannel(set(0), set(1), set(2)),
    };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      color: randHex(rnd),
      density: randInt(rnd, 25, 90),
      billow: randInt(rnd, 20, 100),
      texture: pick(rnd, TEXTURES).value,
      top: randHex(rnd),
      bottom: randHex(rnd),
    };
  },
};

function buildSolo(
  v: ParamValues,
  _w: number,
  h: number,
  y0: number,
): { header: string; tree: string } {
  const top = rgbToYCoCg(hexToRgb(String(v.top)));
  const bot = rgbToYCoCg(hexToRgb(String(v.bottom)));
  const midY = Math.round((top[0] + bot[0]) / 2);
  const k = Math.round((Number(v.billow) / 100) * 1600);
  const gate = Number(v.texture);
  const ramp = (i: 1 | 2) => {
    const d = Math.round((bot[i] - top[i]) / (h - 1));
    return `if y > ${y0}\n - N ${d}\n - Set ${top[i]}`;
  };
  const luma = fogBand(midY, 9000, k, gate);
  return {
    header: "RCT 6",
    tree: `if c > 0
 if c > 1
  ${ind(ramp(2), 2)}
  ${ind(ramp(1), 2)}
 ${ind(luma, 1)}`,
  };
}
