// Audio playlists: walk-in music, backing tracks, an offering song. Tracks are audio files in the
// media library, kept by id; a playlist can loop (walk-in music plays until it is faded out).

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  /** Start again from the first track after the last. */
  loop: boolean;
};

export type AudioSettings = {
  /** 0–1, remembered between services. */
  volume: number;
  /** Fade the music out when something goes live (the service starting). */
  fadeOnLive: boolean;
};

const MAX_LISTS = 50;
const MAX_TRACKS = 500;

export function defaultPlaylists(): Playlist[] {
  return [{ id: "walk-in", name: "Walk-in music", trackIds: [], loop: true }];
}

export function defaultAudioSettings(): AudioSettings {
  return { volume: 0.8, fadeOnLive: true };
}

export function sanitizePlaylists(value: unknown): Playlist[] {
  if (!Array.isArray(value)) return defaultPlaylists();
  const seen = new Set<string>();
  const lists = value.flatMap((raw): Playlist[] => {
    const record = raw && typeof raw === "object" ? (raw as Partial<Playlist>) : null;
    if (!record || typeof record.id !== "string" || !record.id || seen.has(record.id)) return [];
    seen.add(record.id);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 60) : "Playlist";
    const trackIds = Array.isArray(record.trackIds) ? record.trackIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_TRACKS) : [];
    return [{ id: record.id, name, trackIds, loop: record.loop === true }];
  });
  return lists.slice(0, MAX_LISTS);
}

export function sanitizeAudioSettings(value: unknown): AudioSettings {
  const record = value && typeof value === "object" ? (value as Partial<AudioSettings>) : {};
  const volume = typeof record.volume === "number" && Number.isFinite(record.volume) ? Math.min(1, Math.max(0, record.volume)) : 0.8;
  return { volume, fadeOnLive: record.fadeOnLive !== false };
}

export function addTracks(list: Playlist, ids: string[]): Playlist {
  return { ...list, trackIds: [...list.trackIds, ...ids.filter((id) => !list.trackIds.includes(id))].slice(0, MAX_TRACKS) };
}

export function removeTrackAt(list: Playlist, index: number): Playlist {
  return { ...list, trackIds: list.trackIds.filter((_, n) => n !== index) };
}

export function moveTrack(list: Playlist, from: number, to: number): Playlist {
  if (from === to || from < 0 || to < 0 || from >= list.trackIds.length || to >= list.trackIds.length) return list;
  const trackIds = [...list.trackIds];
  const [id] = trackIds.splice(from, 1);
  trackIds.splice(to, 0, id!);
  return { ...list, trackIds };
}

/** The track after (or before) this one; null at the end of a playlist that does not loop. */
export function nextTrackIndex(count: number, index: number, direction: 1 | -1, loop: boolean): number | null {
  if (count === 0) return null;
  const next = index + direction;
  if (next >= 0 && next < count) return next;
  if (!loop) return null;
  return (next + count) % count;
}

/** "3:07", or "1:02:05" past an hour. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
