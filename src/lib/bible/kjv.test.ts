import { describe, expect, it } from "vitest";
import { chapterVerses, kjvChapter, kjvPassage } from "./kjv";

describe("local KJV", () => {
  it("numbers verses inside a chapter", () => {
    const verses = chapterVerses([{ chapters: [["In the beginning", "And the earth"]] }], 1, 1);
    expect(verses).toEqual([
      { verse: 1, text: "In the beginning" },
      { verse: 2, text: "And the earth" },
    ]);
  });

  it("reads Genesis 1:1 from the bundled text", async () => {
    const verses = await kjvChapter(1, 1);
    expect(verses[0]?.text.startsWith("In the beginning")).toBe(true);
    const passage = await kjvPassage(43, 3, 16, 16);
    expect(passage[0]?.text.toLowerCase()).toContain("god so loved");
  });
});
