// Recipe experimentation: renders candidate tree programs to PNGs.
// usage: node tools/batch.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

// --- helpers -------------------------------------------------------------

// if c > 0 { if c > 1 {B} {G} } {R}
const perChannel = (r, g, b) => `if c > 0\n if c > 1\n ${b}\n ${g}\n ${r}`;

const q16 = (v8) => Math.round(v8 * 257);

function verticalGradient(w, h, top, bottom) {
  const d = top.map((t, i) => Math.round(((bottom[i] - t) * 257) / (h - 1)));
  return `Width ${w} Height ${h} Bitdepth 16
if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(`- Set ${q16(top[0])}`, `- Set ${q16(top[1])}`, `- Set ${q16(top[2])}`)}`;
}

function planeGradient(w, h, tl, right, down) {
  // tl = top-left color; right/down = colors at top-right and bottom-left
  const dx = tl.map((t, i) => Math.round(((right[i] - t) * 257) / (w - 1)));
  const dy = tl.map((t, i) => Math.round(((down[i] - t) * 257) / (h - 1)));
  return `Width ${w} Height ${h} Bitdepth 16
if y > 0
 if x > 0
  - Gradient 0
  ${perChannel(`- N ${dy[0]}`, `- N ${dy[1]}`, `- N ${dy[2]}`)}
 if x > 0
  ${perChannel(`- W ${dx[0]}`, `- W ${dx[1]}`, `- W ${dx[2]}`)}
  ${perChannel(`- Set ${q16(tl[0])}`, `- Set ${q16(tl[1])}`, `- Set ${q16(tl[2])}`)}`;
}

function caChannelTree(rule, fg, w) {
  if (fg === 0) return `- Set 0`;
  const leaf = (bit) => ((rule >> bit) & 1 ? `- Set ${fg}` : `- Set 0`);
  const ca = `if NW > 0
 if N > 0
  if NE > 0
   ${leaf(7)}
   ${leaf(6)}
  if NE > 0
   ${leaf(5)}
   ${leaf(4)}
 if N > 0
  if NE > 0
   ${leaf(3)}
   ${leaf(2)}
  if NE > 0
   ${leaf(1)}
   ${leaf(0)}`;
  const cx = Math.floor(w / 2);
  const seed = `if x > ${cx}
 - Set 0
 if x > ${cx - 1}
  - Set ${fg}
  - Set 0`;
  return `if y > 0\n ${ca}\n ${seed}`;
}

function cellularAutomaton(w, h, rule, fgColor) {
  return `Width ${w} Height ${h}
${perChannel(
  caChannelTree(rule, fgColor[0], w),
  caChannelTree(rule, fgColor[1], w),
  caChannelTree(rule, fgColor[2], w),
)}`;
}

function spline(rDC, gDC, bDC, sigmaDC, points) {
  const coeffs = (dc) => `${dc} ${Array(31).fill(0).join(" ")}`;
  return `Spline
${coeffs(rDC)}
${coeffs(gDC)}
${coeffs(bDC)}
${coeffs(sigmaDC)}
${points.map(([x, y]) => `${x} ${y}`).join("\n")}
EndSpline`;
}

// --- candidates ----------------------------------------------------------

const candidates = {
  "gradient-v-sunset": verticalGradient(256, 256, [24, 32, 96], [255, 140, 40]),
  "gradient-v-sky": verticalGradient(256, 256, [10, 40, 120], [200, 230, 255]),
  "gradient-diag": planeGradient(256, 256, [255, 80, 120], [80, 120, 255], [255, 200, 80]),
  "ca-rule90": cellularAutomaton(257, 129, 90, [0, 255, 200]),
  "ca-rule30": cellularAutomaton(257, 129, 30, [255, 200, 80]),
  "ca-rule110": cellularAutomaton(257, 129, 110, [255, 100, 220]),
  "warp-verbatim": `Width 256 Height 256 Bitdepth 10
if W-NW > -1
 if NW-N > -1
  - W 1
  - NW 0
 - Select 1`,
  "plasma-a": `Width 256 Height 256 RCT 6
if y > 0
 if W > -50
  - Weighted -1
  - Set 320
 - W 41`,
  "rainbow-diag": `Width 256 Height 256 RCT 6
if N > 254
 - Set 0
 - N 4`,
  patchwork: `Width 512 Height 256 GroupShift 0 RCT 6
if g > 24
 - W 3
 - N 7`,
  "spline-probe": `Width 256 Height 256
SplineQuantizationAdjustment 0
${spline(500, 200, -900, 40, [[128, 128]])}
- Set 128`,
  "spline-curve": `Width 256 Height 256
SplineQuantizationAdjustment 0
${spline(800, 300, 100, 20, [[40, 200], [128, 60], [216, 200]])}
- Set 30`,
  "sierpinski-verbatim": `Width 256 Height 256 Bitdepth 1
if y > 0
 if |W| > 0
  - N 0
  if N > 0
   - Set 0
   - Set 1
 - Set 0`,
  "upsample-test": `Upsample 4
${verticalGradient(64, 64, [24, 32, 96], [255, 140, 40])}`,
};

// --- run -----------------------------------------------------------------

const samplers = {
  "spline-probe": (img) => {
    const px = (x, y) => {
      const i = (y * img.width + x) * 4;
      return [...img.data.slice(i, i + 3)];
    };
    return `center=${px(128, 128)} off=${px(128, 60)} corner=${px(5, 5)}`;
  },
};

for (const [name, code] of Object.entries(candidates)) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    const extra = samplers[name] ? "  " + samplers[name](img) : "";
    console.log(
      `${name.padEnd(22)} ${String(bytes.length).padStart(5)} bytes  ${img.width}x${img.height}${extra}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(22)} FAILED: ${e instanceof Error ? e.message : e}`);
  }
}
