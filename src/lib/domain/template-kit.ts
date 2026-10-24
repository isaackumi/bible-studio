// The template kit: a page template is a layout, a palette, a pair of fonts and the words, written
// down as plain data (a TemplateSpec). The studio builds hundreds of them from these parts, a
// downloaded template pack is a list of specs, and any template can be shown in another palette or
// with other fonts. Like the hand-made templates, each one is laid out for the screen it will show on
// (a portrait screen stacks it) and is made of ordinary text, shapes and icons the church can change.

import { setLayerOpacity, type Composition, type LayerBounds } from "./composition";
import { GRADIENT_PRESETS, sanitizeFill, type Fill } from "./fill";
import { SCREEN_FONTS } from "./fonts";
import { Build, fade, fromLeft, rise, solid, TEMPLATE_CATEGORIES, type TemplateCategory } from "./page-templates";
import { TEMPLATE_ICONS, type TemplateIcon } from "./template-icons";
import type { TextStyle } from "./types";
import { msg } from "../i18n/core";

/** The colours of a template. `deep` is a dark (or, for a light palette, light) panel `ink` reads on. */
export type Palette = { id: string; name: string; bg: Fill; ink: string; soft: string; accent: string; onAccent: string; card: string; deep: string };

/** A display face for titles and a text face for the rest. `scale` evens out how large each face looks. */
export type FontPair = { id: string; name: string; display: string; text: string; bold: boolean; upper: boolean; scale: number };

/** The words of a template. A layout uses what it has room for and leaves out what is missing. */
export type TemplateCopy = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  body?: string;
  rows?: Array<{ icon: TemplateIcon; text: string }>;
  icon?: TemplateIcon;
  qr?: boolean;
  date?: { month: string; day: string };
};

export type TemplateSpec = {
  id: string;
  name: string;
  category: TemplateCategory;
  layout: string;
  /** A palette id from PALETTES, or a palette of its own (from a pack). */
  palette: string | Palette;
  fonts: string;
  copy: TemplateCopy;
  /** Words to find it by, beyond its name and category. */
  tags?: string[];
};

const font = (id: string) => SCREEN_FONTS.find((entry) => entry.id === id)!.family;
const gradient = (id: string) => GRADIENT_PRESETS.find((entry) => entry.id === id)!.fill;
const linear = (angle: number, ...colors: string[]): Fill => ({ kind: "linear", angle, stops: colors.map((color, index) => ({ color, at: Math.round((index / (colors.length - 1)) * 100) })) });

