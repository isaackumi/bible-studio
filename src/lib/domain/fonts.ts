/** Faces already loaded by the app. The audience screen uses one of these. */
export const SCREEN_FONTS = [
  { id: "instrument-serif", name: "Instrument Serif", family: '"Instrument Serif", Georgia, serif' },
  { id: "instrument-sans", name: "Instrument Sans", family: '"Instrument Sans", sans-serif' },
  { id: "inter", name: "Inter", family: '"Inter Variable", Inter, sans-serif' },
  { id: "figtree", name: "Figtree", family: '"Figtree Variable", Figtree, sans-serif' },
] as const;

export type ScreenFontId = (typeof SCREEN_FONTS)[number]["id"];

export function screenFont(family: string) {
  return SCREEN_FONTS.find((font) => font.family === family) ?? null;
}
