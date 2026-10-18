import { describe, expect, it } from "vitest";
import { sectionIdForInsert, stepCursor } from "./service";
import type { Service } from "./types";

const service: Service = {
  id: "svc",
  name: "Sunday Service",
  updatedAt: "0",
  sections: [
    {
      id: "open",
      name: "Opening",
      items: [{ id: "welcome", kind: "slide", title: "Welcome", slide: { heading: "Welcome", body: "", imageId: null } }],
    },
    {
      id: "word",
      name: "Word",
      items: [
        {
          id: "john",
          kind: "bible",
          title: "John 3:16",
          bible: { translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 16, reference: "John 3:16" },
        },
      ],
    },
  ],
};

describe("service cursor", () => {
  it("moves across sections without implying a program change", () => {
    const next = stepCursor(service, { sectionId: "open", itemId: "welcome" }, 1);
    expect(next).toEqual({ sectionId: "word", itemId: "john" });
    const back = stepCursor(service, next, -1);
    expect(back.itemId).toBe("welcome");
  });

  it("queues into the current section, or the first section if the cursor is stale", () => {
    expect(sectionIdForInsert(service, { sectionId: "word", itemId: "john" })).toBe("word");
    expect(sectionIdForInsert(service, { sectionId: "gone", itemId: null })).toBe("open");
    expect(sectionIdForInsert({ ...service, sections: [] }, { sectionId: "open", itemId: null })).toBeNull();
  });
});

describe("dragging in the running order", () => {
  const item = (id: string) => ({ id, kind: "slide", title: id });
  const service = {
    id: "s",
    name: "S",
    updatedAt: "",
    sections: [
      { id: "a", name: "A", items: [item("1"), item("2"), item("3")] },
      { id: "b", name: "B", items: [item("4")] },
    ],
  };
  const ids = (next: typeof service) => next.sections.map((section) => section.items.map((entry) => entry.id).join(""));

  it("moves a section or an item to where it is dropped", async () => {
    const { moveTo, moveItemTo } = await import("./service");
    expect(moveTo(["x", "y", "z"], 2, 0)).toEqual(["z", "x", "y"]);
    expect(moveTo(["x", "y", "z"], 0, 9)).toEqual(["y", "z", "x"]);
    expect(ids(moveItemTo(service, "1", "a", 3))).toEqual(["231", "4"]);
    expect(ids(moveItemTo(service, "3", "a", 0))).toEqual(["312", "4"]);
    expect(ids(moveItemTo(service, "2", "b", 0))).toEqual(["13", "24"]);
    expect(ids(moveItemTo(service, "4", "a", 1))).toEqual(["1423", ""]);
  });
});
