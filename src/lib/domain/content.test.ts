import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, setPreview } from "./live";
import { defaultTheme } from "./theme";
import { isRundownKind } from "./content";
import type { PresentationModel } from "./types";

const theme = defaultTheme();

function cameraPreview(): PresentationModel {
  return {
    layout: "title",
    theme,
    reference: null,
    attribution: "Camera",
    lines: [{ text: "Cam 1" }],
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

describe("content contract", () => {
  it("keeps today's service kinds on the rundown", () => {
    expect(isRundownKind("bible")).toBe(true);
    expect(isRundownKind("image")).toBe(true);
    expect(isRundownKind("camera")).toBe(false);
    expect(isRundownKind("ndi")).toBe(false);
    expect(isRundownKind("sermon")).toBe(false);
    expect(isRundownKind("composition")).toBe(true);
    expect(isRundownKind("timer")).toBe(false);
  });

  it("selecting a future camera or NDI source still only writes Preview", () => {
    let state = createLiveState(theme);
    const program = state.program;
    state = setPreview(state, frame(cameraPreview(), "camera-1", "cut"));
    expect(state.preview.model.attribution).toBe("Camera");
    expect(state.program).toEqual(program);
    const taken = applyProgramAction(state, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.attribution).toBe("Camera");
  });
});
