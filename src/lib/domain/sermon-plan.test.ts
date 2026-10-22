import { describe, expect, it } from "vitest";
import { duplicateSermon, outlineFromNotes, plannedMinutes, referencesIn, sanitizeSermon, sermonSeries } from "./sermon";
import { clockText, paceOf, sectionSpent, sermonSource, tickClock } from "./sermon-clock";
import type { Sermon } from "./types";

function sermon(partial: Partial<Sermon> = {}): Sermon {
  return sanitizeSermon({
    id: "s1",
    title: "Faith",
    speaker: "",
    notes: "",
    updatedAt: "2026-10-01T00:00:00.000Z",
    sections: [
      { id: "a", name: "Opening", notes: "", items: [], minutes: 5 },
      { id: "b", name: "Point", notes: "", items: [{ id: "b-bible", kind: "bible", title: "John 3:16", bible: { translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 16, reference: "John 3:16" } }] },
    ],
    ...partial,
  });
}

describe("sermon plan", () => {
  it("keeps minutes, series and date, and drops nonsense", () => {
    const clean = sermon({ series: "  Faith that works ", date: "2026-10-25" });
    expect(clean.series).toBe("Faith that works");
    expect(clean.date).toBe("2026-10-25");
    expect(clean.sections[0]!.minutes).toBe(5);
    expect(clean.sections[1]!.minutes).toBeUndefined();
    const odd = sanitizeSermon({ ...clean, date: "next week", series: " ", sections: [{ ...clean.sections[0]!, minutes: 999 }, { ...clean.sections[1]!, minutes: -3 }] });
    expect(odd.date).toBeUndefined();
    expect(odd.series).toBeUndefined();
    expect(odd.sections[0]!.minutes).toBe(120);
    expect(odd.sections[1]!.minutes).toBeUndefined();
  });

  it("adds up the planned minutes", () => {
    expect(plannedMinutes(sermon())).toBe(5);
  });

  it("lists series, most used first", () => {
    expect(sermonSeries([sermon({ series: "B" }), sermon({ series: "A" }), sermon({ series: "B" }), sermon()])).toEqual(["B", "A"]);
  });

  it("duplicates with new ids and the same content", () => {
    const copy = duplicateSermon(sermon(), "Faith (copy)", "s2");
    expect(copy.id).toBe("s2");
    expect(copy.title).toBe("Faith (copy)");
    expect(copy.sections.map((section) => section.name)).toEqual(["Opening", "Point"]);
    expect(copy.sections[0]!.id).not.toBe("a");
    expect(copy.sections[1]!.items[0]!.bible?.reference).toBe("John 3:16");
  });
});

describe("references in notes", () => {
  it("finds the references a preacher writes", () => {
    const found = referencesIn("Read John 3:16 and 1 Cor 13:4-7, then Psalm 23. See Romans 8:28 again and John 3:16.");
    expect(found.map((entry) => entry.reference)).toEqual(["John 3:16", "1 Corinthians 13:4-7", "Psalms 23", "Romans 8:28"]);
  });

  it("does not take ordinary words with numbers for references", () => {
    expect(referencesIn("Point 1 is about Mark the builder. Chapter 3 of my book. At 10:30 we pray.")).toEqual([]);
  });
});

describe("outline from notes", () => {
  it("splits at headings and takes the first reference for the screen", () => {
    const parts = outlineFromNotes("Welcome everyone.\n\n1. God loves us\nRead John 3:16 slowly.\n2. We respond:\nRomans 10:9\n# Close\nPray.");
    expect(parts.map((part) => part.name)).toEqual(["Introduction", "God loves us", "We respond", "Close"]);
    expect(parts[1]!.notes).toBe("Read John 3:16 slowly.");
    expect(parts[1]!.scripture).toBe("John 3:16");
    expect(parts[2]!.scripture).toBe("Romans 10:9");
    expect(parts[3]!.scripture).toBe("");
  });

  it("splits at blank lines when there are no headings", () => {
    const parts = outlineFromNotes("Grace\nIt is a gift.\n\nFaith\nEphesians 2:8");
    expect(parts.map((part) => part.name)).toEqual(["Grace", "Faith"]);
    expect(parts[1]!.scripture).toBe("Ephesians 2:8");
  });
});

describe("sermon clock", () => {
  it("reads Program's source, with colons in the sermon id", () => {
    expect(sermonSource("sermon:abc:def")).toEqual({ sermonId: "abc", sectionId: "def" });
    expect(sermonSource("sermon:a:b:c")).toEqual({ sermonId: "a:b", sectionId: "c" });
    expect(sermonSource("bible:1")).toBeNull();
  });

  it("times each section, pausing while something else is live", () => {
    let clock = tickClock(null, "sermon:s:a", 0);
    clock = tickClock(clock, "sermon:s:a", 5_000);
    clock = tickClock(clock, "sermon:s:b", 60_000);
    expect(sectionSpent(clock, "a", 90_000)).toBe(60_000);
    expect(sectionSpent(clock, "b", 90_000)).toBe(30_000);
    clock = tickClock(clock, "song:x", 90_000);
    expect(sectionSpent(clock, "b", 200_000)).toBe(30_000);
    clock = tickClock(clock, "sermon:s:a", 200_000);
    expect(sectionSpent(clock, "a", 210_000)).toBe(70_000);
    expect(clock!.startedAt).toBe(0);
    expect(tickClock(clock, "sermon:other:a", 300_000)!.startedAt).toBe(300_000);
  });

  it("writes times and pace", () => {
    expect(clockText(65_000)).toBe("1:05");
    expect(clockText(3_729_000)).toBe("1:02:09");
    expect(paceOf(60_000, undefined)).toBe("none");
    expect(paceOf(60_000, 5)).toBe("ok");
    expect(paceOf(250_000, 5)).toBe("near");
    expect(paceOf(301_000, 5)).toBe("over");
  });
});
