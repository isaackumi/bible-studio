# Workspace system

The operator window is rendered from a layout document. Panel components do not own their position.

## Document

A workspace layout has an id, name, kind (`bible`, `production`, `simple`, `custom`), region sizes, a center axis, and a panel list.

```text
PanelPlacement
  panelId, region, order
  visible, collapsed
  floating, x, y, width, height
```

Regions are `left`, `center`, `right`, and `bottom`. Preview and program belong in `center`. The center axis is `column` (preview over program) or `row` (preview beside program).

Built-in layouts:

| Layout | Arrangement |
| --- | --- |
| Bible Operator | Service, preview over program, Bible and the other libraries as tabs |
| Live Production | Service, preview beside program, Bible and lyrics |
| Simple Presenter | Service, preview over program, libraries hidden until restored |

Operators can rearrange a built-in layout, reset it, or Save as a new layout. Duplicate, rename, and delete apply to personal layouts. Built-in layouts are not deleted. Restore built-in layouts replaces those three and keeps personal copies.

## How the screen is built

`presentLayout(layout, width, { live })` returns a view model. The Svelte shell paints that model: docked regions, splitters, tabs, a compact overflow bar, and floating panels. Saving writes the layout document, not the adapted view. A medium window can show the service under the preview while the saved region for Service remains `left`.

Breakpoints, using the operator window's CSS width:

- 1360 and wider: the saved regions.
- 1080–1359: left-region panels move below preview and program for that paint.
- Below 1080: side panels become a bar. Preview and program stay in the center.

Live mode hides Bible, lyrics, slides, media, and theme for that paint. Their saved visibility is unchanged. Prepare shows them again.

## Interaction

- Drag a panel grip or tab onto another region to dock it.
- Drag a splitter to resize a region or the preview/program split. Sizes are clamped.
- Hide and Show from the panel or the Panels menu.
- Collapse a panel to its title.
- Float lifts a panel over the workspace. Dock sends it back. On a compact window, floating panels join the overflow bar so they stay reachable.
- The layout is written to the workspace document. In the desktop app that row is SQLite. A browser preview stores the same JSON in local storage so the shell can be exercised without Tauri.

Restart loads `activeLayoutId` and the panel list, then paints it.

The Production Desk uses PaneForge split groups for its Preview / transition / Program stage and its Scenes / Sources / Controls docks. Their proportions are stored separately in the workspace document, so resizing production panes does not change Presenter Desk sizing. Reset workspace restores the factory production proportions; temporary Focus mode does not save its expanded view over them.

## Commands

Keyboard shortcuts go through `src/lib/keyboard/manager.ts` into `session.run`. Program commands are take, cut, clear, black, and logo. Next and previous change the preview cursor. Settings consumes Escape and the shortcut keys so a settings field cannot Take.

## Where the code lives

- `src/lib/workspace/layout.ts` — factories, edits, presenter, grid plan.
- `src/lib/workspace/document.ts` — load and repair the workspace JSON.
- `src/lib/components/workspace/WorkspaceHost.svelte` — paint the presenter.
- `src/lib/app/session.svelte.ts` — persist edits and keep them off the program slot.
