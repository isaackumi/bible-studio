import reversed from "./church-studio-symbol.svg?raw";
import ink from "./church-studio-symbol-dark.svg?raw";

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * The Church Studio mark (reversed, for a dark screen) as a data URL, so it shows the same in the
 * audience window, the stream page, NDI and a phone remote, with no file to serve.
 */
export const DEFAULT_LOGO_URL = dataUrl(reversed);

/** The mark in ink, for a theme with dark words on a light screen. */
export const DEFAULT_LOGO_INK_URL = dataUrl(ink);

/** Dark text (#rgb or #rrggbb) means a light screen. */
export function darkText(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return false;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.5;
}
