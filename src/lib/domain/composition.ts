import { presentCamera } from "./camera";
import { frame, setPreview } from "./live";
import { presentImage, presentLyrics, presentScripture, presentText } from "./present";
import { createTimer, presentTimer, type TimerMode } from "./timer";
import type { LiveState, PresentationModel, Theme } from "./types";

export type LayerBounds = { x: number; y: number; w: number; h: number };

export type LayerFit = "contain" | "cover" | "fill";

export type LayerAnimationKind = "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "dissolve";

export type LayerAnimation = {
  entrance: LayerAnimationKind;
  exit: LayerAnimationKind;
  durationMs: number;
  easing: "ease" | "ease-in" | "ease-out" | "linear";
};

export type SourceType =
  | "scripture"
  | "song"
  | "text"
  | "image"
  | "camera"
  | "video"
  | "timer"
  | "clock"
  | "countdown"
  | "lower-third"
  | "ndi"
  | "plugin"
  | "empty";

export type SourceRef = {
  type: SourceType;
  id: string;
  title: string;
  payload: Record<string, string>;
};

export type CompositionLayer = {
  id: string;
  name: string;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  bounds: LayerBounds;
  fit: LayerFit;
  source: SourceRef;
  animation: LayerAnimation;
};

export type Composition = {
  id: string;
  name: string;
  canvas: { width: number; height: number };
  layers: CompositionLayer[];
  transition: { type: "cut" | "fade"; ms: number };
};

export type CompositionSlot = {
  id: string;
  name: string;
  bounds: LayerBounds;
  fit: LayerFit;
};

export type CompositionTemplate = {
  id: string;
  name: string;
  slots: CompositionSlot[];
};

export type PaintedLayer = {
  id: string;
  zIndex: number;
  opacity: number;
  bounds: LayerBounds;
  fit: LayerFit;
  sourceId: string;
  model: PresentationModel;
  animation: LayerAnimation;
};

export type CompileContext = {
  theme: Theme;
  now: number;
};

const DEFAULT_ANIMATION: LayerAnimation = {
  entrance: "fade",
  exit: "fade",
  durationMs: 400,
  easing: "ease-out",
};

