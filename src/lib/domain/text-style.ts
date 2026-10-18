import { msg } from "../i18n/core";
import type { PresentationModel, TextStyle, Theme } from "./types";

export type TextPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export const TEXT_POSITIONS: Array<{ id: TextPosition; label: string; align: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom" }> = [
  { id: "top-left", label: msg("Top left"), align: "left", vertical: "top" },
  { id: "top-center", label: msg("Top center"), align: "center", vertical: "top" },
  { id: "top-right", label: msg("Top right"), align: "right", vertical: "top" },
  { id: "middle-left", label: msg("Left"), align: "left", vertical: "middle" },
  { id: "center", label: msg("Center"), align: "center", vertical: "middle" },
  { id: "middle-right", label: msg("Right"), align: "right", vertical: "middle" },
  { id: "bottom-left", label: msg("Bottom left"), align: "left", vertical: "bottom" },
  { id: "bottom-center", label: msg("Bottom center"), align: "center", vertical: "bottom" },
  { id: "bottom-right", label: msg("Bottom right"), align: "right", vertical: "bottom" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ALIGNS = new Set(["left", "center", "right"]);
const VERTICALS = new Set(["top", "middle", "bottom"]);
export const TEXT_SIZE_MIN = 16;
export const TEXT_SIZE_MAX = 220;

/** Keep only valid, present fields. Unknown input becomes {}. */
export function sanitizeTextStyle(value: unknown): TextStyle {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const style: TextStyle = {};
  if (typeof record.fontFamily === "string" && record.fontFamily.trim()) style.fontFamily = record.fontFamily.trim().slice(0, 120);
  if (typeof record.size === "number" && Number.isFinite(record.size)) {
    style.size = Math.round(Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, record.size)));
  }
  if (typeof record.color === "string" && HEX.test(record.color)) style.color = record.color.toLowerCase();
  for (const flag of ["bold", "italic", "underline", "uppercase", "shadow"] as const) {
    if (typeof record[flag] === "boolean") style[flag] = record[flag] as boolean;
  }
  if (typeof record.align === "string" && ALIGNS.has(record.align)) style.align = record.align as TextStyle["align"];
  if (typeof record.vertical === "string" && VERTICALS.has(record.vertical)) style.vertical = record.vertical as TextStyle["vertical"];
  return style;
}

export function parseTextStyle(raw: string | undefined | null): TextStyle {
  if (!raw) return {};
  try {
    return sanitizeTextStyle(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** JSON for a SourceRef payload; empty string when nothing is set. */
export function encodeTextStyle(style: TextStyle | undefined): string {
  const clean = sanitizeTextStyle(style);
  return Object.keys(clean).length ? JSON.stringify(clean) : "";
}

export function positionOf(style: TextStyle, fallback: TextPosition = "center"): TextPosition {
  if (!style.align && !style.vertical) return fallback;
  const align = style.align ?? "center";
  const vertical = style.vertical ?? "middle";
  return TEXT_POSITIONS.find((entry) => entry.align === align && entry.vertical === vertical)?.id ?? fallback;
}

export function withPosition(style: TextStyle, position: TextPosition): TextStyle {
  const entry = TEXT_POSITIONS.find((item) => item.id === position) ?? TEXT_POSITIONS[4]!;
  return { ...style, align: entry.align, vertical: entry.vertical };
}

/**
 * Apply a style to a compiled frame: font, size, color and position go onto the frame's theme;
 * effects (bold, italic, underline, uppercase, shadow) go on model.style. The theme's own
 * effects are the base, so a theme-wide italic still shows unless the item turns it off.
 */
export function styleModel(model: PresentationModel, style: TextStyle | undefined): PresentationModel {
  const clean = sanitizeTextStyle(style);
  const theme: Theme = {
    ...model.theme,
    ...(clean.fontFamily ? { fontFamily: clean.fontFamily } : {}),
    ...(clean.size ? { fontSize: clean.size } : {}),
    ...(clean.color ? { color: clean.color } : {}),
    ...(clean.align ? { align: clean.align } : {}),
    ...(clean.vertical ? { vertical: clean.vertical } : {}),
  };
  const effects = { ...sanitizeTextStyle(model.theme.effects), ...sanitizeTextStyle(model.style), ...effectsOf(clean) };
  return { ...model, theme, ...(Object.keys(effects).length ? { style: effects } : {}) };
}

function effectsOf(style: TextStyle): TextStyle {
  const effects: TextStyle = {};
  for (const flag of ["bold", "italic", "underline", "uppercase", "shadow"] as const) {
    if (style[flag] !== undefined) effects[flag] = style[flag];
  }
  return effects;
}

/** CSS for the effects on a painted frame. */
export function effectsCss(style: TextStyle | undefined, theme?: Theme): Record<string, string | undefined> {
  const effects = { ...sanitizeTextStyle(theme?.effects), ...sanitizeTextStyle(style) };
  return {
    "font-weight": effects.bold ? "700" : undefined,
    "font-style": effects.italic ? "italic" : undefined,
    "text-decoration": effects.underline ? "underline" : undefined,
    "text-transform": effects.uppercase ? "uppercase" : undefined,
    "text-shadow": effects.shadow ? "0 3px 18px rgba(0, 0, 0, 0.75)" : undefined,
  };
}
