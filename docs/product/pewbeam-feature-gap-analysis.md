# PewBeam feature gap analysis

Date: 14 October 2026. PewBeam findings are in `docs/reverse-engineering/pewbeam-feature-inventory.md`. Church Studio claims below come from the current repository, not from a planned screen.

Status words: implemented and verified, partially implemented, UI only, not implemented, platform limited, blocked or unverified.

PewBeam is a scripture agent. Church Studio is a service presentation app. Matching PewBeam does not mean removing songs, services, or the preview/program split Church Studio already has. Several PewBeam behaviors, especially Auto mode, would violate Church Studio’s rule that only Take, Cut, Clear, Black, and Logo change Program.

## Gap table

| PewBeam feature | Status in Church Studio | Notes |
| --- | --- | --- |
| Preview separate from live output | Implemented and verified | `setPreview` does not change program. Tests in `src/lib/domain/live.test.ts`. |
| Explicit take to program | Implemented and verified | Take and Cut. Go Live as a sticky “every selection is live” mode is not implemented, and should stay off. |
| Clear / black / logo | Implemented and verified | PewBeam’s public shortcut list does not include these. Church Studio does. |
| Operator versus audience window | Partially implemented | Desktop audience webview and browser `/?display=1` exist. A second physical display was not verified. HDMI “never cover the primary display” is the desktop assignment rule when a display is assigned; the fallback when assignment is empty is documented in the display code. |
| Second operator cannot silently own program | Implemented and verified | Browser session id and generation. Desktop second process is not locked. |
| Startup does not replay a stored frame | Implemented and verified | The owning session publishes an empty program before restoring the preview cursor. |
| Six-panel scripture dashboard | UI only | Pew desk is a visual layout inspired by the public screenshots. It is not transcript, detections, and queue. |
| Live transcription | Not implemented | No microphone capture, Deepgram, or Whisper. |
| Direct reference detection from speech | Not implemented | Typed reference parsing exists. Speech does not. |
| Semantic / context search | Not implemented | Embeddings are not in the app. Settings “Ask” is a hint only. |
| Auto display of detections | Not implemented | Leave it unimplemented. It changes program without an operator action. |
| Manual display mode | Implemented and verified | Selection stays on preview until Take or Cut. |
| Verse queue | Partially implemented | A service rundown can hold passages. There is no scratch queue beside the rundown. |
| Book search and chapter browse | Partially implemented | Reference parse and passage insert exist for KJV. Number-key verse jump was not a PewBeam-style chapter browser in the verified tests. |
| Verse ranges | Partially implemented | `BibleItem` has `startVerse` and `endVerse`. Cross-chapter behavior needs a specific test before it is called complete. |
| Six bundled translations | Not implemented | KJV only, on purpose. NIV, NKJV, NLT, ESV, and NASB are copyrighted and must not be copied out of PewBeam. |
| Translation download store | Not implemented | |
| Primary translation applies everywhere | Partially implemented | One KJV catalog. No switcher. |
| Theme object for a verse card | Partially implemented | `Theme` has background color or image, one font, size, color, alignment, margin, reference, attribution, cut/fade. |
| Theme designer described in the PewBeam docs | Not implemented | No canvas, gradients, per-element shadows, stroke, layout modes, or lower third. |
| Duplicate, rename, import, export themes | Partially implemented | Library import/export includes themes by id. No theme-only designer actions. Built-in protection is not a PewBeam theme library. |
| Per-output theme | Not implemented | One theme for preview and program. |
| Dark/light operator chrome | Implemented and verified | Appearance setting. This is separate from the verse theme. |
| Lower third / alpha output | Not implemented | |
| NDI | Not implemented | `canUse("ndi")` is false. |
| HDMI / audience window | Partially implemented | See operator versus audience. NDI alpha and multi-channel are absent. |
| Up to four output channels | Not implemented | |
| Watermark tied to a free plan | Not implemented | A church logo action exists. It is not a vendor watermark and it is not plan-gated. |
| Church logo | Partially implemented | Logo text and a logo program action. Image logo uses the desktop media path. Browser media is not stored yet. |
| Template editor distinct from themes | Blocked or unverified | PewBeam does not show one. Church Studio slides are a different, simpler text-and-image item. |
| Songs, sections, search | Partially implemented | Model and panes exist. This is ahead of PewBeam, which has no songs. Import, duplicate detection, and tags are thin. |
| Media library | Platform limited | Desktop copies png/jpg/jpeg/webp/gif into app data. Browser import still calls Tauri. |
| Service plan | Partially implemented | Sections and items, save, reopen. Grouping and reuse are basic. |
| Stage display | UI only | A profile can remember a stage screen. `canUse("stage-display")` is false and the window stays closed. PewBeam has no stage display. |
| Saved workspaces / docks | Partially implemented | Layout document and tests exist. The mounted desks are Pew and OBS, not the dock host. |
| Keyboard shortcuts | Partially implemented | Commands exist and are listed. Remapping is described as later. PewBeam’s Tab/L/digit set is a different product. |
| OSC / HTTP remote | Not implemented | |
| Sermon notes and transcript history | Not implemented | |
| Accounts, license keys, checkout | UI only | Settings Account and License explain that no account is required. `canUse()` is a local set, not a license. |
| Diagnostics and auto-update | UI only | Updates section is a shell. |
| Offline Bible | Implemented and verified | KJV is bundled and works in the browser without Tauri. |
| Offline library | Platform limited | Desktop SQLite. Browser IndexedDB for songs, services, and themes. |

