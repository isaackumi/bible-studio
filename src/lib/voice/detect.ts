import { closestBook, normalizeOrdinals } from "../bible/books";
import { aliasIndex, CANON, formatReference, parseReference, type CanonBook, type ParsedReference } from "../bible/reference";
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

/** The chapter and verse spoken right after a book name: "3 16", "316", or "chapter 8" alone. */
function numbersAfter(tail: string, chapters: number): { chapter: number; verse: number; end?: number; exact: boolean } | null {
  const pair = tail.match(/^\s+(?:ch\s+)?(\d+)\s+(\d+)\b(?:\s+(?:to|through|thru|till|until|and)\s+(\d+)\b)?/);
  if (pair) {
    const end = pair[3] ? Number(pair[3]) : undefined;
    return { chapter: Number(pair[1]), verse: Number(pair[2]), end: end && end > Number(pair[2]) && end - Number(pair[2]) <= 40 ? end : undefined, exact: true };
  }
  const glued = tail.match(/^\s+(\d{3,4})\b/);
  const split = glued ? splitGlued(chapters, glued[1]!) : null;
  if (split) return { ...split, exact: true };
  // "Romans chapter eight": the chapter, from its first verse.
  const chapterOnly = tail.match(/^\s+ch\s+(\d+)\b(?!\s+\d)/);
  if (chapterOnly) return { chapter: Number(chapterOnly[1]), verse: 1, exact: false };
  return null;
}

/**
 * Turn spoken "john 3 16", "first corinthians thirteen four", "romans chapter eight" into a
 * reference. Book names are matched exactly first; when none is, the closest sound-alike
 * ("ga tians" → Galatians, "siah" → Isaiah) is tried, and only kept if the numbers fit that
 * book. The latest reference in the phrase wins.
 */
