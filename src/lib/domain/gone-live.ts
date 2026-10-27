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
  /** The first words on screen, to recognise a passage at a glance. */
  snippet?: string;
  /** Verses stepped through from this passage (same chapter), first to last. */
  reach?: { startVerse: number; endVerse: number };
};

const LIMIT = 300;

/** One entry per passage in one translation. */
export function goneLiveKey(passage: Pick<BibleItem, "translationId" | "bookOrd" | "chapter" | "startVerse" | "endVerse">): string {
  return `${passage.translationId}|${passageKey(passage)}`;
}

/** The verses an entry covers, its own and any stepped through. */
export function goneLiveSpan(entry: GoneLive): { startVerse: number; endVerse: number } {
  return {
    startVerse: Math.min(entry.passage.startVerse, entry.reach?.startVerse ?? entry.passage.startVerse),
    endVerse: Math.max(entry.passage.endVerse, entry.reach?.endVerse ?? entry.passage.endVerse),
  };
}

/** Next or previous verse(s) in the same chapter and translation: a step, not a new passage. */
function isStep(from: BibleItem, to: BibleItem): boolean {
  return (
    from.translationId === to.translationId &&
    from.bookOrd === to.bookOrd &&
    from.chapter === to.chapter &&
    (to.startVerse === from.endVerse + 1 || to.endVerse === from.startVerse - 1)
  );
}

/**
 * Note that a passage went live. A passage already in the list keeps its place (and comes back if
 * it was removed); a new one goes at the end. Stepping on from the passage that was on screen
 * (`previous`) widens that entry instead of adding one per verse. The oldest unpinned entries
 * drop past the limit.
 */
export function recordGoneLive(
  list: GoneLive[],
  passage: BibleItem,
  now: number,
  options: { previous?: BibleItem | null; snippet?: string } = {},
): GoneLive[] {
  const at = new Date(now).toISOString();
  const key = goneLiveKey(passage);
  const snippet = options.snippet?.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
  const index = list.findIndex((entry) => goneLiveKey(entry.passage) === key);
  if (index >= 0) {
    const entry = list[index]!;
    const next = [...list];
    next[index] = { ...entry, passage: { ...passage }, lastAt: at, times: entry.times + 1, removed: false, ...(snippet ? { snippet } : {}) };
    return next;
  }
  const previous = options.previous;
  if (previous && isStep(previous, passage)) {
    // The entry the operator was stepping through: the latest whose verses hold the previous step.
    // (A plain loop from the end: the license server builds this file too, for ES2022.)
    let owner = -1;
    for (let at = list.length - 1; at >= 0 && owner < 0; at -= 1) {
      const entry = list[at]!;
      const span = goneLiveSpan(entry);
      const holds =
        goneLiveKey({ ...entry.passage, startVerse: 1, endVerse: 1 }) === goneLiveKey({ ...previous, startVerse: 1, endVerse: 1 }) &&
        previous.startVerse >= span.startVerse &&
        previous.endVerse <= span.endVerse;
      if (holds) owner = at;
    }
    if (owner >= 0) {
      const entry = list[owner]!;
      const span = goneLiveSpan(entry);
      const next = [...list];
      next[owner] = {
        ...entry,
        lastAt: at,
        removed: false,
        reach: { startVerse: Math.min(span.startVerse, passage.startVerse), endVerse: Math.max(span.endVerse, passage.endVerse) },
      };
      return next;
    }
  }
  const next = [...list, { passage: { ...passage }, firstAt: at, lastAt: at, times: 1, pinned: false, removed: false, ...(snippet ? { snippet } : {}) }];
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
      const reach = record.reach;
      const verses = reach && Number.isInteger(reach.startVerse) && Number.isInteger(reach.endVerse) && reach.startVerse > 0 && reach.endVerse >= reach.startVerse ? { startVerse: reach.startVerse, endVerse: reach.endVerse } : null;
      return [{
        ...(typeof record.snippet === "string" && record.snippet ? { snippet: record.snippet.slice(0, 160) } : {}),
        ...(verses ? { reach: verses } : {}),
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

/** Day groups for the list ("Today", "Yesterday", or the date), newest day first. */
export function goneLiveDays(entries: GoneLive[], now = Date.now()): Array<{ label: string; day: string; entries: GoneLive[] }> {
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString();
  const groups = new Map<string, GoneLive[]>();
  for (const entry of entries) {
    const day = dayOf(entry.firstAt);
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort((a, b) => Date.parse(b[0]) - Date.parse(a[0]))
    .map(([day, items]) => ({
      day,
      label: day === today ? "Today" : day === yesterday ? "Yesterday" : new Date(day).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }),
      entries: items,
    }));
}

/** True when something went live today (the list then starts on Today). */
export function hasGoneLiveToday(list: GoneLive[], now = Date.now()): boolean {
  const today = new Date(now).toDateString();
  return list.some((entry) => !entry.removed && new Date(entry.lastAt).toDateString() === today);
}

/** One verse of an entry's span, as a passage of its own ("John 3:18"). */
export function goneLiveVerse(entry: GoneLive, verse: number): BibleItem {
  const book = entry.passage.reference.replace(/\s+\d+(?::[\d\s–-]+)?$/, "").trim() || entry.passage.reference;
  return { ...entry.passage, startVerse: verse, endVerse: verse, reference: `${book} ${entry.passage.chapter}:${verse}` };
}
