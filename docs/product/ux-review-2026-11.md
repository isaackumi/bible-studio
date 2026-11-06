# UX review and competitor gaps, November 2026

How the app looks to a volunteer operator on a Sunday morning, page by page. Each point says what's wrong, why it matters, and what was done or should be done.

Sources:
- every desk and the main dialogs, in a headless browser at 1600×960 and 1280×760;
- a read of the code for interaction problems;
- a scan of the current market (ProPresenter 21/22 beta, EasyWorship 8, Proclaim, FreeShow 1.6, Holyrics, MediaShout 7, and AI-first newcomers such as SmartVerses and Pewbeam).

**Status:**
- **Fixed** ships in the `ux-review` branch.
- **Next** is recommended and not yet built.

---

## The short version

Church Studio already does things no rival does in one app:
- verses heard from the sermon go straight to Preview, with a choice of engines on the computer or online;
- the software follows the singing and finds the song and part;
- translated live captions on phones;
- congregation quizzes, polls and prayer requests;
- African-language Bibles;
- Linux and browser versions;
- presentation and production control in the same app.

The weak spots weren't missing features. The biggest was **live safety**: keys and layouts that could change what the congregation sees by accident. That costs a church's trust in one Sunday, and it's now mostly fixed. Next comes **consistency between the three desks**, and then a small number of real feature gaps.

---

## 1. Live safety: what the congregation sees

| # | Problem | Why it matters | Status |
|---|---|---|---|
| 1 | **Ctrl/⌘ + C, B, W and L ran desk actions.** Copying selected lyrics (Ctrl+C) also ran CUT and sent Preview to the screen. ⌘B blacked out, ⌘W cleared the words, ⌘L showed the logo. | Copying is the most common shortcut there is. An operator copying a verse into a chat sent it to the congregation. | **Fixed.** No desk shortcut runs while Ctrl, ⌘, Alt or Shift is held, and a test covers it. |
| 2 | **Moving an item with Alt+↓ also stepped the service.** With Auto LIVE on, the next item went live. | Reordering during a service is normal, and this made it dangerous. | **Fixed.** The service page ignores keys already handled, and keys inside dialogs. |
| 3 | **The "Backspace just after typing" guard never worked.** The desk built a new key handler on every keystroke, so it forgot the last time you typed. | Click out of a search box, press Backspace to fix a typo, and the screen cleared. | **Fixed.** One handler for as long as the shortcuts stay the same. |
| 4 | **The Audience and Pictures drawers covered LIVE, BLACK, CLEAR and Program on screens under 1440px** (most laptops). They also covered Settings, and Escape didn't close them. | While running a poll, the operator couldn't reach BLACK. | **Fixed.** On smaller screens the drawer opens below the top bar and under dialogs, and Escape closes it. |
| 5 | **LIVE and BLACK moved under the pointer.** Pointing at CLEAR slid CLEAR WORDS out sideways, and the Undo button came and went, so LIVE and BLACK shifted left as you aimed at them. | A button that moves as you aim gets mis-clicked: BLACK instead of CLEAR, live. | **Fixed.** CLEAR WORDS drops down below CLEAR, and Undo keeps its place. |
| 6 | **BLACK had no "on" state.** A screen black on purpose looked the same as nothing being sent. | Operators couldn't tell why the room was dark. | **Fixed** on the Presenter and Production desks: BLACK stays lit while the screen is black. |
| 7 | **Auto LIVE was a chip that could only turn off**, and it read like a button. | People didn't know whether a click would go live. | **Fixed.** It's an on/off switch for as long as a service runs. **Next:** make it opt-in per service. That changes what existing churches are used to, so it's left as a product decision. |
| 8 | **The running service could be deleted mid-service**, and another one silently opened in its place. | That's the whole running order gone in front of everyone. | **Fixed.** It's refused, and the message says to end the service first. |
| 9 | **Keys pressed inside small pop-ups** (a part's time, the Conductor's Tools panel) reached the desk, so Space ran Take. | You pressed a button in a pop-up, and the screen changed. | **Fixed.** Keys inside any dialog belong to it. |
| 10 | **The L key shows the logo, but Presenter has no Logo button.** | An accidental L has no visible cause or control. | **Fixed.** LOGO sits beside CLEAR, as on the other two desks. |

