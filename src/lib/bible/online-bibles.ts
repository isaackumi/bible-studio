// Licensed translations through the church's own API.Bible key, presented to the rest of the app
// as ordinary translations with ids like "api:de4e12af7f28f599-02". Text is fetched when shown
// and kept in memory only (API.Bible terms); search and voice use a bundled translation's words.

import type { TranslationInfo } from "../domain/types";
import { fetchOnlineChapter, fetchOnlinePassage, reportFums, clearOnlineCache, type OnlineBible } from "./online";

export const ONLINE_PREFIX = "api:";
/** Search and voice matching read this bundled text when the shown translation is online. */
export const WORDS_TRANSLATION = "kjv";

export type OnlineBibleChoice = Pick<OnlineBible, "id" | "abbreviation" | "name" | "language">;

let key = "";
let chosen: OnlineBibleChoice[] = [];
const copyrights = new Map<string, string>();

export function configureOnlineBibles(nextKey: string, bibles: OnlineBibleChoice[]) {
  if (nextKey !== key) clearOnlineCache();
  key = nextKey.trim();
  chosen = bibles;
}

export function isOnlineTranslation(id: string): boolean {
  return id.startsWith(ONLINE_PREFIX);
}

export function onlineTranslations(): TranslationInfo[] {
  if (!key) return [];
  return chosen.map((bible) => ({
    id: `${ONLINE_PREFIX}${bible.id}`,
    name: bible.name,
    abbreviation: bible.abbreviation || bible.name,
    licenseNote: "Licensed through API.Bible. Needs the internet.",
    source: "api.bible",
  }));
}

function bibleId(translationId: string): string {
  return translationId.slice(ONLINE_PREFIX.length);
}

function remember(translationId: string, copyright: string, fums: string | null) {
  if (copyright) copyrights.set(translationId, copyright);
  void reportFums(fums);
}

export async function onlinePassage(translationId: string, bookOrd: number, chapter: number, start: number, end: number) {
  const passage = await fetchOnlinePassage(key, bibleId(translationId), bookOrd, chapter, start, end);
  remember(translationId, passage.copyright, passage.fums);
  return passage.verses;
}

export async function onlineChapter(translationId: string, bookOrd: number, chapter: number) {
  const passage = await fetchOnlineChapter(key, bibleId(translationId), bookOrd, chapter);
  remember(translationId, passage.copyright, passage.fums);
  return passage.verses;
}

/**
 * The line under a verse. Licensed text carries its copyright notice (API.Bible terms), kept
 * short enough to sit on screen; bundled public-domain text shows the translation name.
 */
export function attributionFor(translation: TranslationInfo | undefined): string | null {
  if (!translation) return null;
  if (!isOnlineTranslation(translation.id)) return translation.name;
  const copyright = copyrights.get(translation.id);
  if (!copyright) return translation.abbreviation;
  const short = copyright.length > 110 ? `${copyright.slice(0, 107).trimEnd()}…` : copyright;
  return `${translation.abbreviation} · ${short}`;
}

export function sanitizeOnlineBibles(value: unknown): { key: string; bibles: OnlineBibleChoice[] } {
  const record = value && typeof value === "object" ? (value as { key?: unknown; bibles?: unknown }) : {};
  const text = (entry: unknown, max: number) => (typeof entry === "string" ? entry.slice(0, max) : "");
  const bibles = Array.isArray(record.bibles)
    ? record.bibles
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string")
        .slice(0, 20)
        .map((entry) => ({ id: text(entry.id, 80), abbreviation: text(entry.abbreviation, 20), name: text(entry.name, 120), language: text(entry.language, 60) }))
    : [];
  return { key: text(record.key, 200).trim(), bibles };
}
