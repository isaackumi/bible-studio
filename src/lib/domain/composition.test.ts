import { describe, expect, it } from "vitest";
import { defaultTheme } from "./theme";
import { presentScripture, presentText } from "./present";
import { presentCamera } from "./camera";
import {
  setLayerStyle,
  moveLook,
  setCompositionColor,
  lookMultiCamera,
  moveLayerTo,
  addLayer,
  applyLowerThirdTemplate,
  lowerThirdCopy,
  assignLayerSource,
  COMPOSITION_TEMPLATES,
  createComposition,
  hideLayer,
  instantiateTemplate,
  lookCameraLowerThird,
  lookCameraCountdown,
  lookScriptureCamera,
  lookScriptureClock,
  lookScriptureCountdown,
  swapSides,
  fillTemplate,
  layoutFromLook,
  sanitizeLayouts,
  COMPOSITION_TEMPLATES as LAYOUTS,
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
  assignScripture,
  assignSong,
  setLayerOpacity,
  setLayerFit,
  setLayerLocked,
  setLayerAnimation,
  applyLayerDrag,
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
  persistLook,
  removeLook,
  createScene,
  setCompositionLocked,
  layerStackFrontFirst,
  renameComposition,
  renameLayer,
  removeLayer,
  duplicateLayer,
  duplicateLook,
  setCompositionTransition,
  takeTransitionForPreview,
  compositionSourceId,
  compositionRundownItem,
  queueLook,
  presentSavedLook,
  sourceRef,
  setCompositionEdges,
  setCompositionEdgeColor,
  scriptureLayerOf,
  withLiveScripture,
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

  it("renames and removes layers, then reindexes z-order", () => {
    let composition = createComposition("Layers");
    composition = addLayer(composition, { name: "A", bounds: { x: 0, y: 0, w: 50, h: 100 }, source: scriptureSource() });
    composition = addLayer(composition, { name: "B", bounds: { x: 50, y: 0, w: 50, h: 100 }, source: cameraSource() });
    composition = renameLayer(composition, composition.layers[0]!.id, "Scripture");
    expect(composition.layers[0]?.name).toBe("Scripture");
    expect(renameLayer(composition, composition.layers[0]!.id, "   ").layers[0]?.name).toBe("Scripture");
    const cameraId = composition.layers[1]!.id;
    composition = removeLayer(composition, composition.layers[0]!.id);
    expect(composition.layers).toHaveLength(1);
    expect(composition.layers[0]?.id).toBe(cameraId);
    expect(composition.layers[0]?.zIndex).toBe(0);
    expect(removeLayer(composition, "missing").layers).toHaveLength(1);
  });

  it("duplicates a layer with a new id and name without Taking", () => {
    let composition = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    const originalId = composition.layers[0]!.id;
    composition = setLayerAnimation(composition, originalId, { entrance: "slide-up", durationMs: 800 });
    composition = duplicateLayer(composition, originalId);
    expect(composition.layers).toHaveLength(2);
    expect(composition.layers[1]?.id).not.toBe(originalId);
    expect(composition.layers[1]?.name).toBe("Main copy");
    expect(composition.layers[1]?.source.type).toBe("scripture");
    expect(composition.layers[1]?.animation.entrance).toBe("slide-up");
    expect(composition.layers[1]?.animation.durationMs).toBe(800);
    expect(composition.layers[1]?.zIndex).toBe(1);
    expect(duplicateLayer(composition, "missing").layers).toHaveLength(2);

    let live = previewComposition(createLiveState(theme), presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers).toHaveLength(2);
    composition = removeLayer(composition, composition.layers[1]!.id);
    live = previewComposition(taken, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers).toHaveLength(1);
    expect(live.program.model.layers).toHaveLength(2);
  });

  it("sets look transition on Preview only; LIVE still uses the prior Program frame", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    expect(look.transition).toEqual({ type: "fade", ms: 450 });
    look = setCompositionTransition(look, { type: "cut", ms: 0 });
    expect(look.transition).toEqual({ type: "cut", ms: 0 });
    look = setCompositionTransition(look, { type: "fade", ms: 900 });
    expect(look.transition).toEqual({ type: "fade", ms: 900 });
    expect(setCompositionTransition(look, { type: "fade", ms: -50 }).transition.ms).toBe(0);
    expect(setCompositionTransition(look, { type: "fade", ms: 9999 }).transition.ms).toBe(2000);
    const saved = sanitizeComposition(look);
    expect(restoreComposition(JSON.parse(JSON.stringify(saved))).transition).toEqual({ type: "fade", ms: 900 });

    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    look = setCompositionTransition(look, { type: "cut", ms: 0 });
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layout).toBe("composition");
    expect(live.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(live.program.sourceId).toBe(look.id);
  });

  it("preview source id equals the look id without a double composition prefix", () => {
    const look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    expect(look.id.startsWith("composition:")).toBe(true);
    expect(compositionSourceId(look.id)).toBe(look.id);
    expect(compositionSourceId("bare-id")).toBe("composition:bare-id");
    const live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.sourceId).toBe(look.id);
    expect(live.preview.sourceId).not.toMatch(/^composition:composition:/);
  });

  it("TAKE of a look uses that look's transition; other sources keep the theme fade", () => {
    const themeFade = { type: "fade" as const, ms: 450 };
    let look = setCompositionTransition(
      lookFullScripture({
        reference: "John 3:16",
        body: "For God so loved the world.",
        attribution: "KJV",
        verse: 16,
      }),
      { type: "cut", ms: 0 },
    );
    expect(takeTransitionForPreview(look.id, [look], themeFade)).toEqual({ type: "cut", ms: 0 });
    expect(takeTransitionForPreview(`composition:${look.id}`, [look], themeFade)).toEqual({ type: "cut", ms: 0 });
    look = setCompositionTransition(look, { type: "fade", ms: 900 });
    expect(takeTransitionForPreview(look.id, [look], themeFade)).toEqual({ type: "fade", ms: 900 });
    expect(takeTransitionForPreview("item-a", [look], themeFade)).toEqual(themeFade);
    expect(takeTransitionForPreview(look.id, [], themeFade)).toEqual(themeFade);

    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    const cutLook = setCompositionTransition(look, { type: "cut", ms: 0 });
    const resolved = takeTransitionForPreview(live.preview.sourceId, [cutLook], themeFade);
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null }, { transition: resolved.type });
    expect(live.program.transition).toBe("cut");
    expect(programPacket(live, resolved.ms).transitionMs).toBe(0);

    live = previewComposition(live, presentComposition(look, { theme, now: 0 }), look.id);
    const fadeResolved = takeTransitionForPreview(live.preview.sourceId, [look], themeFade);
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null }, { transition: fadeResolved.type });
    expect(live.program.transition).toBe("fade");
    expect(programPacket(live, fadeResolved.ms).transitionMs).toBe(900);
  });

  it("duplicates a saved look with a new id and layer ids; restore stays on Preview", () => {
    const look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    const copy = duplicateLook(look);
    expect(copy.id).not.toBe(look.id);
    expect(copy.name).toBe("Full Scripture copy");
    expect(copy.layers).toHaveLength(1);
    expect(copy.layers[0]?.id).not.toBe(look.layers[0]?.id);
    expect(copy.layers[0]?.source.payload.reference).toBe("John 3:16");
    const saved = persistLook(persistLook([], look), copy);
    expect(saved).toHaveLength(2);
    let live = previewComposition(createLiveState(theme), presentComposition(copy, { theme, now: 0 }), copy.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
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
    expect(taken.program.sourceId).toBe(composition.id);
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
    expect(painted.layers?.[1]?.model.lines[0]?.text).toBe("00:10:00");
    expect(painted.layers?.[1]?.zIndex).toBeGreaterThan(painted.layers![0]!.zIndex);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["title", "timer"]);
    expect(taken.program.model.layers?.[1]?.model.lines[0]?.text).toBe("00:10:00");
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
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("00:10:00");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.map((layer) => layer.model.layout)).toEqual(["timer"]);
    expect(taken.program.model.layers?.[0]?.model.lines[0]?.text).toBe("00:10:00");
    expect(taken.program.model).not.toHaveProperty("stream");
  });

  it("LIVE copies count-up and clock timers; filling stays off Program until LIVE", () => {
    const up = lookCountdown({ durationMs: 5_000, label: "Elapsed", mode: "countup" });
    expect(up.layers[0]?.source.payload.mode).toBe("countup");
    const paintedUp = presentComposition(up, { theme, now: 0 });
    expect(paintedUp.layers?.[0]?.model.timer?.mode).toBe("countup");
    expect(paintedUp.layers?.[0]?.model.reference).toBe("Elapsed");
    expect(paintedUp.layers?.[0]?.model.lines[0]?.text).toBe("00:00:00");

    let live = previewComposition(createLiveState(theme), paintedUp, up.id);
    expect(live.program.model.layout).not.toBe("composition");
    const takenUp = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(takenUp.program.model.layers?.[0]?.model.timer?.mode).toBe("countup");
    expect(takenUp.program.model.layers?.[0]?.model.lines[0]?.text).toBe("00:00:00");
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

  it("LIVE copies a target-time timer; filling stays off Program until LIVE", () => {
    const look = lookCountdown({ label: "Go live", mode: "target", targetAt: 60_000 });
    expect(look.layers[0]?.source.payload.mode).toBe("target");
    expect(look.layers[0]?.source.payload.targetAt).toBe("60000");
    const painted = presentComposition(look, { theme, now: 50_000 });
    expect(painted.layers?.[0]?.model.timer?.mode).toBe("target");
    expect(painted.layers?.[0]?.model.timer?.targetAt).toBe(60_000);
    expect(painted.layers?.[0]?.model.lines[0]?.text).toBe("00:00:10");

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.timer?.mode).toBe("target");
    expect(taken.program.model.layers?.[0]?.model.timer?.targetAt).toBe(60_000);
    expect(taken.program.model).not.toHaveProperty("stream");

    const later = lookCountdown({ label: "Go live", mode: "target", targetAt: 90_000 });
    live = previewComposition(taken, presentComposition(later, { theme, now: 50_000 }), later.id);
    expect(live.preview.model.layers?.[0]?.model.timer?.targetAt).toBe(90_000);
    expect(live.program.model.layers?.[0]?.model.timer?.targetAt).toBe(60_000);
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

  it("editing scripture copy writes Preview; LIVE copies the previous verse", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    look = assignScripture(look, look.layers[0]!.id, {
      reference: "Genesis 1:3",
      body: "And God said, Let there be light.",
      attribution: "KJV",
      verse: 3,
    });
    expect(look.layers[0]?.source.payload.reference).toBe("Genesis 1:3");
    expect(assignScripture(look, look.layers[0]!.id, { reference: "  ", body: "x" }).layers[0]?.source.payload.reference).toBe(
      "Scripture",
    );
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.model.reference).toBe("Genesis 1:3");
    expect(live.preview.model.layers?.[0]?.model.lines[0]?.text).toContain("Let there be light");
    expect(live.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
  });

  it("editing lyrics copy writes Preview; LIVE copies the previous section", () => {
    let look = lookFullLyrics({ label: "Verse 1", lines: ["Holy, holy, holy"] });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.lines[0]?.text).toBe("Holy, holy, holy");
    look = assignSong(look, look.layers[0]!.id, { label: "Chorus", body: "Merciful and mighty\nGod in three persons" });
    expect(look.layers[0]?.source.payload.label).toBe("Chorus");
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.model.reference).toBe("Chorus");
    expect(live.preview.model.layers?.[0]?.model.lines.map((line) => line.text)).toEqual([
      "Merciful and mighty",
      "God in three persons",
    ]);
    expect(live.program.model.layers?.[0]?.model.lines[0]?.text).toBe("Holy, holy, holy");
  });

  it("changing layer opacity writes Preview; LIVE copies the faded layer", () => {
    let look = lookAnnouncement({ heading: "Welcome", body: "Please join us after the service." });
    expect(look.layers[0]?.opacity).toBe(1);
    look = setLayerOpacity(look, look.layers[0]!.id, 0.4);
    expect(look.layers[0]?.opacity).toBe(0.4);
    expect(setLayerOpacity(look, look.layers[0]!.id, 2).layers[0]?.opacity).toBe(1);
    expect(setLayerOpacity(look, look.layers[0]!.id, -0.2).layers[0]?.opacity).toBe(0);
    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[0]?.opacity).toBe(0.4);

    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.opacity).toBe(0.4);
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

  it("dragging a layer writes Preview; LIVE copies the new bounds", () => {
    let look = lookTwoRegions({
      left: sourceRef("text", "announcement", "Welcome", {
        heading: "Welcome",
        body: "Please join us after the service.",
      }),
      right: sourceRef("camera", "cam-1", "FaceTime HD", { deviceId: "cam-1", label: "FaceTime HD" }),
    });
    const left = look.layers[0]!;
    const right = look.layers[1]!;
    look = applyLayerDrag(look, left.id, "e", { dx: 10, dy: 0 });
    expect(look.layers[0]?.bounds).toEqual({ x: 0, y: 0, w: 60, h: 100 });
    look = applyLayerDrag(look, right.id, "w", { dx: 10, dy: 0 });
    expect(look.layers[1]?.bounds).toEqual({ x: 60, y: 0, w: 40, h: 100 });
    look = applyLayerDrag(look, right.id, "move", { dx: -5, dy: 0 });
    expect(look.layers[1]?.bounds).toEqual({ x: 55, y: 0, w: 40, h: 100 });
    look = applyLayerDrag(look, right.id, "se", { dx: 50, dy: 0 });
    expect(look.layers[1]?.bounds.x + look.layers[1]!.bounds.w).toBe(100);
    expect(look.layers[1]?.bounds.w).toBe(45);

    const locked = { ...look, layers: look.layers.map((layer) => (layer.id === left.id ? { ...layer, locked: true } : layer)) };
    expect(applyLayerDrag(locked, left.id, "move", { dx: 8, dy: 8 }).layers[0]?.bounds).toEqual(locked.layers[0]?.bounds);

    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[0]?.bounds).toEqual({ x: 0, y: 0, w: 60, h: 100 });
    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.bounds).toEqual({ x: 0, y: 0, w: 60, h: 100 });
    const after = applyLayerDrag(look, left.id, "move", { dx: 5, dy: 5 });
    const later = previewComposition(taken, presentComposition(after, { theme, now: 0 }), after.id);
    expect(later.program.model.layers?.[0]?.bounds).toEqual({ x: 0, y: 0, w: 60, h: 100 });
    expect(later.preview.model.layers?.[0]?.bounds.x).toBe(5);
  });

  it("changing layer fit or lock writes Preview; LIVE copies fit; lock blocks drag", () => {
    let look = lookTwoRegions({
      left: sourceRef("text", "announcement", "Welcome", {
        heading: "Welcome",
        body: "Please join us after the service.",
      }),
      right: sourceRef("camera", "cam-1", "FaceTime HD", { deviceId: "cam-1", label: "FaceTime HD" }),
    });
    const left = look.layers[0]!;
    expect(look.layers[0]?.fit).toBe("contain");
    look = setLayerFit(look, left.id, "cover");
    expect(look.layers[0]?.fit).toBe("cover");
    look = setLayerFit(look, left.id, "stretch" as "fill");
    expect(look.layers[0]?.fit).toBe("contain");
    look = setLayerFit(look, left.id, "fill");
    expect(look.layers[0]?.fit).toBe("fill");
    look = setLayerLocked(look, left.id, true);
    expect(look.layers[0]?.locked).toBe(true);
    expect(applyLayerDrag(look, left.id, "move", { dx: 8, dy: 0 }).layers[0]?.bounds).toEqual(look.layers[0]?.bounds);
    look = setLayerLocked(look, left.id, false);
    look = applyLayerDrag(look, left.id, "move", { dx: 8, dy: 0 });
    expect(look.layers[0]?.bounds.x).toBe(8);

    const painted = presentComposition(look, { theme, now: 0 });
    expect(painted.layers?.[0]?.fit).toBe("fill");
    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.fit).toBe("fill");
    const after = setLayerFit(look, left.id, "cover");
    live = previewComposition(taken, presentComposition(after, { theme, now: 0 }), after.id);
    expect(live.preview.model.layers?.[0]?.fit).toBe("cover");
    expect(live.program.model.layers?.[0]?.fit).toBe("fill");
  });

  it("locked layer rejects numeric resize; LIVE still copies prior bounds", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    const layerId = look.layers[0]!.id;
    const origin = look.layers[0]!.bounds;
    look = setLayerLocked(look, layerId, true);
    expect(resizeLayer(look, layerId, { x: 12, y: 8, w: 50, h: 40 }).layers[0]?.bounds).toEqual(origin);
    look = setLayerLocked(look, layerId, false);
    look = resizeLayer(look, layerId, { x: 12, y: 8, w: 50, h: 40 });
    expect(look.layers[0]?.bounds).toEqual({ x: 12, y: 8, w: 50, h: 40 });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.bounds).toEqual({ x: 12, y: 8, w: 50, h: 40 });
    look = setLayerLocked(look, layerId, true);
    const blocked = resizeLayer(look, layerId, { x: 0, y: 0, w: 100, h: 100 });
    live = previewComposition(taken, presentComposition(blocked, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.bounds).toEqual({ x: 12, y: 8, w: 50, h: 40 });
    expect(live.program.model.layers?.[0]?.bounds).toEqual({ x: 12, y: 8, w: 50, h: 40 });
  });

  it("fills scripture, song, and announcement lower thirds from the desk; LIVE copies them", () => {
    const scripture = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === "scripture-ref")!;
    const song = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === "song-title")!;
    const announcement = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === "announcement")!;
    const speaker = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === "speaker")!;
    const desk = {
      title: "Pastor Isaac",
      subtitle: "Senior Pastor",
      scripture: { reference: "John 3:16", attribution: "KJV" },
      song: { title: "Holy, holy, holy", author: "Heber" },
      announcement: { heading: "Welcome", body: "Please join us after the service." },
    };
    expect(lowerThirdCopy(scripture, desk)).toEqual({ title: "John 3:16", subtitle: "KJV" });
    expect(lowerThirdCopy(song, desk)).toEqual({ title: "Holy, holy, holy", subtitle: "Heber" });
    expect(lowerThirdCopy(announcement, desk)).toEqual({ title: "Welcome", subtitle: "Please join us after the service." });
    expect(lowerThirdCopy(speaker, desk)).toEqual({ title: "Pastor Isaac", subtitle: "Senior Pastor" });

    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third")!, "LT");
    const copy = lowerThirdCopy(scripture, desk);
    composition = applyLowerThirdTemplate(composition, composition.layers[1]!.id, scripture, copy.title, copy.subtitle);
    let live = previewComposition(createLiveState(theme), presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers?.[1]?.model.lines[0]?.text).toBe("John 3:16");
    expect(live.preview.model.layers?.[1]?.model.attribution).toBe("KJV");
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[1]?.model.lines[0]?.text).toBe("John 3:16");
    const later = applyLowerThirdTemplate(composition, composition.layers[1]!.id, speaker, "Pastor Isaac", "Senior Pastor");
    live = previewComposition(taken, presentComposition(later, { theme, now: 0 }), later.id);
    expect(live.preview.model.layers?.[1]?.model.lines[0]?.text).toBe("Pastor Isaac");
    expect(live.program.model.layers?.[1]?.model.lines[0]?.text).toBe("John 3:16");
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

  it("changing layer entrance writes Preview; LIVE copies the previous animation", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    look = setLayerAnimation(look, look.layers[0]!.id, { entrance: "fade" });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.animation?.entrance).toBe("fade");
    look = setLayerAnimation(look, look.layers[0]!.id, { entrance: "slide-up", durationMs: 800 });
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.animation?.entrance).toBe("slide-up");
    expect(live.preview.model.layers?.[0]?.animation?.durationMs).toBe(800);
    expect(live.program.model.layers?.[0]?.animation?.entrance).toBe("fade");
    expect(setLayerAnimation(look, look.layers[0]!.id, { entrance: "stretch" as "fade" }).layers[0]?.animation.entrance).toBe("fade");
  });

  it("changing layer exit writes Preview; LIVE copies the previous exit", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    look = setLayerAnimation(look, look.layers[0]!.id, { exit: "fade" });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.animation?.exit).toBe("fade");
    look = setLayerAnimation(look, look.layers[0]!.id, { exit: "slide-down", durationMs: 600 });
    const saved = sanitizeComposition(look);
    expect(restoreComposition(JSON.parse(JSON.stringify(saved))).layers[0]?.animation.exit).toBe("slide-down");
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.animation?.exit).toBe("slide-down");
    expect(live.preview.model.layers?.[0]?.animation?.durationMs).toBe(600);
    expect(live.program.model.layers?.[0]?.animation?.exit).toBe("fade");
    expect(setLayerAnimation(look, look.layers[0]!.id, { exit: "stretch" as "fade" }).layers[0]?.animation.exit).toBe("fade");
  });

  it("changing layer easing writes Preview; LIVE copies the previous easing", () => {
    let look = lookFullScripture({
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    look = setLayerAnimation(look, look.layers[0]!.id, { easing: "ease-out" });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.animation?.easing).toBe("ease-out");
    look = setLayerAnimation(look, look.layers[0]!.id, { easing: "linear" });
    const saved = sanitizeComposition(look);
    expect(restoreComposition(JSON.parse(JSON.stringify(saved))).layers[0]?.animation.easing).toBe("linear");
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.animation?.easing).toBe("linear");
    expect(live.program.model.layers?.[0]?.animation?.easing).toBe("ease-out");
    expect(setLayerAnimation(look, look.layers[0]!.id, { easing: "bounce" as "linear" }).layers[0]?.animation.easing).toBe(
      "ease-out",
    );
  });

  it("adding or removing a layer writes Preview; LIVE copies the previous stack", () => {
    let look = lookFullCamera({ camera: { id: "cam-1", label: "FaceTime HD" } });
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers).toHaveLength(1);
    look = addLayer(look, {
      name: "Lower third",
      bounds: { x: 6, y: 72, w: 55, h: 22 },
      source: sourceRef("lower-third", "speaker", "Speaker", { title: "Pastor Isaac", subtitle: "Senior Pastor", templateId: "speaker" }),
    });
    live = previewComposition(taken, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers).toHaveLength(2);
    expect(live.program.model.layers).toHaveLength(1);
    look = removeLayer(look, look.layers[1]!.id);
    live = previewComposition(live, presentComposition(look, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers).toHaveLength(1);
    expect(live.program.model.layers).toHaveLength(1);
    expect(live.program.model.layers?.[0]?.model.lines[0]?.text).toBe("FaceTime HD");
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

describe("saved compositions", () => {
  const verse = {
    reference: "John 3:16",
    body: "For God so loved the world.",
    attribution: "KJV",
    verse: 16,
  };

  it("persists and renames a look without Taking", () => {
    const look = lookFullScripture(verse);
    const saved = persistLook([], look);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(look.id);
    const again = persistLook(saved, renameComposition(look, "Sunday opener"));
    expect(again).toHaveLength(1);
    expect(again[0]?.name).toBe("Sunday opener");
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(restoreComposition(again[0]!), { theme, now: 0 }), look.id);
    expect(live.program).toEqual(program);
  });

  it("queues a rundown item that restores Preview from the saved look; LIVE copies Program", () => {
    const look = lookFullScripture(verse);
    const looks = persistLook([], look);
    const item = compositionRundownItem(look);
    expect(item.kind).toBe("composition");
    expect(item.title).toBe("Full Scripture");
    expect(item.composition?.compositionId).toBe(look.id);
    const painted = presentSavedLook(looks, item.composition!.compositionId, { theme, now: 0 });
    expect(painted.layout).toBe("composition");
    expect(painted.layers?.[0]?.model.reference).toBe("John 3:16");
    let live = previewComposition(createLiveState(theme), painted, look.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    const later = persistLook(
      looks,
      assignLayerSource(
        look,
        look.layers[0]!.id,
        sourceRef("scripture", "gen-13", "Genesis 1:3", {
          reference: "Genesis 1:3",
          body: "And God said, Let there be light.",
          attribution: "KJV",
        }),
      ),
    );
    live = previewComposition(taken, presentSavedLook(later, item.composition!.compositionId, { theme, now: 0 }), look.id);
    expect(live.preview.model.layers?.[0]?.model.reference).toBe("Genesis 1:3");
    expect(live.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
  });

  it("queueing an unsaved look persists it first", () => {
    const look = lookFullScripture(verse);
    const queued = queueLook([], look);
    expect(queued.looks).toHaveLength(1);
    expect(queued.item.composition?.compositionId).toBe(look.id);
    expect(presentSavedLook(queued.looks, queued.item.composition!.compositionId, { theme, now: 0 }).layout).toBe("composition");
  });

  it("a missing saved look paints empty and does not Take", () => {
    const item = compositionRundownItem(lookFullScripture(verse));
    const painted = presentSavedLook([], item.composition!.compositionId, { theme, now: 0 });
    expect(painted.layout).toBe("empty");
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, painted, item.composition!.compositionId);
    expect(live.program).toEqual(program);
  });

  it("removing a saved look leaves Program alone and restores empty for that id", () => {
    const look = lookFullScripture(verse);
    const other = lookAnnouncement({ heading: "Welcome", body: "Join us." });
    const saved = persistLook(persistLook([], look), other);
    expect(saved).toHaveLength(2);
    let live = previewComposition(createLiveState(theme), presentComposition(look, { theme, now: 0 }), look.id);
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(live.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
    const onAir = live.program;
    const remaining = removeLook(saved, look.id);
    expect(remaining.map((entry) => entry.id)).toEqual([other.id]);
    expect(removeLook(remaining, look.id)).toEqual(remaining);
    expect(presentSavedLook(remaining, look.id, { theme, now: 0 }).layout).toBe("empty");
    live = previewComposition(live, presentSavedLook(remaining, look.id, { theme, now: 0 }), look.id);
    expect(live.program).toEqual(onAir);
  });

  it("scene lock freezes edits; unlock restores mutation; TAKE still works", () => {
    let scene = createScene("Opener");
    expect(scene.locked).toBe(false);
    expect(scene.layers).toHaveLength(1);
    expect(layerStackFrontFirst(scene)[0]?.id).toBe(scene.layers[0]?.id);
    scene = assignScripture(scene, scene.layers[0]!.id, {
      reference: "John 3:16",
      body: "For God so loved the world.",
      attribution: "KJV",
      verse: 16,
    });
    scene = setCompositionLocked(scene, true);
    const frozen = scene;
    expect(renameComposition(scene, "Later")).toBe(scene);
    expect(addLayer(scene, { name: "Extra", bounds: { x: 0, y: 0, w: 50, h: 50 } })).toBe(scene);
    expect(resizeLayer(scene, scene.layers[0]!.id, { x: 10, y: 10, w: 40, h: 40 })).toBe(scene);
    expect(setCompositionTransition(scene, { type: "cut", ms: 0 })).toBe(scene);
    expect(assignScripture(scene, scene.layers[0]!.id, { reference: "Genesis 1:1", body: "In the beginning." })).toBe(scene);
    const saved = sanitizeComposition(scene);
    expect(restoreComposition(JSON.parse(JSON.stringify(saved))).locked).toBe(true);
    expect(duplicateLook(scene).locked).toBe(false);

    let live = previewComposition(createLiveState(theme), presentComposition(scene, { theme, now: 0 }), scene.id);
    expect(live.program.model.layout).not.toBe("composition");
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layers?.[0]?.model.reference).toBe("John 3:16");

    scene = setCompositionLocked(frozen, false);
    scene = renameComposition(scene, "Sunday opener");
    expect(scene.name).toBe("Sunday opener");
    live = previewComposition(taken, presentComposition(scene, { theme, now: 0 }), scene.id);
    expect(live.preview.model.layers?.[0]?.model.reference).toBe("John 3:16");
    expect(live.program.model.layers?.[0]?.model.reference).toBe("John 3:16");
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

describe("scene editor helpers", () => {
  it("drags a layer to any place in the front-first stack", () => {
    let scene = createComposition("S");
    for (const name of ["Back", "Middle", "Front"]) scene = addLayer(scene, { name, bounds: { x: 0, y: 0, w: 100, h: 100 } });
    const names = (look: typeof scene) => layerStackFrontFirst(look).map((layer) => layer.name);
    expect(names(scene)).toEqual(["Front", "Middle", "Back"]);
    const back = scene.layers.find((layer) => layer.name === "Back")!;
    expect(names(moveLayerTo(scene, back.id, 0))).toEqual(["Back", "Front", "Middle"]);
    expect(names(moveLayerTo(scene, back.id, 1))).toEqual(["Front", "Back", "Middle"]);
    expect(moveLayerTo(scene, back.id, 2)).toBe(scene);
    expect(moveLayerTo(setCompositionLocked(scene, true), back.id, 0).layers).toEqual(scene.layers);
  });

  it("fills three- and four-camera layouts, repeating cameras when there are fewer", () => {
    const three = lookMultiCamera([{ id: "a", label: "A" }, { id: "b", label: "B" }], 3);
    expect(three.layers.map((layer) => layer.source.id)).toEqual(["a", "b", "a"]);
    expect(three.layers[0]!.bounds.w).toBeGreaterThan(60);
    const four = lookMultiCamera([{ id: "a", label: "A" }], 4);
    expect(four.layers).toHaveLength(4);
    expect(four.layers.every((layer) => layer.source.type === "camera")).toBe(true);
  });
});

describe("layer text style", () => {
  it("sets a style, keeps it when the same kind of content is refilled, and clears it", () => {
    let scene = addLayer(createComposition("S"), { name: "Text", bounds: { x: 0, y: 0, w: 100, h: 100 } });
    const id = scene.layers[0]!.id;
    scene = assignText(scene, id, "Welcome", "");
    scene = setLayerStyle(scene, id, { bold: true, color: "#ff0000" });
    expect(JSON.parse(scene.layers[0]!.source.payload.style!)).toEqual({ bold: true, color: "#ff0000" });
    scene = assignText(scene, id, "Welcome back", "");
    expect(scene.layers[0]!.source.payload.style).toBeDefined();
    scene = setLayerStyle(scene, id, {});
    expect(scene.layers[0]!.source.payload.style).toBeUndefined();
  });
});

describe("scene folders", () => {
  it("sets, normalizes, clears, and rejects folder colors, and keeps them through sanitize", () => {
    const scene = createScene("Welcome");
    const colored = setCompositionColor(scene, "#4C8DFF");
    expect(colored.color).toBe("#4c8dff");
    expect(sanitizeComposition(JSON.parse(JSON.stringify(colored))).color).toBe("#4c8dff");
    expect("color" in setCompositionColor(colored, null)).toBe(false);
    expect("color" in setCompositionColor(colored, "red")).toBe(false);
    expect(sanitizeComposition({ ...colored, color: "url(x)" }).color).toBeUndefined();
  });

  it("moves a scene to an insertion index and ignores unknown ids", () => {
    const list = ["a", "b", "c", "d"].map((id) => ({ id }));
    const ids = (next: { id: string }[]) => next.map((entry) => entry.id).join("");
    expect(ids(moveLook(list, "a", 4))).toBe("bcda");
    expect(ids(moveLook(list, "d", 0))).toBe("dabc");
    expect(ids(moveLook(list, "b", 3))).toBe("acbd");
    expect(ids(moveLook(list, "c", 1))).toBe("acbd");
    expect(ids(moveLook(list, "a", -1))).toBe("abcd");
    expect(ids(moveLook(list, "d", 99))).toBe("abcd");
    expect(moveLook(list, "zz", 0)).toBe(list);
  });
});

describe("scripture with a countdown or the time, and swapping sides", () => {
  const verse = { reference: "John 3:16", body: "For God so loved the world.", attribution: "KJV", verse: 16 };

  it("puts scripture full width with a countdown in the corner", () => {
    const look = lookScriptureCountdown({ ...verse, durationMs: 25 * 60_000 });
    expect(look.layers.map((layer) => layer.source.type)).toEqual(["scripture", "timer"]);
    expect(look.layers[1]!.source.payload).toMatchObject({ mode: "countdown", durationMs: String(25 * 60_000), label: "Time left" });
    const painted = presentComposition(look, { theme: defaultTheme(), now: 0 });
    expect(painted.layers?.map((layer) => layer.model.layout)).toEqual(["scripture", "timer"]);
  });

  it("puts the time of day in the corner without a label", () => {
    const look = lookScriptureClock(verse);
    const painted = presentComposition(look, { theme: defaultTheme(), now: Date.parse("2026-10-17T10:30:00") });
    const clock = painted.layers?.find((layer) => layer.model.layout === "timer")?.model;
    expect(clock?.timer?.mode).toBe("clock");
    expect(clock?.reference ?? null).toBeNull();
  });

  it("swaps sides of a split and a corner overlay, and back again", () => {
    const split = lookScriptureCamera({ camera: { id: "cam-1", label: "Camera 1" }, ...verse });
    const swapped = swapSides(split);
    expect(swapped.layers.map((layer) => layer.bounds.x)).toEqual([50, 0]);
    expect(swapSides(swapped).layers.map((layer) => layer.bounds)).toEqual(split.layers.map((layer) => layer.bounds));
    const corner = swapSides(lookScriptureCountdown(verse));
    expect(corner.layers[1]!.bounds.x).toBe(3);
    expect(swapSides({ ...split, locked: true })).toEqual({ ...split, locked: true });
  });
});

describe("layouts filled from the desk, and the church's own layouts", () => {
  const desk = {
    scripture: { reference: "John 3:16", body: "For God so loved the world.", attribution: "KJV", verse: 16 },
    lyrics: { label: "Verse 1", lines: ["Holy, holy, holy"] },
    cameras: [{ id: "cam-a", label: "Pulpit" }, { id: "cam-b", label: "Wide" }],
    image: { imageUrl: "data:image/png;base64,AA", title: "Sunrise" },
    announcement: { heading: "Welcome", body: "" },
    timer: { durationMs: 300_000, label: "Service starts in" },
    lowerThird: { title: "Pastor Ama", subtitle: "Grace Chapel" },
  };
  const layout = (id: string) => LAYOUTS.find((entry) => entry.id === id)!;

  it("fills each slot by its role, cameras in order", () => {
    const pip = fillTemplate(layout("pip"), desk);
    expect(pip.layers.map((entry) => entry.source.payload.deviceId)).toEqual(["cam-a", "cam-b"]);
    const bar = fillTemplate(layout("camera-scripture-lower"), desk);
    expect(bar.layers.map((entry) => entry.source.type)).toEqual(["camera", "scripture"]);
    expect(bar.layers[1]!.backing).toEqual({ color: "#050505", opacity: 0.72 });
    const painted = presentComposition(bar, { theme: defaultTheme(), now: 0 });
    expect(painted.layers?.[1]?.backing).toBe("color-mix(in srgb, #050505 72%, transparent)");
    expect(fillTemplate(layout("welcome-countdown"), desk).layers.map((entry) => entry.source.type)).toEqual(["text", "timer"]);
    // One camera on the desk fills every camera slot.
    expect(fillTemplate(layout("three-across"), { ...desk, cameras: [desk.cameras[0]!] }).layers.every((entry) => entry.source.payload.deviceId === "cam-a")).toBe(true);
  });

  it("saves a look's arrangement as a layout and refills it later", () => {
    const look = fillTemplate(layout("image-scripture"), desk);
    const saved = layoutFromLook({ ...look, name: "Sunday verse" }, "Sunday verse");
    expect(saved).toMatchObject({ name: "Sunday verse", custom: true });
    expect(saved.slots.map((slot) => slot.role)).toEqual(["image", "scripture"]);
    const again = fillTemplate(saved, { ...desk, scripture: { ...desk.scripture, reference: "Psalm 23:1" } });
    expect(again.layers[1]!.source.payload.reference).toBe("Psalm 23:1");
    expect(sanitizeLayouts([saved, { id: 4 }, { id: "x", slots: [] }, "junk"])).toEqual([saved]);
  });
});

describe("side-by-side regions fill the screen and show their edges", () => {
  const ctx = { theme: defaultTheme(), now: 0 };
  const video = sourceRef("video", "clip", "Clip", { videoUrl: "clip.mp4" });
  const words = sourceRef("text", "t", "Words", { heading: "Hello", body: "" });

  it("cameras and video fill their half instead of sitting letterboxed", () => {
    const two = COMPOSITION_TEMPLATES.find((entry) => entry.id === "two-cameras")!;
    expect(two.slots.map((slot) => slot.fit)).toEqual(["cover", "cover"]);
    const look = lookTwoRegions({ left: words, right: words });
    const filled = assignLayerSource(look, look.layers[0]!.id, video);
    expect(filled.layers[0]!.fit).toBe("cover");
  });

  it("draws a line around each region by default, never around overlays or the full screen", () => {
    const look = lookTwoRegions({ left: video, right: words });
    const painted = presentComposition(look, ctx);
    expect(painted.layers!.map((layer) => layer.edge)).toEqual(["line", "line"]);
    const bar = presentComposition(lookCameraLowerThird({ camera: { id: "c", label: "Cam" }, title: "Pastor", subtitle: "" }), ctx);
    expect(bar.layers!.every((layer) => layer.edge === undefined)).toBe(true);
  });

  it("framed regions pull in from the edges and each other; touching has no edge", () => {
    const look = setCompositionEdges(lookTwoRegions({ left: video, right: words }), "framed");
    const [left, right] = presentComposition(look, ctx).layers!;
    expect(left!.edge).toBe("framed");
    expect(left!.bounds.x).toBeGreaterThan(0);
    expect(left!.bounds.y).toBeGreaterThan(0);
    expect(right!.bounds.x).toBeGreaterThan(left!.bounds.x + left!.bounds.w);
    expect(right!.bounds.x + right!.bounds.w).toBeLessThan(100);
    const touching = presentComposition(setCompositionEdges(look, "touch"), ctx);
    expect(touching.layers!.every((layer) => layer.edge === undefined)).toBe(true);
  });

  it("framed gaps keep the same size on every side of any screen shape", () => {
    const look = setCompositionEdges(lookTwoRegions({ left: video, right: words }), "framed");
    for (const canvas of [{ width: 1440, height: 1080 }, { width: 1080, height: 1920 }, { width: 1920, height: 1080 }]) {
      const [left] = presentComposition(look, { ...ctx, canvas }).layers!;
      const sidePx = (left!.bounds.x / 100) * canvas.width;
      const topPx = (left!.bounds.y / 100) * canvas.height;
      expect(sidePx).toBeCloseTo(topPx, 5);
    }
  });

  it("a gap pulls regions apart with no line; the line and frame take the chosen colour", () => {
    const look = lookTwoRegions({ left: video, right: words });
    const [left, right] = presentComposition(setCompositionEdges(look, "gap"), ctx).layers!;
    expect(left!.edge).toBeUndefined();
    expect(right!.bounds.x).toBeGreaterThan(left!.bounds.x + left!.bounds.w);
    const black = setCompositionEdgeColor(setCompositionEdges(look, "line"), "#000000");
    expect(presentComposition(black, ctx).layers!.map((layer) => layer.edgeColor)).toEqual(["#000000", "#000000"]);
    expect(setCompositionEdgeColor(look, "red").edgeColor).toBeUndefined();
    const restored = restoreComposition(JSON.parse(JSON.stringify(setCompositionEdges(black, "gap"))));
    expect(restored.edges).toBe("gap");
    expect(restored.edgeColor).toBe("#000000");
  });

  it("older saved looks get filled video and keep a chosen edge setting", () => {
    const old = { ...lookTwoRegions({ left: video, right: words }), edges: undefined };
    old.layers = old.layers.map((layer) => ({ ...layer, fit: "contain" as const }));
    const restored = restoreComposition(JSON.parse(JSON.stringify(old)));
    expect(restored.layers[0]!.fit).toBe("cover");
    expect(restored.edges).toBe("line");
    const chosen = restoreComposition(JSON.parse(JSON.stringify({ ...old, edges: "touch" })));
    expect(chosen.layers[0]!.fit).toBe("contain");
    expect(chosen.edges).toBe("touch");
  });
});

describe("live scripture in a look", () => {
  it("finds the scripture region and moves its verse even when the look is locked", () => {
    const look = setCompositionLocked(lookScriptureCamera({ camera: { id: "c", label: "Cam" }, reference: "John 3:16", body: "For God so loved", attribution: "KJV", verse: 16 }), true);
    const layer = scriptureLayerOf(look)!;
    expect(layer.source.payload.reference).toBe("John 3:16");
    const next = withLiveScripture(look, layer.id, { reference: "John 3:17", body: "For God sent not", attribution: "KJV", verse: 17, translationId: "kjv" });
    const moved = scriptureLayerOf(next)!;
    expect(moved.source.payload).toMatchObject({ reference: "John 3:17", translationId: "kjv", verse: "17" });
    expect(next.locked).toBe(true);
  });
});
