# NDI

NDI is a native production sink and source. It is not implemented. `canUse("ndi")` is false.

## Boundary

```text
LiveState.program
    ↓
Output engine (ProgramPacket)
    ↓
Native media / NDI layer (Tauri/Rust or other native)
    ↓
NDI network
```

Svelte UI lists sources and shows Preview/Program frames. It does not link NDI libraries.

The browser cannot load the native NDI SDK. Browser status: **Unavailable**.

## Split

| Piece | Role |
| --- | --- |
| Discovery | Find sources on the LAN |
| Input | Receive into Preview, then Take |
| Output | Send Program |
| Source management | Names, availability, last error |

Discovery or send failure is reported. It must not call `applyProgramAction`.

## Licensing (research, not legal advice)

Official sources consulted:

- [NDI SDK licensing](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing)
- [NDI for developers](https://ndi.video/for-developers/)
- [NDI Advanced SDK licensing](https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/licensing)
- [NDI SDK License Agreement (PDF)](https://downloads.ndi.tv/SDK/NDI_SDK/NDI%20License%20Agreement.pdf)

The standard SDK is described as royalty-free subject to its current terms (SDK 6.3.2 docs). Redistribution rules include shipping NDI DLLs inside the app folder, not the system path, and keeping a current SDK for product releases. H.264 / H.265 / AAC may need separate licenses. The Advanced SDK is commercial and needs a vendor ID from Vizrt (`licensing@ndi.video` / `sales@ndi.video`).

Do not ship NDI until counsel or Vizrt confirms the product’s use (send vs receive, HX codecs, commercial distribution) matches the signed terms. Bundle only files the agreement allows.

## Implementation gate

CS-P1-007 architecture (this document + `outputSinks` `ndi` row). CS-P1-008 is the native integration. Not claimed without an NDI runtime on the machine.
