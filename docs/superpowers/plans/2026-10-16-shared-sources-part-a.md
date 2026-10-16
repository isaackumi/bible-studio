# Shared Sources + Source Dialogs (Part A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production Desk adds sources through an OBS-style Create/Select → Properties flow, and sources are shared across scenes so editing one updates every scene that uses it.

**Architecture:** A new pure module `src/lib/domain/sources.ts` owns shared-source rules (create, link, update-everywhere, lock blocking, pruning, field ⇄ `SourceRef` conversion). Layers keep their `SourceRef` copy plus a `sourceKey`; the session syncs copies on every save, so rendering, templates, rundown, and the Presenter Looks editor need no change. Two Svelte dialogs in `src/lib/components/sources/` drive the flow from `ObsDesk.svelte`.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest (`npm test`), svelte-check (`npm run check`).

Spec: `docs/superpowers/specs/2026-10-16-shared-sources-and-live-camera-design.md` (Part A).

## Global Constraints

- Program changes only through TAKE / CUT / AUTO / CLEAR / BLACK / LOGO. No dialog or source edit writes Program.
- A locked scene is fully frozen; a shared source used by any locked scene is not editable.
- `Workspace.schemaVersion` stays `2`; `sources` is an additive field defaulting to `[]`.
- Existing looks are not bulk-migrated; unlinked layers keep working unchanged.
- No capture code in `PewDesk.svelte`; no compile/Take logic in desk components beyond calling session methods.
- Commit messages follow repo style (sentence describing the operator outcome) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from spec (decided while planning)

- Presenter Looks editor is not edited. Instead `session.saveLook` runs `syncLinkedEdits`, which pushes a linked layer's edited copy to the shared source (or unlinks that one layer if a locked scene blocks it). Same guarantee — copies cannot drift — with no change to `CompositionPane.svelte`.
- Per-type fields live in one `SourceProperties.svelte` file rather than one component per type.
- Camera Properties thumbnail opens its own short-lived `getUserMedia` stream inside the dialog and stops it on close. It never touches Preview.
- Production Desk gains a "Remove source" button (none exists today), which is what triggers pruning.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/domain/types.ts` (modify) | `SharedSourceDocument`, `Workspace.sources`, `PaintedLayer.mirror` |
| `src/lib/domain/composition.ts` (modify) | `CompositionLayer.sourceKey`, sanitize keeps it, `presentComposition` sets `mirror` |
| `src/lib/domain/sources.ts` (create) | All shared-source rules + field conversion |
| `src/lib/domain/sources.test.ts` (create) | Unit tests for the above |
| `src/lib/domain/theme.ts` (modify) | `defaultWorkspace().sources = []` |
| `src/lib/workspace/document.ts` (modify) | normalize `sources` and keep `sourceKey` |
| `src/lib/workspace/document.test.ts` (modify) | round-trip test |
| `src/lib/app/session.svelte.ts` (modify) | source session methods; sync on save; prune on delete |
| `src/lib/components/FrameView.svelte` (modify) | mirror camera `<video>` |
| `src/lib/components/sources/DeskDialog.svelte` (create) | modal shell |
| `src/lib/components/sources/AddSourceDialog.svelte` (create) | Create new / Add existing |
| `src/lib/components/sources/SourceProperties.svelte` (create) | per-type Properties form |
| `src/lib/components/obs/ObsDesk.svelte` (modify) | + menu, dialogs, double-click/⚙, remove source |
| docs (modify) | backlog + composition-engine + media-sources |

---

### Task 1: Shared-source domain module

**Files:**
- Modify: `src/lib/domain/types.ts` (after `CompositionDocument`; `Workspace`; `PaintedLayer`)
- Modify: `src/lib/domain/composition.ts` (`CompositionLayer`, `sanitizeComposition`, `presentComposition`)
- Create: `src/lib/domain/sources.ts`
- Test: `src/lib/domain/sources.test.ts`

**Interfaces:**
- Produces (used by Tasks 2–4):
  - `type SharedSource = { id: string; name: string; source: SourceRef }`
  - `type SourceKind = "camera" | "scripture" | "song" | "text" | "timer" | "lower-third" | "image"`
  - `SOURCE_KINDS: { type: SourceKind; label: string }[]`
  - `type SourceFields` (discriminated union on `type`, below)
  - `createSharedSource(name: string, source: SourceRef): SharedSource`
  - `sanitizeSharedSource(value: unknown): SharedSource | null`
  - `nextSourceName(sources: SharedSource[], type: SourceKind): string`
  - `sourcesOfType(sources: SharedSource[], type: SourceKind): SharedSource[]`
  - `linkLayer(composition: Composition, layerId: string, shared: SharedSource): Composition`
  - `addSharedLayer(composition: Composition, shared: SharedSource): Composition` (new layer is last in `layers`)
  - `lockedLooksUsing(looks: CompositionDocument[], id: string): string[]`
  - `updateSharedSource(sources, looks, id, next: { name: string; source: SourceRef }): { ok: true; sources: SharedSource[]; looks: CompositionDocument[] } | { ok: false; blocked: string[] }`
  - `pruneSharedSources(sources: SharedSource[], looks: CompositionDocument[]): SharedSource[]`
  - `syncLinkedEdits(sources, looks, look: Composition): { sources: SharedSource[]; looks: CompositionDocument[]; look: Composition; unlinked: string[] }`
  - `buildSource(fields: SourceFields): SourceRef`
  - `fieldsFromSource(source: SourceRef): SourceFields | null`
  - `defaultFields(type: SourceKind, ctx: { cameras: { deviceId: string; label: string }[] }): SourceFields`
  - `CompositionLayer.sourceKey?: string`; `PaintedLayer.mirror?: boolean`; `Workspace.sources: SharedSourceDocument[]`

- [ ] **Step 1: Types.** In `types.ts` add after `CompositionDocument`:

```ts
/** Workspace-level source shared by scenes (OBS-style). `source` is a SourceRef. */
export type SharedSourceDocument = {
  id: string;
  name: string;
  source: { type: string; id: string; title: string; payload: Record<string, string> };
};
```

Add `sources: SharedSourceDocument[];` to `Workspace` after `compositions`, with doc comment `/** Shared sources. Scenes link to these by layer sourceKey. */`. Add `mirror?: boolean;` to `PaintedLayer`.

In `composition.ts` add `sourceKey?: string;` to `CompositionLayer` with comment `/** Link to Workspace.sources; absent = unlinked copy. */`. In `sanitizeComposition` layer map, append:

```ts
      ...(typeof (layer as { sourceKey?: unknown }).sourceKey === "string" && (layer as { sourceKey: string }).sourceKey
        ? { sourceKey: (layer as { sourceKey: string }).sourceKey }
        : {}),
