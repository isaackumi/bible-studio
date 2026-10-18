// Quick scripture find: read whatever the operator manages to type in a second or two and turn it
// into places to go. "jn316", "j3 16", "1co13", "ps23", "rom 8 28-30" are references; "3:16",
// "16", "c5" and "v5" mean the book and chapter already open; "jo" lists the books it could be;
// a few words ("so loved the world") are a search through the text.

import { closestBook, normalizeOrdinals } from "./books";
import { aliasIndex, CANON, type CanonBook } from "./reference";

export type QuickRef = {
  bookOrd: number;
  bookName: string;
  chapter: number;
  /** Null: the whole chapter (open it and pick a verse). */
  startVerse: number | null;
  endVerse: number | null;
};

export type QuickRead = {
  /** Places to go, best first. */
  refs: QuickRef[];
  /** Books the typing could be (for completion), best first. */
  books: CanonBook[];
  /** A chapter to list verse by verse; `prefix` narrows by verse number ("1" → 1, 10–19…). */
  chapter: { bookOrd: number; chapter: number; prefix: string } | null;
  /** Words to search for in the text. */
  phrase: string | null;
};

/** Books people reach for most, to order a short prefix ("j" → John before Jude). */
const POPULAR = [43, 19, 45, 40, 42, 1, 23, 46, 20, 49, 50, 58, 59, 44, 41, 2, 18, 24, 62, 66, 48, 51, 47, 5, 6, 7, 9, 26, 27, 52, 54, 60];
const popularity = (ord: number) => {
  const index = POPULAR.indexOf(ord);
  return index === -1 ? POPULAR.length + ord : index;
};

/** Largest verse number in the Bible (Psalm 119:176): longer verse parts are not verses. */
const MAX_VERSE = 176;

const compact = (text: string) => text.replace(/\s+/g, "");

