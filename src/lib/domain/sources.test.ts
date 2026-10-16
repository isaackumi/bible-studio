import { describe, expect, it } from "vitest";
import {
  addLayer,
  createScene,
  presentComposition,
  sanitizeComposition,
  setCompositionLocked,
  sourceRef,
  type Composition,
} from "./composition";
import {
  addSharedLayer,
  buildSource,
  createSharedSource,
  defaultFields,
  fieldsFromSource,
  linkLayer,
  lockedLooksUsing,
  nextSourceName,
  pruneSharedSources,
  sanitizeSharedSource,
  sourcesOfType,
  syncLinkedEdits,
  updateSharedSource,
} from "./sources";
import { defaultTheme } from "./theme";

const cam = (deviceId = "dev-1", label = "Pulpit Cam") =>
  createSharedSource(label, buildSource({ type: "camera", deviceId, label, mirror: false }));

function sceneWith(name: string, ...shared: ReturnType<typeof cam>[]): Composition {
  return shared.reduce((look, entry) => addSharedLayer(look, entry), createScene(name));
}

describe("shared sources", () => {
  it("names new sources Camera, Camera 2, Camera 3", () => {
    const one = createSharedSource("Camera", buildSource(defaultFields("camera", { cameras: [] })));
    expect(nextSourceName([], "camera")).toBe("Camera");
    expect(nextSourceName([one], "camera")).toBe("Camera 2");
    expect(nextSourceName([one, { ...one, id: "x", name: "Camera 2" }], "camera")).toBe("Camera 3");
    expect(nextSourceName([one], "text")).toBe("Text");
  });

  it("filters sources by type", () => {
    const camera = cam();
    const text = createSharedSource("Welcome", buildSource({ type: "text", heading: "Welcome", body: "", style: {} }));
    expect(sourcesOfType([camera, text], "camera")).toEqual([camera]);
  });

  it("adds a linked layer whose name and source follow the shared source", () => {
    const shared = cam();
    const look = addSharedLayer(createScene("Main"), shared);
    const layer = look.layers[look.layers.length - 1]!;
    expect(layer.sourceKey).toBe(shared.id);
    expect(layer.name).toBe("Pulpit Cam");
    expect(layer.source).toEqual(shared.source);
    expect(layer.bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("places a lower third in the lower-third region", () => {
    const shared = createSharedSource("Speaker", buildSource({ type: "lower-third", templateId: "speaker", title: "Pastor", subtitle: "", style: {} }));
    const look = addSharedLayer(createScene("Main"), shared);
    expect(look.layers[look.layers.length - 1]!.bounds).toEqual({ x: 6, y: 72, w: 55, h: 22 });
  });

  it("does not link or add layers on a locked scene", () => {
    const locked = setCompositionLocked(createScene("Main"), true);
    expect(addSharedLayer(locked, cam())).toBe(locked);
    expect(linkLayer(locked, locked.layers[0]!.id, cam())).toBe(locked);
  });

  it("updates every linked layer across looks and leaves unlinked layers alone", () => {
    const shared = cam();
    const a = sceneWith("A", shared);
    const b = addLayer(sceneWith("B", shared), { name: "Loose cam", bounds: { x: 0, y: 0, w: 50, h: 50 }, source: shared.source });
    const renamed = buildSource({ type: "camera", deviceId: "dev-2", label: "Main Cam", mirror: true });
    const result = updateSharedSource([shared], [a, b], shared.id, { name: "Main Cam", source: renamed });
    if (!result.ok) throw new Error("blocked");
    expect(result.sources[0]!.name).toBe("Main Cam");
    for (const look of result.looks.map((entry) => sanitizeComposition(entry))) {
      for (const layer of look.layers.filter((entry) => entry.sourceKey === shared.id)) {
        expect(layer.name).toBe("Main Cam");
        expect(layer.source).toEqual(renamed);
      }
    }
    const loose = sanitizeComposition(result.looks[1]).layers.find((layer) => layer.name === "Loose cam")!;
    expect(loose.source).toEqual(shared.source);
  });

  it("refuses to update a source used by a locked look and changes nothing", () => {
    const shared = cam();
    const a = setCompositionLocked(sceneWith("Sunday Main", shared), true);
    const b = sceneWith("B", shared);
    const result = updateSharedSource([shared], [a, b], shared.id, { name: "X", source: shared.source });
    expect(result).toEqual({ ok: false, blocked: ["Sunday Main"] });
    expect(lockedLooksUsing([a, b], shared.id)).toEqual(["Sunday Main"]);
  });

  it("prunes sources no layer references", () => {
    const used = cam("dev-1", "Used");
    const unused = cam("dev-2", "Unused");
    expect(pruneSharedSources([used, unused], [sceneWith("A", used)])).toEqual([used]);
  });

  it("pushes an edited linked copy to the shared source and other looks", () => {
    const shared = cam();
    const a = sceneWith("A", shared);
    const b = sceneWith("B", shared);
    const edited = buildSource({ type: "camera", deviceId: "dev-9", label: "Side", mirror: false });
    const layerId = b.layers[b.layers.length - 1]!.id;
    const changedB = { ...b, layers: b.layers.map((layer) => (layer.id === layerId ? { ...layer, name: "Side", source: edited } : layer)) };
    const synced = syncLinkedEdits([shared], [a, b], changedB);
    expect(synced.unlinked).toEqual([]);
    expect(synced.looks.map((entry) => entry.id)).toEqual([a.id, b.id]);
    expect(synced.sources[0]).toMatchObject({ name: "Side", source: edited });
    const aLayer = sanitizeComposition(synced.looks[0]).layers.find((layer) => layer.sourceKey === shared.id)!;
    expect(aLayer.source).toEqual(edited);
  });

  it("unlinks an edited copy when a locked look blocks the shared edit", () => {
    const shared = cam();
    const a = setCompositionLocked(sceneWith("Frozen", shared), true);
    const b = sceneWith("B", shared);
    const layerId = b.layers[b.layers.length - 1]!.id;
    const edited = buildSource({ type: "camera", deviceId: "dev-9", label: "Side", mirror: false });
    const changedB = { ...b, layers: b.layers.map((layer) => (layer.id === layerId ? { ...layer, source: edited } : layer)) };
    const synced = syncLinkedEdits([shared], [a, b], changedB);
    expect(synced.unlinked).toEqual(["Pulpit Cam"]);
    expect(synced.look.layers.find((layer) => layer.id === layerId)!.sourceKey).toBeUndefined();
    expect(synced.sources).toEqual([shared]);
  });

  it("leaves unchanged linked layers alone on save", () => {
    const shared = cam();
    const a = sceneWith("A", shared);
    const synced = syncLinkedEdits([shared], [a], a);
    expect(synced.sources).toEqual([shared]);
    expect(synced.unlinked).toEqual([]);
  });

  it("round-trips fields through SourceRef for every kind", () => {
    const cases = [
      { type: "camera", deviceId: "d", label: "Cam", mirror: true },
      { type: "scripture", reference: "John 3:16", body: "For God so loved", attribution: "KJV", verse: 16, style: {} },
      { type: "song", songId: "s1", sectionId: "v1", label: "Amazing Grace — Verse 1", body: "Amazing grace\nHow sweet", style: { italic: true } },
      { type: "text", heading: "Welcome", body: "Coffee after", style: { bold: true, color: "#ffcc00", size: 80 } },
      { type: "timer", mode: "countdown", durationMs: 600000, targetAt: null, label: "Starts in", warningMs: 30000, style: { align: "right", vertical: "top" } },
      { type: "clock", label: "", style: { align: "left", vertical: "bottom" } },
      { type: "lower-third", templateId: "speaker", title: "Pastor", subtitle: "Lead", style: {} },
      { type: "image", assetId: "a1", name: "Logo", imageUrl: "blob:x" },
    ] as const;
    for (const fields of cases) expect(fieldsFromSource(buildSource(fields))).toEqual(fields);
    expect(fieldsFromSource(sourceRef("empty", "e", "Empty"))).toBeNull();
  });

  it("defaults a camera to the first device", () => {
    expect(defaultFields("camera", { cameras: [{ deviceId: "d1", label: "FaceTime" }] })).toEqual({
      type: "camera",
      deviceId: "d1",
      label: "FaceTime",
      mirror: false,
    });
  });

  it("sanitizes shared source documents", () => {
    const shared = cam();
    expect(sanitizeSharedSource(JSON.parse(JSON.stringify(shared)))).toEqual(shared);
    expect(sanitizeSharedSource({ id: 3 })).toBeNull();
  });

  it("keeps sourceKey through sanitize and paints camera mirror", () => {
    const shared = createSharedSource("Cam", buildSource({ type: "camera", deviceId: "d", label: "Cam", mirror: true }));
    const look = sanitizeComposition(JSON.parse(JSON.stringify(sceneWith("A", shared))));
    expect(look.layers[look.layers.length - 1]!.sourceKey).toBe(shared.id);
    const model = presentComposition(look, { theme: defaultTheme(), now: 0 });
    expect(model.layers?.find((layer) => layer.sourceId === "camera:d")?.mirror).toBe(true);
  });

  it("styles a compiled text source and places a clock", () => {
    const text = presentComposition(
      sceneWith("A", createSharedSource("W", buildSource({ type: "text", heading: "Welcome", body: "", style: { color: "#ff0000", italic: true } }))),
      { theme: defaultTheme(), now: 0 },
    );
    const painted = text.layers?.find((layer) => layer.sourceId === "text:text");
    expect(painted?.model.theme.color).toBe("#ff0000");
    expect(painted?.model.style).toEqual({ italic: true });
    const clock = presentComposition(
      sceneWith("B", createSharedSource("Clock", buildSource({ type: "clock", label: "", style: { align: "right", vertical: "top" } }))),
      { theme: defaultTheme(), now: 0 },
    ).layers?.find((layer) => layer.sourceId === "clock:clock");
    expect(clock?.model.layout).toBe("timer");
    expect(clock?.model.timer?.mode).toBe("clock");
    expect(clock?.model.theme).toMatchObject({ align: "right", vertical: "top" });
    expect(clock?.model.reference).toBeNull();
  });
});
