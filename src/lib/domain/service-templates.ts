// Service templates: the shape of a usual service (its parts in order, each with its time, and
// when it starts) to begin a new service from in one click. Songs and readings change each week,
// so a template keeps only the parts; a church edits its own, saves a service as one, or adds more.

import { clockValue, parseClock } from "./schedule";
import type { Service } from "./types";
import { cleanPartRun } from "./service";

export type TemplatePart = { name: string; minutes?: number; until?: string; desk?: "service" | "presenter" | "production"; page?: "scriptures" | "songs" | "sermon" };

export type ServiceTemplate = {
  id: string;
  name: string;
  /** "08:00" */
  startTime: string;
  parts: TemplatePart[];
};

const MAX_TEMPLATES = 30;
const MAX_PARTS = 40;

/** A sample to start from (the order a church shared): edit it, or make your own. */
export function defaultTemplates(): ServiceTemplate[] {
  return [
    {
      id: "sunday",
      name: "Sunday service",
      startTime: "08:00",
      parts: [
        { name: "Opening Prayer", minutes: 60 },
        { name: "School of the Word", minutes: 45 },
        { name: "Worship", until: "11:00" },
        { name: "Preaching", minutes: 45 },
        { name: "Offering", minutes: 10 },
        { name: "Announcements", minutes: 10 },
        { name: "Closing Prayer", minutes: 5 },
      ],
    },
  ];
}

function cleanPart(value: unknown): TemplatePart | null {
  const record = value && typeof value === "object" ? (value as Partial<TemplatePart>) : null;
  const name = typeof record?.name === "string" ? record.name.trim().slice(0, 60) : "";
  if (!name) return null;
  // Where the part runs travels with the template, so a church sets it once.
  const run = cleanPartRun(record);
  const where = run ? { desk: run.desk, ...(run.page ? { page: run.page } : {}) } : {};
  const until = parseClock(record?.until);
  if (until !== null) return { name, until: clockValue(until), ...where };
  const minutes = typeof record?.minutes === "number" && Number.isFinite(record.minutes) ? Math.min(600, Math.max(0, Math.round(record.minutes))) : undefined;
  return minutes === undefined ? { name, ...where } : { name, minutes, ...where };
}

export function sanitizeTemplates(value: unknown): ServiceTemplate[] {
  if (!Array.isArray(value)) return defaultTemplates();
  const seen = new Set<string>();
  return value
    .flatMap((raw): ServiceTemplate[] => {
      const record = raw && typeof raw === "object" ? (raw as Partial<ServiceTemplate>) : null;
      if (!record || typeof record.id !== "string" || !record.id || seen.has(record.id)) return [];
      seen.add(record.id);
      const start = parseClock(record.startTime);
      return [
        {
          id: record.id,
          name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 60) : "Service",
          startTime: start === null ? "09:00" : clockValue(start),
          parts: (Array.isArray(record.parts) ? record.parts : []).map(cleanPart).filter((part): part is TemplatePart => part !== null).slice(0, MAX_PARTS),
        },
      ];
    })
    .slice(0, MAX_TEMPLATES);
}

/** A new service from a template: its parts become empty sections with their times. */
export function serviceFromTemplate(template: ServiceTemplate, name: string, newId: () => string, now: Date): Service {
  return {
    id: newId(),
    name,
    startTime: template.startTime,
    updatedAt: now.toISOString(),
    sections: template.parts.map((part) => ({
      id: newId(),
      name: part.name,
      items: [],
      ...(part.until ? { until: part.until } : part.minutes !== undefined ? { minutes: part.minutes } : {}),
      ...(part.desk ? { desk: part.desk } : {}),
      ...(part.page ? { page: part.page } : {}),
    })),
  };
}

/** A service's shape as a template (its sections and times, not its songs or readings). */
export function templateFromService(service: Service, name: string, id: string): ServiceTemplate {
  return {
    id,
    name: name.trim().slice(0, 60) || service.name || "Service",
    startTime: service.startTime ?? "09:00",
    parts: service.sections.map((section) => cleanPart({ name: section.name, minutes: section.minutes, until: section.until, desk: section.desk, page: section.page })).filter((part): part is TemplatePart => part !== null),
  };
}

/** "Sunday service, 18 Oct" from a template and a date. */
export function serviceNameFor(template: ServiceTemplate, date: Date): string {
  return `${template.name}, ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
