import { CANON } from "./reference";
import type { BookInfo, SearchHit, TranslationInfo, VerseText } from "../domain/types";

type SourceBook = { chapters: string[][] };

let pending: Promise<SourceBook[]> | null = null;

function load(): Promise<SourceBook[]> {
  pending ??= import("../../../src-tauri/resources/kjv.json").then((mod) => {
    const data = (mod as { default?: SourceBook[] }).default ?? (mod as unknown as SourceBook[]);
    return data;
  });
  return pending;
}

export const KJV: TranslationInfo = {
  id: "kjv",
  name: "King James Version",
  abbreviation: "KJV",
  licenseNote: "Public domain",
  source: "Local King James text",
};

export function kjvBooks(): BookInfo[] {
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

export async function kjvChapter(bookOrd: number, chapter: number): Promise<VerseText[]> {
  return chapterVerses(await load(), bookOrd, chapter);
}

export async function kjvPassage(bookOrd: number, chapter: number, startVerse: number, endVerse: number): Promise<VerseText[]> {
  const rows = await kjvChapter(bookOrd, chapter);
  return rows.filter((verse) => verse.verse >= startVerse && verse.verse <= endVerse);
}

export async function kjvSearch(query: string, limit = 24): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const books = await load();
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
