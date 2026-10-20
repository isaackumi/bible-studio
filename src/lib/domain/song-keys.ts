// Song-part hot keys, for when the worship leader goes off the plan: 1–9 jump to that numbered
// part (as the song desk numbers them), and Shift with a letter jumps to the next part of a kind:
// V verse, C chorus, B bridge, P pre-chorus, T tag, I intro, E ending. Pressing the same letter
// again moves on (Verse 1, then Verse 2), coming round to the first after the last.

import type { SongSection } from "./types";

const KIND_KEYS: Record<string, (section: SongSection) => boolean> = {
  KeyV: (section) => section.kind === "verse" && !/pre|intro|ending|outro/i.test(section.label),
  KeyC: (section) => section.kind === "chorus" && !/pre/i.test(section.label),
  KeyB: (section) => section.kind === "bridge",
  KeyP: (section) => /pre[\s-]?chorus|^pre\b/i.test(section.label),
  KeyT: (section) => section.kind === "tag" || /\btag\b/i.test(section.label),
  KeyI: (section) => /intro/i.test(section.label),
  KeyE: (section) => /ending|outro|end\b/i.test(section.label),
};

/** Keys that name a song part (with Shift for letters). */
export const SONG_PART_LETTERS = Object.keys(KIND_KEYS);

/**
 * The part a key asks for, or null. `digit` is 1–9; `code` a KeyboardEvent code ("KeyC").
 * `current` is the part on Preview, so a repeated letter moves to the next such part.
 */
export function partForKey(sections: SongSection[], key: { digit?: number; code?: string }, current: string | null = null): SongSection | null {
  if (key.digit !== undefined) return sections[key.digit - 1] ?? null;
  const matches = key.code ? KIND_KEYS[key.code] : undefined;
  if (!matches) return null;
  const candidates = sections.filter(matches);
  if (!candidates.length) return null;
  const at = candidates.findIndex((section) => section.id === current);
  return candidates[(at + 1) % candidates.length] ?? null;
}
