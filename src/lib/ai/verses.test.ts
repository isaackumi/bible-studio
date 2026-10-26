import { describe, expect, it } from "vitest";
import { aiFeatureOn, emptyAiSettings, sanitizeAiSettings } from "./summarize";
import { parseHeardVerses, soundsLikeScripture, versesRequest } from "./verses";

describe("verses by meaning and AI feature switches", () => {
  it("only asks about speech that sounds like scripture", () => {
    expect(soundsLikeScripture("Jesus said he is the vine and we are the branches")).toBe(true);
    expect(soundsLikeScripture("the Bible says")).toBe(false);
    expect(soundsLikeScripture("please take your seats and turn off your phones now")).toBe(false);
  });

  it("sends the last words heard and reads up to three references", () => {
    const body = JSON.parse(versesRequest({ ...emptyAiSettings(), key: "k" }, "x".repeat(900) + " the vine").body);
    expect(body.messages[0].content.length).toBeLessThan(840);
    expect(parseHeardVerses('```json\n{"verses":[{"reference":"John 15:5","sure":true},{"reference":"Psalm","sure":true},{"reference":"John 15:1-8"}]}\n```')).toEqual([
      { reference: "John 15:5", sure: true },
      { reference: "John 15:1-8", sure: false },
    ]);
    expect(parseHeardVerses("nothing")).toEqual([]);
  });

  it("keeps every feature on by default, verses too, and saves only the changes", () => {
    const settings = sanitizeAiSettings({ provider: "gemini", key: "k", features: { songLookup: false, verses: false, summary: true, bogus: false } });
    expect(settings.features).toEqual({ songLookup: false, verses: false });
    expect(aiFeatureOn(settings, "summary")).toBe(true);
    expect(aiFeatureOn(settings, "songLookup")).toBe(false);
    expect(aiFeatureOn(settings, "verses")).toBe(false);
    expect(aiFeatureOn(emptyAiSettings(), "verses")).toBe(true);
    expect(sanitizeAiSettings({ provider: "gemini" }).features).toBeUndefined();
  });
});
