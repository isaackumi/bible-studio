# License server (Paddle)

When someone buys Premium or Church through Paddle, Paddle notifies this server. The server checks
that the notice really came from Paddle, makes a signed `CS1-…` license key, and emails it to the
buyer. The app checks the key offline, so the server is needed only at the moment of purchase.

`paddle.ts` is a standard web request handler. These steps deploy it to Cloudflare Workers
(free tier is enough); it also runs on Deno, Bun or Vercel Edge.

## What happens

1. The buyer presses **Buy Premium** in Settings › Plan & account. The app opens Paddle's checkout
   in the browser, with their email filled in if they signed in.
2. They pay. Paddle sends `transaction.completed` to `https://<your-worker>/paddle/webhook`.
3. The server finds the plan from the price, looks up the buyer's email from Paddle, and signs a key:
   - Subscription: the key runs to the end of the paid period plus 7 days' grace (`GRACE_DAYS`).
     Each renewal is another `transaction.completed`, so a fresh key is emailed.
   - One-off purchase: the key never ends.
4. It emails the key through Resend. If sending fails, the server answers 500 and Paddle retries.
   A retry makes the same key, because the key id comes from the transaction id.

## One-time setup

1. **Paddle** (start in the sandbox at sandbox-vendors.paddle.com):
   - Create the product "Church Studio Premium" with a monthly and a yearly price; same for Church.
   - Checkout › Hosted checkouts: create one per price. Paste each link into `CHECKOUT` in
     `src/lib/domain/plans.ts`. Plans without a link keep showing "coming soon".
   - Developer tools › Authentication: create an API key with customer read access.
   - Developer tools › Notifications: add a destination `https://<your-worker>/paddle/webhook`
     for `transaction.completed`, and copy its secret key.
2. **Resend** (resend.com): verify your sending domain and create an API key.
3. **Cloudflare**: `npm i -g wrangler`, then from this folder:

   ```
   wrangler init --from-dash   # or create a Worker named church-studio-keys
   wrangler secret put PADDLE_WEBHOOK_SECRET
   wrangler secret put PADDLE_API_KEY
   wrangler secret put CHURCH_STUDIO_SIGNING_KEY   # contents of ~/.church-studio/license-signing.key
   wrangler secret put RESEND_API_KEY
   wrangler deploy paddle.ts --name church-studio-keys \
     --var PADDLE_ENV:sandbox \
     --var PADDLE_PRICES:pri_xxx:premium,pri_yyy:premium,pri_zzz:church \
     --var "MAIL_FROM:Church Studio <keys@yourdomain>"
   ```

4. Buy with a Paddle sandbox test card and check the email arrives. Then switch Paddle to live,
   set `PADDLE_ENV` to `live`, and replace the sandbox checkout links and price ids.

## Keep in mind

- The signing key is the one secret that matters: whoever has it can make keys. It lives in
  `~/.church-studio/license-signing.key` and in the Worker's secrets, nowhere else.
- Refunds and cancellations need no action: the key stops at the end of the paid period. A
  refunded one-off purchase keeps working; revoking those needs an online check, which can come
  with accounts.
- Tests: `npx vitest run server`.
