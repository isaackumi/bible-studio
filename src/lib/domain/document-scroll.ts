import type { SlideDeck } from "./decks";

// A PDF shown as one long page that scrolls, as a website does: the pages stacked top to bottom,
// each as wide as the screen. Positions are in screen heights from the top ("1.5" is a screen and
// a half down), so a step means the same on every screen shape.

/** How far one step (Next, a clicker, the phone) moves: a little over half the screen. */
export const SCROLL_STEP = 0.6;

/** The pictures of a deck made only of page pictures (a PDF), in order; null for any other deck. */
export function documentAssets(deck: SlideDeck): string[] | null {
  const assets: string[] = [];
  for (const page of deck.pages) {
    const pictures = page.layers.filter((layer) => layer.source.type === "image" && layer.source.payload.assetId);
    if (pictures.length !== 1 || page.layers.length !== 1) return null;
    assets.push(pictures[0]!.source.payload.assetId!);
  }
  return assets.length ? assets : null;
}

/** Each page's height in screen heights, from its shape (height / width) and the screen's (width / height). */
const heights = (aspects: readonly number[], screen: number) => aspects.map((aspect) => Math.max(0.05, aspect) * Math.max(0.1, screen));

/** How far the document can scroll: its whole height less one screen (0 when it fits). */
export function scrollLength(aspects: readonly number[], screen: number): number {
  return Math.max(0, heights(aspects, screen).reduce((sum, height) => sum + height, 0) - 1);
}

/** Where a page starts. */
export function pageStart(index: number, aspects: readonly number[], screen: number): number {
  return Math.min(scrollLength(aspects, screen), heights(aspects, screen).slice(0, Math.max(0, index)).reduce((sum, height) => sum + height, 0));
}

/** The page at the middle of the screen, from 0. */
export function pageAt(at: number, aspects: readonly number[], screen: number): number {
  const middle = at + 0.5;
  let top = 0;
  const all = heights(aspects, screen);
  for (let index = 0; index < all.length; index++) {
    top += all[index]!;
    if (middle < top) return index;
  }
  return Math.max(0, all.length - 1);
}

/** One step on or back; null past either end, so the running order moves to the next item. */
export function stepScroll(at: number, direction: 1 | -1, length: number, step = SCROLL_STEP): number | null {
  const atEnd = direction === 1 ? at >= length - 0.001 : at <= 0.001;
  if (atEnd) return null;
  return Math.min(length, Math.max(0, at + direction * step));
}
