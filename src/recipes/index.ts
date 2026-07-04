import type { Recipe } from "./types.ts";
import { gradient } from "./gradient.ts";
import { sunset } from "./sunset.ts";
import { automaton } from "./ca.ts";
import { stripes } from "./stripes.ts";
import { plasma } from "./plasma.ts";
import { warp } from "./warp.ts";
import { quilt } from "./quilt.ts";
import { doodle } from "./doodle.ts";

export const RECIPES: Recipe[] = [
  sunset,
  gradient,
  doodle,
  automaton,
  stripes,
  plasma,
  warp,
  quilt,
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
