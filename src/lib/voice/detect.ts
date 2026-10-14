import { CANON, formatReference, parseReference, type ParsedReference } from "../bible/reference";
import type { BibleItem, VerseText } from "../domain/types";

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(heard: string, verse: string): number {
  const verseWords = verse.split(" ").filter((word) => word.length > 2);
  if (verseWords.length === 0) return 0;
  if (verse.includes(heard) || heard.includes(verse)) return 1;
  const hits = verseWords.filter((word) => heard.includes(word)).length;
  return hits / verseWords.length;
}

/** Turn spoken "john 3 16" into a parsed reference when a colon is missing. */
export function spokenReference(raw: string): ParsedReference | null {
  const direct = parseReference(raw);
  if (direct?.startVerse) return direct;
  const prepared = raw
    .toLowerCase()
    .replace(/\bchapters?\b/g, " ")
    .replace(/\bverses?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const whole = parseReference(prepared.replace(/^([1-3]?\s*[a-z]+(?:\s+[a-z]+){0,3})\s+(\d+)\s+(\d+)$/i, "$1 $2:$3"));
  if (whole?.startVerse) return whole;
  const aliases = CANON.flatMap((book) => book.aliases.map((alias) => ({ alias, book })))
    .filter((entry) => entry.alias.length >= 3)
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const entry of aliases) {
    let from = 0;
    while (from < prepared.length) {
      const at = prepared.indexOf(entry.alias, from);
      if (at < 0) break;
      const before = at === 0 || prepared[at - 1] === " ";
      const after = at + entry.alias.length;
      const ended = after === prepared.length || prepared[after] === " ";
      if (before && ended) {
        const numbers = prepared.slice(after).match(/^\s+(\d+)\s+(\d+)\b/);
        if (numbers) {
          const hit = parseReference(`${entry.alias} ${numbers[1]}:${numbers[2]}`);
          if (hit?.startVerse) return hit;
        }
      }
      from = at + Math.max(entry.alias.length, 1);
    }
  }
  return null;
}

export type QuoteVerse = {
  bookOrd: number;
  bookName: string;
  chaptersInBook: number;
  chapter: number;
  verse: number;
  text: string;
  normalized: string;
};

export type SpokenMatch = { item: BibleItem; text: string };

const STOP = new Set([
  "the", "and", "that", "for", "you", "his", "him", "her", "she", "was", "were", "are", "with", "from", "this", "have",
  "hath", "had", "shall", "will", "unto", "into", "upon", "them", "they", "their", "your", "thou", "thy", "thee", "which",
  "who", "whom", "what", "when", "then", "there", "also", "not", "but", "all", "one", "our", "out", "may", "did", "been",
  "over", "after", "before", "about", "because", "would", "could", "should", "just", "like", "know", "yeah", "okay",
  "please", "said", "say", "let", "there", "was", "were",
]);

function wordsOf(text: string): string[] {
  return normalizeSpeech(text).split(" ").filter(Boolean);
}

function contentWords(text: string): string[] {
  return wordsOf(text).filter((word) => word.length > 2 && !STOP.has(word));
}

export type QuoteIndex = {
  catalog: QuoteVerse[];
  words: string[][];
  postings: Map<string, number[]>;
};

export function buildQuoteIndex(catalog: QuoteVerse[]): QuoteIndex {
  const words = catalog.map((verse) => contentWords(verse.normalized));
  const postings = new Map<string, number[]>();
  words.forEach((tokens, index) => {
    for (const token of new Set(tokens)) {
      const list = postings.get(token);
      if (list) list.push(index);
      else postings.set(token, [index]);
    }
  });
  return { catalog, words, postings };
}

function asIndex(source: QuoteVerse[] | QuoteIndex): QuoteIndex {
  return "postings" in source ? source : buildQuoteIndex(source);
}

