import type { Recipe, ParamValues } from "./types.ts";
import {
  hexToRgb,
  perChannel,
  caChannelTree,
  mulberry32,
  randHex,
  pick,
} from "./helpers.ts";

/** Rules that produce well-known interesting patterns, offered as presets. */
const FAMOUS_RULES = [18, 22, 30, 45, 54, 60, 73, 90, 105, 110, 126, 150, 182];

export const automaton: Recipe = {
  id: "automaton",
  name: "Triangle Fractals",
  emoji: "🔺",
  blurb:
    "A tiny rule grows a whole pattern from a single dot — every rule number makes a different world.",
  params: [
    { kind: "range", id: "rule", label: "Rule number", min: 0, max: 255, default: 90 },
    { kind: "color", id: "fg", label: "Pattern color", default: "#50ffdc" },
    { kind: "color", id: "bg", label: "Background", default: "#08183c" },
    {
      kind: "select",
      id: "size",
      label: "Detail",
      options: [
        { value: "257x129", label: "Chunky (257 × 129)" },
        { value: "513x257", label: "Fine (513 × 257)" },
        { value: "1025x513", label: "Ultra fine (1025 × 513)" },
      ],
      default: "513x257",
    },
    {
      kind: "select",
      id: "zoom",
      label: "Pixel size",
      options: [
        { value: "1", label: "1×" },
        { value: "2", label: "2× blocky" },
        { value: "4", label: "4× blocky" },
      ],
      default: "1",
    },
  ],
  generate(v: ParamValues) {
    const [w, h] = String(v.size).split("x").map(Number);
    const rule = Number(v.rule) & 255;
    const fg = hexToRgb(String(v.fg));
    const bg = hexToRgb(String(v.bg));
    const up = Number(v.zoom);
    return `Width ${w} Height ${h}${up > 1 ? ` Upsample ${up}` : ""}
${perChannel(
  caChannelTree(rule, fg[0], bg[0], w),
  caChannelTree(rule, fg[1], bg[1], w),
  caChannelTree(rule, fg[2], bg[2], w),
)}`;
  },
  randomize() {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    return {
      rule: rnd() < 0.6 ? pick(rnd, FAMOUS_RULES) : Math.floor(rnd() * 256),
      fg: randHex(rnd),
      bg: randHex(rnd),
      size: "513x257",
      zoom: "1",
    };
  },
};
