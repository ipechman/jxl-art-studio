// Round 8: fog v3 (plasma hidden noise + bounded luma), mountains v2,
// full landscape composite, fixed shape seeds, triangle/diamond shapes.
// usage: node tools/batch8.mjs [outDir]
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

// Chaotic hidden channel (invisible): plasma feedback.
const HIDDEN = `if y > 0
 if W > -12850
  - Weighted -257
  - Set 82240
 - W 10537`;

// Luma: flat band around `mid`, billowing ±, gated by hidden-channel noise,
// soft reflectors at mid±band keep it bounded.
function fogLumaFlat(mid, band, k, gateT) {
  return `if y > 0
 if x > 0
  if N > ${mid + band}
   - AvgN+NE ${-k * 2}
   if N > ${mid - band}
    if PrevAbsErr > ${gateT}
     - AvgN+NW ${k}
     - AvgN+NE ${-k}
    - AvgN+NW ${k * 2}
  - N 0
 - Set ${mid}`;
}

// Chroma ramp top->bottom over full height.
const ramp = (a, b, h) => {
  const d = Math.round((b - a) / (h - 1));
  return `if y > 0\n - N ${d}\n - Set ${a}`;
};

function skyOnly(top8, bot8, k, gate, band) {
  const top = rgbToYCoCg(...top8);
  const bot = rgbToYCoCg(...bot8);
  const midY = Math.round((top[0] + bot[0]) / 2);
  return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   ${indent(ramp(top[2], bot[2], 512), 3)}
   ${indent(ramp(top[1], bot[1], 512), 3)}
  ${indent(fogLumaFlat(midY, band, k, gate), 2)}
 ${indent(HIDDEN, 1)}`;
}

run("f3-fog-soft", skyOnly([40, 60, 150], [255, 160, 70], 500, 30000, 9000));
run("f3-fog-billow", skyOnly([40, 60, 150], [255, 160, 70], 1400, 30000, 9000));
run("f3-fog-wisp", skyOnly([40, 60, 150], [255, 160, 70], 800, 60000, 5000));

// --- full landscape: fog sky + mountains + sea ------------------------------
function landscape(top8, bot8, sea8, horizon, mtnBand, k, seedT) {
  const H = 512;
  const top = rgbToYCoCg(...top8);
  const bot = rgbToYCoCg(...bot8);
  const sea = rgbToYCoCg(...sea8);
  const midY = Math.round((top[0] + bot[0]) / 2);
  const dark = 2500; // mountain luma
  const seaTopY = Math.round(sea[0] * 1.15);
  const mtnFloor = horizon + mtnBand;

  // chroma: sky ramp until mountains floor, then sea constant-ish
  const chroma = (i) => {
    const d = Math.round((bot[i] - top[i]) / (mtnFloor - 1));
    const dSea = Math.round((top[i] * 0.7 - sea[i]) / (H - mtnFloor));
    return `if y > ${mtnFloor}
 - N ${dSea}
 if y > ${mtnFloor - 1}
  - Set ${sea[i]}
  if y > 0
   - N ${d}
   - Set ${top[i]}`;
  };

  // luma: sky fog band; at horizon row noise-picked dark seeds; below:
  // dark spreads diagonally (mountains) over the glow, then the sea band.
  const luma = `if y > ${mtnFloor}
 if y > ${mtnFloor + 1}
  if WGH > 900
   - AvgN+NW 40
   - AvgN+NE -40
  - N -14
 - Set ${seaTopY}
 if y > ${horizon}
  if N > ${dark + 5000}
   if NW-N > -20000
    if N-NE > 20000
     - Set ${dark}
     - N -20
    - Set ${dark}
   - N -35
  if y > ${horizon - 1}
   if PrevAbsErr > ${seedT}
    - Set ${dark}
    - N 0
   ${indent(fogLumaFlat(midY, 9000, k, 30000), 3)}`;

  return `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   ${indent(chroma(2), 3)}
   ${indent(chroma(1), 3)}
  ${indent(luma, 2)}
 ${indent(HIDDEN, 1)}`;
}

run("f3-land-a", landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 60, 800, 90000));
run("f3-land-b", landscape([40, 60, 150], [255, 160, 70], [30, 40, 90], 330, 60, 800, 40000));
run("f3-land-c", landscape([25, 20, 80], [255, 90, 40], [40, 25, 70], 300, 90, 1400, 60000));

// --- shapes v2: bounded seeds ----------------------------------------------
const ON = 60000;
const OFF = 6000;

function seedCorners(r, t) {
  return `if x > ${r.x + r.w - 1}
 - Set ${OFF}
 if x > ${r.x + r.w - 1 - t}
  - Set ${ON}
  if x > ${r.x + t - 1}
   - Set ${OFF}
   - Set ${ON}`;
}

function seedCenter(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if x > ${cx + t - 1}
 - Set ${OFF}
 if x > ${cx - t - 1}
  - Set ${ON}
  - Set ${OFF}`;
}

function bounded(r, inner) {
  // OFF above/below the region so arms stop at its floor
  return `if y > ${r.y - 1}
 if y > ${r.y + r.h - 1}
  - Set ${OFF}
  ${indent(inner, 2)}
 - Set ${OFF}`;
}

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
 ${indent(seedCenter(r, t), 1)}`,
  );
}

function shapeSlash(r, t, dir) {
  return bounded(
    r,
    `if y > ${r.y}
 - ${dir === "/" ? "NE" : "NW"} 0
 ${indent(
   dir === "/"
     ? `if x > ${r.x + r.w - 1}\n - Set ${OFF}\n if x > ${r.x + r.w - 1 - t}\n  - Set ${ON}\n  - Set ${OFF}`
     : `if x > ${r.x + t - 1}\n - Set ${OFF}\n if x > ${r.x - 1}\n  - Set ${ON}\n  - Set ${OFF}`,
   1,
 )}`,
  );
}

const region = { x: 96, y: 96, w: 320, h: 320 };
run("f3-shape-x", `Width 512 Height 512 Bitdepth 16\n${shapeX(region, 14)}`);
run("f3-shape-v", `Width 512 Height 512 Bitdepth 16\n${shapeV(region, 14)}`);
run("f3-shape-chevron", `Width 512 Height 512 Bitdepth 16\n${shapeChevron(region, 14)}`);
run("f3-shape-slash", `Width 512 Height 512 Bitdepth 16\n${shapeSlash(region, 14, "/")}`);
run("f3-shape-back", `Width 512 Height 512 Bitdepth 16\n${shapeSlash(region, 14, "\\")}`);
