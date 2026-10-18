// The shape of the audience screen. Churches project onto 16:9 TVs, 16:10 and 4:3 projectors,
// ultra-wide LED walls and portrait screens; the picture fills whichever one is plugged in, and
// every monitor on the desk shows that same shape so Preview never lies.
//
// The frame is painted on a canvas 1080 pixels on its short side (1920×1080 for 16:9, 1440×1080
// for 4:3, 1080×1920 for portrait), so words keep the same size relative to the screen.

import { msg } from "../i18n/core";

export type ScreenShape = "auto" | "16:9" | "16:10" | "4:3" | "21:9" | "9:16";

export const SCREEN_SHAPES: Array<{ id: ScreenShape; label: string; detail: string }> = [
  { id: "auto", label: msg("Match the screen"), detail: msg("Fills whatever screen the output is on") },
  { id: "16:9", label: "16:9", detail: msg("TVs and most projectors") },
  { id: "16:10", label: "16:10", detail: msg("WUXGA projectors (1920×1200)") },
  { id: "4:3", label: "4:3", detail: msg("Older projectors") },
  { id: "21:9", label: "21:9", detail: msg("Ultra-wide and LED walls") },
  { id: "9:16", label: "9:16", detail: msg("Portrait screens") },
];

export const WIDE = 16 / 9;
/** Where a browser audience window leaves its measured shape for the desk (desktop uses an event). */
export const AUDIENCE_ASPECT_KEY = "church-studio:audience-aspect";
const SHORT_SIDE = 1080;

const FIXED: Record<Exclude<ScreenShape, "auto">, number> = {
  "16:9": 16 / 9,
  "16:10": 16 / 10,
  "4:3": 4 / 3,
  "21:9": 21 / 9,
  "9:16": 9 / 16,
};

export function sanitizeScreenShape(value: unknown): ScreenShape {
  return typeof value === "string" && (value === "auto" || value in FIXED) ? (value as ScreenShape) : "auto";
}

/** Keep a measured shape sensible (a window caught mid-resize can be any size). */
export function cleanAspect(value: unknown): number {
  const aspect = Number(value);
  if (!Number.isFinite(aspect) || aspect <= 0) return WIDE;
  return Math.min(3.6, Math.max(0.4, Math.round(aspect * 10000) / 10000));
}

/** The aspect to paint: a chosen shape, or what the screen measured (16:9 until it reports). */
export function aspectFor(shape: ScreenShape, measured: number | null): number {
  if (shape !== "auto") return FIXED[shape];
  return measured ? cleanAspect(measured) : WIDE;
}

/** The canvas in frame pixels: 1080 on the short side. */
export function canvasFor(aspect: number): { width: number; height: number } {
  const clean = cleanAspect(aspect);
  return clean >= 1
    ? { width: Math.round(SHORT_SIDE * clean), height: SHORT_SIDE }
    : { width: SHORT_SIDE, height: Math.round(SHORT_SIDE / clean) };
}

/** A friendly name for a measured shape ("16:10"), or its ratio ("1.85:1"). */
export function describeAspect(aspect: number): string {
  for (const [name, value] of Object.entries(FIXED)) if (Math.abs(value - aspect) < 0.02) return name;
  return `${aspect.toFixed(2)}:1`;
}
