// CLI: node tools/render.mjs <tree-file|-> <out.png>
// Prints the compiled .jxl byte size. Use "-" to read code from stdin.
import { readFileSync, writeFileSync } from "node:fs";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node tools/render.mjs <tree-file|-> <out.png>");
  process.exit(1);
}
const code = readFileSync(src === "-" ? 0 : src, "utf8");
try {
  const bytes = encodeTree(code);
  const img = decodeJxl(bytes);
  writeFileSync(out, toPng(img));
  console.log(`${bytes.length} bytes, ${img.width}x${img.height} -> ${out}`);
  process.exit(0);
} catch (e) {
  console.error("ERROR: " + (e instanceof Error ? e.message : e));
  process.exit(2);
}