```

In `presentComposition` layer map add `mirror: layer.source.type === "camera" && layer.source.payload.mirror === "true",`.

- [ ] **Step 2: Write failing tests** in `src/lib/domain/sources.test.ts`:

```ts
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
    const text = createSharedSource("Welcome", buildSource({ type: "text", heading: "Welcome", body: "" }));
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
    const shared = createSharedSource("Speaker", buildSource({ type: "lower-third", templateId: "speaker", title: "Pastor", subtitle: "" }));
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
      { type: "scripture", reference: "John 3:16", body: "For God so loved", attribution: "KJV", verse: 16 },
      { type: "song", songId: "s1", sectionId: "v1", label: "Amazing Grace — Verse 1", body: "Amazing grace\nHow sweet" },
      { type: "text", heading: "Welcome", body: "Coffee after" },
      { type: "timer", mode: "countdown", durationMs: 600000, targetAt: null, label: "Starts in" },
      { type: "lower-third", templateId: "speaker", title: "Pastor", subtitle: "Lead" },
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
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib/domain/sources.test.ts` — Expected: FAIL, cannot resolve `./sources`.

- [ ] **Step 4: Implement `src/lib/domain/sources.ts`:**

```ts
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
import type { TimerMode } from "./timer";
import type { CompositionDocument } from "./types";

export type SharedSource = { id: string; name: string; source: SourceRef };

export type SourceKind = "camera" | "scripture" | "song" | "text" | "timer" | "lower-third" | "image";

export const SOURCE_KINDS: { type: SourceKind; label: string }[] = [
  { type: "camera", label: "Camera" },
  { type: "scripture", label: "Scripture" },
  { type: "song", label: "Lyrics" },
  { type: "text", label: "Text" },
  { type: "timer", label: "Timer" },
  { type: "lower-third", label: "Lower third" },
  { type: "image", label: "Image" },
];

