import {
  addLayer,
  LOWER_THIRD_TEMPLATES,
  sanitizeComposition,
  setLayerAnimation,
  sourceRef,
  type Composition,
  type SourceRef,
  type SourceType,
} from "./composition";
import { encodeTextStyle, parseTextStyle } from "./text-style";
import { DEFAULT_TIMER_WARNING_MS, type TimerMode } from "./timer";
import type { CompositionDocument, TextStyle } from "./types";

export type SharedSource = { id: string; name: string; source: SourceRef };

export type SourceKind = "camera" | "scripture" | "song" | "text" | "timer" | "clock" | "lower-third" | "image" | "video";

export const SOURCE_KINDS: { type: SourceKind; label: string }[] = [
  { type: "camera", label: "Camera" },
  { type: "scripture", label: "Scripture" },
  { type: "song", label: "Lyrics" },
  { type: "text", label: "Text" },
  { type: "timer", label: "Timer" },
  { type: "clock", label: "Clock" },
  { type: "lower-third", label: "Lower third" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
];

export type SourceFields =
  | { type: "camera"; deviceId: string; label: string; mirror: boolean }
  | { type: "scripture"; reference: string; body: string; attribution: string; verse: number; style: TextStyle }
  | { type: "song"; songId: string; sectionId: string; label: string; body: string; style: TextStyle }
  | { type: "text"; heading: string; body: string; style: TextStyle }
  | { type: "timer"; mode: TimerMode; durationMs: number; targetAt: number | null; label: string; warningMs: number; style: TextStyle }
  | { type: "clock"; label: string; style: TextStyle }
  | { type: "lower-third"; templateId: string; title: string; subtitle: string; style: TextStyle }
  | { type: "image"; assetId: string; name: string; imageUrl: string }
  | { type: "video"; assetId: string; name: string; videoUrl: string; loop: boolean; muted: boolean };

/** Payload entry for a style: omitted entirely when no style is set. */
function stylePayload(style: TextStyle): Record<string, string> {
  const encoded = encodeTextStyle(style);
  return encoded ? { style: encoded } : {};
}

const KINDS = new Set<string>(SOURCE_KINDS.map((kind) => kind.type));
const TIMER_MODES: TimerMode[] = ["countdown", "countup", "clock", "target"];

export function sourceKindLabel(type: SourceKind): string {
  return SOURCE_KINDS.find((kind) => kind.type === type)?.label ?? "Source";
}

export function isSourceKind(type: string): type is SourceKind {
  return KINDS.has(type);
}

export function createSharedSource(name: string, source: SourceRef): SharedSource {
  const kind = isSourceKind(source.type) ? sourceKindLabel(source.type) : "Source";
  return { id: `src:${Math.random().toString(36).slice(2, 10)}`, name: name.trim() || kind, source };
}

export function sanitizeSharedSource(value: unknown): SharedSource | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SharedSource>;
  const source = record.source;
  if (typeof record.id !== "string" || !record.id || typeof record.name !== "string") return null;
  if (!source || typeof source.type !== "string" || typeof source.id !== "string") return null;
  const payload: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source.payload ?? {})) if (typeof entry === "string") payload[key] = entry;
  return {
    id: record.id,
    name: record.name,
    source: { type: source.type as SourceType, id: source.id, title: typeof source.title === "string" ? source.title : source.type, payload },
  };
}

export function sourcesOfType(sources: SharedSource[], type: SourceKind): SharedSource[] {
  return sources.filter((entry) => entry.source.type === type);
}

export function nextSourceName(sources: SharedSource[], type: SourceKind): string {
  const base = sourceKindLabel(type);
  const names = new Set(sources.map((entry) => entry.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function linkLayer(composition: Composition, layerId: string, shared: SharedSource): Composition {
  if (composition.locked) return composition;
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.id === layerId ? { ...layer, name: shared.name, sourceKey: shared.id, source: shared.source } : layer,
    ),
  };
}

export function addSharedLayer(composition: Composition, shared: SharedSource): Composition {
  if (composition.locked) return composition;
  const lower = shared.source.type === "lower-third";
  let next = addLayer(composition, {
    name: shared.name,
    bounds: lower ? { x: 6, y: 72, w: 55, h: 22 } : { x: 0, y: 0, w: 100, h: 100 },
    fit: shared.source.type === "camera" ? "cover" : "contain",
    source: shared.source,
  });
  const layer = next.layers[next.layers.length - 1]!;
  next = linkLayer(next, layer.id, shared);
  if (lower) {
    const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === shared.source.payload.templateId);
    if (template) next = setLayerAnimation(next, layer.id, template.animation);
  }
  return next;
}

function uses(look: Composition, id: string) {
  return look.layers.some((layer) => layer.sourceKey === id);
}

