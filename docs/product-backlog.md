# Product backlog

Canonical capability list for Church Studio. Older sequencing lives in [product/roadmap.md](product/roadmap.md). Architecture contracts live under [architecture/](architecture/).

Status: **Shipped** works in the current app. **Partial** works on one platform or with limits. **Designed** has a home in the codebase or these docs. **Planned** is not designed in code yet.

Priorities: **P0** foundation, **P1** production, **P2** ecosystem, **P3** later.

Phases: **A** architecture, **B** content, **C** browser, **D** production media, **E** NDI, **F** extensions, **G** community.

---

## Index

| ID | Capability | Priority | Status | Phase |
| --- | --- | --- | --- | --- |
| CS-P0-001 | Unified content contract | P0 | Designed | A |
| CS-P0-002 | Output engine / sinks | P0 | Partial | A |
| CS-P0-003 | Browser operator | P0 | Shipped | C |
| CS-P0-004 | Browser audience output | P0 | Partial | C |
| CS-P0-005 | Browser/desktop capability detection | P0 | Partial | A |
| CS-P0-006 | Program/Preview safety for all sources | P0 | Partial | A |
| CS-P0-007 | Image content | P0 | Shipped | B |
| CS-P0-008 | Media architecture (browser adapter) | P0 | Shipped | B |
| CS-P0-009 | Sermon / presenter content | P0 | Shipped | B |
| CS-P1-001 | Presenter notes workflow | P1 | Shipped | B |
| CS-P1-002 | Content import | P1 | Shipped | B |
| CS-P1-003 | Live song / lyric search | P1 | Shipped | B |
| CS-P1-004 | Phone / tablet remote | P1 | Partial | C |
| CS-P1-005 | Camera sources | P1 | Planned | D |
| CS-P1-006 | Video file sources | P1 | Planned | D |
| CS-P1-007 | NDI architecture | P1 | Designed | E |
| CS-P1-008 | NDI desktop input / output | P1 | Planned | E |
| CS-P1-009 | Extension API foundation | P1 | Designed | F |
| CS-P1-010 | Community theme format | P1 | Partial | F |
| CS-P2-001 | Community plugin ecosystem | P2 | Planned | G |
| CS-P2-002 | Extension registry | P2 | Planned | G |
| CS-P2-003 | External song providers | P2 | Planned | G |
| CS-P2-004 | External scripture providers | P2 | Planned | G |
| CS-P2-005 | Multi-operator collaboration | P2 | Planned | G |
| CS-P2-006 | Cloud remote control | P2 | Planned | G |
| CS-P3-001 | Stage window | P3 | Partial | D |
| CS-P3-002 | Recording and streaming | P3 | Planned | E |

---

## P0

### CS-P0-001 Unified content contract

**Description.** Scripture, songs, slides, images, and future sermon/camera/NDI sources compile to `PresentationModel` and enter Preview through `setPreview`.

**Architectural impact.** `src/lib/domain/content.ts` names source kinds. Rundown persistence stays `ItemKind` on `PresentationItem`. Do not add a second live state.

**Dependencies.** CS-P0-006.

**Status.** Designed. Live kinds: `bible`, `lyric`, `slide`, `image`, `announcement`. `session.modelFor` is the current adapter.

**Acceptance.** A new source kind cannot write Program except through `applyProgramAction`. Tests cover current kinds and a camera/NDI stand-in.

**Phase.** A.

### CS-P0-002 Output engine / sinks

**Description.** Program is published once. Sinks (Tauri window, browser window, later NDI, stage) consume `ProgramPacket`.

**Architectural impact.** `src/lib/display/engine.ts` lists sinks. Desktop publish is `publish_program`. Browser publish is `publishLocal`. Do not duplicate Program. Do not change `AudienceOutput.svelte` for this item.

**Dependencies.** CS-P0-005.

**Status.** Partial. Two sinks work. NDI and stage are listed and `available: false`.

**Acceptance.** Closing a sink does not call `applyProgramAction`. Adding NDI later is a new sink, not a new Program.

**Phase.** A.

### CS-P0-003 Browser operator

**Description.** The same PewBeam desk runs in the browser SPA.

**Architectural impact.** None beyond keeping `isDesktop()` adapters.

**Dependencies.** None.

**Status.** Shipped. IndexedDB for songs/services/themes. Workspace in `localStorage`.

**Acceptance.** Operator can search scripture, preview, Take, and keep the session after reload (except Program, which launches empty).

**Phase.** C (already done).

### CS-P0-004 Browser audience output

**Description.** `window.open("/?display=1")` plus `BroadcastChannel` / `localStorage`. Operator drags the window. Fill this screen is on that window.

