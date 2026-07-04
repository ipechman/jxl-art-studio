// Round 3: numeric spline calibration, inverted CA, group numbering probe.
// usage: node tools/batch3.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

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

const lineCode = (colorDC, sigmaDC) => `Width 256 Height 256
${spline(colorDC, colorDC, colorDC, sigmaDC, [[48, 128], [208, 128]])}
- Set 0`;

function measure(code) {
  const bytes = encodeTree(code);
  const img = decodeJxl(bytes);
  // vertical cross-section at x=128
  const col = [];
  for (let y = 0; y < 256; y++) col.push(img.data[(y * 256 + 128) * 4]);
  const peak = Math.max(...col);
  const half = peak / 2;
  let above = col.filter((v) => v > half).length;
  return { bytes: bytes.length, peak, halfWidth: above, img };
}

console.log("== color DC sweep at sigmaDC=10 ==");
for (const c of [1, 2, 5, 10, 20, 40]) {
  const { bytes, peak, halfWidth } = measure(lineCode(c, 10));
  console.log(`colorDC=${String(c).padStart(3)} sigmaDC=10  peak=${peak}  halfWidth=${halfWidth}px  (${bytes}B)`);
}

console.log("== sigma DC sweep at colorDC=5 ==");
for (const s of [0.5, 1, 2, 5, 10, 20, 40, 80]) {
  const { bytes, peak, halfWidth } = measure(lineCode(5, s));
  console.log(`colorDC=5 sigmaDC=${String(s).padStart(4)}  peak=${peak}  halfWidth=${halfWidth}px  (${bytes}B)`);
}

console.log("== dot (two coincident points) sigma sweep at colorDC=10 ==");
for (const s of [2, 5, 10, 20, 40]) {
  const code = `Width 256 Height 256
${spline(10, 10, 10, s, [[128, 128], [128.5, 128]])}
- Set 0`;
  const { bytes, peak, halfWidth } = measure(code);
  console.log(`dot sigmaDC=${String(s).padStart(3)}  peak=${peak}  halfWidth=${halfWidth}px  (${bytes}B)`);
}

// --- inverted CA (black on white) — exercises the complement path ---------
const perChannel = (r, g, b) => `if c > 0\n if c > 1\n ${b}\n ${g}\n ${r}`;
function caStep(rule, fg, bg) {
  const leaf = (i) => `- Set ${(rule >> i) & 1 ? fg : bg}`;
  const d = fg - bg;
  return `if N > ${bg}
 if NW-N > ${-d}
  if N-NE > 0
   ${leaf(6)}
   ${leaf(7)}
  if N-NE > 0
   ${leaf(2)}
   ${leaf(3)}
 if NW-N > 0
  if N-NE > ${-d}
   ${leaf(4)}
   ${leaf(5)}
  if N-NE > ${-d}
   ${leaf(0)}
   ${leaf(1)}`;
}
function caChannel(rule, fg, bg, w) {
  const cx = Math.floor(w / 2);
  const seed = `if x > ${cx}\n - Set ${bg}\n if x > ${cx - 1}\n  - Set ${fg}\n  - Set ${bg}`;
  let step;
  if (fg === bg) step = `- Set ${bg}`;
  else if (fg > bg) step = caStep(rule, fg, bg);
  else {
    let crule = 0;
    for (let i = 0; i < 8; i++) if (!((rule >> (7 - i)) & 1)) crule |= 1 << i;
    step = caStep(crule, bg, fg);
  }
  return `if y > 0\n ${step}\n ${seed}`;
}
const caInv = `Width 257 Height 129
${perChannel(caChannel(90, 30, 235, 257), caChannel(90, 30, 235, 257), caChannel(90, 60, 245, 257))}`;
try {
  const bytes = encodeTree(caInv);
  const img = decodeJxl(bytes);
  writeFileSync(join(outDir, "ca3-inverted.png"), toPng(img));
  console.log(`ca3-inverted  ${bytes.length} bytes ok`);
} catch (e) {
  console.log(`ca3-inverted FAILED: ${e.message.split("\n")[0]}`);
}

// --- group numbering probe -------------------------------------------------
// 512x256, GroupShift 0 -> 128px groups -> 4 cols x 2 rows = 8 groups.
// Give each candidate g value a distinct gray, sample each block center.
function gTree(lo, hi) {
  // binary tree over integer range [lo, hi], leaf value = (g - 18) * 12
  if (lo === hi) return `- Set ${(lo - 18) * 12}`;
  const mid = Math.floor((lo + hi) / 2);
  return `if g > ${mid}\n ${gTree(mid + 1, hi)}\n ${gTree(lo, mid)}`;
}
const gProbe = `Width 512 Height 256 GroupShift 0
${gTree(18, 33)}`;
try {
  const bytes = encodeTree(gProbe);
  const img = decodeJxl(bytes);
  writeFileSync(join(outDir, "g-probe.png"), toPng(img));
  const vals = [];
  for (let by = 0; by < 2; by++)
    for (let bx = 0; bx < 4; bx++) {
      const v = img.data[((by * 128 + 64) * 512 + bx * 128 + 64) * 4];
      vals.push(`block(${bx},${by})=g${Math.round(v / 12) + 18}`);
    }
  console.log(`g-probe ${bytes.length}B: ${vals.join(" ")}`);
} catch (e) {
  console.log(`g-probe FAILED: ${e.message.split("\n")[0]}`);
}