export function lockedLooksUsing(looks: CompositionDocument[], id: string): string[] {
  return looks
    .map((entry) => sanitizeComposition(entry))
    .filter((look) => look.locked && uses(look, id))
    .map((look) => look.name);
}

export function updateSharedSource(
  sources: SharedSource[],
  looks: CompositionDocument[],
  id: string,
  next: { name: string; source: SourceRef },
): { ok: true; sources: SharedSource[]; looks: CompositionDocument[] } | { ok: false; blocked: string[] } {
  const current = sources.find((entry) => entry.id === id);
  if (!current) return { ok: true, sources, looks };
  const blocked = lockedLooksUsing(looks, id);
  if (blocked.length) return { ok: false, blocked };
  const shared: SharedSource = { id, name: next.name.trim() || current.name, source: next.source };
  return {
    ok: true,
    sources: sources.map((entry) => (entry.id === id ? shared : entry)),
    looks: looks.map((entry) => {
      const look = sanitizeComposition(entry);
      if (!uses(look, id)) return entry;
      return {
        ...look,
        layers: look.layers.map((layer) => (layer.sourceKey === id ? { ...layer, name: shared.name, source: shared.source } : layer)),
      };
    }),
  };
}

export function pruneSharedSources(sources: SharedSource[], looks: CompositionDocument[]): SharedSource[] {
  const keys = new Set(looks.flatMap((entry) => sanitizeComposition(entry).layers.map((layer) => layer.sourceKey)));
  return sources.filter((entry) => keys.has(entry.id));
}

function same(left: SourceRef, right: SourceRef) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Called on every look save. A linked layer whose copy differs from its shared source
 * becomes the new shared value everywhere; if a locked look blocks that, only this layer unlinks.
 */
export function syncLinkedEdits(
  sources: SharedSource[],
  looks: CompositionDocument[],
  look: Composition,
): { sources: SharedSource[]; looks: CompositionDocument[]; look: Composition; unlinked: string[] } {
  let nextSources = sources;
  let nextLooks = looks.filter((entry) => entry.id !== look.id);
  const unlinked: string[] = [];
  const layers = look.layers.map((layer) => {
    if (!layer.sourceKey) return layer;
    const shared = nextSources.find((entry) => entry.id === layer.sourceKey);
    if (!shared) {
      const { sourceKey: _drop, ...rest } = layer;
      return rest;
    }
    if (shared.name === layer.name && same(shared.source, layer.source)) return layer;
    const result = updateSharedSource(nextSources, nextLooks, shared.id, { name: layer.name, source: layer.source });
    if (!result.ok) {
      unlinked.push(layer.name);
      const { sourceKey: _drop, ...rest } = layer;
      return rest;
    }
    nextSources = result.sources;
    nextLooks = result.looks;
    return layer;
  });
  // Keep original order; the saved look's old entry stays in place for persistLook to replace.
  const merged = looks.map((entry) => (entry.id === look.id ? entry : (nextLooks.find((next) => next.id === entry.id) ?? entry)));
  return { sources: nextSources, looks: merged, look: { ...look, layers }, unlinked };
}

export function buildSource(fields: SourceFields): SourceRef {
  switch (fields.type) {
    case "camera":
      return sourceRef("camera", fields.deviceId || "camera", fields.label || "Camera", {
        deviceId: fields.deviceId,
        label: fields.label,
        mirror: fields.mirror ? "true" : "false",
      });
    case "scripture":
      return sourceRef("scripture", fields.reference, fields.reference, {
        reference: fields.reference,
        body: fields.body,
        attribution: fields.attribution,
        verse: String(fields.verse),
        ...stylePayload(fields.style),
      });
    case "song":
      return sourceRef("song", fields.songId || fields.label, fields.label, {
        songId: fields.songId,
        sectionId: fields.sectionId,
        label: fields.label,
        body: fields.body,
        ...stylePayload(fields.style),
      });
    case "text":
      return sourceRef("text", "text", fields.heading || "Text", { heading: fields.heading, body: fields.body, ...stylePayload(fields.style) });
    case "timer":
      return sourceRef("timer", "timer", fields.label || "Timer", {
        mode: fields.mode,
        durationMs: String(fields.durationMs),
        ...(fields.targetAt !== null ? { targetAt: String(fields.targetAt) } : {}),
        label: fields.label,
        warningMs: String(fields.warningMs),
        ...stylePayload(fields.style),
      });
    case "clock":
      return sourceRef("clock", "clock", fields.label || "Clock", { mode: "clock", label: fields.label, ...stylePayload(fields.style) });
    case "lower-third":
      return sourceRef("lower-third", fields.templateId, fields.title || "Lower third", {
        templateId: fields.templateId,
        title: fields.title,
        subtitle: fields.subtitle,
        ...stylePayload(fields.style),
      });
    case "image":
      return sourceRef("image", fields.assetId || "image", fields.name || "Image", {
        assetId: fields.assetId,
        imageUrl: fields.imageUrl,
      });
    case "video":
      return sourceRef("video", fields.assetId || "video", fields.name || "Video", {
        assetId: fields.assetId,
        videoUrl: fields.videoUrl,
        loop: fields.loop ? "true" : "false",
        muted: fields.muted ? "true" : "false",
      });
  }
}

