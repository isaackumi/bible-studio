# Product backlog

Canonical capability list for Church Studio. Older sequencing lives in [product/roadmap.md](product/roadmap.md). Architecture contracts live under [architecture/](architecture/).

Status: **Shipped** works in the current app. **Partial** works on one platform or with limits. **Designed** has a home in the codebase or these docs. **Planned** is not designed in code yet.

Priorities: **P0** foundation, **P1** production, **P2** ecosystem, **P3** later.

Phases: **A** architecture, **B** content, **C** browser, **D** production media, **E** NDI, **F** extensions, **G** community.

---

## To do before launch

- [ ] **Rename the app.** The churchstudio domain is taken, so "Church Studio" is a working name. Choose a name with a free domain, then change it everywhere: the window title and `productName` in `src-tauri/tauri.conf.json`, the bundle identifier, `package.json`, the i18n strings (English and French), the README, the plans page and emails (`server/pages.ts`, the key email in `server/api.ts`), and `MAIL_FROM` in `server/wrangler.jsonc`. The license key prefixes (`CS1-`, `CSL1.`) can stay: users never read them as the name.
- [ ] **Redraw the logo to match the new name** if the Multiview mark no longer fits (`docs/brand`, `src-tauri/icons` via `tauri icon`, the favicon, `BrandMark.svelte`).
- [ ] **Turn on accounts:** create the D1 database (`npx wrangler d1 create church-studio-auth`, binding `AUTH_DB` in `server/wrangler.jsonc`), set `RESEND_API_KEY` for email links, and register Google, Microsoft and Apple sign-in apps with their redirect URLs (`server/README.md`, Accounts). Until then the app's **Sign in** button says accounts are not set up.
- [ ] **License server address:** `license.heitechinc.com` for now (named for the company, so it can stay after the rename). If it moves to the new brand's domain, update `SERVER_URL` in `src/lib/domain/billing.ts` *before* that build ships, and keep the old address answering for the copies already installed.

## Index

| ID | Capability | Priority | Status | Phase |
| --- | --- | --- | --- | --- |
| CS-P0-001 | Unified content contract | P0 | Designed | A |
| CS-P0-002 | Output engine / sinks | P0 | Partial | A |
| CS-P0-003 | Browser operator | P0 | Shipped | C |
| CS-P0-004 | Browser audience output | P0 | Partial | C |
| CS-P0-005 | Browser/desktop capability detection | P0 | Shipped | A |
| CS-P0-006 | Program/Preview safety for all sources | P0 | Partial | A |
| CS-P0-007 | Image content | P0 | Shipped | B |
| CS-P0-008 | Media architecture (browser adapter) | P0 | Shipped | B |
| CS-P0-009 | Sermon / presenter content | P0 | Shipped | B |
| CS-P0-010 | Composition Engine | P0 | Partial | A |
| CS-P0-011 | Unified composition representation | P0 | Partial | A |
| CS-P0-012 | Layer model | P0 | Partial | A |
| CS-P0-013 | Preview/Program composition safety | P0 | Partial | A |
| CS-P0-014 | Output engine composition integration | P0 | Partial | A |
| CS-P1-001 | Presenter notes workflow | P1 | Shipped | B |
| CS-P1-002 | Content import | P1 | Shipped | B |
| CS-P1-003 | Live song / lyric search | P1 | Shipped | B |
| CS-P1-004 | Phone / tablet remote | P1 | Partial | C |
| CS-P1-005 | Camera sources | P1 | Partial | D |
| CS-P1-006 | Video file sources | P1 | Partial | D |
| CS-P1-007 | NDI architecture | P1 | Designed | E |
| CS-P1-008 | NDI desktop input / output | P1 | Planned | E |
| CS-P1-009 | Extension API foundation | P1 | Designed | F |
| CS-P1-010 | Community theme format | P1 | Shipped | F |
| CS-P1-011 | Camera + lower third | P1 | Partial | D |
| CS-P1-012 | Scripture + camera split screen | P1 | Partial | D |
| CS-P1-013 | Song + camera split screen | P1 | Partial | D |
| CS-P1-014 | Timer / countdown source | P1 | Shipped | D |
| CS-P1-015 | Lower-third templates | P1 | Partial | D |
| CS-P1-016 | Saved compositions | P1 | Partial | A |
| CS-P1-017 | Composition templates | P1 | Partial | A |
| CS-P1-018 | Basic composition editor | P1 | Shipped | A |
| CS-P1-019 | Nearby: computers on one licence share files over the local network | P1 | Partial | D |
| CS-P2-001 | Community plugin ecosystem | P2 | Planned | G |
| CS-P2-002 | Extension registry | P2 | Planned | G |
| CS-P2-003 | External song providers | P2 | Planned | G |
| CS-P2-004 | External scripture providers | P2 | Planned | G |
| CS-P2-005 | Multi-operator collaboration | P2 | Planned | G |
| CS-P2-006 | Cloud remote control | P2 | Planned | G |
| CS-P2-007 | Advanced composition animations | P2 | Planned | G |
| CS-P2-008 | Multiple camera layouts | P2 | Partial | D |
| CS-P2-009 | NDI composition sources | P2 | Planned | E |
| CS-P2-010 | Plugin composition sources | P2 | Planned | F |
| CS-P2-011 | Community composition templates | P2 | Planned | G |
| CS-P2-012 | Advanced graphics | P2 | Planned | G |
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

