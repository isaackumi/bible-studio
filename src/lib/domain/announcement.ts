// Announcements: a heading, a few lines of detail, and a small line above the heading ("This
// week", "Save the date") that the church writes itself. Each design lays them out differently;
// the theme still gives the background, font and text colour, and the accent colours the design.

import type { PresentationModel, Theme } from "./types";

export type AnnouncementDesign = "classic" | "card" | "banner" | "split" | "bulletin" | "lower";

export const ANNOUNCEMENT_DESIGNS: Array<{ id: AnnouncementDesign; name: string; hint: string }> = [
  { id: "card", name: "Card", hint: "A panel in the middle, for most notices" },
  { id: "classic", name: "Centered", hint: "Words alone on the background" },
  { id: "banner", name: "Banner", hint: "The heading across a colour band" },
  { id: "split", name: "Split", hint: "The small line in a colour panel beside the words" },
  { id: "bulletin", name: "Bulletin", hint: "A list of details, one per line" },
  { id: "lower", name: "Lower bar", hint: "A bar along the bottom, over a picture" },
];

/** Ready-made lines for above the heading; the church can type anything else. */
export const LABEL_SUGGESTIONS = ["Announcement", "This week", "Coming up", "Save the date", "Don't miss", "Welcome", "Prayer", "Giving"];

export const ACCENT_SWATCHES = ["#f2b33d", "#4f8cff", "#34c08a", "#e5484d", "#8e6cf0", "#ffffff"];

export type AnnouncementWords = {
  heading: string;
  body: string;
  design?: AnnouncementDesign;
  /** The small line above the heading; empty hides it. */
  label?: string;
  /** CSS colour; empty uses the theme's accent. */
  accent?: string;
  /** A picture from the media library behind the words; null uses the theme's background. */
  imageId?: string | null;
};

export type AnnouncementPaint = {
  design: AnnouncementDesign;
  label: string;
  heading: string;
  body: string[];
  accent: string;
  /** Text that reads on the accent colour. */
  onAccent: string;
};

const DESIGN_IDS = new Set<string>(ANNOUNCEMENT_DESIGNS.map((entry) => entry.id));

export function isAnnouncementDesign(value: unknown): value is AnnouncementDesign {
  return typeof value === "string" && DESIGN_IDS.has(value);
}

/** The theme's own accent: its panel stripe, else its reference colour. */
export function themeAccent(theme: Theme): string {
  return theme.panel?.accent || theme.reference.color || "#f2b33d";
}

/** Dark or white text, whichever reads on a colour (hex only; anything else gets white). */
export function inkOn(color: string): string {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return "#ffffff";
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.4 ? "#14161a" : "#ffffff";
}

export function cleanAccent(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
}

/**
 * An announcement on screen. The words also go in `lines` (heading first), so the stage display,
 * phones and the key output read it like any titled slide.
 */
export function presentAnnouncement(input: { theme: Theme; words: AnnouncementWords; backgroundImageUrl?: string | null }): PresentationModel {
  const heading = input.words.heading.trim();
  const body = input.words.body.split("\n").map((line) => line.trim()).filter(Boolean);
  const accent = cleanAccent(input.words.accent) || themeAccent(input.theme);
  const label = (input.words.label ?? "").trim().slice(0, 60);
  return {
    layout: "title",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [...(heading ? [{ text: heading }] : []), ...body.map((text) => ({ text }))],
    imageUrl: null,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
    announcement: {
      design: isAnnouncementDesign(input.words.design) ? input.words.design : "classic",
      label,
      heading,
      body,
      accent,
      onAccent: inkOn(accent),
    },
  };
}
