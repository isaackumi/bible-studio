import type { Song } from "../domain/types";
import { normalizeSpeech } from "./detect";

// Song detection: match what the room sings against the lyrics of saved songs.
// Lyrics repeat and recognizers mishear singing, so a match needs several sung words, in order,
// close together inside one section, and a clear winner. The song already on screen wins ties.

export type SongIndexEntry = {
  songId: string;
  sectionId: string;
  label: string;
  words: string[];
  /** Each word's stem, worked out once: comparing is then a lookup. */
  stems: string[];
};
export type SongIndex = { entries: SongIndexEntry[]; postings: Map<string, number[]> };
export type SungMatch = { songId: string; sectionId: string; label: string; hits: number };

// Fillers that carry no meaning in a lyric line. Kept short: "you", "lord", "love" matter in songs.
const FILLER = new Set(["a", "an", "the", "and", "oh", "o", "ah", "uh", "um", "la", "na", "yeah", "hey", "to", "of", "in"]);

function words(text: string): string[] {
  return normalizeSpeech(text)
    .split(" ")
    .filter((word) => word.length > 1 && !FILLER.has(word));
}

/** Loose word equality: plural and -ing endings and a dropped g ("lovin") still match. */
function stem(word: string): string {
  return word.replace(/(ing|in|s)$/, "");
}

function same(a: string, b: string, stemA: string, stemB: string): boolean {
  return a === b || (a.length > 3 && b.length > 3 && stemA === stemB);
}

export function buildSongIndex(songs: Song[]): SongIndex {
  const entries: SongIndexEntry[] = [];
  const postings = new Map<string, number[]>();
  for (const song of songs) {
    for (const section of song.sections) {
      const sectionWords = words(section.lines.join(" "));
      if (sectionWords.length < 3) continue;
      const at = entries.length;
      const stems = sectionWords.map(stem);
      entries.push({ songId: song.id, sectionId: section.id, label: `${song.title} — ${section.label}`, words: sectionWords, stems });
      for (const word of new Set(stems)) {
        const list = postings.get(word);
        if (list) list.push(at);
        else postings.set(word, [at]);
      }
    }
  }
  return { entries, postings };
}

/** Sung words found in order inside a section, and how spread out they are. */
function align(needle: string[], needleStems: string[], hay: string[], hayStems: string[]): { hits: number; span: number } | null {
  let from = 0;
  let hits = 0;
  let start = -1;
  let end = -1;
  for (let index = 0; index < hay.length && from < needle.length; index += 1) {
    let at = -1;
    for (let n = from; n < needle.length; n += 1) {
      if (same(needle[n]!, hay[index]!, needleStems[n]!, hayStems[index]!)) {
        at = n;
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
  return span > hits * 3 ? null : { hits, span };
}

/**
 * The section being sung, or null when unsure. `current` (the song on screen) gets a one-word
 * head start, so a repeated chorus line keeps following this song instead of jumping to another.
 */
export function matchSung(heard: string, index: SongIndex, current: string | null = null): SungMatch | null {
  const needle = words(heard).slice(-10);
  if (needle.length < 3 || index.entries.length === 0) return null;
  const key = `${current ?? ""}|${needle.join(" ")}`;
  const remembered = lastSung.get(index);
  if (remembered?.key === key) return remembered.match;
  const match = findSung(needle, index, current);
  lastSung.set(index, { key, match });
  return match;
}

/** The last answer for each index: partial phrases often end with the same words as the one before. */
const lastSung = new WeakMap<SongIndex, { key: string; match: SungMatch | null }>();

function findSung(needle: string[], index: SongIndex, current: string | null): SungMatch | null {
  const needleStems = needle.map(stem);
  // Count how many different sung words each section has; only sections sharing enough of them are
  // checked word by word (not every section with "you" or "lord" in it). A repeated word ("holy,
  // holy, holy") counts once, so the bar drops with fewer different words; one is left as slack.
  const distinct = [...new Set(needleStems)];
  const counts = new Map<number, number>();
  for (const word of distinct) for (const at of index.postings.get(word) ?? []) counts.set(at, (counts.get(at) ?? 0) + 1);
  const need = Math.max(1, Math.min(3, distinct.length) - 1);
  const score = (hits: number, span: number, songId: string) => hits * 100 - span + (songId === current ? 100 : 0);
  let best: { entry: SongIndexEntry; hits: number; value: number } | null = null;
  let runner = -Infinity;
  for (const [at, count] of counts) {
    if (count < need) continue;
    const entry = index.entries[at]!;
    const aligned = align(needle, needleStems, entry.words, entry.stems);
    if (!aligned) continue;
    const value = score(aligned.hits, aligned.span, entry.songId);
    if (!best || value > best.value) {
      if (best) runner = Math.max(runner, best.value);
      best = { entry, hits: aligned.hits, value };
    } else runner = Math.max(runner, value);
  }
  // A clear winner: at least one more matched word (or the current-song head start) over the next best.
  if (!best || best.value - runner < 60) return null;
  return { songId: best.entry.songId, sectionId: best.entry.sectionId, label: best.entry.label, hits: best.hits };
}

/** Try each recognizer alternative and keep the strongest match. */
export function chooseSung(phrases: string[], index: SongIndex, current: string | null = null): SungMatch | null {
  let best: SungMatch | null = null;
  for (const phrase of phrases) {
    const match = matchSung(phrase, index, current);
    if (match && (!best || match.hits > best.hits)) best = match;
  }
  return best;
}

/**
 * Line by line: which screen of a part holds what was just sung. Recent words count most, so the
 * follow moves on as the singing does; a tie keeps the screen already showing.
 */
export function screenForSung(heard: string, lines: string[], screens: Array<{ from: number; to: number }>, current = 0): number {
  if (screens.length < 2) return 0;
  const sung = words(heard).slice(-10).map(stem);
  if (!sung.length) return current;
  let best = current;
  let bestScore = -1;
  screens.forEach((screen, at) => {
    const here = new Set(words(lines.slice(screen.from, screen.to).join(" ")).map(stem));
    const score = sung.reduce((sum, word, n) => sum + (here.has(word) ? n + 1 : 0), 0);
    if (score > bestScore || (score === bestScore && at === current)) {
      best = at;
      bestScore = score;
    }
  });
  return bestScore > 0 ? best : current;
}
