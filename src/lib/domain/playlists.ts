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
  /** The sound output the music plays through (a device id); "" is the computer's default. */
  outputId: string;
  /** Where the congregation hears Church Studio (desktop): "auto", or a chosen output's id (audio/outputs.ts). */
  audience: string;
  /** The chosen output's name, to say which one is missing while it is unplugged. */
  audienceName: string;
  /** Play every track at a similar loudness (loud tracks are turned down to match). */
  even: boolean;
  /** Seconds one track fades into the next; 0 plays them back to back. */
  crossfade: number;
  /** Play a playlist in a new random order each time. */
  shuffle: boolean;
  /** Measured loudness of each track (dB, from audio/loudness.ts), by media id. */
  levels: Record<string, number>;
  /** The sound pad: short clips played with one click. */
  pad: PadButton[];
  /** Stop a song's backing track when the song leaves the screen. */
  stopTrackWithSong: boolean;
};

/** A sound pad button: one audio file from the media library, with a short name. */
export type PadButton = { id: string; assetId: string; label: string };

const MAX_PAD = 24;
export const MAX_CROSSFADE = 12;

const MAX_LISTS = 50;
const MAX_TRACKS = 500;

export function defaultPlaylists(): Playlist[] {
  return [{ id: "walk-in", name: "Walk-in music", trackIds: [], loop: true }];
}

export function defaultAudioSettings(): AudioSettings {
  return { volume: 0.8, fadeOnLive: true, outputId: "", audience: "auto", audienceName: "", even: true, crossfade: 3, shuffle: false, levels: {}, pad: [], stopTrackWithSong: true };
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
  const crossfade = typeof record.crossfade === "number" && Number.isFinite(record.crossfade) ? Math.min(MAX_CROSSFADE, Math.max(0, Math.round(record.crossfade))) : 3;
  const levels: Record<string, number> = {};
  if (record.levels && typeof record.levels === "object") {
    for (const [id, db] of Object.entries(record.levels).slice(0, 2000)) {
      if (id && typeof db === "number" && Number.isFinite(db) && db <= 0 && db >= -90) levels[id] = Math.round(db * 10) / 10;
    }
  }
  const seen = new Set<string>();
  const pad = (Array.isArray(record.pad) ? record.pad : []).flatMap((raw): PadButton[] => {
    const button = raw && typeof raw === "object" ? (raw as Partial<PadButton>) : null;
    if (!button || typeof button.id !== "string" || !button.id || seen.has(button.id) || typeof button.assetId !== "string" || !button.assetId) return [];
    seen.add(button.id);
    const label = typeof button.label === "string" && button.label.trim() ? button.label.trim().slice(0, 30) : "Sound";
    return [{ id: button.id, assetId: button.assetId, label }];
  });
  return {
    volume,
    fadeOnLive: record.fadeOnLive !== false,
    outputId: typeof record.outputId === "string" ? record.outputId.slice(0, 200) : "",
    audience: typeof record.audience === "string" && record.audience.trim() ? record.audience.slice(0, 200) : "auto",
    audienceName: typeof record.audienceName === "string" ? record.audienceName.slice(0, 120) : "",
    even: record.even !== false,
    crossfade,
    shuffle: record.shuffle === true,
    levels,
    pad: pad.slice(0, MAX_PAD),
    stopTrackWithSong: record.stopTrackWithSong !== false,
  };
}

/** A new random order of `count` tracks that starts with `first` (Fisher–Yates). */
export function shuffledOrder(count: number, first = 0, random: () => number = Math.random): number[] {
  const rest = Array.from({ length: count }, (_, n) => n).filter((n) => n !== first);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return count > 0 ? [first, ...rest] : [];
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
