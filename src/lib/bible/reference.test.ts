import { describe, expect, it } from "vitest";
import { CANON, formatReference, parseReference } from "./reference";

describe("reference parser", () => {
  it("knows John as book 43 and is not tied to one translation file", () => {
    expect(CANON).toHaveLength(66);
    expect(CANON.find((book) => book.name === "John")?.ord).toBe(43);
    expect(CANON.find((book) => book.name === "Psalms")?.ord).toBe(19);
    expect(CANON.at(-1)?.name).toBe("Revelation");
  });

  it("parses ranges, abbreviations, and single-chapter books", () => {
    expect(parseReference("John 3:16")).toMatchObject({ bookName: "John", chapter: 3, startVerse: 16, endVerse: 16 });
    expect(parseReference("jn 3:16-17")).toMatchObject({ startVerse: 16, endVerse: 17 });
    expect(parseReference("1 John 1:1-3")?.bookName).toBe("1 John");
    expect(parseReference("Psalm 23")).toMatchObject({ bookName: "Psalms", chapter: 23, startVerse: null });
    expect(parseReference("Song of Solomon 2:1")?.bookName).toBe("Song of Solomon");
    expect(parseReference("Jude 3")).toMatchObject({ chapter: 1, startVerse: 3, endVerse: 3 });
    expect(parseReference("Obadiah 1:1")).toMatchObject({ chapter: 1, startVerse: 1 });
  });

  it("rejects unknown books and reversed ranges", () => {
    expect(parseReference("love your neighbor")).toBeNull();
    expect(parseReference("John 3:18-16")).toBeNull();
    expect(parseReference("John 99")).toBeNull();
  });

  it("formats a passage label", () => {
    expect(formatReference("John", 3, 16, 17, 21)).toBe("John 3:16-17");
    expect(formatReference("Jude", 1, 3, 3, 1)).toBe("Jude 3");
  });
});
