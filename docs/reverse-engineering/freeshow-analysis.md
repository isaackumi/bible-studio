# FreeShow analysis

Installed build: **FreeShow 1.5.5** (`app.freeshow`) at `/Applications/FreeShow.app`.
Upstream: [ChurchApps/FreeShow](https://github.com/ChurchApps/FreeShow), GPL-3.0. Electron + Svelte + TypeScript.
Docs: [freeshow.app/docs](https://freeshow.app/docs), including the scripture guide.

The installed app is Electron (`Electron Framework.framework`, `app.asar` about 132 MB). The public repository is the authoritative source, so the asar was not unpacked. Upstream has moved past 1.5.5 (1.5.7 added timeline, overlay actions, and locked slide groups; 1.6.x added RTMP output, NDI sending, tables, and richer audio effects). This note separates **what is on this Mac** from **where the project is going**.

## What the product is

FreeShow is a church presenter: shows, scripture, media, templates, overlays, audio, a project list, and extra windows or web pages for audience, stage, and remote. It is the closest existing open-source match to “run Sunday from one app.” It is not a vision mixer. Output is “show this slide on these screens,” not OBS studio mode.

Local settings confirm the operator surface on this machine:

- Drawer tabs enabled: shows, media, scripture, templates, overlays, audio, calendar, functions.
- Left and right panels about 290 px, drawer height 300 px. The UI is a three-band layout, not a single canvas.
- One output named as the default, style-driven, not locked.
- Remote port 5510 and stage port 5511, both servers enabled, max 10 connections.
- Media folders for pictures, videos, and music under the home directory.
- Text transition fade 500 ms, media fade 800 ms.
- Optimized mode on. Hardware acceleration not disabled.
- Content-provider hooks present for Planning Center and ChurchApps. Sync is optional.

## Architecture (public source)

The split that matters:

| Layer | Responsibility |
| --- | --- |
| Svelte operator UI | Drawers, project, slide editor, scripture browser |
| Show model | A show has layouts of slides. A slide has a group, notes, items, and optional timeline. Items are text, media, or special types |
| Scripture | Separate from shows until the operator clicks “new show” or sends verses to output. v1.5 scripture templates use dynamic values (reference, text, translation) so one template styles the parts differently |
| Output windows | Electron windows positioned with `OutputBounds`. Each output has its own style. Stage is a different layout, also served on the LAN |
| Action API | A large action map (`start_rtmp_stream`, `toggle_output`, `change_stage_output_layout`, audio transport, and many more) invoked from the UI and from the remote/API path via IPC |
| Persistence | JSON files in Application Support: `projects.json`, `settings.json`, `media.json`, `templates.json`, `history.json` |

A slide item can carry scripture-specific dynamic values. Output state (`OutSlide`) tracks layout, index, next/previous slides, line reveal, PDF page, and translation count. That is a presenter model: **the current slide is the program**. There is no separate preview bus that must be taken.

Known upstream pain, from their own fixes, is worth designing against:

- Output updates used to serialize the whole output store and flood IPC. They debounced and stopped comparing by `JSON.stringify`.
- Stage views leaked timers across layout changes.
- Rapid slide changes could apply a stale transition chain.
- Thumbnail paths and single-output edge cases have been recurring macOS bugs.

A long Sunday service is limited by how often the output window re-renders, not by how nice the editor is.

## Workflows

**Content.** A show is lyrics, scripture, or slides. Songs can be typed, pasted as structured text (verse/chorus labels), or searched. Groups (verse, chorus, bridge) are first-class and can be reordered per layout. Chords can sit in the text. Scripture search accepts `John 1:1-4` and `Genesis 1:1-2+5`. Selected verses go to output with Enter, or become a normal show. API.Bible supplies many translations when online; Zefania, OSIS, Beblia, and OpenSong XML import for offline. The project says users must have rights to the text.

**Live.** The operator picks a project, clicks or arrows through slides, and the enabled outputs update. Clear layers independently (background, slide, overlays, audio). Edit mode can retype a line during the service. Overlays (logo, lower third) lock so the next slide does not remove them.

**Outputs.** Several outputs at once, each with a style: room, stream, stage. Stage is a browser page on port 5511 with current/next text, notes, and timers. A phone remote uses port 5510. This is the right multi-display idea, implemented as windows plus a small web server.

**Planning.** A project is an ordered list of shows and media. Calendar and Planning Center can feed that list. It is a rundown, but sections (worship, sermon, offering) are not a strong concept; the operator sees a flat project.

## What is good

- One mental model: project, show, slide, output. Volunteers can learn it.
- Scripture is fast when you know the reference, and the template system styles reference and text separately.
- Offline XML Bibles respect licensing better than a hardcoded commercial bundle.
- Stage display and LAN remote are built in, not plugins.
- Templates, themes, and overlays give a house style without a design tool as complicated as a motion app.
- The action list is already an automation surface (Stream Deck, remote, companion apps).
- JSON projects are inspectable and backup-friendly.
- GPL code can be studied. We should still write original code rather than fork the UI.

## What is frustrating

- Drawer sprawl. Eight tabs (shows, media, scripture, templates, overlays, audio, calendar, functions) compete for the same left column. During a service the operator hunts.
- No studio-mode safety. The slide you select is what the room sees, unless you are careful with output locking. PewBeam’s Preview vs Live is safer.
- The project list is not a service. There is no “we are in Worship, Sermon is next” progress for the stage or the operator.
- Bible is a drawer, not a workspace. Parallel translations, comparison, and a reading layout are weaker than a Bible-first tool.
- Output is a webview. Text and images look good. Long-running video, alpha overlays, and frame-accurate transitions are not OBS.
- Settings and feature surface area have grown faster than the live-mode UI. Optimized mode exists because the full UI is heavy.
- This Mac is on 1.5.5 while upstream has already added streaming and NDI. Depending on FreeShow for production features means living on their release train.

## What we should take, and how to do it differently

| Idea | Keep | Do differently |
| --- | --- | --- |
| Project of shows | Yes, as a **service** with named sections | Sections are the navigation, not a flat list of files |
| Slide items + templates | Yes | A theme is the default look. Per-slide overrides are the exception |
| Dynamic scripture values | Yes | Reference, verses, translation, and attribution are structured fields, never one mashed string |
| XML/OSIS/USFM import | Yes | Importers are the only way commercial texts enter. Ship KJV only |
| Independent clear layers | Yes | Clear, black, and logo are keys, visible in live mode, not buried in a menu |
| Stage page on the LAN | Yes, after the desktop output is solid | Same render model as the audience, different layout |
| Action API | Design the commands now, serve them later | Small stable set: next, previous, clear, go, scripture, section |
| JSON documents | Yes for projects and themes | SQLite for Bible and search. Do not put the whole Bible in a JSON file the UI reparses |

Do not fork FreeShow. The data model and the drawer IA are the things we would be stuck maintaining, and both are what we intend to improve.
