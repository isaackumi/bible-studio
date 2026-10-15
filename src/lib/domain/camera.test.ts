import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState } from "./live";
import { defaultTheme } from "./theme";
import {
  cameraDeniedMessage,
  listVideoInputs,
  openCamera,
  presentCamera,
  previewCameraLive,
} from "./camera";

const theme = defaultTheme();

describe("camera sources", () => {
  it("selecting a camera writes Preview and leaves Program unchanged", () => {
    const live = createLiveState(theme);
    const program = live.program;
    const next = previewCameraLive(live, presentCamera({ theme, label: "FaceTime HD" }), "camera:facetime");
    expect(next.preview.model.attribution).toBe("Camera");
    expect(next.preview.model.lines[0]?.text).toBe("FaceTime HD");
    expect(next.preview.sourceId).toBe("camera:facetime");
    expect(next.program).toEqual(program);
  });

  it("Take copies the camera source onto Program", () => {
    const previewed = previewCameraLive(
      createLiveState(theme),
      presentCamera({ theme, label: "Cam 1" }),
      "camera:1",
    );
    const taken = applyProgramAction(previewed, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.lines[0]?.text).toBe("Cam 1");
    expect(taken.program.sourceId).toBe("camera:1");
  });

  it("lists video inputs and opens a camera with video-only constraints", async () => {
    expect(
      listVideoInputs([
        { deviceId: "a", kind: "videoinput", label: "Cam A" },
        { deviceId: "b", kind: "audioinput", label: "Mic" },
      ]),
    ).toEqual([{ deviceId: "a", label: "Cam A" }]);

    let constraints: unknown;
    await openCamera(
      {
        getUserMedia: async (next) => {
          constraints = next;
          return { id: "stream" };
        },
      },
      "a",
    );
    expect(constraints).toEqual({ audio: false, video: { deviceId: { exact: "a" } } });
  });

  it("permission denied is a desk message and does not write Program", async () => {
    const live = createLiveState(theme);
    const program = live.program;
    await expect(
      openCamera(
        {
          getUserMedia: async () => {
            throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
          },
        },
        "a",
      ),
    ).rejects.toThrow(cameraDeniedMessage());
    expect(live.program).toEqual(program);
  });
});
