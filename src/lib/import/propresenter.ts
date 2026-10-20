// Songs from ProPresenter, so a church moving over brings its library.
//
// ProPresenter 6 (.pro6, and .pro5) is XML: groups (Verse 1, Chorus…) hold slides, each slide's
// words are base64 RTF (or plain text), and arrangements give the order by group id.
// ProPresenter 7 (.pro, also inside a .proBundle zip) is a protobuf "Presentation" with the same
// ideas: cue groups name the groups and list their cues; each cue's slide holds RTF words;
// arrangements list group ids. The layout follows the community schema (ProPresenter7-Proto), and
// the reader also recognises those messages by their shape, so a newer version still reads.
//
// Each slide becomes one screen of its part: slides are separated by a blank line, which the
// line-by-line mode (domain/song-screens.ts) treats as a screen break.

import { rtfToText } from "./rtf";

export type ImportedSong = {
  title: string;
  author: string;
  ccli: string;
  copyright: string;
  /** Parts in the file's order; `id` is the file's own group id. */
  parts: Array<{ id: string; label: string; lines: string[] }>;
  /** The first arrangement, as part ids (repeats allowed). */
  order: string[];
};

const decodeEntities = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[code.toLowerCase()]) return named[code.toLowerCase()]!;
    return String.fromCodePoint(code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  });

function base64Text(value: string): string {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return "";
  }
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[match[1]!] = decodeEntities(match[2]!);
  return out;
}

const linesOf = (text: string) => text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());

/** Slides joined into a part's lines, a blank line between slides, empty slides left out. */
function joinSlides(slides: string[]): string[] {
  const lines: string[] = [];
  for (const slide of slides) {
    const words = linesOf(slide).filter(Boolean);
    if (!words.length) continue;
    if (lines.length) lines.push("");
    lines.push(...words);
  }
  return lines;
}

// --- ProPresenter 6 (XML) --------------------------------------------------------------------

export function readPro6(xml: string, fallbackTitle = ""): ImportedSong | null {
  const root = /<RVPresentationDocument\b([^>]*)>/.exec(xml);
  if (!root) return null;
  const doc = attributes(root[1]!);
  const parts: ImportedSong["parts"] = [];
  for (const group of xml.matchAll(/<RVSlideGrouping\b([^>]*)>([\s\S]*?)<\/RVSlideGrouping>/g)) {
    const info = attributes(group[1]!);
    const slides: string[] = [];
    for (const slide of group[2]!.matchAll(/<RVDisplaySlide\b[^>]*>([\s\S]*?)<\/RVDisplaySlide>/g)) {
      const texts: string[] = [];
      for (const element of slide[1]!.matchAll(/<RVTextElement\b([^>]*)>([\s\S]*?)<\/RVTextElement>/g)) {
        const body = element[2]!;
        const plain = /rvXMLIvarName="PlainText"[^>]*>([^<]*)</.exec(body)?.[1];
        const rtf = /rvXMLIvarName="RTFData"[^>]*>([^<]*)</.exec(body)?.[1] ?? attributes(element[1]!).RTFData;
        const text = plain ? base64Text(plain) : rtf ? rtfToText(base64Text(rtf)) : "";
        if (text.trim()) texts.push(text);
      }
      slides.push(texts.join("\n"));
    }
    const lines = joinSlides(slides);
    if (lines.length) parts.push({ id: info.uuid || `group-${parts.length}`, label: info.name?.trim() || `Part ${parts.length + 1}`, lines });
  }
  if (!parts.length) return null;
  const known = new Set(parts.map((part) => part.id));
  const arrangement = /<RVSongArrangement\b[^>]*>([\s\S]*?)<\/RVSongArrangement>/.exec(xml)?.[1] ?? "";
  const order = [...arrangement.matchAll(/<NSString\b[^>]*>([^<]+)<\/NSString>/g)].map((match) => match[1]!.trim()).filter((id) => known.has(id));
  const year = doc.CCLICopyrightYear || doc.CCLICopyrightInfo || "";
  return {
    title: doc.CCLISongTitle?.trim() || fallbackTitle,
    author: (doc.CCLIAuthor || doc.CCLIArtistCredits || "").trim(),
    ccli: (doc.CCLISongNumber || "").replace(/\D+/g, ""),
    copyright: [year, doc.CCLIPublisher].filter((value) => value && value.trim() && value !== "0").join(" ").trim(),
    parts,
    order,
  };
}

// --- ProPresenter 7 (protobuf) ---------------------------------------------------------------

type Field = { number: number; wire: number; value: number | Uint8Array };

