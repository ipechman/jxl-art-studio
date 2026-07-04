// Round 2: general two-color CA, spline calibration, warp/plasma/stripe variants.
// usage: node tools/batch2.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

const perChannel = (r, g, b) => `if c > 0\n if c > 1\n ${b}\n ${g}\n ${r}`;

// --- general two-color elementary cellular automaton ----------------------
// Values per channel are {bg, fg}. If fg < bg we swap colors and complement
// the rule (bit'_i = 1 - bit_(7-i)) so the CA-step subtree always sees d > 0.
function caStep(rule, fg, bg) {
  const leaf = (i) => `- Set ${(rule >> i) & 1 ? fg : bg}`;
  const d = fg - bg;
  // idx = nw<<2 | n<<1 | ne
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
  const seed = `if x > ${cx}
 - Set ${bg}
 if x > ${cx - 1}
  - Set ${fg}
  - Set ${bg}`;
  let step;
  if (fg === bg) {
    step = `- Set ${bg}`;
  } else if (fg > bg) {
    step = caStep(rule, fg, bg);
  } else {
    // complement the rule, swap colors
    let crule = 0;
    for (let i = 0; i < 8; i++) {
      if (!((rule >> (7 - i)) & 1)) crule |= 1 << i;
    }
    step = caStep(crule, bg, fg);
  }
  return `if y > 0\n ${step}\n ${seed}`;
}

function cellularAutomaton(w, h, rule, fg, bg) {
  return `Width ${w} Height ${h}
${perChannel(
  caChannel(rule, fg[0], bg[0], w),
  caChannel(rule, fg[1], bg[1], w),
  caChannel(rule, fg[2], bg[2], w),
)}`;
}

// --- splines ---------------------------------------------------------------
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

const lineProbe = (colorDC, sigmaDC) => `Width 256 Height 256
${spline(colorDC, colorDC, colorDC, sigmaDC, [[48, 128], [208, 128]])}
- Set 0`;

// --- candidates ------------------------------------------------------------
const candidates = {
  "ca2-rule90": cellularAutomaton(257, 129, 90, [80, 255, 220], [8, 24, 60]),
  "ca2-rule30": cellularAutomaton(257, 129, 30, [255, 200, 80], [20, 12, 40]),
  "ca2-rule110": cellularAutomaton(257, 129, 110, [255, 100, 220], [24, 8, 40]),
  "ca2-rule22": cellularAutomaton(257, 129, 22, [140, 255, 120], [6, 20, 30]),
  "ca2-rule150": cellularAutomaton(257, 129, 150, [255, 255, 255], [30, 30, 30]),

  "probe-c141-s6": lineProbe(141, 5.66),
  "probe-c141-s17": lineProbe(141, 17),
  "probe-c141-s57": lineProbe(141, 57),
  "probe-c141-s170": lineProbe(141, 170),
  "probe-c57-s17": lineProbe(57, 17),
  "probe-c566-s17": lineProbe(566, 17),
  "probe-1pt": `Width 256 Height 256
${spline(566, 566, 566, 17, [[128, 128]])}
- Set 0`,
  "probe-2pt-same": `Width 256 Height 256
${spline(566, 566, 566, 17, [[128, 128], [129, 128]])}
- Set 0`,

  "warp-rct6": `Width 256 Height 256 Bitdepth 10 RCT 6
if W-NW > -1
 if NW-N > -1
  - W 1
  - NW 0
 - Select 1`,
  "warp-o2": `Width 256 Height 256 Bitdepth 10 RCT 6
if W-NW > -1
 if NW-N > -1
  - W 2
  - NW 0
 - Select 3`,
  "plasma-rct0": `Width 256 Height 256
if y > 0
 if W > -50
  - Weighted -1
  - Set 320
 - W 41`,
  "plasma-soft": `Width 256 Height 256 RCT 6
if y > 0
 if W > -20
  - Weighted -2
  - Set 500
 - W 13`,
  "stripes-fine": `Width 256 Height 256 RCT 6
if N > 254
 - Set 0
 - N 16`,
  "stripes-gray": `Width 256 Height 256
if N > 254
 - Set 0
 - N 6`,
};

const sampleRow = (img, y, xs) =>
  xs
    .map((x) => {
      const i = (y * img.width + x) * 4;
      return `${x},${y}:(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]})`;
    })
    .join(" ");

for (const [name, code] of Object.entries(candidates)) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    let extra = "";
    if (name.startsWith("probe-")) {
      // cross-section through the line at x=128: y=128 center, then offsets
      extra =
        "  " +
        [128, 130, 133, 138, 148, 168, 208]
          .map((y) => {
            const i = (y * img.width + 128) * 4;
            return `y${y}=(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]})`;
          })
          .join(" ");
      extra += "  rowByCenter: " + sampleRow(img, 128, [48, 128, 208, 220]);
    }
    console.log(
      `${name.padEnd(18)} ${String(bytes.length).padStart(5)} bytes  ${img.width}x${img.height}${extra}`,
    );
  } catch (e) {
    console.log(
      `${name.padEnd(18)} FAILED: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`,
    );
  }
}
