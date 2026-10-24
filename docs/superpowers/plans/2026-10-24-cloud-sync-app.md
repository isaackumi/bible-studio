# Cloud Sync (App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A church's computers on one licence keep one library: a change on one appears on the others, media included, within the plan's cloud space, with a Cloud space screen to see and clean up what is kept.

**Architecture:** A pure `records` module turns the library (songs, services, sermons, themes) and the desk's own work (decks, compositions, games, playlists, templates, macros, overlays, layouts, sources, a settings record) into keyed records, diffs them against the last synced manifest, and applies pulled changes back. `CloudSync` (a runes class) runs push-then-pull on start, every 3 minutes and 5 seconds after a save, through the server's `/v1/cloud/*` routes (server plan), and moves media through three Rust commands (hash, upload, download) so a video never passes through the webview. The manifest lives in the app data folder.

**Tech Stack:** Svelte 5 runes, Vitest; Tauri 2 commands in Rust with `ureq` 3 and `sha2`.

**Spec:** docs/superpowers/specs/2026-10-24-cloud-sync-design.md, section "3. Cloud sync" and "Decisions made while writing this up". Server side: docs/superpowers/plans/2026-10-24-cloud-sync-server.md.

## Global Constraints

- Desktop only; the browser build neither syncs nor shows Cloud space.
- Sync runs only when signed in, the plan is Premium or Church, and the server accepts the seat. A Free plan: nothing is sent; the Cloud space rows say what the plan gives.
- Never synced: screens, displayProfiles, secondOutput, audio (output), shortcuts, layouts, pew, production, stageLayout, remoteDevices, backup, entitlement, profile, cursor, voice (except `voice.words`), and every secret (`pco`, `ai`, `onlineBibles.key`, `voice.speechKeys`, `broadcast`, `switcher`). A test asserts no secret leaves.
- Records always sync; media only within the limit. Videos are skipped when the licence's `syncVideos` is off.
- Media keeps its id across computers (the move file does the same): a downloaded file is recorded with the id the sender had.
- Newest `at` wins; `at` is the time the change was first noticed on the computer that made it, never re-stamped on a later push attempt.
- No internals in copy: "cloud space", "your cloud copy", never R2, KV, object, SQLite.
- Every new UI string gets FR and ES lines; OperatorShell stays ≤ 600 KB gz (lazy-load the screen); commits carry no attribution lines.

## Review Focus

1. **The same song edited on two computers before either syncs.** Expect the later edit on screen everywhere and the earlier one in that song's history on the Cloud space screen, not lost. Task 1 test `a conflict keeps local work until the pull replaces it`, Task 3 test `pushes before it pulls`.
2. **A picture referenced by a pulled theme that is not on this computer yet.** Expect it downloaded in the background and the theme to show it; until then the theme shows without it, not an error. Task 3 test `downloads media the pulled records need`.
3. **Cloud space full.** Expect records to keep syncing, the new picture marked "Only on this computer", and the Cloud space screen to say the space is full. Task 3 test `keeps syncing records when media is refused`.
4. **A computer that loses its seat (moved away) mid-sync.** Expect sync to stop with a plain status, nothing deleted locally, nothing retried every 3 minutes. Task 3 test `stops on noSeat and readOnly answers`.
5. **A record deleted on one computer while another edited it offline.** Expect the newest action to win by time; the loser is in the bin or history. Task 1 test `a deletion older than a local edit loses`.

---

### Task 1: Records in and out of the library (pure)

**Files:**
- Create: `src/lib/sync/records.ts`
- Test: `src/lib/sync/records.test.ts`

