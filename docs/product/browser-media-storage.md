# Browser media storage

This is a design, not an implementation. Desktop media already works. Browser media does not.

## What exists

`MediaAsset` is `{ id, name, path, kind: "image", createdAt }`. Desktop import copies a PNG, JPEG, WebP, or GIF into the app data `media` directory and inserts a row in SQLite `media_assets`. Slides, service items, theme backgrounds, and the logo store that `id`, not the file path. `session.modelFor` resolves the id to a URL. A missing file becomes an empty frame through `presentImageOrEmpty`. It does not throw.

The browser `api.mediaList` and `api.importMedia` still call Tauri. There is no browser media store. The backup file does not include media bytes.

## Recommendation

Keep the same `MediaAsset` id on songs, services, themes, and slides. Add a browser adapter beside the existing library, not a second media model.

```text
MediaRepository
  list()
  import(file) -> MediaAsset
  url(id) -> string | null
  remove(id)

Desktop: SQLite row + file in the app data directory
Browser: IndexedDB store `media` in database church-studio, added as schema version 2
```

Schema version 2 adds one object store. It does not move songs, services, or themes. Desktop does not open IndexedDB.

## Limits for the first browser version

- Types: PNG, JPEG, WebP, GIF. Same set the desktop command already allows.
- Kind stays `"image"`. Video and audio wait.
- Reject a single file over 25 MB before writing.
- Stop the import if the origin quota is exceeded. Leave the previous store unchanged and tell the operator the image was not saved.
- Do not resize or re-encode in the first version.

## Records

Metadata matches `MediaAsset`, with `path` empty on the browser. The bytes live in the same record or in a sibling `media-bytes` store keyed by the same id. The id is a UUID created at import. Retries of the same import create a new id. They do not overwrite an existing id unless the operator replaces that asset on purpose.

Slides and themes keep `assetId`. A missing id, a missing blob, or a blob that cannot be decoded resolves to `null`. The frame stays empty. The operator can still Take, Clear, and Black.

## Backup

The library JSON cannot hold image bytes without becoming huge. A later export can be a zip: the current JSON plus a `media/` folder named by id. An import without that folder keeps existing browser blobs and leaves missing references empty. It does not delete media that the file does not mention.

## Cleanup

Do not delete a blob just because the current service does not reference it. The operator may still use it on a theme or logo. A later “unused images” action can list ids that no theme, logo, song, or service points at, and delete only the ones the operator confirms.

## Migration

There is no browser media list to migrate. The first schema version 2 open creates the empty store. Desktop files stay on disk. A future copy from desktop to browser would be an explicit export, not an automatic read of the SQLite path.

## Not in this design

Cloud media, shared drives, video, audio, and automatic transcoding.
