# Storage and platform audit

This note records the storage and production paths as they are in the repository, the reliability fixes made after the inspection, and what was actually run. “Verified” means a test or a browser check in this pass. “Inspected” means the behavior is in the source and was not re-executed as a separate scenario.

## Where the code lives

| Concern | Location | How it was checked |
| --- | --- | --- |
| IndexedDB open, schema, legacy copy, import rollback | `src/lib/platform/browser-store.ts` | Unit tests, plus a browser read of the open database |
| Backup file shape | `src/lib/platform/library.ts` | Unit tests |
| Platform branch | `src/lib/db/api.ts` (`isDesktop()`) | Inspected. Desktop methods call Tauri. Browser methods call the library above |
| Desktop SQLite | `src-tauri/src/db.rs`, `src-tauri/src/lib.rs` | `cargo check` succeeded. The SQL was not rewritten |
| Workspace document | `session.svelte.ts` `loadWorkspace` / `saveWorkspaceDocument` | Inspected. Browser keeps `church-studio.workspace` in localStorage. Desktop calls `workspace_save` |
| Audience packet | `src/lib/display/channel.ts` | Unit tests for ordering. Browser reload showed an empty program frame |
| Preview and Program | `src/lib/domain/live.ts` | Existing unit tests still pass |
| OBS transition controls | `src/lib/components/obs/ObsDesk.svelte` | Browser reload showed Fade and 450 ms from the stored Signal theme |
| Feature flags | `src/lib/platform/capabilities.ts` | Unchanged. This is not a storage adapter and not a license check |

## Schema and migration

Database name `church-studio`, version 1. `upgradeBrowserDatabase` creates `songs`, `services`, `themes`, and `meta` only when `oldVersion` is below 1. Calling it again at version 1 does not create those stores a second time. There is no version 2. A future version has to add its stores in that same function.

The meta key `local-lists-v1` means:

- absent: the legacy copy has not finished
- `"1"`: an earlier build finished the copy. It is treated as done so those lists are not copied again
- `"complete"`: this build read the copied ids back and then removed only the lists that were fully valid

A failed write throws before the mark is stored and before any key is removed. The next open tries again. Records are stored by id, so the retry replaces the same id instead of inserting a second copy.

An unreadable list, or a list that mixes valid rows with invalid ones, is not deleted. Valid rows in a mixed list are copied. The completion mark stays absent, so a later open can try the leftover key again without duplicating the valid ids.

## Storage failures

A failed `put` leaves the previous row in place. That is covered for a single song save and for a legacy copy that throws on the first write.

Import validates the whole file in `parseLibrarySnapshot` before any write. On the browser, `importLibraryRecords` remembers the previous row for each id it writes. If a later write throws, it puts those previous rows back, or removes an id that did not exist before. A failed import of a changed song plus a new song left the original song in place in the unit test.

On the desktop, `importDesktopSnapshot` reads the current songs, services, and themes, writes the file, and on failure writes the previous songs back or deletes a song that was new. A previous service or theme is written back when one existed. There is no command to delete a service or a theme, so a brand-new service or theme created before the failure can remain. That limit is in the Rust command list, not in the browser database.

If IndexedDB cannot be opened, `browserLibrary` falls back to an in-memory library for that page. The unit tests cover the memory library. They do not disable the real `indexedDB` global in a browser.

## Workspace document and audience packet

Recommendation: leave both in localStorage. Do not move them into IndexedDB in this pass.

| | Workspace document | Audience packet |
| --- | --- | --- |
| Size | One JSON document: layouts, appearance, cursor, display profile ids | One program frame |
| Update rate | Debounced while the operator edits | Only when Program changes |
| Other windows | The operator is the writer. A second operator tab would overwrite the same key. That is acceptable for a single operator | `BroadcastChannel` updates an open audience window. localStorage is the copy a new audience tab reads |
| Recovery | A corrupt document restores defaults. The cursor is preview state, not Program | Launch publishes an empty Program before the preview cursor is restored |
| Atomicity | One `setItem`. A throw leaves the previous document | One `setItem` after the owner check. A rejected packet is not written |
| Desktop | The same document shape is one SQLite row, not localStorage | The desktop audience window receives a Tauri event, not this key |
| Later sync | The document needs an account id and a merge. It is not the live output | Program must not be replayed onto a screen just because it was stored |

IndexedDB is the right place for the growing library (songs, services, themes). The workspace and the live packet are single documents with different lifetimes. Putting the live packet in IndexedDB would not make two windows agree any faster than the channel already does, and it would make a crash more likely to look like a saved Program that should go live. The launch rule forbids that.

## Program state

`setPreview` does not change Program. Only `applyProgramAction` does, for take, cut, clear, black, and logo. Those tests still pass.

Program ownership is a record in `localStorage` (`church-studio.output-owner`): a random `sessionId` and an integer `generation`. The session id is kept in `sessionStorage` for that tab. It is not a timestamp.

