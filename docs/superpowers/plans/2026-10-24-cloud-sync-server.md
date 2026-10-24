# Cloud Sync (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The licence server keeps one library per licence that its computers push changes to and pull changes from, stores media once per licence in R2 within a per-plan limit the owner controls, and shows the owner the totals.

**Architecture:** A `LibraryObject` Durable Object (SQLite) per licence holds records (collection, id, document, time, device) with a running sequence number, a 30-day history of overwritten versions, a 30-day bin of deletions, and the media index. Worker routes under `/v1/cloud/` check the account token, the licence (owner or member) and the computer's seat, then forward to the object; media bodies stream to and from R2 directly in the worker. Limits live in KV (`cfg:cloud`, with per-licence overrides) and are read by the worker on every media claim; usage per licence is mirrored to KV for the admin page.

**Tech Stack:** Cloudflare Workers, Durable Objects with SQLite, R2, KV; Vitest with the existing `memoryStore` and a memory R2 stand-in.

**Spec:** docs/superpowers/specs/2026-10-24-cloud-sync-design.md, section "3. Cloud sync" and "Who owns the library".

## Global Constraints

- The library belongs to the **licence**. Every cloud request carries `{ token, device }`; the account must own or be a member of the licence (server/ownership.ts `mayUse`) and `device` must be on `act:<licence>` (a current seat). Otherwise 403 `{ noSeat: true }` / 401.
- Defaults: Premium 5 GB, Church 15 GB, largest file 2 GB, total cap 500 GB (`cfg:cloud`), each changeable from the admin page without a release; a per-licence override `cloudcap:<licence>` (GB) wins over the plan default.
- Records always sync, even over the limit; only media is refused when full (`{ full: true }`).
- Newest `at` wins per record; the version it replaces is kept 30 days (history); a deleted record is kept 30 days (bin). Nothing is deleted without a request, except history and bin ageing out.
- Media is stored once per licence by SHA-256 (`lib/<licence>/<hash>` in R2) and counted once.
- Lapsed plan: pushes and media uploads refused with `{ readOnly: true }`; pulls allowed for 90 days; then the object wipes itself (alarm). Emails to the owner at day 0, 60 and 85.
- Totals: at 80% and 100% of the total cap the alerts email gets a line; at 100% every media claim is refused with `{ paused: true }`.
- No internals in church-facing messages (R2, KV, Durable Object).
- Commits carry no attribution lines.

## Review Focus

1. **Two computers push the same record within the same second.** Expect one winner by `at`, the other kept in history, both pulls converging. Task 2 test `keeps the newest and files the other in history`.
2. **A computer that lost its seat (moved away) keeps pushing.** Expect 403 `noSeat` and nothing stored. Task 3 test `refuses a computer without a seat`.
3. **A media claim for a file already in the index.** Expect `{ upload: false, stored: true }` and no second count. Task 2 test `counts a file once however many claims`.
4. **An upload that never completes** (claimed, body never sent). Expect the pending claim to expire after 24 h and not count toward usage. Task 2 test `drops a claim never finished`.
5. **The owner lowers a limit below current usage.** Expect no deletion, `{ full: true }` on the next claim, and `usage.over = true` for the church's screen. Task 4 test `lowering a limit deletes nothing`.

---

### Task 1: Settings for cloud space, read by the worker

**Files:**
- Create: `server/cloud-config.ts`
- Modify: `server/wrangler.jsonc` (R2 binding `CLOUD`, bucket `church-studio-cloud`; DO binding `LIBRARIES` → `LibraryObject`; migration tag `library-v1`), `server/paddle.ts` (Env fields `CLOUD?: R2Bucket; LIBRARIES?: LibraryNamespace`, passed into `ApiConfig` as `cloud` and `libraries`), `server/api.ts` (`ApiConfig` gains `cloud?: R2Like; libraries?: LibraryNamespace`)
- Test: `server/cloud-config.test.ts`

