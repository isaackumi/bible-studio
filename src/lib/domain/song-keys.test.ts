import { describe, expect, it } from "vitest";
import { partForKey } from "./song-keys";
import type { SongSection } from "./types";

const part = (id: string, kind: SongSection["kind"], label: string): SongSection => ({ id, kind, label, lines: ["words"] });
const sections = [
  part("i", "verse", "Intro"),
  part("v1", "verse", "Verse 1"),
  part("pc", "chorus", "Pre-Chorus"),
  part("c", "chorus", "Chorus"),
  part("v2", "verse", "Verse 2"),
  part("b", "bridge", "Bridge"),
  part("e", "tag", "Ending"),
];

describe("song part hot keys", () => {
  it("jumps to a numbered part as the desk numbers them", () => {
    expect(partForKey(sections, { digit: 2 })?.id).toBe("v1");
    expect(partForKey(sections, { digit: 9 })).toBeNull();
  });

  it("jumps by kind, and a repeated letter moves to the next one", () => {
    expect(partForKey(sections, { code: "KeyV" })?.id).toBe("v1");
    expect(partForKey(sections, { code: "KeyV" }, "v1")?.id).toBe("v2");
    expect(partForKey(sections, { code: "KeyV" }, "v2")?.id).toBe("v1");
    expect(partForKey(sections, { code: "KeyC" })?.id).toBe("c");
    expect(partForKey(sections, { code: "KeyP" })?.id).toBe("pc");
    expect(partForKey(sections, { code: "KeyB" })?.id).toBe("b");
    expect(partForKey(sections, { code: "KeyI" })?.id).toBe("i");
    expect(partForKey(sections, { code: "KeyE" })?.id).toBe("e");
    expect(partForKey(sections, { code: "KeyT" })?.id).toBe("e");
  });

  it("does nothing for a kind the song does not have, or another key", () => {
    expect(partForKey([part("v1", "verse", "Verse 1")], { code: "KeyB" })).toBeNull();
    expect(partForKey(sections, { code: "KeyZ" })).toBeNull();
  });
});
