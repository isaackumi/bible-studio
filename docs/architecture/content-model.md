# Content model

This is the presentation contract. It describes the code that already ships and where new kinds attach. It does not replace [product/product-architecture.md](../product/product-architecture.md).

## Existing path

```text
PresentationItem (ItemKind)
        ↓
session.modelFor
        ↓
PresentationModel
        ↓
setPreview  →  LiveState.preview
        ↓
applyProgramAction(take|cut|clear|black|logo)  →  LiveState.program
        ↓
ProgramPacket
        ↓
Output sinks
```

`ItemKind` today: `"bible" | "lyric" | "slide" | "image" | "announcement"`.

`PresentationLayout` today: `"scripture" | "lyrics" | "title" | "image" | "empty" | "black" | "logo"`.

`session.selectItem` and `session.previewPassage` call `setPreview`. They do not call `applyProgramAction`. Text and Markdown import compile to slides through the same path. A failed import does not call `applyProgramAction`. Unknown service item kinds are kept on library JSON.

## Adapter

`src/lib/domain/content.ts` names future source kinds (`sermon`, `video`, `camera`, `ndi`, `plugin`) without putting them on the service JSON. A future kind either:

1. Compiles to an existing `ItemKind` / `PresentationLayout`, or
2. Adds a value to `ItemKind` with a workspace/library schema bump.

Do not create a parallel “content engine” that bypasses `PresentationModel`.

## Sermon

Persisted library document (`sermons` store / SQLite table). Not an `ItemKind` on the service JSON.

```text
Sermon
  title, speaker
  notes          ← operator only
  sections[]
    notes        ← operator only
    items[]      ← existing PresentationItem (usually a title slide)
```

`sermonAudienceItem` compiles a section to its first item (slide, scripture, or image). `deskNotes` stays on the operator desk. Notes are not a `PresentationLayout`. `AudienceOutput` never receives them. Search, attach, and reorder are CS-P1-001. Preview a section with `setPreview`. LIVE still sends Program.

## Safety

Covered by `src/lib/domain/live.test.ts` and `src/lib/domain/content.test.ts`. Selecting a future camera stand-in writes Preview only. Take copies it to Program.
