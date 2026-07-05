// Round 9: chunky bounded noise for fog, JS-seeded mountains, fixed shapes.
// usage: node tools/batch9.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

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

// Bounded chunky hidden noise: Weighted climbs and wraps inside [0, 40000].
const HIDDEN = (step) => `if y > 0
 if N > 40000
  - Set 0
  - Weighted ${step}
 if W > 40000
  - Set 0
  - W 5000`;

// Fog luma: flat band, soft reflectors, gate on hidden VALUE (chunky blobs).
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

const ramp = (a, b, h) => {
  const d = Math.round((b - a) / (h - 1));
  return `if y > 0\n - N ${d}\n - Set ${a}`;
};

function sky(top8, bot8, k, band, noiseStep) {
  const top = rgbToYCoCg(...top8);
  const bot = rgbToYCoCg(...bot8);
  const midY = Math.round((top[0] + bot[0]) / 2);
  return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   ${indent(ramp(top[2], bot[2], 512), 3)}
   ${indent(ramp(top[1], bot[1], 512), 3)}
  ${indent(fogLuma(midY, band, k), 2)}
 ${indent(HIDDEN(noiseStep), 1)}`;
}

run("g-fog-chunky", sky([40, 60, 150], [255, 160, 70], 900, 9000, 1500));
run("g-fog-mega", sky([40, 60, 150], [255, 160, 70], 1600, 12000, 700));

// --- mountains: JS-chosen peaks + diagonal spread ---------------------------
// Peaks are seeded on the horizon row as short dark segments at generator-
// chosen positions; below, darkness spreads to NW/NE diagonals; edges are
// roughened by the hidden noise.
function peaksSeedRow(peaks, dark, elseLeaf) {
  // nested x conditions, descending positions
  let expr = elseLeaf;
  const sorted = [...peaks].sort((a, b) => b[0] - a[0]);
  for (const [x, w] of sorted) {
    expr = `if x > ${x + w}\n ${indent(expr, 1)}\n if x > ${x - 1}\n  - Set ${dark}\n  ${indent(expr, 2)}`;
  }
  return expr;
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

  // spread: bright pixel turns dark when its NW or NE is dark; hidden noise
  // roughens the slopes by sometimes skipping the spread.
  const spread = `if N > ${dark + 5000}
 if NW-N > -20000
  if N-NE > 20000
   ${rough ? `if Prev > ${rough}\n    - N -30\n    - Set ${dark}` : `- Set ${dark}`}
   - N -25
  ${rough ? `if Prev > ${rough}\n   - N -30\n   - Set ${dark}` : `- Set ${dark}`}
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
run(
  "g-land-smooth",
  landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 700, 0),
);
run(
  "g-land-rough",
  landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 80, PEAKS, 700, 26000),
);

// --- shapes v3: bounded two-sided seeds + center gap ------------------------
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
    `if y > ${r.y}
 if y > ${cy}
  if x > ${cx}
   - NW 0
   - NE 0
  if x > ${cx}
   - NE 0
   - NW 0
 ${indent(seedCorners(r, t), 1)}`,
  );
}

function shapeV(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return bounded(
    r,
    `if y > ${r.y}
 if x > ${cx}
  - NE 0
  - NW 0
 ${indent(seedCorners(r, t), 1)}`,
  );
}

function shapeChevron(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return bounded(
    r,
    `if y > ${r.y}
 if x > ${cx}
  - NW 0
  - NE 0
 ${indent(seedCenterGap(r, t), 1)}`,
  );
}

const region = { x: 96, y: 96, w: 320, h: 320 };
run("g-shape-x", `Width 512 Height 512 Bitdepth 16\n${shapeX(region, 14)}`);
run("g-shape-v", `Width 512 Height 512 Bitdepth 16\n${shapeV(region, 14)}`);
run("g-shape-chevron", `Width 512 Height 512 Bitdepth 16\n${shapeChevron(region, 14)}`);
