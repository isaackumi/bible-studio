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

describe("the shipped song packs", () => {
  it("offers the starter hymns to every church, and each song reads as OpenLyrics", async () => {
    const { readFileSync } = await import("node:fs");
    const { readZip } = await import("./zip");
    const { parseOpenLyrics } = await import("./openlyrics");
    const root = new URL("../../../static/song-packs/", import.meta.url);
    const packs = sanitizeSongPacks(JSON.parse(readFileSync(new URL("index.json", root), "utf8")));
    const starter = packs.find((pack) => pack.starter);
    expect(starter?.license).toBe("Public domain");
    const files = await readZip(new Uint8Array(readFileSync(new URL(starter!.file, root))));
    expect(files.length).toBe(18);
    for (const file of files) {
      const song = parseOpenLyrics(new TextDecoder().decode(file.data));
      expect(song.title, file.name).toBeTruthy();
      expect(song.sections.length, file.name).toBeGreaterThan(0);
      expect(song.copyright, file.name).toMatch(/^Public domain/);
    }
  });
});
