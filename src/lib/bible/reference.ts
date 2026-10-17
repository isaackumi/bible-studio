import canon from "./canon.json";
import { closestBook, normalizeOrdinals } from "./books";

export type CanonBook = {
  ord: number;
  name: string;
  abbr: string;
  chapters: number;
  aliases: string[];
};

export type ParsedReference = {
  bookOrd: number;
  bookName: string;
  chapter: number;
  startVerse: number | null;
  endVerse: number | null;
};

export const CANON = canon as CanonBook[];

type Alias = { alias: string; book: CanonBook };

const aliasCache = new WeakMap<CanonBook[], Alias[]>();

/** Every alias, longest first (cached per book list: speech asks many times a second). */
export function aliasIndex(books: CanonBook[]): Alias[] {
  const cached = aliasCache.get(books);
  if (cached) return cached;
  const built = books
    .flatMap((book) => book.aliases.map((alias) => ({ alias, book })))
    .sort((a, b) => b.alias.length - a.alias.length);
  aliasCache.set(books, built);
  return built;
}

/** The book at the start of typed text: an exact name or abbreviation, else the closest spelling. */
function findBook(text: string, books: CanonBook[]): { book: CanonBook; length: number } | null {
  const exact = aliasIndex(books).find((entry) => text === entry.alias || (text.startsWith(entry.alias) && /[\s\d]/.test(text[entry.alias.length] ?? "")));
  if (exact) return { book: exact.book, length: exact.alias.length };
  // "galations 5:22", "1 corintians 13": the words before the numbers, matched loosely.
  const loose = text.match(/^(?:([123])\s*)?([a-z][a-z ]*?)\s*(?=\d|$)/);
  if (!loose?.[2] || loose[2].replace(/ /g, "").length < 3) return null;
  const guess = closestBook(loose[2], books, loose[1] ? Number(loose[1]) : null);
  return guess ? { book: guess.book, length: loose[0].length } : null;
}

export function parseReference(raw: string, books: CanonBook[] = CANON): ParsedReference | null {
  const text = normalizeOrdinals(raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " "));
  if (!text) return null;
  const found = findBook(text, books);
  if (!found) return null;
  const match = { book: found.book };
  const rest = text.slice(found.length).trim();
  if (!rest) return null;
  // "13:4", "13 4" and "13v4" all mean chapter 13, verse 4.
  const parts = rest.match(/^(\d+)(?:\s*(?::|v|\s)\s*(\d+))?(?:\s*-\s*(\d+))?$/);
  if (!parts) return null;

  let chapter = Number(parts[1]);
  let start = parts[2] ? Number(parts[2]) : null;
  let end = parts[3] ? Number(parts[3]) : start;
  if (match.book.chapters === 1 && start === null) {
    start = chapter;
    end = chapter;
    chapter = 1;
  }
  if (chapter < 1 || chapter > match.book.chapters) return null;
  if (start !== null && (start < 1 || (end !== null && end < start))) return null;
  return {
    bookOrd: match.book.ord,
    bookName: match.book.name,
    chapter,
    startVerse: start,
    endVerse: end,
  };
}

export function formatReference(bookName: string, chapter: number, startVerse: number, endVerse: number, chaptersInBook: number): string {
  if (chaptersInBook === 1) {
    return startVerse === endVerse ? `${bookName} ${startVerse}` : `${bookName} ${startVerse}-${endVerse}`;
  }
  if (startVerse === endVerse) return `${bookName} ${chapter}:${startVerse}`;
  return `${bookName} ${chapter}:${startVerse}-${endVerse}`;
}

export function withChapterCounts(rows: Array<{ ord: number; chapters: number }>, books: CanonBook[] = CANON): CanonBook[] {
  return books.map((book) => {
    const row = rows.find((item) => item.ord === book.ord);
    return row ? { ...book, chapters: row.chapters || book.chapters } : book;
  });
}