export const PALETTES: Palette[] = [
  { id: "dawn", name: msg("Dawn"), bg: gradient("dawn"), ink: "#fff7ee", soft: "#f3d9c2", accent: "#e8b48a", onAccent: "#2a1408", card: "#ffffff1f", deep: "#1a0d0a" },
  { id: "royal", name: msg("Royal"), bg: gradient("royal"), ink: "#ffffff", soft: "#e9e1f7", accent: "#f2c46b", onAccent: "#1b0b3a", card: "#ffffff24", deep: "#1b0b3a" },
  { id: "sea", name: msg("Sea"), bg: gradient("sea"), ink: "#ffffff", soft: "#cfe9ee", accent: "#7fd1c0", onAccent: "#032026", card: "#ffffff1a", deep: "#021018" },
  { id: "paper", name: msg("Paper"), bg: solid("#f6f1e7"), ink: "#2a2420", soft: "#6b5f55", accent: "#b5562b", onAccent: "#fff8ef", card: "#ffffffb3", deep: "#f6f1e7" },
  { id: "midnight", name: msg("Midnight"), bg: linear(160, "#050816", "#101b3a"), ink: "#ffffff", soft: "#b8c2dc", accent: "#e3b85c", onAccent: "#0b0f1f", card: "#ffffff14", deep: "#050816" },
  { id: "dusk", name: msg("Dusk"), bg: gradient("dusk"), ink: "#ffffff", soft: "#ead5ee", accent: "#f3b3c3", onAccent: "#0d1030", card: "#ffffff1f", deep: "#0d1030" },
  { id: "olive", name: msg("Olive grove"), bg: gradient("olive"), ink: "#fbf8ef", soft: "#d9e2b4", accent: "#c9d39a", onAccent: "#10170c", card: "#ffffff1c", deep: "#10170c" },
  { id: "snow", name: msg("Snow"), bg: solid("#ffffff"), ink: "#0f1b3d", soft: "#4a5675", accent: "#2f5bd3", onAccent: "#ffffff", card: "#0f1b3d0d", deep: "#ffffff" },
  { id: "ember", name: msg("Ember"), bg: gradient("ember"), ink: "#fff3ea", soft: "#f5c9a8", accent: "#ff8a3d", onAccent: "#1a0703", card: "#00000055", deep: "#0a0605" },
  { id: "jordan", name: msg("Jordan"), bg: gradient("jordan"), ink: "#ffffff", soft: "#d4f1ea", accent: "#9ff0dc", onAccent: "#062b2b", card: "#ffffff1f", deep: "#062b2b" },
  { id: "forest", name: msg("Forest"), bg: linear(160, "#08140f", "#1d3b2a"), ink: "#f3f7f0", soft: "#b9d0bf", accent: "#e0c068", onAccent: "#0d1a12", card: "#ffffff17", deep: "#08140f" },
  { id: "blush", name: msg("Blush"), bg: linear(160, "#fdeee9", "#f6d5d8"), ink: "#3a1d26", soft: "#7a5560", accent: "#c2416b", onAccent: "#ffffff", card: "#ffffff99", deep: "#fdeee9" },
  { id: "stone", name: msg("Stone"), bg: gradient("stone"), ink: "#ffffff", soft: "#b9b9c4", accent: "#8fa8ff", onAccent: "#101014", card: "#ffffff14", deep: "#1c1c1f" },
  { id: "glory", name: msg("Glory"), bg: gradient("glory"), ink: "#2b1503", soft: "#3b1f05", accent: "#7a3d06", onAccent: "#fff2c9", card: "#ffffff55", deep: "#fff2c9" },
  { id: "advent", name: msg("Advent"), bg: gradient("advent"), ink: "#f5efff", soft: "#d8c3ff", accent: "#c9a7ff", onAccent: "#120a24", card: "#ffffff1c", deep: "#120a24" },
  { id: "pentecost", name: msg("Pentecost"), bg: gradient("pentecost"), ink: "#fff4e6", soft: "#ffd9a8", accent: "#ffb03a", onAccent: "#2a0705", card: "#00000040", deep: "#2a0705" },
  { id: "sky", name: msg("Sky"), bg: linear(180, "#dff1ff", "#9fd0f5"), ink: "#0b2a45", soft: "#2f5675", accent: "#0b63b5", onAccent: "#ffffff", card: "#ffffff88", deep: "#dff1ff" },
  { id: "terracotta", name: msg("Terracotta"), bg: linear(150, "#6b2a12", "#c66a3d"), ink: "#fff6ef", soft: "#f8d5c2", accent: "#ffd8a8", onAccent: "#3a1407", card: "#ffffff1f", deep: "#4a1d0c" },
  { id: "christmas", name: msg("Christmas"), bg: { kind: "radial", x: 50, y: 40, stops: [{ color: "#7a1020", at: 0 }, { color: "#2a0409", at: 100 }] }, ink: "#fff6ee", soft: "#f3cfc4", accent: "#e7c46b", onAccent: "#2a0409", card: "#ffffff1a", deep: "#2a0409" },
  { id: "neon", name: msg("Neon"), bg: solid("#121212"), ink: "#ffffff", soft: "#a8a8a8", accent: "#c6f432", onAccent: "#121212", card: "#ffffff12", deep: "#121212" },
];

const SERIF = font("instrument-serif");
export const FONT_PAIRS: FontPair[] = [
  { id: "classic", name: msg("Classic"), display: SERIF, text: font("figtree"), bold: false, upper: false, scale: 1 },
  { id: "modern", name: msg("Modern"), display: font("figtree"), text: font("figtree"), bold: true, upper: false, scale: 0.84 },
  { id: "caps", name: msg("Bold capitals"), display: font("inter"), text: font("inter"), bold: true, upper: true, scale: 0.7 },
  { id: "editorial", name: msg("Editorial"), display: SERIF, text: font("instrument-sans"), bold: false, upper: false, scale: 1.05 },
  { id: "clean", name: msg("Clean"), display: font("inter"), text: font("inter"), bold: true, upper: false, scale: 0.82 },
  { id: "engraved", name: msg("Engraved"), display: SERIF, text: font("inter"), bold: false, upper: true, scale: 0.78 },
];

type Area = { x: number; y: number; w: number; h: number };
type Block = "icon" | "eyebrow" | "title" | "line" | "subtitle" | "body" | "rows" | "qr";
type Placed = Partial<Record<Block, LayerBounds>> & { top: number; bottom: number };
type Align = "left" | "center";
type PlaceOptions = { line?: boolean; icon?: boolean; qr?: boolean; only?: Block[]; titleScale?: number };

const ORDER: Block[] = ["icon", "eyebrow", "title", "line", "subtitle", "body", "rows", "qr"];
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const box = (x: number, y: number, w: number, h: number): LayerBounds => {
  const left = clamp(x, 0, 99);
  const top = clamp(y, 0, 99);
  return { x: left, y: top, w: clamp(w, 0.2, 100 - left), h: clamp(h, 0.2, 100 - top) };
};

