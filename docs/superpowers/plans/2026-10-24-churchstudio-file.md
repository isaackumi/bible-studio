# The .churchstudio File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One file that carries a church's whole library, pictures, videos and audio included, from an old computer to a new one.

**Architecture:** The app (TypeScript) builds the library JSON as the folder backup does today, with more workspace fields and never a secret. Rust streams it and every media file into a zip, and reads one back: media rows keep their ids, so records still point at them. The app then merges the library and rewrites the stored media addresses for this computer's media folder.

**Tech Stack:** Tauri 2 (Rust, `zip` crate), Svelte 5, Vitest, cargo test.

**Spec:** docs/superpowers/specs/2026-10-24-cloud-sync-design.md (part 1, plus "Decisions made while writing this up").

## Global Constraints

- Desktop only. The browser build shows nothing new.
- Secrets never go into the file: `pco`, `ai`, `onlineBibles.key`, `voice.speechKeys`, `broadcast`, `switcher`.
- Per-computer settings stay out: screens, displayProfiles, secondOutput, audio (output), shortcuts, layouts, pew, production, stageLayout, remoteDevices, backup, entitlement, profile, cursor, voice (except `voice.words`).
- Restoring adds and never deletes. Same id: the file's copy wins (`mergeById`, as the folder backup does today).
- Every new UI string goes through `t()` and gets FR and ES entries (src/lib/i18n/fr.ts, es.ts). `core.test.ts` fails otherwise.
- Church-facing copy never names internals (zip, JSON, SQLite).
- Rust commands that touch the disk are `#[tauri::command(async)]`. Clippy runs with `-D warnings` on both the Mac and Windows targets (`npm run check:windows`).
- Commits carry no Co-Authored-By or AI attribution lines.
- OperatorShell bundle stays at or under 600 KB gz (`npm run budget`). New UI is lazy-imported.

## Review Focus

1. **A library larger than memory** (a 20 GB video folder). Expect it to stream file by file, with progress and no out-of-memory error. Task 3: the test writes a file through `write_bundle` from a reader, never a buffer of everything.
2. **A media file missing from the disk** (deleted by hand, or on an unplugged drive). Expect the move to carry on without it and report "2 files could not be found". Task 3 test `skips_missing_files_and_counts_them`.
3. **Restoring onto a computer that already has that media.** Expect same id: the file is not copied again and no row is duplicated. Task 3 test `import_skips_media_already_here`.
4. **A file that isn't ours, or is damaged** (a random .zip renamed, cut short). Expect a clear "This is not a Church Studio file" with nothing changed. Task 3 test `rejects_foreign_or_broken_files`.
5. **Paths inside the file that try to escape the media folder** (`../../evil.exe`, or an extension not allowed). Expect them to be refused. Task 3 test `refuses_paths_outside_media`.

---

### Task 1: What moves (the extras)

**Files:**
- Modify: `src/lib/platform/backup.ts` (BackupExtras, extrasFrom, applyExtras)
- Test: `src/lib/platform/backup.test.ts`

**Interfaces:**
- Produces: `BackupExtras` now also holds `logoAssetId`, `logoText`, `logoPicture`, `games`, `hiddenGames`, `playlists`, `serviceTemplates`, `macros`, `overlays`, `favorites`, `songUses`, `voiceWords` (from `voice.words`). Signatures of `extrasFrom(workspace, sermons)` and `applyExtras(workspace, extras)` are unchanged. The folder backup gains these too.

- [ ] **Step 1: Write failing tests** in backup.test.ts:
  - `extrasFrom carries games, playlists, templates, macros, overlays, favorites, logo and learned words`: build a workspace with one of each, then assert each appears in the result.
  - `extrasFrom never carries secrets`: set `pco.secret = "S1"`, `ai` with a key "S2", `onlineBibles.key = "S3"`, `voice.speechKeys.deepgram = "S4"`, and a broadcast stream key "S5". Assert `JSON.stringify(extrasFrom(...))` contains none of S1–S5.
  - `applyExtras merges the new lists by id and keeps local-only items`: one game on each side plus one shared id. Assert three games, with the shared one taking the file's version.
  - `applyExtras keeps this computer's logo when it has one`: `logoAssetId` is replaced only when the local one is null.
  - `applyExtras merges learned words by heard`: the same `heard` from the file wins, and a local-only word stays.
