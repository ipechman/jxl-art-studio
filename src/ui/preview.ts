/**
 * The preview stage: paints decoded ImageData, handles zoom and (when a
 * drawing recipe is active) pointer input for strokes.
 */
export type DrawListener = (
  phase: "start" | "move" | "end",
  x: number,
  y: number,
) => void;

export interface OverlayStroke {
  kind: "line" | "dot";
  color: string;
  width: number;
  points: [number, number][];
}

export class Preview {
  private canvas: HTMLCanvasElement;
  private wrap: HTMLElement;
  private dimsLabel: HTMLElement;
  private zoom: number | "fit" = "fit";
  private imgW = 0;
  private imgH = 0;
  private lastImage: ImageData | null = null;
  private overlay: OverlayStroke | null = null;
  private clearOverlayOnNextPaint = false;
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
    this.lastImage = img;
    if (this.clearOverlayOnNextPaint) {
      // the real spline render has arrived; drop the live approximation
      this.overlay = null;
      this.clearOverlayOnNextPaint = false;
    }
    this.redraw();
    this.dimsLabel.textContent = `${img.width} × ${img.height}`;
    this.applyZoom();
  }

  /**
   * Instant feedback while drawing: an approximate stroke drawn straight on
   * the canvas, replaced by the real spline once the encoder catches up.
   */
  setOverlay(stroke: OverlayStroke | null) {
    this.overlay = stroke;
    this.clearOverlayOnNextPaint = false;
    this.redraw();
  }

  /** Keep the overlay visible until the next decoded frame lands. */
  fadeOverlayOnNextPaint() {
    this.clearOverlayOnNextPaint = true;
  }

  private redraw() {
    if (!this.lastImage) return;
    const ctx = this.canvas.getContext("2d")!;
    ctx.putImageData(this.lastImage, 0, 0);
    const o = this.overlay;
    if (!o || o.points.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (o.kind === "dot" || o.points.length === 1) {
      const [x, y] = o.points[o.points.length - 1];
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, o.width / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1.5, o.width);
      ctx.beginPath();
      ctx.moveTo(o.points[0][0], o.points[0][1]);
      for (const [x, y] of o.points.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
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
