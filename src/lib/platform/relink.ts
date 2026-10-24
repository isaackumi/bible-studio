// After a move to a new computer, the library still holds the old computer's media addresses
// (C:\Users\old\…\media\<id>.png, as an asset address). Media keeps its id across the move, so
// each address is rebuilt from the id for this computer's media folder.

/** The media folder's file name in an address, whatever the separators (plain or URL-encoded). */
const MEDIA_FILE = /(?:\/|%2F|%5C|\\)media(?:\/|%2F|%5C|\\)([0-9a-f-]{36})\.([a-z0-9]{2,5})/i;

/** A copy of `value` with every media address this computer knows rewritten by `urlFor`. */
export function relinkMedia<T>(value: T, urlFor: (id: string) => string | null): T {
  return walk(value, urlFor) as T;
}

function walk(value: unknown, urlFor: (id: string) => string | null): unknown {
  if (typeof value === "string") {
    const found = MEDIA_FILE.exec(value);
    return (found && urlFor(found[1]!.toLowerCase())) ?? value;
  }
  if (Array.isArray(value)) return value.map((entry) => walk(entry, urlFor));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = walk(entry, urlFor);
  const url = typeof out.assetId === "string" ? urlFor(out.assetId) : null;
  if (url) {
    if ("imageUrl" in out) out.imageUrl = url;
    if ("videoUrl" in out) out.videoUrl = url;
  }
  return out;
}
