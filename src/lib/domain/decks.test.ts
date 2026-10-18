import { describe, expect, it } from "vitest";
import { presentComposition } from "./composition";
import { addPage, addShapeElement, createDeck, deckItem, duplicatePage, movePage, removePage, replacePage, sanitizeDeck, stepDeckPage } from "./decks";
import { defaultTheme } from "./theme";

const now = new Date("2026-10-16T00:00:00Z");

describe("slide decks", () => {
  it("starts with one editable page: gradient background, title and subtitle", () => {
    const deck = createDeck("Mama A song", now);
    expect(deck.pages).toHaveLength(1);
    const page = deck.pages[0]!;
    expect(page.background?.type).toBe("gradient");
    expect(page.layers.map((layer) => layer.name)).toEqual(["Title", "Subtitle"]);
    const painted = presentComposition(page, { theme: defaultTheme(), now: 0 });
    expect(painted.fill).toContain("linear-gradient(135deg");
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("Double click to edit title");
    expect(painted.layers?.[0]?.model.theme.fontSize).toBe(110);
  });

  it("adds, duplicates, moves and removes pages, always keeping one", () => {
    let deck = createDeck("Announcements", now);
    deck = addPage(deck, 0, now);
    deck = duplicatePage(deck, 1, now);
    expect(deck.pages).toHaveLength(3);
    const first = deck.pages[0]!.id;
    deck = movePage(deck, 0, 2, now);
    expect(deck.pages[2]!.id).toBe(first);
    deck = removePage(removePage(deck, 0, now), 0, now);
    expect(deck.pages).toHaveLength(1);
    expect(removePage(deck, 0, now)).toBe(deck);
  });

  it("replaces an edited page and survives a storage round trip", () => {
    let deck = createDeck("Shapes", now);
    const edited = addShapeElement(deck.pages[0]!, "ellipse", "#ff0000", { x: 10, y: 10, w: 20, h: 20 });
    deck = replacePage(deck, 0, edited, now);
    const back = sanitizeDeck(JSON.parse(JSON.stringify(deck)))!;
    expect(back.pages[0]!.layers.some((layer) => layer.source.type === "shape")).toBe(true);
    const shape = presentComposition(back.pages[0]!, { theme: defaultTheme(), now: 0 }).layers?.find((layer) => layer.model.layout === "shape");
    expect(shape?.model.shape).toEqual({ kind: "ellipse", fill: "#ff0000", radius: 0 });
    expect(sanitizeDeck({ id: "d", pages: [] })!.pages).toHaveLength(1);
    expect(sanitizeDeck({ pages: [] })).toBeNull();
  });

  it("steps pages and queues a deck as one service item", () => {
    const deck = addPage(createDeck("D", now), 0, now);
    expect(stepDeckPage(deck, 0, 1)).toBe(1);
    expect(stepDeckPage(deck, 1, 1)).toBeNull();
    expect(stepDeckPage(deck, 0, -1)).toBeNull();
    expect(deckItem(deck)).toMatchObject({ kind: "deck", title: "D", deck: { deckId: deck.id } });
  });
});

describe("decks from PDF pages", () => {
  it("makes one full-screen page per picture, on black, turning with a cut", async () => {
    const { deckFromPageImages } = await import("./decks");
    const deck = deckFromPageImages("Bulletin", [
      { id: "a1", name: "Bulletin 1", url: "blob:a1" },
      { id: "a2", name: "Bulletin 2", url: "blob:a2" },
    ]);
    expect(deck.name).toBe("Bulletin");
    expect(deck.pages).toHaveLength(2);
    const layer = deck.pages[1]!.layers[0]!;
    expect(layer.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(layer.source.payload.assetId).toBe("a2");
    expect(deck.pages[0]!.transition.type).toBe("cut");
    expect(deck.pages[0]!.background?.color).toBe("#000000");
  });
});

describe("slide words and sources", () => {
  it("reads a page's words, without editor placeholders, and reads deck source ids back", async () => {
    const { addTextElement, deckPageText, deckSource, newPage } = await import("./decks");
    const page = addTextElement(newPage("Point one"), "He wasted his inheritance", { x: 0, y: 0, w: 50, h: 20 });
    const text = deckPageText(page);
    expect(text).toContain("He wasted his inheritance");
    expect(text).not.toMatch(/double.?click/i);
    expect(deckSource("deck:deck:ab12:3")).toEqual({ deckId: "deck:ab12", index: 3 });
    expect(deckSource("song:x:1")).toBeNull();
  });
});
