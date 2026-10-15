# Extensions

There is no plugin host. `canUse()` and the command list are the reserved gates. This note is the boundary so community work does not require a core rewrite.

## Reuse

| Existing | Extension use |
| --- | --- |
| `CommandId` / `COMMANDS` | Plugin commands call the same Take/next/settings functions |
| `PanelId` | UI contribution is a new panel id, not a second desk |
| `FeatureId` / `canUse` | Entitlement and “not in this build” |
| `Theme` | Appearance only. No JS in a theme package |
| `ItemKind` / `ContentAdapter` | Content providers compile to `PresentationModel` |
| `registerSourceCompiler` | Plugin sources compile to `PresentationModel`; they cannot Take |
| Composition templates | Community looks are data (slots + sources), not Program |
| Output sinks | Output plugins consume packets |

## Manifest (not finalized)

```json
{
  "id": "com.example.plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "apiVersion": "1",
  "permissions": [],
  "capabilities": []
}
```

Reject unknown `apiVersion`, missing permissions, and invalid JSON. Do not give a plugin the session object.

## Capability areas (planned)

Content provider, song provider, scripture provider, media source, output, theme, UI panel, importer, exporter, command, integration.

## Phone remote

The first remote is not a plugin. It is a paired local client that sends `CommandId`. Pairing: code on the operator desk. Envelope `{ v: 1, type, payload }` on `BroadcastChannel` `church-studio.remote` and on desktop HTTP `POST /v1/remote` at port 17891. Phone UI is `?remote=1` or `http://<lan-ip>:17891/`, a controller, not a display. Unpaired tokens never call `session.run`. Not shipped until a real phone on the LAN is tested.

## Themes

Factory themes already ship. Library export includes theme JSON. A community theme is data + assets, not executable script. Activating a theme updates Preview until LIVE, same as today.

## Tests (when a host exists)

Incompatible API version rejected. Missing permissions rejected. Invalid manifests rejected. Plugin throw cannot leave `workspace` JSON half-written.
