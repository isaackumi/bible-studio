import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

// Songs with the church's own AI: find a song it does not have yet, write out a public-domain
// hymn, and suggest songs for a sermon. The AI never writes out a copyrighted song: those come
// from SongSelect, under the church's CCLI license, and are imported as files.

export type SongMatch = {
  title: string;
  authors: string;
  /** The year the words were first published; 0 when unknown. */
  year: number;
  ccli: string;
  copyright: string;
  /** The AI's word that the words are free to use; see wordsAreFree for the app's own check. */
  publicDomain: boolean;
  firstLine: string;
};

export type SongSuggestions = {
  /** Songs from the church's own library, by their place in the list sent. */
  library: Array<{ index: number; why: string }>;
  /** Songs the church does not have yet. */
  others: Array<{ title: string; authors: string; why: string }>;
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The JSON object in an answer (allowing a ```json fence or stray words around it). */
function jsonIn(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data: unknown = JSON.parse(text.slice(start, end + 1));
      if (data && typeof data === "object") return data as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  throw new Error("The AI answer was not in the expected shape. Try again.");
}

const FIND = `You help a church find worship songs and hymns. From what the person types (a title, a line
they remember, or what the song is about), name the songs it most likely is, best match first, at
most 5. For each give "title", "authors" (writers of the words and music), "year" (the year the
words were first published, as a number, 0 if unsure), "ccli" (the CCLI SongSelect song number as
digits, "" if unsure), "copyright" (the copyright line, "" for public domain), "publicDomain" (true
only if the words as usually sung are in the public domain; a modern version or added chorus of
an old hymn is not) and "firstLine" (the first line, at most 12 words).
Only name real songs. Never write out the lyrics.
Answer with JSON only: {"songs": [{"title": "...", "authors": "...", "year": 1779, "ccli": "", "copyright": "", "publicDomain": true, "firstLine": "..."}]}`;

export function findSongRequest(settings: AiSettings, query: string): AiRequest {
  return chatRequest(settings, FIND, `Find: ${query.slice(0, 500)}`, { maxTokens: 1200, temperature: 0.2 });
}

export function parseSongMatches(text: string): SongMatch[] {
  const record = jsonIn(text);
  return (Array.isArray(record.songs) ? record.songs : [])
    .map((raw) => {
      const song = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const year = typeof song.year === "number" && Number.isInteger(song.year) && song.year > 0 && song.year < 3000 ? song.year : 0;
      return {
        title: clean(song.title, 120),
        authors: clean(song.authors, 200),
        year,
        ccli: typeof song.ccli === "string" || typeof song.ccli === "number" ? String(song.ccli).replace(/\D+/g, "").slice(0, 12) : "",
        copyright: clean(song.copyright, 200),
        publicDomain: song.publicDomain === true,
        firstLine: clean(song.firstLine, 120),
      };
    })
    .filter((song) => song.title)
    .slice(0, 5);
}

/**
 * Whether the app lets the AI write the words out: the AI must call them public domain AND give a
 * first-publication year old enough to be out of copyright (in the US, 95 years after the year of
 * publication, from the January after). Unsure means no.
 */
export function wordsAreFree(song: Pick<SongMatch, "publicDomain" | "year" | "copyright">, now = new Date()): boolean {
  return song.publicDomain && !song.copyright && song.year > 0 && song.year <= now.getFullYear() - 96;
}

const HYMN = `You write out public-domain hymns for a church's projection screen. Write the words of the
hymn named below as they were published, with every verse. Put a header line before each part:
"Verse 1", "Verse 2", ..., "Chorus" (once, where it is first sung) or "Refrain". Leave a blank line
between parts. Words only: no title, no chords, no notes, no markdown.
If the words as usually sung are not in the public domain, or you are not sure of them, answer
exactly: NOT AVAILABLE`;

export function hymnRequest(settings: AiSettings, song: Pick<SongMatch, "title" | "authors" | "year">): AiRequest {
  const message = `Hymn: ${song.title}${song.authors ? `\nBy: ${song.authors}` : ""}${song.year ? `\nPublished: ${song.year}` : ""}`;
  return chatRequest(settings, HYMN, message, { maxTokens: 2500, temperature: 0 });
}

/** The hymn's words, ready for the song parser; an error when the AI declined. */
export function parseHymn(text: string): string {
  const words = text.replace(/```[a-z]*\n?|```/g, "").trim();
  if (!words || /^NOT AVAILABLE\b/i.test(words)) throw new Error("The AI could not write these words out. Get the song from SongSelect instead.");
  return words;
}

const SUGGEST = `You help a church choose songs for a service. From the sermon below, pick songs that fit
its message and its scriptures.
1. "library": up to 8 songs from the church's own list (given as numbered lines), by their number
   "n", with "why" (at most 15 words). Only use numbers from the list.
2. "others": up to 5 well-known worship songs or hymns the church does not have, with "title",
   "authors" and "why" (at most 15 words). Only name real songs.
Best fit first. Answer with JSON only:
{"library": [{"n": 3, "why": "..."}], "others": [{"title": "...", "authors": "...", "why": "..."}]}`;

/** At most this many library songs go with the request. */
export const SUGGEST_LIBRARY_LIMIT = 800;

const wordSet = (text: string) => new Set(text.toLowerCase().match(/[a-z']{4,}/g) ?? []);

/**
 * The library songs to send: all of them when they fit, else the ones sharing the most words with
 * the sermon (title, notes and the songs' own words), so a large library is not cut off at "M".
 */
export function songsToSuggestFrom<T extends { title: string; author: string; sections?: Array<{ lines: string[] }> }>(songs: T[], sermon: { title: string; notes: string }, limit = SUGGEST_LIBRARY_LIMIT): T[] {
  if (songs.length <= limit) return songs;
  const sermonWords = wordSet(`${sermon.title} ${sermon.notes}`);
  const score = (song: T) => {
    let shared = 0;
    for (const word of wordSet(`${song.title} ${song.title} ${(song.sections ?? []).flatMap((section) => section.lines).join(" ")}`)) if (sermonWords.has(word)) shared += 1;
    return shared;
  };
  return songs
    .map((song, order) => ({ song, order, score: score(song) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.song);
}

export function suggestSongsRequest(settings: AiSettings, input: { title: string; notes: string; songs: Array<{ title: string; author: string }> }): AiRequest {
  const list = input.songs
    .slice(0, SUGGEST_LIBRARY_LIMIT)
    .map((song, n) => `${n + 1}. ${song.title}${song.author ? ` (${song.author})` : ""}`)
    .join("\n");
  const message = `Sermon: ${input.title || "(untitled)"}\n\n${input.notes.slice(0, 12_000)}\n\nThe church's songs:\n${list || "(none yet)"}`;
  return chatRequest(settings, SUGGEST, message, { maxTokens: 1500, temperature: 0.3 });
}

/** Read the suggestions; library numbers outside the list are dropped. Indexes are 0-based. */
export function parseSongSuggestions(text: string, librarySize: number): SongSuggestions {
  const record = jsonIn(text);
  const seen = new Set<number>();
  const library = (Array.isArray(record.library) ? record.library : [])
    .map((raw) => {
      const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const n = typeof entry.n === "number" ? entry.n : typeof entry.n === "string" ? Number(entry.n) : NaN;
      return { index: Number.isInteger(n) ? n - 1 : -1, why: clean(entry.why, 160) };
    })
    .filter((entry) => entry.index >= 0 && entry.index < Math.min(librarySize, SUGGEST_LIBRARY_LIMIT) && !seen.has(entry.index) && seen.add(entry.index))
    .slice(0, 8);
  const others = (Array.isArray(record.others) ? record.others : [])
    .map((raw) => {
      const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return { title: clean(entry.title, 120), authors: clean(entry.authors, 200), why: clean(entry.why, 160) };
    })
    .filter((entry) => entry.title)
    .slice(0, 5);
  return { library, others };
}

/** SongSelect's search for a song: by its CCLI number when known, else its title. */
export function songSelectUrl(song: Pick<SongMatch, "title" | "ccli">): string {
  return `https://songselect.ccli.com/search/results?search=${encodeURIComponent(song.ccli || song.title)}`;
}
