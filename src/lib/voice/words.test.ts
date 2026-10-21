import { describe, expect, it } from "vitest";
import { spokenReference } from "./detect";
import { BUILT_IN_FIXES, bookNamed, expectedWords, fixHeard, learnFix, nearMisses, type WordFix } from "./words";

describe("misheard words", () => {
  it("puts book names right where a book makes sense, and nowhere else", () => {
    expect(fixHeard("turn to efficient 4 verse 1").text).toBe("turn to Ephesians 4 verse 1");
    expect(fixHeard("efficient chapter four").text).toBe("Ephesians chapter four");
    expect(fixHeard("open your bible to philippina").text).toBe("open your bible to Philippians");
    expect(fixHeard("first corinthian 13 4").text).toBe("first Corinthians 13 4");
    // Ordinary speech keeps its words.
    expect(fixHeard("we want an efficient church").text).toBe("we want an efficient church");
    expect(fixHeard("my friends in the philippines").text).toBe("my friends in the philippines");
  });

  it("hears West African English: Tessalonians, Rebelation, fast Corinthians, chapta", () => {
    expect(spokenReference(fixHeard("fast corinthians chapta 13 vas 4").text)).toMatchObject({ bookName: "1 Corinthians", chapter: 13, startVerse: 4 });
    expect(spokenReference(fixHeard("sekon timothy 1 7").text)).toMatchObject({ bookName: "2 Timothy", chapter: 1, startVerse: 7 });
    expect(spokenReference(fixHeard("tessalonians 5 16").text)).toMatchObject({ bookName: "1 Thessalonians" });
    expect(fixHeard("rebelation 21 4").text).toBe("Revelation 21 4");
    // Not a reference: the words stay.
    expect(fixHeard("i ran fast corinthians were watching").text).toBe("i ran fast corinthians were watching");
  });

  it("asks more of everyday words that sound like a book", () => {
    expect(fixHeard("some 20 people came").text).toBe("some 20 people came");
    expect(fixHeard("some 23 verse 1").text).toBe("Psalms 23 verse 1");
    expect(fixHeard("look at luke 2").text).toBe("look at luke 2");
    expect(fixHeard("look 2 verse 10").text).toBe("Luke 2 verse 10");
    expect(fixHeard("turn to some").text).toBe("turn to Psalms");
  });

  it("finds the verse once the words are put right", () => {
    expect(spokenReference("efficient 4 1")).toBeNull();
    expect(spokenReference(fixHeard("efficient 4 1").text)).toMatchObject({ bookName: "Ephesians", chapter: 4, startVerse: 1 });
    expect(spokenReference(fixHeard("galatian 5 22").text)).toMatchObject({ bookName: "Galatians", chapter: 5, startVerse: 22 });
  });

  it("puts the church's own words first, and names everywhere", () => {
    const yours: WordFix[] = [{ heard: "pastor kway", means: "Pastor Quaye", source: "yours" }, { heard: "a fishing", means: "Ephesians", source: "yours" }];
    expect(fixHeard("welcome pastor kway", yours).text).toBe("welcome Pastor Quaye");
    expect(fixHeard("a fishing 2 8", yours).text).toBe("Ephesians 2 8");
    expect(fixHeard("we went a fishing", yours).text).toBe("we went a fishing");
    expect(fixHeard("efficient 2 8", yours).applied).toEqual([{ heard: "efficient", means: "Ephesians" }]);
  });

  it("learns what the operator meant from the chapter they put up", () => {
    const misses = nearMisses("turn with me to a feesh 4 verse 11");
    expect(misses[0]).toEqual({ words: "a feesh", chapter: 4 });
    expect(learnFix(misses, { bookOrd: 49, chapter: 4 }, [])).toMatchObject({ heard: "a feesh", means: "Ephesians", source: "learned" });
    // A different chapter, or numbers after ordinary words, teach nothing.
    expect(learnFix(misses, { bookOrd: 49, chapter: 5 }, [])).toBeNull();
    expect(nearMisses("we sang hymn 23 and read in 4")).toEqual([]);
    expect(nearMisses("ephesians 4")).toEqual([]);
    // Already known: not learned twice.
    expect(learnFix(misses, { bookOrd: 49, chapter: 4 }, [{ heard: "a feesh", means: "Ephesians", source: "learned" }])).toBeNull();
  });

  it("every built-in fix names a real book, and tells the recognizer the church's own words", () => {
    for (const [heard, book] of BUILT_IN_FIXES) {
      if (book === "chapter" || book === "verse" || book === "verses") continue;
      expect(bookNamed(book), heard).toBe(book);
      expect(bookNamed(heard), `${heard} is already a book name`).toBeNull();
    }
    expect(expectedWords([{ heard: "pastor kway", means: "Pastor Quaye", source: "yours" }, { heard: "efficient", means: "Ephesians", source: "learned" }])).toEqual(["Pastor Quaye"]);
  });
});
