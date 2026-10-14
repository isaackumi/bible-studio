import { describe, expect, it } from "vitest";
import { createLiveState, frame, sameProgram, setPreview } from "../domain/live";
import { defaultTheme } from "../domain/theme";
import type { BibleItem, PresentationModel } from "../domain/types";
import { stepVerse } from "./passage";

const john: BibleItem = {
  translationId: "kjv",
  bookOrd: 43,
  chapter: 3,
  startVerse: 16,
  endVerse: 16,
  reference: "John 3:16",
};

const book = { name: "John", chapters: 21 };

function verse(reference: string): PresentationModel {
  return {
    layout: "scripture",
    theme: defaultTheme(),
    reference,
    attribution: "KJV",
    lines: [{ text: "verse" }],
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

describe("verse stepping", () => {
  it("moves one verse and stops at the ends of the chapter", () => {
    expect(stepVerse(john, 1, book, 36)).toMatchObject({ startVerse: 17, endVerse: 17, reference: "John 3:17" });
    expect(stepVerse({ ...john, startVerse: 16, endVerse: 17, reference: "John 3:16-17" }, 1, book, 36)?.startVerse).toBe(18);
    expect(stepVerse(john, -1, book, 36)?.reference).toBe("John 3:15");
    expect(stepVerse({ ...john, startVerse: 1, endVerse: 1, reference: "John 3:1" }, -1, book, 36)).toBeNull();
    expect(stepVerse({ ...john, startVerse: 36, endVerse: 36, reference: "John 3:36" }, 1, book, 36)).toBeNull();
  });

  it("does not change program when the next verse is previewed", () => {
    const next = stepVerse(john, 1, book, 36);
    const before = createLiveState(defaultTheme());
    const state = setPreview(before, frame(verse(next?.reference ?? ""), null, "cut"));
    expect(sameProgram(before, state)).toBe(true);
    expect(state.preview.model.reference).toBe("John 3:17");
    expect(state.program.model.layout).toBe("empty");
  });
});
