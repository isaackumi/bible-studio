// Browsing a long song list in the sidebar: a quick filter, an order, and letter headings for A–Z
// so a library of hundreds of songs stays easy to scan and jump through.

import type { Song } from "./types";

export type SongSort = "favorites" | "az" | "most";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Title, author and the first line of every part, matched word by word ("great faith" finds "Great Is Thy Faithfulness"). */
export function quickFilter(songs: Song[], query: string): Song[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return songs;
  return songs.filter((song) => {
    const hay = fold([song.title, song.author, ...song.sections.map((section) => section.lines[0] ?? "")].join(" "));
    return words.every((word) => hay.includes(word));
  });
}

/** The letter a title files under: A–Z, or # for numbers and symbols. Leading "The" and "A" are kept, as people search for them. */
export function letterOf(title: string): string {
  const first = fold(title.trim()).charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

const byTitle = (a: Song, b: Song) => fold(a.title || "￿").localeCompare(fold(b.title || "￿"), undefined, { numeric: true });

export function sortSongs(songs: Song[], sort: SongSort, context: { starred: (song: Song) => boolean; mostSung: string[] }): Song[] {
  if (sort === "az") return [...songs].sort(byTitle);
  if (sort === "most") {
    const rank = new Map(context.mostSung.map((id, index) => [id, index]));
    return [...songs].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || byTitle(a, b));
  }
  return [...songs.filter(context.starred), ...songs.filter((song) => !context.starred(song))];
}

/** Rows for an A–Z list: a heading before each new letter. */
export function withLetters(songs: Song[]): Array<{ kind: "letter"; letter: string } | { kind: "song"; song: Song }> {
  const rows: Array<{ kind: "letter"; letter: string } | { kind: "song"; song: Song }> = [];
  let last = "";
  for (const song of songs) {
    const letter = letterOf(song.title);
    if (letter !== last) rows.push({ kind: "letter", letter });
    last = letter;
    rows.push({ kind: "song", song });
  }
  return rows;
}
