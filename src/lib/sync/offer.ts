// Pushing to the computers nearby: one computer offers songs, services and files, and someone at
// each of the others accepts them, all or some. Nothing is overwritten: a record that differs here
// is kept beside this computer's own, marked with where it came from, as cloud sync does. The
// transport is Nearby (src-tauri/src/nearby.rs); this is the part that decides.

import { msg } from "../i18n/core";
import { hashDoc, isSharedCol, mediaIdsIn, writeRecord, type Apply, type SyncRecord } from "./records";

export type OfferItem = SyncRecord & { name: string };
/** A file in Media. It stays on the sender; the receiver fetches it by id on accepting. */
export type OfferFile = { id: string; name: string; kind: string };
export type Offer = { id: string; from: string; at: number; items: OfferItem[]; files: OfferFile[] };

/** What was last pushed from here: each record's hash, by "col/id". */
export type Pushed = Record<string, string>;

const key = (record: { col: string; id: string }) => `${record.col}/${record.id}`;

/** A record's name, as a list shows it. */
export function recordName(record: SyncRecord): string {
  const doc = record.doc as { title?: unknown; name?: unknown };
  const name = typeof doc?.title === "string" && doc.title ? doc.title : doc?.name;
  return typeof name === "string" && name ? name : "Untitled";
}

/** What kind of thing it is, for a list (a source string: the list translates it). */
export function recordKind(kind: string): string {
  const kinds: Record<string, string> = { song: msg("Song"), service: msg("Service"), sermon: msg("Sermon"), theme: msg("Theme"), image: msg("Picture"), video: msg("Video"), audio: msg("Audio") };
  return kinds[kind] ?? msg("Item");
}

function updatedAt(doc: unknown): number {
  const at = (doc as { updatedAt?: unknown } | null)?.updatedAt;
  const parsed = typeof at === "string" ? Date.parse(at) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * What can be pushed: everything changed since the last push. On a first push there is no record of
 * one, so only what was edited since `since`: a library of a thousand songs is not a useful list.
 */
export function changedSince(records: SyncRecord[], pushed: Pushed | null, since: number): OfferItem[] {
  return records
    .filter((record) => isSharedCol(record.col))
    .filter((record) => (pushed ? pushed[key(record)] !== hashDoc(record.doc) : updatedAt(record.doc) >= since))
    .map((record) => ({ ...record, name: recordName(record) }))
    .sort((a, b) => updatedAt(b.doc) - updatedAt(a.doc) || a.name.localeCompare(b.name));
}

/** What was just pushed joins what had been before. */
export function markPushed(pushed: Pushed | null, items: SyncRecord[]): Pushed {
  const next = { ...pushed };
  for (const item of items) next[key(item)] = hashDoc(item.doc);
  return next;
}

/** An offer as it came off the network, or null when it is not one. Only records that can be shared are kept. */
export function parseOffer(text: string): Offer | null {
  try {
    const raw = JSON.parse(text) as Partial<Offer>;
    if (typeof raw?.id !== "string" || !raw.id || !Array.isArray(raw.items)) return null;
    const items = raw.items.filter((item) => isRecord(item) && typeof item.id === "string" && !!item.id && typeof item.col === "string" && isSharedCol(item.col) && isRecord(item.doc) && item.doc.id === item.id);
    const files = (Array.isArray(raw.files) ? raw.files : []).filter((file) => isRecord(file) && typeof file.id === "string" && !!file.id);
    if (!items.length && !files.length) return null;
    return {
      id: raw.id,
      from: typeof raw.from === "string" && raw.from ? raw.from.slice(0, 60) : "Another computer",
      at: Number(raw.at) || 0,
      items: items.map((item) => ({ ...item, name: String(item.name || recordName(item)).slice(0, 200) })),
      files: files.map((file) => ({ id: file.id, name: String(file.name || "File").slice(0, 200), kind: String(file.kind || "") })),
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export type Arrival = "new" | "same" | "different";

/** How an offered record stands against this computer's copy. */
export function arrival(item: SyncRecord, local: Map<string, unknown>): Arrival {
  const mine = local.get(key(item));
  if (mine === undefined) return "new";
  return hashDoc(mine) === hashDoc(item.doc) ? "same" : "different";
}

export type Accepted = { added: number; kept: number; same: number; files: number; missing: number };

/**
 * Accept the chosen part of an offer. A new record lands as it is; one that differs lands beside
 * this computer's own, marked `(from Laptop)`; one already the same is left. Then the files: those
 * chosen and those the accepted records use, from the computers nearby.
 */
export async function acceptOffer(
  offer: Offer,
  chosen: Set<string>,
  local: Map<string, unknown>,
  deps: { apply: Apply; have: (id: string) => boolean; fetch: (id: string) => Promise<boolean> },
): Promise<Accepted> {
  const result: Accepted = { added: 0, kept: 0, same: 0, files: 0, missing: 0 };
  const taken = offer.items.filter((item) => chosen.has(key(item)));
  for (const item of taken) {
    const state = arrival(item, local);
    if (state === "same") {
      result.same += 1;
    } else if (state === "different") {
      await deps.apply.copy(item.col, item.doc, `(from ${offer.from})`);
      result.kept += 1;
    } else {
      await writeRecord({ col: item.col, id: item.id, at: offer.at, doc: item.doc }, deps.apply);
      result.added += 1;
    }
  }
  const files = new Set([...offer.files.filter((file) => chosen.has(`file/${file.id}`)).map((file) => file.id), ...mediaIdsIn(taken)]);
  for (const id of files) {
    if (deps.have(id)) continue;
    const got = await deps.fetch(id).catch(() => false);
    if (got) result.files += 1;
    else result.missing += 1;
  }
  return result;
}
