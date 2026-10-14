# Roadmap

No application code until the decisions in `architecture.md` are approved.

## Phase 1 — MVP (P0)

Goal: run a Sunday scripture-and-lyrics service on this Mac, offline, with preview/program and an audience window on the Dell.

1. **Spike (short).** Tauri 2 window on the built-in display, second frameless window placed on the Dell, a hardcoded verse frame crossfading on take. Stop if the output window cannot stay on the external display or cannot keep a stable 16:9 frame. That spike decides Tauri vs the Electron fallback.
2. **Workspace and service files.** Create, save, reopen. Sections and items. No cloud.
3. **KJV SQLite and reference parser.** Tests for parsing and lookup before the UI.
4. **Theme renderer.** Verse, lyric, and title layouts. One built-in theme. Preview and the small program monitor share it.
5. **Playhead, take, cut, clear, black, logo.** State-machine tests. UI calls only those commands.
6. **Prepare and live layouts.** Rundown, one library band (Bible first, then lyrics and images), inspector for theme and text.
7. **Keyboard map** from `ux-principles.md`.
8. **Display assignment** stored in the machine profile, not in the service.
9. **Failure pass.** Missing image, unknown reference, display unplugged, quit and reopen.
10. **Soak.** Thirty minutes of next/take on a sample service. Program window stays responsive. Fix leaks before adding features.

Exit: the success list in `product-requirements.md`.

## Phase 2 — service production (P1)

- Stage window: current, next, section, timer, notes.
- Video items and mute.
- Translation importer (OSIS, Zefania, or USFM) and parallel view.
- Recents, favorites, scripture groups.
- Lower-third layout.
- Theme and service export/import.
- Service progress in live mode.

Exit: a real service file from this church can be built in the app and run with a stage view, still without an account or a network.

## Phase 3 — live production edges (P2 then P3)

P2 first:

- Section “looks” (full frame vs lower third) as the church version of scenes.
- Localhost control API.
- LAN remote: next, previous, clear, lookup, take.
- Per-output audio routing.

P3 only after those are unused for a few real services and still wanted:

- Optional suggestion plugin. Suggestions land in preview, never in program, and the app builds and runs with the plugin compiled out.
- NDI or Syphon sender toward the OBS already installed here. Obtain any SDK separately. Do not copy the one vendored in PewBeam.
- Recording and streaming only if sending a window to OBS is no longer enough.

Plugins, MIDI, OSC, and lighting wait on the item-kind interface. They are not scheduled as features.

## Suggested build order inside phase 1

| Step | Runnable result |
| --- | --- |
| Spike | Two windows, one fake take |
| Domain + tests | Service navigation and reference parser, no UI |
| KJV load | Lookup returns verses in a test |
| Renderer | A theme paints a fixture frame |
| Shell UI | Prepare layout edits a service |
| Buses | Take updates the audience window only |
| Live mode | Keys run a sample service |
| Profile | Dell is audience, built-in is operator |

Each step leaves the app launchable.

## What this roadmap refuses

- Starting with speech detection, AI notes, or a model download.
- Forking FreeShow.
- Implementing the full entity list from the brief (cameras, schedules, DMX) up front.
- Rewriting the renderer into a custom Metal engine before a webview frame has failed a real service.
