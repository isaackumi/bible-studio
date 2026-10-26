import { describe, expect, it } from "vitest";
import { findPlaces, PLACES } from "./where";

const first = (question: string) => findPlaces(question)[0]?.step.title;

describe("where is", () => {
  it("knows each part of the screen once, never the come-back-here step", () => {
    const titles = PLACES.map((place) => place.step.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).not.toContain("Lost? Come back here");
    expect(PLACES.length).toBeGreaterThan(30);
  });

  it("finds the place a question asks for", () => {
    expect(first("how do I turn the screen black?")).toBe("BLACK and CLEAR");
    expect(first("where is the projector")).toBe("The audience screen");
    expect(first("where is the song library")).toBe("Your song library");
    expect(findPlaces("where are my songs")[0]?.tour).toBe("songs");
    expect(first("the qr code for phones")).toBe("Scan to join");
    expect(first("microphone")).toBe("The microphone");
    expect(first("where are the cameras")).toBe("Sources");
  });

  it("finds nothing for words that name no place", () => {
    expect(findPlaces("where is the")).toEqual([]);
    expect(findPlaces("zebra")).toEqual([]);
  });
});
