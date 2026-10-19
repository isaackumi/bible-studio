// Formatted text: paragraphs, titles, bullets and numbered lines made of runs of words, each run with
// its own bold, italic, underline, strike, colour, highlight, font and size. It is plain data (never
// HTML), so it travels to the audience screen as JSON and is drawn there without running any markup.

import { SCREEN_FONTS } from "./fonts";

export type RichMark = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour, "#rrggbb". */
  color?: string;
  /** Highlight behind the words, "#rrggbb". */
  highlight?: string;
  /** A font family (CSS), one of RICH_FONTS. */
  font?: string;
  /** Size relative to the screen's text size (1 = as the theme). */
  size?: number;
};

export type RichRun = RichMark & { text: string };
export type RichBlockType = "p" | "title" | "subtitle" | "quote" | "bullet" | "number";
export type RichBlock = { type: RichBlockType; align?: "left" | "center" | "right"; runs: RichRun[] };
export type RichDoc = { blocks: RichBlock[] };

/** Faces the app loads, then faces every computer has. */
export const RICH_FONTS: Array<{ name: string; family: string }> = [
  ...SCREEN_FONTS.map((font) => ({ name: font.name, family: font.family })),
  { name: "Georgia", family: "Georgia, serif" },
  { name: "Times", family: '"Times New Roman", Times, serif' },
  { name: "Arial", family: "Arial, Helvetica, sans-serif" },
  { name: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { name: "Trebuchet", family: '"Trebuchet MS", sans-serif' },
  { name: "Courier", family: '"Courier New", Courier, monospace' },
];

/** Sizes offered in the editor: name and scale. The editor's font size 1–7 maps onto these. */
export const RICH_SIZES: Array<{ name: string; scale: number; step: number }> = [
  { name: "Tiny", scale: 0.55, step: 1 },
  { name: "Small", scale: 0.75, step: 2 },
  { name: "Normal", scale: 1, step: 3 },
  { name: "Large", scale: 1.3, step: 4 },
  { name: "Larger", scale: 1.7, step: 5 },
  { name: "Huge", scale: 2.2, step: 6 },
  { name: "Giant", scale: 3, step: 7 },
];

/** Block types as sizes and looks on the screen. */
export const BLOCK_SCALE: Record<RichBlockType, number> = { p: 1, title: 1.6, subtitle: 1.25, quote: 1, bullet: 1, number: 1 };

const HEX = /^#[0-9a-f]{6}$/i;
const TYPES = new Set<RichBlockType>(["p", "title", "subtitle", "quote", "bullet", "number"]);
const FAMILIES = new Set(RICH_FONTS.map((font) => font.family));

function cleanRun(value: unknown): RichRun | null {
  const run = value && typeof value === "object" ? (value as Partial<RichRun>) : null;
  if (!run || typeof run.text !== "string" || run.text.length === 0) return null;
  const clean: RichRun = { text: run.text.slice(0, 4000) };
  if (run.bold === true) clean.bold = true;
  if (run.italic === true) clean.italic = true;
  if (run.underline === true) clean.underline = true;
  if (run.strike === true) clean.strike = true;
  if (typeof run.color === "string" && HEX.test(run.color)) clean.color = run.color.toLowerCase();
  if (typeof run.highlight === "string" && HEX.test(run.highlight)) clean.highlight = run.highlight.toLowerCase();
  if (typeof run.font === "string" && FAMILIES.has(run.font)) clean.font = run.font;
  if (typeof run.size === "number" && Number.isFinite(run.size) && run.size !== 1) clean.size = Math.min(4, Math.max(0.3, Math.round(run.size * 100) / 100));
  return clean;
}

/** A clean document: known block types, valid colours and fonts, at most 200 blocks. */
export function sanitizeRich(value: unknown): RichDoc | null {
  const doc = value && typeof value === "object" ? (value as Partial<RichDoc>) : null;
  if (!doc || !Array.isArray(doc.blocks)) return null;
  const blocks: RichBlock[] = [];
  for (const entry of doc.blocks.slice(0, 200)) {
    const block = entry && typeof entry === "object" ? (entry as Partial<RichBlock>) : null;
    if (!block) continue;
    const type = TYPES.has(block.type as RichBlockType) ? (block.type as RichBlockType) : "p";
    const runs = Array.isArray(block.runs) ? mergeRuns(block.runs.map(cleanRun).filter((run): run is RichRun => run !== null)) : [];
    const align = block.align === "left" || block.align === "center" || block.align === "right" ? block.align : undefined;
    blocks.push({ type, ...(align ? { align } : {}), runs });
  }
  return { blocks };
}

/** Kept in a source payload as a JSON string. */
export function encodeRich(doc: RichDoc): string {
  return JSON.stringify(doc);
}

export function parseRich(raw: string | null | undefined): RichDoc | null {
  if (!raw) return null;
  try {
    return sanitizeRich(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sameMarks(a: RichMark, b: RichMark): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.color === b.color && a.highlight === b.highlight && a.font === b.font && a.size === b.size;
}

/** Neighbouring runs with the same marks become one. */
function mergeRuns(runs: RichRun[]): RichRun[] {
  const merged: RichRun[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && sameMarks(last, run)) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

/** The words with no formatting, one line per block (for search, captions and the simple editor). */
export function richLines(doc: RichDoc): string[] {
  let number = 0;
  return doc.blocks.map((block) => {
    number = block.type === "number" ? number + 1 : 0;
    const text = block.runs.map((run) => run.text).join("");
    return block.type === "bullet" ? `• ${text}` : block.type === "number" ? `${number}. ${text}` : text;
  });
}

/** Whether there is anything to show. */
export function richIsEmpty(doc: RichDoc | null | undefined): boolean {
  return !doc || doc.blocks.every((block) => block.runs.every((run) => run.text.trim() === ""));
}

/** The simple fields as a formatted document: the heading as a title, each body line a paragraph. */
export function richFromPlain(heading: string, body: string): RichDoc {
  const blocks: RichBlock[] = [];
  if (heading.trim()) blocks.push({ type: "title", runs: [{ text: heading.trim(), bold: true }] });
  for (const line of body.split("\n")) {
    const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const text = bullet?.[1] ?? numbered?.[1] ?? line;
    blocks.push({ type: bullet ? "bullet" : numbered ? "number" : "p", runs: text ? [{ text }] : [] });
  }
  while (blocks.length > 1 && blocks.at(-1)!.runs.length === 0) blocks.pop();
  return { blocks: blocks.length ? blocks : [{ type: "p", runs: [] }] };
}

/** Back to the simple fields: the first title is the heading, the rest is the body. */
export function plainFromRich(doc: RichDoc): { heading: string; body: string } {
  const lines = richLines(doc);
  const first = doc.blocks.findIndex((block) => block.type === "title");
  if (first < 0) return { heading: "", body: lines.join("\n") };
  return { heading: lines[first]!, body: lines.filter((_, index) => index !== first).join("\n") };
}

// The editor: a document becomes editable markup, and what the editor holds becomes a document again.

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A size scale as the editor's step 1–7 (the nearest offered size). */
export function stepOf(scale: number): number {
  let best = RICH_SIZES[2]!;
  for (const size of RICH_SIZES) if (Math.abs(size.scale - scale) < Math.abs(best.scale - scale)) best = size;
  return best.step;
}

function runHtml(run: RichRun): string {
  let html = escape(run.text).replace(/\n/g, "<br>");
  if (run.bold) html = `<b>${html}</b>`;
  if (run.italic) html = `<i>${html}</i>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.strike) html = `<s>${html}</s>`;
  const style = [run.highlight ? `background-color: ${run.highlight}` : ""].filter(Boolean).join("; ");
  const attrs = [
    run.color ? `color="${run.color}"` : "",
    run.font ? `face="${escape(run.font)}"` : "",
    run.size ? `size="${stepOf(run.size)}"` : "",
  ].filter(Boolean);
  if (attrs.length) html = `<font ${attrs.join(" ")}>${html}</font>`;
  if (style) html = `<span style="${style}">${html}</span>`;
  return html;
}

const BLOCK_TAG: Record<RichBlockType, string> = { p: "div", title: "h1", subtitle: "h2", quote: "blockquote", bullet: "li", number: "li" };

/** Editable markup for the editor (escaped, so typed words never become markup). */
export function richToHtml(doc: RichDoc): string {
  let html = "";
  let list: "ul" | "ol" | null = null;
  for (const block of doc.blocks) {
    const wants = block.type === "bullet" ? "ul" : block.type === "number" ? "ol" : null;
    if (list && list !== wants) {
      html += `</${list}>`;
      list = null;
    }
    if (wants && !list) {
      html += `<${wants}>`;
      list = wants;
    }
    const tag = BLOCK_TAG[block.type];
    const align = block.align ? ` style="text-align: ${block.align}"` : "";
    const inner = block.runs.map(runHtml).join("") || "<br>";
    html += `<${tag}${align}>${inner}</${tag}>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

/** The little of a DOM node the reader needs (a real element, or a stand-in in tests). */
export type NodeLike = {
  nodeType: number;
  nodeName: string;
  nodeValue?: string | null;
  childNodes: ArrayLike<NodeLike>;
  getAttribute?: (name: string) => string | null;
};

function styleOf(node: NodeLike): Record<string, string> {
  const raw = node.getAttribute?.("style") ?? "";
  const style: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const at = part.indexOf(":");
    if (at > 0) style[part.slice(0, at).trim().toLowerCase()] = part.slice(at + 1).trim();
  }
  return style;
}

/** "rgb(250, 79, 0)" or "#fa4f00" → "#fa4f00". */
export function hexColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (HEX.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  const rgb = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return undefined;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
}

/** A font family as written by the editor, matched to one of the offered fonts. */
function fontOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]!.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return RICH_FONTS.find((font) => font.family.split(",")[0]!.trim().replace(/^["']|["']$/g, "").toLowerCase() === first || font.family === value)?.family;
}

const CSS_SIZES: Record<string, number> = { "x-small": 0.55, small: 0.75, medium: 1, large: 1.3, "x-large": 1.7, "xx-large": 2.2, "xxx-large": 3 };

function marksOf(node: NodeLike, inherited: RichMark): RichMark {
  const name = node.nodeName.toLowerCase();
  const style = styleOf(node);
  const marks: RichMark = { ...inherited };
  if (name === "b" || name === "strong" || style["font-weight"] === "bold" || Number(style["font-weight"]) >= 600) marks.bold = true;
  if (style["font-weight"] === "normal" || style["font-weight"] === "400") delete marks.bold;
  if (name === "i" || name === "em" || style["font-style"] === "italic") marks.italic = true;
  if (style["font-style"] === "normal") delete marks.italic;
  const decoration = `${style["text-decoration"] ?? ""} ${style["text-decoration-line"] ?? ""}`;
  if (name === "u" || decoration.includes("underline")) marks.underline = true;
  if (name === "s" || name === "strike" || name === "del" || decoration.includes("line-through")) marks.strike = true;
  const color = hexColor(node.getAttribute?.("color")) ?? hexColor(style.color);
  if (color) marks.color = color;
  const highlight = hexColor(style["background-color"]) ?? (name === "mark" ? "#ffe066" : undefined);
  if (highlight) marks.highlight = highlight;
  const font = fontOf(node.getAttribute?.("face")) ?? fontOf(style["font-family"]);
  if (font) marks.font = font;
  const step = Number(node.getAttribute?.("size"));
  if (name === "font" && step >= 1 && step <= 7) marks.size = RICH_SIZES[step - 1]!.scale;
  const cssSize = style["font-size"] ? CSS_SIZES[style["font-size"]] : undefined;
  if (cssSize) marks.size = cssSize;
  if (marks.size === 1) delete marks.size;
  return marks;
}

const BLOCK_NAMES = new Set(["div", "p", "h1", "h2", "h3", "h4", "blockquote", "li", "ul", "ol"]);

function blockType(name: string, list: "ul" | "ol" | null): RichBlockType {
  if (name === "li") return list === "ol" ? "number" : "bullet";
  if (name === "h1") return "title";
  if (name === "h2" || name === "h3" || name === "h4") return "subtitle";
  if (name === "blockquote") return "quote";
  return "p";
}

/** What the editor holds (its root element) as a clean document. */
export function htmlToRich(root: NodeLike): RichDoc {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;
  /** Blocks begun by a line break (an empty one is a blank line, not the editor's placeholder). */
  const byBreak = new Set<RichBlock>();
  const open = (type: RichBlockType, align?: string) => {
    current = { type, ...(align === "left" || align === "center" || align === "right" ? { align } : {}), runs: [] };
    blocks.push(current);
    return current;
  };
  const walk = (node: NodeLike, marks: RichMark, list: "ul" | "ol" | null, type: RichBlockType, align: string | undefined) => {
    if (node.nodeType === 3) {
      const text = (node.nodeValue ?? "").replace(/ /g, " ").replace(/[\r\n]+/g, " ");
      if (!text) return;
      (current ?? open(type, align)).runs.push({ ...marks, text });
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toLowerCase();
    if (name === "br") {
      // A break after words, or after another break, starts a new line of the same kind. A lone
      // <br> in an empty block only holds that empty line open.
      const block = current as RichBlock | null;
      if (!block) byBreak.add(open(type, align));
      else if (block.runs.length > 0 || byBreak.has(block)) byBreak.add(open(block.type, block.align));
      return;
    }
    if (BLOCK_NAMES.has(name)) {
      const nextList = name === "ul" || name === "ol" ? name : list;
      const style = styleOf(node);
      const ownAlign = style["text-align"] || node.getAttribute?.("align") || align;
      const nextType = name === "ul" || name === "ol" ? type : name === "div" || name === "p" ? (list ? type : "p") : blockType(name, nextList);
      if (name !== "ul" && name !== "ol") {
        current = null;
        open(nextType, ownAlign ?? undefined);
      }
      const inner = marksOf(node, marks);
      for (const child of Array.from(node.childNodes)) walk(child, inner, nextList, nextType, ownAlign ?? undefined);
      // A block that only held a <br> stays as an empty line.
      current = null;
      return;
    }
    const inner = marksOf(node, marks);
    for (const child of Array.from(node.childNodes)) walk(child, inner, list, type, align);
  };
  for (const child of Array.from(root.childNodes)) walk(child, {}, null, "p", undefined);
  // Empty lines at the end (the editor's trailing break) are dropped.
  while (blocks.length > 1 && blocks.at(-1)!.runs.length === 0) blocks.pop();
  return sanitizeRich({ blocks: blocks.length ? blocks : [{ type: "p", runs: [] }] })!;
}

/**
 * The words of a text or announcement item set in one place, so every editor saves them the same
 * way: a text item keeps `slide.rich`, an announcement keeps `announcement.rich` (its body only).
 */
export function itemWithWords<T extends { title: string; kind: string; slide?: { heading: string; body: string; imageId: string | null; rich?: RichDoc }; announcement?: { heading: string; body: string; rich?: RichDoc } }>(
  item: T,
  words: { heading: string; body: string; rich: RichDoc | null },
): T {
  const title = words.heading.trim() || plainFromRich(words.rich ?? { blocks: [] }).heading || item.title;
  if (item.kind === "announcement") {
    const announcement = { ...(item.announcement ?? {}), heading: words.heading, body: words.body } as NonNullable<T["announcement"]>;
    if (words.rich) announcement.rich = words.rich;
    else delete announcement.rich;
    return { ...item, title, announcement };
  }
  const slide = { heading: words.heading, body: words.body, imageId: item.slide?.imageId ?? null } as NonNullable<T["slide"]>;
  if (words.rich) slide.rich = words.rich;
  return { ...item, title, slide };
}

/** A run's look as inline CSS (shared by every place formatted words are drawn). */
export function runCss(run: RichMark): string {
  const parts: string[] = [];
  if (run.bold) parts.push("font-weight: 800");
  if (run.italic) parts.push("font-style: italic");
  const lines = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (lines) parts.push(`text-decoration-line: ${lines}`);
  if (run.color) parts.push(`color: ${run.color}`);
  if (run.highlight) parts.push(`background-color: ${run.highlight}`, "box-decoration-break: clone", "-webkit-box-decoration-break: clone", "padding: 0 0.12em", "border-radius: 0.12em");
  if (run.font) parts.push(`font-family: ${run.font}`);
  if (run.size) parts.push(`font-size: ${run.size}em`);
  return parts.join("; ");
}

/** Plain words (one block per line) as a document, for a single field going Formatted. */
export function richFromText(text: string): RichDoc {
  const blocks = text.split("\n").map((line): RichBlock => ({ type: "p", runs: line ? [{ text: line }] : [] }));
  return { blocks: blocks.length ? blocks : [{ type: "p", runs: [] }] };
}

/** A document's words as plain lines, one per block, without list marks (single fields, lyrics). */
export function textFromRich(doc: RichDoc): string {
  return doc.blocks.map((block) => block.runs.map((run) => run.text).join("")).join("\n");
}

/** Every run of a document in one line (overlays, lower thirds): blocks joined by a space. */
export function inlineRuns(doc: RichDoc): RichRun[] {
  const runs: RichRun[] = [];
  doc.blocks.forEach((block, index) => {
    if (index > 0 && block.runs.length && runs.length) runs.push({ text: " " });
    runs.push(...block.runs);
  });
  return runs;
}

/** Runs scaled in size (a subtitle drawn smaller than its title). */
export function scaleRuns(runs: RichRun[], factor: number): RichRun[] {
  return runs.map((run) => ({ ...run, size: Math.round((run.size ?? 1) * factor * 100) / 100 }));
}
