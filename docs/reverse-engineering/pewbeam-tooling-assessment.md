# PewBeam tooling assessment

Date: 14 October 2026. Machine: macOS 26.5 (build 25F71), arm64. RAM was not re-measured in this session.

Nothing was installed. No system protection was changed. Frida, Ghidra, and radare2 were not used.

## Installed and used

| Tool | Version / path | Needed | What it answered |
| --- | --- | --- | --- |
| `file` | 5.41, `/usr/bin/file` | Yes | The PewBeam executable is a thin arm64 Mach-O. |
| `find` | `/usr/bin/find` | Yes | Bundle layout, translation folders, user-data paths. |
| `/usr/bin/otool` | System `otool`. The shell’s `otool` is Anaconda’s and was not used. | Yes | Linked frameworks. This is how the runtime was identified. |
| `codesign` | `/usr/bin/codesign`. It has no `--version` flag. | Yes | Developer ID, team, notarization, hardened runtime. |
| `plutil` | `/usr/bin/plutil` | Yes | `Info.plist` for PewBeam, FreeShow, and OBS. |
| `lipo` | `/usr/bin/lipo` | Yes | Confirmed a non-fat arm64 executable. |
| System Events / `osascript` | Present. Accessibility permission is granted to this environment. | Yes | Menu bar and window count. The main view does not expose child controls. |
| `mdls` | `/usr/bin/mdls` | No | Spotlight could not see the apps from the sandbox. `Info.plist` was sufficient outside the sandbox. |
| `jq` | 1.6 | Available, not required | JSON shape was read with Python instead. |
| `sqlite3` | 3.45.3 | Tried | The `*_bible.sql` files are SQL text, not SQLite databases. |
| `ripgrep` | 15.1.0 (Cursor) | Yes | Public-doc headings and Church Studio source. `/usr/bin/rg` is not installed. |
| `python3` | 3.12.11 (Anaconda) | Yes | JSON key shapes and the KJV `CREATE TABLE` line. Verse rows were not copied into the docs. |
| `ps` / `pgrep` | System | Yes | One PewBeam process, pid 744, no other PewBeam processes observed. |
| `du` / `stat` | System | Yes | App size and data-directory size. |

## Installed and not needed

| Tool | Status | Decision |
| --- | --- | --- |
| `strings` / `nm` | `/usr/bin/strings` and `/usr/bin/nm` exist. PATH points `strings` at Anaconda. | Not required. Menus, the bundle, and the public docs already name the features. A full string dump of the binary was not taken. |
| `/usr/bin/log` | Installed. The shell’s `log` is a zsh builtin, so the system binary must be called by path. | Not required. No crash or log-based question was left open that the menus and docs did not answer. |
| `sips` | Installed | Would describe a screenshot. Capture did not produce a file. |
| Playwright browsers | `~/Library/Caches/ms-playwright` contains `chromium-1248`. The `playwright` npm package is not installed. | Not the right tool. PewBeam is not a Chromium app and did not expose a page to attach to. Do not install Playwright for this investigation. |

## Missing, and not justified

| Tool | Why it was considered | Decision |
| --- | --- | --- |
| Frida | Runtime hooks | Not justified. The questions that remain are visible UI behavior, not hidden control flow. Hooking the process would risk touching license and audio paths. |
| Ghidra, radare2, Hopper, class-dump | Disassembly | Not justified. `otool -L` and the bundle already identify the runtime. Disassembly is not needed to list features. |
| A second UI-automation framework | Click through the dashboard | The menu bar is scriptable. The dashboard surface is not. See the blocker below. |

## Blocker for click-through testing

System Events can read the menu bar. After PewBeam was brought forward it had one window titled “Pewbeam” with two accessibility children: an unnamed group and the static text “Pewbeam”. Controls inside that group are not exposed. `AXWindowNumber` is not available, so `screencapture -l` could not target the window.

That blocks theme-designer controls, settings pages, the broadcast panel, and live preview/program checks. It does not block bundle, menu, storage-path, or public-documentation work.

No further tool install is required to finish those read-only parts. To test the blocked screens, one of these is needed:

1. Screenshots you take yourself of the dashboard, Settings, Theme Designer, and Broadcast panel, saved under `docs/reverse-engineering/evidence/pewbeam/`. That is the preferred next step.
2. Approval to capture the display after Screen Recording permission is granted to the app that runs the capture. A full-display capture can include other windows, so it should be done only with a clean desktop.

Do not install Frida, Ghidra, or radare2 for this. Do not disable SIP or Gatekeeper.

## Evidence

Notes from this pass live in `docs/reverse-engineering/evidence/pewbeam/README.md`. No PewBeam font, translation text, image, license file, or auth file was copied into the repository.
