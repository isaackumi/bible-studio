import { presentCamera } from "./camera";
import { frame, setPreview } from "./live";
import { presentImage, presentLyrics, presentScripture, presentText, presentVideo } from "./present";
import { createTimer, DEFAULT_TIMER_WARNING_MS, presentTimer, type TimerMode } from "./timer";
import { encodeTextStyle, parseTextStyle, styleModel } from "./text-style";
import { presentQr } from "./overlays";
import { emptyModel } from "./theme";
import type { CompositionDocument, LiveState, PresentationItem, PresentationModel, TextStyle, Theme } from "./types";

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
  | "qr"
  | "shape"
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
  /** Link to Workspace.sources; absent = unlinked copy. */
  sourceKey?: string;
};

/** A page background for decks: color, two-color gradient, or a picture, with an optional tint. */
export type PageBackground = {
  type: "color" | "gradient" | "image";
  color: string;
  to: string;
  angle: number;
  assetId: string;
  imageUrl: string;
  overlay: string;
  overlayOpacity: number;
};

export type Composition = {
  id: string;
  name: string;
  background?: PageBackground;
  /** Full freeze: no rename, layer, or transition edits until unlock. */
  locked: boolean;
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
    id: "three-cameras",
    name: "Three Cameras",
    slots: [
      { id: "main", name: "Main camera", bounds: { x: 0, y: 0, w: 66.6667, h: 100 }, fit: "cover" },
      { id: "top", name: "Camera 2", bounds: { x: 66.6667, y: 0, w: 33.3333, h: 50 }, fit: "cover" },
      { id: "bottom", name: "Camera 3", bounds: { x: 66.6667, y: 50, w: 33.3333, h: 50 }, fit: "cover" },
    ],
  },
  {
    id: "four-cameras",
    name: "Four Cameras",
    slots: [
      { id: "a", name: "Camera 1", bounds: { x: 0, y: 0, w: 50, h: 50 }, fit: "cover" },
      { id: "b", name: "Camera 2", bounds: { x: 50, y: 0, w: 50, h: 50 }, fit: "cover" },
      { id: "c", name: "Camera 3", bounds: { x: 0, y: 50, w: 50, h: 50 }, fit: "cover" },
      { id: "d", name: "Camera 4", bounds: { x: 50, y: 50, w: 50, h: 50 }, fit: "cover" },
    ],
  },
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
    locked: false,
    canvas: { width: 1920, height: 1080 },
    layers: [],
    transition: { type: "fade", ms: 450 },
  };
}

/** Empty named scene: one full-frame empty layer. Production Desk “New scene”. */
export function createScene(name = "Scene"): Composition {
  return addLayer(createComposition(name), {
    name: "Main",
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    fit: "contain",
    source: sourceRef("empty", "main", "Main"),
  });
}

export function setCompositionLocked(composition: Composition, locked: boolean): Composition {
  return { ...composition, locked: !!locked };
}

export function addLayer(
  composition: Composition,
  input: { name: string; bounds: LayerBounds; source?: SourceRef; fit?: LayerFit },
): Composition {
  if (composition.locked) return composition;
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

/** Photoshop-style stack: front (highest z-index) first. */
export function layerStackFrontFirst(composition: Composition): CompositionLayer[] {
  return layerOrder(composition).slice().reverse();
}

export function reorderLayers(composition: Composition, layerId: string, direction: 1 | -1): Composition {
  if (composition.locked) return composition;
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

export function renameLayer(composition: Composition, layerId: string, name: string): Composition {
  if (composition.locked) return composition;
  const next = name.trim();
  if (!next) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, name: next } : layer)),
  };
}

export function removeLayer(composition: Composition, layerId: string): Composition {
  if (composition.locked) return composition;
  if (!composition.layers.some((layer) => layer.id === layerId)) return composition;
  const layers = layerOrder(composition)
    .filter((layer) => layer.id !== layerId)
    .map((layer, zIndex) => ({ ...layer, zIndex }));
  return { ...composition, layers };
}

export function duplicateLayer(composition: Composition, layerId: string): Composition {
  if (composition.locked) return composition;
  const source = composition.layers.find((layer) => layer.id === layerId);
  if (!source) return composition;
  const copy: CompositionLayer = {
    ...source,
    id: uid(),
    name: `${source.name} copy`,
    zIndex: composition.layers.length,
    source: sanitizeSource({ ...source.source, payload: { ...source.source.payload } }),
    animation: sanitizeAnimation(source.animation),
    bounds: sanitizeBounds(source.bounds),
  };
  return { ...composition, layers: [...composition.layers, copy] };
}