/** One template being built: the page, its palette and fonts, its words, and the screen's shape. */
export class Kit {
  readonly b: Build;
  readonly portrait: boolean;
  readonly square: boolean;
  /** How much of the page's height a block takes, against a wide screen. */
  readonly hs: number;
  constructor(
    name: string,
    readonly aspect: number,
    readonly p: Palette,
    readonly f: FontPair,
    readonly c: TemplateCopy,
    clear = false,
  ) {
    this.b = new Build(name, aspect, clear ? null : p.bg);
    this.portrait = this.b.portrait;
    this.square = this.b.square;
    this.hs = this.portrait ? 0.6 : this.square ? 0.86 : aspect > 2 ? 1.08 : 1;
  }

  /** A square box `h` tall (in % of the page's height), however wide the screen is. */
  sq(x: number, y: number, h: number): LayerBounds {
    return box(x, y, h / this.aspect, h);
  }

  private titleHeight(scale = 1) {
    const length = this.c.title.length;
    return (length > 80 ? 40 : length > 40 ? 32 : length > 22 ? 25 : 20) * this.hs * scale;
  }

  private heights(options: PlaceOptions): Array<[Block, number]> {
    const c = this.c;
    const all: Array<[Block, number | false]> = [
      ["icon", !!c.icon && options.icon !== false && 9 * this.hs],
      ["eyebrow", !!c.eyebrow && 5.5 * this.hs],
      ["title", this.titleHeight(options.titleScale)],
      ["line", !!options.line && 0.5],
      ["subtitle", !!c.subtitle && (c.subtitle.length > 60 ? 12 : 8) * this.hs],
      ["body", !!c.body && Math.min(52, (c.body.split("\n").length * 6.4 + 2) * this.hs)],
      ["rows", !!c.rows?.length && c.rows!.length * 7 * this.hs],
      ["qr", !!c.qr && options.qr !== false && 26 * this.hs],
    ];
    return all.filter((entry): entry is [Block, number] => entry[1] !== false && (!options.only || options.only.includes(entry[0])));
  }

  /** Where each block goes, stacked in `area` and lined up left or centred; `valign` 0 top … 1 bottom. */
  place(area: Area, align: Align, valign: number, options: PlaceOptions = {}): Placed {
    const blocks = this.heights(options);
    const gap = 2.4 * this.hs;
    const gaps = gap * Math.max(0, blocks.length - 1);
    const sum = blocks.reduce((total, [, height]) => total + height, 0);
    const fit = sum + gaps > area.h ? Math.max(0.4, (area.h - gaps) / sum) : 1;
    let y = area.y + Math.max(0, area.h - (sum * fit + gaps)) * valign;
    const placed: Placed = { top: y, bottom: y };
    for (const [block, raw] of blocks) {
      const height = block === "line" ? raw : raw * fit;
      let width = area.w;
      if (block === "icon" || block === "qr") width = height / this.aspect;
      if (block === "line") width = Math.min(area.w, this.portrait ? 18 : 9);
      const x = align === "center" ? area.x + (area.w - width) / 2 : area.x;
      placed[block] = box(x, y, width, height);
      y += height + gap;
    }
    placed.bottom = y - gap;
    return placed;
  }

  private style(kind: "display" | "text", size: number, color: string, align: Align, extra: TextStyle = {}): TextStyle {
    const display = kind === "display";
    return {
      fontFamily: display ? this.f.display : this.f.text,
      size: Math.round(display ? size * this.f.scale : size),
      color,
      align,
      vertical: "middle",
      ...(display && this.f.bold ? { bold: true } : {}),
      ...(display && this.f.upper ? { uppercase: true } : {}),
      ...extra,
    };
  }

  /** Draws the placed blocks with a little stagger, so the page comes in a piece at a time. */
  draw(placed: Placed, align: Align, colors: { ink?: string; soft?: string; accent?: string } = {}, titleScale = 1) {
    const { b, c, p } = this;
    const ink = colors.ink ?? p.ink;
    const soft = colors.soft ?? p.soft;
    const accent = colors.accent ?? p.accent;
    const length = c.title.length;
    const titleSize = (length > 80 ? 92 : length > 40 ? 110 : length > 22 ? 132 : 165) * titleScale;
    let delay = 0;
    const next = () => (delay += 120);
    if (placed.icon && c.icon) b.icon(c.icon, placed.icon, accent, fade(delay));
    if (placed.eyebrow && c.eyebrow) b.text("Eyebrow", c.eyebrow, placed.eyebrow, this.style("text", 40, accent, align, { bold: true, uppercase: true }), fade(next()));
    if (placed.title) b.text("Title", c.title, placed.title, this.style("display", titleSize, ink, align), rise(next(), 700));
    if (placed.line) b.shape("line", solid(accent), placed.line, {}, fade(next()));
    if (placed.subtitle && c.subtitle) b.text("Subtitle", c.subtitle, placed.subtitle, this.style("text", 54, soft, align), rise(next()));
    if (placed.body && c.body) b.text("Text", c.body, placed.body, this.style("text", 50, ink, align, { vertical: "top" }), rise(next()));
    if (placed.rows && c.rows) this.rows(placed.rows, align, ink, accent, next());
    if (placed.qr) b.qr(placed.qr);
    return this;
  }

