// The game's colours, shared by the big screen and the phone page (so it imports nothing).

/** Twelve vivid colours that read on dark and light, one per player in join order. */
export const PLAYER_COLORS = ["#ff5a5f", "#2f80ed", "#f5a524", "#27ae60", "#9b51e0", "#00b8d9", "#ff7ab6", "#f2994a", "#2dd4bf", "#e5484d", "#6d5dfc", "#84cc16"];

export const playerColor = (n: number) => PLAYER_COLORS[((n % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;

/** Answer tiles: a colour and a shape each, so they read for colour-blind players too. */
export const CHOICE_STYLES: Array<{ color: string; shape: "triangle" | "diamond" | "circle" | "square" | "star" | "hexagon" }> = [
  { color: "#e21b3c", shape: "triangle" },
  { color: "#1368ce", shape: "diamond" },
  { color: "#d89e00", shape: "circle" },
  { color: "#26890c", shape: "square" },
  { color: "#864cbf", shape: "star" },
  { color: "#0aa3a3", shape: "hexagon" },
];
