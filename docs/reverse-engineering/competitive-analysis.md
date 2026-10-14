# Competitive analysis

Ratings describe the products as they exist for a church operator.

- **PewBeam 2.6.14** on this Mac, plus its public docs.
- **FreeShow 1.5.5** on this Mac. Upstream 1.6 features are noted where they change the grade.
- **OBS Studio 32.0.1** on this Mac, with DistroAV and obs-ptz installed.
- **Ours** is the intended product, not a claim that it exists yet.

✓ strong · ~ partial · ✗ missing

| Feature | PewBeam | FreeShow | OBS | Ours (target) |
| --- | --- | --- | --- | --- |
| Bible reference navigation | ✓ | ✓ | ✗ | ✓ P0 |
| Bible text search | ✓ semantic | ~ text, API when online | ✗ | ✓ local text P0, semantic later and optional |
| Parallel translations | ~ switch one primary | ~ multiple on a scripture slide | ✗ | ✓ P1 |
| Legal translation story | ~ ships commercial texts in the app | ✓ import XML you have rights to | ✗ | ✓ import only, KJV bundled |
| Live verse detection from speech | ✓ | ✗ | ✗ | P3 optional plugin, never required |
| Lyrics / songs | ✗ | ✓ | ✗ | ✓ P0 |
| General slides | ~ verse cards and themes | ✓ | ~ via sources | ✓ P0 |
| Announcements, timers | ✗ | ✓ | ~ | ✓ timer/title P0, richer announcements P1 |
| Service rundown with sections | ✗ queue only | ~ flat project, calendar, Planning Center | ✗ | ✓ P0 |
| Playlists | ~ verse queue | ✓ projects | ~ scene collections | ✓ the service is the playlist |
| Scenes | ✗ | ~ overlays and output styles | ✓ | P2, hidden behind section looks |
| Sources / layers | ~ theme elements | ✓ slide items | ✓ | ✓ slide layers P0, full source graph P2 |
| Media library | ~ backgrounds | ✓ | ✓ | ✓ images P0, video P1 |
| Themes for scripture and lyrics | ✓ verse themes | ✓ templates | ✗ studio chrome only | ✓ P0 |
| Transitions | ~ theme motion | ✓ text and media fades | ✓ | ✓ cut and fade P0 |
| Preview / program safety | ✓ for a verse | ~ output lock, selecting is often live | ✓ studio mode | ✓ P0 |
| Audience output | ✓ HDMI window, NDI | ✓ extra windows | ✓ program | ✓ window on a chosen display P0 |
| Stage / confidence | ✗ | ✓ stage layout and LAN page | ~ multiview is not a stage display | ✓ P1 |
| Multiview | ~ preview and live panels | ~ output previews | ✓ | ~ preview + program + next item P0 |
| Recording | ✗ | ✗ in 1.5.5 | ✓ | P3 |
| Streaming | ✗ sends NDI into a switcher | ~ RTMP in upstream 1.6, not in the installed 1.5.5 | ✓ | P3, or NDI into the OBS already installed |
| Audio mixer | ~ mic for transcription | ~ playback, effects upstream | ✓ | mute and per-item audio P1 |
| Remote control | ~ OSC/HTTP, navigation not fully wired | ✓ remote on :5510 | ~ websocket | P2 |
| Automation API | ~ | ✓ action map | ✓ | design P0, serve P2 |
| Plugins | ✗ | ~ | ✓ | interface P1, plugins P3 |
| Offline operation | ~ Bible yes, detection often no | ✓ | ✓ | ✓ P0 |
| Keyboard-only live operation | ~ five shortcuts | ✓ | ✓ | ✓ P0 |
| Volunteer-scale simplicity | ✓ one job | ~ powerful, busy | ✗ | ✓ live mode is the simple surface |

## Opportunity

Nobody on this machine does all three jobs:

1. **Find and present scripture** as fast as PewBeam’s manual search, without requiring a microphone or a subscription.
2. **Run the service** (worship, scripture, sermon, offering) as clearly as a producer’s rundown, which FreeShow only approximates.
3. **Protect program** the way OBS studio mode does, so browsing the Bible cannot flash the projector.

The open lane is that combination, offline, on an 8 GB laptop with one external display.

## Explicit non-goals for the first release

- A PewBeam-style listener. It is the most impressive feature and the easiest way to miss the actual gap.
- An OBS clone with a church skin.
- A FreeShow fork with different colors.
- Shipping NIV, ESV, NLT, NASB, or NKJV.
- Streaming, recording, NDI, MIDI, or a phone remote before Take, next, and clear are boringly reliable.