export function duplicateLook(composition: Composition): Composition {
  const clean = sanitizeComposition(composition);
  return {
    ...clean,
    id: `composition:${Math.random().toString(36).slice(2, 10)}`,
    name: `${clean.name} copy`,
    locked: false,
    layers: clean.layers.map((layer, zIndex) => ({
      ...layer,
      id: uid(),
      zIndex,
      source: sanitizeSource({ ...layer.source, payload: { ...layer.source.payload } }),
      animation: sanitizeAnimation(layer.animation),
      bounds: sanitizeBounds(layer.bounds),
    })),
  };
}

export function hideLayer(composition: Composition, layerId: string): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: false } : layer)),
  };
}

export function showLayer(composition: Composition, layerId: string): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: true } : layer)),
  };
}

export function resizeLayer(composition: Composition, layerId: string, bounds: LayerBounds): Composition {
  if (composition.locked) return composition;
  const target = composition.layers.find((layer) => layer.id === layerId);
  if (!target || target.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, bounds: sanitizeBounds(bounds) } : layer)),
  };
}

export type LayerDragHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function clampDragBounds(bounds: LayerBounds, handle: LayerDragHandle): LayerBounds {
  let { x, y, w, h } = bounds;
  w = Math.max(1, w);
  h = Math.max(1, h);
  if (handle === "move") {
    x = Math.min(100 - w, Math.max(0, x));
    y = Math.min(100 - h, Math.max(0, y));
    return { x, y, w, h };
  }
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > 100) w = 100 - x;
  if (y + h > 100) h = 100 - y;
  w = Math.min(100, Math.max(1, w));
  h = Math.min(100, Math.max(1, h));
  x = Math.min(100 - w, Math.max(0, x));
  y = Math.min(100 - h, Math.max(0, y));
  return { x, y, w, h };
}

export function applyLayerDrag(
  composition: Composition,
  layerId: string,
  handle: LayerDragHandle,
  delta: { dx: number; dy: number },
): Composition {
  if (composition.locked) return composition;
  const layer = composition.layers.find((entry) => entry.id === layerId);
  if (!layer || layer.locked) return composition;
  let { x, y, w, h } = layer.bounds;
  const dx = Number.isFinite(delta.dx) ? delta.dx : 0;
  const dy = Number.isFinite(delta.dy) ? delta.dy : 0;
  if (handle === "move") {
    x += dx;
    y += dy;
  } else {
    if (handle.includes("e")) w += dx;
    if (handle.includes("s")) h += dy;
    if (handle.includes("w")) {
      x += dx;
      w -= dx;
    }
    if (handle.includes("n")) {
      y += dy;
      h -= dy;
    }
  }
  return resizeLayer(composition, layerId, clampDragBounds({ x, y, w, h }, handle));
}

export function setLayerOpacity(composition: Composition, layerId: string, opacity: number): Composition {
  if (composition.locked) return composition;
  const next = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, opacity: next } : layer)),
  };
}

function sanitizeFit(fit: LayerFit | string): LayerFit {
  return fit === "cover" || fit === "fill" ? fit : "contain";
}

export function setLayerFit(composition: Composition, layerId: string, fit: LayerFit): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, fit: sanitizeFit(fit) } : layer)),
  };
}

export function setLayerLocked(composition: Composition, layerId: string, locked: boolean): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => (layer.id === layerId ? { ...layer, locked } : layer)),
  };
}

export function setLayerAnimation(
  composition: Composition,
  layerId: string,
  animation: Partial<LayerAnimation>,
): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.id === layerId ? { ...layer, animation: sanitizeAnimation({ ...layer.animation, ...animation }) } : layer,
    ),
  };
}

export function assignLayerSource(composition: Composition, layerId: string, source: SourceRef): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      // Re-filling a layer with the same kind of content keeps its text style.
      const kept = layer.source.type === source.type && layer.source.payload.style && !source.payload.style
        ? { ...source, payload: { ...source.payload, style: layer.source.payload.style } }
        : source;
      return { ...layer, source: sanitizeSource(kept) };
    }),
  };
}

/** Set a layer's text style (stored on its source payload). Scene lock wins. */
export function setLayerStyle(composition: Composition, layerId: string, style: TextStyle): Composition {
  if (composition.locked) return composition;
  const encoded = encodeTextStyle(style);
  return {
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const { style: _old, ...payload } = layer.source.payload;
      return { ...layer, source: { ...layer.source, payload: encoded ? { ...payload, style: encoded } : payload } };
    }),
  };
}

