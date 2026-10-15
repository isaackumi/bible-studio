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

function snippetFor(song: Song, section: Song["sections"][number], needle: string): string {
  const line = section.lines.find((entry) => entry.toLowerCase().includes(needle));
  if (line?.trim()) return line.trim();
  if (song.title.toLowerCase().includes(needle) || song.author.toLowerCase().includes(needle)) {
    return section.lines.find((entry) => entry.trim())?.trim() || section.label;
  }
  return section.lines.find((entry) => entry.trim())?.trim() || section.label;
}

export function searchSongHits(songs: Song[], query: string, limit = 24): SongHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: SongHit[] = [];
  for (const song of songs) {
    for (const section of song.sections) {
      if (!haystack(song, section).includes(needle)) continue;
      hits.push({
        songId: song.id,
        sectionId: section.id,
        title: song.title || "Untitled song",
        author: song.author,
        label: section.label,
        snippet: snippetFor(song, section, needle),
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
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
