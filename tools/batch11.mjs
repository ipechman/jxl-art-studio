// Round 11: landscape with fixed tree shape (+sun), X as V+chevron, bounded diamond.
// usage: node tools/batch11.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";
import { caChannelTree, splineBlock } from "../src/recipes/helpers.ts";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

function rgbToYCoCg(r8, g8, b8) {
  const r = r8 * 257, g = g8 * 257, b = b8 * 257;
  const co = r - b;
  const tmp = b + (co >> 1);
  const cg = g - tmp;
  const y = tmp + (cg >> 1);
  return [y, co, cg];
}

function run(name, code) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    console.log(`${name.padEnd(26)} ${String(bytes.length).padStart(4)} B`);
  } catch (e) {
    console.log(`${name.padEnd(26)} FAILED: ${String(e.message).split("\n")[0]}`);
  }
}

const indent = (s, n) => s.split("\n").join("\n" + " ".repeat(n));

function intervalTree(bounds, leaves) {
  if (bounds.length === 0) return leaves[0];
  const mid = Math.floor(bounds.length / 2);
  const left = intervalTree(bounds.slice(0, mid), leaves.slice(0, mid + 1));
  const right = intervalTree(bounds.slice(mid + 1), leaves.slice(mid + 1));
  return `if x > ${bounds[mid]}\n ${indent(right, 1)}\n ${indent(left, 1)}`;
}

function peaksSeedRow(peaks, dark, elseLeaf) {
  const bounds = [];
  const leaves = [elseLeaf];
  for (const [x0, w] of [...peaks].sort((a, b) => a[0] - b[0])) {
    bounds.push(x0 - 1, x0 + w - 1);
    leaves.push(`- Set ${dark}`, elseLeaf);
  }
  return intervalTree(bounds, leaves);
}

const HIDDEN = `if y > 0
 if N > 40000
  - Set 0
  - Weighted 1500
 if W > 40000
  - Set 0
  - W 5000`;

function fogLuma(mid, band, k) {
  return `if y > 0
 if x > 0
  if N > ${mid + band}
   - AvgN+NE ${-k * 2}
   if N > ${mid - band}
    if Prev > 20000
     - AvgN+NW ${k}
     - AvgN+NE ${-k}
    - AvgN+NW ${k * 2}
  - N 0
 - Set ${mid}`;
}

function landscape(top8, bot8, sea8, horizon, mtnBand, peaks, k, rough, sun) {
  const top = rgbToYCoCg(...top8);
  const bot = rgbToYCoCg(...bot8);
  const sea = rgbToYCoCg(...sea8);
  const midY = Math.round((top[0] + bot[0]) / 2);
  const dark = 2500;
  const mtnFloor = horizon + mtnBand;
  const seaY = Math.round(sea[0] * 1.25);

  const chroma = (i) => {
    const d = Math.round((bot[i] - top[i]) / (mtnFloor - 1));
    const dSea = Math.round((Math.round(top[i] * 0.7) - sea[i]) / (512 - mtnFloor));
    return `if y > ${mtnFloor}
 - N ${dSea}
 if y > ${mtnFloor - 1}
  - Set ${sea[i]}
  if y > 0
   - N ${d}
   - Set ${top[i]}`;
  };

  const grow = rough
    ? `if Prev > ${rough}\n - N -30\n - Set ${dark}`
    : `- Set ${dark}`;
  const spread = `if N > ${dark + 5000}
 if NW-N > -20000
  if N-NE > 20000
   ${indent(grow, 3)}
   - N -25
  ${indent(grow, 2)}
 - N -45`;

  const luma = `if y > ${mtnFloor}
 if y > ${mtnFloor + 1}
  if WGH > 900
   - AvgN+NW 30
   - AvgN+NE -30
  - Set ${seaY}
 if y > ${horizon}
  ${indent(spread, 2)}
  if y > ${horizon - 1}
   ${indent(peaksSeedRow(peaks, dark, "- N 0"), 3)}
   ${indent(fogLuma(midY, 8000, k), 3)}`;

  // sun: a spline dot in luma-ish space — added to all 3 channels of the
  // YCoCg frame, so give it luma-heavy, chroma-light DCs
  const sunBlock = sun
    ? splineBlock([sun.dc, 0, 0], sun.sigma, [
        [sun.x, sun.y],
        [sun.x + 1, sun.y],
      ]) + "\n"
    : "";

  return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
${sunBlock}if c > 0
 if c > 1
  if c > 2
   ${indent(chroma(2), 3)}
   ${indent(chroma(1), 3)}
  ${indent(luma, 2)}
 ${indent(HIDDEN, 1)}`;
}

const PEAKS = [
  [60, 26],
  [150, 10],
  [235, 40],
  [340, 16],
  [430, 30],
];
run(
  "j-land-smooth",
  landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 700, 0, null),
);
run(
  "j-land-rough",
  landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 900, 26000, null),
);
run(
  "j-land-sun",
  landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 900, 26000, {
    x: 300,
    y: 240,
    dc: 26000,
    sigma: 11,
  }),
);

// --- X as V + chevron stacked ------------------------------------------------
const ON = 60000;
const OFF = 6000;

function seedCorners(r, t) {
  return `if x > ${r.x + r.w - 1}
 - Set ${OFF}
 if x > ${r.x + r.w - 1 - t}
  - Set ${ON}
  if x > ${r.x + t - 1}
   - Set ${OFF}
   if x > ${r.x - 1}
    - Set ${ON}
    - Set ${OFF}`;
}

function seedCenterGap(r, t, gap = 2) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if x > ${cx + gap + t - 1}
 - Set ${OFF}
 if x > ${cx + gap - 1}
  - Set ${ON}
  if x > ${cx - gap - 1}
   - Set ${OFF}
   if x > ${cx - gap - t - 1}
    - Set ${ON}
    - Set ${OFF}`;
}

const bounded = (r, inner) => `if y > ${r.y - 1}
 if y > ${r.y + r.h - 1}
  - Set ${OFF}
  ${indent(inner, 2)}
 - Set ${OFF}`;

function shapeX(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  return bounded(
    r,
    `if y > ${cy}
 if y > ${cy + 1}
  if x > ${cx}
   - NW 0
   - NE 0
  ${indent(seedCenterGap(r, t), 2)}
 if y > ${r.y}
  if x > ${cx}
   - NE 0
   - NW 0
  ${indent(seedCorners(r, t), 2)}`,
  );
}

const region = { x: 96, y: 96, w: 320, h: 320 };
run("j-shape-x", `Width 512 Height 512 Bitdepth 16\n${shapeX(region, 14)}`);

// --- diamond, bounded so the seed column above is hidden ----------------------
function shapeDiamond(r) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  const grow = caChannelTree(254, ON, OFF, 512, cx, r.y);
  const d = ON - OFF;
  const shrink = `if N > ${OFF}
 if NW-N > ${-d}
  if N-NE > 0
   - Set ${OFF}
   - Set ${ON}
  - Set ${OFF}
 - Set ${OFF}`;
  return bounded(
    r,
    `if y > ${cy}
 ${indent(shrink, 1)}
 ${indent(grow, 1)}`,
  );
}
run("j-shape-diamond", `Width 512 Height 512 Bitdepth 16\n${shapeDiamond(region)}`);
