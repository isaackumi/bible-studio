# Browser and desktop capabilities

`platformCapabilities()` describes the shell. `detectOutputCapabilities()` probes APIs. Neither is a license check (`canUse` stays separate).

## Matrix

| Capability | Browser | Tauri macOS | Tauri Windows |
| --- | --- | --- | --- |
| Operator desk | Supported | Supported | Supported |
| Preview / Program | Supported | Supported | Supported |
| Audience window | Partial (`window.open`) | Supported (native) | Supported (native) |
| Multi-monitor placement | Browser dependent (Chromium best-effort; drag fallback) | Supported | Supported |
| Fullscreen audience | Requires permission + gesture | Supported | Supported |
| Camera as source | Partial (`getUserMedia`; Preview, Program, audience) | Partial (real-camera run pending) | Partial |
| Microphone (Listen) | Partial (Web Speech) | Supported (helper on macOS) | Partial |
| NDI | Unavailable (no native SDK) | Planned | Planned |
| Phone controller | Partial (same-origin pad; no LAN socket) | Partial (same-origin pad; no LAN socket) | Partial (same-origin pad; no LAN socket) |
| Offline library | Partial (IndexedDB + bundled Bible) | Supported (SQLite) | Supported (SQLite) |
| File media | Designed, not shipped | Supported (images) | Supported (images) |
| Window Management API | Chromium-only; used to place the audience popup | N/A (native displays) | N/A |

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

`getScreenDetails` is experimental, secure-context, and missing in Firefox and Safari ([MDN Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API), [caniuse getScreenDetails](https://caniuse.com/mdn-api_window_getscreendetails)). Open output calls `getScreenDetails()` (one permission prompt), picks a screen other than the operator's with `pickAudienceScreen` (external before internal, then largest), and opens `/?display=1` over that screen's usable area (`placementFeatures`). No API, denied permission, or a single screen falls back to the plain popup the operator drags. Verified with stubbed screen details; not yet on a real second monitor. If the permission prompt outlasts the click's user activation, Chrome blocks the popup; the desk reports it and the next click opens it. Fullscreen still needs **Fill this screen** on the audience window. `canPlaceWindow` stays desktop-only because browser placement is best-effort.

## Autoplay and popups

A page load cannot open the audience popup. A blocked popup is reported on the desk. Fullscreen on the audience window needs a user gesture. Failure of either must not change Program.

## Related code

- `src/lib/platform/runtime.ts`
- `src/lib/platform/output-capabilities.ts`
- `src/lib/display/output.ts`
- `src/lib/platform/capabilities.ts` (`canUse`)
