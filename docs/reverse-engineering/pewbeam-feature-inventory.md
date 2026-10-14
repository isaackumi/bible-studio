# PewBeam feature inventory

Date: 14 October 2026. Target: Pewbeam 2.6.14 (`com.pewbeam.app`) at `/Applications/Pewbeam.app`. Bundle version `20261004.063724`. Signed by Developer ID Application: Pewbeam Inc (5VL25VW7J2), notarized, hardened runtime. Thin arm64 Mach-O, about 63 MB executable, about 204 MB bundle.

Confidence labels:

- **Confirmed:** observed on this machine in this session.
- **Documented:** stated in the public docs at https://pewbeam.com/docs on this date, and not contradicted by the bundle or menus.
- **Unknown:** not visible from the menu bar, the bundle, or the public docs.

PewBeam was already running as one process. FreeShow 1.5.5 (`app.freeshow`, Electron) and OBS Studio 32.0.1 (`com.obsproject.obs-studio`) are installed at the versions named in the request.

## What the application is

**Confirmed.** PewBeam is a native macOS scripture display app, not Electron, Tauri, or Qt. It links AppKit, WebKit, Metal, AVFoundation, CoreAudio, AudioToolbox, OpenAL, CoreMIDI, CoreML, and CoreGraphics. The operator window does not expose its inner controls to accessibility, which fits a custom or WebKit surface inside one AppKit window.

**Documented.** It listens to a sermon, transcribes speech, detects a quoted or spoken reference, and puts a verse on a preview and a broadcast output (in-app, HDMI window, or NDI). It is not a song presenter, service rundown, or video switcher. Those absences match the menus: there is no Songs, Service, Media library, or Scenes menu.

**Confirmed storage.**

| Location | What is there |
| --- | --- |
| `Contents/Resources/_up_/BibleTranslations/{KJV,NKJV,NIV,NLT,ESV,NASB}` | 66 book JSON files plus a SQL script and a JSON file per translation |
| `Contents/Resources/_up_/vendor/ndi` | NDI headers and `libndi.dylib`; Windows NDI DLL is also in the Mac bundle |
| `Contents/Resources/_up_/resources/fonts` | Inter Variable, Figtree Variable, General Sans, DejaVu Sans, plus OFL notices |
| `Contents/Resources/_up_/resources/watermark.png` | A bundled watermark image. Behavior on screen was not observed. |
| `Contents/Resources/_up_/resources/backgrounds/` | One JPEG. A README names a second Selah JPEG that is not in this build. |
| `~/Library/Application Support/com.pewbeam.app/resources/embeddings` | About 333 MB: vectors, maps, ONNX model files, metadata |
| `~/Library/Application Support/com.pewbeam.app/resources/state.json` | Schema version and an embeddings pack record |
| `~/Library/Application Support/com.pewbeam.app/translation_settings.json` | One key, `primary_translation` |
| `~/Library/Application Support/com.pewbeam.app/backgrounds/` | One user copy of the bundled JPEG |
| `~/Library/Application Support/Pewbeam/font-cache.json` | 409 font families |
| `~/Library/Application Support/Pewbeam/auth/` and `license/` | Present. Contents were not read. |
| `~/Library/Preferences/com.pewbeam.app.plist` | Not present |

No `CFBundleURLTypes` or login item was read from the plist beyond the usage strings for the microphone and speech recognition.

## Process and windows

**Confirmed.** One process. No child PewBeam process was in the process list. The menu bar is: Pewbeam, File, Edit, View, Audio, Window, Help.

**Confirmed window split, as menu commands only.** File contains New Presentation Window, Close Presentation Window, Open HDMI Preview, and Close HDMI Preview. Whether those are separate from the operator window was not observed, because HDMI preview was not opened.

**Documented.** Preview and Live Output sit side by side in the operator window. HDMI opens a borderless window on a non-primary display. NDI is a network source named “Pewbeam main” or “Pewbeam alternate”.

## A. Accounts, authentication, and licensing

| Workflow | Entry | What is known | Offline | Remote |
| --- | --- | --- | --- | --- |
| Sign-in, account creation, password recovery, profile | Not in the menu bar | **Unknown** as a screen. Docs describe a license key, not an account form. | Unknown | Unknown |
| Plan display | Settings > License, **documented** | Free, Plus, Core, with a badge | The badge may be cached. Not tested. | Activation is remote if a key is entered. Not tested. |
| License key, deactivate, device fingerprint | Settings > License, **documented**. A `license/` directory and `device_fingerprint` file exist, **confirmed** by path only. | Fingerprint file is 64 bytes. Value not read. | Unknown | Unknown |
| Checkout, card entry, invoices, cancel, renewal | Not in the menu bar | **Unknown.** Public pricing is Free, Plus $14/month, Core $30/month. The payment provider was not identified. No payment was started. | n/a | Would be remote. Not observed. |
| Entitlements | **Documented** pricing table | Free: Selah and Eden, one custom theme, watermark, main output only, 40 minutes/week transcription for the first two weeks, 200 context searches/month. Plus and Core: more themes, no watermark, more outputs, notes, offline transcription on Apple silicon. Core adds 3 machines and priority support. | Manual Bible search is documented to keep working when transcription is blocked. | Transcription and sermon notes are remote on the free and online paths. |
| Sign-out, device management, church profile | Not in the menus | **Unknown** | | |

