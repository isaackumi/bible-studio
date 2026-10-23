// The sample service: a whole Sunday, filled in (welcome slides, songs, readings, the sermon with
// its notes, the offering, announcements, a quiz and the blessing), so a church can see and try
// everything before planning its own. It ships as a small description (static/starter/services)
// and is built here into a real service with this computer's songs and Bible.

import { ANNOUNCEMENT_DESIGNS, type AnnouncementDesign } from "./announcement";
import type { BibleItem, PresentationItem, Service, ServiceSection, Sermon, SermonSection } from "./types";

export type SampleItem =
  | { song: string }
  | { scripture: string }
  | { slide: { heading: string; body: string } }
  | { announcement: { heading: string; body: string; label?: string; design?: AnnouncementDesign } };

export type SampleSection = { name: string; minutes?: number; leader?: string; items: SampleItem[] };

export type SampleSpec = {
  name: string;
  startTime: string;
  sections: SampleSection[];
  sermon?: { title: string; speaker: string; series?: string; notes: string; sections: Array<{ name: string; minutes?: number; notes: string; scriptures: string[] }> };
};

export type SampleResolver = {
  /** A song in the library by its title: its id and first section, or null. */
  song(title: string): { songId: string; sectionId: string } | null;
  /** A reading in the Bible this computer shows, or null when none is installed. */
  bible(reference: string): BibleItem | null;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The parts of the description the builder can use; anything else is left out. */
export function sanitizeSample(value: unknown): SampleSpec | null {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!input || !Array.isArray(input.sections)) return null;
  const item = (raw: unknown): SampleItem | null => {
    const record = raw && typeof raw === "object" ? (raw as Record<string, Record<string, unknown> | string>) : {};
    if (typeof record.song === "string" && record.song.trim()) return { song: text(record.song, 120) };
    if (typeof record.scripture === "string" && record.scripture.trim()) return { scripture: text(record.scripture, 60) };
    const slide = record.slide && typeof record.slide === "object" ? record.slide : null;
    if (slide) return { slide: { heading: text(slide.heading, 120), body: text(slide.body, 1000) } };
    const note = record.announcement && typeof record.announcement === "object" ? record.announcement : null;
    const design = ANNOUNCEMENT_DESIGNS.find((entry) => entry.id === note?.design)?.id;
    if (note) return { announcement: { heading: text(note.heading, 120), body: text(note.body, 1000), ...(text(note.label, 40) ? { label: text(note.label, 40) } : {}), ...(design ? { design } : {}) } };
    return null;
  };
  const sections = input.sections.flatMap((raw): SampleSection[] => {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const name = text(record.name, 60);
    if (!name) return [];
    const minutes = Number(record.minutes);
    return [{ name, ...(Number.isFinite(minutes) && minutes > 0 ? { minutes: Math.round(minutes) } : {}), ...(text(record.leader, 60) ? { leader: text(record.leader, 60) } : {}), items: (Array.isArray(record.items) ? record.items : []).map(item).filter((entry): entry is SampleItem => entry !== null) }];
  });
  const sermonIn = input.sermon && typeof input.sermon === "object" ? (input.sermon as Record<string, unknown>) : null;
  const sermon = sermonIn && text(sermonIn.title, 120)
    ? {
        title: text(sermonIn.title, 120),
        speaker: text(sermonIn.speaker, 80),
        ...(text(sermonIn.series, 80) ? { series: text(sermonIn.series, 80) } : {}),
        notes: text(sermonIn.notes, 4000),
        sections: (Array.isArray(sermonIn.sections) ? sermonIn.sections : []).flatMap((raw) => {
          const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const name = text(record.name, 80);
          const minutes = Number(record.minutes);
          return name ? [{ name, ...(Number.isFinite(minutes) && minutes > 0 ? { minutes: Math.round(minutes) } : {}), notes: text(record.notes, 4000), scriptures: (Array.isArray(record.scriptures) ? record.scriptures : []).map((entry) => text(entry, 60)).filter(Boolean) }] : [];
        }),
      }
    : undefined;
  return sections.length ? { name: text(input.name, 80) || "Sample service", startTime: /^\d{2}:\d{2}$/.test(String(input.startTime)) ? String(input.startTime) : "09:00", sections, ...(sermon ? { sermon } : {}) } : null;
}

/**
 * The sample as a real service (and its sermon), with ids of its own. A song or reading this
 * computer cannot show is left out and named in `missing`, so the rest still works.
 */
export function buildSample(spec: SampleSpec, resolve: SampleResolver, newId: () => string, now = new Date()): { service: Service; sermon: Sermon | null; missing: string[] } {
  const missing: string[] = [];
  const toItem = (entry: SampleItem): Omit<PresentationItem, "id"> | null => {
    if ("song" in entry) {
      const found = resolve.song(entry.song);
      if (!found) missing.push(entry.song);
      return found ? { kind: "lyric", title: entry.song, lyric: found } : null;
    }
    if ("scripture" in entry) {
      const bible = resolve.bible(entry.scripture);
      if (!bible) missing.push(entry.scripture);
      return bible ? { kind: "bible", title: bible.reference, bible } : null;
    }
    if ("slide" in entry) return { kind: "slide", title: entry.slide.heading || "Slide", slide: { heading: entry.slide.heading, body: entry.slide.body, imageId: null } };
    return { kind: "announcement", title: entry.announcement.heading || "Announcement", announcement: { heading: entry.announcement.heading, body: entry.announcement.body, design: entry.announcement.design ?? "card", label: entry.announcement.label ?? "Announcement" } };
  };
  const items = (list: SampleItem[]): PresentationItem[] => list.map(toItem).filter((item): item is Omit<PresentationItem, "id"> => item !== null).map((item) => ({ ...item, id: newId() }) as PresentationItem);
  const sections: ServiceSection[] = spec.sections.map((section) => ({ id: newId(), name: section.name, items: items(section.items), ...(section.minutes ? { minutes: section.minutes } : {}), ...(section.leader ? { leader: section.leader } : {}) }));
  const service: Service = { id: newId(), name: spec.name, startTime: spec.startTime, sections, updatedAt: now.toISOString() };
  const sermon: Sermon | null = spec.sermon
    ? {
        id: newId(),
        title: spec.sermon.title,
        speaker: spec.sermon.speaker,
        notes: spec.sermon.notes,
        ...(spec.sermon.series ? { series: spec.sermon.series } : {}),
        date: now.toISOString().slice(0, 10),
        updatedAt: now.toISOString(),
        sections: spec.sermon.sections.map((section): SermonSection => ({ id: newId(), name: section.name, notes: section.notes, items: items(section.scriptures.map((scripture) => ({ scripture }))), ...(section.minutes ? { minutes: section.minutes } : {}) })),
      }
    : null;
  return { service, sermon, missing: [...new Set(missing)] };
}
