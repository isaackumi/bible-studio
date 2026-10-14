import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, sameProgram, setPreview } from "./live";
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
});