## 2. Feedback, errors and recovery

| # | Problem | Why it matters | Status |
|---|---|---|---|
| 11 | Toasts timed out while the pointer was on them. | The Undo slipped away under your hand. | **Fixed.** Toasts wait while hovered or focused. |
| 12 | Deleting a song couldn't be undone; the only guard was a 3-second "click again". | One wrong click lost a song typed in by hand. | **Fixed** for songs, sermons, slide decks, themes and media (Undo for 10 seconds). A media file leaves every list at once, but is removed from disk only after the Undo has passed. |
| 13 | There is only one toast at a time, so a new one replaces the last. "Program is black, Undo" disappears as soon as "Added to service" arrives. | The important message loses to the trivial one. | **Fixed.** A warning or Undo toast stays; a plain confirmation that follows goes to the status line. |
| 14 | Toasts sit bottom-left, over the song list, the Conductor's listening bar and Production's Scenes panel. | They cover the controls you need next. | **Fixed.** With the pointer over its words a note turns see-through and the click goes to what's beneath. Its buttons still work, and it waits meanwhile. |
| 15 | Some failures say nothing: Bible word search, chapter load, the starter kit, the sign-in browser, and unused-media clean-up (where a failed lookup reads as "no files"). | A silent failure looks like the app is broken, or worse, gives a wrong answer. | **Fixed.** Each now says why it failed, where it happened. |
| 16 | "Reset workspace" has no confirmation or Undo. | It throws away a whole desk layout in one click. | **Fixed.** Undo in the toast for 10 seconds. |

## 3. Consistency

| # | Problem | Why it matters | Status |
|---|---|---|---|
| 17 | The three desks name and style the same actions differently: "LIVE/BLACK/CLEAR" with "Preview/Program" on one, "Live/Black/Clear" with "Next/Live" on another, and four button styles in Production's transport column. | Volunteers rotate between desks, so every difference is something to relearn. | **Fixed** for the Production transport (one style, icons on all). **Next:** one vocabulary across the desks ("Next" is friendlier; pick it or "Preview" and use it everywhere). |
| 18 | "Favourites" and "Favorites", "Colour" and "Color" both appear. | It looks unfinished, and it splits search results. | **Fixed.** US English throughout: 64 lines, with their translations kept. |
| 19 | The live transcript had two Listen buttons. | Two controls for one thing is confusing. | **Fixed.** One remains. |
| 20 | The Design studio showed "Saved" beside an orange **Save changes** that looked active. | "Is it saved or not?" | **Fixed.** When there is nothing to save, the button is plainly grey. The same now holds for every filled desk button that cannot be pressed yet. |
| 21 | Audience tabs wrapped ("Pick / someone"). | It looks broken. | **Fixed.** |
| 22 | Text at 10px is allowed by the design rules. | It's hard to read at arm's length, on a dim booth screen. | **Fixed.** The minimum is 11px; 43 places were raised. |

## 4. Discoverability

| # | Problem | Why it matters | Status |
|---|---|---|---|
| 23 | "Message to the stage…" opens the whole Settings dialog, and the desk's keys stop while it's open. | It's a live action buried in Settings. | **Fixed.** Its own small dialog from On the screen, with six ready messages. The menu shows On while one is up. |
| 24 | Preview and Program are only explained under More › "How this desk works". | They're the two words a newcomer must understand first. | **Fixed.** For the first five times LIVE: *only you see this* beside Preview, *what the congregation sees* beside Program. |
| 25 | The Readiness check is in the More menu. | Its best moment is just before the service starts. | **Fixed.** The Start service dialog checks while it is open and says *All set* or what needs a look, with See all. |
| 26 | The favourite star only shows on hover in song search. | People can't see what they can star. | **Fixed.** Shown faintly at rest. |