  /** Icon-and-words lines (a time, a place): a centred column on a centred page. */
  private rows(area: LayerBounds, align: Align, ink: string, accent: string, delay: number) {
    const rows = this.c.rows ?? [];
    const rowH = area.h / rows.length;
    const column = align === "center" ? { x: area.x + area.w * (this.portrait ? 0.08 : 0.24), w: area.w * (this.portrait ? 0.84 : 0.52) } : { x: area.x, w: area.w };
    rows.forEach((row, index) => {
      const y = area.y + index * rowH;
      const iconH = rowH * 0.6;
      const icon = this.sq(column.x, y + (rowH - iconH) / 2, iconH);
      this.b.icon(row.icon, icon, accent, fade(delay + index * 80));
      const gap = icon.w + (this.portrait ? 3 : 1.4);
      this.b.text(`Line ${index + 1}`, row.text, box(column.x + gap, y, column.w - gap, rowH), this.style("text", 50, ink, "left"), fade(delay + 40 + index * 80));
    });
  }

  /** Puts the last element drawn behind a veil: a large faint icon or shape. */
  faint(opacity: number) {
    this.b.page = setLayerOpacity(this.b.page, this.b.page.layers.at(-1)!.id, opacity);
    return this;
  }

  get page(): Composition {
    return this.b.page;
  }
}

export type TemplateLayout = { id: string; name: string; clear?: boolean; build: (k: Kit) => void };

const shade = (color: string, alpha: string) => (color.length === 7 ? color + alpha : color);

