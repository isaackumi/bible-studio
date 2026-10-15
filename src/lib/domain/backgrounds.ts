import type { ThemeBackground } from "./types";

export type DisplayWash = {
  id: string;
  name: string;
  swatch: string;
  background: string;
  light: boolean;
  motion?: "drift" | "glow";
};

/** Original fills for the audience screen. They sit behind the verse. */
export const DISPLAY_WASHES: DisplayWash[] = [
  { id: "night", name: "Night", swatch: "#050505", background: "#050505", light: false },
  { id: "dawn", name: "Dawn", swatch: "#c4784a", background: "linear-gradient(165deg, #1a0d0a 0%, #5c2a16 46%, #e8b48a 100%)", light: false, motion: "drift" },
  { id: "sea", name: "Sea", swatch: "#0c4a6e", background: "linear-gradient(180deg, #021018 0%, #0b3a58 52%, #147a86 100%)", light: false, motion: "drift" },
  { id: "ember", name: "Ember", swatch: "#9a3412", background: "radial-gradient(120% 90% at 50% 110%, #c4511a 0%, #3a120c 42%, #0a0605 100%)", light: false, motion: "glow" },
  { id: "garden", name: "Garden", swatch: "#166534", background: "linear-gradient(165deg, #06140e 0%, #143d2a 55%, #3d7a4e 100%)", light: false },
  { id: "dusk", name: "Dusk", swatch: "#312e81", background: "linear-gradient(180deg, #0c0a14 0%, #24183c 58%, #4a2c28 100%)", light: false },
  { id: "glass", name: "Glass", swatch: "#4c1d95", background: "linear-gradient(135deg, #140c22 0%, #2a1848 38%, #12324a 72%, #3a2214 100%)", light: false },
  { id: "linen", name: "Linen", swatch: "#efe6d6", background: "linear-gradient(180deg, #f7f1e6 0%, #e4d2b8 100%)", light: true },
];

export function displayWash(id: string): DisplayWash | null {
  return DISPLAY_WASHES.find((wash) => wash.id === id) ?? null;
}

export function backgroundFill(background: ThemeBackground): string {
  if (background.type === "color") return background.color;
  if (background.type === "wash") return displayWash(background.washId)?.background ?? "#050505";
  return "#050505";
}
