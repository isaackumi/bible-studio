# Media sources

Images already exist. Camera, video files, screen capture, and NDI are future sources that still have to compile to Preview, then Program.

Desktop image import is implemented. Browser media storage is in [product/browser-media-storage.md](../product/browser-media-storage.md): IndexedDB schema version 2, store `media`.

## Today

`MediaAsset = { id, name, path, kind: "image", createdAt }`.

Desktop: SQLite `media_assets` + files under app-data `media`. Allowed types: png, jpg, jpeg, webp, gif.

Browser: IndexedDB `media` store. `path` is empty. `api.mediaList` / `importMedia` / `mediaUrl` use the browser adapter.

`session.modelFor` resolves an image id to a URL. Missing file → `presentImageOrEmpty` → empty frame.

## Planned source list

```text
VideoSource
  Camera          getUserMedia first
  Screen capture  getDisplayMedia later
  Video file      MediaAsset.kind after image browser store
  NDI             native only, see ndi.md
```

Do not put capture code in `PewDesk.svelte`. Select a source → `setPreview`. LIVE copies to Program.

## Composition layers

A camera, video file, or future NDI input is a **media source**, then a `SourceRef` on a composition layer. The composition engine does not open devices.

```text
Camera / Video / NDI
        ↓
Media Source API  (camera.ts today; NDI later, native only)
        ↓
SourceRef { type: "camera" | "video" | "ndi", ... }
        ↓
compileSource → PresentationModel
        ↓
Composition layer
```

`presentCamera` is the stand-in paint until a real capture is wired into a layer. Composition `FrameView` does not receive `MediaStream`. `AudienceOutput` never does. See [composition-engine.md](composition-engine.md).

## Camera (partial)

Browser and desktop webview: `navigator.mediaDevices.getUserMedia` with `{ audio: false, video }`. Settings → Media lists cameras. Select → Preview (`previewCameraLive` / `setPreview`). LIVE copies the compiled camera card onto Program. Operator Preview may show the live `MediaStream`. `AudienceOutput` does not receive the stream. Permission denied and missing devices are desk messages. Listen in `src/lib/voice/listen.ts` stays audio-only and must not Take.

Production Desk camera sources are named shared sources with a device and a mirror setting (Properties dialog). Mirror flips the `<video>` only. The Properties thumbnail opens its own short-lived stream and stops it on close.

Capture lives in `session.previewCamera` and Looks (`previewLook` opens a matching camera feed). Not in `PewDesk.svelte`.

A composition camera layer uses the same feed: `cameraFeedForLayer(..., "preview")`. Operator Preview may show the `MediaStream` inside that region. Program monitors and `AudienceOutput` never receive the stream; they paint `presentCamera`. See [composition-engine.md](composition-engine.md).

Not claimed shipped until a real camera is tested.

## Browser vs desktop persistence

Same `MediaAsset.id` on services, themes, slides, and logo. Desktop `path` is a filesystem path. Browser `path` stays empty; bytes live in IndexedDB schema version 2.