- [ ] **Step 2: Run** `npx vitest run src/lib/platform/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `mergeById` for the id lists. For `hiddenGames`, use a set union. For `favorites`, keep the local value when present. For `songUses`, take a union keyed by `songId + at`. For `voiceWords`, go into `workspace.voice.words` merged by `heard`. The logo fields follow the churchName rule (local first). Update the comment at the top of the file.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then run `npm run check`. Expected: 0 errors.
- [ ] **Step 5: Commit** `git commit -m "Backups carry games, playlists, templates, macros, overlays and the logo; never a secret"`

### Task 2: Media addresses for this computer

**Files:**
- Create: `src/lib/platform/relink.ts`
- Test: `src/lib/platform/relink.test.ts`

**Interfaces:**
- Produces: `relinkMedia<T>(value: T, urlFor: (id: string) => string | null): T`. This is a deep copy. Every string containing `/media/<id>.<ext>`, for an id where `urlFor` returns a URL, is replaced by that URL, whatever comes before it (any user folder, any OS, URL-encoded or not). Also, every object with `assetId` plus `imageUrl` or `videoUrl` gets those fields set to `urlFor(assetId)` when that is non-null. Strings that match no known id are left alone.

- [ ] **Step 1: Write failing tests:**
  - `rewrites a Mac asset address`: `"http://asset.localhost/%2FUsers%2Fold%2FLibrary%2F...%2Fmedia%2Fabc.mp4"` with `urlFor("abc") = "NEW"` gives `"NEW"`.
  - `rewrites a Windows asset address`: the same with `"http://asset.localhost/C%3A%5CUsers%5Cold%5C...%5Cmedia%5Cabc.png"`. Both `%2F` and `%5C` separators count.
  - `sets imageUrl from assetId`: `{ assetId: "abc", imageUrl: "stale" }` gives `imageUrl: "NEW"`.
  - `leaves unknown ids and ordinary text alone`: `"media/zzz.png"` with `urlFor` returning null stays unchanged, and `"Psalm 23"` is unchanged.
  - `walks arrays and nested objects without changing the input`: the original object is deep-equal to itself before and after.
- [ ] **Step 2: Run** `npx vitest run src/lib/platform/relink.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `relinkMedia`.** Match ids with the regex `/(?:\/|%2F|%5C|\\)media(?:\/|%2F|%5C|\\)([0-9a-f-]{36})\.([a-z0-9]{2,5})/i`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Media addresses rewritten for this computer after a move"`

### Task 3: Writing and reading the file (Rust)

**Files:**
- Create: `src-tauri/src/bundle.rs`
- Modify: `src-tauri/Cargo.toml` (add `zip = { version = "2", default-features = false, features = ["deflate"] }`), `src-tauri/src/lib.rs` (mod, three commands, register them), `src-tauri/src/db.rs` (`media_row_insert_with_id` if `record_media` cannot be reused as is)
- Test: `#[cfg(test)] mod tests` in bundle.rs

**File layout (fixed):**
- `manifest.json`: `{ "format": "church-studio-move", "version": 1, "createdAt", "appVersion", "computer", "media": [{ "id", "name", "kind", "ext", "bytes", "createdAt" }] }`
- `library.json`: the app's snapshot, as given
- `media/<id>.<ext>`: written with `CompressionMethod::Stored`
- `large_file(true)` on every entry, so files over 4 GB work

