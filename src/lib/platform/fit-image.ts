// Pictures are made the right size when they come in, not when they are shown: a 6000-pixel photo
// takes 144 MB of memory once decoded, in every window that shows it (audience, stage, each extra
// screen). Anything longer than a 4K screen is scaled down to it; photos become a high-quality JPEG
// and pictures with see-through parts stay PNG. Animated GIFs are kept as they are.
//
// An SVG (a logo) is drawn once into a sharp PNG. It is drawn as a plain picture, which cannot run
// scripts or load anything, so a logo file from anywhere is safe to bring in.

/** Long enough for a 4K screen edge to edge; longer only costs memory. */
export const LONGEST_EDGE = 3840;
/** An SVG becomes a picture this long on its longer side: sharp on any screen. */
export const SVG_EDGE = 2048;
const JPEG_QUALITY = 0.9;

export const isSvg = (blob: Blob, name = "") => blob.type === "image/svg+xml" || /\.svg$/i.test(name);

type Picture = { width: number; height: number; draw: (context: CanvasRenderingContext2D, width: number, height: number) => void; close: () => void };

/** The new size: the same shape, the longer side at most `longest`. */
export function fitted(width: number, height: number, longest: number): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function open(blob: Blob, svg: boolean): Promise<Picture> {
  if (!svg && typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height), close: () => bitmap.close() };
  }
  // SVG (and older engines): through an <img>, which never runs a picture's scripts.
  const url = URL.createObjectURL(svg ? new Blob([await blob.text()], { type: "image/svg+xml" }) : blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    // An SVG without its own size is drawn square.
    const width = image.naturalWidth || SVG_EDGE;
    const height = image.naturalHeight || SVG_EDGE;
    return { width, height, draw: (context, w, h) => context.drawImage(image, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function seeThrough(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! < 255) return true;
  return false;
}

/**
 * The picture to keep: the same blob when it is already a good size (or animated), else a smaller
 * one. Returns the new name too (an SVG or a resized photo changes its extension).
 */
export async function fitImage(blob: Blob, name: string): Promise<{ blob: Blob; name: string; resized: boolean }> {
  const svg = isSvg(blob, name);
  if (!svg && (blob.type === "image/gif" || /\.gif$/i.test(name))) return { blob, name, resized: false };
  if (typeof document === "undefined") return { blob, name, resized: false };
  const picture = await open(blob, svg);
  try {
    const longest = svg ? SVG_EDGE : LONGEST_EDGE;
    const size = svg ? fitted(picture.width * 64, picture.height * 64, longest) : fitted(picture.width, picture.height, longest);
    if (!svg && size.width === picture.width && size.height === picture.height) return { blob, name, resized: false };
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { blob, name, resized: false };
    context.imageSmoothingQuality = "high";
    picture.draw(context, size.width, size.height);
    const png = svg || seeThrough(context, size.width, size.height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", png ? undefined : JPEG_QUALITY));
    if (!out) return { blob, name, resized: false };
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    return { blob: out, name: `${base}.${png ? "png" : "jpg"}`, resized: true };
  } finally {
    picture.close();
  }
}