export type SourceFields =
  | { type: "camera"; deviceId: string; label: string; mirror: boolean }
  | { type: "scripture"; reference: string; body: string; attribution: string; verse: number }
  | { type: "song"; songId: string; sectionId: string; label: string; body: string }
  | { type: "text"; heading: string; body: string }
  | { type: "timer"; mode: TimerMode; durationMs: number; targetAt: number | null; label: string }
  | { type: "lower-third"; templateId: string; title: string; subtitle: string }
  | { type: "image"; assetId: string; name: string; imageUrl: string };

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
      });
    case "song":
      return sourceRef("song", fields.songId || fields.label, fields.label, {
        songId: fields.songId,
        sectionId: fields.sectionId,
        label: fields.label,
        body: fields.body,
      });
    case "text":
      return sourceRef("text", "text", fields.heading || "Text", { heading: fields.heading, body: fields.body });
    case "timer":
      return sourceRef("timer", "timer", fields.label || "Timer", {
        mode: fields.mode,
        durationMs: String(fields.durationMs),
        ...(fields.targetAt !== null ? { targetAt: String(fields.targetAt) } : {}),
        label: fields.label,
      });
    case "lower-third":
      return sourceRef("lower-third", fields.templateId, fields.title || "Lower third", {
        templateId: fields.templateId,
        title: fields.title,
        subtitle: fields.subtitle,
      });
    case "image":
      return sourceRef("image", fields.assetId || "image", fields.name || "Image", {
        assetId: fields.assetId,
        imageUrl: fields.imageUrl,
      });
  }
}

export function fieldsFromSource(source: SourceRef): SourceFields | null {
  const p = source.payload;
  switch (source.type) {
    case "camera":
      return { type: "camera", deviceId: p.deviceId ?? source.id, label: p.label ?? source.title, mirror: p.mirror === "true" };
    case "scripture":
      return { type: "scripture", reference: p.reference ?? source.title, body: p.body ?? "", attribution: p.attribution ?? "", verse: Number(p.verse) || 1 };
    case "song":
      return { type: "song", songId: p.songId ?? "", sectionId: p.sectionId ?? "", label: p.label ?? source.title, body: p.body ?? "" };
    case "text":
      return { type: "text", heading: p.heading ?? source.title, body: p.body ?? "" };
    case "timer":
      return {
        type: "timer",
        mode: TIMER_MODES.includes(p.mode as TimerMode) ? (p.mode as TimerMode) : "countdown",
        durationMs: Number(p.durationMs) || 0,
        targetAt: p.targetAt ? Number(p.targetAt) : null,
        label: p.label ?? source.title,
      };
    case "lower-third":
      return { type: "lower-third", templateId: p.templateId ?? source.id, title: p.title ?? source.title, subtitle: p.subtitle ?? "" };
    case "image":
      return { type: "image", assetId: p.assetId ?? "", name: source.title, imageUrl: p.imageUrl ?? "" };
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
      return { type: "scripture", reference: "", body: "", attribution: "", verse: 1 };
    case "song":
      return { type: "song", songId: "", sectionId: "", label: "", body: "" };
    case "text":
      return { type: "text", heading: "", body: "" };
    case "timer":
      return { type: "timer", mode: "countdown", durationMs: 10 * 60_000, targetAt: null, label: "Service starts in" };
    case "lower-third":
      return { type: "lower-third", templateId: "speaker", title: "", subtitle: "" };
    case "image":
      return { type: "image", assetId: "", name: "", imageUrl: "" };
  }
}
```

- [ ] **Step 5: Run** `npx vitest run src/lib/domain/sources.test.ts` — Expected: PASS. Then `npm test` — all pass. (`npm run check` will fail until Task 2 adds `sources` to `defaultWorkspace`/`normalizeWorkspace`; that is expected.)

- [ ] **Step 6: Commit** (with Task 2, since types require both to type-check).

### Task 2: Workspace persistence

**Files:**
- Modify: `src/lib/domain/theme.ts` (`defaultWorkspace`)
- Modify: `src/lib/workspace/document.ts` (`normalizeWorkspace`)
- Test: `src/lib/workspace/document.test.ts`

**Interfaces:**
- Consumes: `sanitizeSharedSource` (Task 1).
- Produces: `normalizeWorkspace(x).sources: SharedSourceDocument[]`, layers keep `sourceKey`.

- [ ] **Step 1: Failing test** appended to `document.test.ts` inside its top `describe`:

```ts
  it("keeps shared sources and layer source keys, defaulting to none", () => {
    expect(normalizeWorkspace({}).sources).toEqual([]);
    const shared = { id: "src:a", name: "Pulpit Cam", source: { type: "camera", id: "d", title: "Cam", payload: { deviceId: "d" } } };
    const look = { id: "composition:x", name: "A", canvas: { width: 1920, height: 1080 }, transition: { type: "fade", ms: 450 },
      layers: [{ id: "l1", name: "Pulpit Cam", sourceKey: "src:a", bounds: { x: 0, y: 0, w: 100, h: 100 }, source: shared.source }] };
    const clean = normalizeWorkspace({ sources: [shared, { bad: true }], compositions: [look] });
    expect(clean.sources).toEqual([shared]);
    expect((clean.compositions[0]!.layers[0] as { sourceKey?: string }).sourceKey).toBe("src:a");
  });
