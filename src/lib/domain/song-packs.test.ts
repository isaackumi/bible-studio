import { describe, expect, it } from "vitest";
import { sanitizeSongPacks } from "./song-packs";

describe("song packs", () => {
  it("keeps valid packs and drops bad or duplicate entries", () => {
    expect(
      sanitizeSongPacks([
        { id: "a", name: "Hymns", file: "hymns.zip", license: "Public domain" },
        { id: "a", name: "Again", file: "again.zip" },
        { id: "b", name: "Escape", file: "../secret.zip" },
        { id: "c", name: "Not zip", file: "c.xml" },
        null,
      ]),
    ).toEqual([{ id: "a", name: "Hymns", folder: "Hymns", file: "hymns.zip", description: "", license: "Public domain" }]);
    expect(sanitizeSongPacks({})).toEqual([]);
  });
});