/** The fields of one protobuf message, or null when the bytes are not one. */
export function decodeMessage(bytes: Uint8Array): Field[] | null {
  const fields: Field[] = [];
  let at = 0;
  const varint = (): number | null => {
    let result = 0;
    let shift = 0;
    while (at < bytes.length) {
      const byte = bytes[at++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 63) return null;
    }
    return null;
  };
  while (at < bytes.length) {
    const key = varint();
    if (key === null || key === 0) return null;
    const number = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) {
      const value = varint();
      if (value === null) return null;
      fields.push({ number, wire, value });
    } else if (wire === 2) {
      const length = varint();
      if (length === null || at + length > bytes.length) return null;
      fields.push({ number, wire, value: bytes.subarray(at, at + length) });
      at += length;
    } else if (wire === 1) {
      at += 8;
      if (at > bytes.length) return null;
      fields.push({ number, wire, value: 0 });
    } else if (wire === 5) {
      at += 4;
      if (at > bytes.length) return null;
      fields.push({ number, wire, value: 0 });
    } else return null;
  }
  return fields;
}

const utf8 = new TextDecoder("utf-8", { fatal: false });
const bytesOf = (field: Field | undefined) => (field && field.value instanceof Uint8Array ? field.value : null);
const textOf = (field: Field | undefined) => {
  const bytes = bytesOf(field);
  return bytes ? utf8.decode(bytes) : "";
};
const first = (fields: Field[] | null, number: number) => fields?.find((field) => field.number === number);
const all = (fields: Field[] | null, number: number) => (fields ?? []).filter((field) => field.number === number);
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** A UUID message ({ string = 1 }) as its text, or "". */
function uuidOf(field: Field | undefined): string {
  const bytes = bytesOf(field);
  if (!bytes) return "";
  const text = textOf(first(decodeMessage(bytes), 1));
  return UUID.test(text) ? text.toUpperCase() : "";
}

/** Every RTF document anywhere inside a message (a cue's slide words). */
function rtfInside(bytes: Uint8Array, depth = 0, out: string[] = []): string[] {
  if (depth > 12) return out;
  const fields = decodeMessage(bytes);
  if (!fields) return out;
  for (const field of fields) {
    const inner = bytesOf(field);
    if (!inner) continue;
    if (inner[0] === 0x7b && utf8.decode(inner.subarray(0, 6)) === "{\\rtf1") out.push(utf8.decode(inner));
    else rtfInside(inner, depth + 1, out);
  }
  return out;
}

export function readPro7(bytes: Uint8Array, fallbackTitle = ""): ImportedSong | null {
  const top = decodeMessage(bytes);
  if (!top) return null;
  // Cues: a UUID first, and slide words somewhere inside.
  const cueText = new Map<string, string>();
  for (const field of top) {
    const inner = bytesOf(field);
    if (!inner || inner.length < 20) continue;
    const message = decodeMessage(inner);
    const id = uuidOf(first(message, 1));
    if (!id) continue;
    const rtf = rtfInside(inner);
    if (rtf.length) cueText.set(id, rtf.map(rtfToText).filter((text) => text.trim()).join("\n"));
  }
  // Cue groups: { group = 1 { uuid = 1, name = 2 }, cue_identifiers = 2 (UUIDs) }.
  const parts: ImportedSong["parts"] = [];
  for (const field of top) {
    const inner = bytesOf(field);
    if (!inner) continue;
    const message = decodeMessage(inner);
    const groupBytes = bytesOf(first(message, 1));
    const cueIds = all(message, 2).map(uuidOf).filter(Boolean);
    if (!groupBytes || !cueIds.length || !cueIds.some((id) => cueText.has(id))) continue;
    const group = decodeMessage(groupBytes);
    const id = uuidOf(first(group, 1));
    const label = textOf(first(group, 2)).trim();
    if (!id) continue;
    const lines = joinSlides(cueIds.map((cue) => cueText.get(cue) ?? ""));
    if (lines.length) parts.push({ id, label: label || `Part ${parts.length + 1}`, lines });
  }
  if (!parts.length) return null;
  // Arrangements: { uuid = 1, name = 2, group_identifiers = 3 (UUIDs) }; the first one wins.
  const known = new Set(parts.map((part) => part.id));
  let order: string[] = [];
  for (const field of top) {
    const message = bytesOf(field) ? decodeMessage(bytesOf(field)!) : null;
    const ids = all(message, 3).map(uuidOf).filter((id) => known.has(id));
    if (ids.length && textOf(first(message, 2)).trim()) {
      order = ids;
      break;
    }
  }
  // CCLI: { author = 1, artist_credits = 2, song_title = 3, publisher = 4, copyright_year = 5, song_number = 6 }.
  const ccliMessage = bytesOf(first(top, 14)) ? decodeMessage(bytesOf(first(top, 14))!) : null;
  const yearField = first(ccliMessage, 5);
  const numberField = first(ccliMessage, 6);
  const year = yearField && typeof yearField.value === "number" && yearField.value > 0 ? String(yearField.value) : "";
  return {
    title: textOf(first(ccliMessage, 3)).trim() || textOf(first(top, 3)).trim() || fallbackTitle,
    author: (textOf(first(ccliMessage, 1)) || textOf(first(ccliMessage, 2))).trim(),
    ccli: numberField && typeof numberField.value === "number" && numberField.value > 0 ? String(numberField.value) : "",
    copyright: [year, textOf(first(ccliMessage, 4)).trim()].filter(Boolean).join(" "),
    parts,
    order,
  };
}