**Status.** Partial. Works as a popup. Chromium opens it on the second screen via Window Management (`pickAudienceScreen` / `placementFeatures`); otherwise the operator drags it. Verified with stubbed screens, not a real second monitor. Autoplay/fullscreen need a user gesture.

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

### CS-P0-010 Composition Engine

**Description.** One composition model for layered looks (camera + lower third, split regions, timers). Compiles to `PresentationModel`. Does not decide Program.

**Architectural impact.** `src/lib/domain/composition.ts`, `timer.ts`. PewDesk hosts Looks UI only. Do not rewrite Preview/Program or `AudienceOutput`.

**Dependencies.** CS-P0-001, CS-P0-006.

**Status.** Partial. Domain, templates, Preview compile, FrameView layers, Looks pane. Live camera pixels inside a region and NDI are not in this item.

**Acceptance.** Scripture, camera card, lower third, and timer can share one composition on Preview. LIVE is required for Program. Tests cover SELECT ≠ LIVE.

**Phase.** A.

### CS-P0-011 Unified composition representation

**Description.** `presentComposition` is the only look the sinks paint. No browser-specific or Tauri-specific composition JSON.

**Status.** Partial. `layout: "composition"` with `layers`.

**Phase.** A.

### CS-P0-012 Layer model

**Description.** Deterministic z-index, bounds in percent, hide/show, opacity, fit, animation metadata.

**Status.** Partial. Domain + FrameView. Full visual drag editor is CS-P1-018.

**Phase.** A.

### CS-P0-013 Preview/Program composition safety

**Description.** Editing a look, swapping a source, or changing a timer writes Preview. TAKE/CUT copy to Program. Audience receives Program only.

**Status.** Partial. Tests in `composition.test.ts` and `timer.test.ts`.

**Phase.** A.

### CS-P0-014 Output engine composition integration

**Description.** Composition packets use the existing publish path. `deliverProgram` must not Take on sink failure.

**Status.** Partial. Same `ProgramPacket`. NDI sink still `available: false`.

**Phase.** A.

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

**Dependencies.** CS-P0-002, CS-P0-006. **Status.** Partial. Same-origin pad at `?remote=1`. Desktop LAN HTTP on port 17891, same v1 envelope. Unpaired clients cannot Take. Not shipped until a real phone on the LAN is tested.

**Phase.** C.

**Acceptance.** Take/next/previous/clear/black/logo from a paired phone. Unpaired clients cannot change Program. Tested on a real phone on the LAN before claiming shipped.

### CS-P1-005 Camera sources

**Description.** `getUserMedia` first. Select → Preview. LIVE copies the frame/source into Program. Permission denied is a desk message.

**Architectural impact.** Native/service boundary later. Not inside `PewDesk.svelte`. See [architecture/media-sources.md](architecture/media-sources.md).

