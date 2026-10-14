# Cross-platform architecture

Church Studio is one application with two shells. The operator, domain rules, and presentation model are shared. Desktop and browser differ in storage, windows, and media. This document records the repository as it is, and the boundaries that later cloud work must respect.

## Current architecture

The frontend is Svelte 5 and SvelteKit, built with Vite. `svelte.config.js` uses `@sveltejs/adapter-static` with `fallback: index.html`, so the same SPA loads in a browser and inside Tauri. There is one route, `src/routes/+page.svelte`. It shows the operator, or the audience surface when the query is `?display=1` or the Tauri window label is `audience`.

Tauri 2 is initialized under `src-tauri`. Desktop commands live in Rust and use SQLite (`src-tauri/migrations/001_init.sql`) for the workspace document, Bible, services, songs, themes, and media records. Display assignment and the native audience window live in `src-tauri/src/displays.rs`.

The operator shell is `OperatorShell.svelte`. It mounts `PewDesk` or `ObsDesk` from `workspace.appearance.desk`. A dock engine (`WorkspaceHost`, `src/lib/workspace/layout.ts`) still exists and is tested. It is not the screen the operator sees.

Preview and Program are `src/lib/domain/live.ts`. `setPreview` never writes Program. `applyProgramAction` is the only path for take, cut, clear, black, and logo. Launch creates an empty Program and publishes it before restoring the preview cursor, so a saved frame is not put back on the output.

Rendering is `src/lib/domain/present.ts` into a `PresentationModel`, drawn by `Screen` at a 1920×1080 frame scaled to the output. The operator chrome does not set the output size.

`src/lib/platform/capabilities.ts` is a feature list (`canUse`). It is not a platform adapter and it is not a license check. Stage, NDI, cloud sync, remote control, AI, streaming, and recording are off. Account and License settings explain that no account is required. There is no login screen and no billing client.

## Proposed architecture

```text
Application UI
  Pew desk, OBS desk, settings, audience surface
      |
      v
Platform-independent core
  Bible, lyrics, slides, services, themes
  Workspace document, commands, preview/program
      |
      v
Platform capability interfaces
  src/lib/platform/runtime.ts
  src/lib/db/api.ts
      |
      +---- Desktop: Tauri invoke, SQLite, native windows
      +---- Browser: local library, BroadcastChannel, window.open
```

Domain modules do not import Tauri or `localStorage`. UI calls `session`, and `session` calls `api`. `api` chooses the adapter with `isDesktop()`.

## Shared versus platform-specific

Shared:

- Bible reference parsing, KJV text, passage search.
- Songs, slides, services, and ordering.
- Themes and the presentation model.
- Workspace document, schema version 2, appearance, and desk choice.
- Preview and Program rules, and the command registry.
- Audience frame format (`ProgramPacket`).

Desktop only:

- SQLite and schema migrations in Rust.
- Display enumeration, assignment, and the borderless audience window.
- Filesystem media import (`convertFileSrc`).

Browser only:

- IndexedDB database `church-studio`, schema version 1, with object stores for songs, services, themes, and a small meta store. Legacy lists are removed only after the copied ids are read back. Unreadable legacy keys stay in place. See [storage and platform audit](storage-and-platform-audit.md).
- `localStorage` for the workspace document (`church-studio.workspace`) and the last audience packet (`church-studio.program`).
- If IndexedDB cannot be opened, songs, services, and themes stay in memory for that session.
- `BroadcastChannel` plus `church-studio.program` for the audience tab.
- `window.open("/?display=1")` for the audience window. A blocked popup is reported. It is not treated as success.

`platformCapabilities()` reports this honestly. The browser does not claim native windows, multiple physical displays, or native media devices. Both platforms report offline storage, because each has a local store. They are not the same engine.

## Storage strategy

Desktop structured data stays in SQLite. The browser does not load native SQLite. Browser songs, services, and themes are IndexedDB records. A failed record write leaves the previous record in place. An unreadable legacy list is left in `localStorage`. The workspace loader restores defaults when its document cannot be read.

