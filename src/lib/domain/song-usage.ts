// CCLI copy reporting: each song shown to the congregation is noted once per day, and the
// report lists every song with its CCLI number and how many services it was used in.

import type { Song } from "./types";

export type SongUse = { songId: string; title: string; author: string; ccli: string; date: string };

const MAX_USES = 5000;

function day(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Note a song going live. The same song on the same day counts once (one service). */
export function noteSongUse(uses: SongUse[], song: Song, now = new Date()): SongUse[] {
  const date = day(now);
  if (uses.some((use) => use.songId === song.id && use.date === date)) return uses;
  const use: SongUse = { songId: song.id, title: song.title || "Untitled song", author: song.author, ccli: song.ccli ?? "", date };
  return [use, ...uses].slice(0, MAX_USES);
}

export type UsageRow = { songId: string; title: string; author: string; ccli: string; times: number; last: string };

/** One row per song used between two dates (inclusive, YYYY-MM-DD), most used first. */
export function usageReport(uses: SongUse[], from: string, to: string): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const use of uses) {
    if (use.date < from || use.date > to) continue;
    const row = rows.get(use.songId);
    if (row) {
      row.times += 1;
      if (use.date > row.last) row.last = use.date;
    } else {
      rows.set(use.songId, { songId: use.songId, title: use.title, author: use.author, ccli: use.ccli, times: 1, last: use.date });
    }
  }
  return [...rows.values()].sort((a, b) => b.times - a.times || a.title.localeCompare(b.title));
}

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A spreadsheet-ready report for entering into CCLI's reporting site. */
export function usageCsv(rows: UsageRow[], license: string): string {
  const head = ["CCLI Song Number", "Title", "Author", "Times Used", "Last Used", "Church CCLI License"];
  return [head, ...rows.map((row) => [row.ccli, row.title, row.author, row.times, row.last, license])].map((line) => line.map(cell).join(",")).join("\n") + "\n";
}

export function sanitizeSongUses(value: unknown): SongUse[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is SongUse => !!entry && typeof entry === "object" && typeof entry.songId === "string" && typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    .slice(0, MAX_USES)
    .map((entry) => ({ songId: entry.songId, title: String(entry.title ?? ""), author: String(entry.author ?? ""), ccli: String(entry.ccli ?? "").replace(/\D/g, ""), date: entry.date }));
}
