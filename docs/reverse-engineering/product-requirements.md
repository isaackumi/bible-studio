# Product requirements

Working name: **Church Production Studio**.

One offline desktop app for the service: scripture, lyrics, slides, media, themes, and a protected audience output. Live production features from OBS are a later layer. Speech detection from PewBeam is an optional plugin, never a dependency.

## Users

- **Volunteer operator** runs next, previous, clear, and a Bible lookup during the service.
- **Producer** builds the Sunday service during the week: sections, songs, passages, themes, which display is the audience.
- **Speaker** (later) reads a stage display. Not a separate app in phase 1.

## Current repository

The workspace has no application code. `prompt.txt` is the brief. There is no stack, no license file, and no reusable runtime to preserve. Technical debt is zero because the product is not started. That is also the risk: the first architectural choice is the product.

## Problems to solve

1. Scripture, lyrics, and the audience screen live in different programs, so the operator context-switches during the sermon.
2. Selecting content often *is* going live (FreeShow). The operator needs a preview that is safe.
3. A project list does not tell the room or the stage what section the service is in.
4. Commercial Bible text is bundled in PewBeam. An open-source app cannot do that.
5. Keyboard coverage in the Bible tool is too small for a no-mouse service.
6. This computer has 8 GB of RAM, one external display, and already runs OBS. The new app must stay light and must not need to replace OBS on day one.
7. Long services punish UI-thread work and memory leaks. Output must survive a search, a missing file, and an hour of slides.

## P0 — first release

The app is runnable after each of these, in this order.

1. Open a local workspace. Create a service with sections and ordered items.
2. Present scripture from a local KJV database: book, chapter, verse, ranges, reference parse (`John 3:16-18`).
3. Present lyric and title slides as text items.
4. Attach an image as a background or a media item.
5. Apply a theme (fonts, colors, margins, verse layout, lyric layout) to preview and audience.
6. Preview and program are different. Take (fade) and cut copy preview to program.
7. Audience output is a frameless window on a chosen display. It does not open on the operator display unless the user forces it.
8. Next, previous, clear, black, logo, and take work from the keyboard in live mode.
9. All of the above works with the network disabled.
10. Restarting the app reopens the last service.

## P1 — important, after P0 is reliable

- Stage layout (current, next, timer, notes) as a second output window.
- Video playback on the audience output, with mute.
- Parallel translations and verse comparison for imported texts.
- Recent passages, favorites, custom scripture groups.
- Service progress on the operator and stage views.
- Lower-third layout of the same theme.
- Import OSIS, Zefania, or USFM translations the user supplies.
- Export and import themes and services as files.

## P2 — valuable later

- Scene-like “looks” per section (full frame vs lower third) without exposing a raw source tree.
- Local automation API: status, next, previous, clear, display passage, activate section.
- Browser remote on the LAN.
- Audio beds and per-output audio routing.
- Planning Center or other planning import, behind the service model.
- Schedules.

## P3 — experimental

- Optional local scripture suggestions. Never on by default. Never takes program by itself.
- Sermon-to-slides, announcement drafting, lyric cleanup. Same rule: assist, do not gate.
- NDI or Syphon sender so OBS can take the audience or a lower third.
- Recording, streaming, virtual camera.
- Camera sources, MIDI, OSC, DMX, lighting.
- Plugin host.

## Out of scope until the desktop core is dull

Mobile remote, cloud sync, accounts, AI features, and replacing OBS.

## Success criteria for phase 1

On this Mac, with Wi-Fi off:

- Build a four-section service and run it from live mode without the mouse.
- Put John 3:16-17 on the Dell display from a typed reference, via preview then take.
- Clear and black restore a known state in one key.
- Quit and reopen to the same service and the same program item.
- Memory stays flat across a 30-minute simulated service of slide changes. No modal, no spinner on the program window.