- The first tab claims generation 1. A refresh of that tab keeps the id and remains the owner.
- The owner’s launch publishes an empty Program (revision 0) before restoring the preview cursor. That clear is accepted from the current owner only.
- A second tab does not publish. The desks and Settings → Output say “Another window has the audience” and offer **Take control**.
- Take control advances `generation` and does not copy Preview onto Program. The previous frame stays on the audience until the new owner uses Take, Cut, Clear, Black, or Logo.
- A packet is accepted only when its `sessionId` and `generation` match the owner. A lower revision from that owner is ignored. Revision 0 from that owner is the startup clear.
- If `localStorage` throws, this tab does not claim control and does not send.

This coordinates tabs in one browser profile. It does not lock another profile, another browser, or another computer. Two desktop processes are not coordinated: the desktop audience follows the in-memory Program of that process. The desktop UI says “This app sends to the audience.”

Inspected launch order in `session.init`: adopt the owner, create an empty live state, publish it only when this session owns the audience, then `selectItem` for the saved cursor. `selectItem` calls `setPreview` only. A non-owner’s Take does not change Program.

## Themes and the OBS desk

The OBS duration and fade/cut controls copy `session.theme().transition` once, after the session is ready. They do not start from the hardcoded `300` once that copy has run. A saved value is not written again unless `transitionChanged` says the control differs from the stored transition.

`sanitizeTransition` keeps `cut` or `fade`. Anything else becomes `fade`. A missing or non-numeric duration becomes 450 ms. Values are clamped to 0–2000 ms, which is the range on the duration field. A backup theme with a missing transition or an out-of-range duration is repaired by the parser. It is not rejected, and it does not wipe other themes.

Browser reload in this pass showed the Signal theme as fade, 450 ms, both in the OBS controls and in the `themes` store.

Switching themes in the settings UI was not clicked in this pass. `saveTheme` stores the sanitized theme and sets `workspace.themeId`. The next OBS load reads whichever theme that id selects.

## Desktop and browser boundary

```text
Shared models and rules
  live.ts, theme.ts, library snapshot, commands
        |
        v
api.ts
        |
        +---- browser: browserLibrary (IndexedDB, or memory if it cannot open)
        |
        +---- desktop: Tauri invoke to SQLite
```

The desktop app is not using IndexedDB. `cargo check` for `src-tauri` finished with no errors in this pass. `npm run tauri build` was not run.

`@tauri-apps/api` is imported by shared modules (`api.ts`, `session.svelte.ts`, `AudienceOutput.svelte`). Browser paths do not call `invoke` for Bible text, songs, services, themes, or program publish. Display assignment, media import, and `getProgram` still call `invoke` and are only used when `isDesktop()` is true. The package is still in the browser bundle. The window API is imported only on the audience Tauri label, from `src/routes/+page.svelte`.

## Backup and restore

Settings → Files exports schema version 1 with songs, services, and themes. Program, the workspace document, and media files are not in the file.

An older file with no `themes` array imports. Existing themes stay. Import replaces a record only when the id matches. Other ids stay. That is the behavior the settings text describes. It is not a wipe of the library.

Validation runs before writes. A browser import that fails on a later row restores the rows it had already replaced. A desktop import runs in one SQLite transaction, so a failure leaves the previous songs, services, and themes in place.

## Desktop import

`db::import_library` validates schema version 1, songs, services, and any themes before `BEGIN IMMEDIATE`. Songs and services are upserts by id. A missing `themes` array does not touch the themes table. Any failure rolls the transaction back. The operator sees “Nothing was changed.” The SQLite error is logged, not shown. Rust tests cover a failure after songs, after services, and after themes, plus an older file and a repeated import.

The browser import still validates first and restores rows it already wrote if a later write throws. Both sides replace matching ids and leave other records in place.

## Browser media

Browser images use the IndexedDB `media` store described in [browser media storage](browser-media-storage.md). Quota failure leaves the previous store. A missing image already becomes an empty frame.

## What was run

- `npm test`: 56 tests passed, 15 files.
- `npm run build`: completed and wrote `build/`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 8 tests passed, including a failed import at each write stage and an older file that keeps themes.
- `cargo check --manifest-path src-tauri/Cargo.toml`: finished with no errors.
- Browser at `http://127.0.0.1:1420/`: after reload, the operator said “This window sends to the audience.” The stored program layout was `empty`, revision 0, and its session id and generation matched `church-studio.output-owner`. A second tab said “Another window has the audience,” showed Take control, and left that owner and the empty program unchanged. The second tab was closed without taking control.

Not run: installer build, a second physical display, a forced IndexedDB failure in the live browser, or a desktop click-through of import. Packaged desktop validation was not performed.

## Remaining gaps

- Browser media files are not stored. Import still expects a desktop filesystem path. The design is linked above.
- The workspace document and the audience packet stay in localStorage, as recommended above. They are not in the backup file.
- Audience ownership is per browser profile, not across devices. A closed owner tab keeps the lock until another operator clicks Take control. There is no heartbeat.
- Stage, NDI, cloud sync, accounts, billing, AI, streaming, and recording are still off. Sync must not treat a stored Program packet as something to publish.
- The dock layout engine is implemented and tested, and it is not the mounted operator.
