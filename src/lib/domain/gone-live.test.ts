import { describe, expect, it } from "vitest";
import { clearGoneLive, goneLiveKey, goneLiveView, pinGoneLive, recordGoneLive, removeGoneLive, sanitizeGoneLive } from "./gone-live";
import type { BibleItem } from "./types";

const passage = (reference: string, bookOrd: number, chapter: number, startVerse: number, endVerse = startVerse): BibleItem => ({
  translationId: "kjv",
  reference,
  bookOrd,
  chapter,
  startVerse,
  endVerse,
});
const john = passage("John 3:16", 43, 3, 16);
const psalm = passage("Psalm 23:1-3", 19, 23, 1, 3);
const romans = passage("Romans 8:28", 45, 8, 28);

describe("scriptures that have gone live", () => {
  it("keeps every passage in the order it first went live", () => {
    let list = recordGoneLive([], john, 1000);
    list = recordGoneLive(list, psalm, 2000);
    list = recordGoneLive(list, john, 3000);
    list = recordGoneLive(list, romans, 4000);
    expect(list.map((entry) => entry.passage.reference)).toEqual(["John 3:16", "Psalm 23:1-3", "Romans 8:28"]);
    expect(list[0]).toMatchObject({ times: 2, firstAt: new Date(1000).toISOString(), lastAt: new Date(3000).toISOString() });
  });

  it("pins to the top, removes and brings back", () => {
    let list = [john, psalm, romans].reduce((acc, item, n) => recordGoneLive(acc, item, n), [] as ReturnType<typeof recordGoneLive>);
    list = pinGoneLive(list, goneLiveKey(romans), true);
    list = removeGoneLive(list, goneLiveKey(psalm), true);
    let view = goneLiveView(list);
    expect(view.pinned.map((entry) => entry.passage.reference)).toEqual(["Romans 8:28"]);
    expect(view.rest.map((entry) => entry.passage.reference)).toEqual(["John 3:16"]);
    expect(view.removed.map((entry) => entry.passage.reference)).toEqual(["Psalm 23:1-3"]);
    list = removeGoneLive(list, goneLiveKey(psalm), false);
    view = goneLiveView(list);
    expect(view.rest.map((entry) => entry.passage.reference)).toEqual(["John 3:16", "Psalm 23:1-3"]);
    // Going live again brings a removed passage back too.
    list = removeGoneLive(list, goneLiveKey(john), true);
    list = recordGoneLive(list, john, 9);
    expect(goneLiveView(list).removed).toEqual([]);
    expect(clearGoneLive(list).map((entry) => entry.passage.reference)).toEqual(["Romans 8:28"]);
  });

  it("searches without changing the order", () => {
    const list = [romans, john, passage("John 1:1", 43, 1, 1), psalm].reduce((acc, item, n) => recordGoneLive(acc, item, n), [] as ReturnType<typeof recordGoneLive>);
    expect(goneLiveView(list, "jo").rest.map((entry) => entry.passage.reference)).toEqual(["John 3:16", "John 1:1"]);
    expect(goneLiveView(list, "john 3").rest.map((entry) => entry.passage.reference)).toEqual(["John 3:16"]);
    expect(goneLiveView(list, "23:1").rest.map((entry) => entry.passage.reference)).toEqual(["Psalm 23:1-3"]);
  });

  it("reads back only valid entries", () => {
    const saved = JSON.parse(JSON.stringify(recordGoneLive([], john, 5)));
    expect(sanitizeGoneLive([...saved, { passage: { reference: "x" } }, null, saved[0]])).toHaveLength(1);
    expect(sanitizeGoneLive("nope")).toEqual([]);
  });
});

describe("stepping and days", () => {
  it("folds verse steps into the passage they started from", async () => {
    const { goneLiveSpan } = await import("./gone-live");
    const v = (n: number) => passage(`John 3:${n}`, 43, 3, n);
    let list = recordGoneLive([], v(16), 1, { snippet: "For God so loved" });
    list = recordGoneLive(list, v(17), 2, { previous: v(16) });
    list = recordGoneLive(list, v(18), 3, { previous: v(17) });
    expect(list).toHaveLength(1);
    expect(goneLiveSpan(list[0]!)).toEqual({ startVerse: 16, endVerse: 18 });
    expect(list[0]!.snippet).toBe("For God so loved");
    // A jump elsewhere is a new passage; a step from it does not touch John.
    list = recordGoneLive(list, romans, 4, { previous: v(18) });
    list = recordGoneLive(list, passage("Romans 8:29", 45, 8, 29), 5, { previous: romans });
    expect(list.map((entry) => entry.passage.reference)).toEqual(["John 3:16", "Romans 8:28"]);
    expect(goneLiveSpan(list[1]!)).toEqual({ startVerse: 28, endVerse: 29 });
  });

  it("groups by day, newest first", async () => {
    const { goneLiveDays } = await import("./gone-live");
    const now = Date.parse("2026-10-18T12:00:00");
    let list = recordGoneLive([], john, Date.parse("2026-10-11T10:00:00"));
    list = recordGoneLive(list, psalm, Date.parse("2026-10-18T09:00:00"));
    const days = goneLiveDays(list, now);
    expect(days.map((day) => day.label)[0]).toBe("Today");
    expect(days[1]!.entries[0]!.passage.reference).toBe("John 3:16");
  });
});

describe("a verse of a passage", () => {
  it("names one verse from the passage's book", async () => {
    const { goneLiveVerse } = await import("./gone-live");
    const [entry] = recordGoneLive([], psalm, 1);
    expect(goneLiveVerse(entry!, 2)).toMatchObject({ reference: "Psalm 23:2", startVerse: 2, endVerse: 2, chapter: 23, bookOrd: 19 });
    const [song] = recordGoneLive([], passage("1 John 4:8", 62, 4, 8), 1);
    expect(goneLiveVerse(song!, 9).reference).toBe("1 John 4:9");
  });
});
