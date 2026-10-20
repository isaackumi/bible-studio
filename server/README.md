# Church Studio server (plans, payment, trials, stats)

One small Cloudflare Worker is the source of truth for plans. The app never decides a paid plan
on its own: the server signs a **lease** ("this computer has Church until this date, and must check
in by this date"), and the app's native core (`src-tauri/src/entitlement.rs`) checks that
signature. Editing anything saved on a computer cannot grant or extend a plan.

| File | What it is |
| --- | --- |
| `api.ts` | Every endpoint: check-in, trials, promo codes, checkout, seats, leases, admin |
| `billing.ts` | Payment providers behind one interface: `mock` (built in) and `paddle` |
| `pricing.ts` | Prices in cents, and promo-code rules |
| `pages.ts` | The mock checkout page and the admin dashboard |
| `store.ts` | Storage: Cloudflare KV in production, a Map in tests and `dev.ts` |
| `paddle.ts` | The Worker's entry, and Paddle's webhook (payments and refunds) |
| `dev.ts` | The same server on your computer (`npm run server:dev`) |

## How a purchase goes

1. The app's plans page (`src/lib/components/Paywall.svelte`) asks `POST /v1/checkout` with the
   plan, billing, email and any promo code. The server prices it and asks the provider for a
   checkout page.
2. The app opens that page in the browser and asks `POST /v1/checkout/status` every few seconds.
3. Payment: the mock page's **Pay** button, or Paddle's `transaction.completed` webhook, completes
   the checkout. That makes one subscription with one license key (its id comes from the
   subscription, so renewals keep the same seats). The key is emailed when Resend is set up.
4. The app's next status check gets the key **and a lease for this computer**, and the plan is on.
   No key to copy from an email (it still comes, for other computers).

Trials (`POST /v1/trial`) are one per computer: the computer id is a hash of the machine's hardware
id, so reinstalling the app does not give a second trial. Promo codes can take a percent or an
amount off the first payment, or add trial days, with plans, a use limit and an end date.

## Run it on your computer

```
npm run server:dev                                     # http://localhost:8787, admin token "dev"
VITE_LICENSE_SERVER=http://localhost:8787 npm run dev  # the app, talking to it
```

It signs with `~/.church-studio/license-signing.key`, so the app accepts its leases, and keeps its
data in `server/.dev-store.json`. The admin page is http://localhost:8787/admin.

## Deploy (Cloudflare)

`./server/deploy.sh` does all of it: it sets the two secrets from `~/.church-studio` (making
an admin token there if there is none), deploys, and checks the live server. By hand, from this folder:

```
npx wrangler login
npx wrangler secret put CHURCH_STUDIO_SIGNING_KEY   # contents of ~/.church-studio/license-signing.key
npx wrangler secret put ADMIN_TOKEN                 # a long random string, for /admin
npx wrangler secret put RESEND_API_KEY              # optional: emails the key
npx wrangler deploy
```

`wrangler.jsonc` sets `BILLING_PROVIDER` to `mock`: the whole flow works and nothing is charged
(pages say TEST MODE). Deploy the server before shipping an app build that uses it: the app asks
for leases, which older servers do not give.

## Accounts (optional sign-in)

Nobody has to sign in to use the app. Signing in ties plans to a person, so a second computer
activates by signing in instead of copying a key. `accounts.ts` has the flow; `auth.ts` is Better
Auth (Google, Microsoft, Apple, emailed link) with its users in a D1 database.

The app signs in like a TV app: it opens `/signin/<id>` in the browser, the person signs in there
and taps the number the app shows, and the app collects an account token. A plan bought with an
email turns up on the account of whoever signs in with that email, once the email is verified.

Accounts stay off until the database is set up. Once, from this folder:

```
npx wrangler d1 create church-studio-auth
```

Add what it prints to `wrangler.jsonc` with `"binding": "AUTH_DB"`, then run `./server/deploy.sh`.
That makes the accounts secret (`~/.church-studio/auth-secret.txt`) and the tables (`auth-schema.sql`).
Email sign-in links need `RESEND_API_KEY`. Each other method appears once its two secrets are set:

| Method | Secrets | Redirect URL to register |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://license.heitechinc.com/auth/callback/google` |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | `https://license.heitechinc.com/auth/callback/microsoft` |
| Apple | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | `https://license.heitechinc.com/auth/callback/apple` |

Locally, `npm run server:dev` has accounts on: sign-in links print in its terminal, and setting
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (and so on) before starting it adds those buttons.
After changing the plugins in `auth.ts`, run `node server/auth-schema.ts` to remake the tables file.

## Choosing a payment provider later

Set `BILLING_PROVIDER` and that provider's secrets; the app does not change.

- **Paddle** (built in): merchant of record, so it handles sales tax and VAT worldwide. Do it in
  sandbox first (`PADDLE_ENV` `sandbox`), then again in live with live values:
  1. Products and prices for Premium and Church, monthly and yearly, at the prices in `pricing.ts`.
     Put their ids in `PADDLE_PRICES`: `pri_a:premium:monthly,pri_b:premium:yearly,…`.
  2. A client-side token (Developer tools › Authentication; `test_…` in sandbox, `live_…` in live)
     in `PADDLE_CLIENT_TOKEN`, and an API key: `npx wrangler secret put PADDLE_API_KEY`.
  3. A notification destination at `https://license.heitechinc.com/paddle/webhook` for
     `transaction.completed` and `adjustment.updated`; its secret key:
     `npx wrangler secret put PADDLE_WEBHOOK_SECRET`. Webhooks are accepted only from Paddle's
     addresses, read from Paddle's `/ips` and kept for an hour.
  4. Checkout › Checkout settings › default payment link: `https://license.heitechinc.com/checkout`.
     Paddle sends buyers there and Paddle.js opens the checkout. For live, the domain must be
     approved (Settings › Website approval).
  5. `BILLING_PROVIDER` to `paddle`, then `./server/deploy.sh`.

  The public pages Paddle reviews are on the same server: `/` (product, pricing, contact),
  `/terms`, `/privacy` and `/refunds`, from `site.ts`, with `COMPANY_NAME` and `CONTACT_EMAIL`.
- **Lemon Squeezy / Polar**: also merchants of record, with built-in license keys; add a provider
  in `billing.ts` (create checkout) and a webhook route that calls `completeCheckout`.
- **Stripe**: cheapest fees but you handle tax (Stripe Tax helps). Same shape: Checkout Session in
  `billing.ts`, `checkout.session.completed` webhook → `completeCheckout`, `charge.refunded` → `revoke`.

## Refunds

A refunded or charged-back license gets no new leases: its computers drop to Free at their next
check-in (at most `LEASE_DAYS` later). Paddle refunds are handled by the webhook; with the mock,
use the admin page's **Refund a license**.

## Admin

`/admin` shows computers, active today/week/month, trials and how many bought, subscriptions and
monthly recurring revenue, revenue, plan mix, app versions and systems, and promo codes (create
them there). Only anonymous check-ins are counted: the app version, system and plan, and nothing
from a church's library. Churches can turn the daily check-in off in Settings › Plan & account ›
Privacy; licensing checks still happen.

Tests: `npx vitest run server`.
