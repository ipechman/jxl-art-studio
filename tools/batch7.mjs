// Round 7: HiddenChannel noise bootstrap, fog/mountains v2, shape drawing.
// usage: node tools/batch7.mjs [outDir]
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

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

function run(name, code, sampler) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    console.log(
      `${name.padEnd(26)} ${String(bytes.length).padStart(4)} B  ${img.width}x${img.height} ${sampler ? sampler(img) : ""}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(26)} FAILED: ${String(e.message).split("\n")[0]}`);
  }
}

// --- H1: HiddenChannel channel-index probe ---------------------------------
// If hidden is c==0, then color channels shift to c=1,2,3.
const [oy, oco, ocg] = rgbToYCoCg(255, 140, 40);
run(
  "h1-cmap",
  `Width 64 Height 64 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   - Set ${ocg}
   - Set ${oco}
  - Set ${oy}
 - Set 123`,
  (img) => `want orange if hidden=c0: got=${px(img, 32, 32)}`,
);

// --- H2: fog via hidden-noise + gradient-riding turbulence -----------------
// hidden: gallery-style oscillator (junk allowed, it's invisible)
const HIDDEN_NOISE = `if W > 3200
 - Weighted -640
 - Set 76800`;

function fogLuma(yTop, yBot, h, k, gateT) {
  const d = Math.round((yBot - yTop) / (h - 1));
  return `if y > 0
 if x > 0
  if PrevErr > ${gateT}
   - AvgN+NW ${d + k}
   - AvgN+NE ${d - k}
  - N ${d}
 - N ${d}
 - Set ${yTop}`;
}

function skyChromaRamp(a, b, h, i) {
  const d = Math.round((b[i] - a[i]) / (h - 1));
  return `if y > 0\n - N ${d}\n - Set ${a[i]}`;
}

for (const [variant, k, gate] of [
  ["soft", 260, 0],
  ["billow", 900, 300],
  ["streak", 2200, 1200],
]) {
  const top = rgbToYCoCg(30, 40, 120);
  const bot = rgbToYCoCg(255, 150, 60);
  run(
    `h2-fog-${variant}`,
    `Width 512 Height 512 Bitdepth 16 RCT 6 HiddenChannel 1
if c > 0
 if c > 1
  if c > 2
   ${skyChromaRamp(top, bot, 512, 2).split("\n").join("\n   ")}
   ${skyChromaRamp(top, bot, 512, 1).split("\n").join("\n   ")}
  ${fogLuma(top[0], bot[0], 512, k, gate).split("\n").join("\n  ")}
 ${HIDDEN_NOISE.split("\n").join("\n ")}`,
  );
}

// --- H3: shapes (value-propagation drawing) --------------------------------
const ON = 60000;
const OFF = 6000;

function seedRowX(r, t) {
  // on at the two outer corners of the region's top row
  return `if x > ${r.x + r.w - 1 - t}
 - Set ${ON}
 if x > ${r.x + t - 1}
  - Set ${OFF}
  - Set ${ON}`;
}

function seedRowCenter(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if x > ${cx + t - 1}
 - Set ${OFF}
 if x > ${cx - t - 1}
  - Set ${ON}
  - Set ${OFF}`;
}

function shapeX(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  return `if y > ${r.y}
 if y > ${cy}
  if x > ${cx}
   - NW 0
   - NE 0
  if x > ${cx}
   - NE 0
   - NW 0
 ${seedRowX(r, t).split("\n").join("\n ")}`;
}

function shapeV(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if y > ${r.y}
 if x > ${cx}
  - NE 0
  - NW 0
 ${seedRowX(r, t).split("\n").join("\n ")}`;
}

function shapeChevron(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  return `if y > ${r.y}
 if x > ${cx}
  - NW 0
  - NE 0
 ${seedRowCenter(r, t).split("\n").join("\n ")}`;
}

function shapePlus(r, t) {
  const cx = r.x + Math.floor(r.w / 2);
  const cy = r.y + Math.floor(r.h / 2);
  return `if x > ${cx - t - 1}
 if x > ${cx + t - 1}
  if y > ${cy - t - 1}
   if y > ${cy + t - 1}
    - Set ${OFF}
    - Set ${ON}
   - Set ${OFF}
  - Set ${ON}
 if y > ${cy - t - 1}
  if y > ${cy + t - 1}
   - Set ${OFF}
   - Set ${ON}
  - Set ${OFF}`;
}

const region = { x: 96, y: 96, w: 320, h: 320 };
for (const [name, tree] of [
  ["x", shapeX(region, 14)],
  ["v", shapeV(region, 14)],
  ["chevron", shapeChevron(region, 14)],
  ["plus", shapePlus(region, 14)],
]) {
  run(
    `h3-shape-${name}`,
    `Width 512 Height 512 Bitdepth 16
if y > ${region.y - 1}
 ${tree.split("\n").join("\n ")}
 - Set ${OFF}`,
  );
}