```

(Ensure `normalizeWorkspace` is imported in the test file; it already is if existing tests use it — otherwise add it to the import from `./document`.)

- [ ] **Step 2: Run** `npx vitest run src/lib/workspace/document.test.ts` — Expected: FAIL (`sources` undefined).

- [ ] **Step 3: Implement.** `theme.ts` `defaultWorkspace`: add `sources: [],` after `compositions: [],`. `document.ts`: import `sanitizeSharedSource` from `../domain/sources` and add after `compositions`:

```ts
    sources: Array.isArray(value.sources)
      ? value.sources.map(sanitizeSharedSource).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
```

- [ ] **Step 4: Run** `npm test` and `npm run check` — Expected: all pass, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/composition.ts src/lib/domain/sources.ts src/lib/domain/sources.test.ts src/lib/domain/theme.ts src/lib/workspace/document.ts src/lib/workspace/document.test.ts
git commit -m "Let scenes share named sources that stay in sync across every scene that uses them." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Session methods + camera mirror paint

**Files:**
- Modify: `src/lib/app/session.svelte.ts` (imports; `saveLook`; `deleteLook`; new methods next to `createSceneLook`)
- Modify: `src/lib/components/FrameView.svelte`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces (used by Task 4):
  - `session.sharedSources: SharedSource[]` (getter → `this.workspace.sources` sanitized)
  - `session.createSourceInScene(scene: Composition, name: string, source: SourceRef): string | null` — returns new layer id
  - `session.addExistingSourceToScene(scene: Composition, id: string): string | null`
  - `session.saveSharedSource(id: string, name: string, source: SourceRef): string[]` — `[]` = saved; else locked look names
  - `session.linkLayerToNewSource(scene: Composition, layerId: string, name: string, source: SourceRef): void`
  - `session.removeSceneLayer(scene: Composition, layerId: string): void`
  - `session.lockedScenesUsing(id: string): string[]`
  - `session.scriptureFields(reference: string): Promise<SourceFields | null>`

- [ ] **Step 1: Session code.** Add imports: from `../domain/sources` → `addSharedLayer, createSharedSource, linkLayer, lockedLooksUsing, pruneSharedSources, sanitizeSharedSource, syncLinkedEdits, updateSharedSource, type SharedSource, type SourceFields`; from `../domain/composition` add `removeLayer` and `type SourceRef` if missing; `parseReference, formatReference` from `../bible/reference` if missing.

Replace `saveLook` body:

```ts
  saveLook = (composition: Composition) => {
    const clean = sanitizeComposition(composition);
    const synced = syncLinkedEdits(this.sharedSources, this.workspace.compositions, clean);
    this.workspace = {
      ...this.workspace,
      sources: synced.sources,
      compositions: persistLook(synced.looks, synced.look),
    };
    if (this.lookOnPreview?.id === clean.id) this.lookOnPreview = synced.look;
    this.persistSoon();
    this.message = synced.unlinked.length
      ? `${synced.unlinked.join(", ")} unlinked: a locked scene uses the shared source. LIVE still sends Program.`
      : `${clean.name} saved. LIVE still sends Program.`;
  };
```

In `deleteLook`, replace the `this.workspace = {...}` line with:

```ts
    const compositions = removeLook(this.workspace.compositions, id);
    this.workspace = { ...this.workspace, compositions, sources: pruneSharedSources(this.sharedSources, compositions) };
