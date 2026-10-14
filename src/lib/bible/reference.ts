import canon from "./canon.json";

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

function aliasIndex(books: CanonBook[]): Alias[] {
  return books
    .flatMap((book) => book.aliases.map((alias) => ({ alias, book })))
    .sort((a, b) => b.alias.length - a.alias.length);
}

export function parseReference(raw: string, books: CanonBook[] = CANON): ParsedReference | null {
  const text = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!text) return null;
  const match = aliasIndex(books).find((entry) => text === entry.alias || text.startsWith(`${entry.alias} `));
  if (!match) return null;
  const rest = text.slice(match.alias.length).trim();
  if (!rest) return null;
  const parts = rest.match(/^(\d+)\s*(?::\s*(\d+))?(?:\s*-\s*(\d+))?$/);
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
