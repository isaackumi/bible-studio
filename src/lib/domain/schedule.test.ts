import { describe, expect, it } from "vitest";
import { clockValue, leftLabel, lengthLabel, parseClock, planSchedule, sectionTiming, slotNow } from "./schedule";

const section = (id: string, timing: { minutes?: number; until?: string } = {}) => ({ id, name: id, items: [], ...timing });
// The example: prayer an hour from 8, the Word 45 minutes, worship until 11, preaching 45, then offering and announcements.
const service = {
  startTime: "08:00",
  sections: [
    section("Opening prayer", { minutes: 60 }),
    section("School of the Word", { minutes: 45 }),
    section("Worship", { until: "11:00" }),
    section("Preaching", { minutes: 45 }),
    section("Offering", { minutes: 10 }),
    section("Announcements"),
  ],
};

describe("service timing", () => {
  it("lays the sections out one after another", () => {
    const plan = planSchedule(service);
    expect(plan.slots.map((slot) => `${slot.sectionId} ${clockValue(slot.start)}–${clockValue(slot.end)}`)).toEqual([
      "Opening prayer 08:00–09:00",
      "School of the Word 09:00–09:45",
      "Worship 09:45–11:00",
      "Preaching 11:00–11:45",
      "Offering 11:45–11:55",
      "Announcements 11:55–11:55",
    ]);
    expect(plan.slots[2]).toMatchObject({ until: true, minutes: 75 });
    expect(plan.slots[5]?.untimed).toBe(true);
    expect(clockValue(plan.end)).toBe("11:55");
  });

  it("never runs a fixed end backwards", () => {
    const plan = planSchedule({ startTime: "10:30", sections: [section("A", { minutes: 60 }), section("B", { until: "11:00" })] });
    expect(plan.slots[1]).toMatchObject({ start: 690, end: 690, minutes: 0 });
  });

  it("says how much is left and how late it runs", () => {
    const plan = planSchedule(service);
    // Preaching began at 11:10, ten minutes late; at 11:40 there are 15 minutes left.
    expect(slotNow(plan, "Preaching", parseClock("11:40")!, parseClock("11:10")!)).toEqual({ sectionId: "Preaching", left: 15, minutes: 45, behind: 10 });
    // Worship ends at 11:00 whenever it began.
    expect(slotNow(plan, "Worship", parseClock("11:04")!, parseClock("09:50")!)?.left).toBe(-4);
    expect(slotNow(plan, "Announcements", 700, null)).toBeNull();
    expect(leftLabel(15)).toBe("15 min left");
    expect(leftLabel(-4)).toBe("4 min over");
    expect(lengthLabel(75)).toBe("1 h 15");
  });

  it("keeps a timing clean", () => {
    expect(sectionTiming({ minutes: 44.6 })).toEqual({ minutes: 45, until: undefined });
    expect(sectionTiming({ until: "9:05" })).toEqual({ minutes: undefined, until: "09:05" });
    expect(sectionTiming({ until: "25:00" })).toEqual({ minutes: undefined, until: undefined });
    expect(sectionTiming({ minutes: null })).toEqual({ minutes: undefined, until: undefined });
  });
});

describe("section deadlines", () => {
  it("ends a length after it began, and a clock end on that day", async () => {
    const { sectionDeadline, readSavedStarts } = await import("./schedule");
    const plan = planSchedule(service);
    const began = new Date(2026, 9, 18, 11, 10).getTime();
    expect(sectionDeadline(plan, "Preaching", began)).toEqual({ sectionId: "Preaching", name: "Preaching", endsAt: began + 45 * 60_000 });
    expect(sectionDeadline(plan, "Worship", new Date(2026, 9, 18, 9, 50).getTime())?.endsAt).toBe(new Date(2026, 9, 18, 11, 0).getTime());
    expect(sectionDeadline(plan, "Preaching", null)).toBeNull();
    const saved = JSON.stringify({ day: "Sun Oct 18 2026", serviceId: "s1", starts: { a: 5, b: "x" } });
    expect(readSavedStarts(saved, "s1", "Sun Oct 18 2026")).toEqual({ a: 5 });
    expect(readSavedStarts(saved, "s1", "Mon Oct 19 2026")).toEqual({});
    expect(readSavedStarts("not json", "s1", "Sun Oct 18 2026")).toEqual({});
  });
});
