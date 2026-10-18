// Favorites: a star on anything the team reaches for every week (a song, a verse, a theme, a
// layout, a saved look, a picture or video) so it sits at the top of its list.

import type { BibleItem } from "./types";

export type FavoriteKind = "songs" | "passages" | "themes" | "layouts" | "looks" | "media";

export type Favorites = {
  songs: string[];
  themes: string[];
  layouts: string[];
  looks: string[];
  media: string[];
  /** Verses keep their place in the Bible, so a favorite opens without searching. */
  passages: BibleItem[];
};

const LIMIT = 300;
const ID_KINDS = ["songs", "themes", "layouts", "looks", "media"] as const;

export function emptyFavorites(): Favorites {
  return { songs: [], themes: [], layouts: [], looks: [], media: [], passages: [] };
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 300))].slice(0, LIMIT);
}

export function sanitizePassage(value: unknown): BibleItem | null {
  const record = value && typeof value === "object" ? (value as Partial<BibleItem>) : null;
  if (!record || typeof record.translationId !== "string" || typeof record.reference !== "string") return null;
  const numbers = [record.bookOrd, record.chapter, record.startVerse, record.endVerse].map(Number);
  if (!numbers.every((n) => Number.isInteger(n) && n > 0)) return null;
  const [bookOrd, chapter, startVerse, endVerse] = numbers as [number, number, number, number];
  return { translationId: record.translationId, bookOrd, chapter, startVerse, endVerse: Math.max(startVerse, endVerse), reference: record.reference.slice(0, 120) };
}

export function sanitizeFavorites(value: unknown): Favorites {
  const record = value && typeof value === "object" ? (value as Partial<Record<keyof Favorites, unknown>>) : {};
  const result = emptyFavorites();
  for (const kind of ID_KINDS) result[kind] = ids(record[kind]);
  const seen = new Set<string>();
  result.passages = (Array.isArray(record.passages) ? record.passages : [])
    .map(sanitizePassage)
    .filter((entry): entry is BibleItem => entry !== null && !seen.has(passageKey(entry)) && !!seen.add(passageKey(entry)))
    .slice(0, LIMIT);
  return result;
}

/** One key per place in the Bible, whatever the translation. */
export function passageKey(item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">): string {
  return `${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`;
}

export function isFavorite(favorites: Favorites, kind: Exclude<FavoriteKind, "passages">, id: string): boolean {
  return favorites[kind].includes(id);
}

export function isFavoritePassage(favorites: Favorites, item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">): boolean {
  const key = passageKey(item);
  return favorites.passages.some((entry) => passageKey(entry) === key);
}

/** Star or unstar. Newest stars go first. */
export function toggleFavorite(favorites: Favorites, kind: Exclude<FavoriteKind, "passages">, id: string): Favorites {
  const list = favorites[kind];
  return { ...favorites, [kind]: list.includes(id) ? list.filter((entry) => entry !== id) : [id, ...list].slice(0, LIMIT) };
}

export function toggleFavoritePassage(favorites: Favorites, item: BibleItem): Favorites {
  const key = passageKey(item);
  const has = favorites.passages.some((entry) => passageKey(entry) === key);
  return {
    ...favorites,
    passages: has ? favorites.passages.filter((entry) => passageKey(entry) !== key) : [{ ...item }, ...favorites.passages].slice(0, LIMIT),
  };
}

/** Starred items first; both groups keep the list's own order. */
export function favoritesFirst<T>(items: T[], starred: (item: T) => boolean): T[] {
  return [...items.filter(starred), ...items.filter((item) => !starred(item))];
}
