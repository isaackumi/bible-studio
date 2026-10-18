// Scriptures that have gone live: every passage that reached Program is kept, in the order it
// first went up, so the operator can send it back when the pastor returns to it. One click sends a
// passage straight to Program. Pinned passages stay at the top; removed ones can be brought back.

import { passageKey, sanitizePassage } from "./favorites";
import type { BibleItem } from "./types";

export type GoneLive = {
  passage: BibleItem;
  /** When it first went live (ISO); the list keeps this order. */
  firstAt: string;
  /** The last time it went live (ISO). */
  lastAt: string;
  /** How many times it has gone live. */
  times: number;
  pinned: boolean;
  removed: boolean;
};

const LIMIT = 300;

/** One entry per passage in one translation. */
export function goneLiveKey(passage: Pick<BibleItem, "translationId" | "bookOrd" | "chapter" | "startVerse" | "endVerse">): string {
  return `${passage.translationId}|${passageKey(passage)}`;
}

/**
 * Note that a passage went live. A passage already in the list keeps its place (and comes back if
 * it was removed); a new one goes at the end. The oldest unpinned entries drop past the limit.
 */
export function recordGoneLive(list: GoneLive[], passage: BibleItem, now: number): GoneLive[] {
  const at = new Date(now).toISOString();
  const key = goneLiveKey(passage);
  const index = list.findIndex((entry) => goneLiveKey(entry.passage) === key);
  if (index >= 0) {
    const entry = list[index]!;
    const next = [...list];
    next[index] = { ...entry, passage: { ...passage }, lastAt: at, times: entry.times + 1, removed: false };
    return next;
  }
  const next = [...list, { passage: { ...passage }, firstAt: at, lastAt: at, times: 1, pinned: false, removed: false }];
  let excess = next.length - LIMIT;
  return excess > 0 ? next.filter((entry) => entry.pinned || excess-- <= 0) : next;
}

function update(list: GoneLive[], key: string, change: Partial<Pick<GoneLive, "pinned" | "removed">>): GoneLive[] {
  return list.map((entry) => (goneLiveKey(entry.passage) === key ? { ...entry, ...change } : entry));
}

export function pinGoneLive(list: GoneLive[], key: string, pinned: boolean): GoneLive[] {
  return update(list, key, pinned ? { pinned, removed: false } : { pinned });
}

/** Remove from the list (it can be brought back); a removed passage is no longer pinned. */
export function removeGoneLive(list: GoneLive[], key: string, removed: boolean): GoneLive[] {
  return update(list, key, removed ? { removed, pinned: false } : { removed });
}

/** Clear the list, keeping pinned passages. */
export function clearGoneLive(list: GoneLive[]): GoneLive[] {
  return list.filter((entry) => entry.pinned);
}

function simple(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9:]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * What the list shows: pinned first, then the rest in the order they went live, filtered by a
 * search ("john", "jn 3", "3:16") without changing that order. Removed entries are listed apart.
 */
export function goneLiveView(list: GoneLive[], query = ""): { pinned: GoneLive[]; rest: GoneLive[]; removed: GoneLive[] } {
  const words = simple(query).split(" ").filter(Boolean);
  const matches = (entry: GoneLive) => {
    if (!words.length) return true;
    const reference = simple(entry.passage.reference);
    const tokens = reference.split(" ");
    // Each word starts a word of the reference: "jo 3" finds John 3:16, "3:1" finds 3:16.
    return words.every((word) => tokens.some((token) => token.startsWith(word)) || reference.includes(word));
  };
  const shown = list.filter(matches);
  return {
    pinned: shown.filter((entry) => entry.pinned && !entry.removed),
    rest: shown.filter((entry) => !entry.pinned && !entry.removed),
    removed: shown.filter((entry) => entry.removed),
  };
}

export function sanitizeGoneLive(value: unknown): GoneLive[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const time = (input: unknown) => (typeof input === "string" && Number.isFinite(Date.parse(input)) ? input : new Date(0).toISOString());
  return value
    .flatMap((raw): GoneLive[] => {
      const record = raw && typeof raw === "object" ? (raw as Partial<GoneLive>) : null;
      const passage = record ? sanitizePassage(record.passage) : null;
      if (!record || !passage) return [];
      const key = goneLiveKey(passage);
      if (seen.has(key)) return [];
      seen.add(key);
      const firstAt = time(record.firstAt);
      return [{
        passage,
        firstAt,
        lastAt: typeof record.lastAt === "string" ? time(record.lastAt) : firstAt,
        times: Number.isInteger(record.times) && record.times! > 0 ? record.times! : 1,
        pinned: record.pinned === true,
        removed: record.removed === true,
      }];
    })
    .slice(-LIMIT);
}
