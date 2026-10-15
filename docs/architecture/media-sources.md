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

## Camera (not shipped)

Browser: `navigator.mediaDevices.getUserMedia`. Permission denied and missing devices are desk messages. `getUserMedia` is already used for Listen in `src/lib/voice/listen.ts`; that path must not Take.

Desktop: start with the same web API inside the webview. Native AVFoundation / Windows capture is later if the webview is not enough.

Not claimed until a real camera is tested.

## Browser vs desktop persistence

Same `MediaAsset.id` on services, themes, slides, and logo. Desktop `path` is a filesystem path. Browser `path` stays empty; bytes live in IndexedDB schema version 2.
