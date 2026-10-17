import type { MotionId, PresentationModel, ThemeBackground } from "./types";

/** Animated scenes, drawn in CSS by MotionBackground. Each takes a tint over a base color. */
export const MOTIONS: { id: MotionId; name: string; tint: string; base: string }[] = [
  { id: "aurora", name: "Aurora", tint: "#3ee6b4", base: "#04121a" },
  { id: "rays", name: "Light rays", tint: "#ffd89a", base: "#120c06" },
  { id: "bokeh", name: "Bokeh", tint: "#b98cff", base: "#0c0716" },
  { id: "waves", name: "Waves", tint: "#3aa0ff", base: "#02101f" },
  { id: "stars", name: "Starfield", tint: "#e8f0ff", base: "#03050c" },
  { id: "embers", name: "Embers", tint: "#ff8a3d", base: "#0d0504" },
  { id: "clouds", name: "Clouds", tint: "#ffffff", base: "#5d7fa8" },
];

export function motionById(id: string): (typeof MOTIONS)[number] | null {
  return MOTIONS.find((motion) => motion.id === id) ?? null;
}

export function gradientCss(from: string, to: string, angle: number): string {
  return `linear-gradient(${Math.round(angle)}deg, ${from} 0%, ${to} 100%)`;
}

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
  if (background.type === "gradient") return gradientCss(background.from, background.to, background.angle);
  if (background.type === "motion") return background.base;
  if (background.type === "wash") return displayWash(background.washId)?.background ?? "#050505";
  return "#050505";
}

/**
 * CSS background for a painted frame. The audience page also paints it behind the 16:9 frame,
 * so a 16:10 or 4:3 display shows the theme in the margins instead of black bars.
 */
export function frameBackground(model: PresentationModel, nested = false): string {
  if (model.layout === "black") return "#000000";
  if (nested && (model.layout === "lower-third" || model.layout === "timer" || model.layout === "empty")) return "transparent";
  if (model.fill) return model.fill;
  if (model.backgroundImageUrl) return `center / cover no-repeat url("${model.backgroundImageUrl}")`;
  const theme = model.theme.background;
  if (theme.type === "gradient") return gradientCss(theme.from, theme.to, theme.angle);
  if (theme.type === "motion" || theme.type === "video") return theme.type === "motion" ? theme.base : "#000000";
  const wash = model.theme.background.type === "wash" ? displayWash(model.theme.background.washId) : null;
  if (wash) return wash.background;
  if (model.theme.background.type === "color") return model.theme.background.color;
  return nested ? "transparent" : "#050505";
}
