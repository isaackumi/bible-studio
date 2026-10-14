# Product architecture

The shared core, browser adapters, and desktop adapters are described in [cross-platform architecture](cross-platform-architecture.md). This note covers the desktop path.

Church Studio’s operator UI is Svelte. Domain rules are TypeScript modules with no UI imports. On the desktop, SQLite holds the Bible, services, songs, themes, media records, and one workspace document. The audience window renders program frames. It does not search, edit, or own navigation.

## Boundaries

```text
Core desktop app
  Operator UI and workspace shell
  Presentation engine (preview / program)
  Theme renderer
  Local SQLite
  Media files on disk

Output manager
  Display discovery, assignment, audience window

Later, behind their own modules
  License and subscription
  Account
  Cloud sync and cloud media
  Remote control
  Stage, recording, streaming, NDI
```

The presentation engine does not import the workspace. The workspace does not write program. Output placement does not decide which frame is live.

```text
Content → Presentation model → Renderer → Output
```

Preview and Program are two slots in `src/lib/domain/live.ts`. `setPreview` replaces the preview slot. `applyProgramAction` is the only function that replaces the program slot, and it accepts only take, cut, clear, black, and logo. The audience window receives the program packet.

## What already existed

- Tauri operator window and a borderless audience window.
- Preview / program state machine and tests.
- KJV lookup, reference parsing, services, songs, slides, images, and themes.
- A SQLite `workspace` row for church name, theme, cursor, and shortcuts.
- Keyboard shortcuts mapped in one manager.

## What this foundation adds

- Workspace layouts stored inside the same workspace document (`schemaVersion: 2`).
- A layout presenter that adapts panels to the window width.
- Display profiles and explicit audience assignment. Automatic mode uses the first non-primary display. A missing assignment does not jump to another screen.
- A command list. Shortcuts call those commands.
- `canUse()` for capabilities that are not built yet.
- A settings shell with a section for each future preference area.

## Recovery

On launch the app restores the last workspace, layout, appearance, display profile, service, and preview cursor. It then publishes an empty program. A crash must not put the previous live frame back on the audience screen. The operator Takes again.

If the workspace JSON cannot be read, defaults are restored and the Bible database is left alone.

## Rendering and UI

`Screen` and `FrameView` paint a 1920×1080 frame scaled into preview, program, and the audience window. Theme data lives on the presentation model. Panel chrome does not choose fonts for the congregation.

## Extension points already reserved

- Panel ids and layout documents, so a new panel is a registry entry plus a body.
- Command ids, so MIDI, a Stream Deck, or a remote can call the same functions later.
- Output roles `operator | audience | stage`. Stage is stored and not opened.
- Item kinds on the service. Unknown future kinds should be preserved, not dropped, when that importer exists.
- `canUse(feature)` as the commercial gate.

## What not to couple

Do not write program from a Bible click, a workspace drag, a settings change, or a display reconnect. Do not put license checks inside `applyProgramAction`. Do not store a machine's monitor assignment inside a service file. The service must open on another computer.
