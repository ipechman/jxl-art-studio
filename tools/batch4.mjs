// Round 4: multi-layer (NotLast + BlendMode) semantics for preset mixing.
// usage: node tools/batch4.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

const perChannel = (r, g, b) => `if c > 0\n if c > 1\n ${b}\n ${g}\n ${r}`;

// 16-bit vertical gradient tree (navy -> orange), header not included
const gradTree = (() => {
  const top = [24, 32, 96].map((v) => v * 257);
  const bot = [255, 140, 40].map((v) => v * 257);
  const d = top.map((t, i) => Math.round((bot[i] - t) / 511));
  return `if y > 0
 ${perChannel(`- N ${d[0]}`, `- N ${d[1]}`, `- N ${d[2]}`)}
 ${perChannel(`- Set ${top[0]}`, `- Set ${top[1]}`, `- Set ${top[2]}`)}`;
})();

// 16-bit rule-90 CA tree, fg color scaled, bg = 0 (so kAdd only adds the pattern)
function caTree(fg8, w) {
  const step = (fg) => {
    if (fg === 0) return `- Set 0`;
    return `if N > 0
 if NW-N > ${-fg}
  if N-NE > 0
   - Set 0
   - Set ${fg}
  if N-NE > 0
   - Set ${fg}
   - Set 0
 if NW-N > 0
  if N-NE > ${-fg}
   - Set ${fg}
   - Set 0
  if N-NE > ${-fg}
   - Set 0
   - Set ${fg}`;
  };
  const cx = Math.floor(w / 2);
  const chan = (fg) => `if y > 0
 ${step(fg)}
 if x > ${cx}
  - Set 0
  if x > ${cx - 1}
   - Set ${fg}
   - Set 0`;
  const fg16 = fg8.map((v) => v * 257);
  return perChannel(chan(fg16[0]), chan(fg16[1]), chan(fg16[2]));
}

const sunSpline = (() => {
  const cf = (v) => `${v} ${Array(31).fill(0).join(" ")}`;
  const sigma = 12;
  const dc = Math.round((255 * sigma * 257) / 80);
  return `Spline
${cf(dc)}
${cf(dc)}
${cf(Math.round(dc * 0.7))}
${cf(sigma)}
256 200
257 200
EndSpline`;
})();

const cases = {
  // a) overlay repeats Width/Height, kAdd
  "mix-a-grad-ca-add": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
Width 512 Height 512 BlendMode kAdd
${caTree([80, 255, 220], 512)}`,

  // b) overlay omits Width/Height
  "mix-b-nosize": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
BlendMode kAdd
${caTree([80, 255, 220], 512)}`,

  // c) kMul with near-white bg: overlay darkens where pattern is
  "mix-c-mul": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
Width 512 Height 512 BlendMode kMul
if y > 200
 if y > 312
  - Set 65535
  - Set 20000
 - Set 65535`,

  // d) spline (sun) as overlay header over the gradient
  "mix-d-spline-layer": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
Width 512 Height 512 BlendMode kAdd
${sunSpline}
- Set 0`,

  // e) quilt-style groups as BASE + CA overlay (checks g ids in frame 1)
  "mix-e-quilt-base": `Width 512 Height 512 Bitdepth 16 GroupShift 0 NotLast
if g > 28
 if N > 65277
  - Set 0
  - N ${8 * 257}
 - W ${2 * 257}
Width 512 Height 512 BlendMode kAdd
${caTree([255, 90, 200], 512)}`,

  // f) three layers: gradient + CA + sun
  "mix-f-three": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
Width 512 Height 512 BlendMode kAdd NotLast
${caTree([60, 180, 160], 512)}
Width 512 Height 512 BlendMode kAdd
${sunSpline}
- Set 0`,

  // g) overlay with its own RCT (palette ramp added over 16-bit gradient)
  "mix-g-rct-overlay": `Width 512 Height 512 Bitdepth 16 NotLast
${gradTree}
Width 512 Height 512 RCT 6 BlendMode kAdd
if N > ${65277}
 - Set 0
 - N ${6 * 257}`,
};

for (const [name, code] of Object.entries(cases)) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    console.log(`${name.padEnd(22)} ${String(bytes.length).padStart(5)} B  ${img.width}x${img.height}`);
  } catch (e) {
    console.log(`${name.padEnd(22)} FAILED: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
  }
}
