import { CANON } from "./reference";
import type { BookInfo, SearchHit, TranslationInfo, VerseText } from "../domain/types";
import { normalizeSpeech, type QuoteVerse } from "../voice/detect";

type SourceBook = { chapters: string[][] };

const LOADERS: Record<string, () => Promise<{ default?: SourceBook[] } | SourceBook[]>> = {
  kjv: () => import("../../../src-tauri/resources/kjv.json"),
  asv: () => import("../../../src-tauri/resources/asv.json"),
  web: () => import("../../../src-tauri/resources/web.json"),
  bbe: () => import("../../../src-tauri/resources/bbe.json"),
  twi: () => import("../../../src-tauri/resources/twi.json"),
};

const cache = new Map<string, Promise<SourceBook[]>>();

export const BUNDLED_TRANSLATIONS: TranslationInfo[] = [
  { id: "kjv", name: "King James Version", abbreviation: "KJV", licenseNote: "Public domain", source: "bundled" },
  { id: "asv", name: "American Standard Version", abbreviation: "ASV", licenseNote: "Public domain", source: "bundled" },
  { id: "web", name: "World English Bible", abbreviation: "WEB", licenseNote: "Public domain", source: "bundled" },
  { id: "bbe", name: "Bible in Basic English", abbreviation: "BBE", licenseNote: "Public domain", source: "bundled" },
  // Biblica's open Akuapem Twi Bible (eBible.org), CC BY-SA 4.0: shown with this credit.
  { id: "twi", name: "Akuapem Twi (Nkwa Asɛm)", abbreviation: "TWI", licenseNote: "© 1996, 2020 Biblica, Inc. CC BY-SA 4.0", source: "bundled" },
];

/** Every translation the app can install. `default` ones are installed on first launch. Sizes are the download. */
export type CatalogEntry = TranslationInfo & { default: boolean; sizeMb: number; language: string };

export const BIBLE_CATALOG: CatalogEntry[] = [
  { ...BUNDLED_TRANSLATIONS[0]!, default: true, sizeMb: 4.2, language: "English" },
  { ...BUNDLED_TRANSLATIONS[2]!, default: true, sizeMb: 4.2, language: "English" },
  { ...BUNDLED_TRANSLATIONS[1]!, default: false, sizeMb: 4.2, language: "English" },
  { ...BUNDLED_TRANSLATIONS[3]!, default: false, sizeMb: 4.2, language: "English" },
  { ...BUNDLED_TRANSLATIONS[4]!, default: false, sizeMb: 3.8, language: "Twi (Akuapem)" },
];

export const DEFAULT_BIBLES = BIBLE_CATALOG.filter((entry) => entry.default).map((entry) => entry.id);

const INSTALLED_KEY = "church-studio.bibles";

/** Browser: which translations this browser has installed (kept in localStorage; defaults when unset). */
export function browserInstalledBibles(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? "null");
    if (Array.isArray(saved)) {
      const known = saved.filter((id): id is string => typeof id === "string" && BIBLE_CATALOG.some((entry) => entry.id === id));
      if (known.length) return known;
    }
  } catch {
    // No storage: defaults.
  }
  return [...DEFAULT_BIBLES];
}

function saveBrowserInstalled(ids: string[]) {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(ids));
  } catch {
    // Not saved; the defaults come back next time.
  }
}

/** Browser install: fetch the translation (the real download) and mark it installed. */
export async function browserInstallBible(id: string): Promise<void> {
  if (!LOADERS[id]) throw new Error(`${id} is not in the catalog.`);
  cache.delete(id);
  const books = await load(id);
  if (books.length === 0) throw new Error("The download was empty.");
  saveBrowserInstalled([...new Set([...browserInstalledBibles(), id])]);
}

export function browserRemoveBible(id: string): void {
  const next = browserInstalledBibles().filter((entry) => entry !== id);
  if (next.length === 0) throw new Error("Keep at least one translation installed.");
  cache.delete(id);
  saveBrowserInstalled(next);
}

function load(id: string): Promise<SourceBook[]> {
  const existing = cache.get(id);
  if (existing) return existing;
  const loader = LOADERS[id];
  // A Bible the church imported lives only in the desktop database: ask the core for its text.
  if (!loader) {
    if (!id.startsWith("user-") || !(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return Promise.resolve([]);
    const pending = import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string[][][]>("bible_source", { translationId: id }))
      .then((books) => books.map((chapters) => ({ chapters })))
      .catch(() => [] as SourceBook[]);
    cache.set(id, pending);
    return pending;
  }
  const pending = loader().then((mod) => {
    const data = (mod as { default?: SourceBook[] }).default ?? (mod as SourceBook[]);
    return data;
  });
  cache.set(id, pending);
  return pending;
}

export function bundledBooks(): BookInfo[] {
  return CANON.map((book) => ({
    ord: book.ord,
    name: book.name,
    abbreviation: book.abbr,
    chapters: book.chapters,
  }));
}

export function chapterVerses(books: SourceBook[], bookOrd: number, chapter: number): VerseText[] {
  const rows = books[bookOrd - 1]?.chapters[chapter - 1] ?? [];
  return rows.map((text, index) => ({ verse: index + 1, text }));
}

export async function bundledChapter(translationId: string, bookOrd: number, chapter: number): Promise<VerseText[]> {
  return chapterVerses(await load(translationId), bookOrd, chapter);
}

export async function bundledPassage(
  translationId: string,
  bookOrd: number,
  chapter: number,
  startVerse: number,
  endVerse: number,
): Promise<VerseText[]> {
  const rows = await bundledChapter(translationId, bookOrd, chapter);
  return rows.filter((verse) => verse.verse >= startVerse && verse.verse <= endVerse);
}

export async function bundledQuoteCatalog(translationId: string): Promise<QuoteVerse[]> {
  const books = await load(translationId);
  const rows: QuoteVerse[] = [];
  books.forEach((book, index) => {
    const meta = CANON[index];
    if (!meta) return;
    book.chapters.forEach((chapter, chapterIndex) => {
      chapter.forEach((text, verseIndex) => {
        rows.push({
          bookOrd: meta.ord,
          bookName: meta.name,
          chaptersInBook: meta.chapters,
          chapter: chapterIndex + 1,
          verse: verseIndex + 1,
          text,
          normalized: normalizeSpeech(text),
        });
      });
    });
  });
  return rows;
}

export async function bundledSearch(translationId: string, query: string, limit = 24): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const books = await load(translationId);
  const hits: SearchHit[] = [];
  for (let index = 0; index < books.length && hits.length < limit; index += 1) {
    const meta = CANON[index];
    if (!meta) continue;
    books[index].chapters.forEach((chapter, chapterIndex) => {
      chapter.forEach((text, verseIndex) => {
        if (hits.length >= limit) return;
        if (text.toLowerCase().includes(needle)) {
          hits.push({
            bookOrd: meta.ord,
            bookName: meta.name,
            chapter: chapterIndex + 1,
            verse: verseIndex + 1,
            text,
          });
        }
      });
    });
  }
  return hits;
}
