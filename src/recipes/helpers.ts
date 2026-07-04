export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 8-bit component -> 16-bit sample value. */
export const q16 = (v8: number) => Math.round(v8 * 257);

/**
 * Emits `if c > 0 { if c > 1 {B} {G} } {R}` — per-channel subtrees.
 * Channel order in JXL modular RGB is 0=R, 1=G, 2=B.
 */
export const perChannel = (r: string, g: string, b: string) =>
  `if c > 0\n if c > 1\n ${b}\n ${g}\n ${r}`;

/** Deterministic PRNG so seeds reproduce the same art. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rnd: () => number, lo: number, hi: number) =>
  lo + Math.floor(rnd() * (hi - lo + 1));

export const pick = <T>(rnd: () => number, arr: T[]): T =>
  arr[Math.floor(rnd() * arr.length)];

export const randHex = (rnd: () => number) =>
  "#" +
  [0, 0, 0]
    .map(() => randInt(rnd, 0, 255).toString(16).padStart(2, "0"))
    .join("");

// ---------------------------------------------------------------------------
// Cellular automaton (elementary CA over {bg, fg} values, validated in tools/batch2.mjs)
// ---------------------------------------------------------------------------

function caStepTree(rule: number, fg: number, bg: number): string {
  const leaf = (i: number) => `- Set ${(rule >> i) & 1 ? fg : bg}`;
  const d = fg - bg; // always > 0 here
  // Neighborhood is reconstructed from N, NW-N and N-NE since plain NW/NE
  // are not available as decision properties. idx = nw<<2 | n<<1 | ne.
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

/** Full per-channel CA tree: seed row 0 with a single center pixel, then run `rule`. */
export function caChannelTree(
  rule: number,
  fg: number,
  bg: number,
  width: number,
): string {
  const cx = Math.floor(width / 2);
  const seed = `if x > ${cx}
 - Set ${bg}
 if x > ${cx - 1}
  - Set ${fg}
  - Set ${bg}`;
  let step: string;
  if (fg === bg) {
    step = `- Set ${bg}`;
  } else if (fg > bg) {
    step = caStepTree(rule, fg, bg);
  } else {
    // fg < bg: swap colors and complement the rule (bit'_i = 1 - bit_(7-i))
    let crule = 0;
    for (let i = 0; i < 8; i++) {
      if (!((rule >> (7 - i)) & 1)) crule |= 1 << i;
    }
    step = caStepTree(crule, bg, fg);
  }
  return `if y > 0\n ${step}\n ${seed}`;
}

// ---------------------------------------------------------------------------
// Splines (coefficients calibrated in tools/batch3.mjs)
// ---------------------------------------------------------------------------

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/**
 * A Spline block. DCs are per-channel DC coefficients in sample units,
 * sigmaDC controls thickness (half-width ≈ 5.3 × sigmaDC).
 */
export function splineBlock(
  dcs: [number, number, number],
  sigmaDC: number,
  points: [number, number][],
): string {
  const coeffs = (dc: number) => `${fmt(dc)} ${Array(31).fill(0).join(" ")}`;
  return `Spline
${coeffs(dcs[0])}
${coeffs(dcs[1])}
${coeffs(dcs[2])}
${coeffs(sigmaDC)}
${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("\n")}
EndSpline`;
}

/**
 * Spline for a stroke of roughly `width` px in `color` over background `bg`.
 * kind "dot" makes a soft blob at points[0] (peak ≈ 80·DC/sigma, measured);
 * kind "line" makes a stroke through the points (saturating DC ≈ 10/sigma).
 * `scale` is 1 for Bitdepth 8, 257 for Bitdepth 16.
 */
export function strokeSpline(
  kind: "line" | "dot",
  color: RGB,
  bg: RGB,
  width: number,
  intensityPct: number,
  points: [number, number][],
  scale = 1,
): string {
  const sigmaDC = Math.max(0.4, width / 5.3);
  const intensity = intensityPct / 100;
  const dcs = color.map((c, i) => {
    const delta = (c - bg[i]) / 255; // -1..1
    const base = kind === "dot" ? (255 * sigmaDC) / 80 : 10 / sigmaDC;
    return delta * base * intensity * scale;
  }) as [number, number, number];
  // Control points are quantized to integers in the bitstream; consecutive
  // points that round to the same spot corrupt the file. Round and dedupe.
  let pts: [number, number][] = [];
  for (const [px, py] of points) {
    const x = Math.round(px);
    const y = Math.round(py);
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y) pts.push([x, y]);
  }
  if (kind === "dot" || pts.length < 2) {
    const [x, y] = pts[0];
    pts = [
      [x, y],
      [x + 1, y],
    ];
  }
  return splineBlock(dcs, sigmaDC, pts);
}
