// Template packs: more templates, downloaded when a church asks for them. The website has the newest
// list (so a pack can reach every church without a release); the copy shipped with the app
// (static/template-packs) is used when the computer is offline. Which packs were added is kept on
// this computer, and their templates load with the studio's Templates panel.

import { SITE_URL } from "../domain/billing";
import { sanitizeTemplateSpecs, type TemplateSpec } from "../domain/template-kit";

export type TemplatePack = { id: string; name: string; description: string; file: string; count: number };

const ADDED_KEY = "studio.templatePacks";
const REMOTE = `${SITE_URL}/app/template-packs/`;
const LOCAL = "template-packs/";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function sanitizePackIndex(value: unknown): TemplatePack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const id = text(record.id, 60);
    const file = text(record.file, 80);
    if (!/^[a-z0-9-]+$/.test(id) || !/^[a-z0-9-]+\.json$/.test(file) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: text(record.name, 80) || id, description: text(record.description, 300), file, count: Math.max(0, Math.round(Number(record.count) || 0)) }];
  });
}

/** The website's copy first, then the app's own; whichever answers. */
async function fetchJson(path: string): Promise<unknown> {
  for (const base of [REMOTE, LOCAL]) {
    try {
      const response = await fetch(base + path, { cache: "no-cache", signal: AbortSignal.timeout(8000) });
      if (response.ok) return await response.json();
    } catch {
      // Offline, or the site is out of reach: try the next copy.
    }
  }
  return null;
}

export async function loadPackIndex(): Promise<TemplatePack[]> {
  return sanitizePackIndex(await fetchJson("index.json"));
}

export async function loadPack(pack: TemplatePack): Promise<TemplateSpec[]> {
  const raw = (await fetchJson(pack.file)) as { templates?: unknown } | null;
  return sanitizeTemplateSpecs(raw?.templates, `pack:${pack.id}`);
}

export function addedPacks(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ADDED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function setAddedPacks(ids: string[]) {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage is off (a private window): the packs stay added until the studio closes.
  }
}
