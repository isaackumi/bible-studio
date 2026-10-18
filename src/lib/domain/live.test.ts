import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, replaceProgramModel, sameProgram, setPreview } from "./live";
import { defaultTheme } from "./theme";
import type { PresentationModel } from "./types";
import { PROGRAM_ACTIONS } from "./types";

const theme = defaultTheme();

function verse(reference: string, text: string): PresentationModel {
  return {
    layout: "scripture",
    theme,
    reference,
    attribution: "KJV",
    lines: [{ marker: reference.split(":").at(-1), text }],
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

describe("preview and program", () => {
  it("only take, cut, clear, black, and logo change program", () => {
    expect(PROGRAM_ACTIONS).toEqual(["take", "cut", "clear", "black", "logo"]);
  });

  it("selecting a passage never changes program", () => {
    let state = createLiveState(theme);
    const before = state;
    state = setPreview(state, frame(verse("John 3:16", "For God so loved the world"), "item-a", "cut"));
    expect(state.preview.model.reference).toBe("John 3:16");
    expect(sameProgram(before, state)).toBe(true);
    expect(state.program.sourceId).toBeNull();
  });

  it("take copies preview onto program and leaves the next selection on preview only", () => {
    let state = createLiveState(theme);
    state = setPreview(state, frame(verse("John 3:16", "For God so loved the world"), "item-a", "cut"));
    state = applyProgramAction(state, "take", theme, { title: "Logo", imageUrl: null });
    expect(state.program.model.reference).toBe("John 3:16");
    expect(state.program.sourceId).toBe("item-a");
    expect(state.program.transition).toBe("fade");
    const onAir = state;
    state = setPreview(state, frame(verse("John 3:17", "For God sent not his Son"), "item-b", "cut"));
    expect(sameProgram(onAir, state)).toBe(true);
    expect(state.preview.model.reference).toBe("John 3:17");
    state = applyProgramAction(state, "take", theme, { title: "Logo", imageUrl: null });
    expect(state.program.model.reference).toBe("John 3:17");
    expect(state.preview.model.reference).toBe("John 3:17");
  });

  it("cut is immediate and clear, black, and logo do not move preview", () => {
    let state = setPreview(
      createLiveState(theme),
      frame(verse("John 3:16", "For God so loved the world"), "item-a", "fade"),
    );
    state = applyProgramAction(state, "cut", theme, { title: "Logo", imageUrl: null });
    expect(state.program.transition).toBe("cut");
    expect(state.program.model.reference).toBe("John 3:16");

    state = applyProgramAction(state, "black", theme, { title: "Logo", imageUrl: null });
    expect(state.program.model.layout).toBe("black");
    expect(state.program.sourceId).toBeNull();
    expect(state.preview.model.reference).toBe("John 3:16");

    state = applyProgramAction(state, "logo", theme, { title: "Grace Chapel", imageUrl: null });
    expect(state.program.model.layout).toBe("logo");
    expect(state.program.model.lines[0]?.text).toBe("Grace Chapel");
    expect(state.preview.sourceId).toBe("item-a");

    state = applyProgramAction(state, "clear", theme, { title: "Grace Chapel", imageUrl: null });
    expect(state.program.model.layout).toBe("empty");
    expect(state.preview.model.layout).toBe("scripture");
  });

  it("a new translation updates program scripture without taking a different preview", () => {
    let state = createLiveState(theme);
    state = setPreview(state, frame(verse("John 3:16", "For God so loved the world"), "item-a", "cut"));
    state = applyProgramAction(state, "take", theme, { title: "Logo", imageUrl: null });
    state = setPreview(state, frame(verse("John 3:17", "For God sent not his Son"), "item-b", "cut"));
    state = replaceProgramModel(
      state,
      verse("John 3:16", "For God so loved the world, that he gave his only begotten Son."),
    );
    expect(state.program.model.attribution).toBe("KJV");
    expect(state.program.model.lines[0]?.text).toContain("only begotten");
    expect(state.program.model.reference).toBe("John 3:16");
    expect(state.preview.model.reference).toBe("John 3:17");
  });
});

describe("video on Program follows one clock", async () => {
  const { videoPosition } = await import("./types");
  it("moves while playing and holds while paused", () => {
    expect(videoPosition({ playing: true, at: 10, stamp: 1000, volume: 1 }, 4000)).toBe(13);
    expect(videoPosition({ playing: false, at: 10, stamp: 1000, volume: 1 }, 9000)).toBe(10);
    expect(videoPosition({ playing: true, at: 0, stamp: 5000, volume: 1 }, 4000)).toBe(0);
  });
});

describe("clear words", () => {
  it("keeps the background and drops the words", async () => {
    const { withoutWords } = await import("./live");
    const { defaultTheme } = await import("./theme");
    const theme = defaultTheme();
    const verse = { layout: "scripture", theme, reference: "John 3:16", attribution: "KJV", lines: [{ text: "For God" }], imageUrl: null, backgroundImageUrl: "photo.jpg" } as const;
    expect(withoutWords({ ...verse, lines: [...verse.lines] })).toMatchObject({ layout: "empty", lines: [], reference: null, backgroundImageUrl: "photo.jpg" });
    expect(withoutWords({ ...verse, layout: "image", lines: [] })).toBeNull();
    const look = {
      ...verse,
      layout: "composition" as const,
      lines: [],
      layers: [
        { id: "cam", zIndex: 0, opacity: 1, bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" as const, sourceId: "c", model: { ...verse, layout: "image" as const, lines: [] } },
        { id: "words", zIndex: 1, opacity: 1, bounds: { x: 0, y: 70, w: 100, h: 30 }, fit: "contain" as const, sourceId: "s", model: { ...verse, lines: [...verse.lines] } },
      ],
    };
    expect(withoutWords(look)?.layers?.map((layer) => layer.id)).toEqual(["cam"]);
  });
});
