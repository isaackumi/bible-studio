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

/** A range's end after "to", "through", "and" ("verses 4 to 7"), kept only when it reads as one. */
const RANGE = String.raw`(?:\s+(?:to|through|thru|till|until|and)\s+(?:v\s+)?(\d+)\b)?`;
const rangeEnd = (start: number, end: string | undefined) => (end && Number(end) > start && Number(end) - start <= 40 ? Number(end) : undefined);

/**
 * The chapter and verse spoken after a book name: "3 16", "316", "4 and verse 13", "15, the
 * parable of the prodigal son, verse 11", or the chapter alone ("chapter 8", or "Psalm 23" and
 * "turn to Isaiah 53" when `cued`). "v" marks where the word "verse" was said.
 */
function numbersAfter(tail: string, chapters: number, cued = false): { chapter: number; verse: number; end?: number; exact: boolean } | null {
  const pair = tail.match(new RegExp(String.raw`^\s+(?:ch\s+)?(\d+)\s+(?:and\s+)?(?:v\s+)?(\d+)\b` + RANGE));
  if (pair && !/\bv\b/.test(pair[0]) && notAReference(Number(pair[1]), Number(pair[2]), tail.slice(pair[0].length))) return null;
  if (pair) return { chapter: Number(pair[1]), verse: Number(pair[2]), end: rangeEnd(Number(pair[2]), pair[3]), exact: true };
  const glued = tail.match(/^\s+(\d{3,4})\b/);
  const split = glued ? splitGlued(chapters, glued[1]!) : null;
  if (split) return { ...split, exact: true };
  // The verse said a few words later: up to eight words between, none of them a number.
  const later = tail.match(new RegExp(String.raw`^\s+(?:ch\s+)?(\d+)\b((?:\s+(?!v\b)[a-z]+){1,8})\s+v\s+(\d+)\b` + RANGE));
  if (later) return { chapter: Number(later[1]), verse: Number(later[3]), end: rangeEnd(Number(later[3]), later[4]), exact: true };
  // "Romans chapter eight", "Psalm 23", "turn to Isaiah 53": the chapter, from its first verse.
  const chapterOnly = tail.match(/^\s+ch\s+(\d+)\b(?!\s+(?:\d|v\s))/) ?? (cued ? tail.match(/^\s+(\d+)\b(?!\s+(?:\d|v\s))/) : null);
  if (chapterOnly) return { chapter: Number(chapterOnly[1]), verse: 1, exact: false };
  return null;
}

/** Words that, right after two numbers, make them a count or an amount ("10 12 years", "4 5 6 seats"). */
const UNITS = new Set(["years", "year", "times", "seats", "people", "minutes", "minute", "hours", "hour", "days", "weeks", "months", "kids", "children", "members", "dollars", "cedis", "pounds", "percent", "oclock", "pm", "am", "of"]);

/**
 * Two numbers after a book's name, without "verse" said, that are not a reference: counting
 * ("John 1 2 3 testing") or an amount ("Daniel 10 12 years"). "Proverbs 3 5 6" still reads 3:5-6.
 */
function notAReference(chapter: number, verse: number, rest: string): boolean {
  const next = rest.trim().split(" ")[0] ?? "";
  if (verse === chapter + 1 && Number(next) === verse + 1) return true;
  return UNITS.has(next);
}

/** Words that say a reference is coming ("turn to", "go with me to", "open to", "the book of"). */
const CUES = new Set(["turn", "open", "go", "read", "look", "text", "book", "reading", "passage"]);