```

Add after `setSceneLocked`:

```ts
  get sharedSources(): SharedSource[] {
    return (this.workspace.sources ?? []).map(sanitizeSharedSource).filter((entry): entry is SharedSource => entry !== null);
  }

  lockedScenesUsing = (id: string) => lockedLooksUsing(this.workspace.compositions, id);

  private stageScene = (next: Composition) => {
    this.saveLook(next);
    this.previewLook(next);
  };

  /** Create a shared source and add it as a new layer on the scene. Preview only. */
  createSourceInScene = (scene: Composition, name: string, source: SourceRef): string | null => {
    if (scene.locked) return null;
    const shared = createSharedSource(name, source);
    this.workspace = { ...this.workspace, sources: [...this.sharedSources, shared] };
    const next = addSharedLayer(scene, shared);
    this.stageScene(next);
    return next.layers[next.layers.length - 1]?.id ?? null;
  };

  addExistingSourceToScene = (scene: Composition, id: string): string | null => {
    const shared = this.sharedSources.find((entry) => entry.id === id);
    if (!shared || scene.locked) return null;
    const next = addSharedLayer(scene, shared);
    this.stageScene(next);
    return next.layers[next.layers.length - 1]?.id ?? null;
  };

  /** Edit a shared source everywhere. Returns locked scene names when refused. Never Program. */
  saveSharedSource = (id: string, name: string, source: SourceRef): string[] => {
    const result = updateSharedSource(this.sharedSources, this.workspace.compositions, id, { name, source });
    if (!result.ok) {
      this.message = `Used in locked scene "${result.blocked[0]}". Unlock to edit.`;
      return result.blocked;
    }
    this.workspace = { ...this.workspace, sources: result.sources, compositions: result.looks };
    this.persistSoon();
    const open = this.lookOnPreview && result.looks.find((entry) => entry.id === this.lookOnPreview?.id);
    if (open) this.previewLook(restoreComposition(open));
    this.message = `${name} saved. Program updates on TAKE.`;
    return [];
  };

  linkLayerToNewSource = (scene: Composition, layerId: string, name: string, source: SourceRef) => {
    if (scene.locked) return;
    const shared = createSharedSource(name, source);
    this.workspace = { ...this.workspace, sources: [...this.sharedSources, shared] };
    this.stageScene(linkLayer(scene, layerId, shared));
  };

  removeSceneLayer = (scene: Composition, layerId: string) => {
    if (scene.locked) return;
    this.stageScene(removeLayer(scene, layerId));
    this.workspace = { ...this.workspace, sources: pruneSharedSources(this.sharedSources, this.workspace.compositions) };
    this.persistSoon();
  };

  /** Resolve a typed reference to scripture fields (first translation). */
  scriptureFields = async (reference: string): Promise<SourceFields | null> => {
    const parsed = parseReference(reference, this.books);
    const translation = this.translations[0];
    if (!parsed?.startVerse || !translation) return null;
    const book = this.books.find((entry) => entry.ord === parsed.bookOrd);
    const end = parsed.endVerse ?? parsed.startVerse;
    const verses = await api.passage(translation.id, parsed.bookOrd, parsed.chapter, parsed.startVerse, end);
    return {
      type: "scripture",
      reference: formatReference(book?.name ?? "", parsed.chapter, parsed.startVerse, end, book?.chapters ?? 1),
      body: verses.map((verse) => verse.text).join(" "),
      attribution: translation.abbreviation || translation.name,
      verse: parsed.startVerse,
    };
  };
