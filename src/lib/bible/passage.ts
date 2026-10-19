import type { BibleItem } from "../domain/types";
import { formatReference } from "./reference";

/** The next or previous single verse inside the same chapter. Null at either end. */
export function stepVerse(
  passage: BibleItem,
  direction: 1 | -1,
  book: { name: string; chapters: number },
  verseCount: number,
): BibleItem | null {
  if (verseCount < 1) return null;
  const target = direction > 0 ? passage.endVerse + 1 : passage.startVerse - 1;
  if (target < 1 || target > verseCount) return null;
  return {
    ...passage,
    startVerse: target,
    endVerse: target,
    reference: formatReference(book.name, passage.chapter, target, target, book.chapters),
  };
}

/**
 * The next or previous passage of the same length inside the chapter (John 3:16-17 → 3:18-19).
 * At the end it shortens to fit; null when there is nothing further that way.
 */
export function shiftPassage(
  passage: BibleItem,
  direction: 1 | -1,
  book: { name: string; chapters: number },
  verseCount: number,
): BibleItem | null {
  const length = passage.endVerse - passage.startVerse + 1;
  const from = direction > 0 ? passage.endVerse + 1 : Math.max(1, passage.startVerse - length);
  const to = direction > 0 ? Math.min(verseCount, passage.endVerse + length) : passage.startVerse - 1;
  if (from > verseCount || to < 1) return null;
  return {
    ...passage,
    startVerse: from,
    endVerse: to,
    reference: formatReference(book.name, passage.chapter, from, to, book.chapters),
  };
}

/**
 * A passage shown a few verses at a time: the screenful starting at `start` (perScreen verses,
 * never past the passage's end). With no perScreen the whole passage is one screenful.
 */
export function screenful(passage: Pick<BibleItem, "startVerse" | "endVerse">, start: number, perScreen: number | null | undefined): { start: number; end: number } {
  const size = perScreen && perScreen > 0 ? Math.floor(perScreen) : passage.endVerse - passage.startVerse + 1;
  const from = Math.min(Math.max(start, passage.startVerse), passage.endVerse);
  return { start: from, end: Math.min(passage.endVerse, from + size - 1) };
}

/** The next (or previous) screenful's first verse, or null past either end of the passage. */
export function stepScreenful(passage: Pick<BibleItem, "startVerse" | "endVerse">, start: number, perScreen: number | null | undefined, direction: 1 | -1): number | null {
  const current = screenful(passage, start, perScreen);
  const size = current.end - current.start + 1;
  const next = direction > 0 ? current.end + 1 : current.start - size;
  if (direction > 0 && next > passage.endVerse) return null;
  if (direction < 0 && current.start <= passage.startVerse) return null;
  return Math.max(passage.startVerse, next);
}