export function assignText(composition: Composition, layerId: string, heading: string, body: string): Composition {
  const title = heading.trim() || "Announcement";
  return assignLayerSource(composition, layerId, sourceRef("text", "announcement", title, { heading: title, body }));
}

export function assignScripture(
  composition: Composition,
  layerId: string,
  input: { reference: string; body: string; attribution?: string; verse?: number },
): Composition {
  const reference = input.reference.trim() || "Scripture";
  const verse = Number.isFinite(input.verse) ? Math.max(1, Math.round(Number(input.verse))) : 1;
  return assignLayerSource(
    composition,
    layerId,
    sourceRef("scripture", reference, reference, {
      reference,
      body: input.body,
      attribution: input.attribution?.trim() || "",
      verse: String(verse),
    }),
  );
}

export function assignSong(composition: Composition, layerId: string, input: { label: string; body: string }): Composition {
  const label = input.label.trim() || "Lyrics";
  return assignLayerSource(composition, layerId, sourceRef("song", label, label, { label, body: input.body }));
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
  if (composition.locked) return composition;
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
  if (composition.locked) return composition;
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

/**
 * Three- or four-camera look. Cameras fill the slots in order; with fewer devices than slots
 * the list repeats, so every region shows a real feed instead of a blank.
 */
export function lookMultiCamera(cameras: Array<{ id: string; label: string }>, count: 3 | 4): Composition {
  const template = COMPOSITION_TEMPLATES.find((entry) => entry.id === (count === 3 ? "three-cameras" : "four-cameras"))!;
  let composition = instantiateTemplate(template, template.name);
  const list = cameras.length ? cameras : [{ id: "cam-1", label: "Camera 1" }];
  composition.layers.forEach((layer, index) => {
    const camera = list[index % list.length]!;
    composition = assignLayerSource(
      composition,
      layer.id,
      sourceRef("camera", camera.id, camera.label, { deviceId: camera.id, label: camera.label }),
    );
  });
  return composition;
}

/**
 * Move a layer to a position in the front-first stack (0 = front), as a drag in the Sources
 * list does. Scene lock and unknown ids leave the scene unchanged.
 */
export function moveLayerTo(composition: Composition, layerId: string, frontIndex: number): Composition {
  if (composition.locked) return composition;
  const front = layerOrder(composition).slice().reverse();
  const from = front.findIndex((layer) => layer.id === layerId);
  if (from < 0) return composition;
  const target = Math.max(0, Math.min(front.length - 1, Math.round(frontIndex)));
  if (target === from) return composition;
  const next = front.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  const count = next.length;
  return { ...composition, layers: next.map((layer, index) => ({ ...layer, zIndex: count - 1 - index })) };
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

export function lookCountdown(input: { durationMs?: number; label?: string; mode?: TimerMode; targetAt?: number } = {}): Composition {
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
        ...(input.targetAt != null ? { targetAt: String(input.targetAt) } : {}),
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

function sanitizeTransition(value: Composition["transition"] | undefined): Composition["transition"] {
  const type = value?.type === "cut" ? "cut" : "fade";
  const raw = Number.isFinite(value?.ms) ? Number(value?.ms) : type === "cut" ? 0 : 450;
  return { type, ms: Math.min(2000, Math.max(0, Math.round(raw))) };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function sanitizeBackground(value: unknown): PageBackground | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<PageBackground>;
  const color = (input: unknown, fallback: string) => (typeof input === "string" && HEX_COLOR.test(input) ? input.toLowerCase() : fallback);
  const type = record.type === "gradient" || record.type === "image" ? record.type : "color";
  return {
    type,
    color: color(record.color, "#1b1b1f"),
    to: color(record.to, "#3a2a1a"),
    angle: Number.isFinite(record.angle) ? Math.round(Number(record.angle)) % 360 : 135,
    assetId: typeof record.assetId === "string" ? record.assetId : "",
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
    overlay: color(record.overlay, "#000000"),
    overlayOpacity: Number.isFinite(record.overlayOpacity) ? Math.min(1, Math.max(0, Number(record.overlayOpacity))) : 0,
  };
}

/** CSS for a page background (the tint is a translucent layer over color, gradient or picture). */
export function backgroundCss(background: PageBackground): string {
  const tint = (() => {
    if (!(background.overlayOpacity > 0)) return "";
    const value = Number.parseInt(background.overlay.slice(1), 16);
    const rgba = `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${background.overlayOpacity})`;
    return `linear-gradient(${rgba}, ${rgba}), `;
  })();
  if (background.type === "image" && background.imageUrl) return `${tint}center / cover no-repeat url("${background.imageUrl}")`;
  if (background.type === "gradient") return `${tint}linear-gradient(${background.angle}deg, ${background.color}, ${background.to})`;
  return tint ? `${tint}${background.color}` : background.color;
}

export function setCompositionBackground(composition: Composition, background: PageBackground | undefined): Composition {
  if (composition.locked) return composition;
  const clean = sanitizeBackground(background);
  if (!clean) {
    const { background: _gone, ...rest } = composition;
    return rest;
  }
  return { ...composition, background: clean };
}

export function sanitizeComposition(value: unknown): Composition {
  const record = value && typeof value === "object" ? (value as Partial<Composition>) : {};
  const base = createComposition(typeof record.name === "string" ? record.name : "Composition");
  const layers = Array.isArray(record.layers) ? record.layers : [];
  const background = sanitizeBackground(record.background);
  return {
    ...base,
    ...(background ? { background } : {}),
    id: typeof record.id === "string" && record.id ? record.id : base.id,
    locked: record.locked === true,
    canvas: record.canvas?.width && record.canvas?.height ? record.canvas : base.canvas,
    transition: sanitizeTransition(record.transition),
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
      ...(typeof layer.sourceKey === "string" && layer.sourceKey ? { sourceKey: layer.sourceKey } : {}),
    })),
  };
}

