import { describe, expect, it } from "vitest";
import { buildSlideIndex, matchSlide } from "./slide-follow";

const deck = buildSlideIndex([
  { key: "p0", label: "1 · Title", text: "The Prodigal Son · Luke 15" },
  { key: "p1", label: "2 · Point one", text: "He wasted his inheritance in a far country" },
  { key: "p2", label: "3 · Point two", text: "He came to himself and returned to his father" },
  { key: "p3", label: "4 · Point three", text: "The father ran, embraced him and threw a feast" },
]);

describe("follow the sermon", () => {
  it("names the slide being preached from its rarer words", () => {
    expect(matchSlide("and so this young man, he wasted everything, the whole inheritance, in that far country", deck)?.key).toBe("p1");
    expect(matchSlide("when he came to himself he got up and returned home to his father", deck)?.key).toBe("p2");
    expect(matchSlide("but look at the father, he ran to him and embraced him, and he threw a great feast", deck)?.key).toBe("p3");
  });

  it("stays quiet on words that are on every sermon", () => {
    expect(matchSlide("praise the Lord church, God is good, amen, let us pray", deck)).toBeNull();
    expect(matchSlide("", deck)).toBeNull();
  });

  it("keeps the slide on screen when the speech fits it and a neighbour about as well", () => {
    const match = matchSlide("he ran to his father", deck, "p3");
    expect(match === null || match.key === "p3").toBe(true);
  });
});
