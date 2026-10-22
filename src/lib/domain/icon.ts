// An icon on a page: its drawing is kept in the page itself (a few SVG shapes from the Lucide set,
// drawn on a 24×24 grid), so the screen needs no icon library to paint it and a page shared with
// another church shows the same icon. Only plain shapes and their geometry are kept: nothing in a
// stored page can carry a script or a link.

export type IconNode = [tag: IconTag, attrs: Record<string, string>];
type IconTag = "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse";

const TAGS: ReadonlySet<string> = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
const ATTRS: ReadonlySet<string> = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points"]);
/** Path data and numbers only: letters for path commands, digits, signs, dots, commas, spaces. */
const GEOMETRY = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,4000}$/;
/** An icon is a handful of shapes; a long list is not an icon. */
const MOST_NODES = 40;

export function sanitizeIconNodes(value: unknown): IconNode[] {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(input)) return [];
  const nodes: IconNode[] = [];
  for (const item of input.slice(0, MOST_NODES)) {
    if (!Array.isArray(item) || !TAGS.has(String(item[0])) || !item[1] || typeof item[1] !== "object") continue;
    const attrs: Record<string, string> = {};
    for (const [name, raw] of Object.entries(item[1] as Record<string, unknown>)) {
      const text = String(raw);
      if (ATTRS.has(name) && GEOMETRY.test(text)) attrs[name] = text;
    }
    if (Object.keys(attrs).length) nodes.push([item[0] as IconTag, attrs]);
  }
  return nodes;
}

export const encodeIconNodes = (nodes: IconNode[]): string => JSON.stringify(nodes);
