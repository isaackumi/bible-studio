# PewBeam analysis

Installed build: **Pewbeam 2.6.14** (`com.pewbeam.app`) at `/Applications/PewBeam.app`.
Public docs reviewed: [pewbeam.com/docs](https://pewbeam.com/docs) (current as of this investigation).

This is a black-box product study. No binary was decompiled, no proprietary source was extracted, and no PewBeam configuration was modified. Evidence is the installed bundle’s public metadata, resource filenames, the user’s own settings *keys*, and PewBeam’s published documentation.

## What the product actually is

PewBeam is not a slide presenter and not a production switcher. It is a **live scripture agent**.

It listens to a sermon, transcribes speech, detects quoted or paraphrased verses, and puts the chosen verse on a broadcast output (in-app preview, HDMI window, or NDI). Lyrics, service rundowns, cameras, and recording are outside the product. The intended pairing, visible in the docs and in this machine’s OBS install (DistroAV / NDI plus a PTZ plugin), is **PewBeam for scripture, something else for the rest of the service, OBS for the program feed**.

That split is the main product gap this project can close.

## Local technical facts (metadata only)

| Fact | Evidence |
| --- | --- |
| Native arm64 Mach-O, about 66 MB executable, 204 MB app | `file`, `du` |
| Linked to AppKit, Metal, WebKit, AVFoundation, CoreAudio, CoreMIDI, CoreML | `otool -L` |
| NDI SDK headers and libraries vendored for macOS and Windows | `Contents/Resources/_up_/vendor/ndi` |
| Six bundled English translations: KJV, NKJV, NIV, NLT, ESV, NASB | folder names under `BibleTranslations/` |
| Each translation is a SQL table plus per-book JSON | filenames only; verse text was not copied |
| SQL shape is `book_id, book, chapter, verse, text` | KJV `CREATE TABLE` only |
| Embeddings pack installed locally, about 349 MB | user’s `state.json` size field, not the vectors |
| Fonts shipped: Inter, Figtree, General Sans, DejaVu Sans | filenames |
| License and auth files exist on disk | paths only; contents not read |

The bundled NIV, NKJV, NLT, ESV, and NASB texts are copyrighted. This project must not copy them. KJV is public domain and is a legitimate offline seed. Additional translations belong behind an importer the user fills with texts they have rights to use.

## Workspace

The dashboard is six panels, not a library/canvas/inspector studio:

| Panel | Role |
| --- | --- |
| Live Transcript | What the microphone just heard |
| Preview | How the verse will look before it is broadcast |
| Live Output | What is on the program feed now |
| Queue | Verses waiting |
| Scripture Search | Manual lookup |
| AI Detections | Automatic matches from the sermon |

Preview and Live sit side by side. **Go Live** (`L`) either locks them together or lets the operator stage a verse without changing the audience. That is a real preview/program idea, scoped to a single verse card rather than a full scene.

Broadcast settings live in a separate panel: output channel, theme per channel, HDMI vs NDI, resolution, frame rate, alpha. HDMI refuses the primary display so the operator UI cannot be covered by accident. Paid plans allow up to four channels, each with its own theme.

## Bible workflow

Two search modes, toggled with Tab:

- **Book mode** parses references (`John 3:16`, `Ps 23`, spoken forms) and browses a chapter. Number keys jump to a verse.
- **Context mode** searches by meaning (“what does Jesus say about worry”), using the same embedding index as live detection.

Enter sends the selection to Preview. A double Enter also turns Go Live on. Plus adds the verse to the queue.

Detection has two public strategies:

1. Direct reference matching for spoken citations. Docs describe this as near-instant.
2. Semantic search over 31,000+ verses for quotes and paraphrases. Docs describe a few hundred milliseconds, with a cache for repeats.

Each hit shows reference, text, confidence, source badge (direct, semantic, or both), and time. Low-confidence hits are hidden. **Auto** display pushes high-confidence hits on air after a cooldown. **Manual** display never touches program until the operator sends it. Manual is the Sunday mode; Auto is the rehearsal mode.

Primary translation is a single setting and applies immediately to search and display.

## What is good

- Scripture is the whole job, so the UI never hides the verse.
- Preview and Live are visually separate, with one key to couple them.
- Manual vs Auto is the right trust model for a live service.
- Queue lets a producer preload an outline before the sermon.
- Context search solves “I know the phrase, not the reference.”
- NDI with alpha means the verse can be a lower third inside OBS instead of a second full-screen look.
- Themes are a real design surface: verse, reference, and translation are separate elements; background, layout mode, and lower-third samples exist; themes export as JSON.
- Bible data and manual display keep working when transcription does not.
- HDMI identify-monitors and “never cover the primary display” are operator-safe defaults.

## What is frustrating

- It does not run a service. No lyrics, announcements, media rundown, or section clock.
- The operator still needs FreeShow or ProPresenter plus OBS. Three apps, three failure points.
- Keyboard coverage is thin: Tab, L, Enter, digits, Escape. No next/previous, clear, black, or logo keys in the published shortcut list.
- Published OSC (`/pew/next`, `/pew/prev`, `/pew/show`, `/pew/hide`) and the matching HTTP commands are documented as recognized but not fully wired to presentation state. The API is not yet a remote.
- Online transcription (Deepgram) is the default. Offline Whisper exists only on Apple Silicon and only on paid plans. A church with bad wifi loses detection, not the Bible.
- Sermon-notes generation sends transcript text to a cloud model. That fights an offline-first, privacy-sensitive service.
- Free tier watermarks the congregation-facing output.
- Six bundled modern translations create a licensing problem for any open-source successor that tried to mirror the bundle.
- 8 GB is the published recommended RAM, and this machine has exactly 8 GB. A local embedding server plus Whisper plus OBS is a tight fit. The docs tell users to close other heavy apps.

## What a church operator expects

- Detection as a **suggestion**, never as the thing that takes program by itself during a Sunday service.
- A verse on screen in one keystroke from a reference, including ranges and “next verse.”
- The same verse restyled per output: full frame on the projector, lower third on the stream, reference-plus-next on the stage display.
- A translation they are allowed to project, with attribution.
- The scripture moment to sit inside the service order, not in a second application.

## What we should take, and how to do it differently

| Idea | Keep | Do differently |
| --- | --- | --- |
| Preview beside program | Yes | Apply it to every service item, not only a verse card |
| Go Live coupling | Yes | Default to **uncoupled** during a service so a mis-click cannot change program. One key takes preview to program |
| Manual vs Auto | Yes | Auto is off in the first releases. Suggestions may appear later; they never cut program |
| Reference search | Yes | Local parser, keyboard-first, ranges, comparison, recent, favorites |
| Context search | Later | Optional local index. Not required to present |
| Live listening | Much later, optional | A plugin. The app must be fully useful with the microphone off |
| Theme JSON | Yes | One theme drives verse, lyric, title, and lower third, and can be exported |
| NDI / HDMI outputs | HDMI window first, NDI later | Do not vendor a proprietary NDI SDK in the first build |
| Queue | Fold into the service rundown | The rundown is the queue. A scratch pad can still hold verses found during the sermon |

Proprietary detection thresholds, model files, and theme assets stay in PewBeam. We rebuild the interaction, not the implementation.
