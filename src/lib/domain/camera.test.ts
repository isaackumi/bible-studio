import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState } from "./live";
import { defaultTheme } from "./theme";
import {
  cameraDeniedMessage,
  cameraFeedForLayer,
  cameraSourceId,
  listVideoInputs,
  openCamera,
  presentCamera,
  previewCameraLive,
  previewShowsCamera,
} from "./camera";
import {
  assignLayerSource,
  COMPOSITION_TEMPLATES,
  instantiateTemplate,
  presentComposition,
  previewComposition,
  sourceRef,
} from "./composition";

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

describe("camera composition feeds", () => {
  const stream = { id: "preview-stream" };

  it("shows a live feed on Preview for a camera source or a camera composition layer", () => {
    const card = presentCamera({ theme, label: "Cam 1" });
    expect(previewShowsCamera(card, "camera:1")).toBe(true);
    expect(previewShowsCamera(card, null)).toBe(false);
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third")!, "Look");
    composition = assignLayerSource(composition, composition.layers[0]!.id, sourceRef("camera", "cam-1", "Camera 1"));
    const painted = presentComposition(composition, { theme, now: 0 });
    expect(painted.layers?.[0]?.sourceId).toBe("camera:cam-1");
    expect(previewShowsCamera(painted, `composition:${composition.id}`)).toBe(true);
    expect(previewShowsCamera(presentCamera({ theme, label: "Cam" }), "composition:x")).toBe(false);
  });

  it("attaches the MediaStream only on the Preview surface", () => {
    expect(cameraFeedForLayer("camera:cam-1", "camera:cam-1", stream, "preview")).toEqual(stream);
    expect(cameraFeedForLayer("camera:cam-1", "camera:cam-1", stream, "program")).toBeNull();
    expect(cameraFeedForLayer("camera:cam-1", "camera:cam-1", stream, "audience")).toBeNull();
    expect(cameraFeedForLayer("camera:other", "camera:cam-1", stream, "preview")).toBeNull();
    expect(cameraFeedForLayer("scripture:john", "camera:cam-1", stream, "preview")).toBeNull();
  });

  it("opening a camera onto a composition writes Preview and never puts a stream on Program", () => {
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third")!, "Look");
    composition = assignLayerSource(
      composition,
      composition.layers[0]!.id,
      sourceRef("camera", "cam-1", "Camera 1", { deviceId: "cam-1", label: "Camera 1" }),
    );
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers?.[0]?.sourceId).toBe(cameraSourceId("cam-1"));
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.attribution).toBe("Camera");
    expect(taken.program.model).not.toHaveProperty("stream");
    expect(cameraFeedForLayer(taken.program.model.layers?.[0]?.sourceId, cameraSourceId("cam-1"), stream, "audience")).toBeNull();
  });
});
