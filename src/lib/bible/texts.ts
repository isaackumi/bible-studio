import { CANON } from "./reference";
import type { BookInfo, SearchHit, TranslationInfo, VerseText } from "../domain/types";
import { normalizeSpeech, type QuoteVerse } from "../voice/detect";

type SourceBook = { chapters: string[][] };

const LOADERS: Record<string, () => Promise<{ default?: SourceBook[] } | SourceBook[]>> = {
  kjv: () => import("../../../src-tauri/resources/kjv.json"),
  asv: () => import("../../../src-tauri/resources/asv.json"),
  web: () => import("../../../src-tauri/resources/web.json"),
  bbe: () => import("../../../src-tauri/resources/bbe.json"),
};

const cache = new Map<string, Promise<SourceBook[]>>();

export const BUNDLED_TRANSLATIONS: TranslationInfo[] = [
  { id: "kjv", name: "King James Version", abbreviation: "KJV", licenseNote: "Public domain", source: "bundled" },
  { id: "asv", name: "American Standard Version", abbreviation: "ASV", licenseNote: "Public domain", source: "bundled" },
  { id: "web", name: "World English Bible", abbreviation: "WEB", licenseNote: "Public domain", source: "bundled" },
  { id: "bbe", name: "Bible in Basic English", abbreviation: "BBE", licenseNote: "Public domain", source: "bundled" },
];

function load(id: string): Promise<SourceBook[]> {
  const existing = cache.get(id);
  if (existing) return existing;
  const loader = LOADERS[id];
  if (!loader) return Promise.resolve([]);
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