```

- [ ] **Step 2: FrameView mirror.** Add prop `mirror = false` (`mirror?: boolean`). On the `<video>` add `class:mirror={mirror}`; style `.mirror { transform: scaleX(-1); }`. In the composition layer loop pass `mirror={layer.mirror ?? false}` to the nested `FrameView`.

- [ ] **Step 3: Run** `npm test` and `npm run check` — Expected: pass, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/app/session.svelte.ts src/lib/components/FrameView.svelte
git commit -m "Let the session add, edit, link, and prune shared sources without touching Program." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Dialogs and Production Desk wiring

**Files:**
- Create: `src/lib/components/sources/DeskDialog.svelte`, `AddSourceDialog.svelte`, `SourceProperties.svelte`
- Modify: `src/lib/components/obs/ObsDesk.svelte`

**Interfaces:**
- Consumes: Task 1 (`SOURCE_KINDS`, `SourceKind`, `SourceFields`, `buildSource`, `fieldsFromSource`, `defaultFields`, `nextSourceName`, `sourcesOfType`, `isSourceKind`, `sourceKindLabel`), Task 3 session methods, `openCamera`/`stopCameraStream` from `domain/camera`, `mediaUrl` from `db/api`, `LOWER_THIRD_TEMPLATES`.

- [ ] **Step 1: `DeskDialog.svelte`** — props `{ title: string; onclose: () => void; children: Snippet; footer?: Snippet }`. Markup: fixed full-screen layer (z-index 30), backdrop `<button aria-label="Close">` calling `onclose`, panel `role="dialog" aria-modal="true" aria-labelledby` with `<h2>` title, body slot, footer slot. `svelte:window onkeydown` closes on Escape. Panel width `min(520px, calc(100% - 28px))`, max-height `calc(100% - 28px)`, body `overflow:auto`. Colors use existing tokens (`--panel`, `--line`, `--ink`, `--muted`, `--radius-panel`).

- [ ] **Step 2: `AddSourceDialog.svelte`** — props `{ type: SourceKind; sources: SharedSource[]; oncreate: (name: string) => void; onpick: (id: string) => void; onclose: () => void }`. State `mode: "new" | "existing"` (default `"new"`), `name = nextSourceName(sources, type)`. Title `Add ${sourceKindLabel(type)}`. Two radio options "Create new" (name input, autofocus) and "Add existing" (list of `sourcesOfType` as selectable buttons; disabled option with note "No saved sources of this type" when empty). Footer: Cancel, OK (`oncreate(name)` or `onpick(selectedId)`; OK disabled when existing mode and nothing selected). Enter in name input submits.

- [ ] **Step 3: `SourceProperties.svelte`** — props `{ name: string; fields: SourceFields; readonly: boolean; notice: string | null; onsave: (name: string, fields: SourceFields) => void; onclose: () => void }`. Local `$state` copies of `name` and `fields`. Title `Properties for "${name}"`. Name input always first. Per `fields.type`:
  - camera: `<select>` of `session.cameras` (value `deviceId`; on change also set `label`), Refresh button → `session.loadCameras()`, Mirror checkbox, `<video autoplay muted playsinline>` thumbnail (16:9, mirrored with `scaleX(-1)` when mirror). `$effect` keyed on `deviceId`: `openCamera(navigator.mediaDevices, deviceId)` → set `video.srcObject`; cleanup `stopCameraStream`. Errors show the thrown message in a muted line. No camera → "No camera found. Connect one, then Refresh."
  - scripture: reference input + "Look up" button → `await session.scriptureFields(reference)`; on null show "Reference not found."; body shown read-only as preview text.
  - song: `<select>` songs (`session.songs`), then `<select>` sections of chosen song; selecting sets `songId`, `sectionId`, `label = `${song.title} — ${section.label}``, `body = section.lines.join("\n")`.
  - text: heading input, body textarea.
  - timer: mode select (Countdown/Count up/Clock/Target time), minutes number input (countdown/countup → `durationMs = minutes*60000`), `datetime-local` for target (`targetAt = Date.parse(value)`), label input.
  - lower-third: template select from `LOWER_THIRD_TEMPLATES`, title, subtitle.
  - image: list of `session.media` buttons; choose sets `assetId`, `name`, `imageUrl = mediaUrl(asset) ?? ""`; empty library note "Import images in Settings → Media."
  - All inputs `disabled={readonly}`; `notice` rendered above the form when set. Footer note: "Changes show on Preview. Program updates on TAKE." Buttons Cancel / OK (`onsave(name, fields)`; hidden when readonly, Cancel reads "Close").

- [ ] **Step 4: ObsDesk wiring.**
  - Imports: remove `assignLayerSource, assignScripture, assignText, addLayer, sourceRef, type SourceType` if unused; add dialogs and Task 1 helpers.
  - State: `let typeMenu = $state(false); let adding = $state<SourceKind | null>(null); let editing = $state<{ layerId: string | null; sourceKey: string | null; name: string; fields: SourceFields; readonly: boolean; notice: string | null } | null>(null);`
  - `ensureScene()` returns `activeScene` or `session.createSceneLook(...)`.
  - `pickType(type)` → `typeMenu = false; adding = type; void session.loadCameras()` when camera.
  - `createNamed(name)` → `editing = { layerId: null, sourceKey: null, name, fields: defaultFields(adding!, { cameras: session.cameras }), readonly: false, notice: null }; adding = null;`
  - `pickExisting(id)` → `const scene = ensureScene(); selectedLayerId = session.addExistingSourceToScene(scene, id) ?? selectedLayerId; adding = null;`
  - `openProperties(layer)` → `const fields = fieldsFromSource(layer.source); if (!fields) return;` blocked = `layer.sourceKey ? session.lockedScenesUsing(layer.sourceKey) : []`; `readonly = sceneLocked || blocked.length > 0`; `notice = sceneLocked ? "This scene is locked." : blocked.length ? `Used in locked scene "${blocked[0]}" — unlock to edit.` : null`.
  - `saveProperties(name, fields)`: `const source = buildSource(fields);` if `editing.layerId === null` → `selectedLayerId = session.createSourceInScene(ensureScene(), name, source)`; else if `editing.sourceKey` → `session.saveSharedSource(editing.sourceKey, name, source)`; else → `session.linkLayerToNewSource(activeScene!, editing.layerId, name, source)`. Then `editing = null`.
  - Source row: `ondblclick={() => openProperties(layer)}` on the row button; add ⚙ button (`aria-label="Source properties"`) shown whenever `fieldsFromSource(layer.source)` is non-null (even when scene locked — read-only view). Row kind label shows `🔗` (text "shared") when `layer.sourceKey`.
  - Footer: replace the seven type buttons with `+` (`aria-label="Add source"`, disabled when `sceneLocked`) that toggles a small menu listing `SOURCE_KINDS`, and `−` (`aria-label="Remove source"`, disabled when no `selectedLayer` or `sceneLocked`) → `session.removeSceneLayer(activeScene, selectedLayer.id)`.
  - Quick scripture box: `addScriptureLayer` now: `const fields = await session.scriptureFields(query); if (!fields) { session.message = "Reference not found."; return; } selectedLayerId = session.createSourceInScene(ensureScene(), fields.reference, buildSource(fields)); query = "";` (remove the old John 3:16 fallback and `previewPassage` call).
  - Delete `addSource` and `scriptureFromQuery`.
  - Render `{#if adding}<AddSourceDialog …/>{/if}` and `{#if editing}<SourceProperties …/>{/if}` at the end of the root `.prod` element.

- [ ] **Step 5: Run** `npm test`, `npm run check` — Expected: pass, 0 errors/warnings.

- [ ] **Step 6: Browser verification** (dev server on 5199, Playwright with Chrome flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):
  1. Production Desk → Add scene → + → Camera → Create new "Pulpit Cam" → Properties shows device + thumbnail → OK → Sources lists "Pulpit Cam", Preview shows the layer, Program text unchanged.
  2. Add scene (Scene 2) → + → Camera → Add existing → Pulpit Cam → OK → layer present.
  3. Double-click Pulpit Cam → rename "Main Cam" → OK → both scenes list "Main Cam"; Program unchanged.
  4. Lock Scene 2 → select Scene 1 → ⚙ on Main Cam → notice "Used in locked scene" and inputs disabled.
  5. Quick box "Psalm 23:1" → Add → layer "Psalm 23:1" with verse text on Preview.
  6. Remove source on an unshared layer → gone; `workspace.sources` no longer lists it (check via `localStorage` workspace JSON or re-open Add existing).
  7. No console errors. Screenshot each dialog and look at it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/sources src/lib/components/obs/ObsDesk.svelte
git commit -m "Let operators add and edit Production Desk sources through Create and Properties dialogs." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Docs

**Files:** `docs/product-backlog.md` (CS-P1-016, CS-P1-018 status text), `docs/architecture/composition-engine.md` (shared sources section), `docs/architecture/media-sources.md` (camera Properties: device, mirror), spec status line → "Part A shipped".

- [ ] **Step 1:** Add to CS-P1-016 status: "Shared sources: `Workspace.sources`; layers link by `sourceKey`; editing a shared source updates every linked layer; refused while a linked scene is locked; unreferenced sources prune." Add to CS-P1-018: "Production Desk Add source → Create new / Add existing → Properties (camera device + mirror, scripture lookup, song section, text, timer, lower third, image). Double-click or ⚙ reopens Properties."
- [ ] **Step 2:** Add a "Shared sources" subsection to `composition-engine.md` describing link + sync copies and `syncLinkedEdits`.
- [ ] **Step 3: Commit** `git commit -m "Document shared sources and source dialogs." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
