# Moving computers, licence moves and cloud sync

Status: approved 2026-10-24.

## Why

Churches replace computers, and a church with several computers wants one library on all of them.
Today a backup leaves out pictures and videos, there is no clear way to move to a new computer,
and a Premium licence can be stretched across laptops by keeping the old one offline. Cloud space
costs the owner money, so every plan that syncs has a limit the owner controls.

## Goals

1. **Move to a new computer**: one `.churchstudio` file holds everything, media included.
2. **One laptop per Premium licence, enforced**: moving Premium to a new laptop frees the old one,
   and the old one cannot keep Premium for long by staying offline.
3. **Church plan: up to 3 computers share one library**, like iCloud: a change on one appears on the
   others.
4. **Cloud space limits per plan**, set and changed by the owner from the admin page, with a total
   cap so the monthly bill can never surprise the owner.
5. **Churches see what uses their space** and can clean it up.

## Non-goals

- Live editing together (two people typing into the same song at once).
- Syncing what belongs to one computer: screens, the audience window, sound output, microphone,
  display choices. These differ per computer, and syncing them would send sound to the wrong
  speaker on every computer.
- Cloud space for the Free plan (the `.churchstudio` file is free).

## Anti-goals (a failure even if it works)

- A church's songs or services held back because of a licence or a full cloud space. A computer
  that loses Premium drops to Free and keeps everything.
- Anything deleted without the church choosing it (except the 30-day bin emptying itself).
- A surprise bill for the owner.
- Storage terms (R2, buckets, SQLite) in the church's screens: they see "cloud space".

## 1. The `.churchstudio` file

- One file with the library (songs, services, sermons, themes, slide decks, designs, quizzes,
  polls, layouts) and every picture, video and audio file the library uses. The format is a zip with
  a `library.json` (the current backup snapshot plus extras) and a `media/` folder, files named by
  content hash.
- Leaves out the settings that belong to one computer (listed under Non-goals), the licence, the
  downloaded Bibles and the listening model (both can be downloaded again).
- **Settings › Backup › Move to a new computer** saves it. On a new computer's first run: **Bring
  everything from your old computer** opens it. Restoring adds to what is there and never deletes.
- Large libraries: the file is written by streaming (Rust side), with progress, so a 20 GB library
  does not have to fit in memory.
- The cloud upload (part 3) uses the same rules for what counts as "everything".

## 2. Licence moves

Built (2026-10-24): Premium 1 seat, Church 3 (`SEATS`, server/api.ts); a full licence answers 409
with the list of computers; `/v1/move`; moves and releases limited per plan (`MOVES_PER_30_DAYS`:
Premium 2, Church 3); leases last 14 days (`LEASE_DAYS`); a moved-away computer gets 403 `moved`.