function normalize(raw: string): string {
  return normalizeOrdinals(
    raw
      .toLowerCase()
      .replace(/(\d)\s*[.,]\s*(?=\d)/g, "$1:")
      .replace(/[.,;]/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** Books whose names or abbreviations start with what was typed ("jo", "1co", "phil"). */
export function bookMatches(typed: string, books: CanonBook[] = CANON): CanonBook[] {
  const key = compact(normalizeOrdinals(typed.toLowerCase()));
  if (!key) return [];
  const scored = new Map<number, number>();
  const score = (book: CanonBook, value: number) => scored.set(book.ord, Math.min(scored.get(book.ord) ?? Infinity, value));
  for (const { alias, book } of aliasIndex(books)) {
    const name = compact(alias);
    if (name === key) score(book, 0);
    else if (name.startsWith(key)) score(book, 1);
  }
  for (const book of books) {
    const name = compact(book.name.toLowerCase());
    if (name === key) score(book, 0);
    else if (name.startsWith(key)) score(book, 1);
    // "john" also finds 1–3 John; "cor" finds 1 and 2 Corinthians.
    else if (/^[123]/.test(name) && name.slice(1).startsWith(key)) score(book, 2);
  }
  if (!scored.size && key.replace(/^[123]/, "").length >= 3) {
    const guess = closestBook(key.replace(/^[123]/, ""), books, /^[123]/.test(key) ? Number(key[0]) : null);
    if (guess) score(guess.book, 3);
  }
  return books
    .filter((book) => scored.has(book.ord))
    .sort((a, b) => scored.get(a.ord)! - scored.get(b.ord)! || popularity(a.ord) - popularity(b.ord));
}

/** Chapter and verse from the numbers after a book: "3:16", "3 16", "316", "3:16-18", "316-18". */
function readNumbers(rest: string, book: CanonBook): QuickRef[] {
  const make = (chapter: number, start: number | null, end: number | null): QuickRef | null => {
    if (book.chapters === 1 && start === null) {
      start = chapter;
      end = end ?? chapter;
      chapter = 1;
    }
    if (chapter < 1 || chapter > book.chapters) return null;
    if (start !== null && (start < 1 || start > MAX_VERSE)) return null;
    if (end !== null && start !== null && end < start) end = start;
    return { bookOrd: book.ord, bookName: book.name, chapter, startVerse: start, endVerse: start === null ? null : (end ?? start) };
  };
  // "3:" (after Tab finishes the book): the chapter, to pick a verse from.
  const open = rest.match(/^(\d+)\s*[:v]$/);
  if (open) {
    const ref = make(Number(open[1]), null, null);
    return ref ? [ref] : [];
  }
  const separated = rest.match(/^(\d+)\s*(?::|v|\s)\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (separated) {
    const ref = make(Number(separated[1]), Number(separated[2]), separated[3] ? Number(separated[3]) : null);
    return ref ? [ref] : [];
  }
  const joined = rest.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!joined) return [];
  const digits = joined[1]!;
  const end = joined[2] ? Number(joined[2]) : null;
  const refs: QuickRef[] = [];
  // The whole number as a chapter first ("ps23"), then each split, longest chapter first ("jn316" → 3:16).
  const whole = end === null ? make(Number(digits), null, null) : null;
  if (whole) refs.push(whole);
  for (let cut = digits.length - 1; cut >= 1; cut -= 1) {
    const verse = digits.slice(cut);
    if (verse.startsWith("0")) continue;
    const ref = make(Number(digits.slice(0, cut)), Number(verse), end);
    if (ref) refs.push(ref);
  }
  // "john 3-5": a chapter range is not supported; read it as verses 3–5 of a one-chapter book only.
  if (book.chapters === 1 && end !== null) {
    const ref = make(1, Number(digits), end);
    if (ref && !refs.length) refs.push(ref);
  }
  return refs;
}

/**
 * Everything the typing could mean. `here` is the book and chapter already open, for "3:16",
 * "16", "c5" and "v5".
 */
export function quickRead(raw: string, here: { bookOrd: number; chapter: number } | null, books: CanonBook[] = CANON): QuickRead {
  const text = normalize(raw);
  const empty: QuickRead = { refs: [], books: [], chapter: null, phrase: null };
  if (!text) return empty;
  const current = here ? books.find((book) => book.ord === here.bookOrd) : undefined;

  // Numbers only: the book (and chapter) already open.
  if (current && here && /^[\d\s:v-]+$/.test(text) && /\d/.test(text)) {
    const verseOnly = text.match(/^v?\s*:?(\d+)(?:\s*-\s*(\d+))?$/);
    if (verseOnly && !/^\d+\s+\d+/.test(text)) {
      const start = Number(verseOnly[1]);
      const end = verseOnly[2] ? Number(verseOnly[2]) : start;
      const refs: QuickRef[] = [];
      if (start >= 1 && start <= MAX_VERSE) refs.push({ bookOrd: current.ord, bookName: current.name, chapter: here.chapter, startVerse: start, endVerse: Math.max(start, end) });
      // "5" may also mean chapter 5 of this book.
      if (!text.startsWith("v") && !verseOnly[2] && start <= current.chapters && start !== here.chapter) {
        refs.push({ bookOrd: current.ord, bookName: current.name, chapter: start, startVerse: null, endVerse: null });
      }
      return { ...empty, refs, chapter: { bookOrd: current.ord, chapter: here.chapter, prefix: text.startsWith("v") ? verseOnly[1]! : verseOnly[1]! } };
    }
    const refs = readNumbers(text.replace(/^v\s*/, ""), current);
    const first = refs[0];
    return { ...empty, refs, chapter: first ? { bookOrd: current.ord, chapter: first.chapter, prefix: "" } : null };
  }

  // "c5", "ch 5", "chapter 5": a chapter of the book open now.
  const chapterOnly = text.match(/^(?:c|ch|chap|chapter)\s*(\d+)$/);
  if (current && chapterOnly) {
    const chapter = Number(chapterOnly[1]);
    if (chapter >= 1 && chapter <= current.chapters) {
      return { ...empty, refs: [{ bookOrd: current.ord, bookName: current.name, chapter, startVerse: null, endVerse: null }], chapter: { bookOrd: current.ord, chapter, prefix: "" } };
    }
  }

  // A book, then perhaps numbers: "jn316", "1co 13", "song of songs 2:1", "ps".
  const split = text.match(/^((?:[123]\s*)?[a-z][a-z ]*?)\s*(\d[\d\s:v-]*)?$/);
  const words = text.split(" ").filter(Boolean);
  if (split) {
    const typedBook = split[1]!.trim();
    const numbers = split[2]?.trim() ?? "";
    const candidates = bookMatches(typedBook, books);
    if (candidates.length) {
      if (!numbers) {
        const exact = candidates.filter((book) => book.aliases.some((alias) => compact(alias) === compact(typedBook)) || compact(book.name.toLowerCase()) === compact(typedBook));
        const top = exact[0] ?? (candidates.length === 1 ? candidates[0] : undefined);
        return {
          refs: top ? [{ bookOrd: top.ord, bookName: top.name, chapter: 1, startVerse: null, endVerse: null }] : [],
          books: candidates.slice(0, 8),
          chapter: null,
          phrase: words.length >= 2 ? text : null,
        };
      }
      // A name typed in full ("john 3") means that book, not 1–3 John.
      const exact = candidates.filter((book) => book.aliases.some((alias) => compact(alias) === compact(typedBook)) || compact(book.name.toLowerCase()) === compact(typedBook));
      const refs = (exact.length ? exact : candidates.slice(0, 4)).flatMap((book) => readNumbers(numbers, book));
      const first = refs[0];
      return {
        refs: refs.slice(0, 6),
        books: candidates.length > 1 ? candidates.slice(0, 6) : [],
        chapter: first ? { bookOrd: first.bookOrd, chapter: first.chapter, prefix: first.startVerse === null ? "" : String(first.startVerse) } : null,
        phrase: null,
      };
    }
  }

  // Anything else with words in it: search the text.
  const letters = text.replace(/[^a-z]/g, "");
  return { ...empty, phrase: letters.length >= 3 ? text : null };
}

/** "John 3:16", "John 3:16-18", "John 3" (whole chapter), "Jude 4". */
export function quickLabel(ref: QuickRef, books: CanonBook[] = CANON): string {
  const book = books.find((entry) => entry.ord === ref.bookOrd);
  if (ref.startVerse === null) return `${ref.bookName} ${ref.chapter}`;
  const verses = ref.endVerse && ref.endVerse !== ref.startVerse ? `${ref.startVerse}-${ref.endVerse}` : `${ref.startVerse}`;
  return book?.chapters === 1 ? `${ref.bookName} ${verses}` : `${ref.bookName} ${ref.chapter}:${verses}`;
}
