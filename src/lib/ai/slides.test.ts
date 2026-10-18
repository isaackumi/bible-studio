import { describe, expect, it } from "vitest";
import { parseSlides, slidesRequest } from "./slides";
import { emptyAiSettings } from "./summarize";

describe("AI slide generation", () => {
  it("asks for the right kind of deck", () => {
    const request = slidesRequest({ ...emptyAiSettings(), key: "k" }, { source: "passage", text: "Luke 15:11-32", count: 30 });
    const body = JSON.parse(request.body);
    expect(JSON.stringify(body)).toContain("walk through this Bible passage");
    expect(JSON.stringify(body)).toContain("about 12 slides");
  });

  it("reads the answer, even inside a code fence, and tidies it", () => {
    const deck = parseSlides('Here you go:\n```json\n{"title":"The Prodigal Son","slides":[{"heading":"**The Prodigal Son**","body":"Luke 15","scripture":""},{"heading":"A far country","body":"He wasted   everything","scripture":"Luke 15:13"},{"heading":"","body":""}]}\n```');
    expect(deck.title).toBe("The Prodigal Son");
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.heading).toBe("The Prodigal Son");
    expect(deck.slides[1]).toEqual({ heading: "A far country", body: "He wasted everything", scripture: "Luke 15:13" });
  });

  it("says so when the answer has no slides", () => {
    expect(() => parseSlides("Sorry, I cannot help with that.")).toThrow(/expected shape/);
  });
});
