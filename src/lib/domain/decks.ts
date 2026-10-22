import {
  addLayer,
  createComposition,
  duplicateLook,
  sanitizeComposition,
  setCompositionBackground,
  sourceRef,
  type Composition,
  type LayerBounds,
  type PageBackground,
} from "./composition";
import { encodeIconNodes, sanitizeIconNodes, type IconNode } from "./icon";
import { encodeTextStyle } from "./text-style";
import type { PresentationItem, SlideDeckDocument, TextStyle } from "./types";

/**
 * Slide decks: a named list of pages. Each page is a Composition (layers on a 1920×1080 canvas),
 * so pages paint, preview and go live exactly like scenes.
 */
export type SlideDeck = { id: string; name: string; updatedAt: string; pages: Composition[] };

export const MAX_DECK_PAGES = 200;

const DEFAULT_BACKGROUND: PageBackground = {
  type: "gradient",
  color: "#e8603c",
  to: "#3b1d0e",
  angle: 135,
  assetId: "",
  imageUrl: "",
  overlay: "#000000",
  overlayOpacity: 0,
};

function uid(prefix: string) {
  return `${prefix}:${Math.random().toString(36).slice(2, 10)}`;
}

/** A text element: its own layer with its own style. Body lines become lines on screen. */
export function addTextElement(page: Composition, text: string, bounds: LayerBounds, style: TextStyle = {}, name = "Text"): Composition {
  const encoded = encodeTextStyle(style);
  return addLayer(page, {
    name,
    bounds,
    fit: "contain",
    source: sourceRef("text", "text", name, { heading: "", body: text, ...(encoded ? { style: encoded } : {}) }),
  });
}

export function addShapeElement(page: Composition, kind: "rect" | "ellipse" | "line", fill: string, bounds: LayerBounds): Composition {
  const name = kind === "ellipse" ? "Ellipse" : kind === "line" ? "Line" : "Rectangle";
  return addLayer(page, {
    name,
    bounds,
    fit: "fill",
    source: sourceRef("shape", kind, name, { kind, fill, radius: kind === "rect" ? "6" : "0" }),
  });
}

/** An icon: its shapes are kept in the page (icon.ts), drawn as outlines in one colour. */
export function addIconElement(page: Composition, icon: { name: string; nodes: IconNode[] }, bounds: LayerBounds = { x: 44, y: 38, w: 12, h: 24 }): Composition {
  const title = icon.name.replace(/-/g, " ");
  return addLayer(page, {
    name: title.charAt(0).toUpperCase() + title.slice(1),
    bounds,
    fit: "contain",
    source: sourceRef("icon", icon.name, title, { nodes: encodeIconNodes(sanitizeIconNodes(icon.nodes)), color: "#ffffff", strokeWidth: "2" }),
  });
}

export function addImageElement(page: Composition, asset: { id: string; name: string; url: string }, bounds: LayerBounds = { x: 25, y: 20, w: 50, h: 60 }): Composition {
  return addLayer(page, { name: asset.name || "Image", bounds, fit: "contain", source: sourceRef("image", asset.id, asset.name || "Image", { assetId: asset.id, imageUrl: asset.url }) });
}

export function addQrElement(page: Composition, data: string, bounds: LayerBounds = { x: 70, y: 50, w: 26, h: 44 }): Composition {
  return addLayer(page, {
    name: "QR code",
    bounds,
    fit: "contain",
    source: sourceRef("qr", "qr", "QR code", { data, pattern: "rounded", dark: "#000000", light: "#ffffff", caption: "" }),
  });
}

/**
 * A deck from pictures of pages (a PDF): one full-screen page per picture on black, kept whole
 * so nothing is cropped off a page. Pages change with a cut, like turning a page.
 */
export function deckFromPageImages(name: string, pages: Array<{ id: string; name: string; url: string }>, now = new Date()): SlideDeck {
  return {
    id: uid("deck"),
    name: name.trim() || "Document",
    updatedAt: now.toISOString(),
    pages: pages.map((asset, index) => {
      const page = setCompositionBackground(createComposition(`Page ${index + 1}`), { ...DEFAULT_BACKGROUND, type: "color", color: "#000000" });
      return { ...addImageElement(page, asset, { x: 0, y: 0, w: 100, h: 100 }), transition: { type: "cut", ms: 0 } };
    }),
  };
}

/** A fresh page: gradient background, a title and a subtitle ready to edit. */
export function newPage(name = "Page"): Composition {
  let page = setCompositionBackground(createComposition(name), DEFAULT_BACKGROUND);
  page = addTextElement(page, "Double click to edit title", { x: 8, y: 30, w: 84, h: 22 }, { size: 110, bold: true, color: "#111111" }, "Title");
  page = addTextElement(page, "Double click to edit subtitle", { x: 12, y: 54, w: 76, h: 14 }, { size: 64, bold: true, color: "#4a4a4a" }, "Subtitle");
  return { ...page, transition: { type: "fade", ms: 300 } };
}

export function createDeck(name: string, now = new Date()): SlideDeck {
  return { id: uid("deck"), name: name.trim() || "Untitled deck", updatedAt: now.toISOString(), pages: [newPage("Page 1")] };
}

export function sanitizeDeck(value: unknown): SlideDeck | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SlideDeckDocument>;
  if (typeof record.id !== "string" || !record.id) return null;
  const pages = (Array.isArray(record.pages) ? record.pages : []).slice(0, MAX_DECK_PAGES).map((page) => sanitizeComposition(page));
  return {
    id: record.id,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : "Untitled deck",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    pages: pages.length ? pages : [newPage("Page 1")],
  };
}

const touched = (deck: SlideDeck, pages: Composition[], now: Date): SlideDeck => ({ ...deck, pages, updatedAt: now.toISOString() });