## 5. Already improved this week

- **Cloud space:** it opens with one status (in sync, changes waiting, offline, full), then a plain "When to sync" choice. Sync now sends waiting changes.
- **Songs:** the list scrolls smoothly in big libraries, and each row shows a letter tile, the first line and the number of parts.
- **Presenter transcript:** a listening chip, the newest line marked, and detections as cards with a confidence bar.
- **Slideshows** stay in their folder.
- **Countdowns** in production scenes show at the size you set.
- **The floating "Now running" box** can be moved and hidden.
- **Closing the desk** closes the app (Windows).

---

## 6. Compared with competitors

Checked against vendor pages and release notes, November 2026. These are often thought missing but **already exist**:
- songs in two languages (a second-language line under each line);
- editable PowerPoint import;
- nursery and other alerts over live slides;
- CCLI usage reports;
- SongSelect import;
- Planning Center import;
- built-in streaming.

| Gap | Who has it | Why churches care | Effort | Recommendation |
|---|---|---|---|---|
| **Automatic CCLI reporting** (sending the usage report straight to CCLI) | ProPresenter, EasyWorship, Proclaim | It's a legal duty, done by hand every quarter. | Medium; needs CCLI partner approval | **1st.** Apply to CCLI now: the report data already exists (`song-usage.ts`). |
| **Stage display layout editor** (free placement of current, next, notes, clock and timer; several layouts) | ProPresenter, FreeShow, Holyrics | Worship leaders and preachers read it every week. | Medium | **2nd.** It builds on the existing stage output. |
| **NIV / ESV / NKJV text** | ProPresenter (paid add-ons) | Most English-speaking churches expect them. | Business, not code: publisher licences | **3rd**, through Bible API partners (e.g. API.Bible). |
| **MIDI and timecode triggers** (a button on a pad or a cue from the band's tracks moves slides) | ProPresenter | Bands with click tracks run whole sets this way. | Medium (Web MIDI or a Tauri plugin) | **4th.** MIDI first; DMX and timecode later. |
| **Real-time co-editing of a service** | Proclaim, ProPresenter 22 | A team plans from home and the booth sees it live. | Hard (needs merging or locking) | **Later.** Today's library sync covers most of the need. |
| **Mobile planning app** | Proclaim | Volunteers prepare on their phones. | Medium (the UI is already web) | **Later.** Start with a read-only service view on the phone remote. |
| **Text animations and per-slide transitions** | ProPresenter 22 | They look polished on stream. | Medium | **Later.** |
| **Stock media and curriculum library** | ProPresenter (ProContent) | Churches with small budgets want backgrounds. | Content partnerships | Partner, don't build. |
| **MIDI/DMX lighting, kids check-in** | ProPresenter (DMX); church management systems | Large churches only. | High | Skip, or integrate. |

### Where Church Studio leads
- **Voice-to-scripture built in**, with engines on the computer or online, confidence scores and a Preview gate. Rivals rely on add-ons, and FreeShow only has it in beta.
- **Following the singing** and **translated live captions on phones**. No rival found.
- **The congregation on their phones** (Q&A, polls, quizzes, prayer requests). No rival found.
- **African-language Bibles** and a French/Spanish interface: a real edge in West Africa, where competing newcomers report demand.
- **Linux and browser versions** besides Windows and Mac.
- **Presentation, streaming and OBS/vMix control, and an AI assistant in one app**, where rivals sell separate products.

---

## 7. Suggested order of work

1. **Decisions:** opt-in Auto LIVE (7), and one desk vocabulary (17).
2. **Stage display layout editor.**
3. **CCLI auto-reporting** (start the partner application now; it takes time).
4. **MIDI triggers.**
5. **Bible licensing** (business development).

**Budget:** the language files now have their own budget and are left out of the desktop total, so the total is about 4.2 MB of 5.12 MB. The stage editor and MIDI should still load on demand, as the Conductor desk does.
