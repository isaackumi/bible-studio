// An order of service pasted from anywhere (the bulletin, an email, a WhatsApp message) as a draft
// service: each part of the service a section, the songs the library has as song items, every Bible
// reference as a reading, and the lines under Announcements as announcements. Nothing is guessed that
// the library cannot back up: a song it does not have is listed for the operator, never made up.
// The draft is a real Service; the desk shows it for review before anything is saved.

import { CANON, parseReference, type CanonBook } from "../bible/reference";
import { referencesIn } from "./sermon";
import type { PresentationItem, Service, ServiceSection, Song } from "./types";

export type ServiceDraft = {
  service: Service;
  /** Song-like lines the library has no song for, by the part they were under. */
  missingSongs: Array<{ title: string; part: string }>;
  /** What was found, for the review: songs matched, readings, announcements. */
  counts: { parts: number; songs: number; readings: number; announcements: number };
};

/** A whole chapter ("Psalm 23"): every verse, as the passage lookup is a range. */
const WHOLE_CHAPTER = 200;

/** Parts of a service whose lines are songs ("Call to Worship" is a part of its own, not songs). */
const SONG_PART = /\b(praise|worship|songs?|hymns?|choir|special number|ministration)\b/i;
const isSongPart = (name: string) => SONG_PART.test(name) && !/\bcall to worship\b/i.test(name);
/** The usual parts of a service: a line that starts with one is a new part, under whatever came before. */
const PART_WORDS =
  /^(?:welcome|call to worship|opening|closing|praise|worship|prayers?|intercession|invocation|scripture|bible|(?:old|new) testament|reading|lesson|sermon|message|preaching|the word|word of|announcements?|notices?|offering|offertory|tithes?|giving|communion|lord'?s supper|benediction|blessing|dismissal|doxology|testimon(?:y|ies)|altar call|baptism|dedication|thanksgiving|choir|special number|hymn|song|children|youth|confession|creed|response|recessional|processional)\b/i;
/** Parts whose lines are announcements. */
const ANNOUNCE_PART = /\b(announcements?|notices?|church news|news)\b/i;

/** Words that start a line without being part of its name: "Song:", "Hymn 12 –". */
const LEAD_WORDS = /^(?:song|hymn(?:\s*(?:no\.?|#)?\s*\d+)?|chorus|worship song)\s*[:\-–—]\s*/i;

/** Bullets, numbering and a clock time at the start of a line: "1.", "•", "-", "10:30", "10.15am". */
const LINE_START = /^(?:[-*•·◦▪–—]+\s*|\(?\d{1,2}[.)]\s+|\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*[-–—]?\s*)+/i;

/** "(20 min)", "– 20 mins", "15 minutes". */
const DURATION = /\s*[(\[]?\s*(\d{1,3})\s*(?:min|mins|minutes)\.?\s*[)\]]?/i;

/** "– Pastor Kojo", " - Elder Mensah", "led by Ama", "by the choir": who leads the part. */
const LEADER = /\s+(?:[-–—]|led by|by)\s+([^-–—():]{2,60})$/i;

/** Lowercase, without punctuation or "the" in front: how a title is matched to the library. */
export const titleKey = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’"“”.,!?;:()]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/^the /, "")
    .trim();

const unquote = (text: string) => text.replace(/^["“'‘]+|["”'’]+$/g, "").trim();

/**
 * A pasted order of service as a draft service. `translationId` is the Bible the readings use;
 * `newId` gives each section and item its id.
 */
export function draftService(
  text: string,
  options: { songs: Song[]; translationId: string; newId: () => string; now?: Date; books?: CanonBook[]; name?: string },
): ServiceDraft {
  const books = options.books ?? CANON;
  const byTitle = new Map(options.songs.map((song) => [titleKey(song.title), song]));
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: ServiceSection[] = [];
  const missingSongs: ServiceDraft["missingSongs"] = [];
  const counts = { parts: 0, songs: 0, readings: 0, announcements: 0 };
  let name = options.name?.trim() ?? "";

  const current = () => {
    if (!sections.length) sections.push({ id: options.newId(), name: "Service", items: [] });
    return sections[sections.length - 1]!;
  };

  const songItem = (song: Song): PresentationItem | null => {
    const first = song.order?.[0] ? song.sections.find((section) => section.id === song.order![0]) : song.sections[0];
    if (!first) return null;
    counts.songs += 1;
    return { id: options.newId(), kind: "lyric", title: song.title, lyric: { songId: song.id, sectionId: first.id } };
  };

  const readings = (line: string): PresentationItem[] =>
    referencesIn(line, books).flatMap((span) => {
      const parsed = parseReference(span.reference, books);
      if (!parsed) return [];
      counts.readings += 1;
      const start = parsed.startVerse ?? 1;
      const end = parsed.startVerse ? (parsed.endVerse ?? parsed.startVerse) : WHOLE_CHAPTER;
      return [{ id: options.newId(), kind: "bible", title: span.reference, bible: { translationId: options.translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: start, endVerse: end, reference: span.reference } }];
    });

  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const indented = /^\s+\S/.test(raw) || /^\s*[-*•·◦▪]\s/.test(raw);
    let line = raw.trim().replace(LINE_START, "").trim();
    if (!line) continue;

    // The first line names the service when it says so ("Sunday Service — 27 October").
    if (!name && index === lines.findIndex((entry) => entry.trim()) && /\bservice\b/i.test(line) && !referencesIn(line, books).length) {
      name = line.slice(0, 80);
      continue;
    }

    const asSong = unquote(line.replace(LEAD_WORDS, ""));
    const song = byTitle.get(titleKey(asSong)) ?? byTitle.get(titleKey(asSong.replace(DURATION, "").replace(LEADER, "")));
    const section = sections[sections.length - 1];

    // A song the library has: an item in the part it is under, wherever it is written.
    if (song) {
      const item = songItem(song);
      if (item) current().items.push(item);
      continue;
    }

    const found = readings(line);
    // Under a part: a line of its own (indented, or under songs or announcements) is an item, not a new part.
    const startsPart = !indented && PART_WORDS.test(line) && !LEAD_WORDS.test(line);
    if (section && !startsPart && (indented || isSongPart(section.name) || ANNOUNCE_PART.test(section.name))) {
      if (found.length) {
        section.items.push(...found);
        continue;
      }
      if (isSongPart(section.name) || LEAD_WORDS.test(line)) {
        missingSongs.push({ title: asSong, part: section.name });
        continue;
      }
      if (ANNOUNCE_PART.test(section.name) || indented) {
        counts.announcements += 1;
        section.items.push({ id: options.newId(), kind: "announcement", title: line.slice(0, 80), announcement: { heading: line.slice(0, 120), body: "" } });
        continue;
      }
    }

    // A new part of the service: its name, who leads it and how long it is, and any readings on the line.
    let minutes: number | undefined;
    const duration = DURATION.exec(line);
    if (duration) {
      minutes = Math.min(240, Number(duration[1]));
      line = line.replace(DURATION, "").trim();
    }
    let rest = line;
    for (const span of referencesIn(line, books)) rest = rest.replace(span.text, "");
    rest = rest.replace(/[(\[]\s*[)\]]/g, "").replace(/\s*[:,;]\s*$/, "").replace(/\s{2,}/g, " ").trim();
    let leader: string | undefined;
    const led = LEADER.exec(rest);
    if (led) {
      leader = led[1]!.trim();
      rest = rest.slice(0, led.index).trim();
    }
    // "Closing Hymn: Blessed Assurance": the part, with the library's song in it.
    const items = [...found];
    const named = /^([^:]{2,40}):\s*(.+)$/.exec(rest);
    const titled = named ? byTitle.get(titleKey(unquote(named[2]!))) : undefined;
    if (named && titled) {
      const item = songItem(titled);
      if (item) items.unshift(item);
      rest = named[1]!.trim();
    }
    const partName = unquote(rest.replace(/\s*[:\-–—]\s*$/, "").replace(/:\s*["“]?([^"”]*)["”]?$/, ": $1").trim()) || found[0]?.title || "Part";
    sections.push({ id: options.newId(), name: partName.slice(0, 80), items, ...(minutes ? { minutes } : {}), ...(leader ? { leader } : {}) });
  }

  counts.parts = sections.length;
  const now = options.now ?? new Date();
  return {
    service: { id: options.newId(), name: name || "Sunday Service", sections, updatedAt: now.toISOString() },
    missingSongs,
    counts,
  };
}
