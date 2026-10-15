import { isRundownKind } from "./content";
import { moveInList } from "./service";
import type { PresentationItem, PresentationModel, Sermon, SermonSection } from "./types";

export type SermonHit = {
  sermonId: string;
  sectionId: string;
  title: string;
  speaker: string;
  label: string;
  snippet: string;
};

export function emptySermon(id = crypto.randomUUID(), now = () => new Date().toISOString()): Sermon {
  return {
    id,
    title: "",
    speaker: "",
    notes: "",
    sections: [emptySection()],
    updatedAt: now(),
  };
}

export function emptySection(id = crypto.randomUUID()): SermonSection {
  return { id, name: "Section", notes: "", items: [] };
}

function sanitizeItem(item: PresentationItem | undefined): PresentationItem | null {
  if (!item || typeof item.id !== "string" || !item.id) return null;
  if (!isRundownKind(item.kind)) return null;
  const clean: PresentationItem = { id: item.id, kind: item.kind, title: String(item.title ?? "") };
  if (item.bible) {
    clean.bible = {
      translationId: String(item.bible.translationId ?? ""),
      bookOrd: Number(item.bible.bookOrd),
      chapter: Number(item.bible.chapter),
      startVerse: Number(item.bible.startVerse),
      endVerse: Number(item.bible.endVerse),
      reference: String(item.bible.reference ?? ""),
    };
  }
  if (item.lyric) {
    clean.lyric = { songId: String(item.lyric.songId ?? ""), sectionId: String(item.lyric.sectionId ?? "") };
  }
  if (item.slide) {
    clean.slide = {
      heading: String(item.slide.heading ?? ""),
      body: String(item.slide.body ?? ""),
      imageId: item.slide.imageId ? String(item.slide.imageId) : null,
    };
  }
  if (item.image) {
    clean.image = { assetId: String(item.image.assetId ?? "") };
  }
  if (item.announcement) {
    clean.announcement = {
      heading: String(item.announcement.heading ?? ""),
      body: String(item.announcement.body ?? ""),
    };
  }
  return clean;
}

export function sanitizeSermon(sermon: Sermon): Sermon {
  const sections: SermonSection[] = [];
  for (const section of sermon.sections ?? []) {
    if (!section || typeof section.id !== "string" || !section.id) continue;
    const items = Array.isArray(section.items) ? section.items.map(sanitizeItem).filter((item): item is PresentationItem => item !== null) : [];
    sections.push({
      id: section.id,
      name: String(section.name ?? "").trim() || `Section ${sections.length + 1}`,
      notes: String(section.notes ?? ""),
      items,
    });
  }
  return {
    id: sermon.id,
    title: String(sermon.title ?? "").trim(),
    speaker: String(sermon.speaker ?? "").trim(),
    notes: String(sermon.notes ?? ""),
    sections,
    updatedAt: sermon.updatedAt || new Date().toISOString(),
  };
}

export function sermonError(sermon: Sermon): string | null {
  if (!sermon.title.trim()) return "Add a sermon title.";
  return null;
}

/** Operator-only. Never copied onto PresentationModel. */
export function deskNotes(sermon: Sermon, sectionId: string | null | undefined): string {
  const section = sermon.sections.find((entry) => entry.id === sectionId);
  return [sermon.notes, section?.notes].filter((part) => part?.trim()).join("\n\n");
}

/**
 * The audience item for a section. Notes stay off this record.
 * An empty section becomes a title slide named after the section.
 */
export function sermonAudienceItem(section: SermonSection): PresentationItem {
  const existing = section.items[0];
  if (existing) return existing;
  const heading = section.name.trim() || "Sermon";
  return {
    id: section.id,
    kind: "slide",
    title: heading,
    slide: { heading, body: "", imageId: null },
  };
}

export function sermonModelContainsNotes(model: PresentationModel, sermon: Sermon): boolean {
  const packed = JSON.stringify(model);
  const notes = [sermon.notes, ...sermon.sections.map((section) => section.notes)].filter((part) => part.trim());
  return notes.some((part) => packed.includes(part));
}

export function stepSermonSection(sermon: Sermon, sectionId: string | null, direction: 1 | -1): SermonSection | null {
  if (sermon.sections.length === 0) return null;
  const index = sermon.sections.findIndex((section) => section.id === sectionId);
  const next = index === -1 ? (direction > 0 ? 0 : sermon.sections.length - 1) : index + direction;
  if (next < 0 || next >= sermon.sections.length) return sermon.sections[index] ?? sermon.sections[0] ?? null;
  return sermon.sections[next] ?? null;
}

export function moveSermonSection(sermon: Sermon, sectionId: string, direction: 1 | -1): Sermon {
  const index = sermon.sections.findIndex((section) => section.id === sectionId);
  return { ...sermon, sections: moveInList(sermon.sections, index, direction) };
}

export function removeSermonSection(sermon: Sermon, sectionId: string): Sermon {
  return { ...sermon, sections: sermon.sections.filter((section) => section.id !== sectionId) };
}

/** Newest attachment is the audience item. Notes stay on the section. */
export function attachSermonItem(sermon: Sermon, sectionId: string, item: PresentationItem): Sermon {
  return {
    ...sermon,
    sections: sermon.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const rest = section.items.filter((entry) => entry.id !== item.id);
      return { ...section, items: [item, ...rest] };
    }),
  };
}

function itemHaystack(item: PresentationItem): string {
  return [item.title, item.bible?.reference, item.image?.assetId].filter(Boolean).join(" ");
}

function haystack(sermon: Sermon, section: SermonSection): string {
  return `${sermon.title} ${sermon.speaker} ${sermon.notes} ${section.name} ${section.notes} ${section.items.map(itemHaystack).join(" ")}`.toLowerCase();
}

function snippetFor(sermon: Sermon, section: SermonSection, needle: string): string {
  const notes = [section.notes, sermon.notes].flatMap((block) => block.split("\n"));
  const note = notes.find((line) => line.toLowerCase().includes(needle));
  if (note?.trim()) return note.trim();
  const item = section.items.find((entry) => itemHaystack(entry).toLowerCase().includes(needle));
  if (item?.title.trim()) return item.title.trim();
  if (item?.bible?.reference) return item.bible.reference;
  if (section.name.toLowerCase().includes(needle)) return section.name;
  return section.name || sermon.title || "Sermon";
}

export function searchSermonHits(sermons: Sermon[], query: string, limit = 24): SermonHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: SermonHit[] = [];
  for (const sermon of sermons) {
    for (const section of sermon.sections) {
      if (!haystack(sermon, section).includes(needle)) continue;
      hits.push({
        sermonId: sermon.id,
        sectionId: section.id,
        title: sermon.title || "Untitled sermon",
        speaker: sermon.speaker,
        label: section.name,
        snippet: snippetFor(sermon, section, needle),
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