export function fieldsFromSource(source: SourceRef): SourceFields | null {
  const p = source.payload;
  switch (source.type) {
    case "camera":
      return { type: "camera", deviceId: p.deviceId ?? source.id, label: p.label ?? source.title, mirror: p.mirror === "true" };
    case "scripture":
      return { type: "scripture", reference: p.reference ?? source.title, body: p.body ?? "", attribution: p.attribution ?? "", verse: Number(p.verse) || 1, style: parseTextStyle(p.style) };
    case "song":
      return { type: "song", songId: p.songId ?? "", sectionId: p.sectionId ?? "", label: p.label ?? source.title, body: p.body ?? "", style: parseTextStyle(p.style) };
    case "text":
      return { type: "text", heading: p.heading ?? source.title, body: p.body ?? "", style: parseTextStyle(p.style) };
    case "timer":
      if (p.mode === "clock") return { type: "clock", label: p.label ?? "", style: parseTextStyle(p.style) };
      return {
        type: "timer",
        mode: TIMER_MODES.includes(p.mode as TimerMode) ? (p.mode as TimerMode) : "countdown",
        durationMs: Number(p.durationMs) || 0,
        targetAt: p.targetAt ? Number(p.targetAt) : null,
        label: p.label ?? source.title,
        warningMs: p.warningMs ? Number(p.warningMs) : DEFAULT_TIMER_WARNING_MS,
        style: parseTextStyle(p.style),
      };
    case "clock":
      return { type: "clock", label: p.label ?? "", style: parseTextStyle(p.style) };
    case "lower-third":
      return { type: "lower-third", templateId: p.templateId ?? source.id, title: p.title ?? source.title, subtitle: p.subtitle ?? "", style: parseTextStyle(p.style) };
    case "image":
      return { type: "image", assetId: p.assetId ?? "", name: source.title, imageUrl: p.imageUrl ?? "" };
    case "video":
      // Old placeholder "video" layers (camera-card stand-ins) have no file and are not editable.
      if (!p.assetId && !p.videoUrl) return null;
      return { type: "video", assetId: p.assetId ?? "", name: source.title, videoUrl: p.videoUrl ?? "", loop: p.loop === "true", muted: p.muted === "true" };
    default:
      return null;
  }
}

export function defaultFields(type: SourceKind, ctx: { cameras: { deviceId: string; label: string }[] }): SourceFields {
  switch (type) {
    case "camera": {
      const camera = ctx.cameras[0];
      return { type: "camera", deviceId: camera?.deviceId ?? "", label: camera?.label ?? "Camera", mirror: false };
    }
    case "scripture":
      return { type: "scripture", reference: "", body: "", attribution: "", verse: 1, style: {} };
    case "song":
      return { type: "song", songId: "", sectionId: "", label: "", body: "", style: {} };
    case "text":
      return { type: "text", heading: "", body: "", style: {} };
    case "timer":
      return { type: "timer", mode: "countdown", durationMs: 10 * 60_000, targetAt: null, label: "Service starts in", warningMs: DEFAULT_TIMER_WARNING_MS, style: {} };
    case "clock":
      return { type: "clock", label: "", style: {} };
    case "lower-third":
      return { type: "lower-third", templateId: "speaker", title: "", subtitle: "", style: {} };
    case "image":
      return { type: "image", assetId: "", name: "", imageUrl: "" };
    case "video":
      return { type: "video", assetId: "", name: "", videoUrl: "", loop: false, muted: false };
  }
}

/**
 * Media layers keep their asset id; the playable URL can go stale (browser blob URLs live
 * for one session). Refresh image/video URLs from the media library before painting.
 */
export function withMediaUrls(composition: Composition, resolve: (assetId: string) => string | null): Composition {
  let changed = false;
  const layers = composition.layers.map((layer) => {
    const { type, payload } = layer.source;
    if ((type !== "image" && type !== "video") || !payload.assetId) return layer;
    const url = resolve(payload.assetId);
    const key = type === "image" ? "imageUrl" : "videoUrl";
    if (!url || payload[key] === url) return layer;
    changed = true;
    return { ...layer, source: { ...layer.source, payload: { ...payload, [key]: url } } };
  });
  return changed ? { ...composition, layers } : composition;
}
