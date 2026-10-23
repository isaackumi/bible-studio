import { msg } from "../i18n/core";
import type { ReadyState } from "./readiness";

// Performance: how Church Studio is running on this computer, in the church's words, with what to
// do about anything slow. The figures come from the core (launch times, freezes, memory, space) and
// from the audience window (smoothness); the technical detail behind them goes in the support file.

export type HealthAction = "measure" | "storage" | "open-audience";

export type HealthRow = {
  id: string;
  state: ReadyState | "unknown";
  title: string;
  detail: string;
  values?: Record<string, string | number>;
  action?: { label: string; action: HealthAction };
};

export type HealthTip = { id: string; text: string; values?: Record<string, string | number>; action?: { label: string; action: HealthAction } };

import type { Frames } from "../display/frames";

export { frameStats, type Frames } from "../display/frames";

export type HealthFacts = {
  /** Launch lengths, oldest first (ms). */
  launches: number[];
  /** Freezes in the last 30 days: when (unix seconds), how long, and what was happening. */
  hangs: Array<{ at: number; seconds: number; during: string }>;
  memory: { total: number; available: number } | null;
  libraryFree: number | null;
  frames: Frames | null;
  audienceOpen: boolean;
  /** Space the church could free: the speech model (when Accurate listening is off), the cache, unused media. */
  spare: { model: number; cache: number; unused: number };
  dateText: (unixSeconds: number) => string;
};

const GB = 1_000_000_000;
const gb = (bytes: number) => (bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0);
const mb = (bytes: number) => (bytes >= GB ? `${gb(bytes)} GB` : `${Math.round(bytes / 1_000_000)} MB`);

function launchRow(launches: number[]): HealthRow {
  const last = launches.at(-1);
  if (last === undefined) return { id: "launch", state: "unknown", title: msg("Opening time not known yet"), detail: msg("It is noted from the next time Church Studio opens.") };
  const seconds = (last / 1000).toFixed(1);
  const recent = launches.slice(-5);
  const usual = (recent.reduce((sum, ms) => sum + ms, 0) / recent.length / 1000).toFixed(1);
  const state: ReadyState = last < 8000 ? "ok" : last < 20000 ? "warn" : "fail";
  return { id: "launch", state, title: msg("Opened in {seconds} seconds"), detail: recent.length > 1 ? msg("Usually about {usual} seconds.") : msg("The first time it was noted."), values: { seconds, usual } };
}

function freezeRow(hangs: HealthFacts["hangs"], dateText: HealthFacts["dateText"]): HealthRow {
  if (!hangs.length) return { id: "freezes", state: "ok", title: msg("No freezes in the last 30 days"), detail: msg("Church Studio kept answering the whole time.") };
  const last = hangs.at(-1)!;
  return {
    id: "freezes",
    state: hangs.length > 2 ? "fail" : "warn",
    title: hangs.length === 1 ? msg("1 freeze in the last 30 days") : msg("{n} freezes in the last 30 days"),
    detail: msg("The last on {date}, for {seconds} seconds."),
    values: { n: hangs.length, date: dateText(last.at), seconds: last.seconds },
  };
}

function smoothRow(frames: Frames | null, audienceOpen: boolean): HealthRow {
  if (!frames) {
    return audienceOpen
      ? { id: "smooth", state: "unknown", title: msg("Smoothness not measured yet"), detail: msg("Takes five seconds. Best while a video or moving background is on the screen."), action: { label: msg("Measure"), action: "measure" } }
      : { id: "smooth", state: "unknown", title: msg("Smoothness not measured yet"), detail: msg("Open the audience screen, then measure."), action: { label: msg("Open the audience screen"), action: "open-audience" } };
  }
  const values = { fps: frames.fps, n: frames.hiccups };
  const action = { label: msg("Measure again"), action: "measure" as const };
  if (frames.fps >= 50 && frames.hiccups <= 1) return { id: "smooth", state: "ok", title: msg("The screen runs smoothly"), detail: msg("{fps} frames a second."), values, action };
  return { id: "smooth", state: frames.fps < 30 || frames.hiccups > 8 ? "fail" : "warn", title: msg("The screen stutters a little"), detail: msg("{fps} frames a second, with {n} hiccups."), values, action };
}

function memoryRow(memory: HealthFacts["memory"]): HealthRow | null {
  if (!memory || !memory.total) return null;
  const low = memory.available < 1.5 * GB || memory.available / memory.total < 0.1;
  return { id: "memory", state: low ? "warn" : "ok", title: low ? msg("Memory is running low") : msg("Plenty of memory"), detail: msg("{free} GB of {total} GB free."), values: { free: gb(memory.available), total: gb(memory.total) } };
}

function spaceRow(free: number | null): HealthRow | null {
  if (free === null) return null;
  const state: ReadyState = free < 2 * GB ? "fail" : free < 10 * GB ? "warn" : "ok";
  return { id: "space", state, title: msg("{free} GB free on this computer"), detail: state === "ok" ? msg("Room for pictures, videos and recordings.") : msg("Pictures, videos and recordings need room. Free some up."), values: { free: gb(free) }, action: state === "ok" ? undefined : { label: msg("Free up space"), action: "storage" } };
}

export function healthRows(facts: HealthFacts): HealthRow[] {
  return [launchRow(facts.launches), freezeRow(facts.hangs, facts.dateText), smoothRow(facts.frames, facts.audienceOpen), memoryRow(facts.memory), spaceRow(facts.libraryFree)].filter((row): row is HealthRow => row !== null);
}

/** What the church can do, most useful first. */
export function healthTips(facts: HealthFacts): HealthTip[] {
  const tips: HealthTip[] = [];
  const during = facts.hangs.map((hang) => hang.during.toLowerCase()).join(" ");
  if (facts.hangs.length) {
    if (/import|video|picture|media/.test(during)) tips.push({ id: "freeze-import", text: msg("Bring in pictures and videos before the service, not during it.") });
    if (/bible/.test(during)) tips.push({ id: "freeze-bible", text: msg("Install Bibles before the service, not during it.") });
    tips.push({ id: "freeze-restart", text: msg("Restart Church Studio before the service. If freezes keep happening, save a support file and send it to us.") });
  }
  const last = facts.launches.at(-1);
  if (last !== undefined && last >= 8000) tips.push({ id: "slow-launch", text: msg("Opening was slow. Restart the computer before the service, and close apps you don't need.") });
  if (facts.frames && (facts.frames.fps < 50 || facts.frames.hiccups > 1)) tips.push({ id: "stutter", text: msg("For a smoother screen, use 1080p videos rather than 4K, and close other apps while presenting.") });
  if (facts.memory && facts.memory.total && (facts.memory.available < 1.5 * GB || facts.memory.available / facts.memory.total < 0.1)) tips.push({ id: "memory", text: msg("Close other apps, web browsers especially, to give Church Studio more memory.") });
  const storage = { label: msg("Storage & backup"), action: "storage" as const };
  if (facts.spare.unused >= 200_000_000) tips.push({ id: "unused", text: msg("{size} of pictures and videos aren't used anywhere. Remove them to free space."), values: { size: mb(facts.spare.unused) }, action: storage });
  if (facts.spare.model > 0) tips.push({ id: "model", text: msg("The speech model ({size}) is downloaded but Accurate listening is off. Remove it to free space."), values: { size: mb(facts.spare.model) }, action: storage });
  if (facts.spare.cache >= 300_000_000) tips.push({ id: "cache", text: msg("Clear {size} of cache. It is safe: it only holds copies."), values: { size: mb(facts.spare.cache) }, action: storage });
  return tips;
}