export function addPage(deck: SlideDeck, after = deck.pages.length - 1, now = new Date()): SlideDeck {
  if (deck.pages.length >= MAX_DECK_PAGES) return deck;
  const pages = deck.pages.slice();
  pages.splice(Math.min(pages.length, Math.max(0, after + 1)), 0, newPage(`Page ${deck.pages.length + 1}`));
  return touched(deck, pages, now);
}

/** Put a page (from a template) after the given one. */
export function insertPage(deck: SlideDeck, page: Composition, after = deck.pages.length - 1, now = new Date()): SlideDeck {
  if (deck.pages.length >= MAX_DECK_PAGES) return deck;
  const pages = deck.pages.slice();
  pages.splice(Math.min(pages.length, Math.max(0, after + 1)), 0, page);
  return touched(deck, pages, now);
}

export function duplicatePage(deck: SlideDeck, index: number, now = new Date()): SlideDeck {
  const page = deck.pages[index];
  if (!page || deck.pages.length >= MAX_DECK_PAGES) return deck;
  const copy = { ...duplicateLook(page), name: page.name };
  const pages = deck.pages.slice();
  pages.splice(index + 1, 0, copy);
  return touched(deck, pages, now);
}

/** A deck always keeps at least one page. */
export function removePage(deck: SlideDeck, index: number, now = new Date()): SlideDeck {
  if (deck.pages.length <= 1 || !deck.pages[index]) return deck;
  return touched(deck, deck.pages.filter((_, at) => at !== index), now);
}

export function movePage(deck: SlideDeck, from: number, to: number, now = new Date()): SlideDeck {
  const target = Math.max(0, Math.min(deck.pages.length - 1, to));
  if (!deck.pages[from] || from === target) return deck;
  const pages = deck.pages.slice();
  const [page] = pages.splice(from, 1);
  pages.splice(target, 0, page!);
  return touched(deck, pages, now);
}

export function replacePage(deck: SlideDeck, index: number, page: Composition, now = new Date()): SlideDeck {
  if (!deck.pages[index]) return deck;
  return touched(deck, deck.pages.map((entry, at) => (at === index ? sanitizeComposition(page) : entry)), now);
}

export function duplicateDeck(deck: SlideDeck, now = new Date()): SlideDeck {
  return { id: uid("deck"), name: `${deck.name} copy`, updatedAt: now.toISOString(), pages: deck.pages.map((page) => ({ ...duplicateLook(page), name: page.name })) };
}

/** Service queue entry for a deck; selecting it previews the first page. */
export function deckItem(deck: SlideDeck): PresentationItem {
  return { id: uid("item"), kind: "deck", title: deck.name, deck: { deckId: deck.id } };
}

/** Next/previous page, or null at either end so stepping can move on in the rundown. */
export function stepDeckPage(deck: SlideDeck, index: number, direction: 1 | -1): number | null {
  const next = index + direction;
  return next >= 0 && next < deck.pages.length ? next : null;
}

/** The words on a slide page (headings, text, scripture, lyrics), for following the sermon. */
export function deckPageText(page: Composition): string {
  const parts = [page.name];
  for (const layer of page.layers) {
    if (!layer.visible) continue;
    for (const key of ["heading", "body", "text", "title", "subtitle", "label", "reference", "lines"]) {
      const value = layer.source.payload[key];
      // Editor placeholders ("Double-click to edit title") are not words on the slide.
      if (value && !/double.?click to edit/i.test(value)) parts.push(value);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** A deck page's source id ("deck:<deck id>:<page>") read back; deck ids may hold colons themselves. */
export function deckSource(source: string | null | undefined): { deckId: string; index: number } | null {
  if (!source?.startsWith("deck:")) return null;
  const rest = source.slice(5);
  const cut = rest.lastIndexOf(":");
  const index = Number(rest.slice(cut + 1));
  return cut > 0 && Number.isInteger(index) ? { deckId: rest.slice(0, cut), index } : null;
}

/**
 * A deck from an outline (AI slide generation, or any list of headings): a title slide, then a
 * heading, a line or two and the scripture on each, in the deck's usual look, ready to edit.
 */
export function deckFromOutline(name: string, slides: Array<{ heading: string; body: string; scripture: string }>, now = new Date()): SlideDeck {
  const pages = slides.map((slide, index) => {
    let page = setCompositionBackground(createComposition(slide.heading || `Page ${index + 1}`), DEFAULT_BACKGROUND);
    if (index === 0) {
      page = addTextElement(page, slide.heading, { x: 8, y: 30, w: 84, h: 24 }, { size: 110, bold: true, color: "#111111" }, "Title");
      const sub = [slide.body, slide.scripture].filter(Boolean).join(" · ");
      if (sub) page = addTextElement(page, sub, { x: 12, y: 56, w: 76, h: 14 }, { size: 58, color: "#4a4a4a" }, "Subtitle");
    } else {
      page = addTextElement(page, slide.heading, { x: 8, y: 14, w: 84, h: 18 }, { size: 92, bold: true, color: "#111111" }, "Heading");
      if (slide.body) page = addTextElement(page, slide.body, { x: 10, y: 38, w: 80, h: 34 }, { size: 62, color: "#2b2b2b" }, "Text");
      if (slide.scripture) page = addTextElement(page, slide.scripture, { x: 10, y: 76, w: 80, h: 10 }, { size: 46, bold: true, color: "#8a4b12" }, "Scripture");
    }
    return { ...page, transition: { type: "fade" as const, ms: 300 } };
  });
  return { id: uid("deck"), name: name.trim() || "Slides", updatedAt: now.toISOString(), pages: pages.length ? pages : [newPage("Page 1")] };
}

