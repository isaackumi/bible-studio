import { encodeRich, inlineRuns, parseRich, scaleRuns, type RichDoc } from "./rich-text";
import { presentCamera } from "./camera";
import { frame, setPreview } from "./live";
import { presentImage, presentLyrics, presentScripture, presentText, presentVideo } from "./present";
import { createTimer, DEFAULT_TIMER_WARNING_MS, presentTimer, type TimerMode } from "./timer";
import { encodeTextStyle, parseTextStyle, styleModel } from "./text-style";
import { presentQr } from "./overlays";
import { emptyModel } from "./theme";
import type { CompositionDocument, LiveState, PresentationItem, PresentationModel, TextStyle, Theme } from "./types";
import { webTarget } from "./web";
import { ndiStreamUrl } from "./ndi";

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
  | "empty"
  | "web";

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
  /** A panel behind the layer so words read over a camera or picture. */
  backing?: LayerBacking;
};

export type LayerBacking = { color: string; opacity: number };

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
  /** Folder color in the Scenes list (#rrggbb). Organizing only; allowed while locked. */
  color?: string;
  canvas: { width: number; height: number };
  layers: CompositionLayer[];
  transition: { type: "cut" | "fade"; ms: number };
  /** Where regions meet: touching, a line around each region, a clean gap, or framed panels with a gap. */
  edges?: CompositionEdges;
  /** The colour of a region's line or frame (#rrggbb); white when not set. */
  edgeColor?: string;
};

export type CompositionEdges = "touch" | "line" | "gap" | "framed";
export const EDGE_STYLES: readonly CompositionEdges[] = ["touch", "line", "gap", "framed"];
export const DEFAULT_EDGES: CompositionEdges = "line";

/** What a layout slot is for, so a layout can be filled from what is on the desk. */
export type SlotRole = "camera" | "scripture" | "lyrics" | "timer" | "clock" | "image" | "text" | "lower-third";

export type CompositionSlot = {
  id: string;
  name: string;
  bounds: LayerBounds;
  fit: LayerFit;
  role?: SlotRole;
  backing?: LayerBacking;
};

