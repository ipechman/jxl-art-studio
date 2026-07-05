import type { Recipe, ParamValues, LayerParts } from "./types.ts";
import {
  hexToRgb,
  rgbToYCoCg,
  intervalTree,
  indentLines as ind,
  splineBlock,
  mulberry32,
  randInt,
  randHex,
  pick,
} from "./helpers.ts";

/**
 * Misty landscape: fog-textured sky, jagged mountain silhouettes and a calm
 * sea, drawn in YCoCg (RCT 6) — luma carries the texture, chroma the colors,
 * like the classic gallery pieces. Standalone it bootstraps its randomness
 * from an invisible HiddenChannel; as a mix layer it uses the Weighted
 * predictor's own error (WGH) instead, keeping the channel layout standard.
 */

const DARK = 2500; // mountain luma

// Chunky bounded noise for the hidden channel (invisible).
const HIDDEN_NOISE = `if y > 0
 if N > 40000
  - Set 0
  - Weighted 1500
 if W > 40000
  - Set 0
  - W 5000`;

// Luma fog: flat band around `mid` with soft reflectors; billow flips come
// from the hidden channel (waves) or WGH (drizzle, hidden-free).
function fogLuma(mid: number, k: number, gate: string): string {
  const band = 8000;
  if (k === 0) return `if y > 0\n - N 0\n - Set ${mid}`;
  return `if y > 0
 if x > 0
  if N > ${mid + band}
   - AvgN+NE ${-k * 2}
   if N > ${mid - band}
    ${ind(gate, 4)}
     - AvgN+NW ${k}
     - AvgN+NE ${-k}
    - AvgN+NW ${k * 2}
  - ${gate.startsWith("if Prev") ? "N 0" : "Weighted 40"}
 - Set ${mid}`;
}

function peaksSeedRow(
  peaks: [number, number][],
  elseLeaf: string,
): string {
  const bounds: number[] = [];
  const leaves = [elseLeaf];
  for (const [x0, w] of [...peaks].sort((a, b) => a[0] - b[0])) {
    bounds.push(x0 - 1, x0 + w - 1);
    leaves.push(`- Set ${DARK}`, elseLeaf);
  }
  return intervalTree(bounds, leaves);
}

interface Build {
  w: number;
  h: number;
  x0: number;
  y0: number;
  hidden: boolean;
}

function buildLandscape(v: ParamValues, b: Build): { tree: string; splines: string } {
  const top = rgbToYCoCg(hexToRgb(String(v.sky)));
  const glow = rgbToYCoCg(hexToRgb(String(v.glow)));
  const sea = rgbToYCoCg(hexToRgb(String(v.sea)));
  const midY = Math.round((top[0] + glow[0]) / 2);

  const horizon = b.y0 + Math.round((b.h * Number(v.horizon)) / 100);
  const mtnBand = Math.max(8, Math.round((b.h * Number(v.mountains)) / 100));
  const mtnFloor = horizon + mtnBand;
  const seaY = Math.round(sea[0] * 1.25);

  // generator-chosen peaks, reproducible via the shuffle seed; peaks must
  // not overlap or the seed row's interval tree gets unsorted bounds
  const rnd = mulberry32(Number(v.seed) + 1);
  const peaks: [number, number][] = [];
  const n = Number(v.peaks);
  let prevEnd = b.x0 - 2;
  for (let i = 0; i < n; i++) {
    let x0 = b.x0 + Math.round(((i + 0.2 + rnd() * 0.6) * b.w) / n);
    const w = randInt(rnd, 6, Math.max(8, Math.round(b.w / n / 2)));
    if (x0 <= prevEnd + 1) x0 = prevEnd + 2;
    if (x0 + w >= b.x0 + b.w) break;
    peaks.push([x0, w]);
    prevEnd = x0 + w;
  }
  if (peaks.length === 0) peaks.push([b.x0 + Math.round(b.w / 2), 12]);

  const mist = Number(v.mist);
  const k = Math.round((mist / 100) * 1600);
  const waves = b.hidden && v.texture === "waves";
  const fogGate = waves ? `if Prev > 20000` : `if WGH > 120`;
  const fog = fogLuma(midY, k, fogGate);

  // mountain slopes: spread 1px/row diagonally; jaggedness randomly pauses
  // the spread (fine-grained gate so the chain recovers)
  const jag = Number(v.jagged);
  const roughGate = b.hidden
    ? `if PrevAbsErr > ${Math.round(42000 - (jag / 100) * 32000)}`
    : `if WGH > ${Math.round(900 - (jag / 100) * 860)}`;
  const grow =
    jag === 0 ? `- Set ${DARK}` : `${roughGate}\n - N -30\n - Set ${DARK}`;
  // thresholds must sit well below the mist's darkest billows (~14000)
  // or slope growth stalls where a cloud shadow meets the horizon
  const spread = `if N > ${DARK + 5000}
 if NW-N > -8000
  if N-NE > 8000
   ${ind(grow, 3)}
   - N -25
  ${ind(grow, 2)}
 - N -45`;

  const luma = `if y > ${mtnFloor}
 if y > ${mtnFloor + 1}
  if WGH > 900
   - AvgN+NW 30
   - AvgN+NE -30
  - Set ${seaY}
 if y > ${horizon}
  ${ind(spread, 2)}
  if y > ${horizon - 1}
   ${ind(peaksSeedRow(peaks, "- N 0"), 3)}
   ${ind(fog, 3)}`;

  const chroma = (i: 1 | 2) => {
    const d = Math.round((glow[i] - top[i]) / Math.max(1, mtnFloor - b.y0 - 1));
    const dSea = Math.round(
      (Math.round(top[i] * 0.7) - sea[i]) / Math.max(1, b.y0 + b.h - mtnFloor),
    );
    return `if y > ${mtnFloor}
 - N ${dSea}
 if y > ${mtnFloor - 1}
  - Set ${sea[i]}
  if y > ${b.y0}
   - N ${d}
   - Set ${top[i]}`;
  };

  // channel indices shift by one when the hidden channel is present
  const cc = (n: number) => n + (b.hidden ? 1 : 0);
  let tree = `if c > ${cc(0)}
 if c > ${cc(1)}
  ${ind(chroma(2), 2)}
  ${ind(chroma(1), 2)}
 ${ind(luma, 1)}`;
  if (b.hidden) {
    tree = `if c > 0\n ${ind(tree, 1)}\n ${ind(HIDDEN_NOISE, 1)}`;
  }

  let splines = "";
  if (v.sun) {
    const sx = b.x0 + (b.w * Number(v.sunX)) / 100;
    const sy = b.y0 + (b.h * Math.min(Number(v.horizon) - 4, Number(v.sunY))) / 100;
    const sigma = Math.max(3, Number(v.sunSize) / 5.3);
    const dc = Math.round((255 * sigma * 257) / 80 / 2.2);
    splines = splineBlock([dc, 0, 0], sigma, [
      [Math.round(sx), Math.round(sy)],
      [Math.round(sx) + 1, Math.round(sy)],
    ]);
  }
  return { tree, splines };
}

