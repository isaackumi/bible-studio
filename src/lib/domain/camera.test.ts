import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState } from "./live";
import { defaultTheme } from "./theme";
import {
  cameraDeniedHelp,
  cameraDeniedMessage,
  cameraDeviceId,
  cameraFeedForLayer,
  camerasIn,
  camerasNeeded,
  cameraSourceId,
  discoverCameras,
  listVideoInputs,
  openCamera,
  planFeeds,
  presentCamera,
  previewCameraLive,
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
  const stream = { id: "stream-1" };

  function twoCameraLook() {
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "two-cameras")!, "Look");
    composition = assignLayerSource(composition, composition.layers[0]!.id, sourceRef("camera", "cam-1", "Camera 1"));
    composition = assignLayerSource(composition, composition.layers[1]!.id, sourceRef("camera", "cam-2", "Camera 2"));
    return composition;
  }

  it("lists the cameras a frame uses: its own camera source and every camera layer, once each", () => {
    const card = presentCamera({ theme, label: "Cam 1" });
    expect(camerasIn(card, "camera:1")).toEqual(["camera:1"]);
    expect(camerasIn(card, null)).toEqual([]);
    const painted = presentComposition(twoCameraLook(), { theme, now: 0 });
    expect(camerasIn(painted, "composition:x")).toEqual(["camera:cam-1", "camera:cam-2"]);
    expect(camerasIn(presentCamera({ theme, label: "Cam" }), "composition:x")).toEqual([]);
  });

  it("needs the union of Preview and Program cameras", () => {
    let live = createLiveState(theme);
    live = previewCameraLive(live, presentCamera({ theme, label: "A" }), "camera:a");
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    live = previewCameraLive(live, presentCamera({ theme, label: "B" }), "camera:b");
    expect(camerasNeeded(live).sort()).toEqual(["camera:a", "camera:b"]);
  });

  it("plans which feeds to open and which to close", () => {
    expect(planFeeds(["camera:a", "camera:b"], ["camera:b", "camera:c"])).toEqual({ open: ["camera:c"], close: ["camera:a"] });
    expect(planFeeds(["camera:a"], ["camera:a"])).toEqual({ open: [], close: [] });
  });

  it("finds a layer's feed in the feed map on any surface", () => {
    const feeds = { "camera:cam-1": stream };
    expect(cameraFeedForLayer("camera:cam-1", feeds)).toEqual(stream);
    expect(cameraFeedForLayer("camera:other", feeds)).toBeNull();
    expect(cameraFeedForLayer("scripture:john", feeds)).toBeNull();
    expect(cameraFeedForLayer(undefined, feeds)).toBeNull();
  });

  it("reads the device id back out of a camera source id", () => {
    expect(cameraDeviceId(cameraSourceId("abc:123"))).toBe("abc:123");
  });

  it("TAKE copies a camera look to Program as data; the packet never carries a stream", () => {
    const composition = twoCameraLook();
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(camerasIn(taken.program.model, taken.program.sourceId)).toEqual(["camera:cam-1", "camera:cam-2"]);
    expect(JSON.parse(JSON.stringify(taken.program.model))).toEqual(taken.program.model);
  });
});

describe("discoverCameras", () => {
  const iriun = { deviceId: "iriun", kind: "videoinput", label: "Iriun Webcam" };
  const facetime = { deviceId: "ft", kind: "videoinput", label: "FaceTime HD Camera" };

  it("asks for permission when cameras are hidden, then lists every camera", async () => {
    let granted = false;
    let stopped = 0;
    const result = await discoverCameras({
      enumerateDevices: async () => (granted ? [facetime, iriun] : [{ deviceId: "", kind: "videoinput", label: "" }]),
      getUserMedia: async () => {
        granted = true;
        return { getTracks: () => [{ stop: () => stopped++ }] };
      },
    });
    expect(result.cameras.map((camera) => camera.label)).toEqual(["FaceTime HD Camera", "Iriun Webcam"]);
    expect(result.note).toBe("");
    expect(stopped).toBe(1);
  });

  it("does not prompt again once cameras are visible", async () => {
    let prompts = 0;
    const result = await discoverCameras({
      enumerateDevices: async () => [facetime, iriun],
      getUserMedia: async () => (prompts++, {}),
    });
    expect(result.cameras).toHaveLength(2);
    expect(prompts).toBe(0);
  });

  it("explains how to allow the camera when permission is denied", async () => {
    const result = await discoverCameras({
      enumerateDevices: async () => [{ deviceId: "", kind: "videoinput", label: "" }],
      getUserMedia: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    });
    expect(result.cameras).toEqual([]);
    expect(result.note).toMatch(/privacy settings/);
  });

  it("names each computer's own camera setting", () => {
    expect(cameraDeniedHelp("mac")).toContain("System Settings › Privacy & Security › Camera");
    expect(cameraDeniedHelp("windows")).toContain("Windows Settings › Privacy & security › Camera");
  });
});
