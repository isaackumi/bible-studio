# OBS Studio analysis

Installed build: **OBS Studio 32.0.1** (`com.obsproject.obs-studio`) at `/Applications/OBS.app`.
Stack seen in the bundle: Qt widgets, Chromium Embedded Framework (browser sources), FFmpeg libraries, Sparkle updates, Syphon. User plugins present: **distroav** (NDI) and **obs-ptz**. Scene and profile contents were not read.

OBS is open source. This note is about production concepts that belong in church software, not about reimplementing libobs.

## What the product is

OBS is a video mixer. A **scene** is a stacked set of **sources**. **Studio mode** shows Preview and Program. A transition (cut, fade, swipe, stinger) copies preview to program. Audio is a mixer with filters, not a file in a slide. Recording, streaming, virtual camera, and multiview are outputs of that same composition.

It has no idea what a verse, a chorus, or a service is. Churches use it anyway because the other apps cannot mix cameras, lyrics, and a lower third reliably.

## Concepts worth stealing

**Scene.** A named look: “Sermon”, “Worship”, “Announcement”. Switching scene is the live action. Inside a church app the scene should be built from church sources (lyrics, scripture, camera, countdown), not from a generic source list the volunteer has to assemble every week.

**Source.** A layer with a transform: position, crop, bounds, visibility. Order is the stack. Groups keep a logo and a lower third together. This is the right model for “verse on a background” and “verse as a lower third over a camera” being two layouts of the same content.

**Preview / Program.** The single most important safety pattern. Nothing the operator browses changes the congregation until Take. PewBeam has a small version of this. FreeShow does not. Our live mode should.

**Transition on the take, not on the content.** Fade belongs to the act of going live. Slide animations inside a lyric line are a different, smaller thing. Mixing them up is how presenters feel laggy.

**Profiles vs scene collections.** A profile is the machine (outputs, stream, canvas size). A scene collection is the show. Churches need the same split: this computer’s displays and audio devices are not part of the Sunday file, so the service can move to another laptop.

**Docks.** The operator shows the panels they need and hides the rest. Our first release should not ship a dock engine. It should ship two layouts: **Prepare** and **Live**, which is the dock idea reduced to the only switch that matters.

**Hotkeys.** Every mixer action has a key, and the keys work while the window is focused. Church operators already think this way (next, clear, logo, black).

**Audio mixer.** Separate from visuals. A video’s volume, a music bed, and mute are always visible. We do not need OBS’s mixer in phase 1. We do need mute and “this video’s audio goes to the audience, not to the stage display.”

**Browser source.** HTML as a layer is how lyrics tools get into OBS today (PewBeam does it via NDI instead). If our output is already HTML, an NDI or Syphon sender later lets this app be a source in OBS without a second design tool.

**Modules.** DistroAV and obs-ptz on this Mac show the real extension points: NDI and camera control. Those are phase 3, behind an interface, not compiled into the first binary.

## What is good

- Program cannot change by accident in studio mode.
- Scenes match how a service actually changes look: full-screen lyric, then camera-plus-lower-third, then announcement.
- Canvas resolution is independent of the operator’s screen. The Dell U2415 on this Mac is 1920×1200; a projector might be 1920×1080. OBS does not pretend they are the same.
- Plugins exist because the core is a graph of sources and outputs.
- It runs for hours. Rendering is on a media thread, not the Qt UI thread.

## What is frustrating for a church

- A volunteer cannot find John 3:16, a chorus, or the offering video without a producer building scenes beforehand.
- No stage display of “current lyric / next lyric / notes.”
- No service clock tied to the rundown.
- The source list is a blank page. Every Sunday starts from primitives.
- Preview/program is two copies of a video canvas. It does not show the next slide in a rundown, so producers add a second tool anyway.

## What we should take, and how to do it differently

Use OBS concepts as the **live layer under a service**, not as the home screen.

| OBS concept | Church form |
| --- | --- |
| Scene collection | A service |
| Scene | A section look, or an item’s layout (full frame, lower third, stage) |
| Source | A typed layer: scripture, lyrics, text, image, video, color, later camera |
| Studio mode | Preview bus and program bus, Take to copy |
| Transition | Cut and fade on Take. More later |
| Profile | This machine’s displays, audio device, canvas size |
| Multiview | Operator sees preview, program, and the next rundown item. A real multiview wall waits |
| Filters | Theme is the filter for text. Video filters wait |
| Recording / streaming | Out of scope until program output is trustworthy. Until then, a window or future NDI sender feeds the OBS already on this Mac |

Do not embed libobs in phase 1. Do not reproduce the OBS window layout. The test is: a volunteer can run scripture and lyrics without learning scenes, and a producer can later treat a section as a scene without leaving the app.
