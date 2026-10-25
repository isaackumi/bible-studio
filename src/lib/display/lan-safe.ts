// A screen sent to a TV browser over the church's own Wi-Fi (the desk's local server, not the
// internet): this computer's pictures are fetched from the desk itself (/media/<token>, which the
// desk serves only for files in Media), and anything else that only works here is left out, as
// remoteSafe does for displays over the internet.

import { remoteSafe } from "./remote-safe";

/** Tauri's address for a file on this computer: asset://localhost/<path> (http://asset.localhost on Windows). */
const ASSET = /^(?:asset:\/\/localhost|https?:\/\/asset\.localhost)\/(.+)$/i;

/** The file's path as base64url (UTF-8), for a URL the desk's local server reads back. */
export function lanMediaToken(path: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(path)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function served(url: string): string | null {
  const match = ASSET.exec(url);
  if (!match) return null;
  try {
    return `/media/${lanMediaToken(decodeURIComponent(match[1]!))}`;
  } catch {
    return null;
  }
}

export function lanSafe<T>(value: T): T {
  if (typeof value === "string") return (served(value) ?? remoteSafe(value)) as T;
  if (Array.isArray(value)) return value.map(lanSafe) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      // A CSS background naming a picture here: the desk's address for it.
      out[key] =
        typeof entry === "string" && /url\(/.test(entry)
          ? remoteSafe(entry.replace(/url\((["']?)([^)"']+)\1\)/g, (whole, quote: string, url: string) => {
              const local = served(url);
              return local ? `url(${quote}${local}${quote})` : whole;
            }))
          : lanSafe(entry);
    }
    return out as T;
  }
  return value;
}
