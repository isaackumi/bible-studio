# Browser and desktop capabilities

`platformCapabilities()` describes the shell. `detectOutputCapabilities()` probes APIs. Neither is a license check (`canUse` stays separate).

## Matrix

| Capability | Browser | Tauri macOS | Tauri Windows |
| --- | --- | --- | --- |
| Operator desk | Supported | Supported | Supported |
| Preview / Program | Supported | Supported | Supported |
| Audience window | Partial (`window.open`) | Supported (native) | Supported (native) |
| Multi-monitor placement | Browser dependent / untested | Supported | Supported |
| Fullscreen audience | Requires permission + gesture | Supported | Supported |
| Camera as source | Planned (`getUserMedia`) | Planned | Planned |
| Microphone (Listen) | Partial (Web Speech) | Supported (helper on macOS) | Partial |
| NDI | Unavailable (no native SDK) | Planned | Planned |
| Phone controller | Partial (same-origin pad; no LAN socket) | Partial (same-origin pad; no LAN socket) | Partial (same-origin pad; no LAN socket) |
| Offline library | Partial (IndexedDB + bundled Bible) | Supported (SQLite) | Supported (SQLite) |
| File media | Designed, not shipped | Supported (images) | Supported (images) |
| Window Management API | Chromium-only, untested | N/A (native displays) | N/A |

Statuses: **Supported** is implemented and used. **Partial** works with limits. **Browser dependent** needs a specific engine. **Requires permission** may prompt. **Desktop only** / **Planned** / **Unavailable** as labeled.

## Probes (`OutputCapabilities`)

| Field | True when |
| --- | --- |
| `canOpenAudienceWindow` | Desktop, or `window.open` exists |
| `canRequestFullscreen` | Desktop, or `document.fullscreenEnabled` |
| `canEnumerateScreens` | Desktop, or `getScreenDetails` exists (not the same as placement) |
| `canPlaceWindow` | **Desktop only.** Browser stays false even if `getScreenDetails` exists |
| `canUseCamera` / `canUseMicrophone` | Desktop, or `navigator.mediaDevices.getUserMedia` exists |
| `canUseWebRTC` | `RTCPeerConnection` is a function |

`getScreenDetails` is experimental, secure-context, and missing in Firefox and Safari ([MDN Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API), [caniuse getScreenDetails](https://caniuse.com/mdn-api_window_getscreendetails)). This repo has not tested placing `/?display=1` onto a chosen `ScreenDetailed`. Do not claim multi-monitor browser output.

## Autoplay and popups

A page load cannot open the audience popup. A blocked popup is reported on the desk. Fullscreen on the audience window needs a user gesture. Failure of either must not change Program.

## Related code

- `src/lib/platform/runtime.ts`
- `src/lib/platform/output-capabilities.ts`
- `src/lib/display/output.ts`
- `src/lib/platform/capabilities.ts` (`canUse`)
