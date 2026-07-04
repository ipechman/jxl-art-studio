// Renders the same stripes pattern under all 42 RCTs into one montage PNG.
// usage: node tools/rct-probe.mjs <out.png>
import { writeFileSync } from "node:fs";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const TILE = 96;
const COLS = 7;
const ROWS = 6;
const montage = {
  width: COLS * TILE,
  height: ROWS * TILE,
  data: new Uint8ClampedArray(COLS * TILE * ROWS * TILE * 4),
};

for (let rct = 0; rct < 42; rct++) {
  const code = `Width 192 Height 192 RCT ${rct}
if N > 254
 - Set 0
 - N 8`;
  let img;
  try {
    const bytes = encodeTree(code);
    img = decodeJxl(bytes);
  } catch {
    continue;
  }
  const tx = (rct % COLS) * TILE;
  const ty = Math.floor(rct / COLS) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // sample with 2x downscale
      const sx = x * 2;
      const sy = y * 2;
      const si = (sy * img.width + sx) * 4;
      const di = ((ty + y) * montage.width + tx + x) * 4;
      montage.data[di] = img.data[si];
      montage.data[di + 1] = img.data[si + 1];
      montage.data[di + 2] = img.data[si + 2];
      montage.data[di + 3] = 255;
    }
  }
  // white tick marks along the top edge of each tile: count = rct number
  for (let t = 0; t <= rct; t++) {
    const mx = tx + 2 + (t % 47) * 2;
    const my = ty + 1 + Math.floor(t / 47) * 3;
    const di = (my * montage.width + mx) * 4;
    montage.data[di] = montage.data[di + 1] = montage.data[di + 2] = 255;
  }
}

writeFileSync(process.argv[2] ?? "rct-montage.png", toPng(montage));
console.log("montage written; tiles are RCT 0..41 in raster order, 7 per row");
