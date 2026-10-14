# PewBeam parity roadmap

Date: 14 October 2026. This is a plan. It is not authorization to build it.

PewBeam 2.6.14 is a live scripture agent: transcription, detection, a verse card, and HDMI/NDI. Church Studio is a service presenter with preview held apart from program. Parity means the verse-on-screen job becomes reliable inside Church Studio. It does not mean copying detection, the NDI SDK, or the bundled copyrighted translations.

## Minimum product

An operator can find a KJV passage, read it on preview in a readable theme, take it to an audience window, clear it, and reopen the service after a restart without the old frame coming back. Songs and the service order stay. No account.

That minimum is mostly in the tree now. What is still unproven is a second physical display, a theme that can be a lower third or a full frame, and browser images.

## Milestone 1 — Scripture on the screen

**Outcome.** Lookup, preview, take, and a simple theme edit work on desktop and in the browser. The audience window is checked on one external display.

**Features.** Reference and range entry. Next and previous verse on preview only. Theme controls that the `Theme` type already has, plus a frame versus lower-third layout if the tests stay small. Audience open, take, clear, disconnect.

**Depends on.** Current live engine, KJV catalog, theme sanitize, display assignment.

**Acceptance.** Enter on a reference changes preview only. Take changes program. Restart of the owning session shows an empty program. A missing theme image does not crash. Browser and desktop follow the same present functions.

**Tests.** Parser and present unit tests. Live-engine test that next verse is not a program action. Manual: one external display, then unplug it.

**Difference.** Desktop can target a display. The browser opens a window and cannot place it on a chosen monitor.

**Risk.** Theme scope. Stop at layout mode, type, color, and background. Do not build the full designer in this milestone.

## Milestone 2 — Theme library an operator will reuse

**Outcome.** Duplicate, rename, export, and import a theme without touching songs or services. Preview updates. Program does not, until Take.

**Depends on.** Milestone 1 and the existing library snapshot. Image backgrounds in the browser depend on the media design in `docs/product/browser-media-storage.md`.

**Acceptance.** An older backup without themes still keeps themes. A failed import leaves the previous theme. Two outputs are still one theme; per-channel themes wait.

**Tests.** Import rollback already covers themes on desktop and browser. Add a present test for the new layout mode.

**Risk.** Low if the snapshot schema stays versioned.

## Milestone 3 — Service around the verse

**Outcome.** A passage sits in the rundown with songs and slides. The rundown is the queue. A scratch list of verses found during the sermon is optional and still preview-only.

**Depends on.** Milestones 1 and 2. Song section editing that is already started.

**Acceptance.** Reorder does not change program. Reopen restores the plan and the preview cursor, not the live frame.

**Tests.** Service document tests plus one live-engine test for “select item”.

**Risk.** Low. This is Church Studio’s own model, not a PewBeam port.

## Milestone 4 — Backup and recovery

**Outcome.** Songs, services, themes, and later media, export and import on both targets. Program is never inside the backup.

**Depends on.** Current atomic desktop import and browser rollback. Media design before blobs are added.

**Acceptance.** Failure mid-import restores the previous rows. Missing media shows an empty frame.

**Tests.** Already present for library rows. Extend them when media ids exist.

## Milestone 5 — Account and billing, only after the core is dull

**Outcome.** A church can see a plan and upgrade without the presenter going dark when the network fails.

**Depends on.** A chosen provider and `docs/product/subscription-architecture.md`. Not on anything found inside the PewBeam binary. The payment provider on PewBeam was not identified, and no checkout was opened.

**Acceptance.** Presenting KJV and the local library works signed out. A license failure does not clear program. No card data in logs.

**Tests.** `canUse` stays a local gate until a real client exists. Integration tests use a fake license response.

**Risk.** High if it is started before milestone 1.

## Milestone 6 — Optional listening

**Outcome.** A later plugin can suggest a verse. The suggestion never takes program. The app is complete with the microphone off.

**Depends on.** Milestones 1–3. A transcription provider chosen by the church, with a written data policy. Offline speech only if it runs on device and the model license allows it.

**Acceptance.** Manual mode is the only mode. There is no Auto take. Stopping the plugin leaves preview and program as they were.

**Tests.** A suggestion action calls `setPreview` or fills a list, and a test fails if it calls `applyProgramAction`.

## Explicitly later

NDI and alpha, extra output channels, OSC/HTTP, sermon notes, translation store, stage window, watermark-as-paywall, Spout/Syphon. PewBeam documents some of these. Church Studio should not vendor the NDI SDK to match the bundle.

## Unresolved

- PewBeam theme-designer controls, settings pages, and the watermark were not seen on screen. Screenshots from the operator would move those rows from documented to observed.
- Whether this PewBeam install is Free, Plus, or Core was not read, because the license files were left closed.
- Church Studio on a second monitor and a packaged `.app` are still untested.
