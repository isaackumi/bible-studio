# Composition engine

Church Studio compositions describe **what should be rendered**. They do not own Program, displays, or output windows.

```text
Source  →  Layer  →  Composition  →  PresentationModel
                                          ↓
                                      setPreview
                                          ↓
                                 LIVE / TAKE / CUT
                                          ↓
                                      Program
                                          ↓
                                    Output sinks
```

Selecting, assigning, or editing a composition writes Preview only. `applyProgramAction` is the only path onto Program.

## Why this exists

A verse, a lyric, a camera, a lower third, and a countdown are different sources. Live production still needs them in one look: camera plus lower third, scripture beside camera, a timer over a wash.

The engine is that look. It is not a second live state, and it is not a video editor.

## Domain

`src/lib/domain/composition.ts`

| Type | Role |
| --- | --- |
| `SourceRef` | Kind + payload. Compiles through `compileSource`. |
| `CompositionLayer` | Source, bounds (%), z-index, opacity, fit, visibility, animation. |
| `Composition` | Named canvas of layers. Persistable. Not Program. |
| `CompositionTemplate` | Slots / regions. No live sources. |
| `LowerThirdTemplate` | Reusable lower-third copy and motion. Theme still owns type. |

Layer order is `zIndex`. A lower third sits above a camera because its index is higher, not because a DOM tree in PewDesk stacked it.

Templates name regions (`Region A`, `Region B`, `Fill`, `Lower third`). They do not hardcode “scripture on the left”.

## Sources

`compileSource` is the presentation interface. UI must not branch `if scripture` / `if camera` to paint Program.

Built-in kinds: scripture, song, text, image, camera, video, timer, clock, countdown, lower-third, ndi, plugin, empty.

Camera, video, and NDI compile through the same camera card today (`presentCamera`). Capture stays in the media source API (`src/lib/domain/camera.ts`). NDI is not implemented here. See [media-sources.md](media-sources.md).

Plugins call `registerSourceCompiler`. They return `PresentationModel`. They cannot call `applyProgramAction`.

### Shared sources

Sources are shared across scenes, OBS-style. `Workspace.sources` holds `{ id, name, source }`. A layer links to one by `sourceKey` and still keeps its own `SourceRef` copy, so compile, templates, rundown, and the Looks editor read the layer unchanged. Rules live in `src/lib/domain/sources.ts`:

- `updateSharedSource` is the one way to edit a shared source. It rewrites name and source on every linked layer in every look. It refuses (returns the locked look names) if any linked look is locked.
- `syncLinkedEdits` runs inside `session.saveLook`. A linked layer whose copy was edited (for example in the Looks editor) becomes the new shared value everywhere; if a locked look blocks that, only that layer unlinks.
- `pruneSharedSources` drops a source once no layer references it (after layer removal or look deletion).
- Older looks are not migrated. Their layers stay unlinked until Properties → OK links them.

Edits never touch Program: Program is a compiled snapshot, so a source change reaches the audience on the next TAKE.

## Paint

`presentComposition` returns `layout: "composition"` with `layers[]` of already compiled `PresentationModel`s.

`FrameView.svelte` paints those layers by bounds. Each window passes its camera feed map; a `camera:{deviceId}` layer with an open feed plays live video over the camera card. Operator Preview and Program monitors use `session.cameraFeeds`; `AudienceOutput` opens its own. Packets stay data only.

Timer faces tick inside the frame from the snapshot (`timerFromPaint` + `timerDisplay`). Session and Program are not rewritten every second.

## Preview / Program

`previewComposition` → `setPreview`. Source id is `compositionSourceId(id)` — looks already use `composition:{…}` as their id, so Preview/Program store that id once (not `composition:composition:…`). Legacy double-prefixed source ids still resolve for TAKE.

LIVE copies the compiled model onto Program. Editing Preview after TAKE does not mutate Program.

Saved looks live on `Workspace.compositions`. Restore is Preview-available, not auto-LIVE.

A service item may reference `{ kind: "composition", composition: { compositionId } }`. Queue persists the look first, then adds that rundown item. `session.modelFor` compiles it to Preview. Existing bible/lyric/slide/image items are unchanged.

