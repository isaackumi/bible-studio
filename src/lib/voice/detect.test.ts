import { describe, expect, it } from "vitest";
import { detectVerse, spokenReference } from "./detect";

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

