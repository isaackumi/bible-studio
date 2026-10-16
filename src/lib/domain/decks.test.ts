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