Auth files exist and were not opened. Nothing in this session establishes whether the running copy is on Free, Plus, or Core.

## B. Theme editor

**Confirmed.** View > Open Theme Designer is a menu item. View > Toggle Theme switches the operator between dark and light. That is the app chrome, not the verse theme. Bundled fonts and one background image exist. A user backgrounds folder exists. A font cache of 409 families exists, which matches a system-font picker having run at least once.

**Documented, not clicked through.**

- Built-in names: Selah, Eden, Lower Third Sample, Lower Third Sample 2. Built-ins are duplicated before editing. Free plan: Selah, Eden, and one custom theme.
- Designer regions: theme library, 1920×1080 canvas, properties.
- Library actions: New, Import, Export All, search, filter All/Pinned/Custom. Card actions: Edit, Set as Default, Assign to Main Output, Assign to Alternate Output, Pin, Rename (24 characters), Duplicate, Export, Delete. Built-ins are not deleted.
- Text (verse, reference, or translation): font, 9 weights, size 8–200, line height 0.5–3, letter spacing -20–50, color and opacity, horizontal and vertical alignment, transform, decoration, up to 5 shadows, stroke.
- Background: solid, linear/radial/conic gradient, or image (cover/contain/fill, position, scale 10–500%, blur, opacity, tint).
- Layout: content and text area percentages, padding, spacing, vertical / horizontal / subtitle modes, reference above or below, verse-number superscript.
- Save commits a draft and makes it active. Discard reverts. Export is JSON, one theme or all custom themes. Import adds a custom theme.
- A theme can be chosen per output channel. Whether a change restyles a verse already on the live output was not observed.

There is no separate per-song or per-slide theme in the docs. The theme is the verse card.

The Selah JPEG named in the bundle README is not in this build. Whether Selah still displays an image is **unknown**.

## C. Template editor and slide composition

**Unknown as a separate product surface.** Menus and the public docs do not mention templates, placeholders, or a slide editor. The theme designer is the composition tool, and it composes three text elements (verse, reference, translation) plus a background. That is not a general slide template.

No song title, verse, chorus, or author fields were found.

## D. Watermarks, logos, branding, and overlays

**Confirmed.** `watermark.png` is in the bundle.

**Documented.** On the free plan a “Pewbeam” watermark sits at the bottom right of preview and live output. Plus and Core remove it. This session did not show the output, so the watermark was not seen, and the current plan is unknown.

**Documented overlays.** Lower-third themes and NDI alpha are the overlay mechanism. There is no separate logo slot, per-slide watermark toggle, or church-logo setting in the docs or menus.

**Unknown.** Opacity and position controls for the watermark itself. The docs describe it as fixed.

## E. Bible engine

**Confirmed on disk.** Six English translations, each with 66 book files: KJV, NKJV, NIV, NLT, ESV, NASB. The KJV script starts with `create table kjv(book_id, book, chapter, verse, text, primary key (book_id, …))`. Verse text was not copied. The files are SQL scripts, not SQLite databases. Copyrighted translation text stays in the app bundle.

**Confirmed in the menu.** View > Bible Translation lists those six abbreviations.

**Documented.**

- Primary translation applies immediately to search and display. The local file has the key `primary_translation`. The selected value was not recorded.
- Book mode parses references and browses a chapter. Number keys jump to a verse. Tab switches to context mode.
- Context mode is semantic search over the same embedding index as detection. Free plan: 200 context searches a month.
- Enter sends the selection to Preview. A double Enter also turns Go Live on. Plus adds the verse to the queue.
- Paid Bible store and language packs (Spanish, French, Hausa, Igbo, Yoruba are named as examples that depend on a manifest). Not present as extra folders in this bundle. **Confirmed** only the six English packs are installed in the app.
- Missing-translation behavior was not observed.

Search performance numbers in the docs (under 5 ms for a direct reference, 200–400 ms for a new semantic query) were not measured here.

## F. Songs, lyrics, and media library

**Not found.** No song editor, section types, song search, or media library in the menus or the public docs.

Images exist only as theme backgrounds. One user background JPEG is stored. Video and audio library items were not found. Audio in this app is the microphone used for transcription (Audio menu: Start Recognition, Stop Recognition), not playback of tracks.