export const landscape: Recipe = {
  id: "landscape",
  name: "Misty Landscape",
  emoji: "🏔",
  blurb:
    "A foggy sky, jagged mountain silhouettes and a calm sea — a whole vista in a couple hundred bytes.",
  params: [
    { kind: "color", id: "sky", label: "Sky color", default: "#283c96" },
    { kind: "color", id: "glow", label: "Horizon glow", default: "#ffa046" },
    { kind: "color", id: "sea", label: "Sea color", default: "#1e285a" },
    { kind: "range", id: "horizon", label: "Horizon height", min: 25, max: 75, default: 62 },
    { kind: "range", id: "mountains", label: "Mountain size", min: 6, max: 30, default: 16 },
    { kind: "range", id: "peaks", label: "Peaks", min: 2, max: 9, default: 5 },
    { kind: "range", id: "jagged", label: "Jaggedness", min: 0, max: 100, default: 55 },
    { kind: "range", id: "mist", label: "Mist", min: 0, max: 100, default: 55 },
    {
      kind: "select",
      id: "texture",
      label: "Mist style",
      options: [
        { value: "waves", label: "Rolling waves" },
        { value: "drizzle", label: "Fine drizzle" },
      ],
      default: "waves",
    },
    { kind: "range", id: "seed", label: "Shuffle peaks", min: 1, max: 9999, default: 3 },
    { kind: "toggle", id: "sun", label: "Show sun", default: true },
    { kind: "range", id: "sunSize", label: "Sun size", min: 15, max: 120, default: 55 },
    { kind: "range", id: "sunX", label: "Sun position ←→", min: 5, max: 95, default: 58 },
    { kind: "range", id: "sunY", label: "Sun height ↑↓", min: 10, max: 70, default: 42 },
  ],
  generate(v: ParamValues) {
    const { tree, splines } = buildLandscape(v, {
      w: 512,
      h: 512,
      x0: 0,
      y0: 0,
      hidden: true,
    });
    return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
${splines ? splines + "\n" : ""}${tree}`;
  },
  layer(v, _strokes, ctx): LayerParts {
    const r = ctx.region ?? { x: 0, y: 0, w: ctx.width, h: ctx.height };
    const { tree, splines } = buildLandscape(v, {
      w: r.w,
      h: r.h,
      x0: r.x,
      y0: r.y,
      hidden: false,
    });
    return { header: "RCT 6", splines, tree };
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      sky: randHex(rnd),
      glow: randHex(rnd),
      sea: randHex(rnd),
      horizon: randInt(rnd, 35, 72),
      mountains: randInt(rnd, 8, 28),
      peaks: randInt(rnd, 2, 9),
      jagged: randInt(rnd, 0, 100),
      mist: randInt(rnd, 20, 100),
      texture: pick(rnd, ["waves", "drizzle"]),
      seed: randInt(rnd, 1, 9999),
      sun: rnd() > 0.3,
      sunSize: randInt(rnd, 20, 100),
      sunX: randInt(rnd, 10, 90),
      sunY: randInt(rnd, 12, 60),
    };
  },
};
