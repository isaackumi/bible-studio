# Production Desk: Shared Sources and Live Camera

Date: 2026-10-16  
Status: Part A shipped; Part B designed  
Related: [2026-10-16-production-scenes-as-looks-design.md](2026-10-16-production-scenes-as-looks-design.md), [composition-engine.md](../../architecture/composition-engine.md), [media-sources.md](../../architecture/media-sources.md), CS-P1-005, CS-P1-011..014, CS-P1-016, CS-P1-018, CS-P0-006

## Problem

1. Adding a source on Production Desk asks nothing. `addSource` in `ObsDesk.svelte` drops a layer with hardcoded defaults: camera = first device named "Camera", scripture = John 3:16, text = "Welcome", timer = 10 minutes. There is no name, no device choice, and no Properties dialog. Double-click does nothing. Operators expect the OBS flow.
2. Camera pixels appear only on operator Preview. Program monitor and the audience window paint the `presentCamera` card. Only one camera feed can be open at a time, so two-camera looks are half placeholder.

This spec has two parts. **Part A** (source dialogs + shared sources) ships first. **Part B** (live camera on Program and audience) ships second. Each gets its own implementation plan.

## Decisions

| Topic | Choice |
| --- | --- |
| Source identity | Shared, like OBS: one workspace list, scenes point at it |
| Storage | Link + sync copies: layer keeps its `SourceRef` copy plus a `sourceKey` |
| Old looks | No bulk migration; layers stay unlinked until Properties → OK |
| Source edits vs Program | Edits never touch Program; they reach the audience on the next TAKE |
| Source in a locked scene | Not editable until every linked scene is unlocked |
| Camera feeds | One feed per camera used by Preview or Program |
| Audience camera pixels | Audience window opens its own feed for the same `deviceId` |
| Audience warm-up | Operator publishes a standby list of Preview cameras; audience opens them unseen |

---

## Part A — Source dialogs and shared sources

### Data model

```ts
type SharedSource = {
  id: string;        // stable key, e.g. "src-<uuid>"
  name: string;      // operator name, e.g. "Pulpit Cam"
  source: SourceRef; // type + payload (camera deviceId, mirror, timer mode, ...)
};

type Workspace = {
  // ...existing fields
  sources: SharedSource[]; // NEW, default []
};

type CompositionLayer = {
  // ...existing fields
  sourceKey?: string; // NEW, id in workspace.sources; absent = unlinked copy
};
```

- `CompositionDocument` layers persist `sourceKey`. `sanitizeComposition` / `restoreComposition` keep a string `sourceKey` and drop anything else.
- Workspace document sanitize reads `sources` as an array of valid `SharedSource`; missing or invalid → `[]`. `schemaVersion` stays `2` (additive field).
- Camera payload adds `mirror: "true" | "false"` (default `"false"`). Fit stays per layer (`layer.fit`), so one camera can fill one scene and fit another.
- A linked layer's `name` follows its shared source's `name`.

### Domain functions (`src/lib/domain/sources.ts`, new)

Pure, unit-tested. Composition helpers stay in `composition.ts`.

- `createSharedSource(type, name, source): SharedSource`
- `linkLayer(composition, layerId, shared): Composition` — sets `sourceKey`, copies `shared.source`, sets layer `name`. No-op when the composition is locked.
- `updateSharedSource(sources, looks, id, next): { sources, looks } | { blocked: string[] }` — the only way to edit a shared source. Rewrites `source` and `name` on every layer with that `sourceKey` in every look. If any linked look is locked, returns `{ blocked: [lookNames] }` and changes nothing.
- `pruneSharedSources(sources, looks): SharedSource[]` — drops sources no layer references (OBS deletes a source removed from its last scene). Called after layer removal and look deletion.
- `nextSourceName(sources, type): string` — "Camera", "Camera 2", ...
- `sourcesOfType(sources, type): SharedSource[]`

### Session

