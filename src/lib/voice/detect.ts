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

const SMALL: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function takeNumber(tokens: string[], index: number): { value: number; next: number } | null {
  let value = 0;
  let next = index;
  if (TENS[tokens[next]] !== undefined) {
    value = TENS[tokens[next]];
    next += 1;
    if (SMALL[tokens[next]] !== undefined && SMALL[tokens[next]] < 10) {
      value += SMALL[tokens[next]];
      next += 1;
    }
  } else if (SMALL[tokens[next]] !== undefined) {
    value = SMALL[tokens[next]];
    next += 1;
  } else {
    return null;
  }
  if (tokens[next] === "hundred") {
    value *= 100;
    next += 1;
    const rest = takeNumber(tokens, next);
    if (rest && rest.value < 100) {
      value += rest.value;
      next = rest.next;
    }
  }
  return { value, next };
}

/** "one verse eight" and "three sixteen" become digits the reference parser can read. */
function spellNumbers(text: string): string {
  const tokens = text.split(" ").filter(Boolean);
  const spoken: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const taken = takeNumber(tokens, index);
    if (!taken) {
      spoken.push(tokens[index]);
      continue;
    }
    spoken.push(String(taken.value));
    index = taken.next - 1;
  }
  return spoken.join(" ");
}

/** Speech often glues "3 16" into "316". Split only when one chapter/verse pair fits the book. */
function splitGlued(chapters: number, digits: string): { chapter: number; verse: number } | null {
  if (digits.length < 3) return null;
  const options: Array<{ chapter: number; verse: number }> = [];
  for (let cut = 1; cut < digits.length; cut += 1) {
    const chapter = Number(digits.slice(0, cut));
    const verse = Number(digits.slice(cut));
    if (chapter >= 1 && chapter <= chapters && verse >= 1 && verse <= 176) options.push({ chapter, verse });
  }
  return options.length === 1 ? options[0] : null;
}

/** Turn spoken "john 3 16", "john 316", or "joshua one verse eight" into a reference. The latest one wins. */
export function spokenReference(raw: string): ParsedReference | null {
  const prepared = spellNumbers(
    raw
      .toLowerCase()
      .replace(/\bchapters?\b/g, " ")
      .replace(/\bverses?\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const found: Array<{ at: number; alias: string; hit: ParsedReference }> = [];
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
        const tail = prepared.slice(after);
        const pair = tail.match(/^\s+(\d+)\s+(\d+)\b/);
        const glued = pair ? null : tail.match(/^\s+(\d{3,4})\b/);
        const split = glued ? splitGlued(entry.book.chapters, glued[1]) : null;
        const reference = pair
          ? `${entry.alias} ${pair[1]}:${pair[2]}`
          : split
            ? `${entry.alias} ${split.chapter}:${split.verse}`
            : null;
        const hit = reference ? parseReference(reference) : null;
        if (hit?.startVerse) found.push({ at, alias: entry.alias, hit });
      }
      from = at + Math.max(entry.alias.length, 1);
    }
  }
  found.sort((a, b) => a.at - b.at || a.alias.length - b.alias.length);
  return found.at(-1)?.hit ?? null;
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

export type SpokenMatch = { item: BibleItem; text: string; hits: number };

function skeleton(word: string): string {
  return word.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
}

function sameWord(heard: string, verse: string): boolean {
  if (heard === verse) return true;
  if (heard.length < 4 || verse.length < 4) return false;
  return skeleton(heard) === skeleton(verse);
}

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
  const add = (key: string, index: number) => {
    const list = postings.get(key);
    if (list) list.push(index);
    else postings.set(key, [index]);
  };
  words.forEach((tokens, index) => {
    for (const token of new Set(tokens)) {
      add(token, index);
      if (token.length >= 4) add(skeleton(token), index);
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
    let at = -1;
    for (let needleIndex = from; needleIndex < needle.length; needleIndex += 1) {
      if (sameWord(needle[needleIndex], verse[index])) {
        at = needleIndex;
        break;
      }
    }
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
  const lists = needle
    .map((word) => index.postings.get(word) ?? (word.length >= 4 ? index.postings.get(skeleton(word)) : undefined))
    .filter((list): list is number[] => !!list && list.length > 0)
    .sort((a, b) => a.length - b.length);
  if (lists.length === 0) return null;
  const rank = (score: { hits: number; span: number }) => score.hits * 1000 - score.span;
  let best: { verse: QuoteVerse; hits: number; span: number } | null = null;
  let runner: { hits: number; span: number } | null = null;
  for (const verseIndex of new Set(lists[0])) {
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
  return { item: passageFor(best.verse, translationId), text: best.verse.text, hits: best.hits };
}

function citationMatch(heard: string, spoken: ParsedReference, translationId: string): SpokenMatch {
  const book = CANON.find((entry) => entry.ord === spoken.bookOrd);
  const end = spoken.endVerse ?? spoken.startVerse;
  const short = wordsOf(heard).length <= 10;
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
    hits: short ? 12 : 4,
  };
}

/** A citation or a quoted phrase. A later quote beats an older reference in the same phrase. */
export function matchSpoken(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const spoken = spokenReference(heard);
  const citation = spoken?.startVerse ? citationMatch(heard, spoken, translationId) : null;
  if (citation && citation.hits >= 12) return citation;
  const quote = matchQuote(heard, source, translationId);
  if (quote && (!citation || quote.hits >= 4)) return quote;
  return citation ?? quote;
}

/** Try each recognizer alternative and keep the one that lands on scripture. */
export function chooseHeard(phrases: string[], source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  let best: SpokenMatch | null = null;
  for (const phrase of phrases) {
    const match = matchSpoken(phrase.trim(), source, translationId);
    if (match && (!best || match.hits > best.hits)) best = match;
  }
  return best;
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