/** Full-screen pages. Each is decoration plus a stack of the words, placed for the screen's shape. */
export const PAGE_LAYOUTS: TemplateLayout[] = [
  {
    id: "centred",
    name: msg("Centred"),
    build: (k) => k.draw(k.place({ x: 8, y: 8, w: 84, h: 84 }, "center", 0.5, { line: true }), "center"),
  },
  {
    id: "side-bar",
    name: msg("Side bar"),
    build: (k) => {
      const x = k.portrait ? 13 : 11;
      const placed = k.place({ x, y: 10, w: k.portrait ? 79 : 72, h: 80 }, "left", 0.5);
      k.b.shape("rect", solid(k.p.accent), box(x - (k.portrait ? 4.5 : 2.6), placed.top, k.portrait ? 1.6 : 0.8, placed.bottom - placed.top), { radius: "50" }, rise());
      k.draw(placed, "left");
    },
  },
  {
    id: "split",
    name: msg("Split"),
    build: (k) => {
      const panel = k.portrait ? box(0, 0, 100, 36) : box(0, 0, 40, 100);
      k.b.shape("rect", solid(k.p.accent), panel, {}, fromLeft(0, 700));
      const iconH = k.portrait ? 16 : 30;
      if (k.c.icon) k.b.icon(k.c.icon, k.sq(panel.x + (panel.w - iconH / k.aspect) / 2, panel.y + (panel.h - iconH) / 2, iconH), k.p.onAccent, fade(250));
      k.draw(k.place(k.portrait ? { x: 8, y: 42, w: 84, h: 52 } : { x: 47, y: 10, w: 45, h: 80 }, k.portrait ? "center" : "left", 0.5, { icon: false }), k.portrait ? "center" : "left");
    },
  },
  {
    id: "split-right",
    name: msg("Split, right"),
    build: (k) => {
      const panel = k.portrait ? box(0, 64, 100, 36) : box(60, 0, 40, 100);
      k.b.shape("rect", solid(k.p.accent), panel, {}, fade(0, 700));
      const iconH = k.portrait ? 16 : 30;
      if (k.c.icon) k.b.icon(k.c.icon, k.sq(panel.x + (panel.w - iconH / k.aspect) / 2, panel.y + (panel.h - iconH) / 2, iconH), k.p.onAccent, fade(250));
      k.draw(k.place(k.portrait ? { x: 8, y: 6, w: 84, h: 54 } : { x: 8, y: 10, w: 46, h: 80 }, k.portrait ? "center" : "left", 0.5, { icon: false, line: true }), k.portrait ? "center" : "left");
    },
  },
  {
    id: "frame",
    name: msg("Frame"),
    build: (k) => {
      const mx = k.portrait ? 5 : 3;
      const my = mx * k.aspect;
      k.b.shape("rect", solid("#00000000"), box(mx, my, 100 - mx * 2, 100 - my * 2), { stroke: k.p.accent.slice(0, 7), strokeWidth: "3" }, fade(0, 900));
      k.draw(k.place({ x: 12, y: my + 8, w: 76, h: 100 - (my + 8) * 2 }, "center", 0.5, { line: true }), "center");
    },
  },
  {
    id: "big-type",
    name: msg("Big type"),
    build: (k) => {
      const x = k.portrait ? 8 : 7;
      k.b.shape("line", solid(k.p.accent), box(x, k.portrait ? 8 : 12, k.portrait ? 18 : 8, 0.5), {}, fromLeft());
      k.draw(k.place({ x, y: k.portrait ? 14 : 20, w: k.portrait ? 84 : 80, h: k.portrait ? 78 : 70 }, "left", 1, { icon: false, titleScale: 1.25 }), "left", {}, 1.25);
    },
  },
  {
    id: "card",
    name: msg("Card"),
    build: (k) => {
      const card = k.portrait ? box(7, 14, 86, 72) : k.square ? box(9, 12, 82, 76) : box(13, 12, 74, 76);
      k.b.shape("rect", solid(k.p.card), card, { radius: "8", shadow: "soft" }, fade(0, 600));
      const inset = k.portrait ? 6 : 5;
      k.draw(k.place({ x: card.x + inset, y: card.y + inset * k.aspect * 0.8, w: card.w - inset * 2, h: card.h - inset * k.aspect * 1.6 }, "center", 0.5, { line: true }), "center");
    },
  },
  {
    id: "band",
    name: msg("Band"),
    build: (k) => {
      const band = k.portrait ? box(0, 40, 100, 20) : box(0, 36, 100, 28);
      k.b.shape("rect", solid(k.p.accent), band, {}, fromLeft(0, 700));
      k.draw(k.place({ x: 8, y: 6, w: 84, h: band.y - 9 }, "center", 1, { only: ["icon", "eyebrow"] }), "center");
      k.draw(k.place({ x: 6, y: band.y + 2, w: 88, h: band.h - 4 }, "center", 0.5, { only: ["title"] }), "center", { ink: k.p.onAccent });
      k.draw(k.place({ x: 8, y: band.y + band.h + 3, w: 84, h: 97 - (band.y + band.h + 3) }, "center", 0, { only: ["subtitle", "body", "rows", "qr"] }), "center");
    },
  },
  {
    id: "ribbon",
    name: msg("Ribbon"),
    build: (k) => {
      const placed = k.place({ x: 8, y: 8, w: 84, h: 84 }, "center", 0.5);
      if (placed.eyebrow) {
        const y = placed.eyebrow.y + placed.eyebrow.h / 2;
        const side = k.portrait ? 16 : 18;
        const edge = k.portrait ? 6 : 14;
        k.b.shape("line", solid(k.p.accent), box(edge, y, side, 0.3), {}, fade(200));
        k.b.shape("line", solid(k.p.accent), box(100 - edge - side, y, side, 0.3), {}, fade(200));
        placed.eyebrow = box(edge + side + 1.5, placed.eyebrow.y, 100 - (edge + side + 1.5) * 2, placed.eyebrow.h);
      }
      k.draw(placed, "center");
    },
  },
  {
    id: "circles",
    name: msg("Circles"),
    build: (k) => {
      const big = k.portrait ? 40 : 26;
      const ring = k.portrait ? 26 : 20;
      k.b.shape("ellipse", solid(k.p.accent), box(k.portrait ? 52 : 66, k.portrait ? 4 : 10, big, big * k.aspect), {}, fade(0, 1000));
      k.faint(0.28);
      k.b.shape("ellipse", solid("#00000000"), box(k.portrait ? 38 : 58, k.portrait ? 16 : 34, ring, ring * k.aspect), { stroke: k.p.accent.slice(0, 7), strokeWidth: "3" }, fade(200, 1000));
      k.draw(k.place(k.portrait ? { x: 8, y: 36, w: 84, h: 58 } : { x: 9, y: 10, w: 52, h: 80 }, "left", 0.5), "left");
    },
  },
  {
    id: "big-icon",
    name: msg("Big icon"),
    build: (k) => {
      const iconH = k.portrait ? Math.min(30, 60 * k.aspect) : Math.min(64, 40 * k.aspect);
      const iconW = iconH / k.aspect;
      k.b.icon(k.c.icon ?? "sparkles", k.portrait ? k.sq(50 - iconW / 2, 8, iconH) : k.sq(95 - iconW, (100 - iconH) / 2, iconH), k.p.accent, fade(0, 1200));
      k.faint(0.22);
      k.draw(k.place(k.portrait ? { x: 8, y: 12 + iconH, w: 84, h: 82 - iconH } : { x: 9, y: 10, w: 90 - iconW - 12, h: 80 }, k.portrait ? "center" : "left", 0.5, { icon: false }), k.portrait ? "center" : "left");
    },
  },
  {
    id: "underline",
    name: msg("Underline"),
    build: (k) => k.draw(k.place({ x: k.portrait ? 8 : 10, y: 10, w: k.portrait ? 84 : 72, h: 80 }, "left", 0.5, { icon: false, line: true, titleScale: 1.1 }), "left", {}, 1.1),
  },
  {
    id: "list",
    name: msg("List"),
    build: (k) => k.draw(k.place({ x: k.portrait ? 8 : 9, y: k.portrait ? 8 : 10, w: 82, h: k.portrait ? 84 : 80 }, "left", 0.15, { line: true }), "left"),
  },
  {
    id: "columns",
    name: msg("Two columns"),
    build: (k) => {
      if (k.portrait) {
        k.draw(k.place({ x: 8, y: 8, w: 84, h: 84 }, "left", 0.3, { line: true }), "left");
        return;
      }
      k.b.shape("rect", solid(k.p.soft), box(51, 20, 0.2, 60), {}, fade(200));
      k.faint(0.5);
      k.draw(k.place({ x: 8, y: 10, w: 39, h: 80 }, "left", 0.5, { only: ["icon", "eyebrow", "title", "subtitle"] }), "left");
      k.draw(k.place({ x: 55, y: 10, w: 38, h: 80 }, "left", 0.5, { only: ["body", "rows", "qr"] }), "left");
    },
  },
  {
    id: "date-card",
    name: msg("Date card"),
    build: (k) => {
      const card = k.portrait ? box(30, 8, 40, 22) : box(8, 24, 22, 52);
      k.b.shape("rect", solid(k.p.card), card, { radius: "12", stroke: k.p.accent.slice(0, 7), strokeWidth: "2" }, fade());
      if (k.c.date) {
        k.b.text("Month", k.c.date.month, box(card.x, card.y + card.h * 0.12, card.w, card.h * 0.22), { fontFamily: k.f.text, size: 54, bold: true, color: k.p.accent, align: "center", vertical: "middle", uppercase: true }, fade(150));
        k.b.text("Day", k.c.date.day, box(card.x, card.y + card.h * 0.34, card.w, card.h * 0.5), { fontFamily: k.f.display, size: 200, color: k.p.ink, align: "center", vertical: "middle", ...(k.f.bold ? { bold: true } : {}) }, rise(200));
      } else if (k.c.icon) {
        const iconH = card.h * 0.5;
        k.b.icon(k.c.icon, k.sq(card.x + (card.w - iconH / k.aspect) / 2, card.y + card.h * 0.25, iconH), k.p.accent, fade(150));
      }
      k.draw(k.place(k.portrait ? { x: 8, y: 34, w: 84, h: 60 } : { x: 36, y: 12, w: 56, h: 76 }, k.portrait ? "center" : "left", 0.5, { icon: false }), k.portrait ? "center" : "left");
    },
  },
  {
    id: "quote",
    name: msg("Quote"),
    build: (k) => {
      const x = k.portrait ? 8 : 10;
      const iconH = 12 * k.hs;
      k.b.icon("quote", k.sq(x, k.portrait ? 12 : 10, iconH), k.p.accent, fade());
      k.faint(0.8);
      k.draw(k.place({ x, y: (k.portrait ? 12 : 10) + iconH + 3, w: k.portrait ? 84 : 78, h: 80 - iconH - 3 }, "left", 0.4, { icon: false, line: true }), "left");
    },
  },
  {
    id: "banner",
    name: msg("Banner"),
    build: (k) => {
      const tall = k.c.eyebrow ? 13 * k.hs : 2.4 * k.hs;
      k.b.shape("rect", solid(k.p.accent), box(0, 0, 100, tall), {}, fade(0, 600));
      if (k.c.eyebrow) k.b.text("Eyebrow", k.c.eyebrow, box(6, tall * 0.2, 88, tall * 0.6), { fontFamily: k.f.text, size: 42, bold: true, uppercase: true, color: k.p.onAccent, align: "center", vertical: "middle" }, fade(150));
      k.draw(k.place({ x: 8, y: tall + 6, w: 84, h: 88 - tall }, "center", 0.5, { line: true, only: ["icon", "title", "line", "subtitle", "body", "rows", "qr"] }), "center");
    },
  },
];

