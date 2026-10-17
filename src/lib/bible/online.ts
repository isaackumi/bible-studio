// Licensed modern translations (NIV, NKJV, ESV, ... where the publisher allows) through
// API.Bible, using the church's own free key. Verse text is never written to disk: the
// licence terms forbid storing it, so only a small in-memory cache keeps repeat lookups fast.

import type { VerseText } from "../domain/types";
import { cleanVerse } from "./clean";
import { CANON } from "./reference";

export const API_BIBLE_BASE = "https://api.scripture.api.bible/v1";
export const FUMS_URL = "https://fums.api.bible/f3";

type FetchLike = typeof fetch;

/** USFM book codes, indexed by canon ord - 1 (API.Bible passage ids use these). */
export const USFM_BOOKS: string[] = (
  "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL " +
  "MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV"
).split(" ");

export type OnlineBible = {
  id: string;
  abbreviation: string;
  name: string;
  language: string;
  description: string;
};

export type OnlinePassage = {
  verses: VerseText[];
  copyright: string;
  reference: string;
  /** FUMS token to report with reportFums each time the passage is shown; null when none came back. */
  fums: string | null;
};

export type OnlineErrorKind = "key" | "license" | "missing" | "rate" | "network";

const MESSAGES: Record<OnlineErrorKind, string> = {
  key: "The API.Bible key was not accepted. Check it in Settings › Bible.",
  license: "Your API.Bible key is not licensed for this translation.",
  missing: "That passage is not in this translation.",
  rate: "API.Bible is busy. Try again in a minute.",
  network: "No internet connection, so online translations are unavailable. Bundled translations still work.",
};

export class OnlineBibleError extends Error {
  kind: OnlineErrorKind;
  status: number | null;

  constructor(kind: OnlineErrorKind, status: number | null = null) {
    super(MESSAGES[kind]);
    this.name = "OnlineBibleError";
    this.kind = kind;
    this.status = status;
  }
}

/** Status code → what the operator should do about it. */
export function errorKindForStatus(status: number): OnlineErrorKind {
  if (status === 401) return "key";
  if (status === 403) return "license";
  if (status === 400 || status === 404) return "missing";
  if (status === 429) return "rate";
  // 5xx and anything odd: the service is unreachable for practical purposes.
  return "network";
}

/** "JHN.3.16-JHN.3.18", "JHN.3.16" or the whole chapter "JHN.3". */
export function passageId(bookOrd: number, chapter: number, start?: number | null, end?: number | null): string {
  const code = USFM_BOOKS[bookOrd - 1];
  if (!code) throw new RangeError(`No book ${bookOrd}`);
  const base = `${code}.${chapter}`;
  if (start == null) return base;
  if (end == null || end <= start) return `${base}.${start}`;
  return `${base}.${start}-${base}.${end}`;
}

async function request<T>(key: string, path: string, fetchImpl: FetchLike): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${API_BIBLE_BASE}${path}`, { headers: { "api-key": key, accept: "application/json" } });
  } catch {
    throw new OnlineBibleError("network");
  }
  if (!response.ok) throw new OnlineBibleError(errorKindForStatus(response.status), response.status);
  try {
    return (await response.json()) as T;
  } catch {
    // A captive portal or proxy page instead of JSON.
    throw new OnlineBibleError("network", response.status);
  }
}

type RawBible = {
  id?: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  name?: string;
  nameLocal?: string;
  description?: string;
  descriptionLocal?: string;
  language?: { id?: string; name?: string; nameLocal?: string };
};

function isEnglish(bible: RawBible): boolean {
  return bible.language?.id === "eng" || /^english$/i.test(bible.language?.name ?? "");
}

/** Translations this key can use, English first then by name. */
export async function listOnlineBibles(key: string, opts: { language?: string; fetch?: FetchLike } = {}): Promise<OnlineBible[]> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const query = opts.language ? `?language=${encodeURIComponent(opts.language)}` : "";
  const body = await request<{ data?: RawBible[] }>(key, `/bibles${query}`, fetchImpl);
  const seen = new Set<string>();
  const rows: { bible: OnlineBible; english: boolean }[] = [];
  for (const raw of body.data ?? []) {
    if (!raw.id || seen.has(raw.id)) continue;
    const name = (raw.name || raw.nameLocal || "").trim();
    const abbreviation = (raw.abbreviation || raw.abbreviationLocal || "").trim();
    // The same edition is sometimes listed twice under different ids; keep the first.
    const sameEdition = `${abbreviation.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(sameEdition)) continue;
    seen.add(raw.id);
    seen.add(sameEdition);
    rows.push({
      english: isEnglish(raw),
      bible: {
        id: raw.id,
        abbreviation,
        name: name || abbreviation || raw.id,
        language: raw.language?.name ?? raw.language?.nameLocal ?? "",
        description: (raw.description || raw.descriptionLocal || "").trim(),
      },
    });
  }
  rows.sort((a, b) => Number(b.english) - Number(a.english) || a.bible.name.localeCompare(b.bible.name));
  return rows.map((row) => row.bible);
}

