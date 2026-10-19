// The service as a flow on a canvas: each part is a card, joined to the next by a connector, like a
// workflow editor. Cards can sit anywhere (their places are kept); the order is still the running
// order, and rewiring a connector moves a part to come after another.

import type { ServiceSection } from "./types";

export type Point = { x: number; y: number };
export type View = { x: number; y: number; zoom: number };
export type Box = { x: number; y: number; w: number; h: number };

export const NODE_W = 272;
/** Ports sit level with the card's title, so connectors do not depend on the card's height. */
export const PORT_Y = 30;
/** The Start and End pills either side of the flow. */
export const PILL_W = 132;
export const PILL_H = 60;
export const ITEMS_SHOWN = 6;
const GAP_X = 96;
const GAP_Y = 84;
const PER_ROW = 4;
const PER_ROW_RANGE = [2, 3, 4, 5, 6];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

/** About how tall a card is with this many items (for laying out rows before cards are measured). */
export function cardHeight(items: number): number {
  const rows = Math.min(items, ITEMS_SHOWN) + (items > ITEMS_SHOWN ? 1 : 0);
  return 112 + Math.max(1, rows) * 34;
}

/** Tidy places: rows (of four unless told), left to right, after a Start pill. */
export function autoLayout(sections: Pick<ServiceSection, "id" | "items">[], perRow = PER_ROW): Map<string, Point> {
  const places = new Map<string, Point>();
  const left = PILL_W + GAP_X;
  let y = 0;
  for (let row = 0; row * perRow < sections.length; row += 1) {
    const cards = sections.slice(row * perRow, row * perRow + perRow);
    cards.forEach((section, index) => places.set(section.id, { x: left + index * (NODE_W + GAP_X), y }));
    y += Math.max(...cards.map((section) => cardHeight(section.items.length))) + GAP_Y;
  }
  return places;
}

/**
 * How many cards per row read best in a viewport: the count whose tidy layout fits at the largest
 * zoom (so a narrow canvas stacks more rows, a wide one runs longer rows).
 */
export function bestPerRow(sections: Pick<ServiceSection, "id" | "items">[], viewport: { w: number; h: number }): number {
  if (viewport.w <= 0 || viewport.h <= 0 || sections.length === 0) return PER_ROW;
  let best = { perRow: PER_ROW, zoom: -1 };
  for (const perRow of PER_ROW_RANGE) {
    const places = autoLayout(sections, perRow);
    const ends = pills(sections, places);
    const boxes = [
      { ...ends.start, w: PILL_W, h: PILL_H },
      { ...ends.end, w: PILL_W, h: PILL_H },
      ...sections.map((section) => ({ ...places.get(section.id)!, w: NODE_W, h: cardHeight(section.items.length) })),
    ];
    const zoom = fitView(boxes, viewport).zoom;
    if (zoom > best.zoom + 0.001) best = { perRow, zoom };
  }
  return best.perRow;
}

/** Each card's place: where it was put, or its tidy place. */
export function placesFor(sections: Pick<ServiceSection, "id" | "items" | "canvas">[], perRow = PER_ROW): Map<string, Point> {
  const tidy = autoLayout(sections, perRow);
  return new Map(sections.map((section) => [section.id, clean(section.canvas) ?? tidy.get(section.id)!]));
}

function clean(point: Point | undefined): Point | null {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

/** Where Start and End sit: left of the first card, right of the last. */
export function pills(sections: Pick<ServiceSection, "id">[], places: Map<string, Point>): { start: Point; end: Point } {
  const first = sections[0] ? places.get(sections[0].id) : null;
  const last = sections.at(-1) ? places.get(sections.at(-1)!.id) : null;
  const start = first ? { x: first.x - GAP_X - PILL_W, y: first.y + PORT_Y - PILL_H / 2 } : { x: 0, y: 0 };
  const end = last ? { x: last.x + NODE_W + GAP_X, y: last.y + PORT_Y - PILL_H / 2 } : { x: PILL_W + GAP_X, y: 0 };
  return { start, end };
}

/** A connector from an out port to an in port: a smooth S curve, like a workflow editor's. */
export function connector(from: Point, to: Point): string {
  const reach = Math.max(56, Math.abs(to.x - from.x) / 2, to.x < from.x ? 160 : 0);
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`;
}

/** The middle of a connector (for its + button). */
export function midpoint(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/**
 * Wiring `source` to `target` makes target come right after source. The index to move target to
 * in the running order (moveTo semantics), or null when nothing changes.
 */
export function wireTo(order: string[], sourceId: string, targetId: string): number | null {
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to || to === from + 1) return null;
  return to < from ? from : from + 1;
}

/** The view that shows every box, with a margin, inside a viewport. */
export function fitView(boxes: Box[], viewport: { w: number; h: number }, margin = 32): View {
  if (boxes.length === 0 || viewport.w <= 0 || viewport.h <= 0) return { x: margin, y: margin, zoom: 1 };
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  const zoom = clampZoom(Math.min((viewport.w - margin * 2) / Math.max(1, maxX - minX), (viewport.h - margin * 2) / Math.max(1, maxY - minY), 1));
  return {
    zoom,
    x: (viewport.w - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (viewport.h - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zoom by a factor keeping the point under the cursor (viewport coordinates) still. */
export function zoomAt(view: View, factor: number, at: Point): View {
  const zoom = clampZoom(view.zoom * factor);
  const scale = zoom / view.zoom;
  return { zoom, x: at.x - (at.x - view.x) * scale, y: at.y - (at.y - view.y) * scale };
}

/** A viewport point in canvas coordinates. */
export function toCanvas(view: View, at: Point): Point {
  return { x: (at.x - view.x) / view.zoom, y: (at.y - view.y) / view.zoom };
}

/** Snap a place to the dot grid. */
export function snap(point: Point, grid = 24): Point {
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
}
