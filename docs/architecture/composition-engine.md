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

## Paint

`presentComposition` returns `layout: "composition"` with `layers[]` of already compiled `PresentationModel`s.

`FrameView.svelte` paints those layers by bounds. Operator Preview may attach a `MediaStream` to a matching `camera:{deviceId}` layer. Program and `AudienceOutput` never receive a stream; they paint the camera card.

Timer faces tick inside the frame from the snapshot (`timerFromPaint` + `timerDisplay`). Session and Program are not rewritten every second.

## Preview / Program

`previewComposition` → `setPreview`. Source id is `composition:{id}`.

LIVE copies the compiled model onto Program. Editing Preview after TAKE does not mutate Program.

Saved looks live on `Workspace.compositions`. Restore is Preview-available, not auto-LIVE.

A service item may reference `{ kind: "composition", composition: { compositionId } }`. `session.modelFor` compiles it to Preview. Existing bible/lyric/slide/image items are unchanged.

## Operator

Presenter Desk → **Looks**. Templates, layer list, source assignment, numeric bounds, save, queue. LIVE is still the desk LIVE button.

`lookCameraLowerThird` fills Camera + Lower Third. `lookCameraCountdown` fills Camera + Countdown (camera slot + corner timer). `lookScriptureCamera` fills Scripture + Camera (last Preview verse + first camera). `lookLyricsCamera` fills Lyrics + Camera (last Preview song section + first camera). `lookImageCamera` fills Image + Camera (last Preview image or library image + first camera). `lookTwoCameras` fills Two Cameras (first and second devices, or the same camera twice). `lookCameraPresentation` fills Camera + Presentation (first camera left, last Preview scripture/lyrics/image right). `lookFullCamera` fills Full Camera (first device, full frame). `lookFullScripture` fills Full Scripture (last Preview verse, or John 3:16). `lookFullLyrics` fills Full Lyrics (last Preview song section, or Holy, holy, holy). `lookCountdown` fills Countdown (full-frame timer from desk minutes, default 10:00, label “Service starts in”). Looks can switch that timer to count-up or clock on Preview only; target time is later. `lookAnnouncement` fills Announcement (full-frame title from last Preview/queued slide, or Welcome / Please join us after the service). `assignText` edits heading and body on Preview only. `lookTwoRegions` fills Two regions (last Preview title/scripture/lyrics/image left, first camera right). The slots stay generic; scripture is not hardcoded on the left. Clearing overlay/timer hides those layers on Preview only. LIVE copies the camera **card** plus overlays; the audience never receives a `MediaStream`. Timers tick in FrameView from the snapshot. One Preview `MediaStream` is shared: both regions get pixels only when they share that feed id. Dual capture is later.

Do not put compile/Take logic in `PewDesk.svelte`.

## Output

One `PresentationModel`. Browser and Tauri sinks consume `ProgramPacket`. See [output-engine.md](output-engine.md). A sink failure must not Take or roll back Program.

## Remote

Phone commands stay `CommandId`. A future “LIVE this look” is still `previewLook` then `take`, not a side channel onto Program.

## Intentionally later

Drag-resize editor, sanctuary/audience-window camera pixels, NDI in/out, plugin-hosted templates, multi-camera cuts, advanced motion graphics. Preview-only camera in a composition region is already wired; Program still paints the camera card.
