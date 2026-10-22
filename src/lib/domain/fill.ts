// How a shape, an icon or a page is painted: one colour, or a gradient of several colours (straight
// or round). Stored as a small JSON string in a layer's payload or on a page, and drawn as plain CSS,
// which the screen paints once and then costs nothing (only moving or fading layers animates).

export type GradientStop = { color: string; at: number };

export type Fill =
  | { kind: "solid"; color: string }
  /** A straight gradient at an angle (0 = bottom to top, 90 = left to right, as CSS). */
  | { kind: "linear"; angle: number; stops: GradientStop[] }
  /** A round gradient from a centre (x, y in % of the box; a little outside it is allowed). */
  | { kind: "radial"; x: number; y: number; stops: GradientStop[] };

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** More stops than this adds nothing a person can see, and keeps each fill small. */
export const MOST_STOPS = 6;

const clamp = (value: unknown, low: number, high: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
};

function cleanStops(value: unknown): GradientStop[] {
  const stops = (Array.isArray(value) ? value : [])
    .filter((stop): stop is { color: string; at: unknown } => !!stop && typeof stop === "object" && HEX.test(String((stop as { color?: unknown }).color)))
    .slice(0, MOST_STOPS)
    .map((stop) => ({ color: stop.color.toLowerCase(), at: Math.round(clamp(stop.at, 0, 100, 0)) }))
    .sort((a, b) => a.at - b.at);
  return stops.length >= 2 ? stops : [];
}

/** A fill from anything stored (a JSON string, an object, or an old plain colour), else the fallback. */
export function sanitizeFill(value: unknown, fallback: Fill = { kind: "solid", color: "#ffffff" }): Fill {
  let input = value;
  if (typeof input === "string") {
    if (HEX.test(input)) return { kind: "solid", color: input.toLowerCase() };
    try {
      input = JSON.parse(input);
    } catch {
      return fallback;
    }
  }
  if (!input || typeof input !== "object") return fallback;
  const fill = input as Record<string, unknown>;
  if (fill.kind === "solid") return HEX.test(String(fill.color)) ? { kind: "solid", color: String(fill.color).toLowerCase() } : fallback;
  const stops = cleanStops(fill.stops);
  if (!stops.length) return fallback;
  if (fill.kind === "linear") return { kind: "linear", angle: Math.round(clamp(fill.angle, 0, 360, 180)), stops };
  // A centre a little outside the box is allowed: a glow rising from below the screen.
  if (fill.kind === "radial") return { kind: "radial", x: Math.round(clamp(fill.x, -50, 150, 50)), y: Math.round(clamp(fill.y, -50, 150, 50)), stops };
  return fallback;
}

export const encodeFill = (fill: Fill): string => (fill.kind === "solid" ? fill.color : JSON.stringify(fill));

/** The CSS that paints it. */
export function fillCss(fill: Fill): string {
  if (fill.kind === "solid") return fill.color;
  const stops = fill.stops.map((stop) => `${stop.color} ${stop.at}%`).join(", ");
  return fill.kind === "linear" ? `linear-gradient(${fill.angle}deg, ${stops})` : `radial-gradient(circle at ${fill.x}% ${fill.y}%, ${stops})`;
}

/** The colour a fill mostly reads as (for text on it, swatches and the one-colour inputs). */
export function mainColor(fill: Fill): string {
  return fill.kind === "solid" ? fill.color : fill.stops[0]!.color;
}

/** A stop added where the person clicked, coloured as the gradient already is there. */
export function addStop(stops: GradientStop[], at: number): GradientStop[] {
  if (stops.length >= MOST_STOPS) return stops;
  const before = [...stops].reverse().find((stop) => stop.at <= at) ?? stops[0]!;
  return [...stops, { color: before.color, at: Math.round(clamp(at, 0, 100, 50)) }].sort((a, b) => a.at - b.at);
}

/**
 * Ready-made gradients: calm ones for worship words, warm ones for welcomes, deep ones behind
 * lower thirds. Each reads well with white text.
 */
export const GRADIENT_PRESETS: Array<{ id: string; name: string; fill: Fill }> = [
  { id: "dawn", name: "Dawn", fill: { kind: "linear", angle: 165, stops: [{ color: "#1a0d0a", at: 0 }, { color: "#5c2a16", at: 46 }, { color: "#e8b48a", at: 100 }] } },
  { id: "sea", name: "Sea", fill: { kind: "linear", angle: 180, stops: [{ color: "#021018", at: 0 }, { color: "#0b3a58", at: 52 }, { color: "#147a86", at: 100 }] } },
  { id: "ember", name: "Ember", fill: { kind: "radial", x: 50, y: 110, stops: [{ color: "#c4511a", at: 0 }, { color: "#3a120c", at: 45 }, { color: "#0a0605", at: 100 }] } },
  { id: "royal", name: "Royal", fill: { kind: "linear", angle: 135, stops: [{ color: "#1b0b3a", at: 0 }, { color: "#4b1e8c", at: 55 }, { color: "#b9852b", at: 100 }] } },
  { id: "olive", name: "Olive grove", fill: { kind: "linear", angle: 160, stops: [{ color: "#10170c", at: 0 }, { color: "#2f4220", at: 60 }, { color: "#8a9a5b", at: 100 }] } },
  { id: "dusk", name: "Dusk", fill: { kind: "linear", angle: 200, stops: [{ color: "#0d1030", at: 0 }, { color: "#3c1f5e", at: 50 }, { color: "#d4627a", at: 100 }] } },
  { id: "jordan", name: "Jordan", fill: { kind: "linear", angle: 120, stops: [{ color: "#062b2b", at: 0 }, { color: "#0f6e6a", at: 55 }, { color: "#7fd1c0", at: 100 }] } },
  { id: "glory", name: "Glory", fill: { kind: "radial", x: 50, y: 30, stops: [{ color: "#fff2c9", at: 0 }, { color: "#e0a63a", at: 35 }, { color: "#3b1f05", at: 100 }] } },
  { id: "stone", name: "Stone", fill: { kind: "linear", angle: 180, stops: [{ color: "#1c1c1f", at: 0 }, { color: "#3a3a40", at: 100 }] } },
  { id: "advent", name: "Advent", fill: { kind: "linear", angle: 150, stops: [{ color: "#120a24", at: 0 }, { color: "#3d1d63", at: 60 }, { color: "#6e3aa8", at: 100 }] } },
  { id: "pentecost", name: "Pentecost", fill: { kind: "radial", x: 50, y: 100, stops: [{ color: "#ffb03a", at: 0 }, { color: "#d43c1c", at: 40 }, { color: "#2a0705", at: 100 }] } },
  { id: "bar", name: "Lower-third bar", fill: { kind: "linear", angle: 90, stops: [{ color: "#0f1b3d", at: 0 }, { color: "#1f3f8a", at: 70 }, { color: "#1f3f8a00", at: 100 }] } },
];
