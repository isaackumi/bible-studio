# Roadmap

The living capability list is [../product-backlog.md](../product-backlog.md). Architecture contracts are under [../architecture/](../architecture/).

The commercial sequence is core production, then professional church production, then intelligent assistance, then a connected platform. Each phase should leave a service runnable.

## Now — workspace and displays

In place:

- Tauri, Svelte, SQLite, KJV, services, lyrics, slides, images, themes.
- Preview and program, with Take, Cut, Clear, Black, and Logo.
- Audience window on an external display, including the macOS case where the window manager briefly hides that display.
- Saved workspaces: Bible Operator, Live Production, Simple Presenter, plus personal layouts.
- Drag, resize, hide, restore, float, and restore after restart.
- Display profiles and explicit audience assignment.
- Settings shell, appearance, command list, and `canUse()`.

Still thin on purpose: one image kind, no stage window, no video, no remap UI for shortcuts, no accounts.

## Phase 1 — finish core production

- Failure pass on a real Sunday file: missing image, bad reference, display unplugged, quit and reopen.
- Keyboard coverage for the volunteer path, with remap stored on the existing shortcut map.
- Stage remains off.
- Soak a long run of next and take. The audience window stays on the last good frame while the operator searches.

Exit: build a service and run it from the keyboard, with John 3:16 reaching the audience display only after Take, and the same workspace waiting after restart.

## Phase 2 — professional church production

Stage window from the saved stage role. Transitions beyond cut and fade. Video and audio. Recording. Richer media. Multiview. Output routing. NDI and streaming only after `canUse` is backed by a real entitlement check, and only if sending a window to an external switcher is no longer enough.

## Phase 3 — intelligent production

Speech recognition, scripture detection, and generated slides. Suggestions land in preview. They do not Take.

## Phase 4 — connected platform

Accounts, cloud sync, phone and browser remotes, teams, multi-campus, cloud media, licensing, and subscriptions. The desktop app remains the thing that runs the service when those services are down.

## Refused until the phase that needs them

A custom Metal renderer, a fork of FreeShow, a bundled commercial Bible, and an AI model download on first launch.
