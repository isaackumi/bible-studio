// Song packs: optional collections shipped in static/song-packs/ (see the README there),
// installed into a library folder on request.

export type SongPack = { id: string; name: string; folder: string; file: string; description: string; license: string };

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Valid packs from index.json; a pack needs an id, a name and a .zip file name without a path. */
export function sanitizeSongPacks(value: unknown): SongPack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const packs: SongPack[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = text(record.id, 80);
    const name = text(record.name, 80);
    const file = text(record.file, 120);
    if (!id || !name || !/^[\w.-]+\.zip$/i.test(file) || seen.has(id)) continue;
    seen.add(id);
    packs.push({ id, name, folder: text(record.folder, 60) || name, file, description: text(record.description, 300), license: text(record.license, 80) });
  }
  return packs;
}