export type CompositionTemplate = {
  id: string;
  name: string;
  slots: CompositionSlot[];
  /** A layout the church saved from its own look. */
  custom?: boolean;
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
  /** The output's canvas in frame pixels (canvasFor the screen's shape): framed gaps keep their size on any shape. */
  canvas?: { width: number; height: number };
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

/** Tag each slot with what fills it, so a layout can be filled from the desk. */
/** Cameras and pictures fill their region edge to edge; words fit inside it. */
const FILLS: ReadonlySet<SlotRole> = new Set<SlotRole>(["camera", "image"]);

function withRoles(slots: CompositionSlot[], roles: SlotRole[]): CompositionSlot[] {
  return slots.map((slot, index) => {
    const role = roles[index];
    if (!role) return slot;
    return { ...slot, role, fit: FILLS.has(role) ? "cover" : slot.fit };
  });
}

export const COMPOSITION_TEMPLATES: CompositionTemplate[] = [
  { id: "full-frame", name: "Full Camera", slots: withRoles([FULL], ["camera"]) },
  { id: "full-scripture", name: "Full Scripture", slots: withRoles([{ ...FULL, fit: "contain" }], ["scripture"]) },
  { id: "full-lyrics", name: "Full Lyrics", slots: withRoles([{ ...FULL, fit: "contain" }], ["lyrics"]) },
  { id: "countdown", name: "Countdown", slots: withRoles([{ ...FULL, fit: "contain" }], ["timer"]) },
  { id: "announcement", name: "Announcement", slots: withRoles([{ ...FULL, fit: "contain" }], ["text"]) },
  { id: "split-two", name: "Two regions", slots: withRoles(SPLIT, ["scripture", "camera"]) },
  { id: "scripture-camera", name: "Scripture + Camera", slots: withRoles(SPLIT, ["scripture", "camera"]) },
  { id: "lyrics-camera", name: "Lyrics + Camera", slots: withRoles(SPLIT, ["lyrics", "camera"]) },
  { id: "image-camera", name: "Image + Camera", slots: withRoles(SPLIT, ["image", "camera"]) },
  { id: "two-cameras", name: "Two Cameras", slots: withRoles(SPLIT, ["camera", "camera"]) },
  // Slides stay whole (nothing cropped off a page).
  { id: "camera-presentation", name: "Camera + Presentation", slots: withRoles(SPLIT, ["camera", "image"]).map((slot) => (slot.id === "b" ? { ...slot, fit: "contain" as const } : slot)) },
  {
    id: "three-cameras",
    name: "Three Cameras",
    slots: [
      { id: "main", name: "Main camera", bounds: { x: 0, y: 0, w: 66.6667, h: 100 }, fit: "cover", role: "camera" },
      { id: "top", name: "Camera 2", bounds: { x: 66.6667, y: 0, w: 33.3333, h: 50 }, fit: "cover", role: "camera" },
      { id: "bottom", name: "Camera 3", bounds: { x: 66.6667, y: 50, w: 33.3333, h: 50 }, fit: "cover", role: "camera" },
    ],
  },
  {
    id: "four-cameras",
    name: "Four Cameras",
    slots: [
      { id: "a", name: "Camera 1", bounds: { x: 0, y: 0, w: 50, h: 50 }, fit: "cover", role: "camera" },
      { id: "b", name: "Camera 2", bounds: { x: 50, y: 0, w: 50, h: 50 }, fit: "cover", role: "camera" },
      { id: "c", name: "Camera 3", bounds: { x: 0, y: 50, w: 50, h: 50 }, fit: "cover", role: "camera" },
      { id: "d", name: "Camera 4", bounds: { x: 50, y: 50, w: 50, h: 50 }, fit: "cover", role: "camera" },
    ],
  },
  {
    id: "camera-lower-third",
    name: "Camera + Lower Third",
    slots: [
      { id: "fill", name: "Fill", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "lower", name: "Lower third", bounds: { x: 6, y: 72, w: 55, h: 22 }, fit: "contain", role: "lower-third" },
    ],
  },
  {
    id: "camera-countdown",
    name: "Camera + Countdown",
    slots: [
      { id: "fill", name: "Fill", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "timer", name: "Timer", bounds: { x: 68, y: 8, w: 28, h: 18 }, fit: "contain", role: "timer" },
    ],
  },
  {
    id: "pip",
    name: "Picture in Picture",
    slots: [
      { id: "main", name: "Main camera", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "inset", name: "Inset camera", bounds: { x: 72, y: 70, w: 24, h: 24 }, fit: "cover", role: "camera" },
    ],
  },
  {
    id: "camera-scripture-lower",
    name: "Camera + Scripture bar",
    slots: [
      { id: "fill", name: "Camera", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "verse", name: "Scripture", bounds: { x: 4, y: 66, w: 92, h: 28 }, fit: "contain", role: "scripture", backing: { color: "#050505", opacity: 0.72 } },
    ],
  },
  {
    id: "camera-lyrics-lower",
    name: "Camera + Lyrics bar",
    slots: [
      { id: "fill", name: "Camera", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "lyrics", name: "Lyrics", bounds: { x: 4, y: 70, w: 92, h: 24 }, fit: "contain", role: "lyrics", backing: { color: "#050505", opacity: 0.72 } },
    ],
  },
  {
    id: "camera-sidebar",
    name: "Camera + Scripture side",
    slots: [
      { id: "fill", name: "Camera", bounds: { x: 0, y: 0, w: 66.6667, h: 100 }, fit: "cover", role: "camera" },
      { id: "verse", name: "Scripture", bounds: { x: 66.6667, y: 0, w: 33.3333, h: 100 }, fit: "contain", role: "scripture", backing: { color: "#050505", opacity: 0.92 } },
    ],
  },
  {
    id: "scripture-speaker",
    name: "Scripture + Speaker inset",
    slots: [
      { id: "verse", name: "Scripture", bounds: { x: 3, y: 6, w: 63, h: 88 }, fit: "contain", role: "scripture" },
      { id: "inset", name: "Speaker", bounds: { x: 68, y: 33, w: 29, h: 34 }, fit: "cover", role: "camera" },
    ],
  },
  {
    id: "image-scripture",
    name: "Picture + Scripture",
    slots: [
      { id: "picture", name: "Picture", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "image" },
      { id: "verse", name: "Scripture", bounds: { x: 10, y: 22, w: 80, h: 56 }, fit: "contain", role: "scripture", backing: { color: "#050505", opacity: 0.55 } },
    ],
  },
  {
    id: "lyrics-countdown",
    name: "Lyrics + Countdown",
    slots: [
      { id: "lyrics", name: "Lyrics", bounds: { x: 0, y: 14, w: 100, h: 86 }, fit: "contain", role: "lyrics" },
      { id: "timer", name: "Countdown", bounds: { x: 70, y: 3, w: 27, h: 16 }, fit: "contain", role: "timer" },
    ],
  },
  {
    id: "welcome-countdown",
    name: "Welcome + Countdown",
    slots: [
      { id: "welcome", name: "Welcome", bounds: { x: 0, y: 4, w: 100, h: 56 }, fit: "contain", role: "text" },
      { id: "timer", name: "Countdown", bounds: { x: 30, y: 60, w: 40, h: 30 }, fit: "contain", role: "timer" },
    ],
  },
  {
    id: "camera-clock",
    name: "Camera + Time",
    slots: [
      { id: "fill", name: "Camera", bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", role: "camera" },
      { id: "clock", name: "Time", bounds: { x: 76, y: 4, w: 21, h: 13 }, fit: "contain", role: "clock", backing: { color: "#050505", opacity: 0.72 } },
    ],
  },
  {
    id: "three-across",
    name: "Three Across",
    slots: [
      { id: "a", name: "Camera 1", bounds: { x: 0, y: 0, w: 33.3333, h: 100 }, fit: "cover", role: "camera" },
      { id: "b", name: "Camera 2", bounds: { x: 33.3333, y: 0, w: 33.3333, h: 100 }, fit: "cover", role: "camera" },
      { id: "c", name: "Camera 3", bounds: { x: 66.6667, y: 0, w: 33.3333, h: 100 }, fit: "cover", role: "camera" },
    ],
  },
  {
    id: "scripture-countdown",
    name: "Scripture + Countdown",
    slots: [
      { id: "verse", name: "Scripture", bounds: { x: 0, y: 14, w: 100, h: 86 }, fit: "contain", role: "scripture" },
      { id: "timer", name: "Countdown", bounds: { x: 70, y: 3, w: 27, h: 16 }, fit: "contain", role: "timer" },
    ],
  },
  {
    id: "scripture-clock",
    name: "Scripture + Time",
    slots: [
      { id: "verse", name: "Scripture", bounds: { x: 0, y: 14, w: 100, h: 86 }, fit: "contain", role: "scripture" },
      { id: "clock", name: "Time", bounds: { x: 76, y: 3, w: 21, h: 13 }, fit: "contain", role: "clock" },
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

/** Folder colors offered in the Scenes list. */
export const SCENE_COLORS = ["#e8603c", "#f2b33d", "#3fb950", "#2fb8a6", "#4c8dff", "#8b6cff", "#e05da8", "#8a8f98"] as const;

export function setCompositionColor(composition: Composition, color: string | null): Composition {
  const { color: _old, ...rest } = composition;
  return color && HEX_COLOR.test(color) ? { ...rest, color: color.toLowerCase() } : rest;
}

/** Move a saved scene to a new position in the list. Unknown ids leave the list as is. */
export function moveLook<T extends { id: string }>(looks: T[], id: string, toIndex: number): T[] {
  const from = looks.findIndex((entry) => entry.id === id);
  if (from < 0) return looks;
  const next = looks.slice();
  const [moved] = next.splice(from, 1);
  const target = Math.max(0, Math.min(next.length, toIndex > from ? toIndex - 1 : toIndex));
  next.splice(target, 0, moved!);
  return next;
}

export function setCompositionLocked(composition: Composition, locked: boolean): Composition {
  return { ...composition, locked: !!locked };
}

export function addLayer(
  composition: Composition,
  input: { name: string; bounds: LayerBounds; source?: SourceRef; fit?: LayerFit; backing?: LayerBacking },
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
    ...(input.backing ? { backing: sanitizeBacking(input.backing)! } : {}),
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
      // A camera or video arriving in a layer fills it; keep the layer's fit if it already showed one.
      const fit = MOVING.has(source.type) && !MOVING.has(layer.source.type) ? "cover" : layer.fit;
      return { ...layer, fit, source: sanitizeSource(kept) };
    }),
  };
}

/** Moving pictures: they fill their region rather than sit letterboxed inside it. */
const MOVING: ReadonlySet<SourceType> = new Set<SourceType>(["camera", "video", "ndi"]);

/** Overlays (lower thirds, timers, the time, QR codes, shapes) never get region edges. */
const OVERLAYS: ReadonlySet<SourceType> = new Set<SourceType>(["lower-third", "timer", "clock", "countdown", "qr", "shape", "empty"]);

export function setCompositionEdges(composition: Composition, edges: CompositionEdges): Composition {
  if (composition.locked) return composition;
  return { ...composition, edges };
}

/** The colour of the lines and frames between regions (#rrggbb). */
export function setCompositionEdgeColor(composition: Composition, color: string): Composition {
  if (composition.locked || !HEX_COLOR.test(color)) return composition;
  return { ...composition, edgeColor: color.toLowerCase() };
}

/** Regions that get an edge: not the full screen, not an overlay, not a words bar on a backing. */
function isRegion(layer: CompositionLayer): boolean {
  const full = layer.bounds.x <= 0.01 && layer.bounds.y <= 0.01 && layer.bounds.w >= 99.99 && layer.bounds.h >= 99.99;
  return !full && !layer.backing && !OVERLAYS.has(layer.source.type);
}

/** Framed regions pull in from the screen edges by a gap, and from each other by the same gap. */
const FRAME_GAP = 28;

function framedBounds(bounds: LayerBounds, canvas: { width: number; height: number }): LayerBounds {
  const gx = (FRAME_GAP / canvas.width) * 100;
  const gy = (FRAME_GAP / canvas.height) * 100;
  const left = bounds.x <= 0.01 ? gx : gx / 2;
  const right = bounds.x + bounds.w >= 99.99 ? gx : gx / 2;
  const top = bounds.y <= 0.01 ? gy : gy / 2;
  const bottom = bounds.y + bounds.h >= 99.99 ? gy : gy / 2;
  return { x: bounds.x + left, y: bounds.y + top, w: Math.max(1, bounds.w - left - right), h: Math.max(1, bounds.h - top - bottom) };
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

/** Fill a layer with words: heading and body, or formatted text (`rich`, the Formatted tab). */
export function assignText(composition: Composition, layerId: string, heading: string, body: string, rich: RichDoc | null = null): Composition {
  const title = heading.trim() || "Announcement";
  return assignLayerSource(composition, layerId, sourceRef("text", "announcement", title, { heading: title, body, ...(rich ? { mode: "rich", rich: encodeRich(rich) } : {}) }));
}

export function assignScripture(
  composition: Composition,
  layerId: string,
  input: { reference: string; body: string; attribution?: string; verse?: number; translationId?: string },
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
      ...(input.translationId ? { translationId: input.translationId } : {}),
    }),
  );
}

