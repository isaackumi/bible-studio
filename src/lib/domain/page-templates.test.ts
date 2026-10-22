import { describe, expect, it } from "vitest";
import { PAGE_TEMPLATES, TEMPLATE_CATEGORIES } from "./page-templates";
import { compileSource, presentComposition, setSlideResolver, sourceRef } from "./composition";
import { insertPage, sanitizeDeck, type SlideDeck } from "./decks";
import { defaultTheme } from "./theme";

const SHAPES = { wide: 16 / 9, "4:3": 4 / 3, portrait: 9 / 16, ultrawide: 21 / 9 };
const ctx = { theme: defaultTheme(), now: 0 };

describe("page templates", () => {
  it("build for every screen shape, inside the page, and survive saving", () => {
    for (const template of PAGE_TEMPLATES) {
      expect(TEMPLATE_CATEGORIES).toContain(template.category);
      for (const [shape, aspect] of Object.entries(SHAPES)) {
        const page = template.build(aspect);
        expect(page.layers.length, `${template.id} ${shape}`).toBeGreaterThan(0);
        for (const layer of page.layers) {
          const { x, y, w, h } = layer.bounds;
          expect(x >= 0 && y >= 0 && x + w <= 100.01 && y + h <= 100.01, `${template.id} ${shape} ${layer.name} ${JSON.stringify(layer.bounds)}`).toBe(true);
        }
        // A clear page has no background, so it shows what is behind it.
        expect(!page.background, template.id).toBe(!!template.clear);
        expect(!!page.clear, template.id).toBe(!!template.clear);
        if (template.clear) expect(presentComposition(page, ctx).layers?.every((layer) => layer.model.fill === "transparent")).toBe(true);
        expect(page.edges).toBe("touch");
        const deck: SlideDeck = { id: "deck:1", name: "D", updatedAt: "2026-10-22T00:00:00.000Z", pages: [page] };
        expect(sanitizeDeck(JSON.parse(JSON.stringify(deck)))?.pages[0]).toEqual(page);
        expect(presentComposition(page, ctx).layers?.length).toBe(page.layers.length);
      }
    }
  });

  it("lay out differently on a portrait screen, not just smaller", () => {
    const wide = PAGE_TEMPLATES.find((template) => template.id === "giving")!.build(SHAPES.wide);
    const tall = PAGE_TEMPLATES.find((template) => template.id === "giving")!.build(SHAPES.portrait);
    const qr = (page: typeof wide) => page.layers.find((layer) => layer.source.type === "qr")!.bounds;
    expect(qr(wide).x).toBeGreaterThan(50);
    expect(qr(tall).y).toBeGreaterThan(50);
  });

  it("bring a lower third in a piece at a time", () => {
    const page = PAGE_TEMPLATES.find((template) => template.id === "lt-name")!.build(SHAPES.wide);
    const delays = page.layers.map((layer) => layer.animation.delayMs ?? 0);
    expect(delays[0]).toBe(0);
    expect(Math.max(...delays)).toBeGreaterThan(delays[0]!);
  });

  it("show a designed page as a layer of a look, as the deck now has it", () => {
    const page = PAGE_TEMPLATES.find((template) => template.id === "lt-scripture")!.build(SHAPES.wide);
    const deck = insertPage({ id: "deck:2", name: "Bars", updatedAt: "", pages: [] }, page);
    setSlideResolver((deckId, index) => (deckId === deck.id ? (deck.pages[index] ?? null) : null));
    const layer = compileSource(sourceRef("slide", "deck:2:0", "Slide page", { deckId: "deck:2", page: "0" }), ctx);
    expect(layer.layout).toBe("composition");
    expect(layer.layers?.length).toBe(page.layers.length);
    // A missing deck shows nothing rather than failing the look.
    expect(compileSource(sourceRef("slide", "x", "Slide page", { deckId: "gone", page: "0" }), ctx).layout).not.toBe("composition");
    setSlideResolver(null);
  });
});