- `session.workspace.sources` persists with the workspace.
- `session.addSourceToScene(sceneId, shared, isNew)` — writes the shared source (if new), links a new layer with default bounds for the type (lower third: `{ x: 6, y: 72, w: 55, h: 22 }`, others full frame), `saveLook`, then `previewLook`. Never Program.
- `session.saveSharedSource(id, next)` — calls `updateSharedSource`; on success persists sources and looks and refreshes Preview if `lookOnPreview` contains a linked layer; on `blocked` returns the locked look names for the dialog. Never Program.
- Layer removal and look deletion call `pruneSharedSources`.

### Production Desk UI

**Add flow** (Sources dock):

1. **+** opens a type menu: Camera, Scripture, Lyrics, Text, Timer, Lower third, Image. Disabled when the scene is locked or no scene is open.
2. **Create / Select** dialog:
   - *Create new* — name field prefilled with `nextSourceName`.
   - *Add existing* — list of `sourcesOfType`. Choosing one adds a linked layer immediately (no Properties step).
3. *Create new* → **Properties** dialog for the type. **OK** creates the shared source and adds the layer. **Cancel** adds nothing.

The seven per-type buttons and the hardcoded defaults in `addSource` are removed. The separate "Add scripture" quick box stays as a shortcut that runs the same create path with the typed reference.

**Properties dialog** — opened by double-clicking a source row or the row's ⚙ button.

| Type | Fields |
| --- | --- |
| Camera | Name; Device (dropdown from `session.cameras`, Refresh calls `loadCameras`); Mirror; live thumbnail of the chosen device |
| Scripture | Name; Reference (same parser as the quick box) |
| Lyrics | Name; Song + section picker from the song library |
| Text | Name; Heading; Body |
| Timer | Name; Mode (countdown / count-up / clock / target); Duration or target time; Label |
| Lower third | Name; Template (`LOWER_THIRD_TEMPLATES`); Title; Subtitle |
| Image | Name; Media library picker |

- OK on an unlinked layer creates a shared source from the edited values and links that layer only.
- Locked scene → dialog is read-only.
- Shared source used by a locked scene → fields disabled, message: *Used in locked scene "<name>" — unlock to edit.*
- Camera thumbnail uses the session's feed for that device (Part B feed map); before Part B ships it uses the existing single Preview feed path.
- Program is never written. Dialog footer note: *Changes show on Preview. Program updates on TAKE.*

Dialog components live in `src/lib/components/sources/` (`AddSourceDialog.svelte`, `SourceProperties.svelte`, one field component per type). Per-type field components are shared with the Presenter Looks editor where the fields already exist there.

### Presenter Looks editor

`CompositionPane.svelte` source edits on a linked layer go through `session.saveSharedSource`, so copies cannot drift. Unlinked layers keep today's behavior.

### Part A testing

- `updateSharedSource` rewrites every linked layer across looks; leaves unlinked layers and other sources untouched.
- `updateSharedSource` returns `blocked` with look names when any linked look is locked, and changes nothing.
- `pruneSharedSources` removes an unreferenced source and keeps referenced ones.
- `linkLayer` no-ops on a locked composition.
- Sanitize: missing `sources` → `[]`; invalid `sourceKey` dropped; round-trip keeps both.
- Browser: + → Camera → Create new "Pulpit Cam" → choose device → OK → layer on Preview, Program unchanged. Scene 2 → + → Camera → Add existing "Pulpit Cam". Rename to "Main Cam" in Properties → both scenes show "Main Cam"; Program unchanged. Lock Scene 1 → Properties on the shared source shows the locked message.

---

## Part B — Live camera on Program and audience

### Domain (`src/lib/domain/camera.ts`)

