import { describe, expect, it } from "vitest";
import { firstChord, prefersFlats, readChordLine, transposeChord, transposeLine } from "./chords";

describe("chords", () => {
  it("reads a ChordPro line into its words and where each chord sits", () => {
    expect(readChordLine("[G]Amazing [C]grace how [G]sweet")).toEqual({ lyric: "Amazing grace how sweet", chords: [{ at: 0, chord: "G" }, { at: 8, chord: "C" }, { at: 18, chord: "G" }] });
    expect(readChordLine("No chords here")).toEqual({ lyric: "No chords here", chords: [] });
  });

  it("transposes chords, slash basses and qualities", () => {
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("F#m7/C#", 2)).toBe("G#m7/D#");
    expect(transposeChord("B", 1)).toBe("C");
    expect(transposeChord("C", -1)).toBe("B");
    expect(transposeChord("Bbmaj7", 2)).toBe("Cmaj7");
    expect(transposeChord("Dsus4", 3, true)).toBe("Fsus4");
    expect(transposeChord("E", 1, true)).toBe("F");
    expect(transposeChord("A", 1, true)).toBe("Bb");
    expect(transposeChord("N.C.", 2)).toBe("N.C.");
  });

  it("uses flats for flat keys", () => {
    expect(prefersFlats("C", 5)).toBe(true); // C → F
    expect(prefersFlats("G", 2)).toBe(false); // G → A
    expect(prefersFlats("Bb", 0)).toBe(true);
  });

  it("transposes a whole line and finds a song's first chord", () => {
    expect(transposeLine(readChordLine("[D]Holy [A]holy"), 2).chords.map((placed) => placed.chord)).toEqual(["E", "B"]);
    expect(firstChord(["Just words", "[Em]Then a [C]chord"])).toBe("Em");
  });
});

describe("chords on the stage screen", () => {
  it("gives the live part's chord lines, transposed, for one screen when split", async () => {
    const { stageChords } = await import("./chords");
    const section = { lines: ["Amazing grace", "How sweet", "", "That saved"], chords: ["[G]Amazing [C]grace", "", "", "[D]That saved"] };
    const all = stageChords(section, 2);
    expect(all.map((line) => line.lyric)).toEqual(["Amazing grace", "How sweet", "That saved"]);
    expect(all[0]!.chords.map((placed) => placed.chord)).toEqual(["A", "D"]);
    expect(stageChords(section, 0, { from: 3, to: 4 })).toEqual([{ lyric: "That saved", chords: [{ at: 0, chord: "D" }] }]);
    expect(stageChords({ lines: ["No chords"] })).toEqual([]);
  });
});
