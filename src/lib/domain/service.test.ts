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

describe("parts left out this time", () => {
  const item = (id: string) => ({ id, kind: "text", title: id }) as never;
  const service = {
    id: "s",
    name: "Sunday",
    updatedAt: "",
    startTime: "09:00",
    sections: [
      { id: "a", name: "Welcome", minutes: 10, items: [item("a1")] },
      { id: "b", name: "Confession", minutes: 15, skip: true, items: [item("b1"), item("b2")] },
      { id: "c", name: "Sermon", minutes: 30, items: [item("c1")] },
    ],
  };

  it("passes over their items with Next and Previous", async () => {
    const { stepCursor } = await import("./service");
    expect(stepCursor(service, { sectionId: "a", itemId: "a1" }, 1)).toEqual({ sectionId: "c", itemId: "c1" });
    expect(stepCursor(service, { sectionId: "c", itemId: "c1" }, -1)).toEqual({ sectionId: "a", itemId: "a1" });
  });

  it("moves on to the next part that is not left out", async () => {
    const { nextPart } = await import("./service");
    expect(nextPart(service, "a")?.id).toBe("c");
    expect(nextPart(service, null)?.id).toBe("a");
    expect(nextPart(service, "c")).toBeNull();
  });

  it("gives them no time, so the parts after move up", async () => {
    const { planSchedule } = await import("./schedule");
    const plan = planSchedule(service);
    expect(plan.slots[1]).toMatchObject({ minutes: 0, untimed: true, skipped: true });
    expect(plan.slots[2]!.start).toBe(9 * 60 + 10);
    expect(plan.end).toBe(9 * 60 + 40);
  });

  it("leaves them out of the report", async () => {
    const { runParts } = await import("./service-run");
    const run = { id: "r", startedAt: 0, endedAt: 60_000, marks: [{ sectionId: "a", at: 0 }] };
    expect(runParts(service, run, 60_000).map((part) => part.sectionId)).toEqual(["a", "c"]);
  });
});

describe("where a part runs", () => {
  it("never guesses from the name: the part's choice, else the church's choice for that name, else the running order", async () => {
    const { partRun } = await import("./service");
    expect(partRun({ name: "Sermon" })).toEqual({ desk: "service", chosen: false });
    expect(partRun({ name: "Offering", desk: "production" })).toEqual({ desk: "production", chosen: true });
    expect(partRun({ name: "Word", desk: "presenter", page: "songs" })).toEqual({ desk: "presenter", page: "songs", chosen: true });
    const learned = { ministration: { desk: "presenter" as const, page: "scriptures" as const } };
    expect(partRun({ name: "  Ministration " }, learned)).toEqual({ desk: "presenter", page: "scriptures", chosen: true });
    expect(partRun({ name: "Ministration", desk: "service" }, learned).desk).toBe("service");
  });

  it("keeps only known desks and pages when reading the church's choices", async () => {
    const { sanitizePartDesks } = await import("./service");
    expect(sanitizePartDesks({ " Word ": { desk: "presenter", page: "sermon" }, x: { desk: "moon" }, y: { desk: "production", page: "songs" } })).toEqual({ word: { desk: "presenter", page: "sermon" }, y: { desk: "production" } });
  });
});

describe("a part on more than one desk", () => {
  it("keeps the desk it opens on first and the others it uses, without repeats or unknown desks", async () => {
    const { partRun, partDesks, cleanPartRun } = await import("./service");
    const run = partRun({ name: "Ministration", desk: "presenter", page: "songs", also: ["production", "presenter", "service"] });
    expect(run).toEqual({ desk: "presenter", page: "songs", also: ["production", "service"], chosen: true });
    expect(partDesks(run)).toEqual(["presenter", "production", "service"]);
    expect(cleanPartRun({ desk: "production", also: ["moon", "presenter"], page: "sermon" })).toEqual({ desk: "production", page: "sermon", also: ["presenter"] });
  });
});
