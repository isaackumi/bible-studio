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

function wordsOf(text: string): string[] {
  return normalizeSpeech(text).split(" ").filter(Boolean);
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

/** A quoted phrase must occur in order in one verse. A shared word is not enough. */
export function matchQuote(heard: string, catalog: QuoteVerse[], translationId: string): SpokenMatch | null {
  const heardWords = wordsOf(heard).slice(-24);
  if (heardWords.length < 6 || catalog.length === 0) return null;
  const longest = Math.min(heardWords.length, 18);
  for (let size = longest; size >= 6; size -= 1) {
    const keys: string[] = [];
    for (let index = 0; index + size <= heardWords.length; index += 1) {
      keys.push(heardWords.slice(index, index + size).join(" "));
    }
    const hits = new Map<string, QuoteVerse>();
    for (const verse of catalog) {
      const hay = ` ${verse.normalized} `;
      if (keys.some((key) => hay.includes(` ${key} `))) {
        hits.set(`${verse.bookOrd}:${verse.chapter}:${verse.verse}`, verse);
      }
    }
    if (hits.size > 1) return null;
    const verse = hits.values().next().value as QuoteVerse | undefined;
    if (verse) return { item: passageFor(verse, translationId), text: verse.text };
  }
  return null;
}

/** A citation or a quoted phrase from anywhere in the translation. Preview only. */
export function matchSpoken(heard: string, catalog: QuoteVerse[], translationId: string): SpokenMatch | null {
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
  return matchQuote(heard, catalog, translationId);
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
