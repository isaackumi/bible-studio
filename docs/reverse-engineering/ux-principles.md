# UX principles

Production software for a volunteer on a Sunday morning, and for a producer who already knows OBS. The screen is a tool. It should be quiet.

## Principles

**Program is sacred.** The audience frame is visually distinct and changes only on Take, Clear, Black, or Logo. Browsing, searching, and editing change Preview.

**The service is the spine.** The operator always knows the current section, the current item, and the next item. Libraries are how you fill the service. They are not the live navigation.

**Keys before chrome.** Next, previous, take, clear, black, and logo work without looking down. Escape leaves a text field so the keys work again. If a control matters live, it has a key and a visible button.

**One job per mode.** Prepare is for building the service. Live hides the library depth and keeps rundown, preview, program, and the next action. Do not make the volunteer use Prepare during the sermon.

**Offline and local.** Opening the app never waits on a login, a Bible API, or a model download. Missing optional pieces (a translation pack, a future listener) degrade to manual search.

**Readable in a bright room and a dark booth.** High contrast, dense type, no decorative gradients, no cards inside cards. Motion is limited to the slide transition the congregation sees.

**Tell the truth about outputs.** Each display role (operator, audience, stage) shows where it is going. If the audience window is closed, the status says so. Do not imply a projector is live when only the preview is.

**Volunteers recover.** Clear and Black are always available. A missing media file shows a labeled placeholder on preview and does not freeze program. The last good program frame stays up until the next successful take.

**Accessibility.** Full keyboard path through search, rundown, and take. Focus is visible. Text in the operator UI meets contrast. Congregation-facing text size is a theme concern, not an afterthought.

## Avoid

- Onboarding tours that block the first service.
- Modal dialogs for live actions.
- Hidden critical controls inside a right-click.
- Animations that exist only in the operator UI.
- A dashboard of stats. The status line is enough: section, item, output health, time.

## Proposed layout

Derived from the three apps, not copied from any of them.

PewBeam’s preview-beside-live is the safety pattern. FreeShow’s project list is the spine, but it should be sections, and it should stay visible. OBS’s docks suggest two layouts rather than a reconfigurable IDE. The prompt’s three-column sketch is too wide for this laptop once the Dell is the audience screen: the operator display is a 13-inch retina, and FreeShow’s saved window is already 1680×1050.

### Prepare

```
┌ Service name          Sunday 9:00        Preview ≠ Program  ● ready ┐
├ Rundown ─────────────┬ Preview ──────────────────┬ Inspector ───────┤
│ Opening              │                           │ Theme             │
│ Worship              │   next slide, large       │ Layout            │
│ Scripture    ←       │                           │ Layers            │
│ Sermon               │                           │                   │
│ Offering             ├ Program (small, live) ────┤                   │
│ Closing              │                           │                   │
├ Bible · Lyrics · Media · Themes  (one library open) ─────────────────┤
└ Take   Cut   Fade   Clear   Black   Logo              outputs: 1/2 ──┘
```

The library is a band, not a permanent column. Opening Bible does not cover the rundown. Inspector edits the selected item. Program is always on screen, smaller than preview, with a hard color difference (a red frame on program is the usual broadcast cue; use it).

### Live

```
┌ LIVE   Worship · Verse 2          next: Chorus     00:18:42 ┐
├ Rundown (compact) ──────┬ Preview ──────────┬ Program ──────┤
│                         │                   │               │
│                         │                   │               │
├─────────────────────────┴───────────────────┴───────────────┤
│  ← Previous     Take     Next →     Clear    Black    Logo  │
└ Bible lookup (one field) ───────────────────────────────────┘
```

The lookup field accepts `John 3:16-17` and Enter to load preview. A second confirmation, or Take, sends it. Double-Enter-goes-live is how accidents happen; PewBeam does it, we should not.

### Smaller window

Below about 1280 px wide, inspector collapses to a disclosure, program becomes a thumbnail, and the library becomes a single toggle. Live mode still fits next, take, and clear.

## Output windows

These are not the operator UI.

- **Audience:** theme canvas only. No chrome.
- **Stage (when a third display, or a window, is assigned):** current text, next text, section name, elapsed timer, notes. Large type. Never the operator panels.
- **Operator:** the layouts above, on the built-in display.

This machine has two displays (built-in 2560×1600 and a Dell U2415 at 1920×1200). Phase 1 assigns operator and audience. Stage can be a window on the operator display until a third screen exists.

## Keyboard map (draft)

| Key | Action |
| --- | --- |
| Right / Down | Next item or next slide |
| Left / Up | Previous |
| Enter | Load selection into preview |
| Space or G | Take (fade) |
| C | Cut |
| Esc | Clear slide text from program, leave a text field if one is focused |
| B | Black |
| L | Logo |
| Cmd-K or / | Bible and library lookup |
| 1–9 | Jump within the current section’s items |

Final bindings can change. The set of actions should not.
