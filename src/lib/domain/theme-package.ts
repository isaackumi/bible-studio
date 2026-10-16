import { defaultTheme, sanitizeTheme } from "./theme";
import type { Theme } from "./types";

/**
 * A shareable theme file: data only (no scripts), optionally carrying its background picture.
 * Importing never replaces an existing theme: it always gets a new id.
 */
export const THEME_PACKAGE_FORMAT = "church-studio-theme";
export const THEME_PACKAGE_VERSION = 1;
/** Embedded background pictures above this size are refused (base64 inflates ~33%). */
export const MAX_THEME_BACKGROUND_BYTES = 15 * 1024 * 1024;

export type ThemePackage = {
  format: typeof THEME_PACKAGE_FORMAT;
  version: number;
  exportedAt: string;
  theme: Omit<Theme, "id">;
  background?: { name: string; dataUrl: string };
};

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function exportThemePackage(theme: Theme, background?: { name: string; dataUrl: string } | null, now = new Date()): ThemePackage {
  const { id: _id, ...rest } = sanitizeTheme(theme);
  return {
    format: THEME_PACKAGE_FORMAT,
    version: THEME_PACKAGE_VERSION,
    exportedAt: now.toISOString(),
    theme: rest,
    ...(background && IMAGE_DATA_URL.test(background.dataUrl) ? { background } : {}),
  };
}

export function themePackageFileName(theme: Pick<Theme, "name">): string {
  const slug = theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
  return `${slug}.cstheme.json`;
}

/** Validate a theme file. Unknown fields are dropped; bad colors fall back to the default theme. */
export function readThemePackage(
  raw: unknown,
  newId: () => string = () => `theme:${crypto.randomUUID()}`,
): { theme: Theme; background: { name: string; dataUrl: string } | null } {
  if (!raw || typeof raw !== "object") throw new Error("That file is not a Church Studio theme.");
  const record = raw as Partial<ThemePackage>;
  if (record.format !== THEME_PACKAGE_FORMAT) throw new Error("That file is not a Church Studio theme.");
  if (typeof record.version !== "number" || record.version > THEME_PACKAGE_VERSION) {
    throw new Error("This theme was made by a newer Church Studio. Update, then import it again.");
  }
  const input = (record.theme ?? {}) as Partial<Theme>;
  const base = defaultTheme();
  const color = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value) ? value : fallback);
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  let background = input.background ?? base.background;
  const picture = record.background && typeof record.background.dataUrl === "string" ? record.background : null;
  if (picture && !IMAGE_DATA_URL.test(picture.dataUrl)) throw new Error("The theme's background picture is not a supported image.");
  if (picture && (picture.dataUrl.length * 3) / 4 > MAX_THEME_BACKGROUND_BYTES) throw new Error("The theme's background picture is too large.");
  // A picture background is re-linked to the imported file; without one it falls back to the default.
  if (background.type === "image" && !picture) background = base.background;
  // Known fields only: anything else in the file is ignored.
  const theme = sanitizeTheme({
    ...base,
    layout: input.layout === "lower-third" ? "lower-third" : "frame",
    transition: input.transition ?? base.transition,
    ...(input.effects ? { effects: input.effects } : {}),
    id: newId(),
    name: (typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Imported theme").slice(0, 60),
    background,
    fontFamily: typeof input.fontFamily === "string" && input.fontFamily.trim() ? input.fontFamily.slice(0, 120) : base.fontFamily,
    fontSize: number(input.fontSize, base.fontSize, 16, 220),
    color: color(input.color, base.color),
    margin: number(input.margin, base.margin, 0, 400),
    align: input.align === "left" || input.align === "right" ? input.align : "center",
    vertical: input.vertical === "top" || input.vertical === "bottom" ? input.vertical : "middle",
    reference: {
      show: input.reference?.show !== false,
      size: number(input.reference?.size, base.reference.size, 8, 160),
      color: color(input.reference?.color, base.reference.color),
    },
    attribution: {
      show: input.attribution?.show !== false,
      size: number(input.attribution?.size, base.attribution.size, 8, 160),
      color: color(input.attribution?.color, base.attribution.color),
    },
  });
  return { theme, background: picture ? { name: String(picture.name || "background").slice(0, 80), dataUrl: picture.dataUrl } : null };
}

/** data: URL → Blob for importing the background into the media library. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/png";
  const binary = atob(body ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}
