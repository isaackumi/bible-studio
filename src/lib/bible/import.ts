// Bible files a church brings: Zefania XML (common for local-language Bibles), OSIS XML
// (CrossWire/SWORD exports) and OpenSong XML (OpenSong, FreeShow). Each is read into books of
// chapters of verses in canon order, so it installs like a bundled translation and works offline.
//
// Verse text keeps only the words: footnotes and cross references are dropped, markup is removed.

import { CANON } from "./reference";

export type ImportedBible = {
  name: string;
  abbreviation: string;
  /** Books present, in canon order; `chapters[c - 1][v - 1]` is a verse ("" where one is missing). */
  books: Array<{ ord: number; name: string; chapters: string[][] }>;
};

const OSIS_BOOKS = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job",
  "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph",
  "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess",
  "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];

const decode = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[code.toLowerCase()]) return named[code.toLowerCase()]!;
    return String.fromCodePoint(code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  });

/** A verse's words: notes and references dropped, tags removed, spaces tidied. */
function words(markup: string): string {
  return decode(
    markup
      .replace(/<(note|NOTE|rf|RF|reference|xref|DIV)\b[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

/** Put a verse in its place, growing the book's chapters as needed. */
function place(books: Map<number, { ord: number; name: string; chapters: string[][] }>, ord: number, name: string, chapter: number, verse: number, text: string) {
  if (!(ord >= 1 && ord <= 66) || chapter < 1 || verse < 1 || !text) return;
  const book = books.get(ord) ?? { ord, name: name || CANON[ord - 1]!.name, chapters: [] };
  books.set(ord, book);
  while (book.chapters.length < chapter) book.chapters.push([]);
  const verses = book.chapters[chapter - 1]!;
  while (verses.length < verse) verses.push("");
  verses[verse - 1] = verses[verse - 1] ? `${verses[verse - 1]} ${text}` : text;
}

const ordered = (books: Map<number, ImportedBible["books"][number]>) => [...books.values()].sort((a, b) => a.ord - b.ord);
const abbreviate = (name: string) => (name.match(/\b[A-Z0-9]/g)?.join("") || name.slice(0, 4)).slice(0, 8).toUpperCase();

/** Book order by name (OpenSong names books in its own language too, so position is the fallback). */
function ordByName(name: string, position: number, total: number): number {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = CANON.find((book) => book.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key || book.aliases.some((alias) => alias.replace(/[^a-z0-9]/g, "") === key));
  if (found) return found.ord;
  // A full Bible in another language: books are in canon order. A New Testament alone starts at Matthew.
  if (total === 66) return position + 1;
  if (total === 27) return position + 40;
  return 0;
}

export function readZefania(xml: string): ImportedBible | null {
  const root = /<XMLBIBLE\b([^>]*)>/i.exec(xml);
  if (!root) return null;
  const title = words(/<title>([\s\S]*?)<\/title>/i.exec(xml)?.[1] ?? "") || attr(root[1]!, "biblename") || "Imported Bible";
  const books = new Map<number, ImportedBible["books"][number]>();
  for (const book of xml.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
    const ord = Number(attr(book[1]!, "bnumber"));
    const name = decode(attr(book[1]!, "bname") ?? "");
    for (const chapter of book[2]!.matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
      const c = Number(attr(chapter[1]!, "cnumber"));
      for (const verse of chapter[2]!.matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi)) place(books, ord, name, c, Number(attr(verse[1]!, "vnumber")), words(verse[2]!));
    }
  }
  return books.size ? { name: title, abbreviation: abbreviate(title), books: ordered(books) } : null;
}

export function readOsis(xml: string): ImportedBible | null {
  if (!/<osis\b/i.test(xml)) return null;
  const work = /<osisText\b([^>]*)>/i.exec(xml);
  const title = words(/<work\b[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/i.exec(xml)?.[1] ?? "") || attr(work?.[1] ?? "", "osisIDWork") || "Imported Bible";
  const books = new Map<number, ImportedBible["books"][number]>();
  const put = (id: string, text: string) => {
    const [book, c, v] = id.split(".");
    place(books, OSIS_BOOKS.indexOf(book ?? "") + 1, "", Number(c), Number(v), words(text));
  };
  // Container verses: <verse osisID="Gen.1.1">words</verse>.
  // (A self-closing <verse …/> is a milestone, skipped here; checked without a lookbehind, which
  // older Safari cannot read.)
  for (const verse of xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/g)) {
    if (verse[1]!.trimEnd().endsWith("/")) continue;
    const id = attr(verse[1]!, "osisID");
    if (id && !attr(verse[1]!, "sID")) put(id.split(/\s+/)[0]!, verse[2]!);
  }
  // Milestone verses: <verse sID="…" osisID="Gen.1.1"/>words<verse eID="…"/>.
  for (const verse of xml.matchAll(/<verse\b([^>]*\bsID="[^"]*"[^>]*)\/>([\s\S]*?)<verse\b[^>]*\beID="[^"]*"[^>]*\/>/g)) {
    const id = attr(verse[1]!, "osisID");
    if (id) put(id.split(/\s+/)[0]!, verse[2]!);
  }
  return books.size ? { name: title, abbreviation: (attr(work?.[1] ?? "", "osisIDWork") ?? abbreviate(title)).slice(0, 8).toUpperCase(), books: ordered(books) } : null;
}

export function readOpenSong(xml: string): ImportedBible | null {
  const root = /<bible\b([^>]*)>/i.exec(xml);
  if (!root) return null;
  const list = [...xml.matchAll(/<b\b([^>]*)>([\s\S]*?)<\/b>/g)];
  if (!list.length) return null;
  const books = new Map<number, ImportedBible["books"][number]>();
  list.forEach((book, position) => {
    const name = decode(attr(book[1]!, "n") ?? "");
    const ord = ordByName(name, position, list.length);
    for (const chapter of book[2]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const c = Number(attr(chapter[1]!, "n"));
      for (const verse of chapter[2]!.matchAll(/<v\b([^>]*)>([\s\S]*?)<\/v>/g)) place(books, ord, name, c, Number(attr(verse[1]!, "n")), words(verse[2]!));
    }
  });
  const title = decode(attr(root[1]!, "n") ?? "") || "Imported Bible";
  return books.size ? { name: title, abbreviation: abbreviate(title), books: ordered(books) } : null;
}

/** Read any supported Bible file; null when it is none of them. */
export function readBibleFile(text: string, fallbackName = ""): ImportedBible | null {
  const bible = readZefania(text) ?? readOsis(text) ?? readOpenSong(text);
  if (!bible) return null;
  if ((!bible.name || bible.name === "Imported Bible") && fallbackName) bible.name = fallbackName;
  return bible;
}

/** How many verses a Bible holds (to say what was imported). */
export const verseCount = (bible: ImportedBible) => bible.books.reduce((sum, book) => sum + book.chapters.reduce((n, chapter) => n + chapter.filter(Boolean).length, 0), 0);
