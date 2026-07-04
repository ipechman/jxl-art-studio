/**
 * The preview stage: paints decoded ImageData, handles zoom and (when a
 * drawing recipe is active) pointer input for strokes.
 */
export type DrawListener = (
  phase: "start" | "move" | "end",
  x: number,
  y: number,
) => void;

export class Preview {
  private canvas: HTMLCanvasElement;
  private wrap: HTMLElement;
  private dimsLabel: HTMLElement;
  private zoom: number | "fit" = "fit";
  private imgW = 0;
  private imgH = 0;
  drawMode = false;
  onDraw: DrawListener | null = null;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, dimsLabel: HTMLElement) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.dimsLabel = dimsLabel;

    let drawing = false;
    const toImage = (ev: PointerEvent): [number, number] => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * this.imgW;
      const y = ((ev.clientY - rect.top) / rect.height) * this.imgH;
      return [Math.max(0, Math.min(this.imgW, x)), Math.max(0, Math.min(this.imgH, y))];
    };
    canvas.addEventListener("pointerdown", (ev) => {
      if (!this.drawMode || !this.onDraw) return;
      drawing = true;
      canvas.setPointerCapture(ev.pointerId);
      const [x, y] = toImage(ev);
      this.onDraw("start", x, y);
      ev.preventDefault();
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!drawing || !this.onDraw) return;
      const [x, y] = toImage(ev);
      this.onDraw("move", x, y);
    });
    const finish = (ev: PointerEvent) => {
      if (!drawing || !this.onDraw) return;
      drawing = false;
      const [x, y] = toImage(ev);
      this.onDraw("end", x, y);
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
  }

  paint(img: ImageData) {
    this.imgW = img.width;
    this.imgH = img.height;
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.canvas.getContext("2d")!.putImageData(img, 0, 0);
    this.dimsLabel.textContent = `${img.width} × ${img.height}`;
    this.applyZoom();
  }

  setZoom(z: number | "fit") {
    this.zoom = z;
    this.applyZoom();
  }

  setDrawCursor(on: boolean) {
    this.canvas.classList.toggle("drawing", on);
  }

  private applyZoom() {
    if (!this.imgW) return;
    if (this.zoom === "fit") {
      const pad = 32;
      const maxW = this.wrap.clientWidth - pad;
      const maxH = this.wrap.clientHeight - pad;
      const scale = Math.min(maxW / this.imgW, maxH / this.imgH);
      this.canvas.style.width = `${Math.max(64, Math.floor(this.imgW * scale))}px`;
    } else {
      this.canvas.style.width = `${this.imgW * this.zoom}px`;
    }
  }
}