**Interfaces:**
- Produces:
  - `export type SyncRecord = { col: string; id: string; doc: unknown }` with `col` one of the server's collections.
  - `export type Manifest = { seq: number; hashes: Record<string, { hash: string; at: number }> }` keyed `${col}/${id}`; `export const emptyManifest = (): Manifest => ({ seq: 0, hashes: {} })`.
  - `export function hashDoc(doc: unknown): string` (stable: keys sorted; FNV-1a 64-bit as hex, or whatever is already in the codebase for stable hashing if one exists).
  - `export type LibraryInput = { songs: Song[]; services: Service[]; sermons: Sermon[]; themes: Theme[]; workspace: Workspace }`.
  - `export function collectRecords(input: LibraryInput): SyncRecord[]` — songs/services/sermons/themes as their own cols; workspace lists as deck/composition/game/playlist/template/macro/overlay/layout/source; one `settings` record `{ id: "church", churchName, logoAssetId, logoText, logoPicture, songFolders, favorites, ccliLicense, voiceWords }`. Built-in (sample) themes and starter content are included like everything else.
  - `export function diffRecords(current: SyncRecord[], manifest: Manifest, now: number): { changes: Array<{ col: string; id: string; at: number; doc: unknown | null }>; manifest: Manifest }` — new/changed docs get `at: now` (a key already pending in `manifest.hashes` with a different hash than the server's keeps its earlier `at`: the manifest stores `pending?: { hash, at }` per key for changes not yet accepted); keys in the manifest but not in `current` become deletions.
  - `export type Apply = { song(doc: Song | null, id: string): Promise<void>; service(...); sermon(...); theme(...); workspace(patch: (workspace: Workspace) => Workspace): void }`.
  - `export function applyChanges(changes: Change[], apply: Apply, manifest: Manifest): Promise<Manifest>` — writes each pulled record through `apply` and records its hash in the manifest so it is not pushed back. A `settings` record merges fields with `applyExtras` rules (union lists, local logo kept when set? No: pulled settings win, the newest wins everywhere).
  - `export function mediaIdsIn(records: SyncRecord[]): Set<string>` — every `assetId`, `logoAssetId`, `imageUrl`/`videoUrl` media path id (reuse the regex in `src/lib/platform/relink.ts`).
  - `export function withoutSecrets(workspace: Workspace): Workspace` is not needed; `collectRecords` never reads the secret fields and a test proves it.

- [ ] **Step 1: Write failing tests**: `collects every synced collection and the settings record, never a secret` (seed `pco.secret = "S1"`, `ai.key = "S2"`, `onlineBibles.key = "S3"`, `voice.speechKeys.deepgram = "S4"`, `broadcast.key = "S5"`; `JSON.stringify(collectRecords(...))` contains none); `diff finds new, changed, unchanged and deleted`; `a pending change keeps its first time across pushes`; `apply writes pulled records and marks them synced`; `a conflict keeps local work until the pull replaces it` (local change pending; server pull brings a newer doc; after apply the manifest hash is the server's and the local pending is dropped); `a deletion older than a local edit loses` (manifest shows the local edit at T+5, the pull brings `doc: null` at T+1: apply must skip it, because the local edit is newer, and leave the pending push); `mediaIdsIn finds assetId, the logo and media paths`.
- [ ] **Step 2: Run** `npx vitest run src/lib/sync/records.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** records.ts.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Cloud sync: the library as records, diffed against the last sync and applied back"`

### Task 2: The Rust side: hash, upload, download, the manifest file

**Files:**
- Create: `src-tauri/src/cloud.rs`
- Modify: `src-tauri/src/lib.rs` (register four commands), `src-tauri/src/db.rs` (reuse `record_media_at`)
- Test: `#[cfg(test)]` in cloud.rs

**Interfaces:**
- Produces, all `#[tauri::command(async)]`:
  - `cloud_hash(db, id: String) -> Result<{ hash: String, bytes: u64, name, kind, ext }, String>` — SHA-256 of the media file by streaming (1 MiB chunks; `storage.rs` already has a streaming hasher to reuse).
  - `cloud_upload(db, id: String, url: String) -> Result<(), String>` — `PUT` the file with `ureq` from a `File` reader (`content-type` from the extension), 20-minute body timeout; errors in plain words ("The upload could not finish. Check the internet connection.").
  - `cloud_download(app, db, url: String, id: String, name: String, kind: String, ext: String, created_at: String) -> Result<Value, String>` — streams to `media/<id>.<ext>.part`, renames with `rename_patiently`, records with `record_media_at`; refuses an `ext` that `media_kind` does not accept and an id that is not a UUID.
  - `cloud_state_read(app) -> Result<String, String>` / `cloud_state_write(app, text: String)` — `cloud-sync.json` in the app data folder, written through a `.part` and `rename_patiently`.
- [ ] **Step 1: Write failing tests**: `hashes a file by streaming and names its kind`; `state round-trips and survives a missing file` (read of a missing file gives `""`).
- [ ] **Step 2: Run** `cd src-tauri && cargo test cloud`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test cloud`, `cargo clippy --all-targets -- -D warnings`, `npm run check:windows`. Expected: PASS, no warnings.
- [ ] **Step 5: Commit** `git commit -m "Cloud sync: media hashed, sent and fetched by the app itself, and the sync record on disk"`

### Task 3: CloudSync: when and how it runs

**Files:**
- Create: `src/lib/app/cloud.svelte.ts`, `src/lib/sync/protocol.ts` (the typed calls to `/v1/cloud/*` over `serverCall`)
- Modify: `src/lib/app/session.svelte.ts` (start it after `checkActivation` in boot; `scheduleSoon()` after `writeNow`, `saveSong`, `sermonSave`, `saveTheme`, deletes; expose `session.cloud`)
- Test: `src/lib/app/cloud.test.ts` (the class with a fake protocol and fake apply/commands)

**Interfaces:**
- Produces `export class CloudSync` with:
  - state: `status: "off" | "free" | "signedOut" | "idle" | "syncing" | "noSeat" | "readOnly" | "offline" | "error"`, `message: string`, `lastSyncAt: number | null`, `usedBytes`, `limitBytes`, `over`, `paused`, `full`, `syncVideos`, `devices: Array<{ device; name; lastSyncAt }>`, `pendingMedia: number`, `onlyHere: Set<string>` (media ids refused for space).
  - `start()`: decides `off`/`free`/`signedOut`, else runs `syncNow()` and every 3 minutes while the app is open.
  - `scheduleSoon()`: a 5-second debounce into `syncNow()`.
  - `syncNow()`: (1) collect + diff → push (≤ 500 changes per call, more calls as needed) → on `conflicts` nothing special (the server filed them); (2) pull since `manifest.seq` in pages → apply → save manifest; (3) media: for each id in `mediaIdsIn(current records)` not in `manifest.media` → `cloud_hash` → claim → upload when told → mark; for each id referenced by pulled records and absent locally → look up by `media/list` → `cloud_download`; skip `kind === "video"` when `syncVideos` is off. Refusals: `noSeat`/`readOnly`/`signedOut` stop the timer and set the status; `full`/`paused`/`tooLarge` set `onlyHere` for that id and carry on.
  - `refreshStatus()`, `setSyncVideos(on)`, `media()`, `removeMedia(hash, everywhere)`, `history(col, id)`, `bin()`, `restore(col, id)`, `emptyBin()` for the screen.
  - The constructor takes `{ protocol, commands, library, apply, now }` so the test can fake every side.
- [ ] **Step 1: Write failing tests** with fakes: `pushes before it pulls`; `downloads media the pulled records need`; `keeps syncing records when media is refused`; `stops on noSeat and readOnly answers` (and does not call again on the next tick); `skips videos when the switch is off`; `does nothing on Free or signed out`.
- [ ] **Step 2: Run** `npx vitest run src/lib/app/cloud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** cloud.svelte.ts and protocol.ts; wire session.
- [ ] **Step 4: Run** the tests, `npm run check`, `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Cloud sync runs: push, pull and media, on start, after saves and every few minutes"`

### Task 4: The Cloud space screen

**Files:**
- Create: `src/lib/components/settings/CloudSpace.svelte` (lazy-loaded from the Account section)
- Modify: `src/lib/components/settings/SettingsDialog.svelte` (Account section: a "Cloud space" row group), `src/lib/i18n/fr.ts`, `src/lib/i18n/es.ts`, `src/lib/components/settings/sections.ts` (keywords for the account page: "cloud sync space backup computers")

**Copy and behaviour (fixed):**
- Headline bar: "{used} of {limit}" with a bar, split into Videos, Pictures, Audio, Songs & services (records counted as 0 bytes, shown as "a few MB").
- States under the bar: Free: "Cloud space comes with Premium and Church: your songs, services, slides and media on every computer on the licence, and a copy if a computer is lost." Signed out: "Sign in to use your cloud space." noSeat: the server's message. readOnly: "Your plan has ended. The cloud copy can be read until {date}; renew to keep it." over: "You are over your cloud space. Remove some files below, or ask about more space." paused: "Cloud space is paused for everyone at the moment. Songs and services still sync." Idle: "Last synced {when} · {n} computers".
- A switch **Sync videos** ("Videos are the biggest files. Off: they stay on each computer.").
- The list, largest first: name, kind, size, "used in {n} places" / "not used", last used; buttons **Remove from cloud** and **Delete everywhere** (second press to confirm).
- "Recently deleted" (the bin): items with **Put back**; **Empty now**.
- "Computers syncing": name and when each last synced.
- Everything through `session.cloud`.

- [ ] **Step 1:** Build the component and the Account rows; FR/ES lines.
- [ ] **Step 2: Run** `npm run check`, `npx vitest run src/lib/i18n`, `npm run budget`. Expected: PASS, OperatorShell ≤ 600 KB.
- [ ] **Step 3: Commit** `git commit -m "Cloud space: what is kept in the cloud, what uses it, and how to free it"`

### Task 5: A new computer picks up the cloud copy

**Files:**
- Modify: `src/lib/app/cloud.svelte.ts` (after the first successful pull on a computer whose library was empty: `session.notify("Your library is back from the cloud", …)`), `src/lib/components/onboarding/Welcome.svelte` (the first step's "Moving from another computer?" line gains a second sentence: "Or sign in on the last step and your cloud copy comes down by itself.")

- [ ] **Step 1:** Add the notice and the line; FR/ES.
- [ ] **Step 2: Run** `npm run check`, `npm test`. Expected: PASS.
- [ ] **Step 3: Commit** `git commit -m "A new computer signs in and its library comes back from the cloud"`
