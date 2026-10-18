// NDI sources in scenes: the desktop app runs a small hub on this computer that receives NDI
// video and serves it as a picture stream any screen can show. Keep the port in step with
// HUB_PORT in src-tauri/src/ndi.rs.

import type { PresentationModel } from "./types";

export const NDI_HUB = "http://127.0.0.1:47129";

/** The picture stream for an NDI source, by its full NDI name ("MACHINE (Name)"). */
export function ndiStreamUrl(name: string): string {
  return `${NDI_HUB}/ndi/${encodeURIComponent(name)}.mjpg`;
}

/** "MACHINE (Camera 1)" → "Camera 1", for labels. */
export function ndiShortName(name: string): string {
  return name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
}

/** The NDI sources on the network now; null when the hub is not running (no NDI, or a browser). */
export async function listNdiSources(fetcher: typeof fetch = fetch): Promise<string[] | null> {
  try {
    const response = await fetcher(`${NDI_HUB}/sources`, { cache: "no-store" });
    if (!response.ok) return null;
    const names: unknown = await response.json();
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : null;
  } catch {
    return null;
  }
}

/** The words a key output shows: a small line (the reference) and the text. */
export type KeyWords = { cue: string; body: string };

const WORD_LAYOUTS = new Set(["scripture", "lyrics", "title", "lower-third"]);

/**
 * The words on Program for the transparent key output, or null when nothing worded is showing
 * (black, a picture, a camera, a video). In a look, the first visible scripture or lyrics region
 * gives the words.
 */
export function keyWords(model: Pick<PresentationModel, "layout" | "reference" | "lines" | "layers">): KeyWords | null {
  if (model.layout === "composition") {
    const layer = [...(model.layers ?? [])]
      .filter((layer) => layer.opacity > 0 && WORD_LAYOUTS.has(layer.model.layout))
      .sort((a, b) => (a.model.layout === "scripture" || a.model.layout === "lyrics" ? 0 : 1) - (b.model.layout === "scripture" || b.model.layout === "lyrics" ? 0 : 1) || b.zIndex - a.zIndex)[0];
    return layer ? keyWords(layer.model) : null;
  }
  if (!WORD_LAYOUTS.has(model.layout)) return null;
  const body = model.lines
    .map((line) => (line.marker ? `${line.marker} ${line.text}` : line.text).trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 600);
  const cue = (model.reference ?? "").trim().slice(0, 120);
  return body || cue ? { cue, body } : null;
}