## Operator

Presenter Desk → **Looks**. Production Desk → **Scenes** dock lists saved looks; **Sources** dock is that look’s layer stack (front on top). Scene lock freezes all edits until unlock. Sources **+** → type → Create new (name) or Add existing → **Properties** (camera device + mirror + live thumbnail, scripture lookup, song + section, text, timer, lower third, image) → OK adds a linked layer on Preview. Double-click a source or ⚙ reopens Properties; a locked scene, or a shared source used by a locked scene, opens read-only. **−** removes the layer from the scene. The camera thumbnail is a private dialog stream and never touches Preview. Layout tool still opens the richer Looks editor. Templates, layer list, add/rename/remove/duplicate, source assignment (including library images for image layers), numeric bounds, opacity, fit, entrance/exit (+ shared duration and easing), look transition (cut/fade), lock, Preview drag handles, save, duplicate look, queue. When Preview is a look, TAKE uses that look’s cut/fade (and fade ms); other sources still use the desk theme transition. CUT always cuts. Dragging a layer writes Preview only. A locked layer does not drag or accept numeric bounds. Scripture and lyrics layers have editable copy fields and can refill from the current desk verse/section. Adding, removing, duplicating, or changing entrance/exit/easing writes Preview only. FrameView plays entrance on paint with the layer easing; exit is stored for later leave transitions.

Looks lower-third buttons harvest scripture, song, and announcement copy from the desk; speaker, guest, and event keep the typed title and subtitle. LIVE still copies Program.

Save look writes `Workspace.compositions`. Delete uses `removeLook` and clears the Preview draft identity if that look was open; Preview pixels and Program stay until the next Preview/LIVE. Queue persists that look first, then adds a composition rundown item. Selecting the queued item restores Preview only. LIVE still copies Program. A rundown item whose look was deleted paints empty.

`lookCameraLowerThird` fills Camera + Lower Third. `lookCameraCountdown` fills Camera + Countdown (camera slot + corner timer). `lookScriptureCamera` fills Scripture + Camera (last Preview verse + first camera). `lookLyricsCamera` fills Lyrics + Camera (last Preview song section + first camera). `lookImageCamera` fills Image + Camera (last Preview image or library image + first camera). `lookTwoCameras` fills Two Cameras (first and second devices, or the same camera twice). `lookCameraPresentation` fills Camera + Presentation (first camera left, last Preview scripture/lyrics/image right). `lookFullCamera` fills Full Camera (first device, full frame). `lookFullScripture` fills Full Scripture (last Preview verse, or John 3:16). `lookFullLyrics` fills Full Lyrics (last Preview song section, or Holy, holy, holy). `lookCountdown` fills Countdown (full-frame timer from desk minutes, default 10:00, label “Service starts in”). Looks can switch that timer to count-up, clock, or a wall-clock target time on Preview only. `lookAnnouncement` fills Announcement (full-frame title from last Preview/queued slide, or Welcome / Please join us after the service). `assignText` edits heading and body on Preview only. `lookTwoRegions` fills Two regions (last Preview title/scripture/lyrics/image left, first camera right). The slots stay generic; scripture is not hardcoded on the left. Clearing overlay/timer hides those layers on Preview only. LIVE copies the frame; Program monitors and the audience window play each camera from their own open feed. Timers tick in FrameView from the snapshot. Every camera a look uses gets its own feed, so two-camera looks show both.

Do not put compile/Take logic in `PewDesk.svelte`.

## Output

One `PresentationModel`. Browser and Tauri sinks consume `ProgramPacket`. See [output-engine.md](output-engine.md). A sink failure must not Take or roll back Program.

## Remote

Phone commands stay `CommandId`. A future “LIVE this look” is still `previewLook` then `take`, not a side channel onto Program.

## Intentionally later

NDI in/out, plugin-hosted templates, multi-camera cuts, advanced motion graphics. Live camera pixels on Preview, Program monitors, and the audience window are wired (browser verified with a fake device; desktop needs a real-camera run). Looks Preview can drag-resize layers; Program has no handles.