/** Text content with "[16]" markers before each verse → verses. Text before the first marker is dropped. */
export function parseVerseText(content: string): VerseText[] {
  const verses: VerseText[] = [];
  const parts = content.replace(/¶/g, " ").split(/\[\s*(\d+)\s*\]/);
  for (let i = 1; i < parts.length; i += 2) {
    const verse = Number(parts[i]);
    const text = cleanVerse((parts[i + 1] ?? "").replace(/\s+/g, " "));
    const last = verses[verses.length - 1];
    // A verse split across paragraphs can repeat its number; join the pieces.
    if (last && last.verse === verse) {
      last.text = [last.text, text].filter(Boolean).join(" ");
    } else {
      verses.push({ verse, text });
    }
  }
  return verses;
}

/** The FUMS token: from the noscript pixel URL ("...f3?t=TOKEN"), else fumsId. */
function fumsToken(meta: RawMeta | undefined): string | null {
  const pixel = meta?.fumsNoScript?.match(/[?&]t=([^&"'\s]+)/);
  if (pixel?.[1]) return decodeURIComponent(pixel[1]);
  return meta?.fumsToken || meta?.fumsId || null;
}

type RawMeta = { fums?: string; fumsId?: string; fumsToken?: string; fumsNoScript?: string };
type RawPassage = { data?: { content?: string; reference?: string; copyright?: string }; meta?: RawMeta };

const CACHE_LIMIT = 300;
const cache = new Map<string, OnlinePassage>();

function cacheGet(key: string): OnlinePassage | undefined {
  const hit = cache.get(key);
  if (hit) {
    // Re-insert so the Map's order stays least-recently-used first.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cachePut(key: string, value: OnlinePassage) {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Forget every cached passage (e.g. when the key changes). */
export function clearOnlineCache() {
  cache.clear();
}

const PASSAGE_QUERY =
  "content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false";

export async function fetchOnlinePassage(
  key: string,
  bibleId: string,
  bookOrd: number,
  chapter: number,
  start: number | null,
  end: number | null,
  opts: { fetch?: FetchLike } = {},
): Promise<OnlinePassage> {
  const id = passageId(bookOrd, chapter, start, end);
  const cacheKey = `${bibleId}|${id}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const body = await request<RawPassage>(key, `/bibles/${encodeURIComponent(bibleId)}/passages/${id}?${PASSAGE_QUERY}`, fetchImpl);
  const content = body.data?.content ?? "";
  let verses = parseVerseText(content);
  // No markers (a one-verse passage can come back bare): the whole text is the asked verse.
  if (!verses.length && content.trim()) verses = [{ verse: start ?? 1, text: cleanVerse(content.replace(/\s+/g, " ")) }];
  if (!verses.length) throw new OnlineBibleError("missing", 404);

  const passage: OnlinePassage = {
    verses,
    copyright: (body.data?.copyright ?? "").trim(),
    reference: body.data?.reference ?? "",
    fums: fumsToken(body.meta),
  };
  cachePut(cacheKey, passage);
  return passage;
}

/** A whole chapter (the passage id without verses). */
export function fetchOnlineChapter(key: string, bibleId: string, bookOrd: number, chapter: number, opts: { fetch?: FetchLike } = {}): Promise<OnlinePassage> {
  const book = CANON.find((entry) => entry.ord === bookOrd);
  if (book && (chapter < 1 || chapter > book.chapters)) return Promise.reject(new OnlineBibleError("missing"));
  return fetchOnlinePassage(key, bibleId, bookOrd, chapter, null, null, opts);
}

/**
 * Tell API.Bible a passage was shown (fair-use tracking the licence requires). Best effort:
 * a failure never reaches the operator, so it resolves false instead of throwing.
 */
export async function reportFums(
  fumsToken: string | null | undefined,
  fetchImpl: FetchLike = globalThis.fetch,
  ids: { deviceId?: string; sessionId?: string; userId?: string } = {},
): Promise<boolean> {
  if (!fumsToken) return false;
  try {
    const params = new URLSearchParams({
      t: fumsToken,
      dId: ids.deviceId ?? "anonymous",
      sId: ids.sessionId ?? "anonymous",
      uId: ids.userId ?? "anonymous",
    });
    const response = await fetchImpl(`${FUMS_URL}?${params}`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