**Architectural impact.** Keep `src/lib/display/output.ts` and `channel.ts`. Do not pretend the browser can assign monitors.

**Dependencies.** CS-P0-005.

**Status.** Partial. Works as a popup. No Window Management placement. Autoplay/fullscreen need a user gesture.

**Acceptance.** Popup blocked is reported. Closing the popup does not change Program. Fullscreen failure does not change Program.

**Phase.** C.

### CS-P0-005 Browser/desktop capability detection

**Description.** Probe open, fullscreen, `getScreenDetails`, `getUserMedia`, WebRTC. Desktop placement stays native.

**Architectural impact.** `detectOutputCapabilities` / `outputCapabilities()`. UI copy later; detection now.

**Dependencies.** None.

**Status.** Partial. Detection is implemented. Desk UI does not yet explain every unavailable probe.

**Acceptance.** Browser never reports `canPlaceWindow`. Desktop reports `canPlaceWindow`. Presence of `getScreenDetails` does not claim tested multi-monitor placement.

**Phase.** A.

### CS-P0-006 Program/Preview safety for all sources

**Description.** Select → Preview. LIVE/Cut/Clear/Black/Logo → Program. Translation change may update Program scripture in place (`replaceProgramModel`). Themes stay on Preview until LIVE.

**Architectural impact.** Existing `live.ts`. New sources must use `setPreview`.

**Dependencies.** CS-P0-001.

**Status.** Partial. Covered for current kinds plus sermon sections compiling to slides. Camera/NDI not shipped.

**Acceptance.** Tests fail if a source adapter calls `applyProgramAction` on select.

**Phase.** A.

### CS-P0-007 Image content

**Description.** Import, library, preview, Take, service attachment, logo, theme backgrounds.

**Architectural impact.** `MediaAsset.kind` is `"image"`. Desktop SQLite + files. Browser IndexedDB `media` store.

**Dependencies.** CS-P0-008.

**Status.** Shipped. Desktop files and browser IndexedDB. Import is Settings → Media. Preview only until LIVE.

**Acceptance.** Selecting an image changes Preview only. Missing file → empty frame, not a crash.

**Phase.** B.

### CS-P0-008 Media architecture (browser adapter)

**Description.** Same `MediaAsset` id in browser IndexedDB (`media` store, schema 2). See [product/browser-media-storage.md](product/browser-media-storage.md).

**Architectural impact.** Extend `browser-store.ts` and `api.mediaList` / `importMedia`. No second media model.

**Dependencies.** CS-P0-007.

**Status.** Shipped. IndexedDB schema version 2, `api.mediaList` / `importMedia` / `mediaUrl` on web.

**Acceptance.** Browser list/import/url work offline. Quota failure leaves the previous store. Kind stays `"image"` until CS-P1-006.

**Phase.** B.

### CS-P0-009 Sermon / presenter content

**Description.** A sermon holds title, speaker, notes, scripture refs, media, and presentation items. Notes never go to Program unless the operator Takes a presentation item.

**Architectural impact.** New persisted type, compiled through `modelFor` / `setPreview`. Not a voice-listen synonym. `start_sermon_listen` stays Preview-only matching.

**Dependencies.** CS-P0-001, CS-P0-006, CS-P0-007.

**Status.** Shipped. Library document, desk notes, Preview via `setPreview`. Search/attach/reorder is CS-P1-001.

**Acceptance.** Operator can preview a section, Take it, and see notes on the desk without sending notes to the audience.

**Phase.** B.

---

## P1

### CS-P1-001 Presenter notes workflow

**Description.** Search sermon material, navigate sections, attach scripture/images, reorder. Notes stay on the operator surface.

**Dependencies.** CS-P0-009.

**Status.** Shipped. Search title, speaker, notes, and attached scripture. Reorder sections. Attach scripture or an image for Preview. Notes stay on the desk.

**Phase.** B.

**Acceptance.** Notes panel is not painted by `AudienceOutput`.

### CS-P1-002 Content import

**Description.** Import images (exists on desktop), plain text, Markdown, later PDF/presentation after format research. No format is advertised until the importer is real.

**Dependencies.** CS-P0-001, CS-P0-008.

**Status.** Shipped. Library JSON, images, plain text, and Markdown. PDF and presentation files are not advertised.

**Phase.** B.

**Acceptance.** Failed import does not write Program. Unknown service item kinds are preserved when that importer exists.

### CS-P1-003 Live song / lyric search

**Description.** Search title, lyric text, author, recent. Preview match, queue, or LIVE. Local library first. No scraping. External providers later as plugins (CS-P2-003).

**Dependencies.** CS-P0-006.