export function restoreComposition(value: unknown): Composition {
  return sanitizeComposition(value);
}

export function setCompositionTransition(
  composition: Composition,
  transition: { type: "cut" | "fade"; ms: number },
): Composition {
  if (composition.locked) return composition;
  return { ...composition, transition: sanitizeTransition(transition) };
}

/** Canonical preview/program source id for a look. Ids already prefixed stay as-is. */
export function compositionSourceId(compositionId: string): string {
  return compositionId.startsWith("composition:") ? compositionId : `composition:${compositionId}`;
}

/**
 * Resolve a composition id from a preview/program source id.
 * Accepts `composition:{id}` and legacy double-prefixed `composition:composition:{id}`.
 */
export function compositionIdFromSource(sourceId: string | null): string | null {
  if (!sourceId?.startsWith("composition:")) return null;
  const rest = sourceId.slice("composition:".length);
  return rest.startsWith("composition:") ? rest : sourceId;
}

export function takeTransitionForPreview(
  sourceId: string | null,
  looks: Array<{ id: string; transition: Composition["transition"] }>,
  fallback: Composition["transition"],
): Composition["transition"] {
  const compositionId = compositionIdFromSource(sourceId);
  if (!compositionId) return sanitizeTransition(fallback);
  const look = looks.find((entry) => entry.id === compositionId);
  return sanitizeTransition(look?.transition ?? fallback);
}

export function renameComposition(composition: Composition, name: string): Composition {
  if (composition.locked) return composition;
  const next = name.trim();
  return next ? { ...composition, name: next } : composition;
}

export function persistLook(looks: CompositionDocument[], look: Composition): CompositionDocument[] {
  const clean = sanitizeComposition(look);
  return looks.some((entry) => entry.id === clean.id)
    ? looks.map((entry) => (entry.id === clean.id ? clean : entry))
    : [...looks, clean];
}

/** Drop a saved look by id. Does not touch Preview or Program. */
export function removeLook(looks: CompositionDocument[], id: string): CompositionDocument[] {
  return looks.filter((entry) => entry.id !== id);
}

export function compositionRundownItem(look: Composition): PresentationItem {
  const clean = sanitizeComposition(look);
  return {
    id: `item:${Math.random().toString(36).slice(2, 10)}`,
    kind: "composition",
    title: clean.name,
    composition: { compositionId: clean.id },
  };
}

export function queueLook(
  looks: CompositionDocument[],
  look: Composition,
): { looks: CompositionDocument[]; item: PresentationItem } {
  const clean = sanitizeComposition(look);
  return { looks: persistLook(looks, clean), item: compositionRundownItem(clean) };
}

export function presentSavedLook(
  looks: CompositionDocument[],
  compositionId: string,
  ctx: CompileContext,
): PresentationModel {
  const saved = looks.find((entry) => entry.id === compositionId);
  return saved ? presentComposition(sanitizeComposition(saved), ctx) : emptyModel(ctx.theme);
}

export type LowerThirdDesk = {
  title?: string;
  subtitle?: string;
  scripture?: { reference: string; attribution?: string };
  song?: { title: string; author?: string };
  announcement?: { heading: string; body: string };
};

