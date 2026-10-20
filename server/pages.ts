// The two pages the server shows in a browser: the mock provider's checkout (test mode, no money
// moves) and the admin dashboard (usage, trials, sales and promo codes). Plain HTML and a little
// script, so they run on the Worker with nothing to build.

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const BASE_CSS = `
  :root { color-scheme: light dark; --bg: #f6f5f3; --panel: #ffffff; --ink: #17171b; --muted: #6b6b75; --line: #e4e2de; --accent: #fa4f00; --good: #2f9e6a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f0f12; --panel: #18181d; --ink: #f3f3f5; --muted: #9a9aa6; --line: #2a2a31; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
  button, input, select { font: inherit; }
  .mark { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 22px; height: 22px; }
  .mark i { border-radius: 2px; background: var(--ink); opacity: .85; } .mark i:nth-child(2) { background: var(--accent); opacity: 1; }
`;

type PayState = "pending" | "paid" | "cancelled" | "missing";
type PayOrder = { id: string; plan: string; interval: string; email: string; name: string; promo: string | null; list: number; due: number };

export function payPage({ state, order }: { state: PayState; order?: PayOrder }): string {
  const plan = order ? `${order.plan === "church" ? "Church" : "Premium"} · ${order.interval === "yearly" ? "yearly" : "monthly"}` : "";
  const body =
    state === "missing"
      ? `<h1>Checkout not found</h1><p class="muted">Start again from Church Studio.</p>`
      : state === "paid"
        ? `<div class="done"><span class="tick">✓</span></div><h1>Payment complete</h1><p class="muted">Church Studio ${escape(plan)} is activating on your computer now. You can close this tab and go back to the app.</p><p class="muted small">A receipt and your license key go to ${escape(order!.email)}.</p>`
        : state === "cancelled"
          ? `<h1>Checkout cancelled</h1><p class="muted">Nothing was charged. Go back to Church Studio to try again.</p>`
          : `
      <h1>Complete your order</h1>
      <div class="summary">
        <div class="row"><span>Church Studio ${escape(plan)}</span><span>${money(order!.list)}</span></div>
        ${order!.promo ? `<div class="row promo"><span>Promo ${escape(order!.promo)}</span><span>−${money(order!.list - order!.due)}</span></div>` : ""}
        <div class="row total"><span>Due today</span><span>${money(order!.due)}</span></div>
        <div class="row small muted"><span>Renews ${order!.interval === "yearly" ? "every year" : "every month"} · cancel any time</span></div>
      </div>
      <form method="post" class="card-form">
        <label>Email<input value="${escape(order!.email)}" readonly /></label>
        <label>Card number<input value="4242 4242 4242 4242" readonly /></label>
        <div class="two"><label>Expiry<input value="12 / 34" readonly /></label><label>CVC<input value="123" readonly /></label></div>
        <button type="submit" class="pay">Pay ${money(order!.due)}</button>
      </form>
      <form method="post" action="/pay/${escape(order!.id)}/cancel"><button type="submit" class="cancel">Cancel</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Church Studio checkout</title>
<style>${BASE_CSS}
  main { width: min(440px, calc(100% - 32px)); margin: 6vh auto; padding: 28px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: 0 24px 60px rgb(0 0 0 / .12); }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 750; }
  .test { padding: 3px 10px; border-radius: 999px; background: #ffe7a3; color: #5b4300; font-size: 12px; font-weight: 750; }
  h1 { margin: 0 0 14px; font-size: 22px; letter-spacing: -.01em; }
  .muted { color: var(--muted); } .small { font-size: 13px; }
  .summary { display: grid; gap: 8px; margin-bottom: 20px; padding: 14px 16px; border-radius: 12px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .row { display: flex; justify-content: space-between; gap: 12px; } .promo { color: var(--good); font-weight: 650; }
  .total { padding-top: 8px; border-top: 1px solid var(--line); font-size: 18px; font-weight: 800; }
  .card-form { display: grid; gap: 12px; } label { display: grid; gap: 4px; font-size: 13px; font-weight: 650; color: var(--muted); }
  input { height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--ink); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pay { height: 48px; margin-top: 6px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; }
  .pay:hover { filter: brightness(1.06); }
  .cancel { width: 100%; margin-top: 8px; height: 38px; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .done { display: grid; place-items: center; margin: 8px 0 18px; } .tick { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--good); color: #fff; font-size: 32px; font-weight: 900; animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } }
  footer { margin-top: 18px; text-align: center; font-size: 12px; color: var(--muted); }
</style></head><body><main>
  <header><span class="brand"><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio</span><span class="test">TEST MODE</span></header>
  ${body}
  <footer>Test checkout · no card is charged · the real payment provider replaces this page</footer>
</main></body></html>`;
}

