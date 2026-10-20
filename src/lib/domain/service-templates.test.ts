import { describe, expect, it } from "vitest";
import { planSchedule, clockValue } from "./schedule";
import { defaultTemplates, sanitizeTemplates, serviceFromTemplate, templateFromService } from "./service-templates";

let n = 0;
const id = () => `id${++n}`;

describe("service templates", () => {
  it("starts a service with the template's parts and times", () => {
    const [sunday] = defaultTemplates();
    const service = serviceFromTemplate(sunday!, "Sunday service, 18 Oct", id, new Date("2026-10-18T06:00:00Z"));
    expect(service.startTime).toBe("08:00");
    expect(service.sections.map((section) => section.name)).toEqual(["Opening Prayer", "School of the Word", "Worship", "Preaching", "Offering", "Announcements", "Closing Prayer"]);
    expect(service.sections.every((section) => section.items.length === 0)).toBe(true);
    const plan = planSchedule(service);
    expect(plan.slots.map((slot) => clockValue(slot.start))).toEqual(["08:00", "09:00", "09:45", "11:00", "11:45", "11:55", "12:05"]);
  });

  it("saves a service's shape as a template, without its songs", () => {
    const service = { id: "s", name: "Youth night", startTime: "18:30", updatedAt: "", sections: [{ id: "a", name: "Games", minutes: 20, items: [{ id: "i", kind: "slide", title: "x" }] }, { id: "b", name: "Talk", until: "19:30", items: [] }] };
    expect(templateFromService(service, "", "t1")).toEqual({ id: "t1", name: "Youth night", startTime: "18:30", parts: [{ name: "Games", minutes: 20 }, { name: "Talk", until: "19:30" }] });
  });

  it("reads back only sensible templates", () => {
    expect(sanitizeTemplates(undefined)[0]?.name).toBe("Sunday service");
    expect(sanitizeTemplates([{ id: "x", name: " Midweek ", startTime: "7:00", parts: [{ name: "Prayer", minutes: 30.4 }, { name: "" }, { name: "Talk", until: "99:00" }] }])).toEqual([
      { id: "x", name: "Midweek", startTime: "07:00", parts: [{ name: "Prayer", minutes: 30 }, { name: "Talk" }] },
    ]);
  });
});

describe("templates keep where each part runs", () => {
  it("carries the desk and page from a service to its template and back", async () => {
    const { templateFromService, serviceFromTemplate } = await import("./service-templates");
    const service = { id: "s", name: "Sunday", updatedAt: "", startTime: "09:00", sections: [{ id: "a", name: "Ministration", minutes: 40, desk: "presenter" as const, page: "sermon" as const, items: [] }, { id: "b", name: "Praise", items: [] }] };
    const template = templateFromService(service, "Sunday", "t1");
    expect(template.parts[0]).toEqual({ name: "Ministration", minutes: 40, desk: "presenter", page: "sermon" });
    let n = 0;
    const again = serviceFromTemplate(template, "Next Sunday", () => `id${n++}`, new Date(2026, 9, 25));
    expect(again.sections[0]).toMatchObject({ name: "Ministration", desk: "presenter", page: "sermon" });
    expect(again.sections[1]!.desk).toBeUndefined();
  });
});