/** How many spoken content words appear in order, close together, inside one verse. */
function alignment(needle: string[], verse: string[]): { hits: number; span: number } | null {
  let from = 0;
  let hits = 0;
  let start = -1;
  let end = -1;
  for (let index = 0; index < verse.length && from < needle.length; index += 1) {
    const at = needle.indexOf(verse[index], from);
    if (at < 0) continue;
    if (start < 0) start = index;
    end = index;
    hits += 1;
    from = at + 1;
  }
  if (hits < 3) return null;
  const span = end - start + 1;
  if (span > hits * 3) return null;
  return { hits, span };
}

function passageFor(verse: QuoteVerse, translationId: string): BibleItem {
  return {
    translationId,
    bookOrd: verse.bookOrd,
    chapter: verse.chapter,
    startVerse: verse.verse,
    endVerse: verse.verse,
    reference: formatReference(verse.bookName, verse.chapter, verse.verse, verse.verse, verse.chaptersInBook),
  };
}

/** Link spoken words to one verse. Extra or missing words are allowed. A vague sentence is not. */
export function matchQuote(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const index = asIndex(source);
  const needle = contentWords(heard).slice(-8);
  if (needle.length < 3 || index.catalog.length === 0) return null;
  const rank = (score: { hits: number; span: number }) => score.hits * 1000 - score.span;
  let best: { verse: QuoteVerse; hits: number; span: number } | null = null;
  let runner: { hits: number; span: number } | null = null;
  for (let verseIndex = 0; verseIndex < index.catalog.length; verseIndex += 1) {
    const aligned = alignment(needle, index.words[verseIndex]);
    if (!aligned) continue;
    if (!best || rank(aligned) > rank(best)) {
      if (best && (!runner || rank(best) > rank(runner))) runner = { hits: best.hits, span: best.span };
      best = { verse: index.catalog[verseIndex], ...aligned };
    } else if (!runner || rank(aligned) > rank(runner)) {
      runner = aligned;
    }
  }
  if (!best) return null;
  const clear = !runner || best.hits > runner.hits || best.span + 2 < runner.span;
  if (!clear) return null;
  return { item: passageFor(best.verse, translationId), text: best.verse.text };
}

/** A citation or a quoted phrase from anywhere in the translation. Preview only. */
export function matchSpoken(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const spoken = spokenReference(heard);
  if (spoken?.startVerse) {
    const book = CANON.find((entry) => entry.ord === spoken.bookOrd);
    const end = spoken.endVerse ?? spoken.startVerse;
    return {
      item: {
        translationId,
        bookOrd: spoken.bookOrd,
        chapter: spoken.chapter,
        startVerse: spoken.startVerse,
        endVerse: end,
        reference: formatReference(spoken.bookName, spoken.chapter, spoken.startVerse, end, book?.chapters ?? 1),
      },
      text: heard,
    };
  }
  return matchQuote(heard, source, translationId);
}

export function detectVerse(
  heard: string,
  verses: VerseText[],
  book: { ord: number; name: string; chapters: number },
  chapter: number,
  translationId: string,
): BibleItem | null {
  const spoken = spokenReference(heard);
  if (spoken?.startVerse) {
    return {
      translationId,
      bookOrd: spoken.bookOrd,
      chapter: spoken.chapter,
      startVerse: spoken.startVerse,
      endVerse: spoken.endVerse ?? spoken.startVerse,
      reference: formatReference(
        spoken.bookName,
        spoken.chapter,
        spoken.startVerse,
        spoken.endVerse ?? spoken.startVerse,
        spoken.bookOrd === book.ord ? book.chapters : 50,
      ),
    };
  }
  const normalized = normalizeSpeech(heard);
  if (normalized.split(" ").length < 4) return null;
  let best: VerseText | null = null;
  let score = 0;
  for (const verse of verses) {
    const next = overlap(normalized, normalizeSpeech(verse.text));
    if (next > score) {
      score = next;
      best = verse;
    }
  }
  if (!best || score < 0.45) return null;
  return {
    translationId,
    bookOrd: book.ord,
    chapter,
    startVerse: best.verse,
    endVerse: best.verse,
    reference: formatReference(book.name, chapter, best.verse, best.verse, book.chapters),
  };
}
