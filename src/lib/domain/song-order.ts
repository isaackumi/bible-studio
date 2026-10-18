// Song arrangements: the order a song is sung in, with repeats (Verse 1, Chorus, Verse 2, Chorus,
// Bridge, Chorus, Chorus). The sections hold the words once; the order says where each comes.
// Without an order a song runs through its sections as written.

import type { Song, SongSection } from "./types";

const MAX_ORDER = 100;

/** Section ids in the order the song is sung (repeats allowed). */
export function songOrder(song: Pick<Song, "sections" | "order">): string[] {
  const ids = new Set(song.sections.map((section) => section.id));
  const order = (song.order ?? []).filter((id) => ids.has(id));
  return order.length ? order : song.sections.map((section) => section.id);
}

/** True when the song has an order of its own (not just its sections as written). */
export function hasOwnOrder(song: Pick<Song, "sections" | "order">): boolean {
  const order = songOrder(song);
  return order.length !== song.sections.length || order.some((id, index) => song.sections[index]?.id !== id);
}

/** The parts in sung order: each place ("slot") with its section. */
export function songSlots(song: Pick<Song, "sections" | "order">): SongSection[] {
  const byId = new Map(song.sections.map((section) => [section.id, section]));
  return songOrder(song).map((id) => byId.get(id)!).filter(Boolean);
}

/**
 * Which place a section is shown at. Staying on the current place when it is that section;
 * otherwise the next place it is sung after the current one, else its first place.
 */
export function slotFor(song: Pick<Song, "sections" | "order">, sectionId: string, current: number | null = null): number {
  const order = songOrder(song);
  if (current !== null && order[current] === sectionId) return current;
  const after = current === null ? -1 : order.findIndex((id, index) => index > current && id === sectionId);
  if (after >= 0) return after;
  return Math.max(0, order.indexOf(sectionId));
}

/** The next or previous place; null at either end. */
export function stepSlot(song: Pick<Song, "sections" | "order">, slot: number | null, direction: 1 | -1): { slot: number; section: SongSection } | null {
  const slots = songSlots(song);
  if (!slots.length) return null;
  const next = slot === null ? (direction > 0 ? 0 : slots.length - 1) : slot + direction;
  const section = slots[next];
  return section ? { slot: next, section } : null;
}

/** Keep only known section ids; drop the order when it is the sections as written. */
export function cleanOrder(order: unknown, sections: SongSection[]): string[] | undefined {
  if (!Array.isArray(order)) return undefined;
  const ids = new Set(sections.map((section) => section.id));
  const clean = order.filter((id): id is string => typeof id === "string" && ids.has(id)).slice(0, MAX_ORDER);
  if (!clean.length) return undefined;
  return hasOwnOrder({ sections, order: clean }) ? clean : undefined;
}

/** A chorus after every verse that is not already followed by one (a common way to sing). */
export function chorusAfterVerses(song: Pick<Song, "sections" | "order">): string[] {
  const chorus = song.sections.find((section) => section.kind === "chorus");
  if (!chorus) return songOrder(song);
  const kinds = new Map(song.sections.map((section) => [section.id, section.kind]));
  const base = songOrder(song).filter((id) => id !== chorus.id);
  const out: string[] = [];
  base.forEach((id, index) => {
    out.push(id);
    const next = base[index + 1];
    if (kinds.get(id) === "verse" && (next === undefined || kinds.get(next) !== "chorus")) out.push(chorus.id);
  });
  // A song that ends on a bridge or tag goes back to the chorus once more.
  if (out.length && kinds.get(out[out.length - 1]!) === "bridge") out.push(chorus.id);
  return out;
}

/** Short names for a section's place in an order: "V1", "C", "B". */
function nameKeys(section: SongSection, index: number, sections: SongSection[]): string[] {
  const label = section.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sameKind = sections.filter((entry) => entry.kind === section.kind);
  const n = sameKind.indexOf(section) + 1;
  const letter = section.kind === "chorus" ? "c" : section.kind === "bridge" ? "b" : section.kind === "tag" ? (/pre/.test(label) ? "p" : /intro/.test(label) ? "i" : /end/.test(label) ? "e" : "o") : "v";
  const keys = [label, label.replace(/\s+/g, ""), `${letter}${n}`];
  if (n === 1) keys.push(letter);
  void index;
  return keys;
}

/**
 * An order from names: OpenLyrics verseOrder ("v1 c v2 c b c"), or Planning Center's sequence
 * (["Verse 1", "Chorus", "Verse 2"]). Names that match no section are skipped.
 */
export function orderFromNames(sections: SongSection[], names: string[]): string[] | undefined {
  const keys = new Map<string, string>();
  sections.forEach((section, index) => {
    for (const key of nameKeys(section, index, sections)) if (!keys.has(key)) keys.set(key, section.id);
  });
  const order = names
    .map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean)
    .map((name) => keys.get(name) ?? keys.get(name.replace(/\s+/g, "")))
    .filter((id): id is string => !!id);
  return cleanOrder(order, sections);
}
