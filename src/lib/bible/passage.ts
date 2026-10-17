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
