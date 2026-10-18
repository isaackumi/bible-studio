import type { Cursor, PresentationItem, Service, ServiceSection } from "./types";

export function flatten(service: Service): Array<{ sectionId: string; item: PresentationItem }> {
  return service.sections.flatMap((section) => section.items.map((item) => ({ sectionId: section.id, item })));
}

export function sectionIdForInsert(service: Service, cursor: Cursor): string | null {
  if (cursor.sectionId && service.sections.some((section) => section.id === cursor.sectionId)) return cursor.sectionId;
  return service.sections[0]?.id ?? null;
}

export function findItem(service: Service, itemId: string): { section: ServiceSection; item: PresentationItem } | null {
  for (const section of service.sections) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (item) return { section, item };
  }
  return null;
}

export function stepCursor(service: Service, cursor: Cursor, direction: 1 | -1): Cursor {
  const items = flatten(service);
  if (items.length === 0) return { sectionId: null, itemId: null };
  const index = items.findIndex((entry) => entry.item.id === cursor.itemId);
  const next = index === -1 ? (direction > 0 ? 0 : items.length - 1) : index + direction;
  if (next < 0 || next >= items.length) return cursor;
  const entry = items[next];
  if (!entry) return cursor;
  return { sectionId: entry.sectionId, itemId: entry.item.id };
}

export function moveInList<T>(list: T[], index: number, direction: 1 | -1): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  if (item === undefined) return list;
  copy.splice(target, 0, item);
  return copy;
}

/** Move one entry to a new position (drag and drop). Out-of-range positions are clamped. */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(target, 0, entry!);
  return next;
}

/**
 * Move an item to `index` in a section (its own or another), as when it is dragged there.
 * `index` counts the target section's items before the move.
 */
export function moveItemTo(service: Service, itemId: string, sectionId: string, index: number): Service {
  const from = service.sections.find((section) => section.items.some((item) => item.id === itemId));
  const target = service.sections.find((section) => section.id === sectionId);
  if (!from || !target) return service;
  const item = from.items.find((entry) => entry.id === itemId)!;
  const fromIndex = from.items.indexOf(item);
  // Dropping below itself in the same section: the gap it leaves shifts the place up by one.
  const place = from.id === target.id && fromIndex < index ? index - 1 : index;
  return {
    ...service,
    sections: service.sections.map((section) => {
      const without = section.items.filter((entry) => entry.id !== itemId);
      if (section.id !== target.id) return section.id === from.id ? { ...section, items: without } : section;
      const at = Math.max(0, Math.min(without.length, place));
      return { ...section, items: [...without.slice(0, at), item, ...without.slice(at)] };
    }),
  };
}
