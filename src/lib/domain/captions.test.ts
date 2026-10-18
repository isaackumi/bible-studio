import { describe, expect, it } from "vitest";
import { addHeard, captionRows, emptyCaptions, linesFor, sanitizeCaptionSettings, withTranslation, wrapWords } from "./captions";

describe("live captions", () => {
  it("turns finished phrases into lines and keeps the unfinished one apart", () => {
    let state = addHeard(emptyCaptions(), "good morning church", false, 1);
    expect(state.interim).toBe("Good morning church");
    state = addHeard(state, "good morning church", true, 2);
    expect(state.lines.map((line) => line.text)).toEqual(["Good morning church"]);
    expect(state.interim).toBe("");
    // The same phrase finished twice is kept once.
    state = addHeard(state, "Good morning church ", true, 3);
    expect(state.lines).toHaveLength(1);
    state = addHeard(state, "turn with me to john chapter three", true, 4);
    expect(state.lines.map((line) => line.id)).toEqual([1, 2]);
  });

  it("shows the newest words wrapped into a couple of rows", () => {
    expect(wrapWords("one two three four five", 9)).toEqual(["one two", "three", "four five"]);
    let state = addHeard(emptyCaptions(), "for god so loved the world", true, 1);
    state = addHeard(state, "that he gave his only son", false, 2);
    expect(captionRows(state, 2, 20)).toEqual(["world That he gave", "his only son"]);
  });

  it("gives phones new lines, translated when ready", () => {
    let state = addHeard(emptyCaptions(), "god is love", true, 1);
    state = addHeard(state, "amen", true, 2);
    state = withTranslation(state, 1, { es: "Dios es amor" });
    expect(linesFor(state, 0, "es")).toEqual([
      { id: 1, text: "Dios es amor", translated: true },
      { id: 2, text: "Amen", translated: false },
    ]);
    expect(linesFor(state, 1, null)).toEqual([{ id: 2, text: "Amen", translated: false }]);
  });

  it("keeps settings sensible", () => {
    expect(sanitizeCaptionSettings({ languages: ["es", "xx", "es", "fr"], size: "huge" })).toEqual({ screen: true, position: "bottom", size: "m", languages: ["es", "fr"] });
  });
});