## G. Service planning and live operation

**Documented dashboard.** Six panels: Live Transcript, Preview, Live Output, Queue, Scripture Search, AI Detections.

**Documented live rules.**

- Selecting a verse goes to Preview.
- Go Live (`L`) on: Preview copies to the broadcast. Go Live off: Preview can change without changing the audience. Turning Go Live on pushes the current preview.
- Auto mode can put a high-confidence detection on the broadcast after a cooldown. Manual mode does not.
- Queue: play, remove, clear all. High-confidence verses can auto-queue in Auto mode.
- There is no service order, no reorder of a rundown, and no undo of a live take beyond changing the verse again. Edit > Undo and Redo are standard text commands, **confirmed** as menu items, not tested against a verse.

**Confirmed and not exercised.** File > Open HDMI Preview / Close HDMI Preview. Audio > Start Recognition / Stop Recognition. Recognition was not started.

**Not tested on this machine.** Whether a click in search changes the HDMI window. Whether restart restores Preview, Live, or both. Display reconnect. The public docs say manual search keeps working when transcription does not, and that HDMI refuses the primary display.

**Documented shortcuts.** Tab, L, Enter, double Enter, 0–9, Escape. No Clear, Black, Logo, or next/previous item shortcut in that table. OSC `/pew/next` and `/pew/prev` are documented as recognized and not fully wired.

## H. Workspaces and operator customization

**Confirmed.** View > Toggle Theme (dark/light) and View > Fullscreen / Enter Full Screen. Standard Window menu: Minimize, Zoom, Bring All to Front. No dock, panel-visibility, or saved-layout menu.

**Documented.** Light and dark appearance is a setting and is remembered. Microphone and gain are remembered. There is no workspace preset system. Panel arrangement is the fixed six-panel dashboard.

**Unknown.** Whether dark mode survives a restart on this machine. It was not toggled, so the user’s current appearance was left as found.

## I. Additional functionality

| Feature | Evidence | Status |
| --- | --- | --- |
| Online transcription, Deepgram Nova-3 | Documented. Microphone usage string is in the plist, **confirmed**. | Not started |
| Offline MLX-Whisper, Apple silicon, Plus/Core | Documented. This Mac is arm64, **confirmed**. Plan unknown. | Not started |
| Input gain 0–100, level meter, 10-minute idle pause | Documented | Not observed |
| Voice commands for translation and verse navigation | Documented | Not observed |
| Sermon notes via a cloud model, PDF/DOCX/Markdown | Documented. Docs name OpenAI as the notes processor. | Not used |
| Transcript history, local, paged, bulk delete and export | Documented | No transcript files were inventoried. A dedicated history directory was not in the two support folders that were listed. **Unknown** where history is stored until a session exists. |
| NDI send, alpha, 720p/1080p/4K, 24/30/60 fps | `libndi.dylib` **confirmed**. Behavior documented. | Not enabled |
| Up to 4 output channels on paid plans, per-channel theme | Documented | Not observed |
| OSC UDP 8000 and HTTP port 8080 | Documented. Not checked for a listening socket in this session. | Unknown whether they are open while the app is idle |
| Identify Monitors | Documented | Not used |
| Updates: Check for Updates menu, **confirmed**. Automatic check documented. | Menu only | Not run |
| Help: Documentation, Report Issue, About | **Confirmed** menu | Not opened |
| Tutorials, diagnostic export, analytics opt-in | Documented under Settings > Help | Not opened |
| Spout, Syphon, keyfill | Named in the documented OSC mode list | Not seen in the Mac menus. Treat as incomplete or unused on this build until a broadcast panel is visible. |
| Stage display, announcements, timers, song lyrics, cameras, recording, streaming ingest | Not in menus or docs | Not part of this product |
| Localization of the operator UI | English plist and English menus, **confirmed** | Other UI languages unknown |
| First-launch tutorial | Documented. `.setup_complete` exists in Application Support, **confirmed** by filename. | The tutorial was not replayed |

## Startup and offline

**Documented.** First launch sets up an embedding server and translations. Bible search and verse display work offline. Online transcription and sermon notes do not. Offline Whisper needs Apple silicon and a paid plan.

**Confirmed.** An embeddings pack is already installed (about 333 MB). Six translations are inside the bundle, so they do not require a download for first use. This session did not restart the app, disconnect the network, or sign out.

## Data flow that was actually seen

| Action | Local change observed |
| --- | --- |
| None intentional, except bringing the app forward and clicking the Settings menu | No new file was identified. Settings did not open a second accessibility window. |
| Prior use, already on disk | Embeddings pack record, font cache, primary-translation file, one background image, auth and license files |

Network traffic during this session was not captured. Docs say online transcription streams audio to Deepgram and sermon notes send transcript text to OpenAI. Those paths were not used.
