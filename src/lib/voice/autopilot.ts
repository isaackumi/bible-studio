import type { PresentationLayout } from "../domain/types";

// Autopilot: the room sings and the screen follows by itself, so the media team can keep their
// eyes on the service. These are its rules, kept apart from the app so they can be tested.
//
// - Within the song on the screen, the part being sung goes live once it has been heard twice.
// - A song of this service starts on its own only from an empty screen or the logo, after being
//   heard three times over at least a second and a half (partial words arrive several a second). Never from Black (someone chose dark) and never over a verse, slide or
//   anything else: then it waits on Next.
// - Verses (only when the operator lets them): one goes live by itself only when the preacher said
//   its whole reference ("John 3:16") in a finished phrase, matching the verse found, and the screen
//   shows scripture, a slide, the logo or nothing. A half-heard "John 3:1" may still become 3:16.
// - The operator always wins. When the screen changes and Autopilot did not change it (Undo, a
//   click, Black), it stands back for a while, and never sends again the part that was taken off.

/**
 * What the screen shows, as far as Autopilot cares. `source` names it: a song part, a slide
 * ("deck:…"), a verse ("verse:John 3:16") or the layout ("screen:black"), so any change shows.
 */
export type ProgramNow = { source: string | null; layout: PresentationLayout; held: boolean };

/** A verse just found. `cited`: the phrase said its whole reference; `final`: the phrase ended. */
export type HeardVerse = { key: string; cited: boolean; final: boolean };

/** A part of a song that was just heard. `key` is the source it shows as ("song:id:part#2"). */
export type SungTarget = { key: string; songId: string; inService: boolean };

export type Pilot = {
  /** The screen's source the last time Autopilot looked. */
  seen: string | null;
  /** What Autopilot itself last put on the screen. */
  mine: string | null;
  /** A part the operator took off the screen: not sent again until something else is. */
  refused: string | null;
  /** Standing back until this time (ms), after the operator took over. */
  holdUntil: number;
  lastMoveAt: number;
  /** The part heard last, and how many times in a row. */
  candidate: string | null;
  streak: number;
  /** When the candidate was first heard in this run. */
  since: number;
};

export type PilotCall = { action: "live" | "next" | "wait"; pilot: Pilot };

/** How long Autopilot stands back after the operator changes the screen. */
export const HOLD_MS = 15_000;
/** The fewest milliseconds between two of its own changes, so the screen never flickers. */
export const GAP_MS = 1200;
/** Times in a row a part must be heard: within the song showing, and to start a song. */
export const STEADY_SAME = 2;
export const STEADY_NEW = 3;
export const STEADY_NEW_MS = 1500;

export function newPilot(): Pilot {
  return { seen: null, mine: null, refused: null, holdUntil: 0, lastMoveAt: 0, candidate: null, streak: 0, since: 0 };
}

/** The song a source shows ("song:id:part#2" → "id"), or null for anything else. */
export function songOf(source: string | null): string | null {
  if (!source?.startsWith("song:")) return null;
  return source.slice(5).split(":")[0] || null;
}

/** Look at the screen: a change Autopilot did not make means the operator took over. */
export function watchProgram(pilot: Pilot, program: ProgramNow, now: number): Pilot {
  if (program.source === pilot.seen) return pilot;
  if (pilot.seen !== null && program.source !== pilot.mine) {
    return { ...pilot, seen: program.source, holdUntil: now + HOLD_MS, refused: pilot.mine ?? pilot.refused, candidate: null, streak: 0 };
  }
  return { ...pilot, seen: program.source };
}

/** Stand back now (the operator pressed Undo on Autopilot's own change). */
export function standBack(pilot: Pilot, now: number): Pilot {
  return { ...pilot, holdUntil: now + HOLD_MS, refused: pilot.mine ?? pilot.refused, candidate: null, streak: 0 };
}

/** Autopilot put `key` on the screen (a song part, or a sermon slide it followed). */
export function claimed(pilot: Pilot, key: string, now: number): Pilot {
  return { ...pilot, seen: key, mine: key, refused: null, lastMoveAt: now, candidate: null, streak: 0 };
}

export function holding(pilot: Pilot, now: number): boolean {
  return now < pilot.holdUntil;
}

/** What to do with a part just heard: put it live, put it on Next, or wait. */
export function callSong(pilot: Pilot, target: SungTarget, program: ProgramNow, nextSource: string | null, now: number): PilotCall {
  const again = pilot.candidate === target.key;
  const streak = again ? pilot.streak + 1 : 1;
  const counted = { ...pilot, candidate: target.key, streak, since: again ? pilot.since : now };
  const wait = { action: "wait" as const, pilot: counted };
  if (target.key === program.source || target.key === pilot.refused || holding(pilot, now)) return wait;
  if (now - pilot.lastMoveAt < GAP_MS) return wait;
  const sameSong = !program.held && songOf(program.source) === target.songId;
  if (sameSong) return streak >= STEADY_SAME ? { action: "live", pilot: counted } : wait;
  const startable = !program.held && (program.layout === "empty" || program.layout === "logo" || songOf(program.source) !== null);
  if (startable && target.inService) return streak >= STEADY_NEW && now - counted.since >= STEADY_NEW_MS ? { action: "live", pilot: counted } : wait;
  // Something else is showing (or the song is not in this service): it waits on Next, once.
  if (streak >= STEADY_SAME && target.key !== nextSource) return { action: "next", pilot: counted };
  return wait;
}

/** Whether a verse heard goes live by itself (it is on Next already either way). */
export function callVerse(pilot: Pilot, verse: HeardVerse, program: ProgramNow, now: number): PilotCall {
  const wait = { action: "wait" as const, pilot };
  if (!verse.cited || !verse.final) return wait;
  if (verse.key === program.source || verse.key === pilot.refused || holding(pilot, now) || now - pilot.lastMoveAt < GAP_MS) return wait;
  const calm = program.layout === "scripture" || program.layout === "empty" || program.layout === "logo" || program.source?.startsWith("deck:") === true;
  return !program.held && calm ? { action: "live", pilot } : wait;
}