- `camerasIn(model, sourceId): string[]` — camera source ids used by a frame: its own `sourceId` if a camera, plus every layer `sourceId` that is a camera. Deduplicated.
- `camerasNeeded(live): string[]` — union of Preview and Program `camerasIn`.
- `planFeeds(open: string[], needed: string[]): { open: string[]; close: string[] }`.
- `cameraFeedForLayer(sourceId, feeds)` — returns `feeds[sourceId] ?? null` for camera sources. The `"preview"`-only rule is removed; a surface shows pixels when it is given a feed map.
- `CameraSurface` and `previewShowsCamera` are replaced by `camerasIn(...).length > 0`.

### Operator session

- `cameraStream` / `cameraFeedId` become `cameraFeeds = $state.raw<Record<string, MediaStream>>({})`.
- After every Preview or Program change, `syncCameraFeeds()` runs `planFeeds`, opens missing feeds with `openCamera`, and stops unused ones with `stopCameraStream`.
- An open failure for a Preview camera sets the existing desk message (denied / unavailable). Program never opens a camera: TAKE copies a Preview frame whose feeds are already open.
- Mirror from the camera payload is applied as a CSS `scaleX(-1)` on the `<video>`; it does not change the stream.
- Preview and Program monitors on both desks pass `cameraFeeds` to `Screen` → `FrameView`.

### Audience window

- `AudienceOutput.svelte` keeps its own feed map. On each accepted packet it computes `camerasIn(frame.model, frame.sourceId)` and opens missing feeds with `openCamera(navigator.mediaDevices, deviceId)`.
- A camera region paints the `presentCamera` card until its `<video>` fires `playing`, and stays on the card if the open fails. A camera failure never blocks or delays the rest of the frame.
- **Standby:** the operator publishes `camerasIn(preview)` on each Preview change:
  - Browser: `localStorage` key `church-studio.camera-standby` (JSON string array), read with a `storage` listener next to the Program packet channel in `display/channel.ts`.
  - Desktop: frontend `emit("camera-standby", ids)` from `@tauri-apps/api/event`; audience listens.
- The audience opens standby cameras but never renders them. Feeds close when neither Program nor standby uses them.
- `ProgramPacket` shape, revision, and acceptance rules are unchanged.

### Unchanged

- Program changes only through TAKE / CUT / AUTO / CLEAR / BLACK / LOGO.
- Listen stays audio-only and never Takes.
- No NDI, screen capture, or video files.

### Part B testing

- Unit: `camerasIn` (single camera frame, composition with two camera layers, no cameras); `camerasNeeded`; `planFeeds` (open, close, unchanged); `cameraFeedForLayer` with and without a feed.
- Browser, Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`:
  1. Camera on Preview → Program monitor still shows the card / previous frame.
  2. TAKE → Program monitor has a `<video>` with `readyState >= 2`; audience popup has a playing `<video>`.
  3. Put a second camera on Preview → Program's `<video>` keeps playing.
  4. CLEAR → audience and operator close feeds not used by Preview.
- Desktop: one manual run with a real camera to confirm the audience webview permission prompt and playback. CS-P1-005 stays "not claimed until a real camera is tested" until that run.

### Risks

- Desktop audience webview may prompt for camera permission separately on first use.
- Two captures of the same device (operator + audience) is supported by macOS and Windows webcam stacks; a few capture-card drivers allow only one client. Then the audience shows the card and the operator monitors still work.

## Acceptance

1. Operator adds "Pulpit Cam" through Create → Properties with a chosen device; it appears in two scenes as one shared source; renaming it updates both.
2. No source dialog action changes Program.
3. A shared source used in a locked scene cannot be edited.
4. After TAKE, Program monitor and audience window show live camera pixels; switching Preview to another camera does not disturb Program.
5. Camera failure in the audience window shows the camera card, not a black or frozen frame.

## Docs to update after ship

`composition-engine.md`, `media-sources.md`, `product-backlog.md` (CS-P1-005, CS-P1-011..014, CS-P1-016, CS-P1-018, CS-P0-006), and the Settings → Media note in `SettingsDialog.svelte` that says the audience shows the camera card.
