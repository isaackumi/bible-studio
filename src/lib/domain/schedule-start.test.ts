import { describe, expect, it } from "vitest";
import { planSchedule, shiftSchedule, startCheck } from "./schedule";
import type { Service } from "./types";

const service: Service = {
  id: "s",
  name: "Sunday",
  updatedAt: "",
  startTime: "08:00",
  sections: [
    { id: "a", name: "Welcome", items: [], minutes: 10 },
    { id: "b", name: "Worship", items: [], until: "09:00" },
    { id: "c", name: "Word", items: [], minutes: 45 },
  ],
};

describe("starting a service", () => {
  it("knows when the start is on time, late or early", () => {
    expect(startCheck(service, 8 * 60 + 1)).toEqual({ kind: "on-time", planned: 480 });
    expect(startCheck(service, 10 * 60)).toEqual({ kind: "late", planned: 480, by: 120 });
    expect(startCheck(service, 7 * 60 + 30)).toEqual({ kind: "early", planned: 480, by: 30 });
  });

  it("moves the whole plan to the real start, keeping every part's length", () => {
    const moved = shiftSchedule(service, 10 * 60 + 4);
    expect(moved.startTime).toBe("10:04");
    const before = planSchedule(service);
    const after = planSchedule(moved);
    expect(after.slots.map((slot) => slot.minutes)).toEqual(before.slots.map((slot) => slot.minutes));
    expect(after.slots[0]!.start).toBe(604);
    expect(after.end - after.start).toBe(before.end - before.start);
    expect(moved.sections[1]!.until).toBe("11:04");
  });
});

import { clockCount, partState } from "./schedule";

describe("part timers", () => {
  it("counts in minutes and seconds, hours when long", () => {
    expect(clockCount(754_000)).toBe("12:34");
    expect(clockCount(3_725_000)).toBe("1:02:05");
    expect(clockCount(-5_000)).toBe("0:00");
  });

  it("warns near the end of a part, and when it runs over", () => {
    expect(partState(45, 20 * 60_000)).toBe("ok");
    expect(partState(45, 4 * 60_000)).toBe("soon");
    expect(partState(5, 90_000)).toBe("ok");
    expect(partState(5, 50_000)).toBe("soon");
    expect(partState(30, -1)).toBe("over");
  });
});
