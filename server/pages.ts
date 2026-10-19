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