/** Lower thirds: clear pages that sit over a camera, at the foot of the picture. */
export const LOWER_THIRD_LAYOUTS: TemplateLayout[] = [
  {
    id: "lt-bar",
    name: msg("Bar"),
    clear: true,
    build: (k) => {
      const y = k.portrait ? 80 : 74;
      const w = k.portrait ? 92 : 48;
      const h = k.portrait ? 11 : 16;
      k.b.shape("rect", linear(90, shade(k.p.deep, "f2"), shade(k.p.deep, "cc"), shade(k.p.deep, "00")), box(4, y, w, h), { radius: "4" }, fromLeft());
      k.b.shape("rect", solid(k.p.accent), box(4, y, k.portrait ? 1.6 : 0.7, h), {}, fade(150));
      k.draw(k.place({ x: k.portrait ? 9 : 6.5, y: y + h * 0.1, w: w - 8, h: h * 0.8 }, "left", 0.5, { only: ["title", "subtitle"], titleScale: 0.5 }), "left", {}, 0.42);
    },
  },
  {
    id: "lt-pill",
    name: msg("Pill"),
    clear: true,
    build: (k) => {
      const y = k.portrait ? 82 : 78;
      const h = k.portrait ? 8 : 11;
      const w = k.portrait ? 92 : 40;
      k.b.shape("rect", solid(shade(k.p.deep, "e6")), box(4, y, w, h), { radius: "50", shadow: "soft" }, fromLeft());
      const iconH = h * 0.45;
      k.b.icon(k.c.icon ?? "sparkles", k.sq(k.portrait ? 8 : 5.6, y + (h - iconH) / 2, iconH), k.p.accent, fade(250));
      k.draw(k.place({ x: k.portrait ? 18 : 9.6, y: y + h * 0.12, w: w - (k.portrait ? 18 : 8), h: h * 0.76 }, "left", 0.5, { only: ["title", "subtitle"] }), "left", {}, 0.36);
    },
  },
  {
    id: "lt-line",
    name: msg("Line"),
    clear: true,
    build: (k) => {
      const x = k.portrait ? 8 : 6;
      const y = k.portrait ? 80 : 74;
      k.b.text("Title", k.c.title, box(x, y, k.portrait ? 84 : 46, k.portrait ? 6 : 9), { fontFamily: k.f.display, size: Math.round(66 * k.f.scale), bold: k.f.bold || undefined, uppercase: k.f.upper || undefined, color: "#ffffff", align: "left", vertical: "bottom", shadow: true }, rise(0, 500));
      k.b.shape("line", solid(k.p.accent), box(x, y + (k.portrait ? 6.8 : 9.8), k.portrait ? 30 : 14, 0.4), { shadow: "soft" }, fromLeft(200, 600));
      if (k.c.subtitle) k.b.text("Subtitle", k.c.subtitle, box(x, y + (k.portrait ? 7.6 : 11), k.portrait ? 84 : 46, k.portrait ? 4 : 6), { fontFamily: k.f.text, size: 40, color: "#eeeeee", align: "left", vertical: "top", shadow: true }, rise(350, 500));
    },
  },
  {
    id: "lt-block",
    name: msg("Blocks"),
    clear: true,
    build: (k) => {
      const y = k.portrait ? 79 : 72;
      const h = k.portrait ? 7 : 10;
      const w = k.portrait ? 88 : 42;
      k.b.shape("rect", solid(k.p.accent), box(4, y, w, h), {}, fromLeft());
      k.b.text("Title", k.c.title, box(6, y + h * 0.1, w - 4, h * 0.8), { fontFamily: k.f.display, size: Math.round(62 * k.f.scale), bold: k.f.bold || undefined, uppercase: k.f.upper || undefined, color: k.p.onAccent, align: "left", vertical: "middle" }, fade(200));
      if (k.c.subtitle) {
        k.b.shape("rect", solid(shade(k.p.deep, "f0")), box(4, y + h, w * 0.75, h * 0.62), {}, fromLeft(150));
        k.b.text("Subtitle", k.c.subtitle, box(6, y + h + h * 0.06, w * 0.75 - 4, h * 0.5), { fontFamily: k.f.text, size: 38, color: k.p.ink, align: "left", vertical: "middle" }, fade(350));
      }
    },
  },
  {
    id: "lt-centre",
    name: msg("Caption"),
    clear: true,
    build: (k) => {
      const w = k.portrait ? 88 : 56;
      const h = k.portrait ? 10 : 14;
      const card = box((100 - w) / 2, k.portrait ? 84 : 80, w, h);
      k.b.shape("rect", solid(shade(k.p.deep, "e0")), card, { radius: "10", shadow: "soft" }, rise(0, 500));
      k.draw(k.place({ x: card.x + 3, y: card.y + h * 0.1, w: w - 6, h: h * 0.8 }, "center", 0.5, { only: ["title", "subtitle"] }), "center", {}, 0.4);
    },
  },
  {
    id: "lt-tag",
    name: msg("Corner tag"),
    clear: true,
    build: (k) => {
      const w = k.portrait ? 60 : 28;
      const h = k.portrait ? 6 : 9;
      const x = 100 - w - (k.portrait ? 5 : 3);
      const y = k.portrait ? 4 : 5;
      k.b.shape("rect", solid(shade(k.p.deep, "e6")), box(x, y, w, h), { radius: "8" }, fade());
      k.b.shape("ellipse", solid(k.p.accent), k.sq(x + (k.portrait ? 3 : 1.4), y + h * 0.35, h * 0.3), {}, fade(150));
      k.b.text("Title", k.c.title, box(x + (k.portrait ? 9 : 4), y + h * 0.12, w - (k.portrait ? 11 : 5), h * 0.76), { fontFamily: k.f.text, size: 44, bold: true, color: k.p.ink, align: "left", vertical: "middle" }, fade(200));
    },
  },
];

