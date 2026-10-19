import type { BibleItem, Service } from "./types";

// While a service is open, its own songs and passages are looked at first: by listening (a sung
// line, a verse read aloud) and by search. The whole library is still searched when the service
// does not have it.

/** Songs added to the service (lyric items). */
export function serviceSongIds(service: Service | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const section of service?.sections ?? []) {
    for (const item of section.items) if (item.lyric?.songId) ids.add(item.lyric.songId);
  }
  return ids;
}

/** Passages added to the service (scripture items). */
export function servicePassages(service: Service | null | undefined): BibleItem[] {
  const passages: BibleItem[] = [];
  for (const section of service?.sections ?? []) {
    for (const item of section.items) if (item.bible) passages.push(item.bible);
  }
  return passages;
}

/** Whether a verse is inside one of the service's passages. */
export function inPassages(passages: BibleItem[], bookOrd: number, chapter: number, verse: number): boolean {
  return passages.some(
    (passage) =>
      passage.bookOrd === bookOrd &&
      passage.chapter === chapter &&
      verse >= passage.startVerse &&
      verse <= Math.max(passage.startVerse, passage.endVerse),
  );
}

/** The service's own results first, each group in its original order. */
export function serviceFirst<T>(list: T[], inService: (entry: T) => boolean): T[] {
  const own: T[] = [];
  const rest: T[] = [];
  for (const entry of list) (inService(entry) ? own : rest).push(entry);
  return own.length === 0 || rest.length === 0 ? list : [...own, ...rest];
}

/**
 * A match among the service's items wins over one from the whole library, unless the library
 * match is clearly stronger (`margin` more matched words, such as a verse named out loud).
 */
export function preferService<T extends { hits: number }>(own: T | null, all: T | null, margin = 2): T | null {
  if (!own) return all;
  if (!all) return own;
  return all.hits >= own.hits + margin ? all : own;
}
