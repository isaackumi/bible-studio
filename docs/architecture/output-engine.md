# Output engine

Program is owned by `LiveState`. Outputs consume packets. They do not own Program.

Details of placement and the audience window remain in [product/display-system.md](../product/display-system.md).

## Existing publish path

Desktop: `session.pushProgram` → `api.publishProgram` → Tauri `publish_program` → `program-frame` event / `get_program`.

Browser: `publishLocal` writes `church-studio.program` and `BroadcastChannel` `"church-studio.program"`. Ownership is `church-studio.output-owner`.

`AudienceOutput.svelte` paints `packet.frame`. It does not search, edit, or call `applyProgramAction`. Do not restyle that component to invent new output types.

## Sinks

`src/lib/display/engine.ts`:

| Kind | Available now |
| --- | --- |
| `tauri-window` | Desktop |
| `browser-window` | Web |
| `ndi` | No |
| `stage` | No (assignment stored, window closed) |

A sink receives `ProgramPacket`. Closing or failing a sink must not call `applyProgramAction`. Launch still publishes an empty Program so a saved frame is not restored to the audience.

## Browser vs desktop

The browser sink is a popup (`/?display=1`). The operator moves it. Native monitor assignment stays in `src-tauri/src/displays.rs`.

NDI is a native sink. See [ndi.md](ndi.md).
