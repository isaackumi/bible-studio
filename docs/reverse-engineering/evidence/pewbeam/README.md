# PewBeam evidence notes

Collected 14 October 2026 by read-only inspection. No screenshot file was produced: the window does not publish an accessibility window id, so `screencapture -l` had nothing to capture.

## What was read

- `/Applications/Pewbeam.app` bundle metadata, code signature, linked frameworks, and resource filenames.
- Menu bar of the running process through System Events.
- Directory names and file sizes under `~/Library/Application Support/Pewbeam` and `~/Library/Application Support/com.pewbeam.app`.
- Key names in `resources/state.json`, `translation_settings.json`, and `font-cache.json`. Values that could be secrets were not recorded. `auth/choice.json` and `license/device_fingerprint` were not opened.
- The first line of the KJV SQL script, which is a `CREATE TABLE`. Verse rows were not copied here.
- Public documentation at https://pewbeam.com/docs on the same day.

## What was not done

- Transcription was not started.
- HDMI preview was not opened.
- Theme Designer was not confirmed open. The menu item exists.
- Settings contents were not readable. The Settings menu item was clicked once; no second accessibility window appeared.
- No license, payment, or account screen was completed.
- No network request was sent to PewBeam’s local API or to a payment service.
