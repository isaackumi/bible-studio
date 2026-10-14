# Display system

The operator desk and the audience window are separate. Preview stays on the desk. Program is the only picture the audience window renders.

## What was failing

The desktop shell already created a borderless audience window, but placement converted monitor coordinates with the window’s current scale factor. On a Retina laptop that sent a 1× projector to the wrong place, often still on the operator screen. Fullscreen was turned off on every placement pass. Settings listed displays behind an icon rail labeled Screens, and the desk Outputs button tried to open a window without showing that list. A browser tab cannot place a window on another monitor; that path only called `window.open`.

## Desktop

Tauri enumerates monitors about once a second. Each entry keeps a key of `name|raw-widthxraw-height|scale`. The settings list shows the size in points, so a Retina panel is not reported at twice its resolution. Position is not part of the key.

The audience window is a second Tauri window labeled `audience`. It loads the same app and renders `AudienceOutput`, which reads Program from `get_program` and the `program-frame` event. It does not read Preview and it does not claim output ownership.

Placement uses logical points. `set_position(LogicalPosition)` is not divided by the window scale, so a window that still sits on a Retina display can move onto a 1× display. Fullscreen uses Tauri’s `set_fullscreen_on_monitor` with the monitor’s physical origin. Windowed output fills that display without creating a macOS fullscreen space. The operator window is not moved when the audience window opens.

Output stays closed until the operator opens it. The choice, and windowed or fullscreen, is stored on the display profile (`outputEnabled`, `outputMode`). A missing assigned display hides the audience window and keeps the saved key. Reconnecting that display places the window again. The operator window is left alone.

If Tauri reports no external display while CoreGraphics still has one, macOS can place the window from CoreGraphics bounds. That fallback is only for automatic mode or a key that starts with `External display|`.

## Browser

The browser cannot enumerate or move windows across physical displays. Open output creates `/?display=1`. The operator drags that window to the other display and chooses Fill this screen there. Program updates travel on `BroadcastChannel` and `localStorage`. A blocked pop-up or a closed window is reported on the desk. Refresh does not reopen the pop-up, because a page load is not allowed to open one.

## Program

LIVE, Clear, and Black publish a Program packet. Selecting scripture or a song section does not. The audience window ignores a packet with a lower revision. Revision 0 from the current owner is the empty frame published when the owning session starts, so a stored slide is not shown again. A test pattern is a local overlay on the audience window and does not change Program.

## Where the code lives

- `src-tauri/src/displays.rs` — enumeration, logical placement, fullscreen, and assignment rules.
- `src/lib/display/profiles.ts` — profile edits, saved output mode, and `resolveAudience`.
- `src/lib/display/output.ts` — audience frame acceptance and the browser window contract.
- `src/lib/components/AudienceOutput.svelte` — Program renderer for the audience window.
- `src/lib/components/OutputControls.svelte` — open, close, fullscreen, test, and status.
- Settings → Displays.