const FULL: CompositionSlot = { id: "main", name: "Main", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" };
const SPLIT: CompositionSlot[] = [
  { id: "a", name: "Region A", bounds: { x: 0, y: 0, w: 50, h: 100 }, fit: "contain" },
  { id: "b", name: "Region B", bounds: { x: 50, y: 0, w: 50, h: 100 }, fit: "cover" },
];

export const COMPOSITION_TEMPLATES: CompositionTemplate[] = [
  { id: "full-frame", name: "Full Camera", slots: [FULL] },
  { id: "full-scripture", name: "Full Scripture", slots: [{ ...FULL, fit: "contain" }] },
  { id: "full-lyrics", name: "Full Lyrics", slots: [{ ...FULL, fit: "contain" }] },
  { id: "countdown", name: "Countdown", slots: [{ ...FULL, fit: "contain" }] },
  { id: "announcement", name: "Announcement", slots: [{ ...FULL, fit: "contain" }] },
  { id: "split-two", name: "Two regions", slots: SPLIT },
  { id: "scripture-camera", name: "Scripture + Camera", slots: SPLIT },
  { id: "lyrics-camera", name: "Lyrics + Camera", slots: SPLIT },
  { id: "image-camera", name: "Image + Camera", slots: SPLIT },
  { id: "two-cameras", name: "Two Cameras", slots: SPLIT },
  { id: "camera-presentation", name: "Camera + Presentation", slots: SPLIT },
  {
    id: "camera-lower-third",
    name: "Camera + Lower Third",
    slots: [
      { id: "fill", name: "Fill", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" },
      { id: "lower", name: "Lower third", bounds: { x: 6, y: 72, w: 55, h: 22 }, fit: "contain" },
    ],
  },
  {
    id: "camera-countdown",
    name: "Camera + Countdown",
    slots: [
      { id: "fill", name: "Fill", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" },
      { id: "timer", name: "Timer", bounds: { x: 68, y: 8, w: 28, h: 18 }, fit: "contain" },
    ],
  },
];

export type LowerThirdTemplate = {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  animation: LayerAnimation;
  durationMs: number;
};

export const LOWER_THIRD_TEMPLATES: LowerThirdTemplate[] = [
  { id: "speaker", name: "Speaker", title: "Speaker", subtitle: "", animation: { ...DEFAULT_ANIMATION, entrance: "slide-up" }, durationMs: 6000 },
  { id: "scripture-ref", name: "Scripture Reference", title: "Scripture", subtitle: "", animation: { ...DEFAULT_ANIMATION, entrance: "slide-left" }, durationMs: 8000 },
  { id: "announcement", name: "Announcement", title: "Announcement", subtitle: "", animation: DEFAULT_ANIMATION, durationMs: 8000 },
  { id: "song-title", name: "Song Title", title: "Song", subtitle: "", animation: { ...DEFAULT_ANIMATION, entrance: "fade" }, durationMs: 5000 },
  { id: "guest", name: "Guest Speaker", title: "Guest", subtitle: "", animation: { ...DEFAULT_ANIMATION, entrance: "slide-up" }, durationMs: 6000 },
  { id: "event", name: "Event Name", title: "Event", subtitle: "", animation: DEFAULT_ANIMATION, durationMs: 8000 },
];

export function sourceRef(type: SourceType, id: string, title: string, payload: Record<string, string> = {}): SourceRef {
  return { type, id, title, payload };
}

function uid() {
  return `layer:${Math.random().toString(36).slice(2, 10)}`;
}

function clampBound(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function sanitizeBounds(bounds: LayerBounds): LayerBounds {
  return {
    x: clampBound(bounds.x),
    y: clampBound(bounds.y),
    w: clampBound(bounds.w) || 1,
    h: clampBound(bounds.h) || 1,
  };
}

function sanitizeSource(source: SourceRef | undefined): SourceRef {
  if (!source || typeof source.type !== "string") return sourceRef("empty", "empty", "Empty");
  return {
    type: source.type,
    id: source.id || "source",
    title: source.title || source.type,
    payload: source.payload && typeof source.payload === "object" ? source.payload : {},
  };
}

function sanitizeAnimation(value: Partial<LayerAnimation> | undefined): LayerAnimation {
  const entrance = value?.entrance;
  const exit = value?.exit;
  const allowed: LayerAnimationKind[] = ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "dissolve"];
  return {
    entrance: allowed.includes(entrance as LayerAnimationKind) ? (entrance as LayerAnimationKind) : DEFAULT_ANIMATION.entrance,
    exit: allowed.includes(exit as LayerAnimationKind) ? (exit as LayerAnimationKind) : DEFAULT_ANIMATION.exit,
    durationMs: Math.min(2000, Math.max(0, Math.round(value?.durationMs ?? DEFAULT_ANIMATION.durationMs))),
    easing: value?.easing === "ease" || value?.easing === "ease-in" || value?.easing === "linear" ? value.easing : "ease-out",
  };
}

export function createComposition(name: string): Composition {
  return {
    id: `composition:${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim() || "Composition",
    canvas: { width: 1920, height: 1080 },
    layers: [],
    transition: { type: "fade", ms: 450 },
  };
}

export function addLayer(
  composition: Composition,
  input: { name: string; bounds: LayerBounds; source?: SourceRef; fit?: LayerFit },
): Composition {
  const layer: CompositionLayer = {
    id: uid(),
    name: input.name.trim() || `Layer ${composition.layers.length + 1}`,
    zIndex: composition.layers.length,
    visible: true,
    locked: false,
    opacity: 1,
    bounds: sanitizeBounds(input.bounds),
    fit: input.fit ?? "contain",
    source: sanitizeSource(input.source),
    animation: DEFAULT_ANIMATION,
  };
  return { ...composition, layers: [...composition.layers, layer] };
}

export function layerOrder(composition: Composition): CompositionLayer[] {
  return [...composition.layers].sort((left, right) => left.zIndex - right.zIndex || left.name.localeCompare(right.name));
}

export function reorderLayers(composition: Composition, layerId: string, direction: 1 | -1): Composition {
  const ordered = layerOrder(composition);
  const index = ordered.findIndex((layer) => layer.id === layerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return composition;
  const next = ordered.slice();
  const [moved] = next.splice(index, 1);
  if (!moved) return composition;
  next.splice(target, 0, moved);
  return {
    ...composition,
    layers: next.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}

export function hideLayer(composition: Composition, layerId: string): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: false } : layer)),
  };
}

export function showLayer(composition: Composition, layerId: string): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: true } : layer)),
  };
}

export function resizeLayer(composition: Composition, layerId: string, bounds: LayerBounds): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, bounds: sanitizeBounds(bounds) } : layer)),
  };
}

export function assignLayerSource(composition: Composition, layerId: string, source: SourceRef): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, source: sanitizeSource(source) } : layer)),
  };
}

export function assignText(composition: Composition, layerId: string, heading: string, body: string): Composition {
  const title = heading.trim() || "Announcement";
  return assignLayerSource(composition, layerId, sourceRef("text", "announcement", title, { heading: title, body }));
}

export function instantiateTemplate(template: CompositionTemplate, name: string): Composition {
  return template.slots.reduce(
    (composition, slot) => addLayer(composition, { name: slot.name, bounds: slot.bounds, fit: slot.fit, source: sourceRef("empty", slot.id, slot.name) }),
    createComposition(name || template.name),
  );
}

export function lookCameraLowerThird(input: {
  camera: { id: string; label: string };
  title: string;
  subtitle?: string;
  template?: LowerThirdTemplate;
}): Composition {
  const overlay = COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-lower-third");
  let composition = instantiateTemplate(overlay!, "Camera + Lower Third");
  const fill = composition.layers[0];
  const lower = composition.layers[1];
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  if (lower) {
    composition = applyLowerThirdTemplate(
      composition,
      lower.id,
      input.template ?? LOWER_THIRD_TEMPLATES[0]!,
      input.title,
      input.subtitle ?? "",
    );
  }
  return composition;
}

export function clearLowerThird(composition: Composition): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.source.type === "lower-third" ? { ...layer, visible: false } : layer)),
  };
}

export function lookCameraCountdown(input: {
  camera: { id: string; label: string };
  durationMs?: number;
  label?: string;
}): Composition {
  const overlay = COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-countdown");
  let composition = instantiateTemplate(overlay!, "Camera + Countdown");
  const fill = composition.layers[0];
  const timer = composition.layers[1];
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  if (timer) {
    composition = assignLayerSource(
      composition,
      timer.id,
      sourceRef("timer", "service", input.label ?? "Countdown", {
        mode: "countdown",
        durationMs: String(input.durationMs ?? 10 * 60_000),
        label: input.label ?? "Service starts in",
      }),
    );
  }
  return composition;
}

export function clearTimer(composition: Composition): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.source.type === "timer" || layer.source.type === "countdown" || layer.source.type === "clock" ? { ...layer, visible: false } : layer,
    ),
  };
}

export function lookScriptureCamera(input: {
  camera: { id: string; label: string };
  reference: string;
  body: string;
  attribution?: string;
  verse?: number;
}): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "scripture-camera");
  let composition = instantiateTemplate(split!, "Scripture + Camera");
  const verse = composition.layers[0];
  const fill = composition.layers[1];
  if (verse) {
    composition = assignLayerSource(
      composition,
      verse.id,
      sourceRef("scripture", input.reference, input.reference, {
        reference: input.reference,
        body: input.body,
        attribution: input.attribution ?? "KJV",
        verse: String(input.verse ?? 1),
      }),
    );
  }
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  return composition;
}

export function lookLyricsCamera(input: {
  camera: { id: string; label: string };
  label: string;
  lines: string[];
}): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "lyrics-camera");
  let composition = instantiateTemplate(split!, "Lyrics + Camera");
  const lyrics = composition.layers[0];
  const fill = composition.layers[1];
  if (lyrics) {
    composition = assignLayerSource(
      composition,
      lyrics.id,
      sourceRef("song", input.label, input.label, {
        label: input.label,
        body: input.lines.join("\n"),
      }),
    );
  }
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  return composition;
}

export function lookImageCamera(input: {
  camera: { id: string; label: string };
  imageUrl: string;
  title?: string;
}): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "image-camera");
  let composition = instantiateTemplate(split!, "Image + Camera");
  const picture = composition.layers[0];
  const fill = composition.layers[1];
  if (picture) {
    composition = assignLayerSource(
      composition,
      picture.id,
      sourceRef("image", input.title ?? "image", input.title ?? "Image", { imageUrl: input.imageUrl }),
    );
  }
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  return composition;
}

export function lookTwoCameras(input: {
  left: { id: string; label: string };
  right: { id: string; label: string };
}): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "two-cameras");
  let composition = instantiateTemplate(split!, "Two Cameras");
  const a = composition.layers[0];
  const b = composition.layers[1];
  if (a) {
    composition = assignLayerSource(
      composition,
      a.id,
      sourceRef("camera", input.left.id, input.left.label, { deviceId: input.left.id, label: input.left.label }),
    );
  }
  if (b) {
    composition = assignLayerSource(
      composition,
      b.id,
      sourceRef("camera", input.right.id, input.right.label, { deviceId: input.right.id, label: input.right.label }),
    );
  }
  return composition;
}

export function lookCameraPresentation(input: {
  camera: { id: string; label: string };
  presentation: SourceRef;
}): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "camera-presentation");
  let composition = instantiateTemplate(split!, "Camera + Presentation");
  const fill = composition.layers[0];
  const deck = composition.layers[1];
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  if (deck) composition = assignLayerSource(composition, deck.id, input.presentation);
  return composition;
}

export function lookFullCamera(input: { camera: { id: string; label: string } }): Composition {
  const full = COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-frame");
  let composition = instantiateTemplate(full!, "Full Camera");
  const fill = composition.layers[0];
  if (fill) {
    composition = assignLayerSource(
      composition,
      fill.id,
      sourceRef("camera", input.camera.id, input.camera.label, { deviceId: input.camera.id, label: input.camera.label }),
    );
  }
  return composition;
}

export function lookFullScripture(input: {
  reference: string;
  body: string;
  attribution?: string;
  verse?: number;
}): Composition {
  const full = COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-scripture");
  let composition = instantiateTemplate(full!, "Full Scripture");
  const verse = composition.layers[0];
  if (verse) {
    composition = assignLayerSource(
      composition,
      verse.id,
      sourceRef("scripture", input.reference, input.reference, {
        reference: input.reference,
        body: input.body,
        attribution: input.attribution ?? "KJV",
        verse: String(input.verse ?? 1),
      }),
    );
  }
  return composition;
}

export function lookFullLyrics(input: { label: string; lines: string[] }): Composition {
  const full = COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-lyrics");
  let composition = instantiateTemplate(full!, "Full Lyrics");
  const lyrics = composition.layers[0];
  if (lyrics) {
    composition = assignLayerSource(
      composition,
      lyrics.id,
      sourceRef("song", input.label, input.label, {
        label: input.label,
        body: input.lines.join("\n"),
      }),
    );
  }
  return composition;
}

export function lookCountdown(input: { durationMs?: number; label?: string; mode?: TimerMode } = {}): Composition {
  const full = COMPOSITION_TEMPLATES.find((entry) => entry.id === "countdown");
  let composition = instantiateTemplate(full!, "Countdown");
  const timer = composition.layers[0];
  const mode: TimerMode = input.mode === "countup" || input.mode === "clock" || input.mode === "target" ? input.mode : "countdown";
  if (timer) {
    composition = assignLayerSource(
      composition,
      timer.id,
      sourceRef("timer", "service", input.label ?? "Countdown", {
        mode,
        durationMs: String(input.durationMs ?? 10 * 60_000),
        label: input.label ?? "Service starts in",
      }),
    );
  }
  return composition;
}

export function lookAnnouncement(input: { heading: string; body: string }): Composition {
  const full = COMPOSITION_TEMPLATES.find((entry) => entry.id === "announcement");
  let composition = instantiateTemplate(full!, "Announcement");
  const text = composition.layers[0];
  if (text) {
    composition = assignLayerSource(
      composition,
      text.id,
      sourceRef("text", "announcement", input.heading, {
        heading: input.heading,
        body: input.body,
      }),
    );
  }
  return composition;
}

export function lookTwoRegions(input: { left: SourceRef; right: SourceRef }): Composition {
  const split = COMPOSITION_TEMPLATES.find((entry) => entry.id === "split-two");
  let composition = instantiateTemplate(split!, "Two regions");
  const a = composition.layers[0];
  const b = composition.layers[1];
  if (a) composition = assignLayerSource(composition, a.id, input.left);
  if (b) composition = assignLayerSource(composition, b.id, input.right);
  return composition;
}

export function sanitizeComposition(value: unknown): Composition {
  const record = value && typeof value === "object" ? (value as Partial<Composition>) : {};
  const base = createComposition(typeof record.name === "string" ? record.name : "Composition");
  const layers = Array.isArray(record.layers) ? record.layers : [];
  return {
    ...base,
    id: typeof record.id === "string" && record.id ? record.id : base.id,
    canvas: record.canvas?.width && record.canvas?.height ? record.canvas : base.canvas,
    transition: record.transition?.type === "cut" ? { type: "cut", ms: record.transition.ms ?? 0 } : base.transition,
    layers: layers.map((layer, index) => ({
      id: layer.id || `layer:${index}`,
      name: layer.name || `Layer ${index + 1}`,
      zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1,
      bounds: sanitizeBounds(layer.bounds ?? { x: 0, y: 0, w: 100, h: 100 }),
      fit: layer.fit === "cover" || layer.fit === "fill" ? layer.fit : "contain",
      source: sanitizeSource(layer.source),
      animation: sanitizeAnimation(layer.animation),
    })),
  };
}

export function restoreComposition(value: unknown): Composition {
  return sanitizeComposition(value);
}

export function applyLowerThirdTemplate(
  composition: Composition,
  layerId: string,
  template: LowerThirdTemplate,
  title?: string,
  subtitle?: string,
): Composition {
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.id === layerId
        ? {
            ...layer,
            animation: template.animation,
            source: sourceRef("lower-third", template.id, template.name, {
              title: title?.trim() || template.title,
              subtitle: subtitle?.trim() || template.subtitle,
              templateId: template.id,
              durationMs: String(template.durationMs),
            }),
          }
        : layer,
    ),
  };
}

/** Plugins register a compiler here. They still compile to PresentationModel and cannot Take. */
const extraCompilers = new Map<string, (source: SourceRef, ctx: CompileContext) => PresentationModel>();

export function registerSourceCompiler(type: string, compile: (source: SourceRef, ctx: CompileContext) => PresentationModel) {
  extraCompilers.set(type, compile);
}

export function registeredSourceTypes(): string[] {
  return [...extraCompilers.keys()];
}

export function compileSource(source: SourceRef, ctx: CompileContext): PresentationModel {
  const extra = extraCompilers.get(source.type);
  const payload = source.payload;
  if (source.type === "scripture") {
    const text = payload.body || "";
    return presentScripture({
      theme: ctx.theme,
      reference: payload.reference || source.title,
      attribution: payload.attribution || null,
      verses: text ? [{ verse: Number(payload.verse) || 1, text }] : [],
    });
  }
  if (source.type === "song") {
    return presentLyrics({
      theme: ctx.theme,
      label: payload.label || source.title,
      lines: (payload.body || "").split("\n"),
    });
  }
  if (source.type === "image") {
    return payload.imageUrl ? presentImage({ theme: ctx.theme, imageUrl: payload.imageUrl }) : presentText({ theme: ctx.theme, layout: "title", heading: source.title, body: "" });
  }
  if (source.type === "camera" || source.type === "video" || source.type === "ndi") {
    return presentCamera({ theme: ctx.theme, label: payload.label || source.title });
  }
  if (source.type === "timer" || source.type === "countdown" || source.type === "clock") {
    const mode = source.type === "clock" ? "clock" : payload.mode === "countup" || payload.mode === "target" || payload.mode === "clock" ? payload.mode : "countdown";
    return presentTimer(
      startIfNeeded(
        createTimer({
          id: source.id,
          name: source.title,
          mode,
          durationMs: Number(payload.durationMs) || 0,
          targetAt: payload.targetAt ? Number(payload.targetAt) : null,
          label: payload.label || source.title,
        }),
        ctx.now,
      ),
      ctx.theme,
      ctx.now,
    );
  }
  if (source.type === "lower-third") {
    return presentLowerThird(ctx.theme, payload.title || source.title, payload.subtitle || "");
  }
  if (source.type === "text") {
    return presentText({ theme: ctx.theme, layout: "title", heading: payload.heading || source.title, body: payload.body || "" });
  }
  if (extra) return extra(source, ctx);
  if (source.type === "plugin") {
    return presentText({ theme: ctx.theme, layout: "title", heading: source.title, body: payload.body || "" });
  }
  return presentText({ theme: ctx.theme, layout: "title", heading: "", body: "" });
}

function startIfNeeded(timer: ReturnType<typeof createTimer>, now: number) {
  return timer.mode === "clock" ? timer : { ...timer, running: true, startedAt: now };
}

export function presentLowerThird(theme: Theme, title: string, subtitle: string): PresentationModel {
  return {
    layout: "lower-third",
    theme: { ...theme, layout: "lower-third", vertical: "bottom", align: "left", margin: 48 },
    reference: null,
    attribution: subtitle.trim() || null,
    lines: title.trim() ? [{ text: title.trim() }] : [],
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

export function presentComposition(composition: Composition, ctx: CompileContext): PresentationModel {
  const layers = layerOrder(composition)
    .filter((layer) => layer.visible)
    .map((layer) => ({
      id: layer.id,
      zIndex: layer.zIndex,
      opacity: layer.opacity,
      bounds: layer.bounds,
      fit: layer.fit,
      sourceId: `${layer.source.type}:${layer.source.id}`,
      model: compileSource(layer.source, ctx),
      animation: layer.animation,
    }));
  return {
    layout: "composition",
    theme: ctx.theme,
    reference: composition.name,
    attribution: null,
    lines: [],
    imageUrl: null,
    backgroundImageUrl: null,
    layers,
  };
}

export function previewComposition(live: LiveState, model: PresentationModel, compositionId: string): LiveState {
  return setPreview(live, frame(model, `composition:${compositionId}`, "cut"));
}
