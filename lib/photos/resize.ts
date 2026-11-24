// Browser only (OffscreenCanvas): the upload pipeline and the selfie search scale images the same way.

export type Source = { width: number; height: number };

function context(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

// Halves first: one large-ratio drawImage aliases in browsers that ignore imageSmoothingQuality.
export function resize(
  source: CanvasImageSource & Source,
  width: number,
  height: number,
  background?: string,
) {
  let current: CanvasImageSource & Source = source;
  while (current.width / 2 >= width && current.height / 2 >= height) {
    const half = new OffscreenCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    context(half).drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const out = new OffscreenCanvas(width, height);
  const ctx = context(out);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(current, 0, 0, width, height);
  return out;
}

function scaled({ width, height }: Source, scale: number): Source {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Never upscales.
export function fit(source: Source, longEdge: number): Source {
  return scaled(source, Math.min(1, longEdge / Math.max(source.width, source.height)));
}

// Never upscales.
export function fitShort(source: Source, shortEdge: number): Source {
  return scaled(source, Math.min(1, shortEdge / Math.min(source.width, source.height)));
}
