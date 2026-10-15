# Subscription architecture

Billing is not part of the desktop app. The seam is `canUse(feature)` in `src/lib/platform/capabilities.ts`.

Core features return true and work offline:

```text
operator, workspace, audience-output, bible, lyrics, slides,
media-images, themes, service, voice-detect, sermon, remote-control
```

Local pairing (`?remote=1`) is core. A later cloud hop (CS-P2-006) can stay behind an entitlement. These return false until a real entitlement source exists:

```text
stage-display, ndi, cloud-sync, ai, streaming, recording
```

A later license or subscription service can replace the set inside `canUse`. Callers stay the same. The live state machine does not ask. A locked feature must not be required to Take, to open a saved service, or to show the audience window.

## Later services

```text
Desktop app
  ├── Local SQLite and media files
  ├── Account service
  ├── License service
  ├── Cloud sync
  ├── Cloud media
  └── Subscription service
```

Plans we expect to be able to express, without building them now: Free, Pro, Church, Enterprise. Likely paid capabilities include cloud sync, team collaboration, remote control, advanced media, streaming, AI assistance, NDI, stage display, and multi-campus administration.

Account and License in Settings describe that boundary. They do not collect credentials or start a checkout.

## Rules for new premium work

- Add the feature id to `FeatureId` before adding UI that depends on it.
- Keep the offline path working when `canUse` is false.
- Store entitlements outside the service file and outside the preview/program slots.
- Do not hide Take, Clear, or the audience output behind a plan.
