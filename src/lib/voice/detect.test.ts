import { describe, expect, it } from "vitest";
import { bundledQuoteCatalog } from "../bible/texts";
import { detectVerse, matchSpoken, spokenReference, type QuoteVerse } from "./detect";

const genesis = { ord: 1, name: "Genesis", chapters: 50 };

describe("voice verse detection", () => {
  it("matches a spoken verse from the open chapter", () => {
    const hit = detectVerse(
      "In the beginning God created the heaven and the earth",
      [
        { verse: 1, text: "In the beginning God created the heaven and the earth." },
        { verse: 2, text: "And the earth was without form, and void." },
      ],
      genesis,
      1,
      "kjv",
    );
    expect(hit?.reference).toBe("Genesis 1:1");
    expect(hit?.startVerse).toBe(1);
  });

  it("hears a spoken reference without a colon", () => {
    expect(spokenReference("John 3 16")?.startVerse).toBe(16);
    expect(spokenReference("john chapter 3 verse 16")?.chapter).toBe(3);
  });

  it("does not invent a live take from a short fragment", () => {
    expect(detectVerse("and the", [{ verse: 1, text: "In the beginning God created the heaven and the earth." }], genesis, 1, "kjv")).toBeNull();
  });

  it("finds a quoted verse in another book", () => {
    const catalog: QuoteVerse[] = [
      {
        bookOrd: 1,
        bookName: "Genesis",
        chaptersInBook: 50,
        chapter: 1,
        verse: 1,
        text: "In the beginning God created the heaven and the earth.",
        normalized: "in the beginning god created the heaven and the earth",
      },
      {
        bookOrd: 43,
        bookName: "John",
        chaptersInBook: 21,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world, that he gave his only begotten Son.",
        normalized: "for god so loved the world that he gave his only begotten son",
      },
    ];
    const hit = matchSpoken("For God so loved the world that he gave", catalog, "kjv");
    expect(hit?.item.reference).toBe("John 3:16");
    expect(hit?.item).not.toHaveProperty("action");
  });

  it("does not link a vague sentence to a verse", () => {
    const catalog: QuoteVerse[] = [
      {
        bookOrd: 43,
        bookName: "John",
        chaptersInBook: 21,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world, that he gave his only begotten Son.",
        normalized: "for god so loved the world that he gave his only begotten son",
      },
    ];
    expect(matchSpoken("please pass the microphone to the sound booth", catalog, "kjv")).toBeNull();
  });

  it("hears a citation inside a sentence and can leave the open book", () => {
    const hit = matchSpoken("please turn to john chapter 3 verse 16", [], "kjv");
    expect(hit?.item).toMatchObject({ bookOrd: 43, chapter: 3, startVerse: 16 });
  });

  it("finds John 3:16 in the King James catalog", async () => {
    const catalog = await bundledQuoteCatalog("kjv");
    const hit = matchSpoken("for god so loved the world", catalog, "kjv");
    expect(hit?.item.reference).toBe("John 3:16");
    expect(matchSpoken("god so loved the world he gave his son", catalog, "kjv")?.item.reference).toBe("John 3:16");
    expect(matchSpoken("please pass the microphone to the sound booth", catalog, "kjv")).toBeNull();
  });

  it("returns a preview passage, not a program action", () => {
    const hit = detectVerse(
      "In the beginning God created the heaven and the earth",
      [{ verse: 1, text: "In the beginning God created the heaven and the earth." }],
      genesis,
      1,
      "kjv",
    );
    expect(hit).toMatchObject({ translationId: "kjv", startVerse: 1, endVerse: 1 });
    expect(hit).not.toHaveProperty("action");
  });
});

