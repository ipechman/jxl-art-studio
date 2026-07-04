import type { Recipe, ParamValues } from "./types.ts";
import { mulberry32, randInt, pick } from "./helpers.ts";
import { PALETTES } from "./stripes.ts";

/**
 * Small self-contained patch styles; each group starts prediction fresh.
 * Ramps wrap past 254 so 128-px blocks don't just saturate to white.
 */
function patchStyle(rnd: () => number): string {
  const k = randInt(rnd, 2, 24);
  const m = randInt(rnd, 40, 250);
  switch (randInt(rnd, 0, 5)) {
    case 0:
      return `if W > 254\n - Set 0\n - W ${k}`; // horizontal bands
    case 1:
      return `if N > 250\n - Set 0\n - Gradient ${randInt(rnd, 1, 6)}`; // sheared bands
    case 2:
      return `if N > 254\n - Set 0\n - N ${k}`; // diagonal stripes
    case 3:
      return `- Set ${m}`; // solid tone
    case 4:
      return `if W-NW > -1\n - W ${randInt(rnd, 1, 3)}\n - Select ${randInt(rnd, 1, 3)}`; // weave
    default:
      return `- N ${randInt(rnd, 1, 2)}`; // soft vertical ramp
  }
}

/** Binary decision tree over group ids [lo, hi] with a style per group. */
function groupTree(lo: number, hi: number, styles: Map<number, string>): string {
  if (lo === hi) return styles.get(lo)!;
  const mid = Math.floor((lo + hi) / 2);
  return `if g > ${mid}\n ${groupTree(mid + 1, hi, styles)}\n ${groupTree(lo, mid, styles)}`;
}

export const quilt: Recipe = {
  id: "quilt",
  name: "Patchwork Quilt",
  emoji: "🧶",
  blurb: "Every 128-pixel block gets its own little pattern. Shuffle until you love it.",
  params: [
    { kind: "range", id: "cols", label: "Blocks across", min: 2, max: 8, default: 4 },
    { kind: "range", id: "rows", label: "Blocks down", min: 1, max: 4, default: 3 },
    { kind: "range", id: "seed", label: "Shuffle", min: 1, max: 9999, default: 7 },
    {
      kind: "select",
      id: "palette",
      label: "Palette",
      options: PALETTES,
      default: "2",
    },
  ],
  generate(v: ParamValues) {
    const cols = Number(v.cols);
    const rows = Number(v.rows);
    const rnd = mulberry32(Number(v.seed));
    // group ids are 21 + row·cols + col in raster order (measured in batch3)
    const first = 21;
    const last = first + cols * rows - 1;
    const styles = new Map<number, string>();
    for (let gid = first; gid <= last; gid++) styles.set(gid, patchStyle(rnd));
    return `Width ${cols * 128} Height ${rows * 128} GroupShift 0 RCT ${Number(v.palette)}
${groupTree(first, last, styles)}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      cols: randInt(rnd, 3, 6),
      rows: randInt(rnd, 2, 4),
      seed: randInt(rnd, 1, 9999),
      palette: pick(rnd, PALETTES).value,
    };
  },
};