/** A chapter said alone counts as a reference after a cue, and always for a Psalm. */
function cuedAt(prepared: string, at: number, book: CanonBook): boolean {
  if (book.name === "Psalms") return true;
  return prepared.slice(0, at).trim().split(" ").slice(-5).some((word) => CUES.has(word));
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
        .replace(/\bverses?\b/g, " v ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  const found: Array<{ at: number; size: number; hit: ParsedReference }> = [];
  const accept = (book: CanonBook, at: number, size: number, tail: string) => {
    const numbers = numbersAfter(tail, book.chapters, cuedAt(prepared, at, book));
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

const FILLER = new Set(["v", "to", "the", "in", "at", "of", "and", "turn", "open", "read", "go", "let", "us", "me", "with", "from", "our", "book", "ch"]);

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
      // "Chapter" or "verse" said with the numbers: a reference is surely meant.
      const marked = isChapterMark || tokens.slice(index, index + 3).includes("v");
      const guess = closestBook(words.join(" "), CANON, volume, marked);
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

/**
 * How a verse was found, and what spoke for it (voice/confidence.ts turns this into how sure to be).
 * citation: a reference said aloud ("John chapter 3 verse 16"). phrase: a run of the verse's own
 * words. quote: its telling words in order, with words between.
 */
export type MatchEvidence =
  | { via: "citation"; cued: boolean; named: boolean; words: number }
  | { via: "phrase"; run: number; telling: number; share: number; places: number; edge: boolean }
  | { via: "quote"; hits: number; needle: number; span: number; gap: number };

export type SpokenMatch = { item: BibleItem; text: string; hits: number; evidence?: MatchEvidence };

function skeleton(word: string): string {
  return word.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
}

function sameWord(heard: string, verse: string, heardSkeleton?: string, verseSkeleton?: string): boolean {
  if (heard === verse) return true;
  if (heard.length < 4 || verse.length < 4) return false;
  if ((heardSkeleton ?? skeleton(heard)) === (verseSkeleton ?? skeleton(verse))) return true;
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
  /** Each word without its vowels ("" for short words), worked out once: comparing is then a lookup. */
  skeletons: string[][];
  postings: Map<string, number[]>;
  /** Every distinct word, built on first typed search that needs spelling help. */
  vocabulary?: string[];
  /** Every verse word for word, small words too, and where each pair of words starts: built on first phrase match. */
  phrases?: { tokens: string[][]; pairs: Map<string, number[]> };
};

export function buildQuoteIndex(catalog: QuoteVerse[]): QuoteIndex {
  const words = catalog.map((verse) => contentWords(verse.normalized));
  const skeletons = words.map((tokens) => tokens.map(skeletonOf));
  const postings = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    const list = postings.get(key);
    if (list) {
      if (list[list.length - 1] !== index) list.push(index);
    } else postings.set(key, [index]);
  };
  words.forEach((tokens, index) => {
    tokens.forEach((token, at) => {
      add(token, index);
      if (token.length >= 4) add(skeletons[index]![at]!, index);
    });
  });
  return { catalog, words, skeletons, postings };
}

/** A word's skeleton when it is long enough to have one worth comparing, else "". */
function skeletonOf(word: string): string {
  return word.length >= 4 ? skeleton(word) : "";
}

/** Indexes already built for a plain list of verses, so passing the same list again costs nothing. */
const builtFor = new WeakMap<QuoteVerse[], QuoteIndex>();

function asIndex(source: QuoteVerse[] | QuoteIndex): QuoteIndex {
  if ("postings" in source) return source;
  let index = builtFor.get(source);
  if (!index) {
    index = buildQuoteIndex(source);
    builtFor.set(source, index);
  }
  return index;
}

/** How many spoken content words appear in order inside one verse, and over how many words. */
function inOrder(needle: string[], verse: string[], needleSkeletons?: string[], verseSkeletons?: string[]): { hits: number; span: number } {
  let from = 0;
  let hits = 0;
  let start = -1;
  let end = -1;
  for (let index = 0; index < verse.length && from < needle.length; index += 1) {
    let at = -1;
    for (let needleIndex = from; needleIndex < needle.length; needleIndex += 1) {
      if (sameWord(needle[needleIndex]!, verse[index]!, needleSkeletons?.[needleIndex], verseSkeletons?.[index])) {
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
function alignment(needle: string[], verse: string[], needleSkeletons?: string[], verseSkeletons?: string[]): { hits: number; span: number } | null {
  const { hits, span } = inOrder(needle, verse, needleSkeletons, verseSkeletons);
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

/** The last answer for each index: partial phrases often end with the same words as the one before. */
const lastQuote = new WeakMap<QuoteIndex, { key: string; match: SpokenMatch | null }>();
/** At most this many verses get the word-by-word check, the ones sharing the most words. */
const MAX_ALIGNED = 1500;

/** Link spoken words to one verse. Extra or missing words are allowed. A vague sentence is not. */
export function matchQuote(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const index = asIndex(source);
  const needle = contentWords(heard).slice(-8);
  if (needle.length < 3 || index.catalog.length === 0) return null;
  const key = `${translationId}|${needle.join(" ")}`;
  const remembered = lastQuote.get(index);
  if (remembered?.key === key) return remembered.match;
  const match = findQuote(needle, index, translationId);
  lastQuote.set(index, { key, match });
  return match;
}

function findQuote(needle: string[], index: QuoteIndex, translationId: string): SpokenMatch | null {
  const needleSkeletons = needle.map(skeletonOf);
  // Count how many of the heard words each verse has (a word or its vowel-less form). Only verses
  // sharing enough of them are checked word by word: dozens, not the thousands with "god" in them.
  const counts = new Map<number, number>();
  let unindexed = 0;
  const distinct = [...new Map(needle.map((word, at) => [word, needleSkeletons[at]!])).entries()];
  for (const [word, skeletonWord] of distinct) {
    const direct = index.postings.get(word);
    const loose = skeletonWord ? index.postings.get(skeletonWord) : undefined;
    if (!direct && !loose) {
      // Not a Bible word as heard (often clipped: "strength" for "strengtheneth"); alignment may still place it.
      unindexed += 1;
      continue;
    }
    const counted = new Set<number>();
    for (const list of [direct, loose]) {
      for (const verseIndex of list ?? []) {
        if (counted.has(verseIndex)) continue;
        counted.add(verseIndex);
        counts.set(verseIndex, (counts.get(verseIndex) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return null;
  // Alignment needs three words in order; two counted words leave room for one clipped or misheard.
  const need = Math.max(1, 2 - unindexed);
  let candidates = [...counts].filter(([, count]) => count >= need);
  if (candidates.length > MAX_ALIGNED) candidates = candidates.sort((a, b) => b[1] - a[1]).slice(0, MAX_ALIGNED);
  const rank = (score: { hits: number; span: number }) => score.hits * 1000 - score.span;
  let best: { verse: QuoteVerse; hits: number; span: number } | null = null;
  let runner: { hits: number; span: number } | null = null;
  for (const [verseIndex] of candidates) {
    const aligned = alignment(needle, index.words[verseIndex]!, needleSkeletons, index.skeletons[verseIndex]);
    if (!aligned) continue;
    if (!best || rank(aligned) > rank(best)) {
      if (best && (!runner || rank(best) > rank(runner))) runner = { hits: best.hits, span: best.span };
      best = { verse: index.catalog[verseIndex]!, ...aligned };
    } else if (!runner || rank(aligned) > rank(runner)) {
      runner = aligned;
    }
  }
  if (!best) return null;
  const clear = !runner || best.hits > runner.hits || best.span + 2 < runner.span;
  if (!clear) return null;
  const evidence: MatchEvidence = { via: "quote", hits: best.hits, needle: needle.length, span: best.span, gap: runner ? best.hits - runner.hits : best.hits };
  return { item: passageFor(best.verse, translationId), text: best.verse.text, hits: best.hits, evidence };
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
  const words = wordsOf(heard).length;
  const short = words <= 10;
  // Said with its markers ("chapter", "verse"), and the book heard by one of its names rather than
  // guessed from a sound-alike ("efficient" for Ephesians).
  const lower = ` ${spellNumbers(normalizeOrdinals(heard.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()))} `;
  const cued = /\b(chapters?|verses?)\b/.test(lower);
  const named = spokenAliases().some((entry) => entry.book.ord === spoken.bookOrd && lower.includes(` ${entry.alias} `));
  return {
    evidence: { via: "citation", cued, named, words },
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
// --- Phrases: a verse found from a run of its words, small words included ("in him was life") ---

/**
 * How people say what the King James writes: "in him is life" for "in him was life", "you" for
 * "thee", "has" for "hath". Both the verse and what was heard are read this way before comparing.
 */
const SPOKEN_FORM: Record<string, string> = {
  is: "be", was: "be", are: "be", were: "be", art: "be", am: "be", be: "be",
  you: "you", thee: "you", thou: "you", ye: "you",
  your: "your", thy: "your", thine: "your", yours: "your",
  has: "has", hath: "has", have: "has", does: "does", doth: "does", says: "says", saith: "says",
  to: "to", unto: "to", shall: "shall", shalt: "shall", will: "shall", hast: "has",
  // Old spellings a speaker says the modern way ("rejoice in the Lord always").
  alway: "always", spake: "spoke",
  // The World English Bible writes "Yahweh" where a preacher says "the Lord"; "which" for "that".
  yahweh: "lord", which: "that",
};
const spokenForm = (word: string) => SPOKEN_FORM[word] ?? word;
/** A word that tells verses apart (not "in", "the", "be", "you"). */
const telling = (word: string) => word.length > 2 && !STOP.has(word) && !(word in SPOKEN_FORM) && !Object.values(SPOKEN_FORM).includes(word);

/** Each verse word for word in its spoken form, and where every pair of words starts (verse × 256 + position). */
function phraseIndex(index: QuoteIndex): NonNullable<QuoteIndex["phrases"]> {
  if (index.phrases) return index.phrases;
  const tokens = index.catalog.map((verse) => verse.normalized.split(" ").filter(Boolean).map(spokenForm).slice(0, 255));
  const pairs = new Map<string, number[]>();
  tokens.forEach((words, verse) => {
    for (let at = 0; at + 1 < words.length; at += 1) {
      const key = `${words[at]} ${words[at + 1]}`;
      const list = pairs.get(key);
      if (list) list.push(verse * 256 + at);
      else pairs.set(key, [verse * 256 + at]);
    }
  });
  index.phrases = { tokens, pairs };
  return index.phrases;
}

/**
 * The verse a run of heard words comes from, word for word ("the lord is my shepherd", "jesus
 * wept"), anywhere in what was said. Kept only when the run points to one verse, says enough
 * (four words or more with a telling word, three with two, or two telling words found in one verse
 * only) and is a real part of that verse (a quarter of it under six words). A run of eight words
 * or more may be in a few verses; the first is taken.
 */
export function matchPhrase(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const index = asIndex(source);
  if (index.catalog.length === 0) return null;
  const { tokens, pairs } = phraseIndex(index);
  const said = wordsOf(heard).map(spokenForm).slice(-40);
  // Each verse the longest run is in, with where in it the run starts.
  let best: { length: number; start: number; verses: Map<number, number> } | null = null;
  for (let start = 0; start + 1 < said.length; start += 1) {
    const hits = pairs.get(`${said[start]} ${said[start + 1]}`);
    if (!hits || hits.length > 4000) continue;
    let longest = 0;
    const verses = new Map<number, number>();
    for (const hit of hits) {
      const verse = Math.floor(hit / 256);
      const at = hit % 256;
      const words = tokens[verse]!;
      let length = 2;
      while (start + length < said.length && at + length < words.length && words[at + length] === said[start + length]) length += 1;
      if (length > longest) {
        longest = length;
        verses.clear();
      }
      if (length === longest && !verses.has(verse)) verses.set(verse, at);
    }
    if (!best || longest > best.length) best = { length: longest, start, verses };
  }
  if (!best) return null;
  const run = said.slice(best.start, best.start + best.length);
  const tellingWords = run.filter(telling).length;
  const characters = run.join(" ").length;
  const enough =
    (best.length >= 4 && tellingWords >= 1) || (best.length === 3 && tellingWords >= 2) || (best.length === 2 && tellingWords === 2 && run.every((word) => word.length >= 4));
  // Counted by verse, not by version: one verse matched in King James and World English is one.
  const place = (verse: number) => `${index.catalog[verse]!.bookOrd}:${index.catalog[verse]!.chapter}:${index.catalog[verse]!.verse}`;
  const places = new Set([...best.verses.keys()].map(place));
  // In one chapter only ("God is love", twice in 1 John 4): its first place is the one to show.
  const chapters = new Set([...places].map((key) => key.split(":").slice(0, 2).join(":")));
  const clear = places.size === 1 || chapters.size === 1 || (best.length >= 8 && places.size <= 3);
  if (!enough || !clear || characters < 9) return null;
  const first = Math.min(...best.verses.keys());
  // A quote is a real part of its verse ("the lord is my shepherd": 5 of 8 words), or how it opens
  // ("Love is patient…"; a verse's last words are not enough: "…will close your eyes"), not four words lost in a long one ("unto thy neighbour, and" heard
  // in "turn to your neighbour and say").
  const at = best.verses.get(first)!;
  const edge = at === 0;
  const share = best.length / tokens[first]!.length;
  if (!edge && ((best.length < 6 && share < 0.25) || (best.length < 8 && share < 0.15))) return null;
  const verse = index.catalog[first]!;
  const evidence: MatchEvidence = { via: "phrase", run: best.length, telling: tellingWords, share, places: places.size, edge };
  return { item: passageFor(verse, translationId), text: verse.text, hits: best.length, evidence };
}

/** The last verse of each chapter in a catalog (book × 1000 + chapter). */
const lastVerses = new WeakMap<QuoteIndex, Map<number, number>>();

/** Whether a passage is in the Bible at all: a verse heard past the end of its chapter is a misheard number. Null when the catalog has no such chapter to say. */
export function passageExists(source: QuoteVerse[] | QuoteIndex, item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">): boolean | null {
  const index = asIndex(source);
  if (!index.catalog.length) return null;
  let map = lastVerses.get(index);
  if (!map) {
    map = new Map();
    for (const verse of index.catalog) {
      const key = verse.bookOrd * 1000 + verse.chapter;
      if ((map.get(key) ?? 0) < verse.verse) map.set(key, verse.verse);
    }
    lastVerses.set(index, map);
  }
  const last = map.get(item.bookOrd * 1000 + item.chapter);
  if (last === undefined) return map.size > 900 ? false : null;
  return item.startVerse >= 1 && item.endVerse <= last;
}

export function matchSpoken(heard: string, source: QuoteVerse[] | QuoteIndex, translationId: string): SpokenMatch | null {
  const spoken = spokenReference(heard);
  const said = hasStartVerse(spoken) ? citationMatch(heard, spoken, translationId) : null;
  // "John 3 verse 99": no such verse, so a number was misheard; whatever else was said may still be one.
  const citation = said && passageExists(source, said.item) !== false ? said : null;
  if (citation && citation.hits >= 12) return citation;
  // A run of the verse's own words, small words included: what a preacher quotes most.
  const phrase = matchPhrase(heard, source, translationId);
  if (phrase && !citation) return phrase;
  // Telling words in order, scattered: four at least now that short quotes are matched as phrases
  // ("close… eyes… heads" is in Isaiah 29:10, but "close your eyes and bow your heads" is not it).
  const scattered = matchQuote(heard, source, translationId);
  const quote = scattered && scattered.hits >= 4 ? scattered : null;
  if (quote) return quote;
  return citation;
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
  const needleSkeletons = needle.map(skeletonOf);
  const scored: Array<{ index: number; score: number }> = [];
  for (const [index, count] of counts) {
    if (count < need) continue;
    const words = source.words[index]!;
    const order = inOrder(needle, words, needleSkeletons, source.skeletons[index]);
    // More words, then words in order and close, then the shorter (denser) verse.
    scored.push({ index, score: count * 100 + order.hits * 10 - order.span - words.length * 0.5 });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ index, score }) => {
    const verse = source.catalog[index]!;
    return { bookOrd: verse.bookOrd, bookName: verse.bookName, chapter: verse.chapter, verse: verse.verse, text: verse.text, score };
  });
}
