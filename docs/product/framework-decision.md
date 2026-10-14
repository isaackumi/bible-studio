# Framework decision

Date: 14 October 2026. No application behavior was changed. No benchmarks were run. Display placement on the Dell U2415 has not been verified.

## Decision

**Retain Tauri 2, Svelte, and Rust.** Add a small native display adapter only if the experiment below fails. Do not move to Qt, Electron, Flutter, Avalonia, or a from-scratch AppKit and Win32 UI.

The presentation problem is monitor geometry, not the UI toolkit. Church Studio already has the shared renderer, Preview/Program split, SQLite, and a second audience window. Replacing the framework would discard that work to relearn the same operating-system APIs.

## What the current code already does

`src-tauri/src/displays.rs` and Tauri 2.12.3 (`Cargo.lock`) already provide:

- `available_monitors` and `primary_monitor`.
- A second window labeled `audience`, created with `WebviewWindowBuilder`, borderless, and not focused onto the operator window.
- Windowed placement with `LogicalPosition` and `LogicalSize`.
- Fullscreen with `set_fullscreen_on_monitor`, passing the monitor’s physical origin. Tauri documents this as fullscreen on the monitor that contains that point: [window reference](https://v2.tauri.app/reference/javascript/api/namespacewindow/), added in [Tauri 2.12.0](https://v2.tauri.app/release/tauri/v2.12.0/).
- A one-second reconcile loop, plus an explicit refresh command.
- A saved display key. A missing display hides the audience window and leaves the operator window alone.
- On macOS only, a CoreGraphics fallback when Tauri reports no external display. `objc2` and `objc2-app-kit` are already dependencies.

The scale compensation in `logical_points` exists because the locked `tao` 0.37.1 macOS monitor code reports `CGDisplayPixelsWide` and then treats that pixel count as logical points. That doubles a Retina size. This was read from the crate source on this machine (`tao-0.37.1/.../macos/monitor.rs`). It is a defect in the dependency Church Studio compiles, not a reason to leave Tauri. Official Tauri docs say monitor size and position are physical pixels and that window creation wants logical pixels: [dpi](https://v2.tauri.app/reference/javascript/api/namespacedpi/).

Gaps that a native adapter would cover, and only after a failed Dell test:

- Display connect and disconnect as an OS event, instead of a one-second poll. macOS: `CGDisplayRegisterReconfigurationCallback`. Windows: `WM_DISPLAYCHANGE`.
- A human display name from `NSScreen.localizedName`. Tao’s macOS `name()` in the same file returns a model number string.
- If `set_fullscreen_on_monitor` does nothing because the point misses the Dell, place with `NSScreen.frame` directly. The AppKit dependency is already linked.

## Ranked comparison

| Rank | Option | Fit for this codebase | Evidence | Why it is not the next step |
| --- | --- | --- | --- | --- |
| 1 | Tauri 2 + Rust + Svelte, with a native display adapter only if the Dell test fails | Keeps the UI, the Rust commands, and SQLite | [Tauri README](https://github.com/tauri-apps/tauri): system webview via WRY (WKWebView on macOS, WebView2 on Windows). License: MIT or MIT/Apache-2.0 where applicable. [Apache-2.0 text](https://github.com/tauri-apps/tauri/blob/dev/LICENSE_APACHE-2.0). Signing and updates are documented at [distribute](https://v2.tauri.app/distribute/). | The Dell fullscreen test is still outstanding. |
| 2 | Same app, plus direct AppKit and Win32 calls behind the existing `Output` type | Smallest native addition. macOS hooks already exist in this crate | Apple: [`NSScreen`](https://developer.apple.com/documentation/appkit/nsscreen), [`CGDisplayBounds`](https://developer.apple.com/documentation/coregraphics/cgdisplaybounds(_:)). Windows: [`EnumDisplayMonitors`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaymonitors), [`GetMonitorInfo`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmonitorinfoa) (`MONITORINFOF_PRIMARY`), [`SetWindowPos`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos). Tao on Windows already calls `EnumDisplayMonitors`: [tao windows monitor.rs](https://github.com/tauri-apps/tao/blob/3c2b4447/src/platform_impl/windows/monitor.rs). | Do this only for a reproduced placement failure. Two full native UIs are not required. |
| 3 | Electron + Svelte | The Svelte UI could move. The Rust backend, SQLite commands, and Tauri window code would be rewritten | Official external-display example: [screen](https://www.electronjs.org/docs/latest/api/screen). `setFullScreen` and `setBounds`: [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window). Electron is MIT. | Ships a Chromium runtime beside the system webview. No measured memory or startup advantage exists for this product. FreeShow’s 1.6.6 notes still include “Fixed output window position sometimes incorrect,” so Electron does not remove the bug class. |
| 4 | Flutter | New UI language and widget tree | Official desktop windowing is described as new and not the old single-window model: [Flutter blog](https://flutter.dev/blog/desktop-windowing-apis). Multi-window was a long-open framework issue: [flutter#30701](https://github.com/flutter/flutter/issues/30701). Flutter is BSD-3-Clause. | Throws away the Svelte UI. Multi-window is not the stable path this product already has. |
| 5 | Avalonia | MIT, real `Screens` API and `WindowState.FullScreen` | [Avalonia license](https://github.com/AvaloniaUI/Avalonia/), [window management](https://docs.avaloniaui.net/docs/app-development/window-management). | Requires a C# rewrite of the Svelte UI. No display capability here that Tauri plus AppKit lacks. XPF is a separate commercial product and is irrelevant. |
| 6 | Qt | Mature screens and fullscreen | LGPL obligations: [Qt LGPL obligations](https://www.qt.io/development/open-source-lgpl-obligations). Commercial desktop distribution is a paid developer license, distinct from device distribution licenses: [Qt commercial FAQ](https://www.qt.io/faq/qt-commercial-licensing). | Throws away Svelte. LGPL compliance or a commercial contract is a new cost. OBS being Qt does not transfer that code (see below). |

No startup-time or memory numbers are claimed. They were not measured.

## Competitors

| Product | What is verified | What we may learn | What we may not copy |
| --- | --- | --- | --- |
| PewBeam 2.6.14 | Installed at `/Applications/Pewbeam.app`. Thin arm64 Mach-O. `otool` shows AppKit, WebKit, Metal, CoreGraphics. No JS, HTML, or source maps in the bundle. Signed by Pewbeam Inc. | A native window can be the audience surface. Menus expose a presentation window and an HDMI preview. Public docs describe a borderless window on a non-primary display. That HDMI behavior was not watched. | No application source and no license granting reuse. Do not copy the binary, watermark, or translations. |
| ProPresenter 21 | Official support matrix: macOS 13–26 and Windows 10/11 for 21.4. [OS support](https://support.renewedvision.com/hc/en-us/articles/55683662214675-Which-Operating-Systems-Does-Each-ProPresenter-Version-Support). Marketing describes multiple outputs at different resolutions. [Product page](https://www.renewedvision.com/propresenter). | Operators expect several independent outputs, not one mirrored window. | Proprietary. Framework is not stated by Renewed Vision. No source is available to adapt. |
| FreeShow | Electron app. [README](https://github.com/ChurchApps/FreeShow/blob/main/README.md). License: GPL-3.0. [LICENSE](https://github.com/ChurchApps/FreeShow/blob/main/LICENSE). Release 1.6.6 (9 Oct 2026) lists an output-position bugfix. [Releases](https://github.com/ChurchApps/FreeShow/releases). | Output position bugs happen on Electron too. Behavior notes are fine. | GPL-3.0 code linked into Church Studio would obligate Church Studio’s corresponding source. Do not copy it. |
| OBS Studio | GPL-2.0-or-later. [Repository](https://github.com/obsproject/obs-studio), [COPYING](https://github.com/obsproject/obs-studio/blob/master/COPYING). The OBS project names Qt as a core dependency that plugins must track. [Plugin distribution](https://github.com/obsproject/obs-plugintemplate/wiki/Distribute-Your-Plugin). | Preview and Program are separate. The desk layout is a product idea, already implemented here. | GPL-2.0 does not allow folding OBS into a closed commercial app. Do not copy `libobs` or Qt UI code. |

## Recommended architecture

Keep one Svelte operator UI and one Svelte audience surface. Keep Rust as the owner of Program packets and the library database.

On macOS and Windows, Tauri remains the window host:

- macOS: WKWebView through Tauri, AppKit and CoreGraphics only inside `displays.rs` when Tao’s rectangle is wrong.
- Windows: WebView2 through Tauri. Tao already enumerates monitors with `EnumDisplayMonitors`. A Win32 adapter is the same kind of small patch, written when a Windows machine shows a wrong rectangle. It is not a second UI.

Program stays in the existing packet. The audience window does not read Preview. That rule is independent of the toolkit.

## Smallest experiment

Do not rewrite `displays.rs` first.

1. Launch the existing Tauri debug build on this Mac (built-in Retina display plus the Dell U2415).
2. In Settings → Displays, select the Dell. Open output. Choose fullscreen.
3. Record the audience window’s frame and the operator window’s frame. The audience frame should match the Dell. The operator window should still be on the built-in display.
4. Show a scripture on Preview only, then press LIVE. Only the LIVE frame should appear on the Dell.
5. Unplug the Dell. The audience window should hide or close, the saved key should remain, and the operator window should not move.
6. Plug it back in and reopen output.

Pass: stop. The recommendation is confirmed. Fail: add one macOS function that reads `NSScreen` frames and calls `setFrame` on the audience `NSWindow`, still behind the current `Output` commands. Re-run the same six steps. Do not start an Electron or Qt port from that failure.

Windows gets the same script later, on Windows hardware, using `EnumDisplayMonitors` bounds as the expected rectangle. That machine is not this one, so the Windows result is unknown.

## External-display test matrix

| Case | Expected | Run here? |
| --- | --- | --- |
| Built-in Retina only | No audience window until that screen is assigned | Not re-run for this note |
| Built-in 2× plus Dell 1×, windowed | Audience fills the Dell in points. Operator stays on the built-in display | Not run |
| Same pair, fullscreen | Audience is fullscreen on the Dell, not a macOS space on the built-in display | Not run |
| Preview, then LIVE | Dell shows Program only after LIVE | Not run |
| Dell unplugged while output is open | Output offline, assignment kept, operator unmoved | Not run |
| Dell replugged | Reopen returns to that display | Not run |
| Two displays with the same resolution | Selection follows the saved key, not “the second monitor” by index | Not run |
| Browser | Popup only. No claim of monitor control | Explained in the UI. Not a substitute for the Dell test |
| Windows mixed DPI | Same expectations, Win32 coordinates | No Windows machine in this session |

## Migration cost if the experiment is ignored

| Move | What is thrown away | Risk |
| --- | --- | --- |
| Electron | `src-tauri` commands, rusqlite, the window code that already targets a monitor | Months of porting, a larger runtime, and the same class of placement bugs FreeShow is still fixing. License is compatible. |
| Qt | The Svelte UI and the Rust/Svelte split | New UI toolkit plus LGPL compliance or a commercial Qt contract. [LGPL obligations](https://www.qt.io/development/open-source-lgpl-obligations). |
| Flutter | Svelte components and most of the TypeScript UI | Multi-window is not the settled API. [Desktop windowing blog](https://flutter.dev/blog/desktop-windowing-apis). |
| Avalonia | Svelte UI, for C# | MIT is fine. No measured display advantage. |
| Two native UIs | Shared Svelte renderer | Two products to ship. AppKit on Windows does not exist. |

Packaging stays on Tauri’s documented macOS and Windows signing path until a measurement says otherwise: [Tauri distribute](https://v2.tauri.app/distribute/). Updater behavior was not exercised in this research.
