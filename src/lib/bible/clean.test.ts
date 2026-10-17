import { describe, expect, it } from "vitest";
import { cleanVerse } from "./clean";

describe("verse text cleanup", () => {
  it("fixes spacing around punctuation and parentheses", () => {
    expect(cleanVerse("I have gotten a man from the LORD .")).toBe("I have gotten a man from the LORD.");
    expect(cleanVerse("The earth was formless and empty . Darkness was on the surface")).toBe("The earth was formless and empty. Darkness was on the surface");
    expect(cleanVerse("the king of Bela ( also called Zoar ).")).toBe("the king of Bela (also called Zoar).");
  });

  it("removes the leaked Elohim footnote", () => {
    expect(cleanVerse('In the beginning , God " (Elohim). created the heavens and the earth .')).toBe("In the beginning, God created the heavens and the earth.");
    expect(cleanVerse('Surely God " (Elohim). is good to Israel')).toBe("Surely God is good to Israel");
  });

  it("rejoins contractions and possessives but keeps plural possessives", () => {
    expect(cleanVerse("For God didn’ t send his Son")).toBe("For God didn’t send his Son");
    expect(cleanVerse("Yahweh their God ’s voice")).toBe("Yahweh their God’s voice");
    expect(cleanVerse("your sons ’ wives with you")).toBe("your sons’ wives with you");
    expect(cleanVerse("our sacks’ mouths")).toBe("our sacks’ mouths");
  });

  it("tightens quotes", () => {
    expect(cleanVerse('He said to the woman, " Has God really said')).toBe('He said to the woman, "Has God really said');
    expect(cleanVerse("waters before their eyes .\" ( These are the waters")).toBe('waters before their eyes." (These are the waters');
    expect(cleanVerse("said, ‘ You shall not eat")).toBe("said, ‘You shall not eat");
  });

  it("blanks the empty-verse placeholder and leaves clean text alone", () => {
    expect(cleanVerse("[]")).toBe("");
    const clean = "For God so loved the world, that he gave his only begotten Son.";
    expect(cleanVerse(clean)).toBe(clean);
  });
});
