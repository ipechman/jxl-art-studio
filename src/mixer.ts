/**
 * Preset mixing: stacks builder presets as JPEG XL layers (`NotLast` frames)
 * blended with kAdd / kMul. Rules established empirically (tools/batch4.mjs):
 *  - all layers share one 16-bit canvas; 8-bit recipes scale constants ×257
 *  - splines only render on the base frame, so spline presets can't overlay
 *  - RCT is per-layer; Bitdepth/Orientation/GroupShift are file-global
 *    (which is why the quilt recipe has no layer() and can't be mixed)
 */
import { PRESETS, type MixLayer, type Preset } from "./presets.ts";
import { recipeById } from "./recipes/index.ts";
import { defaultsOf } from "./recipes/types.ts";

export const MIX_SIZE = 512;
const MAX_LAYERS = 4;

/** Recipes whose layers carry splines — usable only as the base of a mix. */
const SPLINE_RECIPES = new Set(["sunset", "doodle"]);

export function mixablePresets(role: "base" | "overlay"): Preset[] {
  return PRESETS.filter((p) => {
    if (p.mode !== "builder") return false;
    const r = recipeById(p.recipeId!);
    if (!r?.layer) return false;
    if (role === "overlay" && SPLINE_RECIPES.has(r.id)) return false;
    return true;
  });
}

export function defaultMix(): MixLayer[] {
  return [
    { presetId: "golden-sunset", blend: "add" },
    { presetId: "neon-triangles", blend: "add" },
  ];
}

export function randomMix(): MixLayer[] {
  const pickFrom = (arr: Preset[]) => arr[Math.floor(Math.random() * arr.length)];
  const layers: MixLayer[] = [{ presetId: pickFrom(mixablePresets("base")).id, blend: "add" }];
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    layers.push({
      presetId: pickFrom(mixablePresets("overlay")).id,
      blend: Math.random() < 0.85 ? "add" : "mul",
    });
  }
  return layers;
}

export function sanitizeMix(layers: MixLayer[]): MixLayer[] {
  const base = mixablePresets("base").map((p) => p.id);
  const overlay = mixablePresets("overlay").map((p) => p.id);
  const out = layers
    .filter((l, i) => (i === 0 ? base : overlay).includes(l.presetId))
    .slice(0, MAX_LAYERS)
    .map((l) => ({ presetId: l.presetId, blend: l.blend === "mul" ? "mul" : "add" }) as MixLayer);
  return out.length ? out : defaultMix();
}

export function generateMix(layers: MixLayer[]): string {
  const ctx = { width: MIX_SIZE, height: MIX_SIZE, scale: 257 };
  const parts: string[] = [];
  layers.forEach((l, i) => {
    const preset = PRESETS.find((p) => p.id === l.presetId);
    const recipe = preset && recipeById(preset.recipeId!);
    if (!preset || !recipe?.layer) return;
    const { header, splines, tree } = recipe.layer(
      { ...defaultsOf(recipe), ...preset.values },
      preset.strokes ?? [],
      ctx,
    );
    const head: string[] = [`Width ${ctx.width} Height ${ctx.height}`];
    if (i === 0) head.push("Bitdepth 16");
    else head.push(`BlendMode ${l.blend === "mul" ? "kMul" : "kAdd"}`);
    if (i < layers.length - 1) head.push("NotLast");
    parts.push(
      [head.join(" "), header, i === 0 ? splines : "", tree]
        .filter(Boolean)
        .join("\n"),
    );
  });
  return parts.join("\n");
}
