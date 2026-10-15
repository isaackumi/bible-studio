import { describe, expect, it } from "vitest";
import { defaultTheme } from "./theme";
import { presentScripture, presentText } from "./present";
import { presentCamera } from "./camera";
import {
  addLayer,
  applyLowerThirdTemplate,
  assignLayerSource,
  COMPOSITION_TEMPLATES,
  createComposition,
  hideLayer,
  instantiateTemplate,
  lookCameraLowerThird,
  lookCameraCountdown,
  lookScriptureCamera,
  lookLyricsCamera,
  lookImageCamera,
  lookTwoCameras,
  lookCameraPresentation,
  lookFullCamera,
  lookFullScripture,
  lookFullLyrics,
  lookCountdown,
  lookAnnouncement,
  lookTwoRegions,
  assignText,
  layerOrder,
  LOWER_THIRD_TEMPLATES,
  clearTimer,
  presentComposition,
  previewComposition,
  clearLowerThird,
  registerSourceCompiler,
  reorderLayers,
  resizeLayer,
  restoreComposition,
  sanitizeComposition,
  sourceRef,
} from "./composition";
import { applyProgramAction, createLiveState, programPacket, sameProgram } from "./live";
import { deliverProgram, outputSinks } from "../display/engine";
import { detectOutputCapabilities } from "../platform/output-capabilities";

const theme = defaultTheme();

function scriptureSource() {
  return sourceRef("scripture", "john-316", "John 3:16", {
    reference: "John 3:16",
    body: "For God so loved the world.",
    attribution: "KJV",
  });
}

function cameraSource() {
  return sourceRef("camera", "cam-1", "Camera 1", { deviceId: "cam-1", label: "Camera 1" });
}

describe("composition model", () => {
  it("creates, adds, reorders, hides, resizes, saves, and restores layers", () => {
    let composition = createComposition("Sunday Camera + Scripture");
    expect(composition.layers).toEqual([]);
    composition = addLayer(composition, { name: "A", bounds: { x: 0, y: 0, w: 50, h: 100 }, source: scriptureSource() });
    composition = addLayer(composition, { name: "B", bounds: { x: 50, y: 0, w: 50, h: 100 }, source: cameraSource() });
    expect(composition.layers).toHaveLength(2);
    const [first, second] = composition.layers;
    composition = reorderLayers(composition, second!.id, -1);
    expect(layerOrder(composition).map((layer) => layer.name)).toEqual(["B", "A"]);
    composition = hideLayer(composition, first!.id);
    expect(composition.layers.find((layer) => layer.id === first!.id)?.visible).toBe(false);
    composition = resizeLayer(composition, second!.id, { x: 40, y: 0, w: 60, h: 100 });
    const saved = sanitizeComposition(composition);
    const restored = restoreComposition(JSON.parse(JSON.stringify(saved)));
    expect(restored.name).toBe("Sunday Camera + Scripture");
    expect(restored.layers[0]?.bounds.w).toBe(60);
    expect(restored.layers.some((layer) => !layer.visible)).toBe(true);
  });

  it("instantiates a split template as regions, not a hardcoded scripture-left layout", () => {
    const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "split-two");
    expect(split?.slots).toHaveLength(2);
    let composition = instantiateTemplate(split!, "Scripture + Camera");
    composition = assignLayerSource(composition, composition.layers[0]!.id, scriptureSource());
    composition = assignLayerSource(composition, composition.layers[1]!.id, cameraSource());
    const painted = presentComposition(composition, { theme, now: 0 });
    expect(painted.layout).toBe("composition");
    expect(painted.layers).toHaveLength(2);
    expect(painted.layers?.map((layer) => layer.model.layout).sort()).toEqual(["scripture", "title"]);
  });

  it("stacks a lower third above a camera without mutating Program", () => {
    const overlay = COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third");
    let composition = instantiateTemplate(overlay!, "Camera + Lower Third");
    composition = assignLayerSource(composition, composition.layers[0]!.id, cameraSource());
    composition = assignLayerSource(
      composition,
      composition.layers[1]!.id,
      sourceRef("lower-third", "speaker", "Speaker", { title: "Pastor Isaac", subtitle: "Senior Pastor", templateId: "speaker" }),
    );
    const painted = presentComposition(composition, { theme, now: 0 });
    const order = painted.layers ?? [];
    expect(order[0]?.model.attribution).toBe("Camera");
    expect(order[1]?.model.layout).toBe("lower-third");
    expect(order[1]?.zIndex).toBeGreaterThan(order[0]!.zIndex);
    expect(order[1]?.bounds.y).toBeGreaterThan(50);

    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, painted, composition.id);
    expect(live.preview.model.layout).toBe("composition");
    expect(live.program).toEqual(program);
    const hidden = presentComposition(hideLayer(composition, composition.layers[1]!.id), { theme, now: 0 });
    live = previewComposition(live, hidden, composition.id);
    expect(live.preview.model.layers).toHaveLength(1);
    expect(live.program).toEqual(program);
  });
});

