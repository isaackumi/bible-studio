import { searchWords as words, wordMatches, wordsFound, wordsNeeded } from "./match-words";
import type { Song } from "./types";

export type SongHit = {
  songId: string;
  sectionId: string;
  title: string;
  author: string;
  label: string;
  snippet: string;
};

export type SongRecent = { songId: string; sectionId: string };

function haystack(song: Song, section: Song["sections"][number]): string {
  return `${song.title} ${song.author} ${section.label} ${section.lines.join(" ")}`.toLowerCase();
}

function snippetFor(song: Song, section: Song["sections"][number], typed: string[]): string {
  const line = section.lines.find((entry) => {
    const lineWords = words(entry);
    return typed.some((word) => lineWords.some((candidate) => wordMatches(word, candidate)));
  });
  return line?.trim() || section.lines.find((entry) => entry.trim())?.trim() || section.label;
}

// Words per section, worked out once per song edit (search runs on every keystroke).
const wordCache = new WeakMap<Song["sections"][number], { head: string; words: string[] }>();
function sectionWords(song: Song, section: Song["sections"][number], titleWords: string[]): string[] {
  const head = `${song.title}\n${song.author}`;
  const cached = wordCache.get(section);
  if (cached && cached.head === head) return cached.words;
  const built = [...new Set([...titleWords, ...words(`${section.label} ${section.lines.join(" ")}`)])];
  wordCache.set(section, { head, words: built });
  return built;
}

/**
 * Songs by title, author or lyrics. The exact phrase ranks first (title before lyrics), then
 * sections holding most of the typed words; a word can be the start of one or have a slip,
 * so "amazng grase" and "how swet the" still find Amazing Grace.
 */
export function searchSongHits(songs: Song[], query: string, limit = 24): SongHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const typed = words(needle);
  if (typed.length === 0) return [];
  const need = wordsNeeded(typed);
  const scored: Array<{ hit: SongHit; score: number; order: number }> = [];
  let order = 0;
  for (const song of songs) {
    const titleWords = words(`${song.title} ${song.author}`);
    for (const section of song.sections) {
      order += 1;
      const text = haystack(song, section);
      const all = sectionWords(song, section, titleWords);
      const found = wordsFound(typed, all);
      const exact = text.includes(needle);
      if (!exact && found < need) continue;
      const inTitle = song.title.toLowerCase().includes(needle);
      const score = (exact ? 1000 : 0) + (inTitle ? 500 : 0) + found * 10 - (section.kind === "verse" ? 0 : 1);
      scored.push({
        hit: {
          songId: song.id,
          sectionId: section.id,
          title: song.title || "Untitled song",
          author: song.author,
          label: section.label,
          snippet: snippetFor(song, section, typed),
        },
        score,
        order,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((entry) => entry.hit);
}

export function recentSongHits(songs: Song[], recents: SongRecent[], limit = 8): SongHit[] {
  const hits: SongHit[] = [];
  for (const recent of recents) {
    const song = songs.find((entry) => entry.id === recent.songId);
    const section = song?.sections.find((entry) => entry.id === recent.sectionId);
    if (!song || !section) continue;
    hits.push({
      songId: song.id,
      sectionId: section.id,
      title: song.title || "Untitled song",
      author: song.author,
      label: section.label,
      snippet: section.lines.find((entry) => entry.trim())?.trim() || section.label,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function rememberSongRecent(recents: SongRecent[], next: SongRecent, limit = 12): SongRecent[] {
  return [next, ...recents.filter((entry) => entry.songId !== next.songId || entry.sectionId !== next.sectionId)].slice(0, limit);
}
