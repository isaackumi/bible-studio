import type { Cursor, PresentationItem, Service, ServiceSection } from "./types";

export function flatten(service: Service): Array<{ sectionId: string; item: PresentationItem }> {
  return service.sections.flatMap((section) => section.items.map((item) => ({ sectionId: section.id, item })));
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