## Important gaps, with an independent design

### 1. Verse card that reads on a projector

**Problem.** An operator can put a passage on preview and take it, but cannot yet build the lower-third and full-frame looks PewBeam treats as ordinary themes.

**Workflow.** Duplicate the current theme, edit type size, colors, alignment, background color or image, and reference visibility, see the change on preview only, then Take.

**Data.** Extend `Theme` only when a control is real: gradient stops, image fit, and a layout mode (`frame` or `lower-third`). Keep the id. Do not import PewBeam theme JSON.

**Domain.** `presentScripture` already takes a theme. Program updates only through the existing actions.

**UI.** A theme editor on the existing theme library. States: clean, dirty, save failed, image missing.

**Desktop.** Background files stay in the media directory. **Browser.** Follow `docs/product/browser-media-storage.md` before image backgrounds work there. Color themes work on both.

**Errors.** Invalid numbers are clamped the way transitions already are. A missing image becomes the solid background, not a crash.

**Access.** Every control has a name. Color is not the only cue.

**Tests.** Present snapshot for frame and lower-third. Selecting a theme does not change program. Save then reload keeps the theme. A broken image id still presents.

**Risk.** Medium. The current `Theme` type is small on purpose. Adding the full PewBeam property panel in one change will stall the live path.

### 2. Reference lookup that stays on preview

**Problem.** The operator still needs a fast typed lookup: book, chapter, verse, range, next and previous verse.

**Workflow.** Type `John 3:16-17`, Enter puts it on preview. A second explicit Take sends it. Next and previous move the preview cursor only.

**Data.** `BibleItem` already has a range. No new store.

**Desktop and browser.** Same parser and the same KJV data. No second translation until the church supplies a text it can use.

**Tests.** Range parse. Next verse does not publish program. Unknown book shows an error and leaves preview unchanged.

**Risk.** Low.

### 3. Audience window on a real second display

**Problem.** Assignment code exists. This PewBeam pass did not open HDMI, and Church Studio’s installer has not been exercised on a projector.

**Workflow.** Assign the external display, open output, take a verse, confirm the operator screen does not get covered, disconnect the display and confirm program is held.

**Tests.** The assignment unit tests already cover a missing display. The physical pass is manual.

**Risk.** Low in code, high in confidence until the cable is tested.

### 4. Do not build yet

Transcription, semantic search, auto-take, NDI, OSC, sermon notes, and checkout are real PewBeam features and they are the wrong next milestone. Auto-take conflicts with preview/program safety. The copyrighted Bibles cannot be extracted. Payment and license activation need their own security design (`docs/product/subscription-architecture.md`) and were not observable enough to specify a provider.

**Account requirements when that work starts.** No feature may phone home before the operator asks. Core present, KJV, and local library stay available with an empty license. A failed license check must not blank the audience. Secrets stay out of the repo and out of logs. Checkout, if added, uses the payment provider’s hosted page. This investigation does not implement it.

## Where Church Studio is already ahead

Songs and lyric sections, a service rundown, slide and image items, Clear, Black, and Logo, cut and fade, library backup with rollback, and an audience that does not follow preview. Those should not be removed to resemble PewBeam’s six panels.

## Blocked PewBeam checks

Theme designer controls, settings pages, watermark appearance, Go Live, HDMI, and the current license plan were not visible on this machine. Statuses above use the public docs for PewBeam behavior and the repository for Church Studio. They do not claim the PewBeam screens were operated.
