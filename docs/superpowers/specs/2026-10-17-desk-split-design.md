# Desk split: Presenter for words, Production for media

Date: 2026-10-17. Status: built (see "As built" at the end).

## Why

The Presenter Desk header holds the library tabs (Scriptures, Slides, Songs,
Media, Sermon, Looks), the output buttons (LIVE, BLACK, CLEAR) and about ten
tool icons. The tab strip (`.pb-modes`, `flex: 1 1 0; overflow: auto`) gets
squeezed until only Scriptures shows. Operators can't find the other modes.

The owner's direction: Presenter Desk → Scripture already feels right as a
place for scripture. The Production Desk is where media, video and streaming
belong.

## Goals

- Every mode on a desk is visible and one click away at a 1280 px wide window.
- The Presenter Desk handles the spoken and sung word, in the existing
  Preview → LIVE flow.
- The Production Desk handles anything visual: images, video, cameras, slide
  decks, Looks and scenes, using its scene and source model.

## Non-goals

- Streaming output (RTMP/SRT/NDI). The Production Desk gets the room for it,
  but sending a stream isn't part of this change.
- New slide editing features. The deck editor moves as it is.
- Changing how Program, the audience window or the remote work. Both desks
  still share one Program.

## Anti-goals

- Hiding a mode behind a menu that has to be opened to discover it.
- Two different ways to put the same video on screen, depending on the desk.

## Presenter Desk: the words desk

Modes: **Scriptures** (default), **Songs**, **Sermon**.

*My call:* Songs and Sermon stay here. Lyrics and sermon notes follow the same
text-on-Preview → LIVE flow as scripture, and a worship leader switches
between scripture and lyrics often.

The mode switcher leaves the crowded top bar and becomes a segmented control
at the top of the library column. With 3 modes it never truncates. Keyboard:
`Alt+1/2/3`. If the library column is hidden, the switcher shows in the top
bar instead (3 items fit there).

```
┌ top bar ──────────────────────────────────────────────────────────────┐
│ [Output ▾] [LIVE] [BLACK] [CLEAR]            tools… [Desk ▾] [⚙]      │
├ library ───────────────┬ preview / program ──────┬ queue ─────────────┤
│ [Scriptures|Songs|Sermon]                        │                    │
│ search / book / chapter│                         │                    │
```

Things leaving this desk:
- **Slides**: the deck library and editor move to the Production Desk.
- **Media**: the media library moves to the Production Desk.
- **Looks**: already on the Production Desk (the Looks toggle). The duplicate
  is removed here.

In their old place, the Presenter Desk keeps a small "Open in Production
Desk" link: in the Queue, a slide or image item shows it in place of the
editor. Queued slide, image and video items still play from the Presenter
queue, because a service plan mixes all kinds of item.

## Production Desk: the visual desk

A new **Media** dock joins Scenes, Sources and Controls in the bottom row. It
has 3 tabs, always visible: **Files** (images and video, import, set logo),
**Cameras** (list, permission state, Properties) and **Slides** (decks with
thumbnails, open the editor).

Each item has one main action: **Add to scene**. It adds the file, camera or
deck page as a source to the scene on Preview (shared source rules apply), so
it reaches Program only on TAKE. Drag onto the Sources list does the same.

To support decks, `SOURCE_KINDS` gains **Slides** (`deckId`, `pageId`), drawn
by the existing deck page renderer. The Sources Properties dialog lets you
pick the page and go to the next or previous page.

```
├ scenes ─────┬ sources ───────┬ media ──────────────────┬ controls ──────┤
│ ▤ Welcome   │ ⠿ Camera 1  👁🔓│ [Files|Cameras|Slides]  │ Transition …   │
│ ▤ Sermon    │ ⠿ Lower 3rd 👁🔓│ ▢ intro.mp4  [Add]      │                │
```

The Media dock shows and hides like the other docks, and its width is saved
in `production.docks`, which now has 4 sizes and a migration from the old 3.

## Constraints

- Svelte 5 runes, `paneforge` docks, the existing `Icon` set, and the
  `desk-btn` styles.
- Saved workspaces from before the change still open: a saved Presenter mode
  of `slides`, `media` or `looks` falls back to `scriptures`.
- Typecheck and tests stay green. New tests cover the `slides` source kind
  (sanitize and round-trip) and the 3→4 dock migration.

## Left to the builder

- The exact look of the segmented control and the Media dock tabs (follow the
  Scenes and Sources docks).
- What a slide or image queue item shows when selected in the Presenter
  Queue, as long as it links to the Production Desk.
- Whether "Add to scene" on a locked scene is disabled or explains itself.
  Either is fine if it says why.

## Phasing

1. Presenter: 3 modes, visible segmented switcher, remove Slides/Media/Looks.
2. Production: Media dock with Files and Cameras, Add to scene.
3. Production: Slides source kind and the Slides tab.

Each phase ships on its own and keeps the app usable.

## As built (2026-10-17)

Changes from the plan above, made while building:

- **Mode switcher stays in the top bar** as a fixed segmented control, not in
  the library column. The Songs and Sermon modes replace the whole desk
  layout, so a library-column switcher would vanish in those modes. The
  switch never shrinks (`flex: none`). The tool icons scroll instead.
  `Alt+1/2/3` pick modes.
- **No Slides source kind.** The Production Desk Preview monitor shows any
  Preview frame, so deck pages, single images, videos and cameras reach it
  through the existing preview paths (`previewDeckPage`, `previewModel`,
  `previewCamera`). Each item in the Media dock has **Preview** (the item
  alone) and **Add to scene** (as a shared source). Slides use the deck
  library's own page buttons.
- **Phases built together** so that no step drops slides or media from the
  app. The slides panel is now `SlidesPanel.svelte` (decks, service slides,
  slide editor, deck editor), used by the Media dock.
- **Media dock visibility** lives in `production.mediaOpen`, because layout
  panels can't hold a new panel id without a layout migration.
- **Queue items stay as they are.** Slide, image and video items still
  preview from the Presenter queue. The "Open in Production Desk" link is
  not built.