/** The first visible scripture region of a look, if it has one. */
export function scriptureLayerOf(composition: Composition): CompositionLayer | undefined {
  return layerOrder(composition).find((layer) => layer.visible && layer.source.type === "scripture");
}

/**
 * Put a verse in a look's scripture region while the service runs. Unlike editing, this works on
 * a locked look: a lock stops the layout changing, not the verse moving on.
 */
export function withLiveScripture(
  composition: Composition,
  layerId: string,
  input: { reference: string; body: string; attribution: string; verse: number; translationId: string },
): Composition {
  const reference = input.reference.trim() || "Scripture";
  return {
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const style = layer.source.payload.style;
      const source = sourceRef("scripture", reference, reference, {
        reference,
        body: input.body,
        attribution: input.attribution,
        verse: String(Math.max(1, Math.round(input.verse) || 1)),
        translationId: input.translationId,
        ...(style ? { style } : {}),
      });
      return { ...layer, source: sanitizeSource(source) };
    }),
  };
}

export function assignSong(composition: Composition, layerId: string, input: { label: string; body: string }): Composition {
  const label = input.label.trim() || "Lyrics";
  return assignLayerSource(composition, layerId, sourceRef("song", label, label, { label, body: input.body }));
}

export function instantiateTemplate(template: CompositionTemplate, name: string): Composition {
  return template.slots.reduce(
    (composition, slot) => addLayer(composition, { name: slot.name, bounds: slot.bounds, fit: slot.fit, backing: slot.backing, source: sourceRef("empty", slot.id, slot.name) }),
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

type ScriptureInput = { reference: string; body: string; attribution?: string; verse?: number };

function scriptureSource(input: ScriptureInput): SourceRef {
  return sourceRef("scripture", input.reference, input.reference, {
    reference: input.reference,
    body: input.body,
    attribution: input.attribution ?? "KJV",
    verse: String(input.verse ?? 1),
  });
}

/** Scripture filling the screen with a countdown in the corner (sermon time, service start). */
export function lookScriptureCountdown(input: ScriptureInput & { durationMs?: number; label?: string }): Composition {
  const template = COMPOSITION_TEMPLATES.find((entry) => entry.id === "scripture-countdown")!;
  let composition = instantiateTemplate(template, "Scripture + Countdown");
  const [verse, timer] = composition.layers;
  if (verse) composition = assignLayerSource(composition, verse.id, scriptureSource(input));
  if (timer) {
    composition = assignLayerSource(
      composition,
      timer.id,
      sourceRef("timer", "service", input.label ?? "Time left", {
        mode: "countdown",
        durationMs: String(input.durationMs ?? 30 * 60_000),
        label: input.label ?? "Time left",
      }),
    );
  }
  return composition;
}

/** Scripture filling the screen with the time of day in the corner. */
export function lookScriptureClock(input: ScriptureInput): Composition {
  const template = COMPOSITION_TEMPLATES.find((entry) => entry.id === "scripture-clock")!;
  let composition = instantiateTemplate(template, "Scripture + Time");
  const [verse, clock] = composition.layers;
  if (verse) composition = assignLayerSource(composition, verse.id, scriptureSource(input));
  if (clock) composition = assignLayerSource(composition, clock.id, sourceRef("clock", "clock", "Time", { mode: "clock", label: "" }));
  return composition;
}

/** What the desk has right now, for filling a layout's slots by role. */
export type DeskContent = {
  scripture: ScriptureInput;
  lyrics: { label: string; lines: string[] };
  cameras: { id: string; label: string }[];
  image: { imageUrl: string; title: string };
  announcement: { heading: string; body: string };
  timer: { durationMs: number; label: string };
  lowerThird: { title: string; subtitle: string };
};

/** Fill each slot of a layout from the desk by its role. Slots without a role stay empty. */
export function fillTemplate(template: CompositionTemplate, content: DeskContent): Composition {
  let composition = instantiateTemplate(template, template.name);
  let cameraIndex = 0;
  template.slots.forEach((slot, index) => {
    const layer = composition.layers[index];
    if (!layer || !slot.role) return;
    if (slot.role === "lower-third") {
      composition = applyLowerThirdTemplate(composition, layer.id, LOWER_THIRD_TEMPLATES[0]!, content.lowerThird.title, content.lowerThird.subtitle);
      return;
    }
    const camera = () => {
      const pick = content.cameras[cameraIndex++ % Math.max(1, content.cameras.length)] ?? { id: "cam-1", label: "Camera 1" };
      return sourceRef("camera", pick.id, pick.label, { deviceId: pick.id, label: pick.label });
    };
    const source: Record<Exclude<SlotRole, "lower-third">, () => SourceRef> = {
      camera,
      scripture: () => scriptureSource(content.scripture),
      lyrics: () => sourceRef("song", content.lyrics.label, content.lyrics.label, { label: content.lyrics.label, body: content.lyrics.lines.join("\n") }),
      timer: () => sourceRef("timer", "service", content.timer.label, { mode: "countdown", durationMs: String(content.timer.durationMs), label: content.timer.label }),
      clock: () => sourceRef("clock", "clock", "Time", { mode: "clock", label: "" }),
      image: () => sourceRef("image", content.image.title, content.image.title, { imageUrl: content.image.imageUrl }),
      text: () => sourceRef("text", "announcement", content.announcement.heading, { heading: content.announcement.heading, body: content.announcement.body }),
    };
    composition = assignLayerSource(composition, layer.id, source[slot.role]());
    // Generic slot names ("Region A", "Fill") become what the layer shows.
    if (/^(region [a-z]|fill|main|inset)$/i.test(layer.name)) composition = renameLayer(composition, layer.id, ROLE_NAMES[slot.role]);
  });
  return composition;
}

const ROLE_NAMES: Record<SlotRole, string> = {
  camera: "Camera",
  scripture: "Scripture",
  lyrics: "Lyrics",
  timer: "Countdown",
  clock: "Time",
  image: "Picture",
  text: "Text",
  "lower-third": "Lower third",
};

function roleOf(type: SourceType): SlotRole | undefined {
  if (type === "camera" || type === "video" || type === "ndi") return "camera";
  if (type === "scripture") return "scripture";
  if (type === "song") return "lyrics";
  if (type === "timer" || type === "countdown") return "timer";
  if (type === "clock" || type === "image" || type === "text" || type === "lower-third") return type;
  return undefined;
}

/** Save a look's arrangement (not its content) as a layout the church can start from again. */
export function layoutFromLook(composition: Composition, name: string): CompositionTemplate {
  return {
    id: `custom-${uid()}`,
    name: name.trim().slice(0, 60) || composition.name,
    custom: true,
    slots: layerOrder(composition)
      .filter((layer) => layer.visible)
      .map((layer) => ({
        id: layer.id,
        name: layer.name,
        bounds: layer.bounds,
        fit: layer.fit,
        ...(roleOf(layer.source.type) ? { role: roleOf(layer.source.type)! } : {}),
        ...(layer.backing ? { backing: layer.backing } : {}),
      })),
  };
}

const ROLES: SlotRole[] = ["camera", "scripture", "lyrics", "timer", "clock", "image", "text", "lower-third"];

export function sanitizeLayouts(value: unknown): CompositionTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).flatMap((entry) => {
    const record = entry && typeof entry === "object" ? (entry as Partial<CompositionTemplate>) : null;
    if (!record || typeof record.id !== "string" || !Array.isArray(record.slots) || record.slots.length === 0) return [];
    const slots = record.slots.slice(0, 12).map((slot, index) => ({
      id: typeof slot.id === "string" && slot.id ? slot.id : `slot-${index}`,
      name: typeof slot.name === "string" && slot.name ? slot.name.slice(0, 60) : `Region ${index + 1}`,
      bounds: sanitizeBounds(slot.bounds ?? { x: 0, y: 0, w: 100, h: 100 }),
      fit: slot.fit === "cover" || slot.fit === "fill" ? slot.fit : ("contain" as LayerFit),
      ...(ROLES.includes(slot.role as SlotRole) ? { role: slot.role as SlotRole } : {}),
      ...(sanitizeBacking(slot.backing) ? { backing: sanitizeBacking(slot.backing)! } : {}),
    }));
    return [{ id: record.id, name: typeof record.name === "string" && record.name ? record.name.slice(0, 60) : "My layout", custom: true, slots }];
  });
}

