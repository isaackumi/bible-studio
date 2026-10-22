// A screen sent to other devices (phones and browsers used as displays): addresses that only work on
// the church's computer (its own pictures and videos, files in memory) are left out, so the other
// device draws the words, the theme and the layout without broken pictures. Public web addresses
// (https) stay.

const LOCAL = /^(asset:|https?:\/\/asset\.localhost|blob:|file:|tauri:|data:video|https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/)/i;

export function remoteSafe<T>(value: T): T {
  if (typeof value === "string") return (LOCAL.test(value) ? "" : value) as T;
  if (Array.isArray(value)) return value.map(remoteSafe) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      // A CSS background naming a local picture: keep the rest of it.
      out[key] = typeof entry === "string" && /url\(/.test(entry) ? entry.replace(/url\((["']?)([^)"']+)\1\)/g, (whole, _q, url: string) => (LOCAL.test(url) ? "none" : whole)) : remoteSafe(entry);
    }
    return out as T;
  }
  return value;
}
