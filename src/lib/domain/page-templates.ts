// Ready-made slide pages for the studio: welcomes, announcements, verses, sermon titles, giving and
// lower thirds. Each is built for the screen it will show on (wide, 4:3 or portrait), not stretched
// to it: the layout itself changes, so a portrait screen gets a stacked design. Everything stays
// editable afterwards: these are ordinary pages made of text, shapes and icons.

import { addIconElement, addQrElement, addShapeElement, addTextElement } from "./decks";
import { assignLayerSource, createComposition, setCompositionBackground, setLayerAnimation, type Composition, type LayerAnimation, type LayerBounds } from "./composition";
import { encodeFill, GRADIENT_PRESETS, type Fill } from "./fill";
import { SCREEN_FONTS } from "./fonts";
import { TEMPLATE_ICONS, type TemplateIcon } from "./template-icons";
import type { TextStyle } from "./types";
import { msg } from "../i18n/core";

export type TemplateCategory =
  | "Welcome"
  | "Announcements"
  | "Events"
  | "Scripture"
  | "Sermon"
  | "Worship"
  | "Prayer"
  | "Giving"
  | "Communion"
  | "Baptism"
  | "Kids & youth"
  | "Christmas"
  | "Easter"
  | "Seasons"
  | "Thank you"
  | "Lower thirds";

export type PageTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  /** A clear page: it shows what is behind it (put it over a camera as a Slide page layer). */
  clear?: boolean;
  /** `aspect` is the screen's width ÷ height. */
  build: (aspect: number) => Composition;
};

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Welcome",
  "Announcements",
  "Events",
  "Scripture",
  "Sermon",
  "Worship",
  "Prayer",
  "Giving",
  "Communion",
  "Baptism",
  "Kids & youth",
  "Christmas",
  "Easter",
  "Seasons",
  "Thank you",
  "Lower thirds",
];

export const SERIF = SCREEN_FONTS.find((font) => font.id === "instrument-serif")!.family;
export const SANS = SCREEN_FONTS.find((font) => font.id === "figtree")!.family;

export const preset = (id: string): Fill => GRADIENT_PRESETS.find((entry) => entry.id === id)!.fill;

/** A page being built: each step adds one element and may give it how it comes in. */
export class Build {
  page: Composition;
  /** Text grows a little smaller on narrow screens; the box fitting does the rest. */
  readonly scale: number;
  readonly portrait: boolean;
  readonly square: boolean;

  constructor(name: string, aspect: number, fill: Fill | null) {
    this.portrait = aspect < 0.9;
    this.square = !this.portrait && aspect < 1.5;
    this.scale = this.portrait ? 0.8 : this.square ? 0.92 : 1;
    const base = createComposition(name);
    this.page = fill
      ? setCompositionBackground(base, {
          type: fill.kind === "solid" ? "color" : "gradient",
          color: fill.kind === "solid" ? fill.color : fill.stops[0]!.color,
          to: fill.kind === "solid" ? fill.color : fill.stops.at(-1)!.color,
          angle: fill.kind === "linear" ? fill.angle : 180,
          assetId: "",
          imageUrl: "",
          overlay: "#000000",
          overlayOpacity: 0,
          ...(fill.kind === "solid" ? {} : { fill: encodeFill(fill) }),
        })
      : base;
    // Elements meet as designed: no region lines or gaps (a clear page has no background to stop them).
    this.page = { ...this.page, edges: "touch", ...(fill ? {} : { clear: true }), transition: { type: "fade", ms: 400 } };
  }

  private motion(animation?: Partial<LayerAnimation>) {
    if (!animation) return this;
    this.page = setLayerAnimation(this.page, this.page.layers.at(-1)!.id, animation);
    return this;
  }

  text(name: string, words: string, bounds: LayerBounds, style: TextStyle, animation?: Partial<LayerAnimation>) {
    this.page = addTextElement(this.page, words, bounds, { ...style, size: Math.round((style.size ?? 60) * this.scale) }, name);
    return this.motion(animation);
  }