export function spokenReference(raw: string): ParsedReference | null {
  const prepared = spellNumbers(
    normalizeOrdinals(
      raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\bchapters?\b/g, " ch ")
        .replace(/\bverses?\b/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  const found: Array<{ at: number; size: number; hit: ParsedReference }> = [];
  const accept = (book: CanonBook, at: number, size: number, tail: string) => {
    const numbers = numbersAfter(tail, book.chapters);
    if (!numbers) return false;
    const hit = parseReference(`${book.name} ${numbers.chapter}:${numbers.verse}${numbers.end ? `-${numbers.end}` : ""}`);
    if (!hit?.startVerse) return false;
    found.push({ at, size: size + (numbers.exact ? 1000 : 0), hit });
    return true;
  };
  // Longest names first; a longer name claims its words ("1 john" is not also "john").
  const claimed: Array<[number, number]> = [];
  for (const entry of spokenAliases()) {
    let from = 0;
    while (from < prepared.length) {
      const at = prepared.indexOf(entry.alias, from);
      if (at < 0) break;
      const before = at === 0 || prepared[at - 1] === " ";
      const after = at + entry.alias.length;
      const ended = after === prepared.length || prepared[after] === " ";
      const inside = claimed.some(([start, end]) => at >= start && after <= end);
      if (before && ended && !inside) {
        claimed.push([at, after]);
        accept(entry.book, at, entry.alias.length, prepared.slice(after));
      }
      from = at + Math.max(entry.alias.length, 1);
    }
  }
  if (found.length === 0) fuzzyReferences(prepared, accept);
  found.sort((a, b) => a.at - b.at || a.size - b.size);
  return found.at(-1)?.hit ?? null;
}

let spokenAliasList: ReturnType<typeof aliasIndex> | null = null;
function spokenAliases() {
  spokenAliasList ??= aliasIndex(CANON).filter((entry) => entry.alias.length >= 3);
  return spokenAliasList;
}

const FILLER = new Set(["to", "the", "in", "at", "of", "and", "turn", "open", "read", "go", "let", "us", "me", "with", "from", "our", "book", "ch"]);

/** For each spoken chapter number, try the one to three words before it as a misheard book name. */
function fuzzyReferences(prepared: string, accept: (book: CanonBook, at: number, size: number, tail: string) => boolean) {
  const tokens = prepared.split(" ");
  const starts: number[] = [];
  let offset = 0;
  for (const token of tokens) {
    starts.push(offset);
    offset += token.length + 1;
  }
  for (let index = 1; index < tokens.length; index += 1) {
    const isChapterMark = tokens[index] === "ch" && /^\d+$/.test(tokens[index + 1] ?? "");
    if (!/^\d+$/.test(tokens[index]!) && !isChapterMark) continue;
    let best: { book: CanonBook; score: number; first: number } | null = null;
    for (let size = 1; size <= 3; size += 1) {
      const first = index - size;
      if (first < 0) break;
      const words = tokens.slice(first, index);
      if (words.some((word) => /\d/.test(word))) break;
      if (FILLER.has(words[0]!)) continue;
      const volumeToken = tokens[first - 1];
      const volume = volumeToken && /^[123]$/.test(volumeToken) ? Number(volumeToken) : null;
      const guess = closestBook(words.join(" "), CANON, volume);
      if (guess && (!best || guess.score > best.score)) best = { ...guess, first };
    }
    if (best) accept(best.book, starts[best.first]!, 0, " " + tokens.slice(index).join(" "));
  }
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
  if (skeleton(heard) === skeleton(verse)) return true;
  // A clipped word: "strength" heard for "strengtheneth", "rejoice" for "rejoiceth".
  return heard.length >= 5 && verse.length > heard.length && verse.startsWith(heard);
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
  /** Every distinct word, built on first typed search that needs spelling help. */
  vocabulary?: string[];
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

/** How many spoken content words appear in order inside one verse, and over how many words. */
function inOrder(needle: string[], verse: string[]): { hits: number; span: number } {
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
  return { hits, span: hits ? end - start + 1 : 0 };
}

/** In order and close together, with enough words to trust it. */
function alignment(needle: string[], verse: string[]): { hits: number; span: number } | null {
  const { hits, span } = inOrder(needle, verse);
  if (hits < 3 || span > hits * 3) return null;
  return { hits, span };
}

/** Real words in the index closest to a typed word that is not one ("shepard" → "shepherd"). */
function nearWords(index: QuoteIndex, word: string): string[] {
  if (word.length < 4) return [];
  index.vocabulary ??= [...new Set(index.words.flat())];
  const allowed = word.length >= 7 ? 2 : 1;
  const found: Array<{ key: string; distance: number }> = [];
  for (const key of index.vocabulary) {
    if (key[0] !== word[0] || Math.abs(key.length - word.length) > allowed) continue;
    const distance = editDistance(word, key);
    if (distance <= allowed) found.push({ key, distance });
  }
  // Closest first; among equals, the commoner word ("shepherd" before the place Shepham).
  const common = (key: string) => index.postings.get(key)?.length ?? 0;
  return found.sort((a, b) => a.distance - b.distance || common(b.key) - common(a.key)).slice(0, 4).map((entry) => entry.key);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
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
  // Candidates from the three rarest words, so one misheard word does not lose the verse.
  const candidates = new Set<number>();
  for (const list of lists.slice(0, 3)) {
    if (candidates.size > 0 && candidates.size + list.length > 6000) break;
    for (const verseIndex of list) candidates.add(verseIndex);
  }
  for (const verseIndex of candidates) {
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

function hasStartVerse(spoken: ParsedReference | null): spoken is ParsedReference & { startVerse: number } {
  return spoken !== null && typeof spoken.startVerse === "number" && spoken.startVerse > 0;
}

function citationMatch(
  heard: string,
  spoken: ParsedReference & { startVerse: number },
  translationId: string,
): SpokenMatch {
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
  const citation = hasStartVerse(spoken) ? citationMatch(heard, spoken, translationId) : null;
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

export type QuoteHit = { bookOrd: number; bookName: string; chapter: number; verse: number; text: string; score: number };

/**
 * Typed phrase search: verses ranked by how many of the typed words they contain (spelling
 * slips allowed), with words in order and close together ranked first. Not exact-substring,
 * so "love patient kind" finds 1 Corinthians 13:4.
 */
export function searchQuotes(query: string, source: QuoteIndex, limit = 30): QuoteHit[] {
  const typed = [...new Set(contentWords(query))].slice(0, 12);
  if (typed.length === 0) return [];
  // A typed word that is not in the Bible is read as the nearest word that is.
  const choices = typed.map((word) => (source.postings.has(word) ? [word] : nearWords(source, word).concat(word)));
  const needle = choices.map((options) => options[0]!);
  const counts = new Map<number, number>();
  for (const options of choices) {
    const verses = new Set<number>();
    for (const word of options) {
      for (const verseIndex of source.postings.get(word) ?? (word.length >= 4 ? source.postings.get(skeleton(word)) : undefined) ?? []) verses.add(verseIndex);
    }
    for (const verseIndex of verses) counts.set(verseIndex, (counts.get(verseIndex) ?? 0) + 1);
  }
  const need = needle.length <= 2 ? needle.length : Math.ceil(needle.length * 0.6);
  const scored: Array<{ index: number; score: number }> = [];
  for (const [index, count] of counts) {
    if (count < need) continue;
    const words = source.words[index]!;
    const order = inOrder(needle, words);
    // More words, then words in order and close, then the shorter (denser) verse.
    scored.push({ index, score: count * 100 + order.hits * 10 - order.span - words.length * 0.5 });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ index, score }) => {
    const verse = source.catalog[index]!;
    return { bookOrd: verse.bookOrd, bookName: verse.bookName, chapter: verse.chapter, verse: verse.verse, text: verse.text, score };
  });
}