/**
 * Swap sides: mirror every unlocked layer left to right, so a split trades places and a
 * corner timer moves to the other corner. Doing it twice puts everything back.
 */
export function swapSides(composition: Composition): Composition {
  if (composition.locked) return composition;
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.locked ? layer : { ...layer, bounds: { ...layer.bounds, x: round(100 - layer.bounds.x - layer.bounds.w) } },
    ),
  };
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
    ...(typeof record.color === "string" && HEX_COLOR.test(record.color) ? { color: record.color.toLowerCase() } : {}),
    id: typeof record.id === "string" && record.id ? record.id : base.id,
    locked: record.locked === true,
    canvas: record.canvas?.width && record.canvas?.height ? record.canvas : base.canvas,
    transition: sanitizeTransition(record.transition),
    edges: EDGE_STYLES.includes(record.edges as CompositionEdges) ? (record.edges as CompositionEdges) : DEFAULT_EDGES,
    ...(typeof record.edgeColor === "string" && HEX_COLOR.test(record.edgeColor) ? { edgeColor: record.edgeColor.toLowerCase() } : {}),
    layers: layers.map((layer, index) => ({
      id: layer.id || `layer:${index}`,
      name: layer.name || `Layer ${index + 1}`,
      zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1,
      bounds: sanitizeBounds(layer.bounds ?? { x: 0, y: 0, w: 100, h: 100 }),
      fit: layer.fit === "cover" || layer.fit === "fill" ? layer.fit : legacyFill(record, layer) ? "cover" : "contain",
      source: sanitizeSource(layer.source),
      animation: sanitizeAnimation(layer.animation),
      ...(typeof layer.sourceKey === "string" && layer.sourceKey ? { sourceKey: layer.sourceKey } : {}),
      ...(sanitizeBacking(layer.backing) ? { backing: sanitizeBacking(layer.backing)! } : {}),
    })),
  };
}

