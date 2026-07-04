// Round 5: per-layer position/size/opacity semantics for the richer Mix tab.
// usage: node tools/batch5.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";
import { automaton } from "../src/recipes/ca.ts";
import { gradient } from "../src/recipes/gradient.ts";
import { sunset } from "../src/recipes/sunset.ts";
import { defaultsOf } from "../src/recipes/types.ts";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

const ctx = (w = 512, h = 512) => ({ width: w, height: h, scale: 257 });
const alphaWrap = (tree, a) => `if c > 2\n - Set ${a}\n ${tree}`;

const gradL = gradient.layer(defaultsOf(gradient), [], ctx());
const caL = (w = 512, h = 512) =>
  automaton.layer(
    { ...defaultsOf(automaton), rule: 90, fg: "#50ffdc", bg: "#08183c" },
    [],
    ctx(w, h),
  );
const sunL = sunset.layer(defaultsOf(sunset), [], ctx());

const OPAQUE = 65535;
const HALF = 32768;

const cases = {
  // t1: kBlend (normal) at 50% opacity — expect halfway between base and CA
  "t1-blend-50": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kBlend
${alphaWrap(caL().tree, HALF)}`,

  // t1b: kBlend at 100% — should fully replace with CA
  "t1b-blend-100": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kBlend
${alphaWrap(caL().tree, OPAQUE)}`,

  // t2: kAlphaWeightedAdd at 50% vs plain kAdd
  "t2-awadd-50": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kAlphaWeightedAdd
${alphaWrap(caL().tree, HALF)}`,
  "t2b-add-full": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kAdd
${alphaWrap(caL().tree, OPAQUE)}`,

  // t3: does kMul respect alpha?
  "t3-mul-50": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kMul
${alphaWrap(`if y > 256\n - Set 20000\n - Set ${OPAQUE}`, HALF)}`,

  // t4: positioned smaller patch (256x256 at 128,128), kAdd
  "t4-patch-pos": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 256 Height 256 FramePos 128 128 BlendMode kAdd
${alphaWrap(caL(256, 256).tree, OPAQUE)}`,

  // t5: patch partially off-canvas (negative FramePos)
  "t5-patch-neg": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 256 Height 256 FramePos -64 -64 BlendMode kAdd
${alphaWrap(caL(256, 256).tree, OPAQUE)}`,

  // t6: per-frame Upsample on the overlay only (64 -> 256 effective, placed)
  "t6-upsample-frame": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 64 Height 64 Upsample 4 FramePos 128 128 BlendMode kAdd
${alphaWrap(caL(64, 64).tree, OPAQUE)}`,

  // t7: global Orientation over a mixed stack (4 should be a 90° variant)
  "t7-orient-4": `Width 512 Height 512 Bitdepth 16 Alpha Orientation 4 NotLast
${alphaWrap(gradL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kBlend
${alphaWrap(caL().tree, HALF)}`,

  // t8: splines (sun) on an alpha-wrapped base still render?
  "t8-spline-alpha": `Width 512 Height 512 Bitdepth 16 Alpha NotLast
${sunL.splines}
${alphaWrap(sunL.tree, OPAQUE)}
Width 512 Height 512 BlendMode kBlend
${alphaWrap(caL().tree, 20000)}`,
};

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

for (const [name, code] of Object.entries(cases)) {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    const samples = `mid=${px(img, 256, 300)} corner=${px(img, 16, 16)} low=${px(img, 40, 470)}`;
    console.log(
      `${name.padEnd(20)} ${String(bytes.length).padStart(4)} B  ${img.width}x${img.height}  ${samples}`,
    );
  } catch (e) {
    console.log(
      `${name.padEnd(20)} FAILED: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`,
    );
  }
}