export function lowerThirdCopy(template: LowerThirdTemplate, desk: LowerThirdDesk = {}): { title: string; subtitle: string } {
  if (template.id === "scripture-ref") {
    return {
      title: desk.scripture?.reference?.trim() || desk.title?.trim() || template.title,
      subtitle: desk.scripture?.attribution?.trim() || desk.subtitle?.trim() || template.subtitle,
    };
  }
  if (template.id === "song-title") {
    return {
      title: desk.song?.title?.trim() || desk.title?.trim() || template.title,
      subtitle: desk.song?.author?.trim() || desk.subtitle?.trim() || template.subtitle,
    };
  }
  if (template.id === "announcement") {
    return {
      title: desk.announcement?.heading?.trim() || desk.title?.trim() || template.title,
      subtitle: desk.announcement?.body?.trim() || desk.subtitle?.trim() || template.subtitle,
    };
  }
  return {
    title: desk.title?.trim() || template.title,
    subtitle: desk.subtitle?.trim() || template.subtitle,
  };
}

export function applyLowerThirdTemplate(
  composition: Composition,
  layerId: string,
  template: LowerThirdTemplate,
  title?: string,
  subtitle?: string,
): Composition {
  if (composition.locked) return composition;
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

/** Compile a source, then apply its text style (payload.style) on top of the theme. */
export function compileSource(source: SourceRef, ctx: CompileContext): PresentationModel {
  const model = compileSourceBase(source, ctx);
  return source.payload.style ? styleModel(model, parseTextStyle(source.payload.style)) : model;
}

function compileSourceBase(source: SourceRef, ctx: CompileContext): PresentationModel {
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
  if (source.type === "shape") {
    return {
      layout: "shape",
      theme: ctx.theme,
      reference: null,
      attribution: null,
      lines: [],
      imageUrl: null,
      backgroundImageUrl: null,
      shape: {
        kind: payload.kind === "ellipse" ? "ellipse" : "rect",
        fill: payload.fill && HEX_COLOR.test(payload.fill) ? payload.fill : "#ffffff",
        radius: Math.min(50, Math.max(0, Number(payload.radius) || 0)),
      },
    };
  }
  if (source.type === "qr") {
    return presentQr({
      theme: ctx.theme,
      data: payload.data ?? "",
      style: payload.pattern === "dots" || payload.pattern === "rounded" ? payload.pattern : "square",
      dark: payload.dark,
      light: payload.light,
      caption: payload.caption,
    });
  }
  if (source.type === "video" && payload.videoUrl) {
    return presentVideo({ theme: ctx.theme, videoUrl: payload.videoUrl, loop: payload.loop === "true", muted: payload.muted === "true" });
  }
  if (source.type === "camera" || source.type === "video" || source.type === "ndi") {
    return presentCamera({ theme: ctx.theme, label: payload.label || source.title });
  }
  if (source.type === "timer" || source.type === "countdown" || source.type === "clock") {
    const mode = source.type === "clock" ? "clock" : payload.mode === "countup" || payload.mode === "target" || payload.mode === "clock" ? payload.mode : "countdown";
    const painted = presentTimer(
      startIfNeeded(
        createTimer({
          id: source.id,
          name: source.title,
          mode,
          durationMs: Number(payload.durationMs) || 0,
          targetAt: payload.targetAt ? Number(payload.targetAt) : null,
          label: payload.label || source.title,
          warningMs: payload.warningMs ? Number(payload.warningMs) : DEFAULT_TIMER_WARNING_MS,
        }),
        ctx.now,
      ),
      ctx.theme,
      ctx.now,
    );
    // A clock shows only the time unless the operator gave it a label.
    return mode === "clock" && !payload.label?.trim() ? { ...painted, reference: null } : painted;
  }
  if (source.type === "lower-third") {
    return presentLowerThird(ctx.theme, payload.title || source.title, payload.subtitle || "");
  }
  if (source.type === "text") {
    // An empty heading is deliberate (deck text elements); only a missing one falls back to the title.
    return presentText({ theme: ctx.theme, layout: "title", heading: payload.heading ?? source.title, body: payload.body || "" });
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
      // On a deck page the page background shows through every element.
      model: composition.background ? { ...compileSource(layer.source, ctx), fill: "transparent" } : compileSource(layer.source, ctx),
      mirror: layer.source.type === "camera" && layer.source.payload.mirror === "true",
      animation: layer.animation,
    }));
  return {
    layout: "composition",
    theme: ctx.theme,
    ...(composition.background ? { fill: backgroundCss(composition.background) } : {}),
    reference: composition.name,
    attribution: null,
    lines: [],
    imageUrl: null,
    backgroundImageUrl: null,
    layers,
  };
}

export function previewComposition(live: LiveState, model: PresentationModel, compositionId: string): LiveState {
  return setPreview(live, frame(model, compositionSourceId(compositionId), "cut"));
}
