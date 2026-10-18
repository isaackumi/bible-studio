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