**Interfaces:**
- Produces (Rust, pure, testable without Tauri):
  - `pub struct MediaRow { id, name, kind, ext, path: PathBuf, created_at: String }`
  - `pub fn write_bundle(dest: &Path, library_json: &str, media: &[MediaRow], computer: &str, app_version: &str, progress: impl FnMut(u64, u64)) -> Result<WriteSummary, String>`, where `WriteSummary { files: usize, missing: usize, bytes: u64 }`. It writes to `dest` + ".part", then calls `storage::rename_patiently` to the final name.
  - `pub fn read_manifest(path: &Path) -> Result<(Manifest, String /* library.json */), String>`
  - `pub fn extract_media(path: &Path, media_dir: &Path, known_ids: &HashSet<String>, progress: impl FnMut(u64, u64)) -> Result<Vec<MediaRow>, String>`, which returns only the rows it extracted.
- Produces (commands, all `#[tauri::command(async)]`):
  - `move_export(app, db, dest: String, library: String) -> Result<WriteSummary, String>`, which emits `"move-progress"` `{ done: u64, total: u64 }`.
  - `move_peek(path: String) -> Result<Value, String>`, which returns `{ createdAt, computer, songs?, media: count, bytes }` for the confirm screen, read from the manifest only.
  - `move_import(app, db, path: String) -> Result<Value, String>`, which returns `{ library: String, mediaAdded: usize }`. It extracts, then inserts each extracted row with its original id (`INSERT OR IGNORE`). It emits `"move-progress"`.

- [ ] **Step 1: Write failing tests** in bundle.rs. They use temp dirs, as `backup_tests` in lib.rs does.
  - `round_trips_library_and_media`: two media files, written, then manifest read and media extracted into an empty dir. Expect identical bytes and the library string unchanged.
  - `skips_missing_files_and_counts_them`: one row whose path does not exist gives `missing == 1`, and the file is still valid.
  - `import_skips_media_already_here`: the id is in `known_ids`, so nothing is extracted for it.
  - `rejects_foreign_or_broken_files`: a zip with no manifest, a manifest with another `format`, and a file cut in half each give `Err("This is not a Church Studio file, or it is damaged.")`.
  - `refuses_paths_outside_media`: a hand-made zip with `media/../../x.png`, or with the id `"../x"`, or with an ext not allowed by `db::media_kind`, gets that entry refused.
  - `progress_reaches_total`: the last progress call has `done == total`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test bundle`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `bundle.rs`** and wire the three commands in lib.rs. Copy media with `std::io::copy` from a `File` into the zip writer, so nothing is held whole in memory. Ids must match `^[0-9a-f-]{36}$` and ext must pass `db::media_kind`, otherwise the entry is refused. `move_export` reads rows with `db::media_list`.
- [ ] **Step 4: Run** `cargo test bundle`, then `cargo clippy --all-targets -- -D warnings`, then `npm run check:windows`. Expected: all pass, no warnings.
- [ ] **Step 5: Commit** `git commit -m "The .churchstudio file: the library and its media in one file, streamed"`

### Task 4: The app's move (session)

**Files:**
- Create: `src/lib/app/move.ts` (the orchestration, kept out of session.svelte.ts per the ongoing split)
- Modify: `src/lib/app/session.svelte.ts` (two thin methods that call move.ts, plus `moveProgress` state)
- Test: `src/lib/app/move.test.ts`

**Interfaces:**
- Consumes: Task 1 `extrasFrom`/`applyExtras`, Task 2 `relinkMedia`, Task 3 commands, the existing `session.exportLibrary()` / `session.importLibrary(payload)`.
- Produces:
  - `MOVE_EXTENSION = "churchstudio"`
  - `moveFileName(churchName: string, now = new Date()): string`, which gives `"<Church name> 2026-10-24.churchstudio"`, or `"Church Studio 2026-10-24.churchstudio"` when there is no name. Characters not allowed in file names are removed.
  - `session.saveMoveFile(dest: string): Promise<string>` returns the message to show: "Saved: 214 songs, 38 services and 61 media files (3.2 GB)." with "· 2 files could not be found" appended when files were missing.
  - `session.peekMoveFile(path: string): Promise<MovePeek>` with `{ createdAt, computer, media, bytes }`.
  - `session.openMoveFile(path: string): Promise<string>`. It runs `move_import`, then reloads media (`this.media`), then builds `urlFor` from the reloaded list with `mediaUrl`. Then it passes the parsed library through `relinkMedia`, calls `importLibrary`, saves the sermons, applies `applyExtras`, and persists. It returns "Everything is here: …".
  - `session.moveProgress = $state<{ done: number; total: number } | null>(null)`, fed by `"move-progress"` and cleared at the end.
- [ ] **Step 1: Write failing tests** in move.test.ts:
  - `moveFileName strips characters Windows refuses`: `'Grace / "Chapel": Accra'` gives `"Grace Chapel Accra 2026-10-24.churchstudio"`.
  - `moveFileName without a church name`.
  - `buildMoveLibrary includes extras and the snapshot`: pure, given a snapshot and extras, gives one object with `extras`.
  - `restoreMoveLibrary relinks before importing`: given library JSON containing an old asset URL and `urlFor`, the payload passed to the importer holds the new URL.
- [ ] **Step 2: Run** `npx vitest run src/lib/app/move.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `move.ts`** as pure helpers (`buildMoveLibrary`, `restoreMoveLibrary(json, urlFor, importer)`, `moveFileName`). Add the thin session methods.
- [ ] **Step 4: Run** the move tests, `npm test`, and `npm run check`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Moving to a new computer: save and open the whole library"`

