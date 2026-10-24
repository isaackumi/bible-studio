# Licence Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Premium licence runs on one laptop at a time: moving it to a new laptop frees the old one, the old one drops to Free as soon as it is online, and the move itself is limited.

**Architecture:** The server already counts seats per licence (`act:<id>`), refuses a full licence with 409 and a list of its computers, and limits releases. This adds a `moved:<id>` list that `activateDevice` refuses, a `/v1/move` route that frees one computer and activates another in one step, per-plan move limits, and 14-day leases. The app shows "Move Premium here" on the computers list and drops to Free when told it was moved.

**Tech Stack:** Cloudflare Worker (TypeScript, KV store), Vitest; Svelte 5 app.

**Spec:** docs/superpowers/specs/2026-10-24-cloud-sync-design.md, section "2. Licence moves".

## Global Constraints

- Leases: 14 days (`LEASE_DAYS`), down from 30. The app renews when under `RENEW_EARLY_DAYS` (7) left, unchanged.
- Move limit per licence per 30 days: Premium 2, Church 3 (replaces the flat 3). Releases and moves share one log (`rel:<id>`).
- A computer that was moved away or released gets no lease at its next check-in (403 `{ moved: true }`) and drops to Free at once. Its work stays: nothing on the computer is deleted.
- Never church-facing internals: messages say "Premium"/"Church", computer names and dates, never key ids or store names.
- Every new UI string gets FR and ES entries; `core.test.ts` enforces it.
- Commits carry no attribution lines.

## Review Focus