**Interfaces:**
- Produces:
  - `export type CloudLimits = { premiumGb: number; churchGb: number; maxFileGb: number; totalCapGb: number }`
  - `export const CLOUD_DEFAULTS: CloudLimits = { premiumGb: 5, churchGb: 15, maxFileGb: 2, totalCapGb: 500 }`
  - `export async function cloudLimits(store: Store): Promise<CloudLimits>` (KV `cfg:cloud` merged over defaults; bad values fall back field by field)
  - `export async function setCloudLimits(store: Store, patch: Partial<CloudLimits>): Promise<CloudLimits>` (each field a positive number ≤ 100000)
  - `export async function licenceLimitBytes(store: Store, licence: string, plan: LicensePlan): Promise<number>` (override `cloudcap:<licence>` GB, else the plan's; GB × 1e9)
  - `export type R2Like = { put(key: string, body: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>; delete(key: string | string[]): Promise<void>; head(key: string): Promise<{ size: number } | null> }`
  - `export function memoryR2(): R2Like` for tests.

- [ ] **Step 1: Write failing tests**: `defaults when nothing is set`; `merges a saved patch field by field and ignores junk` (`{ premiumGb: "x", churchGb: 20 }` → premium 5, church 20); `a licence override wins` (`cloudcap:abc` = 40 → 40e9 for a premium licence); `memoryR2 round-trips a body and reports size`.
- [ ] **Step 2: Run** `npx vitest run server/cloud-config.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** cloud-config.ts and the bindings. `wrangler.jsonc`: `"r2_buckets": [{ "binding": "CLOUD", "bucket_name": "church-studio-cloud" }]`, add `{ "name": "LIBRARIES", "class_name": "LibraryObject" }` to `durable_objects.bindings`, and a migration `{ "tag": "library-v1", "new_sqlite_classes": ["LibraryObject"] }`. (The bucket itself is created by hand once: `npx wrangler r2 bucket create church-studio-cloud`; note it in server/README.md.)
- [ ] **Step 4: Run** the test and `npm run check:server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Cloud space limits: defaults, owner settings and per-licence overrides, with the R2 and library bindings"`

### Task 2: The library object

**Files:**
- Create: `server/library.ts`
- Test: `server/library.test.ts`

**Interfaces:**
- Produces `export class LibraryCore` (pure, over a `LibraryStore` interface with the SQL the object runs; a memory implementation for tests), used by `export class LibraryObject` (the Durable Object, same shape as `RoomObject`). Methods (all return `{ ok: true, data }` or `{ ok: false, status, error }`):
  - `push(input: { device: string; changes: Change[]; now: number }) → { seq: number; applied: number; conflicts: Array<{ col: string; id: string; keptAt: number }> }` where `Change = { col: string; id: string; at: number; doc: unknown | null }` (`doc: null` = deleted). A change applies when `at` is newer than the stored `at` (or the record is new); the replaced document goes to `history` with `until = now + 30d`; a deletion moves the document to the bin (`deletedAt`); every applied change gets the next `seq`. `col` is one of `song | service | sermon | theme | deck | composition | game | playlist | template | macro | overlay | layout | source | settings`; anything else is refused 400.
  - `pull(input: { since: number; limit?: number }) → { seq: number; changes: Change[]; more: boolean }` (rows with `seq > since`, oldest first, at most 500; deletions as `doc: null`).
  - `claimMedia(input: { hash: string; bytes: number; name: string; kind: string; mediaId: string; device: string; now: number; limitBytes: number; maxFileBytes: number; paused: boolean }) → { upload: boolean; stored: boolean; full?: boolean; tooLarge?: boolean; paused?: boolean; usedBytes: number; limitBytes: number }`: `stored` when the hash is already stored (no count); `full` when `used + bytes > limitBytes`; a pending claim lasts 24 h.
  - `mediaDone(input: { hash: string; bytes: number; now: number }) → { usedBytes: number }` marks stored and counts it.
  - `media(input: { now: number }) → { items: Array<{ hash: string; mediaId: string; name: string; kind: string; bytes: number; usedIn: number; lastUsedAt: number | null; storedAt: number }>; usedBytes: number; binBytes: number }`.
  - `removeMedia(input: { hash: string; everywhere: boolean; now: number }) → { usedBytes: number; deleteKey: boolean }` (the worker deletes the R2 object when `deleteKey`; `everywhere` also writes a deletion change for every record that referenced it, by `col/id` lookups the object keeps from `usedIn` scanning of `doc` strings for the media id).
  - `history(input: { col: string; id: string }) → { versions: Array<{ at: number; device: string; doc: unknown }> }`.
  - `bin(input: { now: number }) → { items: Array<{ col: string; id: string; deletedAt: number; name: string }> }`, `restore({ col, id, now })`, `emptyBin({ now })`.
  - `devices(input: {}) → Array<{ device: string; lastSyncAt: number; name: string }>` (updated on every push/pull; `name` from the request).
  - `ageOut(now)`: drops history/bin older than 30 days and unfinished claims older than 24 h; the object's alarm calls it daily.
  - `lapse(input: { readOnly: boolean; wipeAt: number | null })`: sets the read-only flag; the alarm wipes everything at `wipeAt`.

- [ ] **Step 1: Write failing tests** (memory store): `applies new records and hands them back by sequence`; `keeps the newest and files the other in history`; `a deletion goes to the bin and comes back with restore`; `pulls in pages of 500 with more`; `counts a file once however many claims`; `refuses a file over the limit or over the largest size, and when paused`; `drops a claim never finished` (24 h later `ageOut` → usage unchanged, claim gone); `remove everywhere writes deletions for the records that used it`; `read-only refuses pushes`; `wipes at the lapse time`.
- [ ] **Step 2: Run** `npx vitest run server/library.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `LibraryCore` with SQL tables `records(col, id, at, device, seq, doc, deletedAt)`, `history(col, id, at, device, doc, until)`, `media(hash, mediaId, name, kind, bytes, storedAt, claimedAt, device)`, `devices(device, name, lastSyncAt)`, `meta(key, value)` (seq, readOnly, wipeAt). `usedIn` is computed by counting records whose `doc` text contains the `mediaId`.
- [ ] **Step 4: Run** the test file and `npm run check:server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "The library object: one synced library per licence, with history, a bin and the media index"`

### Task 3: Routes, with the seat check and R2 bodies

**Files:**
- Create: `server/cloud.ts`
- Modify: `server/paddle.ts` (route `/v1/cloud/` and `/v1/cloud/media/` to `handleCloud` before the API), `server/api.ts` (export `seatHolders(config, licenceId): Promise<Device[]>` reading `act:<id>` fresh)
- Test: `server/cloud.test.ts`

**Interfaces:**
- Produces `export async function handleCloud(request: Request, config: ApiConfig): Promise<Response | null>` (null when the path is not `/v1/cloud/…`). Every JSON route takes `{ token, device, name? }` plus its own fields:
  - `POST /v1/cloud/push { changes }`, `POST /v1/cloud/pull { since }`, `POST /v1/cloud/media/claim { hash, bytes, name, kind, mediaId }`, `POST /v1/cloud/media/list`, `POST /v1/cloud/media/remove { hash, everywhere }`, `POST /v1/cloud/history { col, id }`, `POST /v1/cloud/bin`, `POST /v1/cloud/bin/restore { col, id }`, `POST /v1/cloud/bin/empty`, `POST /v1/cloud/status` → `{ licence, plan, usedBytes, limitBytes, over, binBytes, readOnly, devices, syncVideos }`, `POST /v1/cloud/settings { syncVideos: boolean }` (kept in the object's `meta`, on by default).
  - `PUT /v1/cloud/media/<hash>?token=…&device=…` with the raw body: refused 409 unless a claim is pending; streams into R2 at `lib/<licence>/<hash>` with the claimed content type; then `mediaDone`. `GET /v1/cloud/media/<hash>?token=…&device=…` streams it back (`content-type`, `content-length`).
  - Access: `token` → `accountOf`; the licence is the account's best plan licence it `mayUse`; `device` must be in `seatHolders`; otherwise 403 `{ noSeat: true, error: "This computer is not on the licence. Sign in and activate it, then sync." }`. A Free account: 402 `{ plan: "free" }`. A lapsed licence (plan ended): pushes/claims 403 `{ readOnly: true }`.
  - Usage mirror: after push/claim/done/remove, `putJson(store, "cloudused:<licence>", { usedBytes, at })` and the total `cloud:total` (sum kept incrementally); the 80%/100% total-cap emails go once per crossing (`cloud:warned`).

- [ ] **Step 1: Write failing tests** with a fake namespace that runs `LibraryCore` in memory (like `memoryRooms()`), `memoryR2`, a paid Church licence with two activated devices and a signed-in owner token: `pushes and pulls between two computers of one licence`; `refuses a computer without a seat`; `refuses a member the owner removed`; `uploads only after a claim, and serves the file back`; `counts usage once per hash and reports it in status`; `pauses every church at the total cap and emails once`; `a lapsed licence is read-only`.
- [ ] **Step 2: Run** `npx vitest run server/cloud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** cloud.ts. Rate limit with the existing `tooFast` on `push`/`claim`.
- [ ] **Step 4: Run** the file, `npm run check:server`, `npx vitest run server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Cloud routes: push, pull, media in and out of R2, behind the licence's seats"`

### Task 4: The owner's Cloud space page

**Files:**
- Modify: `server/admin.ts` (actions `set-cloud-limits` (owner; fields premiumGb, churchGb, maxFileGb, totalCapGb), `set-cloud-cap` (owner; license, gb or blank to clear)), `server/admin-page.ts` (a "Cloud space" section: the four limits as a form, totals: used across accounts, estimated monthly bill at $0.015/GB after the first 10 GB, top 10 licences by use with their override), `server/api.ts` `details()` (adds `cloud: { limits, totalBytes, licences: Array<{ license, plan, usedBytes, capGb|null }> }`)
- Test: `server/admin.test.ts`

- [ ] **Step 1: Write failing tests**: `an owner sets the limits and a per-licence cap; support may not`; `lowering a limit deletes nothing` (a licence at 12 GB used, premium limit set to 3 → its status says `over: true`, the next claim is `full`, usage unchanged); `details lists cloud use and the bill`.
- [ ] **Step 2: Run** `npx vitest run server/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Every change goes through the existing admin log.
- [ ] **Step 4: Run** `npx vitest run server && npm run check:server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Admin: cloud space limits, per-licence caps, totals and the estimated bill"`

### Task 5: Lapse and the daily alarm

**Files:**
- Modify: `server/library.ts` (alarm: `ageOut` daily; wipe at `wipeAt`), `server/cloud.ts` (on `status`/`push` for a licence whose plan ended: set read-only and `wipeAt = endedAt + 90 d`, email the owner at day 0; the daily alarm emails at day 60 and 85 via a queued `cloud:mail:<licence>:<day>` KV marker the worker sends on its next request from any computer or from a scheduled cron if one exists), `server/wrangler.jsonc` (`"triggers": { "crons": ["0 6 * * *"] }` if none; `scheduled()` in paddle.ts walks `cloudused:*` keys to send due emails)
- Test: `server/cloud.test.ts`

- [ ] **Step 1: Write failing tests**: `a lapsed licence turns read-only and is wiped 90 days later`; `emails at day 0, 60 and 85, once each`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server && npm run check:server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Cloud space after a plan ends: read-only for 90 days, three reminders, then gone"`
