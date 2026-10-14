# PewBeam test matrix

Date: 14 October 2026. Pewbeam 2.6.14, macOS 26.5, arm64.

A row is **pass** only when the behavior was seen. A menu item or a documentation paragraph is not a pass. **Blocked** means the main window does not expose controls, and no screenshot was captured. **Not tested** means the action was deliberately skipped so the running app, microphone, network, and license state were left alone.

Evidence notes: `docs/reverse-engineering/evidence/pewbeam/README.md`.

| ID | Feature | Preconditions | Steps | Expected | Observed | Restart | Online | Result | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PB-001 | Version and identity | App installed | Read `Info.plist`, `file`, `codesign` | 2.6.14, `com.pewbeam.app`, arm64, signed | Matches. Notarized Developer ID, team 5VL25VW7J2. | n/a | n/a | pass | Confirmed |
| PB-002 | Runtime | Same | `otool -L`, bundle listing | Identify Electron, Tauri, or native | Native AppKit, WebKit, Metal, AVFoundation, CoreML. One process. Not Electron. | n/a | n/a | pass | Confirmed |
| PB-003 | Menu inventory | App running | Read the menu bar | Menus exist | Pewbeam, File, Edit, View, Audio, Window, Help, with the items listed in the inventory | n/a | n/a | pass | Confirmed |
| PB-004 | Operator window | App frontmost | Count accessibility windows and children | Panels are inspectable | One window titled Pewbeam. Inner controls are not exposed. | n/a | n/a | blocked | Confirmed |
| PB-005 | Six-panel dashboard | Window open | Read panel titles | Transcript, Preview, Live, Queue, Search, Detections | Not readable from accessibility | n/a | n/a | blocked | Documented only |
| PB-006 | Settings pages | Menu Pewbeam > Settings | Open and read sections | Display, transcription, license, help | Menu click did not create a second accessibility window. Sections not read. | n/a | n/a | blocked | Menu confirmed |
| PB-007 | Account creation and sign-in | Settings or launch | Complete the form | Account screens | No such menu. Auth directory exists. Contents not read. | n/a | n/a | not tested | Unknown |
| PB-008 | License key and plan badge | Settings > License | Read the badge only | Free, Plus, or Core | Screen not visible. License directory not opened. | n/a | n/a | blocked | Documented |
| PB-009 | Checkout | Plan upgrade | Open checkout and cancel | Provider, price, methods | Not started. Provider unknown. | n/a | n/a | not tested | Unknown |
| PB-010 | Theme Designer opens | View > Open Theme Designer | Open and read controls | Library, canvas, properties | Menu item exists. Designer was not opened, to avoid changing a theme. | n/a | n/a | not tested | Menu confirmed, behavior documented |
| PB-011 | Dark/light chrome | View > Toggle Theme | Toggle and restart | Appearance persists | Not toggled, so the current look was preserved. | not tested | n/a | not tested | Menu confirmed |
| PB-012 | Bundled themes and fonts | Bundle and user data | List files | Fonts and backgrounds | Inter, Figtree, General Sans, DejaVu. One background JPEG. Selah JPEG named in the README is absent. Font cache has 409 families. | already on disk | n/a | pass | Confirmed for files |
| PB-013 | Theme save, import, export | Designer | Save and reimport JSON | Round trip | Not opened | not tested | n/a | not tested | Documented |
| PB-014 | Separate template editor | Menus and docs | Find the command | A template surface distinct from themes | Not found | n/a | n/a | pass | Confirmed absent from menus and docs |
| PB-015 | Watermark file | Bundle | Find the asset | Image exists | `watermark.png` is in the bundle. It was not seen on an output. | n/a | n/a | pass | File confirmed, behavior documented |
| PB-016 | Watermark on output | Known free plan, output open | Look at preview and HDMI | Mark at bottom right on free plan | Plan unknown. Output not opened. | not tested | n/a | not tested | Documented |
| PB-017 | Six translations installed | Bundle | Count book files | 66 books each | KJV, NKJV, NIV, NLT, ESV, NASB, 66 JSON books each. Menu lists the same six. | n/a | offline files | pass | Confirmed |
| PB-018 | KJV table shape | KJV SQL script | Read the `CREATE TABLE` line only | Columns for book, chapter, verse, text | `book_id`, `book`, `chapter`, `verse`, `text` | n/a | n/a | pass | Confirmed |
| PB-019 | Reference search | Book mode | Type a reference, press Enter | Preview changes, program unchanged until Go Live | Not typed | not tested | documented offline | not tested | Documented |
| PB-020 | Context search | Embeddings installed | Search a phrase | Ranked verses | Embeddings directory is about 333 MB. Search was not run. | not tested | may be local | not tested | Files confirmed, behavior documented |
| PB-021 | Translation switch | View menu | Choose another translation | Search and display follow | Not changed | not tested | n/a | not tested | Menu confirmed |
| PB-022 | Songs and media library | Menus | Find the feature | Library UI | No song or media-library menu | n/a | n/a | pass | Confirmed absent |
| PB-023 | Microphone recognition | Audio menu | Start and stop | Transcript text | Not started. Avoids mic and cloud audio. | n/a | documented | not tested | Menu confirmed |
| PB-024 | Preview stays off program | Go Live off | Select a verse | Preview changes, live output does not | Not operated | not tested | n/a | not tested | Documented |
| PB-025 | Go Live pushes preview | Go Live on | Press L | Current preview becomes live | Not pressed | not tested | n/a | not tested | Documented |
| PB-026 | Auto mode changes program | Auto, detection | Speak a reference | Broadcast changes without a click | Not enabled | not tested | n/a | not tested | Documented |
| PB-027 | HDMI preview | External display | File > Open HDMI Preview, then close | Borderless window, not on the primary display | Not opened. No second display was checked. | not tested | n/a | not tested | Menu confirmed |
| PB-028 | NDI source | NDI receiver on the LAN | Enable NDI | Source name Pewbeam main | Library is in the bundle. Output was not enabled. | not tested | LAN | not tested | Library confirmed |
| PB-029 | Restart restores live verse | A verse on output | Quit and relaunch | Document whether program returns | Not restarted | not tested | n/a | not tested | Unknown |
| PB-030 | Queue add and clear | A found verse | Plus, then Clear All | Queue changes, program policy as documented | Not used | not tested | n/a | not tested | Documented |
| PB-031 | Workspace docking | Menus | Find layout commands | Saved panels | No such commands. Dashboard is fixed in the docs. | n/a | n/a | pass | Confirmed absent from menus |
| PB-032 | OSC and HTTP | App running | See if UDP 8000 and TCP 8080 are listening | Ports open | Not probed this session | n/a | local | not tested | Documented |
| PB-033 | Sermon notes | A saved transcript and a paid plan | Generate and cancel before save | Format choices | Not run. Would send text to a remote model. | n/a | remote | not tested | Documented |
| PB-034 | Updates | Pewbeam > Check for Updates | Open the checker | Version notice | Not opened | n/a | remote | not tested | Menu confirmed |
| PB-035 | Help links | Help menu | Documentation, Report Issue, About | Pages open | Not opened | n/a | remote for docs and issues | not tested | Menu confirmed |

## Select versus live

PB-024, PB-025, and PB-026 are the production-safety rows. They are documented and **not tested** on this machine. Do not treat the public description as a measured result.
