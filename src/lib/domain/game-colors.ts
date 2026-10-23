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

/** Each answer shape as an SVG path on a 24-unit square, drawn the same on the desk and the big screen. */
export const CHOICE_PATHS: Record<(typeof CHOICE_STYLES)[number]["shape"], string> = {
  triangle: "M12 3 22 20H2Z",
  diamond: "M12 2 22 12 12 22 2 12Z",
  circle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  square: "M3 3h18v18H3Z",
  star: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6Z",
  hexagon: "M7 3h10l5 9-5 9H7l-5-9Z",
};

/** Team mode: up to four teams, each a colour and a name (the name is translated where it is shown). */
export const TEAMS = [
  { name: "Red", color: "#e21b3c" },
  { name: "Blue", color: "#1368ce" },
  { name: "Gold", color: "#d89e00" },
  { name: "Green", color: "#26890c" },
] as const;

export const MOST_TEAMS = TEAMS.length;
