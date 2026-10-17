import { describe, expect, it } from "vitest";
import { emptyFavorites, favoritesFirst, isFavorite, isFavoritePassage, sanitizeFavorites, toggleFavorite, toggleFavoritePassage } from "./favorites";

const john = { translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 16, reference: "John 3:16" };

describe("favorites", () => {
  it("stars and unstars, newest first", () => {
    let favorites = toggleFavorite(emptyFavorites(), "songs", "a");
    favorites = toggleFavorite(favorites, "songs", "b");
    expect(favorites.songs).toEqual(["b", "a"]);
    expect(isFavorite(favorites, "songs", "a")).toBe(true);
    favorites = toggleFavorite(favorites, "songs", "a");
    expect(isFavorite(favorites, "songs", "a")).toBe(false);
  });

  it("keeps a verse by its place in the Bible, whatever the translation", () => {
    const favorites = toggleFavoritePassage(emptyFavorites(), john);
    expect(isFavoritePassage(favorites, { ...john, translationId: "web" })).toBe(true);
    expect(toggleFavoritePassage(favorites, { ...john, translationId: "web" }).passages).toEqual([]);
  });

  it("puts starred items first without changing the rest of the order", () => {
    expect(favoritesFirst(["a", "b", "c", "d"], (id) => id === "c" || id === "d")).toEqual(["c", "d", "a", "b"]);
  });

  it("cleans saved data", () => {
    const clean = sanitizeFavorites({ songs: ["a", "a", 3, ""], passages: [john, john, { reference: "bad" }], themes: "x" });
    expect(clean.songs).toEqual(["a"]);
    expect(clean.passages).toHaveLength(1);
    expect(clean.themes).toEqual([]);
  });
});
