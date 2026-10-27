import { describe, expect, it } from "vitest";
import { itemMinutes, withItemDetails } from "./item-details";
import type { PresentationItem } from "./types";

const item: PresentationItem = { id: "a", kind: "announcement", title: "Youth camp" };

describe("an item's who, how long and notes", () => {
  it("sets them trimmed and in range, and takes blank ones off", () => {
    const set = withItemDetails(item, { owner: "  Ama ", minutes: 3.4, notes: " mention the camp " });
    expect(set).toMatchObject({ owner: "Ama", minutes: 3, notes: "mention the camp" });
    expect(withItemDetails(set, { minutes: 999 }).minutes).toBe(240);
    const cleared = withItemDetails(set, { owner: "", minutes: null, notes: "  " });
    expect(cleared).toEqual(item);
  });

  it("leaves what was not given as it was", () => {
    const set = withItemDetails(item, { owner: "The choir" });
    expect(withItemDetails(set, { minutes: 5 })).toMatchObject({ owner: "The choir", minutes: 5 });
  });

  it("adds up a part's minutes", () => {
    expect(itemMinutes([{ ...item, minutes: 3 }, item, { ...item, id: "b", minutes: 4 }])).toBe(7);
  });
});
