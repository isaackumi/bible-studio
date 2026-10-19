import { richFromText, richIsEmpty, sanitizeRich, textFromRich, type RichDoc } from "./rich-text";
import { searchWords, wordsFound, wordsNeeded } from "./match-words";
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
    const rich = item.slide.rich ? sanitizeRich(item.slide.rich) : null;
    if (rich) clean.slide.rich = rich;
  }
  if (item.image) {
    clean.image = { assetId: String(item.image.assetId ?? "") };
  }
  if (item.announcement) {
    clean.announcement = {
      heading: String(item.announcement.heading ?? ""),
      body: String(item.announcement.body ?? ""),
    };
    const rich = item.announcement.rich ? sanitizeRich(item.announcement.rich) : null;
    if (rich) clean.announcement.rich = rich;
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
      ...keptNotes(section.notes, section.notesRich),
      items,
    });
  }
  return {
    id: sermon.id,
    title: String(sermon.title ?? "").trim(),
    speaker: String(sermon.speaker ?? "").trim(),
    notes: String(sermon.notes ?? ""),
    ...keptNotes(sermon.notes, sermon.notesRich),
    sections,
    updatedAt: sermon.updatedAt || new Date().toISOString(),
  };
}

export function sermonError(sermon: Sermon): string | null {
  if (!sermon.title.trim()) return "Add a sermon title.";
  return null;
}

/** Formatted notes, kept while their words still match the plain notes (anything else changed them). */
function keptNotes(notes: unknown, rich: unknown): { notesRich?: RichDoc } {
  const doc = rich ? sanitizeRich(rich) : null;
  if (!doc || richIsEmpty(doc)) return {};
  const trim = (text: string) => text.replace(/\s+$/, "");
  return trim(textFromRich(doc)) === trim(String(notes ?? "")) ? { notesRich: doc } : {};
}

/**
 * The desk notes for a section as one formatted document (the sermon's, then the section's), or
 * null when neither is formatted. Operator-only, like deskNotes.
 */
export function deskNotesRich(sermon: Sermon, sectionId: string | null | undefined): RichDoc | null {
  const section = sermon.sections.find((entry) => entry.id === sectionId);
  if (!sermon.notesRich && !section?.notesRich) return null;
  const parts = [
    sermon.notes.trim() ? (sermon.notesRich ?? richFromText(sermon.notes)) : null,
    section?.notes.trim() ? (section.notesRich ?? richFromText(section.notes)) : null,
  ].filter((part): part is RichDoc => part !== null);
  return { blocks: parts.flatMap((part, index) => (index > 0 ? [{ type: "p" as const, runs: [] }, ...part.blocks] : part.blocks)) };
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

function snippetFor(sermon: Sermon, section: SermonSection, query: string | string[]): string {
  const has = (text: string) =>
    typeof query === "string" ? text.toLowerCase().includes(query) : wordsFound(query, searchWords(text)) > 0;
  const needle = typeof query === "string" ? query : "";
  const notes = [section.notes, sermon.notes].flatMap((block) => block.split("\n"));
  const note = notes.find((line) => has(line));
  if (note?.trim()) return note.trim();
  const item = section.items.find((entry) => has(itemHaystack(entry)));
  if (item?.title.trim()) return item.title.trim();
  if (item?.bible?.reference) return item.bible.reference;
  if (needle && section.name.toLowerCase().includes(needle)) return section.name;
  return section.name || sermon.title || "Sermon";
}

/** Sermons by title, speaker, notes or scripture: exact phrase first, then most of the words (slips allowed). */
export function searchSermonHits(sermons: Sermon[], query: string, limit = 24): SermonHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const typed = searchWords(needle);
  if (typed.length === 0) return [];
  const need = wordsNeeded(typed);
  const scored: Array<{ hit: SermonHit; score: number; order: number }> = [];
  let order = 0;
  for (const sermon of sermons) {
    for (const section of sermon.sections) {
      order += 1;
      const text = haystack(sermon, section);
      const exact = text.includes(needle);
      const found = exact ? typed.length : wordsFound(typed, searchWords(text));
      if (!exact && found < need) continue;
      const inTitle = sermon.title.toLowerCase().includes(needle);
      scored.push({
        hit: {
          sermonId: sermon.id,
          sectionId: section.id,
          title: sermon.title || "Untitled sermon",
          speaker: sermon.speaker,
          label: section.name,
          snippet: snippetFor(sermon, section, exact ? needle : typed),
        },
        score: (exact ? 1000 : 0) + (inTitle ? 500 : 0) + found * 10,
        order,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((entry) => entry.hit);
}