**Dependencies.** CS-P0-001, CS-P0-006, CS-P0-005. **Status.** Partial. `getUserMedia` video on Preview, Program monitors, and the audience window (one feed per camera in use; audience opens its own feeds and warms Preview cameras on standby). Browser verified with a fake device. Permission denied is a desk message. Listen stays audio. Not shipped until a real camera is tested.

**Phase.** D.

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

### CS-P1-011 Camera + lower third

**Description.** Full-frame camera card with a lower-third layer. Configure → Preview → LIVE.

**Status.** Partial. Template and paint. Live camera pixels in the region on Preview, Program, and the audience window; desktop real-camera run pending.

**Phase.** D.

### CS-P1-012 Scripture + camera split screen

**Description.** Two-region template. Sources assigned to slots, not a hardcoded left/right kind.

**Status.** Partial. `lookScriptureCamera` fills the split (last Preview verse + first camera). Live camera pixels on Preview, Program, and the audience window; desktop real-camera run pending.

**Phase.** D.

### CS-P1-013 Song + camera split screen

**Description.** Same regions as CS-P1-012 with a lyric source.

**Status.** Partial. `lookLyricsCamera` fills the split (last Preview song section + first camera). Live camera pixels on Preview, Program, and the audience window; desktop real-camera run pending.

**Phase.** D.

### CS-P1-014 Timer / countdown source

**Description.** Countdown, count-up, clock, target time. Domain state. Local ticks in FrameView. Program only via LIVE.

**Status.** Partial. `timer.ts`, timer layout, Camera + Countdown look, full countdown with count-up, clock, and target time in Looks. Local ticks in FrameView. Live camera pixels on Preview, Program, and the audience window; desktop real-camera run pending.

**Phase.** D.

### CS-P1-015 Lower-third templates

**Description.** Speaker, scripture reference, announcement, song title, guest, event. Themeable later. Not auto-LIVE.

**Status.** Partial. `LOWER_THIRD_TEMPLATES`. Scripture, song, and announcement buttons harvest from the desk. Speaker, guest, and event use the title/subtitle fields. Themeable later.

**Phase.** D.

### CS-P1-016 Saved compositions

**Description.** Persist looks on the workspace. Restore to Preview. Do not restore as Program.

**Status.** Partial. `Workspace.compositions`. Production Desk Scenes = looks; Sources = layers. Scene `locked` freezes edits. Shared sources: `Workspace.sources`; layers link by `sourceKey`; editing a shared source updates every linked layer, is refused while a linked scene is locked, and unreferenced sources prune. Queue persists the look first, then a `kind: "composition"` rundown item. Selecting that item restores Preview only. Missing look paints empty. Duplicate look saves a copy with a new id. Delete removes an unlocked look without Taking; open draft identity clears if it matched.

**Phase.** A.

### CS-P1-017 Composition templates

**Description.** Reusable slot layouts, including community data later.

**Status.** Partial. Built-in templates. Filled looks: lower third, camera countdown, scripture, lyrics, image, two cameras, camera + presentation, full camera, full scripture, full lyrics, full countdown, announcement, two regions. Community packages are CS-P2-011.

**Phase.** A.

### CS-P1-018 Basic composition editor

**Description.** Select, reorder, hide, numeric move/resize, source assign. Preview only. Not Premiere.

**Status.** Partial. Looks pane on Presenter Desk; Production Desk Scenes/Sources docks edit the same looks (Photoshop front-on-top layer list). Add/rename/remove/duplicate layers. Duplicate saved look. Scene lock freezes all edits. Production Desk Add source → Create new / Add existing → Properties (camera device + mirror, scripture lookup, song section, text, timer, lower third, image); double-click or ⚙ reopens Properties. Look transition cut/fade; TAKE of a look uses that transition. Text heading/body fields. Scripture/lyrics have editable copy fields and can refill from the desk. Image layers can pick from the media library. Numeric opacity. Entrance/exit + shared duration and easing. Preview drag handles. Fit and lock (lock blocks drag and numeric bounds). Program has no handles. Exit is persisted; leave animation on hide is later.

**Phase.** A.

### CS-P1-019 Nearby: computers on one licence share files over the local network

