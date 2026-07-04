// Validates every recipe (defaults + randomized samples) and every preset
// against the real encoder. Renders PNGs for visual review.
// usage: node tools/validate.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodeTree, decodeJxl, toPng } from "./jxl-node.mjs";
import { RECIPES } from "../src/recipes/index.ts";
import { defaultsOf } from "../src/recipes/types.ts";
import { PRESETS } from "../src/presets.ts";
import {
  LAYER_DEFAULTS,
  generateMix,
  mixablePresets,
  randomMixState,
  sanitizeMixState,
} from "../src/mixer.ts";

const outDir = process.argv[2] ?? "renders";
mkdirSync(outDir, { recursive: true });

let failures = 0;

function run(name, code, strokesNote = "") {
  try {
    const bytes = encodeTree(code);
    const img = decodeJxl(bytes);
    writeFileSync(join(outDir, `${name}.png`), toPng(img));
    const flag = bytes.length > 1024 ? "  *** OVER 1KB ***" : "";
    console.log(
      `${name.padEnd(28)} ${String(bytes.length).padStart(5)} B  ${img.width}x${img.height}${flag}${strokesNote}`,
    );
  } catch (e) {
    failures++;
    console.log(
      `${name.padEnd(28)} FAILED: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`,
    );
  }
}

console.log("=== recipes: defaults ===");
for (const r of RECIPES) {
  run(`recipe-${r.id}-default`, r.generate(defaultsOf(r), []));
}

console.log("=== recipes: randomized (3 each) ===");
for (const r of RECIPES) {
  for (let i = 0; i < 3; i++) {
    run(`recipe-${r.id}-rnd${i}`, r.generate({ ...defaultsOf(r), ...r.randomize() }, []));
  }
}

console.log("=== presets ===");
for (const p of PRESETS) {
  const code =
    p.mode === "code"
      ? p.code
      : p.mode === "mix"
        ? generateMix(sanitizeMixState({ layers: p.layers, rotate: p.rotate }))
        : RECIPES.find((r) => r.id === p.recipeId).generate(
            { ...defaultsOf(RECIPES.find((r) => r.id === p.recipeId)), ...p.values },
            p.strokes ?? [],
          );
  run(`preset-${p.id}`, code);
}

console.log("=== mixes: every base x overlay pair ===");
for (const base of mixablePresets("base")) {
  for (const over of mixablePresets("overlay")) {
    run(
      `mix-${base.id}--${over.id}`,
      generateMix({
        layers: [
          { ...LAYER_DEFAULTS, presetId: base.id },
          { ...LAYER_DEFAULTS, presetId: over.id },
        ],
        rotate: 0,
      }),
    );
  }
}

console.log("=== mixes: every blend/geometry knob ===");
const knobs = [
  { name: "normal-60", blend: "normal", opacity: 60 },
  { name: "mul-window", blend: "mul", w: 50, h: 50, x: 80, y: 20 },
  { name: "add-30-window", blend: "add", opacity: 30, w: 40, h: 70, x: 0, y: 100 },
  { name: "tiny-window", blend: "normal", opacity: 100, w: 10, h: 10, x: 100, y: 0 },
];
for (const k of knobs) {
  for (const rotate of [0, 1, 2, 3]) {
    run(
      `mixknob-${k.name}-r${rotate}`,
      generateMix({
        layers: [
          { ...LAYER_DEFAULTS, presetId: "golden-sunset" },
          { ...LAYER_DEFAULTS, presetId: "amber-chaos", ...k },
        ],
        rotate,
      }),
    );
  }
}

console.log("=== mixes: randomized stacks (24) ===");
for (let i = 0; i < 24; i++) {
  run(`mix-random-${i}`, generateMix(randomMixState()));
}

console.log(failures ? `\n${failures} FAILURES` : "\nall ok");
process.exit(failures ? 1 : 0);
