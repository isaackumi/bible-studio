// Book names the way people say and type them. Two jobs, shared by speech and the search box:
//
// 1. Ordinals: "first", "1st", "one", "I" and "the first letter to the" all mean 1, so
//    "first corinthians", "one corinthians" and "1 Cor" are the same book.
// 2. Near misses: speech recognizers hear "ga tians" for Galatians and "siah" for Isaiah, and
//    people type "Galations". A sound-alike key plus edit distance finds the closest book. The
//    caller still checks that the chapter and verse fit that book, which keeps guesses honest.

import type { CanonBook } from "./reference";

const ORDINALS: Record<string, string> = {
  first: "1", "1st": "1", one: "1", i: "1",
  second: "2", "2nd": "2", two: "2", ii: "2",
  third: "3", "3rd": "3", three: "3", iii: "3",
};

/** "first corinthians", "the second letter to timothy", "1st john" → "1 corinthians", "2 timothy", "1 john". */
export function normalizeOrdinals(text: string): string {
  return text.replace(
    /\b(?:the\s+)?(first|1st|second|2nd|third|3rd|one|two|three|iii|ii|i)\s+(?:(?:book|letter|epistle|gospel)\s+(?:of|to|from)\s+(?:the\s+)?(?:saint\s+|st\s+)?)?(?=[a-z])/g,
    (whole, ordinal: string, offset: number, all: string) => {
      // Only rewrite before a numbered book, so "one thing" or "I believe" stay as spoken.
      const rest = all.slice(offset + whole.length);
      return NUMBERED_START.test(rest) ? `${ORDINALS[ordinal]} ` : whole;
    },
  );
}

/** Book names that come in numbered volumes, and loose spellings of them. */
const NUMBERED_START = /^(?:samuel|sam|kings|kgs|chronicles|chron|chr|corinthians|cor|thessalonians|thess|thes|timothy|tim|peter|pet|john|jn|ko?rin|thessa|tim)/;

/** A spelling-insensitive key: ph→f, soft c→s, c/k/q→k, z→s, y→i, doubled letters once. */
export function soundKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

function isSubsequence(short: string, long: string): boolean {
  let at = 0;
  for (const char of long) if (char === short[at]) at += 1;
  return at === short.length;
}

/** How alike a heard word (or words) is to a book name, 0–1. */
export function nameScore(heard: string, name: string): number {
  const a = soundKey(heard);
  const b = soundKey(name);
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0;
  if (a === b) return 1;
  const ratio = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  // A clipped name ("siah" for Isaiah, "gatians" for Galatians) keeps its letters in order.
  const clipped = a.length >= 4 && a.length >= b.length * 0.6 && isSubsequence(a, b) ? 0.78 : 0;
  return Math.max(ratio, clipped);
}

/** The base name without its volume number: "1 Corinthians" → "corinthians". */
function baseName(book: CanonBook): { base: string; volume: number | null } {
  const match = book.name.match(/^([123])\s+(.+)$/);
  return match ? { base: match[2]!.toLowerCase(), volume: Number(match[1]) } : { base: book.name.toLowerCase(), volume: null };
}

export type BookGuess = { book: CanonBook; score: number };

/**
 * The closest book to some heard or typed words, or null when nothing is close enough.
 * `volume` is a number said before the name (1, 2 or 3), if any.
 */
/**
 * `marked`: "chapter" or "verse" was said right after, so a reference is surely meant and a slightly
 * looser sound-alike is taken ("efficient two verse eight" is Ephesians 2:8).
 */
export function closestBook(words: string, books: CanonBook[], volume: number | null = null, marked = false): BookGuess | null {
  let best: BookGuess | null = null;
  for (const book of books) {
    const { base, volume: bookVolume } = baseName(book);
    if (volume !== null && bookVolume !== null && volume !== bookVolume) continue;
    if (volume !== null && bookVolume === null) continue;
    const names = [base, ...book.aliases.filter((alias) => alias.length >= 4 && !/^\d|^i+ /.test(alias))];
    const score = Math.max(...names.map((name) => nameScore(words, name)));
    // Short names (Job, Joel, Amos, Mark) need a near-exact hit; one wrong letter is a different word.
    const needed = (soundKey(base).length <= 4 ? 0.75 : 0.66) - (marked ? 0.06 : 0);
    if (score < needed) continue;
    // With no volume said, "corinthians" means 1 Corinthians: prefer the first volume on a tie.
    const better = !best || score > best.score + 0.001 || (Math.abs(score - best.score) <= 0.001 && (bookVolume ?? 0) < (baseName(best.book).volume ?? 0));
    if (better) best = { book, score };
  }
  return best;
}
