import { createComposition, setCompositionBackground, type Composition, type LayerBounds, type PageBackground } from "./composition";
import { addImageElement, addShapeElement, addTextElement, createDeck, MAX_DECK_PAGES, type SlideDeck } from "./decks";
import type { TextStyle } from "./types";
import { readZip } from "./zip";

/**
 * PowerPoint (.pptx) import. A .pptx is a ZIP of XML parts; we read the slides, their layouts and
 * masters just far enough to place text, pictures, simple shapes, backgrounds and speaker notes.
 * DOMParser is not available everywhere we run (Vitest is node), so a tiny tokenizer builds the tree.
 */

export type PptxTextStyle = {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
};

export type PptxElement =
  | { kind: "text"; text: string; bounds: LayerBounds; style: PptxTextStyle }
  | { kind: "image"; media: string; bounds: LayerBounds }
  | { kind: "shape"; shape: "rect" | "ellipse"; fill: string; bounds: LayerBounds };

export type PptxSlide = {
  elements: PptxElement[];
  background: { color?: string; media?: string } | null;
  notes: string;
  /** Hidden in PowerPoint's slide show. Still imported so nothing is lost. */
  hidden: boolean;
};

export type PptxPresentation = {
  /** Slide size in EMU (914400 per inch). */
  width: number;
  height: number;
  slides: PptxSlide[];
  media: Map<string, { data: Uint8Array; mime: string }>;
};

const NOT_PPTX = "That file is not a PowerPoint presentation.";
const EMU_PER_POINT = 12700;
const CANVAS_WIDTH = 1920;

// ---------------------------------------------------------------------------------------------
// Tiny XML tree. Namespaced names are kept as literal prefixes ("p:sp", "a:t").

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

// Quoted attribute values may contain ">" so the tag body alternates quoted and unquoted runs.
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s>/]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(source); match; match = TOKEN.exec(source)) {
    const top = stack[stack.length - 1]!;
    if (match[1] !== undefined) top.text += match[1];
    else if (match[6] !== undefined) top.text += decodeXmlEntities(match[6]);
    else if (match[3]) {
      const name = match[3];
      if (match[2] === "/") {
        // Tolerate stray close tags: pop back to the matching open tag if there is one.
        const at = stack.map((node) => node.name).lastIndexOf(name);
        if (at > 0) stack.length = at;
        continue;
      }
      const attrs: Record<string, string> = {};
      ATTR.lastIndex = 0;
      for (let attr = ATTR.exec(match[4] ?? ""); attr; attr = ATTR.exec(match[4] ?? "")) {
        attrs[attr[1]!] = decodeXmlEntities(attr[2] ?? attr[3] ?? "");
      }
      const node: XmlNode = { name, attrs, children: [], text: "" };
      top.children.push(node);
      if (match[5] !== "/") stack.push(node);
    }
  }
  return root;
}

function child(node: XmlNode | null | undefined, name: string): XmlNode | null {
  return node?.children.find((entry) => entry.name === name) ?? null;
}

function children(node: XmlNode | null | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((entry) => entry.name === name) : [];
}

/** Follow a path of child names, e.g. path(sp, "p:spPr", "a:xfrm"). */
function path(node: XmlNode | null | undefined, ...names: string[]): XmlNode | null {
  let at: XmlNode | null = node ?? null;
  for (const name of names) at = child(at, name);
  return at;
}

function descendants(node: XmlNode | null | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const entry of node?.children ?? []) {
    if (entry.name === name) out.push(entry);
    descendants(entry, name, out);
  }
  return out;
}