To add:
- **Move Premium to this computer**: when the licence is full, the app shows which computer has
  it ("Premium is active on *Pastor's Dell*, last seen 3 days ago. Move it here? That computer goes
  back to Free."). Agreeing releases the old one and activates this one in one request.
- **The moved-away computer is recorded** (`moved:<licence>` list). Its next check-in gets no lease
  and the answer "moved", and it drops to Free at once. It can only get the licence back through the
  same move, which counts against the limit.
- **Leases shortened from 30 to 14 days.** The app renews silently whenever it is online. Worst
  case of abuse: one extra laptop for 14 days.
- **Move limit for Premium: 2 in 30 days** (Church stays at 3). Support can reset it from the admin
  page (the existing "Free all seats" action).
- Church plan: a 4th computer sees the 3 in use and picks one to free.

## 3. Cloud sync

### What syncs

Each record (one song, one service, one sermon, one theme, one deck, one design, one quiz or poll)
syncs on its own, with a version number and the time and computer of the last change. Deletions
sync as markers. Media is stored once per account by content hash: the same file used in fifty
services, or on all three computers, is stored and counted once.

### How

- **Records**: one Durable Object per account (SQLite inside; the same kind as rooms). A computer
  sends its changes since the last sync and receives everyone else's. Checked on start, every few
  minutes while open, and right after a save.
- **Media**: Cloudflare R2. The app asks the server for permission to upload each file. The server
  checks the limit and answers with a short-lived upload address, or "full". Downloads happen in
  the background when another computer needs the file. R2 charges nothing for downloads.
- **When two computers change the same record**: the newest change wins. The other version is
  kept for 30 days in the history ("Earlier version from Media PC"), so nothing is lost.
- **Plans**: Church syncs between its 3 computers. Premium gets cloud backup of its one laptop (the
  same machinery, one computer), restored when it signs in on a new laptop after a move.

### Limits

| Plan | Cloud space (default) |
|---|---|
| Free | none |
| Premium | 5 GB |
| Church | 15 GB, shared by its computers |

- Records (songs, services etc.) are a few MB and **always sync, even when space is full**. The
  limit is in practice about pictures, videos and audio.
- The history and the bin (30 days) do not count, and empty themselves.
- Largest single file: 2 GB (owner setting).
- A **Sync videos** switch per account (on by default). Off: videos stay on each computer.
- At 80%: a note with a link to Cloud space. At 100%: new media stays on that computer, marked
  "Only on this computer: cloud space is full". Nothing already synced stops working.
- The server enforces the limit (it hands out the upload addresses), so the app cannot get around it.

### The church's Cloud space screen (Settings › Account)

- A bar ("9.2 GB of 15 GB"), split into Videos, Pictures, Audio, Songs and services.
- Largest files first, each with its size, how many services use it, and when it was last used.
  For each: **Remove from cloud** (stays on this computer) or **Delete everywhere**.
- Suggestions: files not used in 6 months; the bin, with **Empty now**.
- The computers syncing, and when each last synced.

### The owner's admin page

- **Cloud space settings** (owner role), changed any time without an app release:
  - space per plan (defaults: Premium 5 GB, Church 15 GB)
  - the largest single file (default 2 GB)
  - a total cap for all accounts together, in GB
- **Per account**: a different limit for one church (e.g. a church that paid for more), shown
  next to its plan's default.
- **Totals**: space used across all accounts, the estimated monthly bill, the top accounts by use.
- At the total cap, new uploads pause for everyone (records keep syncing) and the owner is emailed
  at 80% and 100%.
- Lowering a limit below what an account already uses deletes nothing. That account cannot add
  more until it is back under the limit, and it sees why.
- Every change is written to the existing admin activity log.
- Lapsed subscriptions: cloud copy read-only for 90 days, with emails at the start, 60 and 85 days;
  then deleted. The church's own computers keep everything.

## Who owns the library (decided by the owner)

The synced library belongs to the **licence**, not a person. The licence's computers (3 on Church,
1 on Premium) share it. A computer must be signed in to sync: as the licence's owner or one of its
members (server/ownership.ts). A computer that only has a key typed in keeps working but does not
sync until someone signs in. The Durable Object is named by the licence id, and every sync request
is checked against the account's access to that licence and the computer's seat.

## Decisions made while writing this up (builder's calls, open to change)

- **Workspace fields.** Synced and in `.churchstudio`: layouts, compositions, church name and
  logo, appearance and looks. Kept per computer: screens, sound, microphone, shortcuts, and
  window positions. **Secrets never leave the computer**, whether to the cloud or into the file:
  the Planning Center token and the AI and speech service keys.
- **Desktop only.** The browser version neither syncs nor writes `.churchstudio` files.
- **First sync of a computer that already has a library.** Records are merged by id. A record on
  only one side is added to the other. When both sides have the same id with different content,
  both copies are kept: the joining computer's copy is renamed "(from <computer name>)". Unedited
  starter content is the same on both sides, so it merges silently.
- **Sync follows the seat.** A computer syncs only while it holds a seat on the licence. A computer
  that is freed or moved away stops syncing at once and keeps its local copy.
- **Plan changes.** Premium to Church: the Premium backup becomes the shared library. Church to
  Premium: the library stays, and if it is over 5 GB the over-limit rule applies (nothing deleted,
  no new media).
- **Leases already given out.** Leases issued before the change still run up to 30 days, so the
  14-day bound holds fully about a month after release. Older app versions get no special refusal.
- **Media ids stay as they are.** A lookup table maps each content hash to the local media id, so
  no record is rewritten.

## Build order

1. The `.churchstudio` file (about a day). It decides what "everything" means for part 3.
2. Licence moves and 14-day leases (about a day, mostly server; ships on its own).
3. Cloud sync with limits, the Cloud space screen and the admin settings, built together so limits
   exist from the first upload (1 to 2 weeks).

## Left to the builder

The sync interval, the history and bin storage layout, the upload protocol details (single upload
vs. multipart for large files), retry and resume after a dropped connection, and the zip library.
