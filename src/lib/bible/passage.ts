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