**Status.** Shipped. `/` opens a local overlay. Title, author, and lyric text. Recent after a Preview. No scraping.

**Phase.** B.

**Acceptance.** `/` focuses search. Selecting a hit writes Preview only.

### CS-P1-004 Phone / tablet remote

**Description.** Phone is a controller, not a display. Pair on the local network. Commands are existing `CommandId`s. No cloud required. Protocol must allow a later cloud hop.

**Architectural impact.** New local WebSocket (or equivalent) service in Tauri. Browser operator can host the same commands. Pairing code / QR. See [architecture/extensions.md](architecture/extensions.md).

**Dependencies.** CS-P0-002, CS-P0-006. **Status.** Partial. Same-origin remote pad at `?remote=1`. Pairing code. Existing `CommandId`s. Unpaired clients cannot Take. Not shipped until a real phone on the LAN talks to a local socket.

**Phase.** C.

**Acceptance.** Take/next/previous/clear/black/logo from a paired phone. Unpaired clients cannot change Program. Tested on a real phone on the LAN before claiming shipped.

### CS-P1-005 Camera sources

**Description.** `getUserMedia` first. Select → Preview. LIVE copies the frame/source into Program. Permission denied is a desk message.

**Architectural impact.** Native/service boundary later. Not inside `PewDesk.svelte`. See [architecture/media-sources.md](architecture/media-sources.md).

**Dependencies.** CS-P0-001, CS-P0-006, CS-P0-005. **Status.** Planned. **Phase.** D.

**Acceptance.** Deny/unavailable handled. Program changes only through production actions. Not claimed until a real camera is tested.

### CS-P1-006 Video file sources

**Description.** Extend `MediaAsset.kind` after image browser storage exists. Preview then Take.

**Dependencies.** CS-P0-008. **Status.** Planned. **Phase.** D.

### CS-P1-007 NDI architecture

**Description.** Native/Rust (or other native) boundary. Input, output, discovery, source list. Svelte never talks to the NDI SDK. Browser cannot use the native SDK.

**Dependencies.** CS-P0-002, legal review of the NDI SDK terms. **Status.** Designed. **Phase.** E.

**Acceptance.** Docs + `canUse("ndi")` remain false until CS-P1-008.

### CS-P1-008 NDI desktop input / output

**Description.** Discover sources, receive into Preview, send Program as an NDI output.

**Dependencies.** CS-P1-007, SDK license compliance, bundled DLLs per Vizrt terms. **Status.** Planned. **Phase.** E.

**Acceptance.** Missing runtime is reported. Failure does not mutate Program. Not claimed without an NDI runtime test.

### CS-P1-009 Extension API foundation

**Description.** Capability-based plugins: manifest, apiVersion, permissions. Host is not a second app framework. Commands and events reuse `CommandId`.

**Dependencies.** CS-P0-001, CS-P0-002. **Status.** Designed. **Phase.** F.

**Acceptance.** Invalid manifest / apiVersion / missing permission rejected. Plugin failure cannot corrupt workspace JSON.

### CS-P1-010 Community theme format

**Description.** Import/export presentation themes (tokens + assets). No arbitrary JavaScript. Cannot write Program.

**Dependencies.** Existing `Theme` type. **Status.** Partial. Themes import with the library snapshot; no separate community package.

**Phase.** F.

---

## P2

| ID | Capability | Notes |
| --- | --- | --- |
| CS-P2-001 | Community plugin ecosystem | Packaging, sandbox, no unrestricted app access. Phase G. |
| CS-P2-002 | Extension registry | Themes, song providers, scripture providers, media, tools. Phase G. |
| CS-P2-003 | External song providers | Licensed APIs only. No scraping. |
| CS-P2-004 | External scripture providers | Public-domain local texts stay default. |
| CS-P2-005 | Multi-operator collaboration | Builds on output owner (`sessionId` / `generation`). |
| CS-P2-006 | Cloud remote control | Same command protocol as CS-P1-004 with an account hop. App still runs offline. |

---

## P3

| ID | Capability | Notes |
| --- | --- | --- |
| CS-P3-001 | Stage window | Role is stored on the display profile. Window stays closed. |
| CS-P3-002 | Recording and streaming | `canUse` is false. Not NDI. |

---

## Explicitly out of this backlog

- Rewriting Svelte, Tauri, Preview/Program, or `AudienceOutput`.
- Reviving `WorkspaceHost` as the live desk.
- Replacing PaneForge.
- Electron.
- Bundled SF Symbol fonts.
- Cloud backend solely for LAN phone control.
- A second media store or a second Program.
- Unrestricted plugins.
- Scraping lyric sites.
- Claiming browser multi-monitor, NDI, camera, or phone control without the tests in this document.