const LAYOUTS = new Map([...PAGE_LAYOUTS, ...LOWER_THIRD_LAYOUTS].map((layout) => [layout.id, layout]));
export const layoutById = (id: string) => LAYOUTS.get(id) ?? null;
export const paletteById = (id: string) => PALETTES.find((palette) => palette.id === id) ?? null;
export const fontPairById = (id: string) => FONT_PAIRS.find((pair) => pair.id === id) ?? null;

/** What a template is shown in: its own palette and fonts, or the ones chosen to try it in. */
export type TemplateLook = { palette?: string | null; fonts?: string | null };

export function buildTemplate(spec: TemplateSpec, aspect: number, look: TemplateLook = {}): Composition {
  const layout = layoutById(spec.layout) ?? PAGE_LAYOUTS[0]!;
  const palette = (look.palette && paletteById(look.palette)) || (typeof spec.palette === "string" ? paletteById(spec.palette) : spec.palette) || PALETTES[0]!;
  const fonts = (look.fonts && fontPairById(look.fonts)) || fontPairById(spec.fonts) || FONT_PAIRS[0]!;
  const kit = new Kit(spec.copy.title.split("\n")[0]!.slice(0, 40), aspect, palette, fonts, spec.copy, !!layout.clear);
  layout.build(kit);
  return kit.page;
}