Import and export use one snapshot, schema version 1, containing songs, services, and themes. A file written before themes were included still imports; missing themes are left untouched. `parseLibrarySnapshot` rejects the file before any record is written. A valid import replaces a record only when the id matches and leaves every other id alone. Program, the workspace layout, and media files are not in the snapshot. Settings → Files runs the same export on both platforms through `api`.

Identifiers are strings already (`id` on songs and services, `updatedAt` on services). That is enough for a future sync record. Ordinary presentation does not call a network.

Future conflict strategy, not implemented:

- A cloud record belongs to an account or organization id stored with the record.
- Sync is a separate service. The live path never waits on it.
- Offline edits stay local until an explicit merge.
- If `updatedAt` differs and the payloads differ, keep both copies and ask. Do not last-write-wins.
- Restoring a saved Program packet never means publishing it. Launch still publishes an empty Program, then restores preview only.

Browser songs, services, and themes use IndexedDB schema version 1. `upgradeBrowserDatabase` creates those stores when `oldVersion` is below 1. Later versions add stores in that same function. The workspace document and the audience packet stay in `localStorage` because they are single documents, not record collections. Media files are not in the browser database yet.

## Rendering strategy

```text
Domain content
  -> PresentationModel
  -> Screen (16:9 frame)
  -> Output manager
       Preview pane
       Program pane
       Audience surface
```

Preview and Program panes are regions inside the operator. Audience is another surface: a Tauri webview on desktop, a browser window on the web. Stage, recording, and streaming are named in the feature list and are not wired.

## Workspace architecture

The saved workspace (schema 2) holds layouts, panel identity, dock region, size, visibility, collapsed state, order, active tab, and appearance including `desk`. PewBeam and OBS are two operator desks selected from Look. They share session state. They do not each own a copy of Program.

The older dock host can drag, resize, hide, and restore panels. It is covered by unit tests and is not mounted. Responsive behavior for the visible desks is their own grids, not a single shrinking row of every panel.

## Display limitations

Desktop can list displays, assign an audience display, open a borderless window, and avoid treating a missing assigned display as “use another screen.” Physical placement on a second monitor has not been exercised in this environment.

The browser cannot detect or assign physical monitors, and it cannot force fullscreen on a chosen display. Audience output is an explicit window. If the browser blocks the popup, the operator says so. Closing that window stops updates to it; the next Open output action creates it again. The operator publishes the current Program packet when the window opens. Refresh of the operator publishes an empty Program first, then restores preview. The audience does not receive preview.

## Cloud boundaries

No credentials, service-role keys, or billing client are in the bundle. `canUse()` is a local set of core features so unfinished modules stay off. It must not be treated as a secure license.

When cloud features exist, organization membership has to be enforced on the server. The frontend may hide a control. It may not be the only check. Protected cloud actions (sync, shared media, remote control) require a trusted backend. The local presentation engine must keep working when that backend is unreachable. Desktop licensing, if it is added later, has to fail open for the offline operator.

## Migration plan

1. Done: one SPA, Tauri shell, shared domain, browser Bible fallback, browser audience channel.
2. Done: one `isDesktop()` check, capability object, library import/export, empty Program published on browser launch as well as desktop.
3. Done: browser songs, services, and themes in IndexedDB schema version 1, with a one-time copy from the earlier localStorage lists.
4. Next: store imported images in that same browser database. Later: mount or retire the unused dock host, add stage output, and add a sync service that uses the conflict rules above.
5. Not in this change: accounts, billing, AI, streaming, NDI.

## Risks and trade-offs

- `@tauri-apps/api` is imported by the shared frontend. Calls go through `api`, which does not invoke on the web for Bible, songs, services, themes, or program publish. Display and media methods still invoke and will throw if a browser caller hits them. Those callers are behind `isDesktop()`.
- Browser media import still needs a filesystem path on the desktop command. The web build does not import local media files yet.
- A blocked IndexedDB keeps the library in memory for the session. A failed record write leaves the previous record in place. The workspace document can still outgrow `localStorage`.
- The audience tab reads the last published packet when it opens. The operator clears that packet on its own launch, so a refreshed operator does not leave the previous service live. An audience tab opened with no operator running can still show the last packet until the operator starts.
- OBS and Pew desks are separate views of one session. Accent and light theme apply to shared chrome. The OBS selection color is the studio blue used by that desk, not the accent swatch.
