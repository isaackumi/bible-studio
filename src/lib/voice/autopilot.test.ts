import { describe, expect, it } from "vitest";
import { callSong, callVerse, claimed, GAP_MS, HOLD_MS, newPilot, songOf, standBack, watchProgram, type Pilot, type ProgramNow, type SungTarget } from "./autopilot";

const chorus: SungTarget = { key: "song:amazing:c", songId: "amazing", inService: true };
const verse2: SungTarget = { key: "song:amazing:v2", songId: "amazing", inService: true };
const other: SungTarget = { key: "song:other:v1", songId: "other", inService: false };
const showing = (source: string | null, layout: ProgramNow["layout"] = "lyrics", held = false): ProgramNow => ({ source, layout, held });

/** Hear the same part `times` times, one second apart; the last call. */
function hear(pilot: Pilot, target: SungTarget, program: ProgramNow, times: number, from = 10_000, next: string | null = null) {
  let call = callSong(pilot, target, program, next, from);
  for (let n = 1; n < times; n += 1) call = callSong(call.pilot, target, program, next, from + n * 1000);
  return call;
}

describe("autopilot", () => {
  it("reads the song a source shows", () => {
    expect(songOf("song:amazing:c#2")).toBe("amazing");
    expect(songOf("deck:d:1")).toBeNull();
    expect(songOf(null)).toBeNull();
  });

  it("follows the song on the screen once a part is heard twice", () => {
    const program = showing("song:amazing:v1");
    expect(hear(newPilot(), chorus, program, 1).action).toBe("wait");
    expect(hear(newPilot(), chorus, program, 2).action).toBe("live");
  });

  it("starts a song of this service from an empty screen or the logo after three hearings", () => {
    for (const program of [showing(null, "empty"), showing(null, "logo")]) {
      expect(hear(newPilot(), chorus, program, 2).action).toBe("wait");
      expect(hear(newPilot(), chorus, program, 3).action).toBe("live");
    }
  });

  it("does not start a song on a burst of partial words", () => {
    let call = callSong(newPilot(), chorus, showing(null, "empty"), null, 10_000);
    for (const at of [10_200, 10_400, 10_600, 10_800]) call = callSong(call.pilot, chorus, showing(null, "empty"), null, at);
    expect(call.action).toBe("wait");
    expect(callSong(call.pilot, chorus, showing(null, "empty"), null, 11_500).action).toBe("live");
  });

  it("never lights up a Black screen, and leaves a held screen alone", () => {
    expect(hear(newPilot(), chorus, showing(null, "black"), 5).action).toBe("next");
    expect(hear(newPilot(), chorus, showing("song:amazing:v1", "lyrics", true), 5).action).toBe("next");
  });

  it("puts a song on Next over a verse, and a song not in the service, once", () => {
    const verse = showing("bible:kjv:43:3:16", "scripture");
    expect(hear(newPilot(), chorus, verse, 2).action).toBe("next");
    expect(hear(newPilot(), chorus, verse, 2, 10_000, chorus.key).action).toBe("wait");
    expect(hear(newPilot(), other, showing(null, "empty"), 5).action).toBe("next");
  });

  it("does nothing when the part is already showing", () => {
    expect(hear(newPilot(), chorus, showing(chorus.key), 4).action).toBe("wait");
  });

  it("waits between its own changes so the screen never flickers", () => {
    let pilot = claimed(newPilot(), chorus.key, 10_000);
    pilot = callSong(pilot, verse2, showing(chorus.key), null, 10_100).pilot;
    expect(callSong(pilot, verse2, showing(chorus.key), null, 10_000 + GAP_MS - 1).action).toBe("wait");
    expect(callSong(pilot, verse2, showing(chorus.key), null, 10_000 + GAP_MS).action).toBe("live");
  });

  it("stands back when the operator changes the screen, and does not send the refused part again", () => {
    let pilot = claimed(newPilot(), chorus.key, 10_000);
    pilot = watchProgram(pilot, showing("song:amazing:v1"), 11_000);
    expect(pilot.holdUntil).toBe(11_000 + HOLD_MS);
    expect(hear(pilot, verse2, showing("song:amazing:v1"), 3, 12_000).action).toBe("wait");
    const later = 11_000 + HOLD_MS + 1;
    expect(hear(pilot, chorus, showing("song:amazing:v1"), 3, later).action).toBe("wait");
    expect(hear(pilot, verse2, showing("song:amazing:v1"), 2, later).action).toBe("live");
  });

  it("takes its own changes for its own", () => {
    const pilot = watchProgram(claimed(newPilot(), chorus.key, 10_000), showing(chorus.key), 10_500);
    expect(pilot.holdUntil).toBe(0);
  });

  it("does not take the first look at the screen for the operator", () => {
    expect(watchProgram(newPilot(), showing("song:amazing:v1"), 10_000).holdUntil).toBe(0);
  });

  it("stands back after Undo", () => {
    const pilot = standBack(claimed(newPilot(), chorus.key, 10_000), 11_000);
    expect(pilot.refused).toBe(chorus.key);
    expect(hear(pilot, verse2, showing("song:amazing:v1"), 3, 12_000).action).toBe("wait");
  });

  describe("verses", () => {
    const john: { key: string; cited: boolean; final: boolean } = { key: "verse:John 3:16", cited: true, final: true };

    it("go live only when the whole reference was said in a finished phrase", () => {
      expect(callVerse(newPilot(), john, showing(null, "empty"), 10_000).action).toBe("live");
      expect(callVerse(newPilot(), { ...john, final: false }, showing(null, "empty"), 10_000).action).toBe("wait");
      expect(callVerse(newPilot(), { ...john, cited: false }, showing(null, "empty"), 10_000).action).toBe("wait");
    });

    it("go live over scripture, a slide or the logo, never over a song, Black or a held screen", () => {
      expect(callVerse(newPilot(), john, showing("verse:Romans 8:28", "scripture"), 10_000).action).toBe("live");
      expect(callVerse(newPilot(), john, showing("deck:d:3", "composition"), 10_000).action).toBe("live");
      expect(callVerse(newPilot(), john, showing("screen:logo", "logo"), 10_000).action).toBe("live");
      expect(callVerse(newPilot(), john, showing("song:amazing:c"), 10_000).action).toBe("wait");
      expect(callVerse(newPilot(), john, showing("screen:black", "black"), 10_000).action).toBe("wait");
      expect(callVerse(newPilot(), john, showing("verse:Romans 8:28", "scripture", true), 10_000).action).toBe("wait");
    });

    it("leave a refused verse alone and wait while the operator has the screen", () => {
      const refused = standBack(claimed(newPilot(), john.key, 10_000), 11_000);
      expect(callVerse(refused, john, showing("verse:Romans 8:28", "scripture"), 11_000 + HOLD_MS + 1).action).toBe("wait");
      expect(callVerse(refused, { ...john, key: "verse:John 3:17" }, showing("verse:Romans 8:28", "scripture"), 12_000).action).toBe("wait");
    });
  });
});