/** Looks saved before region edges existed letterboxed cameras and video in split regions; they now fill. */
function legacyFill(record: Partial<Composition>, layer: Partial<CompositionLayer>): boolean {
  return record.edges === undefined && !!layer.source && MOVING.has(layer.source.type);
}

function sanitizeBacking(value: unknown): LayerBacking | null {
  const record = value && typeof value === "object" ? (value as Partial<LayerBacking>) : null;
  if (!record || typeof record.color !== "string" || !HEX_COLOR.test(record.color)) return null;
  const opacity = Number(record.opacity);
  return { color: record.color.toLowerCase(), opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.7 };
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
  /** The title and subtitle formatted (the Formatted tab); plain title and subtitle stay too. */
  rich: { title?: RichDoc | null; subtitle?: RichDoc | null } = {},
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
              // The layer keeps its text style when the template or words change.
              ...(layer.source.type === "lower-third" && layer.source.payload.style ? { style: layer.source.payload.style } : {}),
              ...(rich.title ? { titleRich: encodeRich(rich.title) } : {}),
              ...(rich.subtitle ? { subtitleRich: encodeRich(rich.subtitle) } : {}),
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
  if (source.type === "web") {
    const zoom = Number(payload.zoom);
    const target = webTarget(payload.url ?? "", { mute: payload.mute === "true" });
    return {
      layout: "web",
      theme: ctx.theme,
      reference: target?.label ?? "Website",
      attribution: null,
      lines: [],
      imageUrl: null,
      backgroundImageUrl: null,
      ...(target ? { web: { url: target.url, kind: target.kind, label: target.label, zoom: Number.isFinite(zoom) && zoom > 0 ? Math.min(3, Math.max(0.5, zoom)) : 1, mute: payload.mute === "true" } } : {}),
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
  // An NDI source shows the hub's picture stream; without a chosen source it is a camera card.
  if (source.type === "ndi" && payload.name) {
    return presentImage({ theme: ctx.theme, imageUrl: ndiStreamUrl(payload.name) });
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
    return presentLowerThird(ctx.theme, payload.title || source.title, payload.subtitle || "", parseRich(payload.titleRich), parseRich(payload.subtitleRich));
  }
  if (source.type === "text") {
    // An empty heading is deliberate (deck text elements); only a missing one falls back to the title.
    const rich = payload.mode === "rich" ? parseRich(payload.rich) : null;
    return presentText({ theme: ctx.theme, layout: "title", heading: payload.heading ?? source.title, body: payload.body || "", rich });
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

export function presentLowerThird(theme: Theme, title: string, subtitle: string, titleRich: RichDoc | null = null, subtitleRich: RichDoc | null = null): PresentationModel {
  // Formatted: one line for the name, a smaller one for the title (at the theme's attribution size).
  const formatted = titleRich || subtitleRich;
  const small = theme.attribution.size / Math.max(1, theme.fontSize);
  const rich: RichDoc | null = formatted
    ? {
        blocks: [
          { type: "p", runs: titleRich ? inlineRuns(titleRich) : title.trim() ? [{ text: title.trim(), bold: true }] : [] },
          ...(subtitleRich || subtitle.trim() ? [{ type: "p" as const, runs: scaleRuns(subtitleRich ? inlineRuns(subtitleRich) : [{ text: subtitle.trim() }], small) }] : []),
        ],
      }
    : null;
  return {
    ...(rich ? { rich } : {}),
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
  const edges = composition.background ? "touch" : (composition.edges ?? DEFAULT_EDGES);
  const layers = layerOrder(composition)
    .filter((layer) => layer.visible)
    .map((layer) => ({
      id: layer.id,
      zIndex: layer.zIndex,
      opacity: layer.opacity,
      bounds: (edges === "framed" || edges === "gap") && isRegion(layer) ? framedBounds(layer.bounds, ctx.canvas ?? composition.canvas) : layer.bounds,
      ...((edges === "line" || edges === "framed") && isRegion(layer) ? { edge: edges, ...(composition.edgeColor ? { edgeColor: composition.edgeColor } : {}) } : {}),
      fit: layer.fit,
      sourceId: `${layer.source.type}:${layer.source.id}`,
      // On a deck page the page background shows through every element.
      model: composition.background ? { ...compileSource(layer.source, ctx), fill: "transparent" } : compileSource(layer.source, ctx),
      mirror: layer.source.type === "camera" && layer.source.payload.mirror === "true",
      ...(layer.backing ? { backing: `color-mix(in srgb, ${layer.backing.color} ${Math.round(layer.backing.opacity * 100)}%, transparent)` } : {}),
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
