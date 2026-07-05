// Round 6: landscape techniques — YCoCg mapping, fog turbulence, mountains.
// usage: node tools/batch6.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

// RCT 6 (YCoCg) forward transform, 16-bit sample units.
function rgbToYCoCg(r8, g8, b8) {
  const r = r8 * 257;
  const g = g8 * 257;
  const b = b8 * 257;
  const co = r - b;
  const tmp = b + (co >> 1);
  const cg = g - tmp;
  const y = tmp + (cg >> 1);
  return [y, co, cg];
}

const perChannel = (y, co, cg) => `if c > 0\n if c > 1\n ${cg}\n ${co}\n ${y}`;

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
      `${name.padEnd(24)} ${String(bytes.length).padStart(4)} B  ${sampler ? sampler(img) : ""}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(24)} FAILED: ${String(e.message).split("\n")[0]}`);
  }
}

// --- E1: verify the YCoCg mapping with solid colors -----------------------
for (const [name, rgb] of [
  ["orange", [255, 140, 40]],
  ["skyblue", [40, 90, 200]],
  ["teal", [20, 160, 140]],
]) {
  const [y, co, cg] = rgbToYCoCg(...rgb);
  run(
    `e1-${name}`,
    `Width 64 Height 64 Bitdepth 16 RCT 6
${perChannel(`- Set ${y}`, `- Set ${co}`, `- Set ${cg}`)}`,
    (img) => `want=${rgb} got=${px(img, 32, 32)}`,
  );
}

// --- E2: sky gradient + fog turbulence in luma -----------------------------
// Chroma: vertical ramp between two colors. Luma: gradient + turbulence.
function skyChroma(top, bottom, h) {
  const a = rgbToYCoCg(...top);
  const b = rgbToYCoCg(...bottom);
  const d = [1, 2].map((i) => Math.round((b[i] - a[i]) / (h - 1)));
  return {
    co: `if y > 0\n - N ${d[0]}\n - Set ${a[1]}`,
    cg: `if y > 0\n - N ${d[1]}\n - Set ${a[2]}`,
    yTop: a[0],
    yBot: b[0],
  };
}

// fog variants: turbulence amount k, seed style
function fogLuma(yTop, yBot, h, k, seedOff) {
  const d = Math.round((yBot - yTop) / (h - 1));
  return `if y > 0
 if x > 0
  if WGH > 3
   - AvgN+NW ${k}
   - AvgN+NE ${-k}
  - Weighted ${seedOff}
 - N ${d}
 if x > 0
  - W 0
  - Set ${yTop}`;
}

for (const [variant, k, seed] of [
  ["soft", 320, -640],
  ["med", 900, -1200],
  ["heavy", 2000, -2600],
]) {
  const c = skyChroma([30, 40, 120], [255, 150, 60], 512);
  run(
    `e2-fog-${variant}`,
    `Width 512 Height 512 Bitdepth 16 RCT 6
${perChannel(fogLuma(c.yTop, c.yBot, 512, k, seed), c.co, c.cg)}`,
  );
}

// --- E3: mountains — dark seeds on the horizon row spread downward ---------
// Above horizon: plain gradient. At horizon row: quasi-random seeds via WGH.
// Below: dark spreads to NW/NE neighbours (diagonal slopes), else sky fades.
function mountainLuma(yTop, yBot, h, horizon, seedT, dark) {
  const d = Math.round((yBot - yTop) / (h - 1));
  const darkT = dark + 4000; // "is dark" threshold in luma
  return `if y > ${horizon}
 if N > ${darkT}
  if NW-N > -20000
   if N-NE > 20000
    - Set ${dark}
    - N ${d}
   - Set ${dark}
  - N -60
 if y > ${horizon - 1}
  if WGH > ${seedT}
   - Set ${dark}
   - N ${d}
  if y > 0
   if x > 0
    if WGH > 3
     - AvgN+NW 300
     - AvgN+NE -300
    - Weighted -640
   - N ${d}
   if x > 0
    - W 0
    - Set ${yTop}`;
}

for (const [variant, seedT] of [
  ["sparse", 220],
  ["mid", 120],
  ["dense", 60],
]) {
  const c = skyChroma([30, 40, 120], [255, 150, 60], 512);
  run(
    `e3-mtn-${variant}`,
    `Width 512 Height 512 Bitdepth 16 RCT 6
${perChannel(mountainLuma(c.yTop, c.yBot, 512, 340, seedT, -12000), c.co, c.cg)}`,
  );
}
