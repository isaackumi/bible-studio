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
