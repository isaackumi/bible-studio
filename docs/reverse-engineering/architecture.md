# Architecture

> The running product architecture lives in [`docs/product/`](../product/product-architecture.md). This note is the original stack decision. The desktop app now exists: Tauri, Svelte, SQLite, and the preview/program state machine described below.

Analysis only. No application code until this direction is approved.

## 1. Environment

| Item | Value |
| --- | --- |
| OS | macOS 26.5 (build 25F71), arm64 |
| CPU | Apple M2, 8 cores |
| Memory | 8 GB |
| GPU | Apple M2, 10 cores, Metal 4 |
| Displays | Built-in 2560×1600 Retina (main); Dell U2415 1920×1200 @ 60 Hz |
| Runtimes | Node 23.10.0, npm 10.9.2, Python 3.12.11, git 2.50.1 |
| Reference apps | Pewbeam 2.6.14 (native), FreeShow 1.5.5 (Electron), OBS 32.0.1 (Qt) |

Node 23 is outside the supported set published by [REA](https://github.com/morluto/rea) (22.x, 24.x, or 26+). REA was not installed. PewBeam was not decompiled: the brief forbids extracting proprietary source. FreeShow was studied from the public GPL tree and from local settings keys, not by unpacking `app.asar`. OBS was studied as a product. Details are in the sibling notes.

## 2. Repository today

`prompt.txt` plus this `docs/reverse-engineering/` folder. No modules, no package manifest, no tests, no UI. Nothing to reuse and nothing to wrap. Changes should stay incremental once implementation starts, but the first commit of code will be the foundation rather than a refactor.

## 3. Recommended technology

**Tauri 2 + Svelte + TypeScript, with SQLite for the Bible and JSON for services and themes.**

Why this and not Electron: FreeShow shows the church-presenter shape, and it also shows the cost. Electron plus a long-lived output window is heavy on an 8 GB machine that may also have OBS open. Tauri’s shell is Rust; the UI is a system webview. Text, themes, and images are a webview’s strength. We do not need Chromium in process for phase 1.

Why not Qt/libobs: that is the right end state for a real video mixer, and the wrong first year. Bible, lyrics, and a reliable Take do not need a compositor.

Fallback if Tauri’s multi-window or video path fails a spike: Electron, with the domain logic kept in plain TypeScript so the shell can change. Do not start in Electron “just in case.”

Rust was not in the runtime check. Approving this stack means installing the Rust toolchain before phase 1.

| Concern | Choice |
| --- | --- |
| Shell and windows | Tauri 2. One window for the operator, one per output role |
| Operator UI | Svelte + TypeScript |
| Domain logic | TypeScript modules with no UI imports, tested in Vitest |
| Bible | SQLite. Bundled KJV only |
| Services, themes | JSON files in a workspace directory the user can back up |
| Media | Files on disk. The service stores paths, plus a content hash when the file is imported into the workspace |
| Output pixels | HTML/CSS theme frame at a fixed canvas size (default 1920×1080), scaled to the window |
| Search | SQL for references and text. An optional index later, not in P0 |

## 4. Process shape

```
Operator window          Output window(s)
Svelte UI                theme canvas only
    │                         ▲
    │  commands               │ frame state
    ▼                         │
Domain core (TypeScript)
services, navigation, preview/program, themes
    │
    ├── SQLite Bible
    └── workspace files
```

The output window does not search, does not parse projects, and does not own navigation. It receives an immutable **frame**: canvas size, background, layers, transition. If the operator window is busy, the last frame stays on screen.

Preview and program are two frame slots in the core, not two themes. Take copies preview to program and tells the audience window to transition. The on-screen preview is a render of the preview slot. The small program monitor is a render of the program slot. They share the theme renderer so they cannot drift.

## 5. Domain model (minimal)

Ship these. Do not create empty types for cameras, schedules, or plugins.

```
Workspace
  profile: display roles, canvas size, default theme id   (this machine)
  library: themes[], lyric documents[]

Service
  id, name, updatedAt
  sections[]: ServiceSection

ServiceSection
  id, name            (Opening, Worship, Scripture, …)
  items[]: ServiceItem

ServiceItem
  id, kind, title
  kind = scripture | lyrics | text | image | action
  scripture?: { translationId, ranges[], display }
  lyrics?: { lines[] } or ref to a lyric document
  text?: { body, role: title | announcement }
  image?: { assetId }
  action?: { type: clear | black | logo | timer }
  notes?: string
  themeOverride?: theme id

BibleTranslation
  id, name, abbreviation, licenseNote, source
  books[] → chapters[] → verses[]     stored in SQLite, not in the service file

Theme
  id, name
  font, colors, margin, align
  layouts: verse | lyric | title | lowerThird
  background
  transition: { type: cut | fade, ms }

Output
  role: audience | stage | operator
  displayId
  themeId
  frame: preview slot is local; audience follows program

Display
  id, label, bounds, scale     discovered, not saved as the only truth
```

A service file must still open if a display is gone or a media path is missing. Those are runtime warnings, not parse failures.

**Later, without breaking this model:** a `look` on a section (full-frame vs lower-third) becomes the church version of a scene. A layer list on the frame becomes sources. Plugins add item kinds. Do not add those fields until a phase needs them.

### Bible storage

KJV is imported at build time into SQLite:

`translations(id, name, abbr, license)`
`books(translation_id, ord, name, abbrev)`
`verses(translation_id, book_ord, chapter, verse, text)`

Reference parsing is a pure function: `John 3:16-18`, `Jn 3:16`, `Psalm 23`, `Ps 23:1-3`. It returns ranges or a typed error. Tests cover abbreviations, ranges, and single-chapter books.

Importers (P1) write the same tables and record the filename and a license note the user supplies. The app never downloads a copyrighted text.

## 6. Rendering

A theme plus a frame produces a single full-bleed document:

- Background: color, gradient, or image (cover / contain).
- One text stack for the layout kind.
- Verse layout: reference, body, translation abbreviation, attribution line.
- Lyric layout: lines, optional section label (Verse 2).
- Title layout: one heading and an optional subtitle.
- Lower third (P1): same fields, bottom-weighted, transparent background.

Transitions: crossfade the audience window from the previous frame to the next, or swap (cut). Duration lives on the theme (FreeShow’s 500 ms text fade is a reasonable default). No other animation in the first release.

Thumbnails for the rundown are generated lazily and cached on disk by item id + theme id. They are never on the path that paints program.

## 7. Multi-display

On launch, enumerate displays.

| Role | Default on this Mac |
| --- | --- |
| Operator | Built-in retina |
| Audience | Dell U2415, if present |
| Stage | Unassigned. Optional window |

Rules:

- Audience window is frameless, on the assigned display, above normal windows, not on the primary display unless the user confirms.
- Unplugging the Dell leaves program state intact and marks the audience output offline.
- Canvas is 1920×1080 logical pixels unless the profile says otherwise. The window scales. The Dell’s 1920×1200 gets a fitted 16:9 frame, not a stretched one.
- Stage (P1) uses the same frame history (current and next) plus section name, notes, and elapsed time. It does not show preview-only content.

Machine profile stays out of the service file so the same Sunday can open on another computer.

## 8. Live production

State machine:

```
idle → preview set → (take | cut) → program = preview
program → clear → program empty (background or black, per the clear mode)
program → black → program suppressed, last frame kept
program → logo → program shows the workspace logo frame
```

Next and previous move a **playhead** inside the service and update **preview only**. Take commits. That is the OBS rule applied to a rundown, and it is the opposite of FreeShow’s default.

Black and logo are program overrides, not service items, so they do not lose the playhead.

Errors:

- Missing image: preview shows a named placeholder; take is allowed only if the user confirms, otherwise program is unchanged.
- Bad reference: the lookup field shows the error; program unchanged.
- Output window crash: reopen it on the same display and push the current program frame. The core does not live in the output window.

There is no background worker requirement beyond SQLite queries and thumbnail generation. Those must not run on the UI interaction path. A verse lookup is a single indexed query.

## 9. Extensibility (designed, not built)

An item kind and a theme layout are the extension points. A future plugin registers a kind and a way to produce a frame. The core only stores JSON it can skip if the kind is unknown (show the item as unsupported, do not drop it on save).

The P2 API surface, not implemented now:

```
GET  /api/status
POST /api/live/next
POST /api/live/previous
POST /api/live/take
POST /api/live/clear
POST /api/bible/preview     { reference, translation }
POST /api/service/section   { id }
```

No cloud, no account, bound to localhost.

## 10. Risks

| Risk | Why it matters here | Mitigation |
| --- | --- | --- |
| 8 GB RAM | OBS may be open beside this app | System webview, no embedded browser engine, no local model in P0 |
| Tauri video and transparent windows | P1 video and lower thirds are weaker in a webview than in libobs | Spike video on the audience window before promising P1. Keep domain logic shell-agnostic |
| Copyrighted Bibles | PewBeam’s bundle is not a template we can follow | KJV only. Importer. Attribution field required when the translation asks for it |
| Preview/program discipline | Easy to “just show it” and undo the safety | Tests on the state machine. UI is not allowed to write the program slot except through take, cut, clear, black, logo |
| Long sessions | FreeShow has a history of output leaks and IPC storms | Output window is a pure frame renderer. Profile a 30-minute run before calling P0 done |
| Two displays | Stage cannot be a real third screen yet | Stage is P1 and may be a window |
| Scope | Three products’ feature lists | P0 list is the release. Detection, NDI, and streaming are not |
| NDI SDK | PewBeam vendors it. The SDK is not ours to copy | A future sender uses a separately obtained SDK or a different protocol |
| REA / Node 23 | Cannot run REA’s installer on the current Node without a version switch | Not required for this phase. Public source and black-box docs were sufficient |

## 11. Decisions to approve

1. Tauri 2 + Svelte + TypeScript + SQLite, Electron only as a documented fallback.
2. Preview never writes program except through take, cut, clear, black, and logo.
3. Bundle KJV only.
4. Phase 1 is the P0 list in `product-requirements.md`. No listener, no NDI, no remote.
5. Original code. FreeShow is a reference, not a dependency and not a fork.