function num(value: string | undefined, fallback = 0): number {
  const parsed = value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------------------------
// Package parts and relationships.

type Rel = { id: string; type: string; target: string; external: boolean };

function dirOf(partPath: string): string {
  const at = partPath.lastIndexOf("/");
  return at < 0 ? "" : partPath.slice(0, at);
}

function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir ? baseDir.split("/") : [];
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

function relsPathFor(partPath: string): string {
  const dir = dirOf(partPath);
  const file = partPath.slice(dir.length ? dir.length + 1 : 0);
  return `${dir ? `${dir}/` : ""}_rels/${file}.rels`;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/emf",
  wmf: "image/wmf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

// Formats a browser can paint in an <img>; EMF/WMF/TIFF pictures are left out of the import.
const BROWSER_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp", "image/svg+xml"]);

function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

class Package {
  private readonly files = new Map<string, Uint8Array>();
  private readonly xmlCache = new Map<string, XmlNode | null>();
  private readonly relsCache = new Map<string, Rel[]>();
  private readonly decoder = new TextDecoder();

  constructor(entries: Array<{ name: string; data: Uint8Array }>) {
    for (const entry of entries) this.files.set(entry.name.replace(/^\/+/, ""), entry.data);
  }

  has(partPath: string) {
    return this.files.has(partPath);
  }

  bytes(partPath: string) {
    return this.files.get(partPath) ?? null;
  }

  names() {
    return [...this.files.keys()];
  }

  xml(partPath: string | null): XmlNode | null {
    if (!partPath) return null;
    if (!this.xmlCache.has(partPath)) {
      const data = this.files.get(partPath);
      this.xmlCache.set(partPath, data ? parseXml(this.decoder.decode(data)) : null);
    }
    return this.xmlCache.get(partPath)!;
  }

  rels(partPath: string): Rel[] {
    let rels = this.relsCache.get(partPath);
    if (!rels) {
      const doc = this.xml(relsPathFor(partPath));
      rels = descendants(doc, "Relationship").map((node) => {
        const external = node.attrs.TargetMode === "External";
        const target = node.attrs.Target ?? "";
        return { id: node.attrs.Id ?? "", type: node.attrs.Type ?? "", external, target: external ? target : resolvePart(dirOf(partPath), target) };
      });
      this.relsCache.set(partPath, rels);
    }
    return rels;
  }

  relById(partPath: string, id: string | undefined): Rel | null {
    if (!id) return null;
    return this.rels(partPath).find((rel) => rel.id === id) ?? null;
  }

  relByType(partPath: string, typeSuffix: string): Rel | null {
    return this.rels(partPath).find((rel) => !rel.external && rel.type.endsWith(typeSuffix)) ?? null;
  }
}

// ---------------------------------------------------------------------------------------------
// Colors: srgbClr, sysClr, prstClr and theme schemeClr, with the common lumMod/lumOff/tint/shade.

const OFFICE_THEME: Record<string, string> = {
  dk1: "000000",
  lt1: "FFFFFF",
  dk2: "44546A",
  lt2: "E7E6E6",
  accent1: "4472C4",
  accent2: "ED7D31",
  accent3: "A5A5A5",
  accent4: "FFC000",
  accent5: "5B9BD5",
  accent6: "70AD47",
  hlink: "0563C1",
  folHlink: "954F72",
};

const PRESET_COLORS: Record<string, string> = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  gray: "808080",
  grey: "808080",
  orange: "FFA500",
  purple: "800080",
};

type Theme = { colors: Record<string, string>; map: Record<string, string>; majorFont: string; minorFont: string };

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return [r, g, b].map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

function applyModifiers(hex: string, node: XmlNode): string {
  let rgb = hexToRgb(hex);
  for (const mod of node.children) {
    const amount = num(mod.attrs.val, 100000) / 100000;
    if (mod.name === "a:lumMod" || mod.name === "a:lumOff") {
      const [h, s, l] = rgbToHsl(rgb);
      const next = mod.name === "a:lumMod" ? l * amount : l + amount;
      rgb = hslToRgb([h, s, Math.min(1, Math.max(0, next))]);
    } else if (mod.name === "a:tint") {
      rgb = rgb.map((part) => part + (255 - part) * (1 - amount)) as [number, number, number];
    } else if (mod.name === "a:shade") {
      rgb = rgb.map((part) => part * amount) as [number, number, number];
    }
  }
  return rgbToHex(rgb);
}

/** The color inside a fill-like node (a:solidFill, a:fillRef, a:fontRef, …), or null. */
function colorIn(node: XmlNode | null, theme: Theme): string | null {
  if (!node) return null;
  for (const entry of node.children) {
    let hex: string | null = null;
    if (entry.name === "a:srgbClr") hex = entry.attrs.val ?? null;
    else if (entry.name === "a:sysClr") hex = entry.attrs.lastClr ?? (entry.attrs.val === "window" ? "FFFFFF" : "000000");
    else if (entry.name === "a:prstClr") hex = PRESET_COLORS[entry.attrs.val ?? ""] ?? null;
    else if (entry.name === "a:scrgbClr") {
      hex = rgbToHex([num(entry.attrs.r), num(entry.attrs.g), num(entry.attrs.b)].map((part) => (part / 100000) * 255) as [number, number, number]);
    } else if (entry.name === "a:schemeClr") {
      const key = entry.attrs.val ?? "";
      const mapped = theme.map[key] ?? key;
      hex = theme.colors[mapped] ?? OFFICE_THEME[mapped] ?? null;
    }
    if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) return `#${applyModifiers(hex, entry).toLowerCase()}`;
  }
  return null;
}