// Checking what a downloaded pack holds: a spec is kept only when every part of it is something the
// studio knows how to draw.
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "");
const isIcon = (value: unknown): value is TemplateIcon => typeof value === "string" && Object.hasOwn(TEMPLATE_ICONS, value);

function cleanPalette(value: unknown, id: string): Palette | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const colors = ["ink", "soft", "accent", "onAccent", "card", "deep"] as const;
  if (!colors.every((key) => typeof record[key] === "string" && HEX.test(record[key] as string))) return null;
  const bg = sanitizeFill(record.bg, { kind: "solid", color: "#000000" });
  return { id, name: text(record.name, 40) || id, bg, ...(Object.fromEntries(colors.map((key) => [key, (record[key] as string).toLowerCase()])) as Pick<Palette, (typeof colors)[number]>) };
}

export function sanitizeTemplateSpecs(value: unknown, prefix: string): TemplateSpec[] {
  if (!Array.isArray(value)) return [];
  const specs: TemplateSpec[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 500)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = `${prefix}:${text(record.id, 60)}`;
    const layout = text(record.layout, 40);
    const category = text(record.category, 40) as TemplateCategory;
    const copy = (record.copy ?? {}) as Record<string, unknown>;
    const title = text(copy.title, 300);
    if (!text(record.id, 60) || seen.has(id) || !LAYOUTS.has(layout) || !TEMPLATE_CATEGORIES.includes(category) || !title) continue;
    const palette = typeof record.palette === "string" ? (paletteById(record.palette) ? record.palette : null) : cleanPalette(record.palette, `${id}:palette`);
    if (!palette) continue;
    const rows = Array.isArray(copy.rows)
      ? copy.rows
          .slice(0, 6)
          .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}))
          .filter((row) => isIcon(row.icon) && text(row.text, 120))
          .map((row) => ({ icon: row.icon as TemplateIcon, text: text(row.text, 120) }))
      : [];
    const date = copy.date && typeof copy.date === "object" ? (copy.date as Record<string, unknown>) : null;
    seen.add(id);
    specs.push({
      id,
      name: text(record.name, 80) || title.slice(0, 40),
      category,
      layout,
      palette,
      fonts: fontPairById(text(record.fonts, 40)) ? text(record.fonts, 40) : FONT_PAIRS[0]!.id,
      copy: {
        title,
        ...(text(copy.eyebrow, 80) ? { eyebrow: text(copy.eyebrow, 80) } : {}),
        ...(text(copy.subtitle, 200) ? { subtitle: text(copy.subtitle, 200) } : {}),
        ...(text(copy.body, 1200) ? { body: text(copy.body, 1200) } : {}),
        ...(rows.length ? { rows } : {}),
        ...(isIcon(copy.icon) ? { icon: copy.icon } : {}),
        ...(copy.qr === true ? { qr: true } : {}),
        ...(date && text(date.month, 6) && text(date.day, 4) ? { date: { month: text(date.month, 6), day: text(date.day, 4) } } : {}),
      },
      ...(Array.isArray(record.tags) ? { tags: record.tags.map((tag) => text(tag, 30)).filter(Boolean).slice(0, 12) } : {}),
    });
  }
  return specs;
}