### Task 5: Where churches find it

**Files:**
- Create: `src/lib/components/settings/MoveComputer.svelte`
- Modify: `src/lib/components/settings/SettingsDialog.svelte` (storage section, above "Automatic backup and a second computer"), `src/lib/components/onboarding/Welcome.svelte` (welcome step), `src/lib/i18n/fr.ts`, `src/lib/i18n/es.ts`

**Interfaces:**
- Consumes: Task 4 session methods and `moveProgress`, and `@tauri-apps/plugin-dialog` `save`/`open` with filter `{ name: "Church Studio", extensions: ["churchstudio"] }`.

**Behaviour and copy (fixed):**
- **Settings › Storage**, section "Move to a new computer":
  - The row text: "One file with everything: songs, services, sermons, slides, designs, games, pictures, videos and music. Carry it on a USB stick or a cloud drive. Screens, sound and passwords stay on each computer."
  - Buttons: **Save the file…** and **Open a file…**.
  - While running: a progress bar with "Saving… 1.2 GB of 3.2 GB" or "Bringing it in… 40%".
- **Open a file…** first shows what it holds: "From *Media PC*, saved 24 Oct 2026: 61 media files, 3.2 GB. Everything here stays; this adds to it." with the buttons **Bring it in** and **Cancel**.
- **Welcome, first step:** under the language picker, a quiet link button reads "Moving from another computer? Bring everything across". It opens the same confirm flow. On success it marks onboarding done, the way the existing finish step does, and shows the result message.
- Hidden when `!isDesktop()`.

- [ ] **Step 1:** Build `MoveComputer.svelte` (save flow, open flow with confirm, progress) and place it in the storage section. Lazy-import it the way StorageSpace is loaded if the budget needs it.
- [ ] **Step 2:** Add the Welcome link. It reuses MoveComputer's open flow (export a `openMoveFlow` helper or render the component in a compact mode, whichever keeps Welcome small).
- [ ] **Step 3:** Add FR and ES entries for every new string. Run `npx vitest run src/lib/i18n`. Expected: PASS.
- [ ] **Step 4: Run** `npm run check`, `npm test`, and `npm run budget`. Expected: 0 errors, all pass, every bundle within budget.
- [ ] **Step 5: Try it** in the desktop app (`npm run tauri dev`):
  1. Save a file with at least one picture and one video.
  2. Rename the app data folder, so the next start is a new computer.
  3. Open the file from Welcome.
  4. Check that a deck with a picture background and a video source both show.
- [ ] **Step 6: Commit** `git commit -m "Move to a new computer: in Settings › Storage and on the first-run screen"`
