/** The "Starters" strip: preset cards with live-rendered thumbnails. */
import type { Preset } from "../presets.ts";
import { recipeById } from "../recipes/index.ts";
import { generateMix } from "../mixer.ts";
import { encodeTree, decodeJxl } from "../jxl-client.ts";

export function initGallery(
  container: HTMLElement,
  presets: Preset[],
  onPick: (preset: Preset) => void,
) {
  const cards: { preset: Preset; canvas: HTMLCanvasElement; size: HTMLElement }[] = [];
  for (const preset of presets) {
    const card = document.createElement("button");
    card.className = "gallery-card";
    card.type = "button";
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 90;
    const label = document.createElement("span");
    label.className = "gallery-name";
    label.textContent = preset.name;
    const size = document.createElement("span");
    size.className = "gallery-size";
    size.textContent = "…";
    card.append(canvas, label, size);
    card.addEventListener("click", () => onPick(preset));
    container.appendChild(card);
    cards.push({ preset, canvas, size });
  }

  // Render thumbnails sequentially so the main preview keeps priority.
  (async () => {
    for (const { preset, canvas, size } of cards) {
      try {
        const code =
          preset.mode === "code"
            ? preset.code!
            : preset.mode === "mix"
              ? generateMix(preset.layers!)
              : recipeById(preset.recipeId!)!.generate(
                  preset.values!,
                  preset.strokes ?? [],
                );
        const bytes = await encodeTree(code);
        const img = await decodeJxl(bytes);
        const off = new OffscreenCanvas(img.width, img.height);
        off.getContext("2d")!.putImageData(img, 0, 0);
        const ctx = canvas.getContext("2d")!;
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.drawImage(off, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        size.textContent = `${bytes.length} B`;
      } catch {
        size.textContent = "?";
      }
    }
  })();
}