1. **The old laptop is offline for a week, then comes back.** Expect it to drop to Free on its first check-in, with a message naming where Premium went. Task 3 test `a_moved_computer_drops_to_free_on_check_in`.
2. **The same laptop moves Premium back to itself** (the new one died). Expect the move to work, counting against the limit, and the other to be the one blocked. Task 1 test `moves back the other way`.
3. **A church hits the move limit mid-emergency.** Expect a plain message with the number allowed and "Contact support", and support's "Free all seats" to clear both the seats and the moved list. Task 1 test `limits moves per plan`, Task 2 test `reset-seats clears the moved list`.
4. **A shortened device id** (the list hides other computers' full ids) is what the app sends as `from`. Expect the move to accept the 8-character form. Task 1 test `moves by the shortened id`.
5. **Leases already issued for 30 days.** Expect no refusal; they simply run out. No code; noted in the release note.

---

### Task 1: The server moves a licence

**Files:**
- Modify: `server/api.ts` (`RELEASES_PER_30_DAYS` → `MOVES_PER_30_DAYS`, `activateDevice`, `seats()`), `server/dev.ts:65`, `server/paddle.ts:144`, `server/wrangler.jsonc:35`
- Test: `server/api.test.ts`

**Interfaces:**
- Produces:
  - `export const MOVES_PER_30_DAYS: Record<LicensePlan, number> = { premium: 2, church: 3 }`
  - KV key `moved:<licenseId>` holding `Array<{ device: string; name: string; at: number; to: string }>` (`to` = the device it went to, or `""` for a plain release). Entries older than `STALE_DAYS` are dropped on read.
  - `activateDevice(...)`: a device on the moved list gets `{ status: 403, body: { moved: true, to: <name of the computer that has it, or ""> , at: number, error: "Premium was moved to <name> on <date>. To use it here again, move it back from Settings › Account." } }` (plan name from the licence).
  - `POST /v1/move { key, device, name, from }`: `from` is a full or 8-character device id of a computer on the licence. Frees it (adds it to `moved:` with `to: device`, logs `rel:`), removes `device` from `moved:` if it was there, then activates `device`. Answers like `/v1/activate` (200 with `lease`, or 409/403/429 with `devices`). 429 when the log holds `MOVES_PER_30_DAYS[plan]` entries in 30 days: `error: "Premium can move 2 times in 30 days. Contact support if you need more."`
  - `POST /v1/release`: now also adds the freed device to `moved:` with `to: ""`, and uses the per-plan limit.
  - Leases: `LEASE_DAYS` 14 in dev.ts, paddle.ts default and wrangler.jsonc.

- [ ] **Step 1: Write failing tests** in api.test.ts, beside "keeps seats per license":
  - `moves a license to another computer and refuses the one it left`: activate `one`; `/v1/move` from `two` with `from: "one"` → 200 with a lease and `devices` naming only `two`; then `/v1/activate` for `one` → 403 `{ moved: true }`; `/v1/lease` for `one` → 403 too.
  - `moves back the other way`: after the above, `/v1/move` from `one` with `from: "two"` → 200; `two` is now refused.
  - `moves by the shortened id`: `from` = first 8 characters of the holder's id works.
  - `limits moves per plan`: a Premium key allows 2 moves/releases in 30 days, the third is 429 with "2 times"; a Church key allows 3. Update the existing "limits releases" test to the Premium number.
  - `a release blocks the released computer until it is moved back`: `/v1/release` of `one`, then `/v1/activate` for `one` → 403 moved; `/v1/move` for `one` with `from` the current holder → 200.
  - `leases last 14 days`: read the lease from a purchase (the existing purchase test gives one); `renewBy - issuedAt` is `14 * DAY` (dev config `leaseDays: 14`).
- [ ] **Step 2: Run** `npx vitest run server/api.test.ts`. Expected: FAIL on the new tests (unknown route, no `moved`).
- [ ] **Step 3: Implement** in api.ts: `MOVES_PER_30_DAYS`, a `movedList(config, licenseId)` reader that drops entries older than `STALE_DAYS`, the check in `activateDevice` (before the seat count), the `/v1/move` branch in `seats()` (resolve `from` by full or 8-character prefix among the saved devices; refuse 404 `"That computer is not on this license."` otherwise), the release change, and the three `14`s.
- [ ] **Step 4: Run** the test file and `npm run check:server`. Expected: all pass, no type errors.
- [ ] **Step 5: Commit** `git commit -m "Licence moves: one step moves Premium to this computer, the one it left drops to Free, two moves a month for Premium, 14-day leases"`

### Task 2: Support can clear a move

**Files:**
- Modify: `server/admin.ts` (`release-device`, `reset-seats` handlers)
- Test: `server/admin.test.ts`

**Interfaces:**
- Consumes: the `moved:<id>` key shape from Task 1.
- Produces: `reset-seats` deletes `act:<id>`, `moved:<id>` and `rel:<id>`. `release-device` adds the device to `moved:` with `to: ""` (same as `/v1/release`). The "Free all seats" hint in admin-page.ts reads: "Every computer is freed and may activate again; moves start counting from zero."

- [ ] **Step 1: Write failing tests** in admin.test.ts: `reset-seats clears the moved list and the move log` (seed `moved:` and `rel:`; after the action both keys are gone and the device activates again); `release-device blocks that computer` (after it, `/v1/activate` for that device → 403 moved).
- [ ] **Step 2: Run** `npx vitest run server/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export a small `markMoved(config, licenseId, device, name, to)` from api.ts and use it from both the route and the admin action.
- [ ] **Step 4: Run** the file and `npm run check:server`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Admin: freeing a seat blocks that computer; Free all seats starts the moves over"`

### Task 3: The app moves Premium here, and drops to Free when moved away

**Files:**
- Modify: `src/lib/domain/activation.ts` (`ActivationState.status` gains `"moved"`; `ActivationState` gains `movedTo?: string`), `src/lib/app/session.svelte.ts` (`checkActivation`, new `moveLicenseHere`), `src/lib/components/settings/SettingsDialog.svelte:1741-1760`, `src/lib/i18n/fr.ts`, `src/lib/i18n/es.ts`
- Test: `src/lib/domain/activation.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 routes.
- Produces:
  - `session.moveLicenseHere(from: string): Promise<void>`: calls `/v1/move` with `{ key, device: this.deviceId, name: this.deviceName(), from, token? }`; on 200 `keepLease` and `activation = { status: "ok", ... }`; on 429/4xx `activation.message = answer.error`.
  - `checkActivation`: a 403 with `data.moved` clears the lease (`api.entitlementClear()`), sets `activation = { status: "moved", movedTo: data.to, message: answer.error, seats, devices }` and notifies once: title "Premium moved to {name}" (or "Church"), detail "This computer is on Free now. Your songs, services and slides are still here. To use Premium here again, move it back in Settings › Account." The plan word comes from `this.ent.plan` before clearing.
  - Pure helper for the test: `export function movedNotice(plan: "premium" | "church", to: string, at: number, lang: ...)` is NOT needed; instead test `activationFrom(status: number, data: unknown, offline: boolean): ActivationState["status"]` extracted from `checkActivation` (`409 → "full"`, `403 + moved → "moved"`, offline → "offline", else "error").
  - Settings, status `full`: the headline reads "{plan} is active on {name}" (one other computer) or "This license is in use on {n} of {n} computers"; each other computer's row gets a primary button **Move {plan} here** (two presses: first turns it into "Click again to move it here"), beside **Release**. Under the list: "Moving frees that computer: it goes back to Free the next time it is online. Premium can move 2 times in 30 days (Church 3)."
  - Settings, status `moved`: a row "Premium moved to {name}" with the message, and the same Move button list so it can be moved back.

- [ ] **Step 1: Write failing tests** in activation.test.ts for `activationFrom`: `(409, { full: true }, false) → "full"`, `(403, { moved: true }, false) → "moved"`, `(0, {}, true) → "offline"`, `(500, {}, false) → "error"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/activation.test.ts`. Expected: FAIL (not exported).
- [ ] **Step 3: Implement** `activationFrom` in activation.ts, use it in `checkActivation`, add `moveLicenseHere`, the Settings rows and buttons, and the FR/ES lines.
- [ ] **Step 4: Run** `npm run check`, `npx vitest run src/lib/i18n src/lib/domain/activation`. Expected: 0 errors, PASS.
- [ ] **Step 5: Commit** `git commit -m "Move Premium to this computer from Settings; a computer it left drops to Free and says where it went"`

### Task 4: The plans page and the release note say so

**Files:**
- Modify: `server/features.ts` or `server/pricing.ts` wherever "30 days"/releases are described (grep `30 days`), `src/lib/domain/changelog.ts` (entry added at release time, not here)
- Test: `server/api.test.ts` "serves the public pages" if it asserts the text.

- [ ] **Step 1:** `grep -n "30 days\|release" server/pricing.ts server/features.ts server/llms.ts` and update any line that promises release counts or lease length to: moves 2 (Premium) / 3 (Church) in 30 days; a computer checks in at least every 14 days.
- [ ] **Step 2: Run** `npm run check:server && npx vitest run server`. Expected: PASS.
- [ ] **Step 3: Commit** `git commit -m "Pricing and FAQ: moves per month and the 14-day check-in"`