export function adminPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Church Studio admin</title>
<style>${BASE_CSS}
  .wrap { width: min(1100px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 60px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 750; background: #ffe7a3; color: #5b4300; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .card { padding: 16px 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  .card h2 { margin: 0 0 6px; font-size: 12px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
  .big { font-size: 30px; font-weight: 800; letter-spacing: -.02em; } .sub { font-size: 13px; color: var(--muted); }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; } td, th { padding: 6px 4px; border-bottom: 1px solid var(--line); text-align: left; } th { color: var(--muted); font-size: 12px; font-weight: 700; }
  .bar { height: 6px; border-radius: 3px; background: var(--accent); }
  form { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; align-items: end; }
  input, select { width: 100%; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg); color: var(--ink); }
  label { min-width: 0; display: grid; gap: 3px; font-size: 12px; font-weight: 650; color: var(--muted); }
  button { height: 36px; padding: 0 14px; border: 0; border-radius: 9px; background: var(--accent); color: #fff; font-weight: 750; cursor: pointer; }
  .ghost { background: none; border: 1px solid var(--line); color: var(--ink); }
  #login { max-width: 420px; margin: 18vh auto; } #msg { min-height: 20px; font-size: 13px; color: var(--muted); }
</style></head><body><div class="wrap">
<div id="login" class="card"><h2>Admin</h2><p class="sub">Enter the ADMIN_TOKEN set on the server.</p><form onsubmit="event.preventDefault(); save()"><input id="token" type="password" placeholder="Admin token" style="grid-column:1/-1"><button>Open</button></form></div>
<div id="app" hidden>
  <header><span class="brand"><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio · Admin</span><span><span id="mode" class="pill"></span> <button class="ghost" onclick="load()">Refresh</button> <button class="ghost" onclick="logout()">Sign out</button></span></header>
  <div class="grid" id="kpis"></div>
  <div class="cols">
    <div class="card"><h2>Plans (active 30 days)</h2><table id="plans"></table></div>
    <div class="card"><h2>Sales by plan</h2><table id="sales"></table></div>
    <div class="card"><h2>Versions</h2><table id="versions"></table></div>
    <div class="card"><h2>Systems</h2><table id="systems"></table></div>
  </div>
  <div class="card" style="margin-top:12px"><h2>Promo codes</h2><table id="promos"></table>
    <p class="sub" style="margin:14px 0 6px">New promo code</p>
    <form onsubmit="event.preventDefault(); addPromo(this)">
      <label>Code<input name="code" required placeholder="EASTER25"></label>
      <label>% off<input name="percentOff" type="number" min="1" max="100"></label>
      <label>$ off<input name="amountOff" type="number" min="1" step="0.01"></label>
      <label>Extra trial days<input name="trialDays" type="number" min="1"></label>
      <label>Plan<select name="plans"><option value="">Any</option><option>premium</option><option>church</option></select></label>
      <label>Max uses<input name="maxUses" type="number" min="1"></label>
      <label>Ends<input name="expiresAt" type="date"></label>
      <button>Create</button>
    </form>
  </div>
  <div class="card" style="margin-top:12px"><h2>Refund a license</h2><form onsubmit="event.preventDefault(); refund(this)"><label>License id (8 hex)<input name="license" required pattern="[0-9a-fA-F]{8}"></label><label>Reason<input name="reason" placeholder="refund"></label><button>Revoke</button></form></div>
  <p id="msg"></p>
</div>
<script>
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem("cs-admin") || "";
const money = (c) => "$" + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function save() { localStorage.setItem("cs-admin", $("token").value.trim()); load(); }
function logout() { localStorage.removeItem("cs-admin"); location.reload(); }
async function call(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + token(), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.status);
  return data;
}
const table = (rows, total) => rows.length ? rows.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td style="width:45%"><div class="bar" style="width:' + Math.max(4, (v / (total || 1)) * 100) + '%"></div></td><td style="text-align:right">' + v + '</td></tr>').join("") : '<tr><td class="sub">Nothing yet</td></tr>';
async function load() {
  if (!token()) return;
  try {
    const s = await call("/v1/admin/stats");
    $("login").hidden = true; $("app").hidden = false;
    $("mode").textContent = s.test ? s.provider + " · test mode" : s.provider;
    const conv = s.trials.started ? Math.round((s.trials.converted / s.trials.started) * 100) : 0;
    const kpi = (t, v, sub) => '<div class="card"><h2>' + t + '</h2><div class="big">' + v + '</div><div class="sub">' + sub + '</div></div>';
    $("kpis").innerHTML = kpi("Computers", s.computers.total, s.computers.newThisWeek + " new this week")
      + kpi("Active today", s.computers.active1, s.computers.active7 + " this week · " + s.computers.active30 + " this month")
      + kpi("Trials", s.trials.running, s.trials.started + " started · " + conv + "% bought")
      + kpi("Subscriptions", s.subscriptions.active, money(s.subscriptions.mrr) + " a month (MRR)")
      + kpi("Revenue", money(s.sales.revenue), money(s.sales.revenue30) + " in 30 days · " + s.sales.withPromo + " with promo");
    const sum = (rows) => rows.reduce((a, [, v]) => a + v, 0);
    $("plans").innerHTML = table(s.plans, sum(s.plans));
    $("sales").innerHTML = table(s.sales.byPlan, sum(s.sales.byPlan));
    $("versions").innerHTML = table(s.versions, sum(s.versions));
    $("systems").innerHTML = table(s.systems, sum(s.systems));
    $("promos").innerHTML = '<tr><th>Code</th><th>Used</th><th>Ends</th></tr>' + (s.promos.map((p) => '<tr><td><b>' + esc(p.code) + '</b></td><td>' + p.used + (p.maxUses ? " / " + p.maxUses : "") + '</td><td>' + (p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—") + '</td></tr>').join("") || '<tr><td class="sub">No codes yet</td></tr>');
  } catch (e) { $("msg").textContent = "Could not load: " + e.message; if (String(e.message).includes("token")) { $("login").hidden = false; $("app").hidden = true; } }
}
async function addPromo(form) {
  const f = Object.fromEntries(new FormData(form));
  const body = { code: f.code, note: "" };
  if (f.percentOff) body.percentOff = Number(f.percentOff);
  if (f.amountOff) body.amountOff = Math.round(Number(f.amountOff) * 100);
  if (f.trialDays) body.trialDays = Number(f.trialDays);
  if (f.plans) body.plans = [f.plans];
  if (f.maxUses) body.maxUses = Number(f.maxUses);
  if (f.expiresAt) body.expiresAt = f.expiresAt + "T23:59:59Z";
  try { await call("/v1/admin/promos", body); form.reset(); $("msg").textContent = "Code created."; load(); } catch (e) { $("msg").textContent = e.message; }
}
async function refund(form) {
  const f = Object.fromEntries(new FormData(form));
  if (!confirm("Revoke license " + f.license + "? Its computers drop to Free at their next check-in.")) return;
  try { await call("/v1/admin/refund", { license: f.license.toLowerCase(), reason: f.reason }); form.reset(); $("msg").textContent = "License revoked."; load(); } catch (e) { $("msg").textContent = e.message; }
}
load();
</script></body></html>`;
}

type SigninState = "choose" | "confirm" | "done" | "wrong" | "expired" | "missing";
type SigninView = { state: SigninState; id: string; device?: string; email?: string; methods?: string[]; choices?: number[] };

const METHOD_LABELS: Record<string, { label: string; icon: string }> = {
  google: { label: "Continue with Google", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5h-4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>` },
  microsoft: { label: "Continue with Microsoft", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#F25022" d="M3 3h8.5v8.5H3z"/><path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z"/><path fill="#00A4EF" d="M3 12.5h8.5V21H3z"/><path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z"/></svg>` },
  apple: { label: "Continue with Apple", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.1zM14 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>` },
};

/** The browser side of signing the app in: choose how, then tap the number the app shows. */
export function signinPage({ state, id, device, email, methods = [], choices = [] }: SigninView): string {
  const social = methods.filter((method) => METHOD_LABELS[method]);
  const body =
    state === "missing"
      ? `<h1>Sign-in not found</h1><p class="muted">This link has ended or was mistyped. Choose <b>Sign in</b> in Church Studio to start again.</p>`
      : state === "expired"
        ? `<h1>This sign-in has ended</h1><p class="muted">Nothing was signed in. Choose <b>Sign in</b> in Church Studio to start again.</p>`
        : state === "wrong"
          ? `<h1>That number didn't match</h1><p class="muted">For your safety this sign-in has ended and nothing was signed in. Choose <b>Sign in</b> in Church Studio to try again.</p>`
          : state === "done"
            ? `<div class="done"><span class="tick">✓</span></div><h1>You're signed in</h1><p class="muted">Church Studio is signed in${email ? ` as <b>${escape(email)}</b>` : ""}. You can close this tab and go back to the app.</p>`
            : state === "confirm"
              ? `
      <p class="eyebrow">Step 2 of 2</p>
      <h1>Which number is on your screen?</h1>
      <p class="muted">Tap the number Church Studio shows on <b>${escape(device ?? "your computer")}</b>. This makes sure you are signing in your own computer.</p>
      <form method="post" action="/signin/${escape(id)}/confirm" class="numbers">
        ${choices.map((choice) => `<button type="submit" name="number" value="${choice}">${choice}</button>`).join("")}
      </form>
      <p class="who">Signed in as <b>${escape(email ?? "")}</b> · <button type="button" class="link" onclick="switchAccount()">Use another account</button></p>
      <form method="post" action="/signin/${escape(id)}/cancel"><button type="submit" class="cancel">This wasn't me · cancel</button></form>`
              : `
      <p class="eyebrow">Step 1 of 2</p>
      <h1>Sign in to Church Studio</h1>
      <p class="muted">Signing in <b>${escape(device ?? "your computer")}</b>. Your plan follows your account, so another computer only needs you to sign in. No password to remember.</p>
      <div class="methods">
        ${social.map((method) => `<button type="button" class="method" onclick="social('${method}')">${METHOD_LABELS[method]!.icon}<span>${METHOD_LABELS[method]!.label}</span></button>`).join("")}
      </div>
      ${
        methods.includes("email")
          ? `${social.length ? `<div class="or"><span>or</span></div>` : ""}
      <form class="email" onsubmit="event.preventDefault(); emailLink(this)">
        <input name="email" type="email" required autocomplete="email" placeholder="you@church.org" aria-label="Email" />
        <button type="submit">Email me a sign-in link</button>
      </form>`
          : ""
      }
      <p id="msg" class="msg" role="status"></p>
      <form method="post" action="/signin/${escape(id)}/cancel"><button type="submit" class="cancel">Cancel</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · Church Studio</title>
<style>${BASE_CSS}
  main { width: min(420px, calc(100% - 32px)); margin: 8vh auto; padding: 30px 28px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: 0 24px 60px rgb(0 0 0 / .12); }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; font-weight: 750; }
  .eyebrow { margin: 0 0 6px; font-size: 12px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
  h1 { margin: 0 0 10px; font-size: 23px; letter-spacing: -.015em; line-height: 1.25; }
  .muted { margin: 0 0 22px; color: var(--muted); }
  .methods { display: grid; gap: 10px; }
  .method { display: flex; align-items: center; justify-content: center; gap: 10px; height: 46px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); font-weight: 650; cursor: pointer; transition: border-color .15s, transform .1s; }
  .method:hover { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); } .method:active { transform: scale(.99); }
  .or { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: var(--muted); font-size: 13px; } .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .email { display: grid; gap: 10px; }
  .email input { height: 46px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); }
  .email input:focus { outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); outline-offset: 1px; }
  .email button { height: 46px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 750; cursor: pointer; } .email button:hover { filter: brightness(1.06); }
  .msg { min-height: 20px; margin: 14px 0 0; font-size: 14px; color: var(--muted); } .msg.good { color: var(--good); font-weight: 650; }
  .numbers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
  .numbers button { aspect-ratio: 1; border: 1px solid var(--line); border-radius: 16px; background: var(--bg); color: var(--ink); font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; cursor: pointer; transition: border-color .15s, background .15s, transform .1s; }
  .numbers button:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); } .numbers button:active { transform: scale(.97); }
  .who { margin: 0; font-size: 13px; color: var(--muted); }
  .link { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 650; cursor: pointer; }
  .cancel { width: 100%; margin-top: 14px; height: 38px; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .done { display: grid; place-items: center; margin: 4px 0 18px; } .tick { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--good); color: #fff; font-size: 32px; font-weight: 900; animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } }
  footer { margin-top: 20px; text-align: center; font-size: 12px; color: var(--muted); }
</style></head><body><main>
  <header><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio</header>
  ${body}
  <footer>An account is optional. Church Studio works without one.</footer>
</main>
<script>
const here = location.origin + location.pathname;
const msg = (text, good) => { const el = document.getElementById("msg"); if (el) { el.textContent = text; el.className = good ? "msg good" : "msg"; } };
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || data.error || "Something went wrong. Try again.");
  return data;
}
async function social(provider) {
  msg("Opening " + provider[0].toUpperCase() + provider.slice(1) + "…");
  try { const data = await post("/auth/sign-in/social", { provider, callbackURL: here }); if (data.url) location.href = data.url; } catch (e) { msg(e.message); }
}
async function emailLink(form) {
  const email = form.email.value.trim();
  try { await post("/auth/sign-in/magic-link", { email, callbackURL: here }); msg("Check " + email + " for the sign-in link, and open it on this device.", true); } catch (e) { msg(e.message); }
}
async function switchAccount() { try { await post("/auth/sign-out", {}); } catch {} location.href = here; }
</script></body></html>`;
}

/**
 * Paddle's default payment link: Paddle sends buyers here with ?_ptxn=<transaction>, and Paddle.js
 * opens that transaction's checkout over the page. Set it in Paddle › Checkout › Checkout settings
 * (https://<this server>/checkout); the domain must be approved for live checkouts.
 */
export function checkoutPage({ token, sandbox }: { token: string; sandbox: boolean }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Checkout · Church Studio</title>
<style>${BASE_CSS}
  main { width: min(440px, calc(100% - 32px)); margin: 10vh auto; padding: 30px 28px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: 0 24px 60px rgb(0 0 0 / .12); text-align: center; }
  header { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 22px; font-weight: 750; }
  h1 { margin: 0 0 10px; font-size: 22px; letter-spacing: -.01em; } p { margin: 0; color: var(--muted); }
  .spin { width: 28px; height: 28px; margin: 4px auto 18px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(1turn); } }
  .tick { display: grid; place-items: center; width: 64px; height: 64px; margin: 0 auto 18px; border-radius: 50%; background: var(--good); color: #fff; font-size: 32px; font-weight: 900; }
  footer { margin-top: 20px; font-size: 12px; color: var(--muted); } footer a { color: inherit; }
</style></head><body><main>
  <header><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio</header>
  <div id="state"><div class="spin"></div><h1>Opening secure checkout…</h1><p>Payments are handled by Paddle, our reseller.</p></div>
  <footer><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a></footer>
</main>
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
<script>
const state = document.getElementById("state");
const show = (html) => { state.innerHTML = html; };
if (!new URLSearchParams(location.search).get("_ptxn")) show("<h1>Nothing to pay here</h1><p>Start your purchase from Church Studio, under Plans.</p>");
${sandbox ? 'Paddle.Environment.set("sandbox");\n' : ""}Paddle.Initialize({
  token: ${JSON.stringify(token)},
  eventCallback(event) {
    if (event.name === "checkout.completed") show('<div class="tick">✓</div><h1>Payment complete</h1><p>Church Studio is activating on your computer now. You can close this tab and go back to the app. Your receipt and license key are on their way by email.</p>');
    if (event.name === "checkout.closed" && !event.data?.status?.includes("completed")) show("<h1>Checkout closed</h1><p>Nothing was charged. Go back to Church Studio to try again.</p>");
    if (event.name === "checkout.error") show("<h1>Checkout could not open</h1><p>Go back to Church Studio and try again. If it keeps happening, the contact address is on our home page.</p>");
  },
});
</script></body></html>`;
}
