# Production Desk: Scenes as Looks

Date: 2026-10-16  
Status: Shipped  
Related: [composition-engine.md](../../architecture/composition-engine.md), CS-P1-016 / CS-P1-018

## Problem

On Production Desk today, “Scenes” are service sections and “Sources” are flat rundown items. Operators expect OBS-like scenes: a **named folder** you can **lock**, with a **Photoshop-style layer stack** of sources. Layered looks already exist as `Composition` on `Workspace.compositions`, but they live mainly in the Looks editor, not in the Scenes/Sources docks.

## Decisions

| Topic | Choice |
| --- | --- |
| Scene identity | Scene = Look (`Composition`) |
| Click scene | Preview only (`previewLook`); Program unchanged until TAKE/CUT |
| Scene lock | Full freeze until unlock |
| v1 source kinds | Existing Looks kinds only |
| Dock wiring | Replace section-based Scenes/Sources with compositions + layers (Approach A) |
| Rundown | Service sections stay Queue/playlist, not Scenes |

## Goals

- Production Desk Scenes dock lists saved looks by name.
- Selected scene loads onto Preview only; TAKE/CUT remain the only Program path.
- Sources dock shows that scene’s layers (top of list = front / highest z-index).
- Scene can be created, renamed, deleted, locked.
- Locked scene: no structural or content edits; TAKE/CUT still work.
- Presenter Looks pane remains the richer editor for the same model (no second composition type).

## Non-goals (v1)

- Browser source capture
- Nested scenes (“other scene” as a layer)
- NDI / video file sources
- Dual camera capture
- Leave/exit animations on hide
- Collapsing or removing the Presenter Looks pane
- Instant-LIVE on scene select (studio mode off)

## Data model

Extend `Composition` (and `CompositionDocument` / sanitize / restore):

```ts
type Composition = {
  id: string;
  name: string;
  locked: boolean; // NEW — default false
  canvas: { width: number; height: number };
  layers: CompositionLayer[];
  transition: { type: "cut" | "fade"; ms: number };
};
```

Domain helpers:

- `setCompositionLocked(composition, locked): Composition`
- All mutating helpers (`renameComposition`, `addLayer`, `removeLayer`, `reorderLayers`, `resizeLayer`, `assignLayerSource`, `setLayerAnimation`, `setCompositionTransition`, etc.) **no-op** when `composition.locked` is true (return the same composition).
- `removeLook` does not filter out a locked look by id unless callers unlock first; `deleteLook` no-ops when the target is locked. UI disables Remove while locked.
- Layer `locked` remains geometry-only and is irrelevant for edits when the **scene** is locked (scene lock wins).

Persistence: `sanitizeComposition` / `restoreComposition` read/write `locked`. Missing field → `false`.

## Session / live

- Selecting a scene calls `previewLook(composition)` — Preview only.
- `lookOnPreview` tracks the open scene for TAKE transition resolution (existing `looksForTake` / `takeTransitionForPreview`).
- Edits go through existing `session.previewLook` / `saveLook` paths; never `applyProgramAction` except TAKE/CUT/CLEAR/BLACK/LOGO.
- Delete uses `removeLook`; clears `lookOnPreview` if ids match; does not change Program. Preview pixels may remain until the next Preview action (same as current delete-look behavior).

## Production Desk UI

### Scenes dock

- List: `workspace.compositions` (restored via `restoreComposition`), display `name`.
- Selected: id matches `lookOnPreview?.id` (or draft id while editing).
- Actions: New scene creates an unlocked empty `Composition` (one empty full-frame layer), `saveLook` + `previewLook` immediately; Remove (disabled if locked or none selected); rename (inline); Lock / Unlock.
- Click → Preview that look.
- Mutations from Sources/properties call `saveLook` after `previewLook` so the Scenes list stays the source of truth (no separate unsaved draft on Production Desk).
- Empty state: prompt to create a scene.

### Sources dock

- Shows `layerOrder(selectedScene)` — highest z-index at the **top** of the list (Photoshop convention).
- Row: name, source type, hidden badge, layer-lock badge.
- Select row → selected layer for properties / Preview handles (when scene unlocked).
- Reorder Up/Down (or drag later); Hide/Show; layer Lock/Unlock (geometry) when scene unlocked.
- Add source: menu of v1 kinds → `addLayer` + `assignLayerSource` / `assignScripture` / etc., then Preview.
- When scene locked: list visible, controls disabled.

### Properties

- Minimal inline fields for the selected layer (reuse Looks patterns: scripture/lyrics/text/image/camera/timer/lower-third).
- Full Looks editor remains available via the existing layout / Looks tool for advanced work.

### Unchanged chrome

- TAKE / CUT / AUTO / CLEAR / BLACK / LOGO
- Scene Transitions controls (theme / look transition) — look transition still applies on TAKE when Preview is a look
- Queue/rundown for service items (including queued composition items)

## Mapping from today’s docks

| Today | v1 |
| --- | --- |
| Scenes = service sections | Scenes = `workspace.compositions` |
| Sources = section items | Sources = composition layers |
| Add scripture to section | Add scripture **layer** to selected scene |
| Looks pane | Same `Composition` model; richer editor |

## Testing

- Domain: `setCompositionLocked`; locked composition rejects rename/add/remove/resize/assign/transition; unlock restores mutation.
- Preview/Program: select scene → Preview changes, Program unchanged; edit layer → Preview only; TAKE copies look; locked scene blocks edits but TAKE still works.
- Delete locked scene refused; delete unlocked does not Take.
- UI smoke: Scenes list shows looks; Sources list order matches z-index (front on top); Lock disables Source controls.

## Acceptance

1. Operator can create a named scene, add scripture + camera layers, reorder them like Photoshop, Preview, then TAKE.
2. Locking the scene blocks all edits until unlock; Program is unaffected by lock toggle.
3. Clicking another scene stages Preview only.
4. Queue/rundown still queues looks without auto-LIVE.
5. No browser/nested-scene/NDI claims in v1.

## Implementation notes

- Prefer extracting shared layer-list / add-source UI from `CompositionPane.svelte` for ObsDesk Sources dock rather than duplicating domain calls incorrectly.
- Do not revive WorkspaceHost.
- Do not put compile/Take logic in PewDesk/ObsDesk beyond calling session methods.
- Docs to update after ship: `composition-engine.md`, `product-backlog.md` (CS-P1-016 / CS-P1-018 / Production Desk).
