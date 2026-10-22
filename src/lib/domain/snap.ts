// Snapping while laying out a page: a dragged element's edges and centre catch on the page's edges
// and centre and on other elements', within a small distance, and the lines they caught on are shown.
// Everything is in % of the page, like the elements themselves, so it works on any screen shape.

import type { LayerBounds } from "./types";
import type { LayerDragHandle } from "./composition";

export type Guide = { axis: "x" | "y"; at: number };

/** How close (in % of the page) an edge must come to catch. */
export const SNAP_DISTANCE = 0.8;

type Axis = { start: number; size: number };

/** The lines on one axis something can catch on: the page's edges and centre, and each other element's. */
function targets(others: LayerBounds[], axis: "x" | "y"): number[] {
  const lines = [0, 50, 100];
  for (const box of others) {
    const start = axis === "x" ? box.x : box.y;
    const size = axis === "x" ? box.w : box.h;
    lines.push(start, start + size / 2, start + size);
  }
  return lines;
}

/** The nearest catch for any of the given edges: how far to shift, and the line caught. */
function nearest(edges: number[], lines: number[], distance: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const edge of edges) {
    for (const line of lines) {
      const shift = line - edge;
      if (Math.abs(shift) <= distance && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: line };
    }
  }
  return best;
}

function snapAxis(span: Axis, lines: number[], moving: "both" | "start" | "end", distance: number): { span: Axis; at: number | null } {
  const { start, size } = span;
  if (moving === "both") {
    // Moving: its start, middle or end may catch; the whole box shifts.
    const caught = nearest([start, start + size / 2, start + size], lines, distance);
    return caught ? { span: { start: start + caught.shift, size }, at: caught.at } : { span, at: null };
  }
  if (moving === "start") {
    const caught = nearest([start], lines, distance);
    return caught ? { span: { start: start + caught.shift, size: size - caught.shift }, at: caught.at } : { span, at: null };
  }
  const caught = nearest([start + size], lines, distance);
  return caught ? { span: { start, size: size + caught.shift }, at: caught.at } : { span, at: null };
}

/**
 * Where a dragged or resized box settles, and the guides it caught on. `handle` says which edges are
 * moving ("move" moves all of them).
 */
export function snapBounds(bounds: LayerBounds, others: LayerBounds[], handle: LayerDragHandle, distance = SNAP_DISTANCE): { bounds: LayerBounds; guides: Guide[] } {
  const xMoving = handle === "move" ? "both" : handle.includes("w") ? "start" : handle.includes("e") ? "end" : null;
  const yMoving = handle === "move" ? "both" : handle.includes("n") ? "start" : handle.includes("s") ? "end" : null;
  const guides: Guide[] = [];
  let { x, y, w, h } = bounds;
  if (xMoving) {
    const snapped = snapAxis({ start: x, size: w }, targets(others, "x"), xMoving, distance);
    ({ start: x, size: w } = snapped.span);
    if (snapped.at !== null) guides.push({ axis: "x", at: snapped.at });
  }
  if (yMoving) {
    const snapped = snapAxis({ start: y, size: h }, targets(others, "y"), yMoving, distance);
    ({ start: y, size: h } = snapped.span);
    if (snapped.at !== null) guides.push({ axis: "y", at: snapped.at });
  }
  return { bounds: { x, y, w: Math.max(1, w), h: Math.max(1, h) }, guides };
}

/** Line an element up with the page: its left, centre or right edge (or top, middle, bottom). */
export function alignToPage(bounds: LayerBounds, where: "left" | "center" | "right" | "top" | "middle" | "bottom"): LayerBounds {
  switch (where) {
    case "left":
      return { ...bounds, x: 0 };
    case "center":
      return { ...bounds, x: (100 - bounds.w) / 2 };
    case "right":
      return { ...bounds, x: 100 - bounds.w };
    case "top":
      return { ...bounds, y: 0 };
    case "middle":
      return { ...bounds, y: (100 - bounds.h) / 2 };
    case "bottom":
      return { ...bounds, y: 100 - bounds.h };
  }
}