**Description.** Computers on the same paid licence and network find each other over Bonjour (mDNS) and lend each other Media files before the cloud is asked. A video comes from the laptop next door in seconds, uses no cloud space, and still comes with the internet out. See `src-tauri/src/nearby.rs`.

**Status.** Partial (0.5.6). Shipped: discovery by licence tag, HMAC-signed requests, Media by id only, every announced address tried (church network, then a direct cable on 169.254, then the rest), sleeping computers rested for a minute, a day of clock skew allowed, offline and signed-out computers still fetch, and "On this network" in Settings › Cloud space. Not yet tested between two real computers (Mac and Windows) on a church network.

**Not covered yet (backlog, 2026-10-25):**

- [ ] **Records over the local network.** Only pictures, videos and audio go device to device; songs, services and slides still need the cloud, so with the internet out an edit reaches the other computer only when it comes back. Needs per-device clocks (hybrid logical clocks or version vectors), delete markers that outlive a month-long absence, and care with mixed app versions dropping unknown fields.
- [x] **"Why isn't my other computer showing?"** (done: a help note in Settings › Cloud space.) Settings says nothing when no computer is found. Explain the usual causes in plain words: guest Wi-Fi that hides devices from each other, Windows treating the network as Public, the Mac's local-network permission refused, a computer on another licence or on Free.
- [ ] **Windows network marked Public.** The firewall blocks incoming copies unless someone clicks Allow. Detect it and say how to set the network to Private, or ask once with a clear reason.
- [ ] **Mac local-network permission refused.** It quietly falls back to the cloud. Detect it and point to System Settings › Privacy & Security › Local Network.
- [ ] **Guest Wi-Fi client isolation.** Cannot be got through; say so (see the help line above) and suggest Ethernet or a direct cable.
- [ ] **A removed person keeps lending for up to three hours**, until their app next checks the plan. Stop Nearby as soon as the account says removed, or rotate the tag when members change.
- [ ] **Integrity beyond length.** A nearby copy is checked by its length only; check it against the cloud's hash when the cloud knows it.
- [ ] **Same file under two ids** (the cloud's aliases) is not matched nearby.
- [ ] **Tested for real:** Mac and Windows on one Wi-Fi; Ethernet through a switch; a cable straight between two computers; Thunderbolt Bridge between two Macs; one computer asleep; the internet unplugged.

**Not possible by design.** HDMI carries picture and sound one way to a screen, not data. USB A-to-A transfer cables need their own drivers and are not a network. A USB stick or drive carries the whole library as a `.churchstudio` file (Settings › Storage), by hand.

**Phase.** D.

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
| CS-P2-007 | Advanced composition animations | Beyond fade/slide/dissolve. Must not corrupt Program. |
| CS-P2-008 | Multiple camera layouts | Three-plus regions, camera switcher. Still Preview until LIVE. |
| CS-P2-009 | NDI composition sources | Native media source → `SourceRef` → layer. See ndi.md. |
| CS-P2-010 | Plugin composition sources | `registerSourceCompiler` only. No session. No Take. |
| CS-P2-011 | Community composition templates | Data packages, not executable looks. |
| CS-P2-012 | Advanced graphics | Lower-third motion, bugs, tickers. Still layers. |

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

## Status update — 2026-10-16

Built and verified in the browser build (Chrome, fake camera/microphone where needed). Items that also need a desktop or real-hardware run stay **Partial** until that run passes.

| ID | Now | Verified | Still needed |
| --- | --- | --- | --- |
| CS-P0-004 | Chromium opens the audience window on the second screen (Window Management); drag fallback | Stubbed screens | Real second monitor |
| CS-P0-005 | Settings → This computer explains every capability and why it is unavailable | Browser | — |
| CS-P1-004 | QR pairing with desk approval, hashed session tokens, per-phone revoke, Preview-only Next/Previous, timer controls | Same-origin pad | Real phone over Wi-Fi to the desktop app |
| CS-P1-005 / 011–013 | Live camera pixels on Preview, Program and audience; one feed per camera | Fake camera | Real camera; two physical cameras |
| CS-P1-006 | Video files (MP4/MOV/M4V/WebM): library, service items, scene sources; audience-only sound | Browser | Desktop playback through the asset protocol |
| CS-P1-010 | Theme files (.cstheme.json) with background picture | Browser | — |
| CS-P1-014 | Countdown/count-up/clock/target, position, red warning, pause/start/reset from desk, phone, voice | Browser | — |
| CS-P1-018 | Shared sources with Properties, text styling, drag reorder, exit animations, two-click remove | Browser | — |
| CS-P2-008 | Three- and four-camera templates | Browser | Camera switcher |
| CS-P3-001 | Stage display (live, next, clock, timer); opens on a third screen when there is one | Browser | Desktop window placement |
| — | Voice commands with wake word and Live voice commands switch | Fake recognizer | Desktop on-device recognizer with a real mic |
| — | External display: AppKit frame placement for the audience window | Unit tests | Dell / Retina run |

Not started (need outside services or SDKs): NDI (CS-P1-007/008, CS-P2-009), cloud remote and multi-operator (CS-P2-005/006), external song/scripture providers (CS-P2-003/004), plugin ecosystem and registry (CS-P1-009 runtime, CS-P2-001/002/010), recording and streaming (CS-P3-002).

## Parked — 2026-10-17

### CS-BIZ-001 Selling Premium through Paddle (parked by the owner)

Code is in place and tested with a fake network; nothing is live.

- Built: signed `CS1-` license keys checked offline (`src/lib/domain/license.ts`, `scripts/license.ts`), Buy buttons that open Paddle checkout (`CHECKOUT` in `src/lib/domain/plans.ts`, empty so they show "coming soon"), and the license server that emails a key after payment (`server/paddle.ts`, setup in `server/README.md`).
- To resume: Paddle sandbox account with Premium/Church monthly and yearly prices and hosted checkout links; Resend account and sending domain; deploy the Worker with its four secrets; one sandbox purchase end to end (confirm `user_email` prefills); then live.
- Open questions: real prices (placeholders $12 / $29), monthly vs yearly only (monthly emails a new key each month), whether to add online key refresh and seat limits later.

## Status update — 2026-10-17 (gap list)

Built and tested in the browser build or by unit tests; anything marked "needs a real run" has not met real hardware or a real account yet.

| Gap | Now | Needs a real run |
| --- | --- | --- |
| Modern translations | API.Bible with the church's key; text fetched when shown, copyright line, voice/search on bundled words | A real API.Bible key (response format, FUMS reporting) |
| Voice on older Macs and Windows | SFSpeechRecognizer on macOS 13–15; Windows built-in recognizer via PowerShell | A macOS 13–15 Mac; a Windows PC |
| PowerPoint | .pptx → editable deck (text, styles, pictures, shapes, backgrounds). No tables, charts, SmartArt | Real church decks |
| Service running order | Service page: sections, any item, Up next, next/previous item | — |
| Windows build | CI builds Windows, macOS and Linux on every push | First CI run after push |
| CCLI reporting | Songs live logged once per day; report and CSV | — |
| Two translations side by side | Second translation column with its own attribution | — |
| Announcement loops | Deck loops on Program every 8 s; Preview stays free | — |
| Controllers | Controller keys and GET links for Companion / Stream Deck | A real Companion setup |
| Stream output | /stream lower-third overlay for OBS / vMix Browser Source | OBS on the church computer |
| Video controls | Play/pause, restart, scrub, volume, fade; shared clock | Long videos on the audience screen |
| Stage display | Messages to the stage; Next / clock / notes / size | A real stage screen |
| Planning Center | Token connect, plans, import as a service with songs | A real Planning Center account |
| Problem reports | Local error and crash log; Save report | — |
| Backup / second computer | Folder backups every 30 min, restore latest | Two computers on a cloud drive |
| Auto-update | Signed updater, release workflow, Settings › Updates | First tagged release (add TAURI_SIGNING_PRIVATE_KEY secret) |

Not done: interface languages (needs choosing languages and translating every screen), bundled hymn texts (needs the files), payments (parked as CS-BIZ-001).

## Status update — 2026-10-27 (audit: ready for a real Sunday)

| Area | Now | Verified | Still needed |
| --- | --- | --- | --- |
| Rooms on church Wi-Fi | Joins, questions and renames are counted per room and network address (`CROWD`, 600 a minute) instead of 10 a minute per address across all rooms; a crowded phone waits and retries by itself; one question can take every person's vote | Unit tests (40 joins from one address, 120 votes) | Deploy the Worker with the new `CROWD` rate limit binding |
| Names on the screen | Join and rename refuse names with the hidden words (real names such as Dick still pass); server errors reach the phone in its language | Unit tests | — |
| Desk honesty | The Audience panel says when the room cannot be reached while it polls; closing a room offline keeps it open and says so, instead of leaving it live with no host | svelte-check | A real offline run |
| TV / browser displays | A dropped connection keeps the picture; a small "Reconnecting…" shows after 10 s; retries back off to 5 s with jitter | Browser: 14 s outage held the verse, badge appeared, the next verse showed within 7 s of the network returning | A stale picture when the desk dies but the server answers (needs `screen.at` exposed) |
| Slideshow | Stops the moment anything else goes LIVE (title, clock, countdown and music with it), not at its next change | svelte-check | Desktop run (Pictures needs the desktop app) |
| Video from a link | A link straight to a video file or an HLS stream (.m3u8) is a real video item, in Add sources and in scene sources, through display/stream.ts | Unit tests | A real HLS stream on the audience screen; media-src in the `hardening/csp` branch |
| Paste an order of service | Service page › Paste (and the empty Service page): parts, leaders, times, library songs, readings and announcements, reviewed before it is kept; songs not in the library are listed, never made up | Unit tests; browser: 8 parts, 2 songs, 2 readings, Preview and Program untouched | An optional AI pass for messy notes |

Found and left as designed: answers during the reading time count as the quickest (tested, phones hide the buttons); "Screen follows the game" takes Program because the operator pressed Play with it on.

## Status update — 2026-10-27 (round 2: everything the audit found, built at core)

| Area | Now | Verified | Still needed |
| --- | --- | --- | --- |
| Listening confidence | Every verse found is rated (voice/confidence.ts, fitted to voice/confidence-corpus.ts by scripts/fit-confidence.ts): sure / likely / maybe. Maybe waits under Detections and changes nothing; Autopilot takes only sure verses live. Fixed at the source: impossible verses, counting and amounts read as references; a looser sound-alike book only when "chapter"/"verse" is said | 128-line corpus: sure 46 right, 0 wrong; wrong finds 13 → 4 | Real service recordings into the corpus, then fit again |
| Load watch | CPU and memory every 5 s; sustained thresholds with hysteresis; alerts name the cause and offer lighter listening, still backgrounds, the task manager, restart (never while showing); live meters and thresholds in Settings › Performance | Unit tests; Rust reading tested on the Mac | A real overloaded Windows PC |
| Audience | Questions held for approval by default; private prayer requests; reactions (Preview only through Take); a count on the Audience button | Server tests, curl on the local server | Real phones; Worker deploy |
| TV / browser screens | Says "The church computer is not sending" after 30 s without a heartbeat (internet and Wi-Fi); video over Wi-Fi streams with Range/206, HEAD, caching, no size cap | Rust socket tests | A real iPhone / Apple TV / smart TV |
| Phone remote | Preview only or full control per phone; controller keys expire; rate limits on desk, relay and Wi-Fi server | Unit tests | A real phone and Companion |
| Media | Live streams recover from dropped connections; the desk is told when a video plays muted; BMP everywhere; Pictures thumbnails, search and Favourites; slideshow leaves Preview alone | Unit and Rust tests | Long streams on the audience screen |
| Service | Items carry who brings them, minutes and desk notes | Browser: saved, shown, kept after reload; Preview untouched | — |
| Songs / AI | Suggestions reach the whole library (most relevant 800); a staged song stays staged when a sung song goes live | Unit tests | — |

Left as decided: "Live on click" stays on by default while a service runs (owner's call); HEIC is not accepted (Windows cannot show it).
Not started, each a project of its own: NDI in and out (Vizrt SDK licence), recording and streaming, several operators on one service, cloud remote control.
