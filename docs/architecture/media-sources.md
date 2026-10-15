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

## Camera (partial)

Browser and desktop webview: `navigator.mediaDevices.getUserMedia` with `{ audio: false, video }`. Settings → Media lists cameras. Select → Preview (`previewCameraLive` / `setPreview`). LIVE copies the compiled camera card onto Program. Operator Preview may show the live `MediaStream`. `AudienceOutput` does not receive the stream. Permission denied and missing devices are desk messages. Listen in `src/lib/voice/listen.ts` stays audio-only and must not Take.

Capture lives in `session.previewCamera` and `MediaPane`, not in `PewDesk.svelte`.

Not claimed shipped until a real camera is tested.

## Browser vs desktop persistence

Same `MediaAsset.id` on services, themes, slides, and logo. Desktop `path` is a filesystem path. Browser `path` stays empty; bytes live in IndexedDB schema version 2.
