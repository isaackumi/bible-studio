// What a service item carries beside its content: who brings it, how long it takes, and the desk's
// notes. None of it is ever on the screen.

import type { PresentationItem } from "./types";

export type ItemDetails = { owner?: string; minutes?: number | null; notes?: string };

/** The item with these details set (blank ones taken off); untouched fields stay as they were. */
export function withItemDetails(item: PresentationItem, details: ItemDetails): PresentationItem {
  const next: PresentationItem = { ...item };
  if (details.owner !== undefined) {
    const owner = details.owner.trim().slice(0, 80);
    if (owner) next.owner = owner;
    else delete next.owner;
  }
  if (details.minutes !== undefined) {
    const minutes = details.minutes === null || !Number.isFinite(details.minutes) ? 0 : Math.round(Math.min(240, Math.max(0, details.minutes)));
    if (minutes) next.minutes = minutes;
    else delete next.minutes;
  }
  if (details.notes !== undefined) {
    const notes = details.notes.trim().slice(0, 2000);
    if (notes) next.notes = notes;
    else delete next.notes;
  }
  return next;
}

/** The minutes a part's items add up to (0 when none says). */
export const itemMinutes = (items: PresentationItem[]) => items.reduce((total, item) => total + (item.minutes ?? 0), 0);
