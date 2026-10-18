// Planning Center Services: bring an upcoming plan into Church Studio as a service, with its
// songs (lyrics from the arrangement) added to the library. The church connects with a
// Personal Access Token (application id + secret) from api.planningcenteronline.com.
//
// Requests go through `get`, which the desktop app routes via Rust (Planning Center does not
// accept requests from a web page); tests pass their own.

import { parseLyrics } from "../domain/song";
import { orderFromNames } from "../domain/song-order";
import type { PresentationItem, Service, ServiceSection, Song, SongSection } from "../domain/types";

export const PCO_BASE = "https://api.planningcenteronline.com/services/v2";

export type PcoGet = (url: string) => Promise<unknown>;

export type PcoServiceType = { id: string; name: string };
export type PcoPlan = { id: string; serviceTypeId: string; title: string; dates: string; sortDate: string; items: number };

type JsonApi = {
  data: Array<{ id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: { id: string; type: string } | null }> }>;
  included?: Array<{ id: string; type: string; attributes: Record<string, unknown> }>;
};

export class PcoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PcoError";
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

async function getJson(get: PcoGet, url: string): Promise<JsonApi> {
  const body = (await get(url)) as Partial<JsonApi> & { errors?: Array<{ status?: string; title?: string }> };
  if (body?.errors?.length) {
    const status = body.errors[0]?.status;
    throw new PcoError(
      status === "401" ? "Planning Center did not accept the token. Check the application id and secret." : status === "403" ? "This token cannot read Services. Give it access in Planning Center." : body.errors[0]?.title || "Planning Center returned an error.",
    );
  }
  if (!Array.isArray(body?.data)) throw new PcoError("Planning Center sent something unexpected. Try again.");
  return { data: body.data, included: body.included ?? [] };
}

export async function listServiceTypes(get: PcoGet): Promise<PcoServiceType[]> {
  const body = await getJson(get, `${PCO_BASE}/service_types?per_page=50`);
  return body.data.map((entry) => ({ id: entry.id, name: text(entry.attributes.name) || "Service" }));
}

/** Upcoming plans for one service type, soonest first. */
export async function listPlans(get: PcoGet, serviceTypeId: string): Promise<PcoPlan[]> {
  const body = await getJson(get, `${PCO_BASE}/service_types/${encodeURIComponent(serviceTypeId)}/plans?filter=future&order=sort_date&per_page=12`);
  return body.data.map((entry) => ({
    id: entry.id,
    serviceTypeId,
    title: text(entry.attributes.title),
    dates: text(entry.attributes.dates),
    sortDate: text(entry.attributes.sort_date),
    items: Number(entry.attributes.items_count) || 0,
  }));
}

export type PlanImport = { service: Service; songs: Song[] };

/**
 * A plan becomes a service: headers become sections, songs become song items (with the song
 * and its lyrics), other items become announcement slides carrying their title and notes.
 * `known` finds a song already in the library (by CCLI number or title) so it is reused.
 */
export async function importPlan(
  get: PcoGet,
  plan: PcoPlan,
  known: (song: { title: string; ccli: string }) => Song | undefined,
  newId: () => string = () => crypto.randomUUID(),
  now = new Date(),
): Promise<PlanImport> {
  const base = `${PCO_BASE}/service_types/${encodeURIComponent(plan.serviceTypeId)}/plans/${encodeURIComponent(plan.id)}`;
  const body = await getJson(get, `${base}/items?include=song,arrangement&per_page=100`);
  const included = new Map((body.included ?? []).map((entry) => [`${entry.type}:${entry.id}`, entry.attributes]));
  const sections: ServiceSection[] = [];
  const songs: Song[] = [];
  const section = () => {
    if (sections.length === 0) sections.push({ id: newId(), name: "Service", items: [] });
    return sections[sections.length - 1]!;
  };
  const items = [...body.data].sort((a, b) => Number(a.attributes.sequence ?? 0) - Number(b.attributes.sequence ?? 0));
  for (const item of items) {
    const kind = text(item.attributes.item_type);
    const title = text(item.attributes.title).trim() || "Item";
    if (kind === "header") {
      sections.push({ id: newId(), name: title, items: [] });
      continue;
    }
    if (kind === "song") {
      const songRef = item.relationships?.song?.data;
      const arrangementRef = item.relationships?.arrangement?.data;
      const songInfo = songRef ? included.get(`Song:${songRef.id}`) : undefined;
      const arrangement = arrangementRef ? included.get(`Arrangement:${arrangementRef.id}`) : undefined;
      const songTitle = text(songInfo?.title).trim() || title;
      const ccli = text(songInfo?.ccli_number).replace(/\D/g, "");
      let song = known({ title: songTitle, ccli }) ?? songs.find((entry) => (ccli && entry.ccli === ccli) || entry.title.toLowerCase() === songTitle.toLowerCase());
      if (!song) {
        const lyrics = text(arrangement?.lyrics);
        const parsed = parseLyrics(lyrics.trim() ? lyrics : `${songTitle}\n\nVerse 1\n(Add the lyrics in Church Studio)`, newId);
        song = {
          id: newId(),
          title: songTitle,
          author: text(songInfo?.author),
          sections: parsed.sections,
          ...(orderOf(arrangement, parsed.sections) ? { order: orderOf(arrangement, parsed.sections) } : {}),
          ...(ccli ? { ccli } : {}),
          ...(text(songInfo?.copyright) ? { copyright: text(songInfo?.copyright) } : {}),
          folder: "Planning Center",
        };
        songs.push(song);
      }
      const first = song.sections[0];
      if (first) section().items.push({ id: newId(), kind: "lyric", title: song.title, lyric: { songId: song.id, sectionId: first.id } });
      continue;
    }
    // Media, regular items and notes: a slide with the title and description, ready to edit.
    const description = text(item.attributes.description).trim();
    const slide: PresentationItem = { id: newId(), kind: "announcement", title, announcement: { heading: title, body: description } };
    section().items.push(slide);
  }
  const name = [plan.title, plan.dates].filter(Boolean).join(" · ") || "Planning Center plan";
  return { service: { id: newId(), name, sections, updatedAt: now.toISOString() }, songs };
}

/** The arrangement's sequence ("Verse 1", "Chorus", …) as the song's order. */
function orderOf(arrangement: Record<string, unknown> | undefined, sections: SongSection[]): string[] | undefined {
  const sequence = arrangement?.sequence;
  if (!Array.isArray(sequence)) return undefined;
  return orderFromNames(sections, sequence.filter((name): name is string => typeof name === "string"));
}

/** HTTP Basic credentials for a Personal Access Token. */
export function pcoAuthorization(appId: string, secret: string): string {
  const raw = `${appId.trim()}:${secret.trim()}`;
  return `Basic ${typeof btoa === "function" ? btoa(raw) : Buffer.from(raw).toString("base64")}`;
}
