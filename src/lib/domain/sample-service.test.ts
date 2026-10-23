import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReference } from "../bible/reference";
import { buildSample, sanitizeSample } from "./sample-service";
import { sanitizeGame } from "./games";

const shipped = JSON.parse(readFileSync(new URL("../../../static/starter/services/sunday-sample.json", import.meta.url), "utf8")) as { games: unknown[] };
const songs = JSON.parse(readFileSync(new URL("../../../static/song-packs/index.json", import.meta.url), "utf8")) as unknown;

let n = 0;
const id = () => `id${++n}`;

describe("the sample service", () => {
  const spec = sanitizeSample(shipped)!;

  it("reads the shipped sample: every part, every reading a real reference", () => {
    expect(spec.sections.map((section) => section.name)).toContain("Sermon");
    for (const section of spec.sections) for (const item of section.items) if ("scripture" in item) expect(parseReference(item.scripture)?.startVerse, item.scripture).toBeTruthy();
    for (const section of spec.sermon!.sections) for (const reference of section.scriptures) expect(parseReference(reference)?.startVerse, reference).toBeTruthy();
    expect(Array.isArray(songs)).toBe(true);
  });

  it("builds a service with songs and readings from this computer, and names what it could not add", () => {
    const built = buildSample(spec, { song: (title) => (title === "Amazing Grace" ? { songId: "s1", sectionId: "v1" } : null), bible: (reference) => ({ translationId: "kjv", bookOrd: 1, chapter: 1, startVerse: 1, endVerse: 1, reference }) }, id, new Date("2026-10-25T09:00:00Z"));
    const items = built.service.sections.flatMap((section) => section.items);
    expect(items.some((item) => item.kind === "lyric" && item.lyric?.songId === "s1")).toBe(true);
    expect(items.filter((item) => item.kind === "bible").length).toBeGreaterThan(4);
    expect(items.some((item) => item.kind === "announcement")).toBe(true);
    expect(built.missing).toContain("Holy, Holy, Holy");
    expect(built.missing).not.toContain("Amazing Grace");
    expect(built.sermon?.sections.every((section) => section.items.length > 0)).toBe(true);
    expect(built.sermon?.date).toBe("2026-10-25");
    expect(new Set([...built.service.sections.map((section) => section.id), ...items.map((item) => item.id)]).size).toBe(built.service.sections.length + items.length);
  });

  it("leaves out readings when no Bible is installed, keeping the rest", () => {
    const built = buildSample(spec, { song: () => ({ songId: "s", sectionId: "v" }), bible: () => null }, id);
    expect(built.service.sections.flatMap((section) => section.items).some((item) => item.kind === "bible")).toBe(false);
    expect(built.missing).toContain("Psalm 100:1-5");
  });

  it("ships a sermon quiz that can be played", () => {
    const game = sanitizeGame(shipped.games[0]);
    expect(game?.questions.length).toBe(5);
    expect(game?.questions.every((question) => question.correct === 0)).toBe(true);
  });

  it("names only songs that are in the starter hymns", async () => {
    const { readZip } = await import("./zip");
    const files = await readZip(new Uint8Array(readFileSync(new URL("../../../static/song-packs/public-domain-hymns.zip", import.meta.url))));
    const titles = files.map((file) => new TextDecoder().decode(file.data).match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/&amp;/g, "&"));
    for (const section of spec.sections) for (const item of section.items) if ("song" in item) expect(titles, item.song).toContain(item.song);
  });
});
