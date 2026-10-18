// Going live from Church Studio itself: where the stream goes (YouTube, Facebook, any RTMP
// service), its stream key, the picture quality, and where recordings are kept. The key stays on
// this computer; it is only ever sent to the stream server it belongs to.

export type StreamService = "youtube" | "facebook" | "custom";

export type BroadcastQuality = "720p" | "1080p" | "1080p60";

export type BroadcastSettings = {
  service: StreamService;
  /** The server address for "custom" (rtmp:// or rtmps://…/app). */
  server: string;
  key: string;
  quality: BroadcastQuality;
  sound: boolean;
  /** Where recordings go; empty: Movies/Church Studio. */
  recordFolder: string;
};

export const STREAM_SERVERS: Record<Exclude<StreamService, "custom">, string> = {
  youtube: "rtmps://a.rtmps.youtube.com/live2",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp",
};

export const QUALITIES: Record<BroadcastQuality, { width: number; height: number; fps: number; videoKbps: number }> = {
  "720p": { width: 1280, height: 720, fps: 30, videoKbps: 3000 },
  "1080p": { width: 1920, height: 1080, fps: 30, videoKbps: 5000 },
  "1080p60": { width: 1920, height: 1080, fps: 60, videoKbps: 8000 },
};

export function defaultBroadcast(): BroadcastSettings {
  return { service: "youtube", server: "", key: "", quality: "1080p", sound: true, recordFolder: "" };
}

export function sanitizeBroadcast(value: unknown): BroadcastSettings {
  const base = defaultBroadcast();
  const record = value && typeof value === "object" ? (value as Partial<BroadcastSettings>) : {};
  return {
    service: record.service === "facebook" || record.service === "custom" ? record.service : base.service,
    server: typeof record.server === "string" ? record.server.trim().slice(0, 300) : "",
    key: typeof record.key === "string" ? record.key.trim().slice(0, 300) : "",
    quality: record.quality && record.quality in QUALITIES ? record.quality : base.quality,
    sound: record.sound !== false,
    recordFolder: typeof record.recordFolder === "string" ? record.recordFolder.trim().slice(0, 400) : "",
  };
}

/** The full address the helper publishes to (server + "/" + key), or null with what is missing. */
export function streamTarget(settings: BroadcastSettings): { url: string } | { missing: "server" | "key" } {
  const server = (settings.service === "custom" ? settings.server : STREAM_SERVERS[settings.service]).trim().replace(/\/+$/, "");
  if (!/^rtmps?:\/\/[^/\s@]+\/\S+$/i.test(server)) return { missing: "server" };
  const key = settings.key.trim().replace(/^\/+/, "");
  if (!key || /\s/.test(key)) return { missing: "key" };
  return { url: `${server}/${key}` };
}

/** "1:02:05" for how long the stream or recording has run. */
export function elapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** A date and time for the file name: "2026-10-18 10-30". */
export function recordingStamp(at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}-${pad(at.getMinutes())}`;
}
