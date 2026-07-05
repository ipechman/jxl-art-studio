// Round 10: X seam fix, interval-tree mountain seeds, triangle/diamond.
// usage: node tools/batch10.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";
import { caChannelTree } from "../src/recipes/helpers.ts";

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

// Balanced decision tree over x-intervals: bounds ascending, leaves[i] for
// x in (bounds[i-1], bounds[i]], leaves[n] for x > bounds[n-1].
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

const HIDDEN = (step) => `if y > 0
 if N > 40000
  - Set 0
  - Weighted ${step}
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

function landscape(top8, bot8, sea8, horizon, mtnBand, peaks, k, rough) {
  const H = 512;
  const top = rgbToYCoCg(...top8);
  const bot = rgbToYCoCg(...bot8);
  const sea = rgbToYCoCg(...sea8);
  const midY = Math.round((top[0] + bot[0]) / 2);
  const dark = 2500;
  const mtnFloor = horizon + mtnBand;
  const seaY = Math.round(sea[0] * 1.2);

  const chroma = (i) => {
    const d = Math.round((bot[i] - top[i]) / (mtnFloor - 1));
    const dSea = Math.round((Math.round(top[i] * 0.7) - sea[i]) / (H - mtnFloor));
    return `if y > ${mtnFloor}
 - N ${dSea}
 if y > ${mtnFloor - 1}
  - Set ${sea[i]}
  if y > 0
   - N ${d}
   - Set ${top[i]}`;
  };

  const grow = rough
    ? `if Prev > ${rough}\n  - N -30\n  - Set ${dark}`
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
  - N -12
 - Set ${seaY}
 if y > ${horizon}
  ${indent(spread, 2)}
  if y > ${horizon - 1}
   ${indent(peaksSeedRow(peaks, dark, "- N 0"), 3)}
   ${indent(fogLuma(midY, 8000, k), 3)}`;

  return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   ${indent(chroma(2), 3)}
   ${indent(chroma(1), 3)}
  ${indent(luma, 2)}
 ${indent(HIDDEN(1500), 1)}`;
}

const PEAKS = [
  [60, 26],
  [150, 10],
  [235, 40],
  [340, 16],
  [430, 30],
];
run("i-land-smooth", landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 700, 0));
run("i-land-rough", landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 700, 26000));

// --- X with center dead zone -------------------------------------------------
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

const bounded = (r, inner) => `if y > ${r.y - 1}
 if y > ${r.y + r.h - 1}
  - Set ${OFF}
  ${indent(inner, 2)}
 - Set ${OFF}`;

function shapeX(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  const g = 2;
  return bounded(
    r,
    `if y > ${r.y}
 if y > ${cy}
  if x > ${cx + g - 1}
   - NW 0
   if x > ${cx - g - 1}
    - Set ${OFF}
    - NE 0
  if x > ${cx}
   - NE 0
   - NW 0
 ${indent(seedCorners(r, t), 1)}`,
  );
}

const region = { x: 96, y: 96, w: 320, h: 320 };
run("i-shape-x", `Width 512 Height 512 Bitdepth 16\n${shapeX(region, 14)}`);

// --- triangle & diamond via CA growth rules ----------------------------------
run(
  "i-shape-triangle",
  `Width 512 Height 512 Bitdepth 16
${caChannelTree(254, ON, OFF, 512, 256, 128)}`,
);

// diamond: grow (rule 254) until cy, shrink (rule 128) after
function shapeDiamond(r) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  const grow = caChannelTree(254, ON, OFF, 512, cx, r.y);
  // caChannelTree(128,...) would re-seed; build shrink step manually
  const d = ON - OFF;
  const shrink = `if N > ${OFF}
 if NW-N > ${-d}
  if N-NE > 0
   - Set ${OFF}
   - Set ${ON}
  - Set ${OFF}
 - Set ${OFF}`;
  return `if y > ${cy}
 ${indent(shrink, 1)}
 ${indent(grow, 1)}`;
}
run("i-shape-diamond", `Width 512 Height 512 Bitdepth 16\n${shapeDiamond(region)}`);