describe("composition Preview/Program safety", () => {
  it("editing a composition writes Preview; LIVE copies it to Program", () => {
    let composition = instantiateTemplate(
      COMPOSITION_TEMPLATES.find((entry) => entry.id === "split-two")!,
      "Look",
    );
    composition = assignLayerSource(composition, composition.layers[0]!.id, scriptureSource());
    composition = assignLayerSource(composition, composition.layers[1]!.id, cameraSource());
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(sameProgram({ ...live, program }, live)).toBe(true);
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layout).toBe("composition");
    expect(taken.program.sourceId).toBe(`composition:${composition.id}`);
    expect(taken.revision).toBeGreaterThan(live.revision);
  });

  it("replacing one source or the template stays off Program", () => {
    let composition = instantiateTemplate(
      COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-frame")!,
      "Full",
    );
    composition = assignLayerSource(composition, composition.layers[0]!.id, scriptureSource());
    let live = previewComposition(
      createLiveState(theme),
      presentComposition(composition, { theme, now: 0 }),
      composition.id,
    );
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    const onAir = live.program;
    composition = assignLayerSource(composition, composition.layers[0]!.id, cameraSource());
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.program).toEqual(onAir);
    expect(live.preview.model.layers?.[0]?.model.attribution).toBe("Camera");
  });

  it("compiled layers still use the existing scripture and camera paints", () => {
    expect(presentScripture({ theme, reference: "John 3:16", attribution: "KJV", verses: [{ verse: 16, text: "For God so loved the world." }] }).layout).toBe("scripture");
    expect(presentCamera({ theme, label: "Camera 1" }).attribution).toBe("Camera");
  });

  it("LIVE copies camera card and lower third; clearing the overlay stays off Program and off the audience feed", () => {
    const look = lookCameraLowerThird({
      camera: { id: "cam-1", label: "FaceTime HD" },
      title: "Pastor Isaac",
      subtitle: "Senior Pastor",
    });
    expect(look.layers[0]?.source.type).toBe("camera");
    expect(look.layers[1]?.source.type).toBe("lower-third");
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("Pastor Isaac");
    expect(painted.layers?.[1]?.model.attribution).toBe("Senior Pastor");
    expect(painted.layers?.[1]?.zIndex).toBeGreaterThan(painted.layers![0]!.zIndex);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title", "lower-third"]);
    expect(taken.program.model.layers?.[1]?.model.lines[0]?.text).toBe("Pastor Isaac");
    expect(taken.program.model).not.toHaveProperty("stream");

    const onAir = taken.program;
    live = previewComposition(taken, presentComposition(clearLowerThird(look), { theme, now: 0 }), look.id);
    expect(live.preview.model.layers).toHaveLength(1);
    expect(live.preview.model.layers?.[0]?.model.attribution).toBe("Camera");
    expect(live.program).toEqual(onAir);
  });

  it("LIVE copies camera card and countdown; clearing the timer stays off Program", () => {
    const look = lookCameraCountdown({
      camera: { id: "cam-1", label: "FaceTime HD" },
      durationMs: 10 * 60_000,
      label: "Service starts in",
    });
    expect(look.layers[0]?.source.type).toBe("camera");
    expect(look.layers[1]?.source.type).toBe("timer");
    expect(look.layers[1]?.bounds.x).toBeGreaterThan(50);
    expect(look.layers[1]?.bounds.y).toBeLessThan(40);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[1]?.model.layout).toBe("timer");
    expect(painted.layers?.[1]?.model.reference).toBe("Service starts in");
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("10:00");
    expect(painted.layers?.[1]?.zIndex).toBeGreaterThan(painted.layers![0]!.zIndex);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title", "timer"]);
    expect(taken.program.model.layers?.[1]?.model.lines[0]?.text).toBe("10:00");
    expect(taken.program.model).not.toHaveProperty("stream");

    const onAir = taken.program;
    live = previewComposition(taken, presentComposition(clearTimer(look), { theme, now: 0 }), look.id);
    expect(live.preview.model.layers).toHaveLength(1);
    expect(live.preview.model.layers?.[0]?.model.attribution).toBe("Camera");
    expect(live.program).toEqual(onAir);
  });

  it("LIVE copies scripture and camera card; filling the split stays off Program until LIVE", () => {
    const look = lookScriptureCamera({
      camera: { id: "cam-1", label: "FaceTime HD" },
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    expect(look.layers[0]?.source.type).toBe("scripture");
    expect(look.layers[1]?.source.type).toBe("camera");
    expect(look.layers[0]?.bounds.w).toBe(50);
    expect(look.layers[1]?.bounds.x).toBe(50);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["scripture", "title"]);
    expect(painted.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("For God so loved the world.");
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.attribution).toBe("Camera");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["scripture", "title"]);
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies lyrics and camera card; filling the split stays off Program until LIVE", () => {
    const look = lookLyricsCamera({
      camera: { id: "cam-1", label: "FaceTime HD" },
      label: "Verse 1",
      lines: ["Holy, holy, holy", "Lord God Almighty"],
    });
    expect(look.layers[0]?.source.type).toBe("song");
    expect(look.layers[1]?.source.type).toBe("camera");
    expect(look.layers[0]?.bounds.w).toBe(50);
    expect(look.layers[1]?.bounds.x).toBe(50);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["lyrics", "title"]);
    expect(painted.layers?.[0]?.model.reference).toBe("Verse 1");
    expect(painted.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Holy, holy, holy", "Lord God Almighty"]);
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.attribution).toBe("Camera");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["lyrics", "title"]);
    expect(taken.program.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Holy, holy, holy", "Lord God Almighty"]);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies image and camera card; filling the split stays off Program until LIVE", () => {
    const imageUrl = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const look = lookImageCamera({
      camera: { id: "cam-1", label: "FaceTime HD" },
      imageUrl,
      title: "Announcement slide",
    });
    expect(look.layers[0]?.source.type).toBe("image");
    expect(look.layers[1]?.source.type).toBe("camera");
    expect(look.layers[0]?.bounds.w).toBe(50);
    expect(look.layers[1]?.bounds.x).toBe(50);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["image", "title"]);
    expect(painted.layers?.[0]?.model.imageUrl).toBe(imageUrl);
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.attribution).toBe("Camera");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["image", "title"]);
    expect(taken.program.model.layers?.[0]?.model.imageUrl).toBe(imageUrl);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies two camera cards; filling the split stays off Program until LIVE", () => {
    const look = lookTwoCameras({
      left: { id: "cam-1", label: "FaceTime HD" },
      right: { id: "cam-2", label: "USB Capture" },
    });
    expect(look.layers.map((layer) => layer.source.type)).toEqual(["camera", "camera"]);
    expect(look.layers[0]?.bounds.w).toBe(50);
    expect(look.layers[1]?.bounds.x).toBe(50);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["title", "title"]);
    expect(painted.layers?.map((layer) => layer.model.lines[0]?.text)).toEqual(["FaceTime HD", "USB Capture"]);
    expect(painted.layers?.every((layer) => layer.model.attribution === "Camera")).toBe(true);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.lines[0]?.text)).toEqual(["FaceTime HD", "USB Capture"]);
    expect(taken.program.model).not.toHaveProperty("stream");

    const same = lookTwoCameras({
      left: { id: "cam-1", label: "FaceTime HD" },
      right: { id: "cam-1", label: "FaceTime HD" },
    });
    expect(same.layers.map((layer) => layer.source.id)).toEqual(["cam-1", "cam-1"]);
  });

  it("LIVE copies camera card and last presentation; filling the split stays off Program until LIVE", () => {
    const look = lookCameraPresentation({
      camera: { id: "cam-1", label: "FaceTime HD" },
      presentation: sourceRef("scripture", "John 3:16", "John 3:16", {
        reference: "John 3:16",
        body: "For God so loved the world.",
        attribution: "KJV",
        verse: "16",
      }),
    });
    expect(look.layers[0]?.source.type).toBe("camera");
    expect(look.layers[1]?.source.type).toBe("scripture");
    expect(look.layers[0]?.bounds.w).toBe(50);
    expect(look.layers[1]?.bounds.x).toBe(50);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["title", "scripture"]);
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.reference).toBe("John 3:16");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title", "scripture"]);
    expect(taken.program.model.layers?.[1]?.model.lines[0]?.text).toBe("For God so loved the world.");
    expect(taken.program.model).not.toHaveProperty("stream");

    const lyrics = lookCameraPresentation({
      camera: { id: "cam-1", label: "FaceTime HD" },
      presentation: sourceRef("song", "Verse 1", "Verse 1", { label: "Verse 1", body: "Holy, holy, holy" }),
    });
    expect(lyrics.layers[1]?.source.type).toBe("song");
    expect(presentComposition(lyrics, { theme, now: 0 }).layers?.[1]?.model.layout).toBe("lyrics");
  });

  it("LIVE copies a full-frame camera card; filling stays off Program until LIVE", () => {
    const look = lookFullCamera({ camera: { id: "cam-1", label: "FaceTime HD" } });
    expect(look.layers).toHaveLength(1);
    expect(look.layers[0]?.source.type).toBe("camera");
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["title"]);
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[0]?.model.attribution).toBe("Camera");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title"]);
    expect(taken.program.model.layers?.[0]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies a full-frame scripture; filling stays off Program until LIVE", () => {
    const look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    expect(look.layers).toHaveLength(1);
    expect(look.layers[0]?.source.type).toBe("scripture");
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["scripture"]);
    expect(painted.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("For God so loved the world.");
    expect(painted.layers?.[0]?.model.attribution).toBe("KJV");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["scripture"]);
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies a full-frame lyrics; filling stays off Program until LIVE", () => {
    const look = lookFullLyrics({
      label: "Verse 1",
      lines: ["Holy, holy, holy", "Lord God Almighty"],
    });
    expect(look.layers).toHaveLength(1);
    expect(look.layers[0]?.source.type).toBe("song");
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["lyrics"]);
    expect(painted.layers?.[0]?.model.reference).toBe("Verse 1");
    expect(painted.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Holy, holy, holy", "Lord God Almighty"]);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["lyrics"]);
    expect(taken.program.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Holy, holy, holy", "Lord God Almighty"]);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies a full-frame countdown; filling stays off Program until LIVE", () => {
    const look = lookCountdown({ durationMs: 10 * 60_000, label: "Service starts in" });
    expect(look.layers).toHaveLength(1);
    expect(look.layers[0]?.source.type).toBe("timer");
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["timer"]);
    expect(painted.layers?.[0]?.model.reference).toBe("Service starts in");
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("10:00");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["timer"]);
    expect(taken.program.model.layers?.[0]?.model.lines[0]?.text).toBe("10:00");
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies count-up and clock timers; filling stays off Program until LIVE", () => {
    const up = lookCountdown({ durationMs: 5_000, label: "Elapsed", mode: "countup" });
    expect(up.layers[0]?.source.payload.mode).toBe("countup");
    const paintedUp = presentComposition(up, { theme, now: 0 });
    expect(paintedUp.layers?.[0]?.model.timer?.mode).toBe("countup");
    expect(paintedUp.layers?.[0]?.model.reference).toBe("Elapsed");
    expect(paintedUp.layers?.[0]?.model.lines[0]?.text).toBe("00:00");

    let live = previewComposition(createLiveState(theme), paintedUp, up.id);
    expect(live.program.model.layout).not.toBe("composition");
    const takenUp = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(takenUp.program.model.layers?.[0]?.model.timer?.mode).toBe("countup");
    expect(takenUp.program.model.layers?.[0]?.model.lines[0]?.text).toBe("00:00");
    expect(takenUp.program.model).not.toHaveProperty("stream");

    const clock = lookCountdown({ label: "Now", mode: "clock" });
    expect(clock.layers[0]?.source.payload.mode).toBe("clock");
    const paintedClock = presentComposition(clock, { theme, now: 0 });
    expect(paintedClock.layers?.[0]?.model.timer?.mode).toBe("clock");
    expect(paintedClock.layers?.[0]?.model.lines[0]?.text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    live = previewComposition(createLiveState(theme), paintedClock, clock.id);
    expect(live.program.model.layout).not.toBe("composition");
    const takenClock = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(takenClock.program.model.layers?.[0]?.model.timer?.mode).toBe("clock");
    expect(takenClock.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies a full-frame announcement; filling stays off Program until LIVE", () => {
    const look = lookAnnouncement({ heading: "Welcome", body: "Please join us after the service." });
    expect(look.layers).toHaveLength(1);
    expect(look.layers[0]?.source.type).toBe("text");
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["title"]);
    expect(painted.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Welcome", "Please join us after the service."]);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title"]);
    expect(taken.program.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Welcome", "Please join us after the service."]);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("editing announcement copy writes Preview; LIVE copies the new copy", () => {
    let look = lookAnnouncement({ heading: "Welcome", body: "Please join us after the service." });
    look = assignText(look, look.layers[0]!.id, "Potluck", "Fellowship hall at noon.");
    expect(look.layers[0]?.source.payload.heading).toBe("Potluck");
    expect(look.layers[0]?.source.payload.body).toBe("Fellowship hall at noon.");
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Potluck", "Fellowship hall at noon."]);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Potluck", "Fellowship hall at noon."]);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies two regions; filling the split stays off Program until LIVE", () => {
    const look = lookTwoRegions({
      left: sourceRef("text", "announcement", "Welcome", {
        heading: "Welcome",
        body: "Please join us after the service.",
      }),
      right: sourceRef("camera", "cam-1", "FaceTime HD", { deviceId: "cam-1", label: "FaceTime HD" }),
    });
    expect(look.layers).toHaveLength(2);
    expect(look.layers.map((layer) => layer.source.type)).toEqual(["text", "camera"]);
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 50, h: 100 });
    expect(look.layers[1]?.bounds).toEqual({ x: 50, y: 0, w: 50, h: 100 });
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["title", "title"]);
    expect(painted.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Welcome", "Please join us after the service."]);
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("FaceTime HD");
    expect(painted.layers?.[1]?.model.attribution).toBe("Camera");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title", "title"]);
    expect(taken.program.model.layers?.map((layer) => layer.model.lines.map((line) => line.text))).toEqual([
      ["Welcome", "Please join us after the service."],
      ["FaceTime HD"],
    ]);
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("applies a lower-third template without Taking", () => {
    const speaker = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === "speaker");
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third")!, "LT");
    composition = applyLowerThirdTemplate(composition, composition.layers[1]!.id, speaker!, "Pastor Isaac", "Senior Pastor");
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers?.[1]?.model.lines[0]?.text).toBe("Pastor Isaac");
    expect(live.preview.model.layers?.[1]?.animation?.entrance).toBe("slide-up");
    expect(live.program).toEqual(program);
  });

  it("lets a plugin compiler paint a source without Taking", () => {
    registerSourceCompiler("plugin", (source, ctx) => presentText({ theme: ctx.theme, layout: "title", heading: source.title, body: "plugin-body" }));
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-frame")!, "Plugin");
    composition = assignLayerSource(composition, composition.layers[0]!.id, sourceRef("plugin", "plug-1", "Plugin Cam"));
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual(["Plugin Cam", "plugin-body"]);
    expect(live.program).toEqual(program);
  });
});

describe("composition output", () => {
  it("publishes one composition packet to browser and desktop sinks; a sink failure does not Take or corrupt Program", async () => {
    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "split-two")!, "Look");
    composition = assignLayerSource(composition, composition.layers[0]!.id, scriptureSource());
    composition = assignLayerSource(composition, composition.layers[1]!.id, cameraSource());
    let live = previewComposition(createLiveState(theme), presentComposition(composition, { theme, now: 0 }), composition.id);
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    const packet = programPacket(live, 450);
    expect(packet.frame.model.layout).toBe("composition");
    expect(packet.frame).toEqual(live.program);
    const browser = outputSinks(false, detectOutputCapabilities({ desktop: false, open: () => null }));
    const desktop = outputSinks(true, detectOutputCapabilities({ desktop: true }));
    expect(browser.find((sink) => sink.kind === "browser-window")?.available).toBe(true);
    expect(desktop.find((sink) => sink.kind === "tauri-window")?.available).toBe(true);
    const onAir = live.program;
    expect(await deliverProgram(packet, () => {
      throw new Error("sink down");
    })).toBe(false);
    expect(live.program).toEqual(onAir);
    expect(live.revision).toBeGreaterThan(0);
  });
});