function readTheme(pkg: Package, masterPath: string | null): Theme {
  const theme: Theme = {
    colors: {},
    map: { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" },
    majorFont: "",
    minorFont: "",
  };
  if (!masterPath) return theme;
  const clrMap = path(pkg.xml(masterPath), "p:sldMaster", "p:clrMap");
  if (clrMap) for (const [key, value] of Object.entries(clrMap.attrs)) theme.map[key] = value;
  const themeRel = pkg.relByType(masterPath, "/theme");
  const themeDoc = pkg.xml(themeRel?.target ?? null);
  const scheme = descendants(themeDoc, "a:clrScheme")[0];
  const fallback: Theme = { ...theme, colors: OFFICE_THEME };
  for (const entry of scheme?.children ?? []) {
    const hex = colorIn(entry, fallback);
    if (hex) theme.colors[entry.name.replace(/^a:/, "")] = hex.slice(1);
  }
  const fonts = descendants(themeDoc, "a:fontScheme")[0];
  theme.majorFont = path(fonts, "a:majorFont", "a:latin")?.attrs.typeface ?? "";
  theme.minorFont = path(fonts, "a:minorFont", "a:latin")?.attrs.typeface ?? "";
  return theme;
}

// ---------------------------------------------------------------------------------------------
// Geometry: EMU rectangles, through group transforms, into percentages of the slide.

type Rect = { x: number; y: number; w: number; h: number };
type Transform = { sx: number; sy: number; tx: number; ty: number };
const IDENTITY: Transform = { sx: 1, sy: 1, tx: 0, ty: 0 };

function xfrmRect(xfrm: XmlNode | null): Rect | null {
  const off = child(xfrm, "a:off");
  const ext = child(xfrm, "a:ext");
  if (!off || !ext) return null;
  return { x: num(off.attrs.x), y: num(off.attrs.y), w: num(ext.attrs.cx), h: num(ext.attrs.cy) };
}

function applyTransform(rect: Rect, t: Transform): Rect {
  return { x: rect.x * t.sx + t.tx, y: rect.y * t.sy + t.ty, w: rect.w * t.sx, h: rect.h * t.sy };
}

function groupTransform(group: XmlNode, parent: Transform): Transform {
  const xfrm = path(group, "p:grpSpPr", "a:xfrm");
  const outer = xfrmRect(xfrm);
  const chOff = child(xfrm, "a:chOff");
  const chExt = child(xfrm, "a:chExt");
  if (!outer || !chOff || !chExt) return parent;
  const sx = num(chExt.attrs.cx) ? outer.w / num(chExt.attrs.cx) : 1;
  const sy = num(chExt.attrs.cy) ? outer.h / num(chExt.attrs.cy) : 1;
  const local: Transform = { sx, sy, tx: outer.x - num(chOff.attrs.x) * sx, ty: outer.y - num(chOff.attrs.y) * sy };
  return { sx: local.sx * parent.sx, sy: local.sy * parent.sy, tx: local.tx * parent.sx + parent.tx, ty: local.ty * parent.sy + parent.ty };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function toBounds(rect: Rect, width: number, height: number): LayerBounds {
  return { x: round2((rect.x / width) * 100), y: round2((rect.y / height) * 100), w: round2((rect.w / width) * 100), h: round2((rect.h / height) * 100) };
}

// ---------------------------------------------------------------------------------------------
// Placeholders: shapes that inherit position and text style from the layout, then the master.

type Placeholder = { type: string; idx: string | null };

function placeholderOf(shape: XmlNode): Placeholder | null {
  const nv = shape.children.find((entry) => entry.name.startsWith("p:nv"));
  const ph = path(nv, "p:nvPr", "p:ph");
  return ph ? { type: ph.attrs.type ?? "obj", idx: ph.attrs.idx ?? null } : null;
}

const isTitle = (type: string) => type === "title" || type === "ctrTitle";

function findPlaceholder(doc: XmlNode | null, ph: Placeholder, byTypeOnly: boolean): XmlNode | null {
  const shapes = descendants(doc, "p:sp");
  const withPh = shapes.map((shape) => ({ shape, ph: placeholderOf(shape) })).filter((entry) => entry.ph);
  if (!byTypeOnly && ph.idx !== null) {
    const byIdx = withPh.find((entry) => entry.ph!.idx === ph.idx);
    if (byIdx) return byIdx.shape;
  }
  const exact = withPh.find((entry) => entry.ph!.type === ph.type);
  if (exact) return exact.shape;
  // Masters only carry the generic kinds: a centered title is a title, anything else is body.
  const generic = isTitle(ph.type) ? "title" : ["dt", "ftr", "sldNum"].includes(ph.type) ? ph.type : "body";
  return withPh.find((entry) => entry.ph!.type === generic)?.shape ?? null;
}

const DEFAULT_TITLE: LayerBounds = { x: 6, y: 5, w: 88, h: 18 };
const DEFAULT_BODY: LayerBounds = { x: 6, y: 27, w: 88, h: 63 };

// ---------------------------------------------------------------------------------------------
// Slides.

type SlideContext = {
  pkg: Package;
  slidePath: string;
  layoutDoc: XmlNode | null;
  masterDoc: XmlNode | null;
  theme: Theme;
  width: number;
  height: number;
};

function shapeRect(ctx: SlideContext, shape: XmlNode, transform: Transform): Rect | null {
  const props = child(shape, "p:spPr") ?? child(shape, "p:grpSpPr");
  const own = xfrmRect(child(props, "a:xfrm"));
  if (own) return applyTransform(own, transform);
  const ph = placeholderOf(shape);
  if (!ph) return null;
  const fromLayout = xfrmRect(path(findPlaceholder(ctx.layoutDoc, ph, false), "p:spPr", "a:xfrm"));
  return fromLayout ?? xfrmRect(path(findPlaceholder(ctx.masterDoc, ph, true), "p:spPr", "a:xfrm"));
}

/** lvl1pPr nodes, most specific first, that may carry defaults for this shape's text. */
function styleLevels(ctx: SlideContext, shape: XmlNode): XmlNode[] {
  const levels: Array<XmlNode | null> = [path(shape, "p:txBody", "a:lstStyle", "a:lvl1pPr")];
  const ph = placeholderOf(shape);
  if (ph) {
    levels.push(path(findPlaceholder(ctx.layoutDoc, ph, false), "p:txBody", "a:lstStyle", "a:lvl1pPr"));
    levels.push(path(findPlaceholder(ctx.masterDoc, ph, true), "p:txBody", "a:lstStyle", "a:lvl1pPr"));
    const styles = path(ctx.masterDoc, "p:sldMaster", "p:txStyles");
    levels.push(path(styles, isTitle(ph.type) ? "p:titleStyle" : "p:bodyStyle", "a:lvl1pPr"));
  } else {
    levels.push(path(ctx.masterDoc, "p:sldMaster", "p:txStyles", "p:otherStyle", "a:lvl1pPr"));
    const presentation = ctx.pkg.xml("ppt/presentation.xml");
    levels.push(path(presentation, "p:presentation", "p:defaultTextStyle", "a:lvl1pPr"));
  }
  return levels.filter((level): level is XmlNode => !!level);
}

const ALIGN: Record<string, PptxTextStyle["align"]> = { l: "left", ctr: "center", r: "right", just: "left", dist: "center" };
const ANCHOR: Record<string, PptxTextStyle["vertical"]> = { t: "top", ctr: "middle", b: "bottom" };

function paragraphText(paragraph: XmlNode): string {
  let text = "";
  for (const entry of paragraph.children) {
    if (entry.name === "a:r" || entry.name === "a:fld") text += child(entry, "a:t")?.text ?? "";
    else if (entry.name === "a:br") text += "\n";
  }
  return text;
}

function readText(ctx: SlideContext, shape: XmlNode, rect: Rect | null): PptxElement | null {
  const body = child(shape, "p:txBody");
  const paragraphs = children(body, "a:p");
  const text = paragraphs.map(paragraphText).join("\n").replace(/\s+$/, "");
  if (!text.trim()) return null;

  const ph = placeholderOf(shape);
  const bounds = rect ? toBounds(rect, ctx.width, ctx.height) : ph && isTitle(ph.type) ? DEFAULT_TITLE : DEFAULT_BODY;
  const levels = styleLevels(ctx, shape);
  const firstRun = descendants(body, "a:r").find((run) => (child(run, "a:t")?.text ?? "").trim());
  const firstParagraph = paragraphs.find((paragraph) => paragraphText(paragraph).trim()) ?? paragraphs[0];
  // Run properties first, then the paragraph end mark, then inherited list styles.
  const runProps = [child(firstRun, "a:rPr"), child(firstParagraph, "a:endParaRPr"), ...levels.map((level) => child(level, "a:defRPr"))].filter(
    (node): node is XmlNode => !!node,
  );
  const attr = (name: string) => runProps.find((props) => props.attrs[name] !== undefined)?.attrs[name];

  const style: PptxTextStyle = {};
  const sz = attr("sz");
  const points = sz ? num(sz) / 100 : ph && isTitle(ph.type) ? 44 : 18;
  const fontScale = num(path(body, "a:bodyPr", "a:normAutofit")?.attrs.fontScale, 100000) / 100000;
  const slideWidthPoints = ctx.width / EMU_PER_POINT;
  style.size = Math.round(points * fontScale * (CANVAS_WIDTH / slideWidthPoints));
  if (attr("b") !== undefined) style.bold = attr("b") === "1" || attr("b") === "true";
  else if (ph && isTitle(ph.type)) style.bold = false;
  if (attr("i") === "1" || attr("i") === "true") style.italic = true;
  const underline = attr("u");
  if (underline && underline !== "none") style.underline = true;

  let color: string | null = null;
  for (const props of runProps) {
    color = colorIn(child(props, "a:solidFill"), ctx.theme);
    if (color) break;
  }
  color ??= colorIn(path(shape, "p:style", "a:fontRef"), ctx.theme);
  if (color) style.color = color;

  let typeface: string | undefined;
  for (const props of runProps) {
    typeface = child(props, "a:latin")?.attrs.typeface;
    if (typeface) break;
  }
  if (typeface === "+mj-lt") typeface = ctx.theme.majorFont;
  else if (typeface === "+mn-lt") typeface = ctx.theme.minorFont;
  else if (!typeface) typeface = ph && isTitle(ph.type) ? ctx.theme.majorFont : ctx.theme.minorFont;
  if (typeface && !typeface.startsWith("+")) style.fontFamily = typeface;

  const algn = [child(firstParagraph, "a:pPr"), ...levels].find((node) => node?.attrs.algn)?.attrs.algn;
  if (algn && ALIGN[algn]) style.align = ALIGN[algn];
  const anchor = path(body, "a:bodyPr")?.attrs.anchor;
  if (anchor && ANCHOR[anchor]) style.vertical = ANCHOR[anchor];

  return { kind: "text", text, bounds, style };
}

const RECT_GEOMETRIES = new Set(["rect", "roundRect", "snip1Rect", "snip2SameRect", "round1Rect", "round2SameRect", "flowChartProcess", "flowChartAlternateProcess"]);

function readShapeFill(ctx: SlideContext, shape: XmlNode, rect: Rect | null): PptxElement | null {
  if (!rect) return null;
  const props = child(shape, "p:spPr");
  const geometry = path(props, "a:prstGeom")?.attrs.prst ?? "";
  const kind = geometry === "ellipse" ? "ellipse" : RECT_GEOMETRIES.has(geometry) ? "rect" : null;
  if (!kind) return null;
  if (child(props, "a:noFill")) return null;
  let fill = colorIn(child(props, "a:solidFill"), ctx.theme);
  // Shapes drawn in PowerPoint often carry no fill of their own and take the theme style's.
  const fillRef = path(shape, "p:style", "a:fillRef");
  if (!fill && !child(props, "a:gradFill") && !child(props, "a:blipFill") && !child(props, "a:pattFill") && fillRef && fillRef.attrs.idx !== "0") {
    fill = colorIn(fillRef, ctx.theme);
  }
  return fill ? { kind: "shape", shape: kind, fill, bounds: toBounds(rect, ctx.width, ctx.height) } : null;
}

function readPicture(ctx: SlideContext, picture: XmlNode, transform: Transform): PptxElement | null {
  const blip = path(picture, "p:blipFill", "a:blip");
  const rel = ctx.pkg.relById(ctx.slidePath, blip?.attrs["r:embed"]);
  const own = xfrmRect(path(picture, "p:spPr", "a:xfrm"));
  let rect = own ? applyTransform(own, transform) : null;
  if (!rect) {
    const ph = placeholderOf(picture);
    rect = ph ? xfrmRect(path(findPlaceholder(ctx.layoutDoc, ph, false), "p:spPr", "a:xfrm")) : null;
  }
  if (!rel || rel.external || !rect || !ctx.pkg.has(rel.target)) return null;
  return { kind: "image", media: rel.target, bounds: toBounds(rect, ctx.width, ctx.height) };
}

function walkTree(ctx: SlideContext, tree: XmlNode, transform: Transform, out: PptxElement[]) {
  for (const node of tree.children) {
    if (node.name === "p:sp") {
      const rect = shapeRect(ctx, node, transform);
      const fill = readShapeFill(ctx, node, rect);
      if (fill) out.push(fill);
      if (child(node, "p:txBody")) {
        const text = readText(ctx, node, rect);
        if (text) out.push(text);
      }
    } else if (node.name === "p:pic") {
      const picture = readPicture(ctx, node, transform);
      if (picture) out.push(picture);
    } else if (node.name === "p:grpSp") {
      walkTree(ctx, node, groupTransform(node, transform), out);
    } else if (node.name === "mc:AlternateContent") {
      // Newer features ship a Choice plus a Fallback older apps can read; the Fallback is plainer.
      const branch = child(node, "mc:Fallback") ?? child(node, "mc:Choice");
      if (branch) walkTree(ctx, branch, transform, out);
    }
  }
}

function readBackground(ctx: SlideContext, docPath: string | null, doc: XmlNode | null): PptxSlide["background"] {
  const bg = doc ? descendants(doc, "p:bg")[0] : undefined;
  if (!bg || !docPath) return null;
  const props = child(bg, "p:bgPr");
  if (props) {
    const blip = path(props, "a:blipFill", "a:blip");
    const rel = ctx.pkg.relById(docPath, blip?.attrs["r:embed"]);
    const color = colorIn(child(props, "a:solidFill"), ctx.theme);
    // A gradient becomes its first stop: close enough for a page color.
    const gradient = colorIn(descendants(child(props, "a:gradFill"), "a:gs")[0] ?? null, ctx.theme);
    if (rel && !rel.external && ctx.pkg.has(rel.target)) return { media: rel.target, ...(color ? { color } : {}) };
    if (color ?? gradient) return { color: (color ?? gradient)! };
    return null;
  }
  const ref = child(bg, "p:bgRef");
  const color = colorIn(ref, ctx.theme);
  return color ? { color } : null;
}

function readNotes(pkg: Package, slidePath: string): string {
  const rel = pkg.relByType(slidePath, "/notesSlide");
  const doc = pkg.xml(rel?.target ?? null);
  if (!doc) return "";
  const shapes = descendants(doc, "p:sp");
  // The notes body placeholder; slide image, number and header placeholders are skipped.
  const body = shapes.filter((shape) => placeholderOf(shape)?.type === "body");
  const source = body.length ? body : shapes.filter((shape) => !placeholderOf(shape));
  return source
    .map((shape) => children(child(shape, "p:txBody"), "a:p").map(paragraphText).join("\n"))
    .join("\n")
    .trim();
}

function readSlide(pkg: Package, slidePath: string, width: number, height: number): PptxSlide {
  const doc = pkg.xml(slidePath);
  const layoutPath = pkg.relByType(slidePath, "/slideLayout")?.target ?? null;
  const masterPath = layoutPath ? (pkg.relByType(layoutPath, "/slideMaster")?.target ?? null) : null;
  const ctx: SlideContext = {
    pkg,
    slidePath,
    layoutDoc: pkg.xml(layoutPath),
    masterDoc: pkg.xml(masterPath),
    theme: readTheme(pkg, masterPath),
    width,
    height,
  };
  const elements: PptxElement[] = [];
  const tree = path(doc, "p:sld", "p:cSld", "p:spTree");
  if (tree) walkTree(ctx, tree, IDENTITY, elements);
  const background =
    readBackground(ctx, slidePath, path(doc, "p:sld", "p:cSld")) ??
    readBackground(ctx, layoutPath, path(ctx.layoutDoc, "p:sldLayout", "p:cSld")) ??
    readBackground(ctx, masterPath, path(ctx.masterDoc, "p:sldMaster", "p:cSld"));
  const hidden = path(doc, "p:sld")?.attrs.show === "0";
  return { elements, background, notes: readNotes(pkg, slidePath), hidden };
}

/** Read a .pptx file into slides of positioned text, pictures, shapes, backgrounds and notes. */
export async function parsePptx(bytes: Uint8Array): Promise<PptxPresentation> {
  let entries: Awaited<ReturnType<typeof readZip>>;
  try {
    entries = await readZip(bytes);
  } catch {
    throw new Error(NOT_PPTX);
  }
  const pkg = new Package(entries);
  const presentationPath = "ppt/presentation.xml";
  const presentation = path(pkg.xml(presentationPath), "p:presentation");
  if (!presentation) throw new Error(NOT_PPTX);

  const size = child(presentation, "p:sldSz");
  const width = num(size?.attrs.cx, 12192000) || 12192000;
  const height = num(size?.attrs.cy, 6858000) || 6858000;

  // Order comes from the slide id list, not from slideN file names (those drift as slides move).
  const slidePaths = children(child(presentation, "p:sldIdLst"), "p:sldId")
    .map((entry) => pkg.relById(presentationPath, entry.attrs["r:id"]))
    .filter((rel): rel is Rel => !!rel && !rel.external && pkg.has(rel.target))
    .map((rel) => rel.target);

  const slides = slidePaths.map((slidePath) => readSlide(pkg, slidePath, width, height));
  const media = new Map<string, { data: Uint8Array; mime: string }>();
  for (const name of pkg.names()) {
    if (name.startsWith("ppt/media/")) media.set(name, { data: pkg.bytes(name)!, mime: mimeOf(name) });
  }
  return { width, height, slides, media };
}

/** Pictures the slides use (in first-use order), in formats a browser can show, for the media library. */
export function pptxMediaFiles(presentation: PptxPresentation): Array<{ path: string; name: string; mime: string; data: Uint8Array }> {
  const seen = new Set<string>();
  const files: Array<{ path: string; name: string; mime: string; data: Uint8Array }> = [];
  const add = (mediaPath: string | undefined) => {
    if (!mediaPath || seen.has(mediaPath)) return;
    seen.add(mediaPath);
    const file = presentation.media.get(mediaPath);
    if (!file || !BROWSER_IMAGES.has(file.mime)) return;
    files.push({ path: mediaPath, name: mediaPath.slice(mediaPath.lastIndexOf("/") + 1), mime: file.mime, data: file.data });
  };
  for (const slide of presentation.slides) {
    add(slide.background?.media);
    for (const element of slide.elements) if (element.kind === "image") add(element.media);
  }
  return files;
}

function colorBackground(color: string): PageBackground {
  return { type: "color", color, to: color, angle: 0, assetId: "", imageUrl: "", overlay: "#000000", overlayOpacity: 0 };
}

/** Turn a parsed presentation into a deck: one page per slide, elements back to front. */
export function pptxToDeck(
  presentation: PptxPresentation,
  name: string,
  mediaFor: (path: string) => { id: string; name: string; url: string } | null,
): SlideDeck {
  const deck = createDeck(name);
  const pages: Composition[] = presentation.slides.slice(0, MAX_DECK_PAGES).map((slide, index) => {
    let page = createComposition(`Page ${index + 1}`);
    const color = slide.background?.color ?? "#ffffff";
    const picture = slide.background?.media ? mediaFor(slide.background.media) : null;
    const background = picture ? { ...colorBackground(color), type: "image" as const, assetId: picture.id, imageUrl: picture.url } : colorBackground(color);
    page = setCompositionBackground(page, background);
    let textCount = 0;
    for (const element of slide.elements) {
      if (element.kind === "text") {
        if (!element.text.trim()) continue;
        textCount += 1;
        // PowerPoint's default text is dark; the app's would be the theme's, so make it explicit.
        const style: TextStyle = { ...element.style, color: element.style.color ?? "#000000", vertical: element.style.vertical ?? "top" };
        page = addTextElement(page, element.text, element.bounds, style, textCount === 1 ? "Title" : `Text ${textCount}`);
      } else if (element.kind === "image") {
        const asset = mediaFor(element.media);
        if (asset) page = addImageElement(page, asset, element.bounds);
      } else {
        page = addShapeElement(page, element.shape, element.fill, element.bounds);
      }
    }
    return { ...page, transition: { type: "fade", ms: 300 } };
  });
  return pages.length ? { ...deck, pages } : deck;
}
