# JXL Art Studio

A web app for creating **JXL art** — real JPEG XL images, almost always under
1 kilobyte, generated entirely by the codec's prediction machinery. Inspired by
the [JXL Art Gallery](https://jpegxl.info/art/), where the average artwork is
just 42 bytes.

Everything runs in the browser: the tree program is compiled to a genuine
`.jxl` file by a WASM build of libjxl's `jxl_from_tree` tool, then decoded back
to pixels for preview — so it works in every browser, including ones without
native JPEG XL support.

## For people who don't code

The **Easy studio** tab offers recipes with sliders and color pickers:

| Recipe | What it makes |
| --- | --- |
| 🌅 Sunset & Sun | smooth sky gradient + a glowing spline sun |
| 🌈 Smooth Gradient | two-color blends (uses a 16-bit-depth trick for banding-free ramps) |
| ✏️ Doodle | draw on the picture; strokes become real JPEG XL splines |
| 🔺 Triangle Fractals | elementary cellular automata (rule 0–255), two colors |
| 📐 Diagonal Stripes | wrapping value ramps under different color transforms |
| ⚡ Glitch Plasma | the self-correcting Weighted predictor fighting a rogue seed row |
| 🧵 Fractal Weave | prediction-error feedback patterns |
| 🧶 Patchwork Quilt | independent per-group patterns (`g` property, GroupShift 0) |

Plus: starter gallery, "Surprise me" randomizer, byte meter with the 1 KB art
budget, `.jxl` / PNG download, and share links (the code travels compressed in
the URL hash, same `zcode` scheme as the community editors).

The **Mix** tab stacks starters on top of each other — sun + fractals, glitch
under stripes, up to four layers. Each layer is a real JPEG XL frame
(`NotLast`) blended with `kAdd` or `kMul` onto a shared 16-bit canvas; 8-bit
recipes scale their constants ×257 to match. Two codec-level constraints
apply: splines only render on the first frame (so sun/doodle presets are
base-only), and the quilt's `GroupShift` is file-global (so it can't be mixed).

The **Code** tab shows the real tree program behind every picture and lets you
edit it live, with a cheat sheet of the syntax. That's the bridge from playing
with sliders to writing tree code by hand.

## Development

```
npm install
npm run dev      # dev server
npm run build    # type-check + production build to dist/
```

No server-side components; `dist/` is a static site.

### Repository layout

- `src/recipes/` — the recipe engine: each recipe turns friendly parameters
  into `jxl_from_tree` source code. Calibration constants (spline brightness,
  group numbering, CA property tricks) were measured against the real encoder
  with the scripts in `tools/`.
- `src/jxl/` — vendored WASM encoder/decoder from
  [surma/jxl-art](https://github.com/surma/jxl-art) (Apache-2.0), built from
  libjxl v0.10.0. `jxl_from_tree(code) → bytes`, `decode(bytes) → ImageData`.
- `src/worker.ts` — Web Worker hosting the WASM module.
- `tools/` — Node harness (`render.mjs`, `validate.mjs`, `rct-probe.mjs`) that
  runs the same WASM outside the browser for testing recipes and rendering
  PNGs.

### Validating recipes

```
node tools/validate.mjs out-dir    # renders every recipe + preset, checks sizes
node tools/render.mjs file.tree out.png
```

## Credits

- [JPEG XL](https://jpeg.org/jpegxl/) and
  [libjxl](https://github.com/libjxl/libjxl)'s `jxl_from_tree` (Apache-2.0)
- WASM build from [surma/jxl-art](https://github.com/surma/jxl-art)
  (Apache-2.0) — see `src/jxl/LICENSE.jxl-art`
- The [JXL Art Gallery](https://jpegxl.info/art/) and the artists of
  `#jxl-art` on the [JPEG XL Discord](https://discord.gg/DqkQgDRTFu),
  especially Jon Sneyers, whose techniques these recipes reimplement
