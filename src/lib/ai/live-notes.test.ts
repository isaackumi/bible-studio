import { describe, expect, it } from "vitest";
import { liveNotesRequest, parseLiveNotes, wordCount } from "./live-notes";
import { emptyAiSettings } from "./summarize";

describe("live sermon notes", () => {
  it("sends the notes so far and only the newest words", () => {
    const body = JSON.parse(liveNotesRequest({ ...emptyAiSettings(), key: "k" }, { title: "Faith that works", notes: "## Faith\n- shown in action", heard: "turn with me to james chapter 2" }).body);
    const message = body.messages[0].content as string;
    expect(message).toContain("Sermon: Faith that works");
    expect(message).toContain("Notes so far:\n## Faith");
    expect(message).toContain("Newest words heard:\nturn with me to james chapter 2");
  });

  it("reads the notes from JSON, or from plain notes, and refuses anything else", () => {
    expect(parseLiveNotes('```json\n{"notes": "## Grace\\n- Ephesians 2:8\\n\\n\\n\\n- by faith"}\n```')).toBe("## Grace\n- Ephesians 2:8\n\n- by faith");
    expect(parseLiveNotes("## Grace\n- Ephesians 2:8")).toBe("## Grace\n- Ephesians 2:8");
    expect(parseLiveNotes("Sorry, I cannot help with that.")).toBeNull();
  });

  it("counts words", () => {
    expect(wordCount("  turn with me  to James ")).toBe(5);
    expect(wordCount("")).toBe(0);
  });
});
