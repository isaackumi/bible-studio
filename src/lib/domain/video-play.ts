// How a video plays in a service: where it starts and stops (trim), and what happens at its end.
// "loop-part" turns a part of the service into a video playlist: each video hands over to the
// next in its part, and the last one back to the first (walk-in loops, a countdown reel).

export type VideoEnd = "hold" | "loop" | "next" | "clear" | "loop-part";

export const VIDEO_ENDS: VideoEnd[] = ["hold", "loop", "next", "loop-part", "clear"];

export type VideoTrim = { start?: number; stop?: number };

/** The end action of a saved item; older items only had "loop". */
export function videoEnd(video: { loop?: boolean; end?: VideoEnd }): VideoEnd {
  if (video.end && VIDEO_ENDS.includes(video.end)) return video.end;
  return video.loop ? "loop" : "hold";
}

/** Clean trim points: start at or after 0, stop after start (or none). */
export function cleanTrim(trim: VideoTrim): VideoTrim {
  const start = typeof trim.start === "number" && Number.isFinite(trim.start) && trim.start > 0 ? Math.round(trim.start * 10) / 10 : undefined;
  const stop = typeof trim.stop === "number" && Number.isFinite(trim.stop) && trim.stop > (start ?? 0) + 0.5 ? Math.round(trim.stop * 10) / 10 : undefined;
  return { ...(start !== undefined ? { start } : {}), ...(stop !== undefined ? { stop } : {}) };
}

/** Where the player should be for a clock position, honoring trim and looping. */
export function playPosition(target: number, options: VideoTrim & { loop: boolean; duration: number }): number {
  const start = options.start ?? 0;
  const end = options.stop ?? (options.duration > 0 ? options.duration : Infinity);
  if (!Number.isFinite(end) || end <= start) return Math.max(start, target);
  if (options.loop) {
    const span = end - start;
    return start + ((((target - start) % span) + span) % span);
  }
  return Math.min(Math.max(start, target), end);
}

/** The second the video is over (its stop point or its length), or null while the length is unknown. */
export function endPoint(trim: VideoTrim, duration: number): number | null {
  if (trim.stop !== undefined) return trim.stop;
  return duration > 0 ? duration : null;
}

/** "1:05" ⇄ 65 for the trim fields. Empty or unreadable text clears the point. */
export function readClock(text: string): number | undefined {
  const parts = text.trim().split(":").map((part) => part.trim());
  if (!parts[0]) return undefined;
  if (parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function clockText(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