  shape(kind: "rect" | "ellipse" | "line", fill: Fill, bounds: LayerBounds, extra: Record<string, string> = {}, animation?: Partial<LayerAnimation>) {
    this.page = addShapeElement(this.page, kind, encodeFill(fill), bounds);
    if (Object.keys(extra).length) {
      const layer = this.page.layers.at(-1)!;
      this.page = assignLayerSource(this.page, layer.id, { ...layer.source, payload: { ...layer.source.payload, ...extra } });
    }
    return this.motion(animation);
  }

  icon(name: TemplateIcon, bounds: LayerBounds, color: string, animation?: Partial<LayerAnimation>) {
    this.page = addIconElement(this.page, { name, nodes: TEMPLATE_ICONS[name] }, bounds);
    const layer = this.page.layers.at(-1)!;
    this.page = assignLayerSource(this.page, layer.id, { ...layer.source, payload: { ...layer.source.payload, color } });
    return this.motion(animation);
  }

  qr(bounds: LayerBounds) {
    this.page = addQrElement(this.page, "https://", bounds);
    return this;
  }
}

export const solid = (color: string): Fill => ({ kind: "solid", color });
export const rise = (delayMs = 0, durationMs = 600): Partial<LayerAnimation> => ({ entrance: "slide-up", durationMs, delayMs, easing: "ease-out" });
export const fade = (delayMs = 0, durationMs = 700): Partial<LayerAnimation> => ({ entrance: "fade", durationMs, delayMs, easing: "ease-out" });
export const fromLeft = (delayMs = 0, durationMs = 550): Partial<LayerAnimation> => ({ entrance: "slide-right", durationMs, delayMs, easing: "ease-out" });

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "welcome-home",
    name: msg("Welcome home"),
    category: "Welcome",
    build: (aspect) => {
      const b = new Build("Welcome", aspect, preset("dawn"));
      const top = b.portrait ? 26 : 18;
      return b
        .icon("church", { x: 45, y: top, w: 10, h: b.portrait ? 8 : 14 }, "#f6dcc0", fade())
        .text("Welcome", "Welcome", { x: 8, y: top + (b.portrait ? 11 : 17), w: 84, h: b.portrait ? 18 : 26 }, { fontFamily: SERIF, size: 190, color: "#fff7ee", align: "center", vertical: "middle" }, rise(150))
        .shape("line", solid("#e8b48a"), { x: 44, y: top + (b.portrait ? 31 : 45), w: 12, h: 0.5 }, {}, fade(400))
        .text("Subtitle", "We're glad you're here", { x: 10, y: top + (b.portrait ? 34 : 49), w: 80, h: b.portrait ? 8 : 10 }, { fontFamily: SANS, size: 58, color: "#f3d9c2", align: "center", vertical: "top" }, rise(450)).page;
    },
  },
  {
    id: "welcome-bold",
    name: msg("Welcome, bold"),
    category: "Welcome",
    build: (aspect) => {
      const b = new Build("Welcome", aspect, preset("stone"));
      if (b.portrait) {
        return b
          .shape("rect", preset("royal"), { x: 8, y: 22, w: 2.4, h: 34 }, { radius: "50" }, rise())
          .text("Title", "Welcome to\nGrace Chapel", { x: 14, y: 22, w: 80, h: 34 }, { fontFamily: SANS, size: 130, bold: true, color: "#ffffff", align: "left", vertical: "middle" }, rise(150))
          .text("Subtitle", "Sunday worship · 10:00", { x: 14, y: 58, w: 80, h: 8 }, { fontFamily: SANS, size: 52, color: "#b9b9c4", align: "left", vertical: "top" }, rise(300)).page;
      }
      return b
        .shape("rect", preset("royal"), { x: 7, y: 26, w: 0.9, h: 40 }, { radius: "50" }, rise())
        .text("Title", "Welcome to\nGrace Chapel", { x: 10, y: 24, w: 70, h: 40 }, { fontFamily: SANS, size: 150, bold: true, color: "#ffffff", align: "left", vertical: "middle" }, rise(150))
        .text("Subtitle", "Sunday worship · 10:00", { x: 10.3, y: 66, w: 60, h: 9 }, { fontFamily: SANS, size: 56, color: "#b9b9c4", align: "left", vertical: "top" }, rise(300)).page;
    },
  },
  {
    id: "event",
    name: msg("Event"),
    category: "Announcements",
    build: (aspect) => {
      const b = new Build("Event", aspect, preset("royal"));
      const glass: Fill = { kind: "linear", angle: 160, stops: [{ color: "#ffffff2e", at: 0 }, { color: "#ffffff0d", at: 100 }] };
      const card = b.portrait ? { x: 30, y: 12, w: 40, h: 20 } : { x: 8, y: 24, w: 22, h: 52 };
      b.shape("rect", glass, card, { radius: "12", stroke: "#ffffff", strokeWidth: "2" }, fade())
        .text("Month", "OCT", { x: card.x, y: card.y + card.h * 0.12, w: card.w, h: card.h * 0.22 }, { fontFamily: SANS, size: 54, bold: true, color: "#f2c46b", align: "center", vertical: "middle", uppercase: true }, fade(150))
        .text("Day", "26", { x: card.x, y: card.y + card.h * 0.34, w: card.w, h: card.h * 0.5 }, { fontFamily: SERIF, size: 200, color: "#ffffff", align: "center", vertical: "middle" }, rise(200));
      const left = b.portrait ? 8 : 36;
      const width = b.portrait ? 84 : 58;
      const top = b.portrait ? 38 : 24;
      const align = b.portrait ? "center" : "left";
      return b
        .text("Title", "Harvest Thanksgiving", { x: left, y: top, w: width, h: b.portrait ? 18 : 24 }, { fontFamily: SERIF, size: 120, color: "#ffffff", align, vertical: "middle" }, rise(250))
        .icon("clock", { x: b.portrait ? 30 : left, y: top + (b.portrait ? 21 : 28), w: b.portrait ? 6 : 3.4, h: b.portrait ? 4 : 6 }, "#f2c46b", fade(400))
        .text("Time", "Sunday, 10:00 am", { x: b.portrait ? 37 : left + 4.4, y: top + (b.portrait ? 20.4 : 27.6), w: b.portrait ? 55 : 50, h: b.portrait ? 5 : 7 }, { fontFamily: SANS, size: 50, color: "#e9e1f7", align: "left", vertical: "middle" }, fade(450))
        .icon("map-pin", { x: b.portrait ? 30 : left, y: top + (b.portrait ? 27 : 38), w: b.portrait ? 6 : 3.4, h: b.portrait ? 4 : 6 }, "#f2c46b", fade(550))
        .text("Place", "Main sanctuary", { x: b.portrait ? 37 : left + 4.4, y: top + (b.portrait ? 26.4 : 37.6), w: b.portrait ? 55 : 50, h: b.portrait ? 5 : 7 }, { fontFamily: SANS, size: 50, color: "#e9e1f7", align: "left", vertical: "middle" }, fade(600)).page;
    },
  },
  {
    id: "notices",
    name: msg("Notices"),
    category: "Announcements",
    build: (aspect) => {
      const b = new Build("Notices", aspect, preset("sea"));
      const x = b.portrait ? 9 : 10;
      return b
        .icon("calendar", { x, y: b.portrait ? 14 : 13, w: b.portrait ? 9 : 4.2, h: b.portrait ? 6 : 7.5 }, "#7fd1c0", fade())
        .text("Title", "This week", { x: x + (b.portrait ? 12 : 6), y: b.portrait ? 12 : 11, w: 70, h: b.portrait ? 10 : 12 }, { fontFamily: SERIF, size: 110, color: "#ffffff", align: "left", vertical: "middle" }, rise(100))
        .shape("line", solid("#7fd1c0"), { x, y: b.portrait ? 25 : 27, w: b.portrait ? 82 : 80, h: 0.35 }, {}, fade(250))
        .text(
          "Notices",
          "Tuesday · Bible study, 7 pm\nThursday · Choir rehearsal, 6 pm\nSaturday · Men's breakfast, 8 am\nNext Sunday · Baptisms after the service",
          { x, y: b.portrait ? 29 : 32, w: b.portrait ? 82 : 80, h: b.portrait ? 54 : 56 },
          { fontFamily: SANS, size: 56, color: "#e3f4f2", align: "left", vertical: "top" },
          rise(350),
        ).page;
    },
  },
  {
    id: "verse-card",
    name: msg("Verse card"),
    category: "Scripture",
    build: (aspect) => {
      const b = new Build("Verse", aspect, preset("olive"));
      return b
        .text("Verse", "“The Lord is my shepherd; I shall not want.”", { x: 10, y: b.portrait ? 24 : 20, w: 80, h: b.portrait ? 40 : 46 }, { fontFamily: SERIF, size: 120, color: "#fbf8ef", align: "center", vertical: "middle" }, fade(0, 900))
        .shape("line", solid("#c9d39a"), { x: 46, y: b.portrait ? 68 : 71, w: 8, h: 0.4 }, {}, fade(500))
        .text("Reference", "Psalm 23:1", { x: 20, y: b.portrait ? 70 : 74, w: 60, h: b.portrait ? 6 : 9 }, { fontFamily: SANS, size: 48, color: "#d9e2b4", align: "center", vertical: "top", uppercase: true }, fade(650)).page;
    },
  },
  {
    id: "verse-side",
    name: msg("Verse with a side bar"),
    category: "Scripture",
    build: (aspect) => {
      const b = new Build("Verse", aspect, solid("#141418"));
      return b
        .shape("rect", preset("pentecost"), b.portrait ? { x: 0, y: 0, w: 100, h: 1.4 } : { x: 0, y: 0, w: 1.6, h: 100 }, {}, fade())
        .icon("book-open", { x: 10, y: b.portrait ? 16 : 14, w: b.portrait ? 9 : 4.5, h: b.portrait ? 6 : 8 }, "#ffb03a", fade(150))
        .text("Reference", "John 3:16", { x: b.portrait ? 22 : 16, y: b.portrait ? 15.5 : 13.5, w: 60, h: b.portrait ? 7 : 9 }, { fontFamily: SANS, size: 52, bold: true, color: "#ffb03a", align: "left", vertical: "middle" }, fade(200))
        .text("Verse", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", { x: 10, y: b.portrait ? 26 : 28, w: b.portrait ? 80 : 78, h: b.portrait ? 56 : 58 }, { fontFamily: SERIF, size: 92, color: "#f4efe8", align: "left", vertical: "top" }, rise(300, 800)).page;
    },
  },
  {
    id: "sermon-series",
    name: msg("Sermon series"),
    category: "Sermon",
    build: (aspect) => {
      const b = new Build("Sermon", aspect, preset("dusk"));
      return b
        .text("Series", "The Sermon on the Mount", { x: 10, y: b.portrait ? 26 : 22, w: 80, h: b.portrait ? 6 : 8 }, { fontFamily: SANS, size: 46, bold: true, color: "#f3b3c3", align: "center", vertical: "middle", uppercase: true }, fade())
        .text("Title", "Salt and Light", { x: 6, y: b.portrait ? 33 : 31, w: 88, h: b.portrait ? 22 : 32 }, { fontFamily: SERIF, size: 200, color: "#ffffff", align: "center", vertical: "middle" }, rise(150, 800))
        .icon("mic", { x: b.portrait ? 30 : 39, y: b.portrait ? 61 : 69, w: b.portrait ? 6 : 3, h: b.portrait ? 4 : 5.4 }, "#f3b3c3", fade(500))
        .text("Speaker", "Pastor Ama Mensah", { x: b.portrait ? 37 : 42.5, y: b.portrait ? 60.5 : 68.4, w: b.portrait ? 50 : 30, h: b.portrait ? 5 : 6.6 }, { fontFamily: SANS, size: 48, color: "#ead5ee", align: "left", vertical: "middle" }, fade(550)).page;
    },
  },
  {
    id: "giving",
    name: msg("Giving"),
    category: "Giving",
    build: (aspect) => {
      const b = new Build("Giving", aspect, preset("glory"));
      if (b.portrait) {
        return b
          .icon("hand-heart", { x: 43, y: 12, w: 14, h: 9 }, "#3b1f05", fade())
          .text("Title", "Give", { x: 10, y: 22, w: 80, h: 14 }, { fontFamily: SERIF, size: 180, color: "#2b1503", align: "center", vertical: "middle" }, rise(150))
          .text("Words", "Scan to give online, or use the boxes at the doors.", { x: 12, y: 37, w: 76, h: 12 }, { fontFamily: SANS, size: 52, color: "#3b1f05", align: "center", vertical: "top" }, rise(300))
          .qr({ x: 32, y: 54, w: 36, h: 22 }).page;
      }
      return b
        .icon("hand-heart", { x: 10, y: 22, w: 6, h: 11 }, "#3b1f05", fade())
        .text("Title", "Give", { x: 10, y: 34, w: 46, h: 22 }, { fontFamily: SERIF, size: 200, color: "#2b1503", align: "left", vertical: "middle" }, rise(150))
        .text("Words", "Scan to give online, or use the boxes at the doors.", { x: 10.4, y: 57, w: 44, h: 18 }, { fontFamily: SANS, size: 54, color: "#3b1f05", align: "left", vertical: "top" }, rise(300))
        .qr({ x: 62, y: 20, w: 28, h: 56 }).page;
    },
  },
  {
    id: "prayer",
    name: msg("Prayer"),
    category: "Sermon",
    build: (aspect) => {
      const b = new Build("Prayer", aspect, preset("advent"));
      return b
        .icon("sparkles", { x: 46, y: b.portrait ? 30 : 26, w: 8, h: b.portrait ? 5 : 10 }, "#d8c3ff", fade(0, 1200))
        .text("Title", "Let us pray", { x: 8, y: b.portrait ? 38 : 39, w: 84, h: b.portrait ? 16 : 24 }, { fontFamily: SERIF, size: 170, color: "#f5efff", align: "center", vertical: "middle" }, fade(300, 1200)).page;
    },
  },
  {
    id: "lt-name",
    name: msg("Name bar"),
    category: "Lower thirds",
    clear: true,
    build: (aspect) => {
      const b = new Build("Name bar", aspect, null);
      const y = b.portrait ? 80 : 74;
      const w = b.portrait ? 92 : 46;
      return b
        .shape("rect", preset("bar"), { x: 4, y, w, h: b.portrait ? 11 : 16 }, { radius: "4" }, fromLeft())
        .shape("rect", solid("#f2c46b"), { x: 4, y, w: b.portrait ? 1.6 : 0.7, h: b.portrait ? 11 : 16 }, {}, fade(150))
        .text("Name", "Pastor Ama Mensah", { x: b.portrait ? 9 : 6.5, y: y + (b.portrait ? 0.8 : 1.5), w: w - 6, h: b.portrait ? 5.6 : 8 }, { fontFamily: SANS, size: 64, bold: true, color: "#ffffff", align: "left", vertical: "middle" }, rise(250, 500))
        .text("Role", "Senior pastor", { x: b.portrait ? 9 : 6.5, y: y + (b.portrait ? 6 : 9), w: w - 6, h: b.portrait ? 4 : 5.6 }, { fontFamily: SANS, size: 40, color: "#c9d6ff", align: "left", vertical: "middle" }, rise(380, 500)).page;
    },
  },
  {
    id: "lt-scripture",
    name: msg("Scripture reference"),
    category: "Lower thirds",
    clear: true,
    build: (aspect) => {
      const b = new Build("Scripture bar", aspect, null);
      const y = b.portrait ? 82 : 78;
      const glass: Fill = { kind: "linear", angle: 90, stops: [{ color: "#2a0705e6", at: 0 }, { color: "#7a2312cc", at: 100 }] };
      return b
        .shape("rect", glass, { x: 4, y, w: b.portrait ? 92 : 34, h: b.portrait ? 8 : 11 }, { radius: "50", shadow: "soft" }, fromLeft())
        .icon("book-open", { x: b.portrait ? 8 : 5.6, y: y + (b.portrait ? 2.2 : 3), w: b.portrait ? 7 : 2.8, h: b.portrait ? 3.6 : 5 }, "#ffb03a", fade(250))
        .text("Reference", "Romans 8:28", { x: b.portrait ? 17 : 9.4, y: y + (b.portrait ? 1.2 : 1.6), w: b.portrait ? 75 : 27, h: b.portrait ? 5.6 : 8 }, { fontFamily: SANS, size: 58, bold: true, color: "#fff4e6", align: "left", vertical: "middle" }, rise(300, 450)).page;
    },
  },
  {
    id: "lt-song",
    name: msg("Song title"),
    category: "Lower thirds",
    clear: true,
    build: (aspect) => {
      const b = new Build("Song bar", aspect, null);
      const y = b.portrait ? 80 : 75;
      const glass: Fill = { kind: "linear", angle: 90, stops: [{ color: "#0b0b10d9", at: 0 }, { color: "#0b0b1099", at: 70 }, { color: "#0b0b1000", at: 100 }] };
      return b
        .shape("rect", glass, { x: 0, y, w: b.portrait ? 100 : 56, h: b.portrait ? 12 : 15 }, {}, fade(0, 500))
        .icon("music", { x: b.portrait ? 6 : 4, y: y + (b.portrait ? 3.4 : 4.2), w: b.portrait ? 8 : 3.4, h: b.portrait ? 5 : 6.4 }, "#e93d82", fade(200))
        .text("Song", "Great Is Thy Faithfulness", { x: b.portrait ? 17 : 9, y: y + (b.portrait ? 1.4 : 1.8), w: b.portrait ? 78 : 44, h: b.portrait ? 5.4 : 7 }, { fontFamily: SERIF, size: 66, color: "#ffffff", align: "left", vertical: "middle" }, rise(250, 500))
        .text("Writers", "Thomas Chisholm · William Runyan", { x: b.portrait ? 17 : 9, y: y + (b.portrait ? 6.6 : 8.6), w: b.portrait ? 78 : 44, h: b.portrait ? 4 : 5 }, { fontFamily: SANS, size: 36, color: "#c8c8d4", align: "left", vertical: "middle" }, rise(400, 500)).page;
    },
  },
  {
    id: "lt-minimal",
    name: msg("Minimal line"),
    category: "Lower thirds",
    clear: true,
    build: (aspect) => {
      const b = new Build("Minimal", aspect, null);
      const y = b.portrait ? 82 : 78;
      return b
        .text("Name", "Kwame Asante", { x: b.portrait ? 8 : 6, y, w: b.portrait ? 84 : 40, h: b.portrait ? 6 : 8 }, { fontFamily: SANS, size: 64, bold: true, color: "#ffffff", align: "left", vertical: "bottom", shadow: true }, rise(0, 500))
        .shape("line", solid("#ffffff"), { x: b.portrait ? 8 : 6, y: y + (b.portrait ? 6.6 : 9), w: b.portrait ? 30 : 14, h: 0.35 }, { shadow: "soft" }, fromLeft(200, 600))
        .text("Role", "Worship leader", { x: b.portrait ? 8 : 6, y: y + (b.portrait ? 7.4 : 10), w: b.portrait ? 84 : 40, h: b.portrait ? 4 : 5.4 }, { fontFamily: SANS, size: 40, color: "#e6e6ee", align: "left", vertical: "top", shadow: true }, rise(350, 500)).page;
    },
  },
];
