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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Church Studio · Admin</title>
<link rel="icon" href="/email/logo.png">
<style>
  :root { --bg: #08080b; --panel: #121217; --panel2: #18181f; --line: rgba(255,255,255,.08); --ink: #f3f3f6; --muted: #9a9aa6; --dim: #6c6c78; --accent: #fa4f00; --accent2: #ff9a4d; --good: #34c88a; --warn: #f5a524; --bad: #e5484d; --violet: #8b6cff; --blue: #4f8cff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(900px 400px at 10% -10%, rgba(250,79,0,.14), transparent 60%), var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; min-height: 100vh; }
  .wrap { width: min(1240px, calc(100% - 32px)); margin: 0 auto; padding: 22px 0 60px; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 16px; } .brand img { width: 28px; height: 28px; border-radius: 7px; }
  .grow { flex: 1; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
  .pill.test { background: rgba(245,165,36,.16); color: var(--warn); } .pill.live { background: rgba(52,200,138,.16); color: var(--good); }
  .muted { color: var(--muted); } .small { font-size: 12px; }
  button, .btn { height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); color: var(--ink); font: inherit; font-weight: 650; cursor: pointer; }
  button:hover { background: var(--panel2); } button.hot { border: 0; background: var(--accent); color: #fff; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
  #tools:not([hidden]) { display: grid; gap: 22px; }
  [hidden] { display: none !important; }
  .kpi { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  .kpi h3 { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
  .kpi b { display: block; font-size: 28px; font-weight: 750; letter-spacing: -.02em; line-height: 1.1; }
  .kpi span { font-size: 12px; color: var(--muted); }
  .row2 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); min-width: 0; }
  .card h2 { margin: 0 0 14px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .legend { display: flex; gap: 14px; margin-left: auto; font-size: 11.5px; font-weight: 600; color: var(--muted); } .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
  .chart { display: block; width: 100%; height: 170px; }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: 4px; }
  .funnel { display: grid; gap: 10px; }
  .step { display: grid; gap: 4px; } .step header { margin: 0; display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); } .step header b { color: var(--ink); }
  .track { height: 10px; border-radius: 6px; background: rgba(255,255,255,.06); overflow: hidden; } .track i { display: block; height: 100%; border-radius: 6px; }
  .mix { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .bars { display: grid; gap: 8px; font-size: 12.5px; } .bars div { display: grid; grid-template-columns: 110px 1fr 40px; gap: 8px; align-items: center; } .bars em { font-style: normal; text-align: right; color: var(--muted); }
  .tabs { display: flex; gap: 4px; padding: 4px; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); width: max-content; max-width: 100%; overflow-x: auto; }
  .tabs button { border: 0; background: none; height: 32px; color: var(--muted); } .tabs button[aria-selected="true"] { background: var(--panel2); color: var(--ink); }
  .tabs .count { margin-left: 6px; padding: 0 6px; border-radius: 6px; background: rgba(255,255,255,.07); font-size: 11px; }
  .tools { display: flex; gap: 8px; margin-bottom: 10px; } .tools input { flex: 1; max-width: 320px; }
  input, select { height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg); color: var(--ink); font: inherit; min-width: 0; }
  .table { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { position: sticky; top: 0; background: var(--panel2); text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); padding: 10px 12px; }
  td { padding: 10px 12px; border-top: 1px solid var(--line); white-space: nowrap; } tr:hover td { background: rgba(255,255,255,.02); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 650; background: rgba(255,255,255,.07); color: var(--muted); }
  .tag.good { background: rgba(52,200,138,.15); color: #7be3b4; } .tag.warn { background: rgba(245,165,36,.15); color: var(--warn); } .tag.bad { background: rgba(229,72,77,.15); color: #ff8b8e; } .tag.violet { background: rgba(139,108,255,.16); color: #b8a6ff; } .tag.orange { background: rgba(250,79,0,.16); color: var(--accent2); }
  .mono { font-family: SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .empty { padding: 26px; text-align: center; color: var(--dim); }
  form.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: end; }
  form.grid label { display: grid; gap: 4px; font-size: 11.5px; font-weight: 650; color: var(--muted); }
  #login { max-width: 400px; margin: 18vh auto; } #login form { display: grid; gap: 10px; margin-top: 12px; }
  #msg { position: fixed; left: 50%; bottom: 20px; translate: -50% 0; padding: 8px 14px; border-radius: 999px; background: var(--panel2); border: 1px solid var(--line); font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; } #msg.on { opacity: 1; }
  @media (max-width: 900px) { .row2 { grid-template-columns: 1fr; } }
</style></head><body><div class="wrap">
<div id="login" class="card"><h2 style="font-size:18px">Church Studio · Admin</h2><p class="muted">Enter the ADMIN_TOKEN set on the server (saved in this browser).</p><form onsubmit="event.preventDefault(); save()"><input id="token" type="password" placeholder="Admin token" autofocus><button class="hot">Open</button></form></div>
<div id="app" hidden>
  <header><span class="brand"><img src="/email/logo.png" alt="">Church Studio · Admin</span><span id="mode" class="pill"></span><span class="grow"></span><span class="muted small" id="updated"></span><button onclick="load()">Refresh</button><button onclick="logout()">Sign out</button></header>
  <section class="kpis" id="kpis"></section>
  <section class="row2">
    <div class="card"><h2>Last 30 days<span class="legend"><span><i style="background:var(--blue)"></i>New computers</span><span><i style="background:var(--accent)"></i>Trials</span><span><i style="background:var(--good)"></i>Sales</span></span></h2><svg class="chart" id="chart" viewBox="0 0 600 170" preserveAspectRatio="none"></svg><div class="axis" id="axis"></div></div>
    <div class="card"><h2>Funnel</h2><div class="funnel" id="funnel"></div><p class="muted small" style="margin:14px 0 0" id="funnel-note"></p></div>
  </section>
  <section class="mix">
    <div class="card"><h2>Plans in use (30 days)</h2><div class="bars" id="plans"></div></div>
    <div class="card"><h2>Systems</h2><div class="bars" id="systems"></div></div>
    <div class="card"><h2>Versions</h2><div class="bars" id="versions"></div></div>
  </section>
  <nav class="tabs" role="tablist" id="tabs"></nav>
  <div class="tools"><input id="q" placeholder="Search this list…" oninput="draw()"></div>
  <div class="table" id="list"></div>
  <section class="card" id="tools" hidden>
    <div><h2>Promo codes</h2><div class="table" id="promos" style="margin-bottom:12px"></div>
      <form class="grid" onsubmit="event.preventDefault(); addPromo(this)">
        <label>Code<input name="code" required placeholder="EASTER25"></label><label>% off<input name="percentOff" type="number" min="1" max="100"></label><label>$ off<input name="amountOff" type="number" min="1" step="0.01"></label><label>Extra trial days<input name="trialDays" type="number" min="1"></label><label>Plan<select name="plans"><option value="">Any</option><option>premium</option><option>church</option></select></label><label>Max uses<input name="maxUses" type="number" min="1"></label><label>Ends<input name="expiresAt" type="date"></label><button class="hot">Create code</button>
      </form></div>
    <div><h2>Refund a license</h2><p class="muted small" style="margin:-6px 0 10px">Its computers return to Free at their next check-in.</p><form class="grid" onsubmit="event.preventDefault(); refund(this)"><label>License id (8 hex)<input name="license" required pattern="[0-9a-fA-F]{8}"></label><label>Reason<input name="reason" placeholder="refund"></label><button>Revoke</button></form></div>
  </section>
</div>
<p id="msg" role="status"></p>
</div>
<script>
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem("cs-admin") || "";
const money = (c) => "$" + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ago = (t) => { if (!t) return "—"; const s = (Date.now() - (typeof t === "string" ? Date.parse(t) : t)) / 1000; if (s < 0) return "in " + Math.round(-s / 86400) + " d"; if (s < 90) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; };
const date = (t) => t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const say = (text) => { const m = $("msg"); m.textContent = text; m.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(() => m.classList.remove("on"), 3000); };
function save() { localStorage.setItem("cs-admin", $("token").value.trim()); load(); }
function logout() { localStorage.removeItem("cs-admin"); location.reload(); }
async function call(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + token(), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.status);
  return data;
}
const planTag = (p) => '<span class="tag ' + ({ premium: "orange", church: "violet", trial: "warn", free: "" }[p] ?? "") + '">' + esc(p || "free") + "</span>";
const osName = (o) => ({ macos: "Mac", windows: "Windows", linux: "Linux" }[o] ?? (String(o || "").startsWith("web") ? "Browser (" + ({ "web-macos": "Mac", "web-windows": "Windows", "web-linux": "Linux" }[o] ?? "other") + ")" : o || "—"));
const bars = (rows) => { const total = rows.reduce((a, [, v]) => a + v, 0) || 1; return rows.length ? rows.map(([k, v]) => '<div><span>' + esc(k) + '</span><span class="track"><i style="width:' + Math.max(3, (v / total) * 100) + '%;background:var(--accent)"></i></span><em>' + v + "</em></div>").join("") : '<p class="muted small">Nothing yet</p>'; };

let S = null, D = null, tab = "computers";
const TABS = [["computers", "Computers"], ["trials", "Trials"], ["checkouts", "Sales"], ["licenses", "Licenses"], ["accounts", "Accounts"], ["tools", "Promos & refunds"]];

async function load() {
  if (!token()) return;
  try {
    [S, D] = await Promise.all([call("/v1/admin/stats"), call("/v1/admin/details")]);
    $("login").hidden = true; $("app").hidden = false;
    $("mode").textContent = S.test ? S.provider + " · test mode" : S.provider + " · live";
    $("mode").className = "pill " + (S.test ? "test" : "live");
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const conv = S.trials.started ? Math.round((S.trials.converted / S.trials.started) * 100) : 0;
    const kpi = (t, v, sub) => '<div class="kpi"><h3>' + t + "</h3><b>" + v + "</b><span>" + sub + "</span></div>";
    $("kpis").innerHTML = kpi("Active this week", S.computers.active7, S.computers.active1 + " today · " + S.computers.active30 + " this month")
      + kpi("Computers", S.computers.total, S.computers.newThisWeek + " new this week")
      + kpi("Trials running", S.trials.running, S.trials.started + " started")
      + kpi("Trial → paid", conv + "%", S.trials.converted + " bought")
      + kpi("MRR", money(S.subscriptions.mrr), S.subscriptions.active + " active subscriptions")
      + kpi("Revenue · 30 days", money(S.sales.revenue30), money(S.sales.revenue) + " all time")
      + kpi("Accounts", D.accounts.length, "signed up");
    chart(); funnel();
    $("plans").innerHTML = bars(S.plans); $("systems").innerHTML = bars(S.systems.map(([k, v]) => [osName(k), v])); $("versions").innerHTML = bars(S.versions.map(([k, v]) => ["v" + k, v]));
    tabs(); draw();
  } catch (e) { say("Could not load: " + e.message); if (/token|401/i.test(String(e.message))) { $("login").hidden = false; $("app").hidden = true; } }
}

function chart() {
  const series = [["computers", "var(--blue)"], ["trials", "var(--accent)"], ["sales", "var(--good)"]];
  const max = Math.max(1, ...series.flatMap(([k]) => D.series[k]));
  const n = D.days.length, w = 600 / n, bw = (w - 4) / 3;
  let svg = "";
  for (let g = 1; g <= 3; g++) svg += '<line x1="0" x2="600" y1="' + (170 - (g / 3) * 160) + '" y2="' + (170 - (g / 3) * 160) + '" stroke="rgba(255,255,255,.06)"/>';
  D.days.forEach((day, i) => series.forEach(([k, color], j) => { const v = D.series[k][i]; if (!v) return; const h = (v / max) * 160; svg += '<rect x="' + (i * w + 2 + j * bw) + '" y="' + (170 - h) + '" width="' + Math.max(1, bw - 1) + '" height="' + h + '" rx="1.5" fill="' + color + '"><title>' + day + ": " + v + " " + k + "</title></rect>"; }));
  $("chart").innerHTML = svg;
  $("axis").innerHTML = "<span>" + date(D.days[0]) + "</span><span>peak " + max + " a day</span><span>Today</span>";
}

function funnel() {
  const f = D.funnel, top = Math.max(1, f.computers);
  const step = (label, v, color) => '<div class="step"><header><span>' + label + "</span><b>" + v + (v && label !== "Computers" ? " · " + Math.round((v / top) * 100) + "%" : "") + '</b></header><div class="track"><i style="width:' + Math.max(2, (v / top) * 100) + "%;background:" + color + '"></i></div></div>';
  $("funnel").innerHTML = step("Computers", f.computers, "var(--blue)") + step("Trials", f.trials, "var(--accent)") + step("Paid", f.paid, "var(--good)");
  $("funnel-note").textContent = "Counts every computer that checked in (with usage sharing on), every trial started and every paid checkout.";
}

function tabs() {
  const count = { computers: D.computers.length, trials: D.trials.length, checkouts: D.checkouts.length, licenses: D.licenses.length, accounts: D.accounts.length, tools: S.promos.length };
  $("tabs").innerHTML = TABS.map(([id, label]) => '<button role="tab" data-tab="' + id + '" aria-selected="' + (tab === id) + '">' + label + '<span class="count">' + count[id] + "</span></button>").join("");
}

const TABLES = {
  computers: { head: ["Computer", "System", "Version", "Plan", "First seen", "Last seen"], row: (c) => ['<span class="mono">' + esc(c.id) + "</span>", osName(c.os), "v" + esc(c.version || "—"), planTag(c.plan), date(c.first), ago(c.last)] },
  trials: { head: ["Computer", "Started", "Ends", "State"], row: (t) => ['<span class="mono">' + esc(t.device) + "</span>", date(t.startedAt), date(t.endsAt) + ' <span class="muted small">(' + ago(t.endsAt) + ")</span>", '<span class="tag ' + ({ running: "good", ending: "warn", converted: "violet", ended: "" }[t.state]) + '">' + t.state + "</span>"] },
  checkouts: { head: ["When", "Who", "Plan", "Amount", "Promo", "Status"], row: (c) => [c.createdAt ? date(c.createdAt) : date(c.paidAt), esc(c.name || "—") + '<div class="muted small">' + esc(c.email || "") + "</div>", planTag(c.plan) + ' <span class="muted small">' + esc(c.interval) + "</span>", money(c.due), c.promo ? '<span class="tag orange">' + esc(c.promo) + "</span>" : "—", '<span class="tag ' + ({ paid: "good", pending: "warn", cancelled: "bad" }[c.status] ?? "") + '">' + esc(c.status) + "</span>"] },
  licenses: { head: ["License", "Owner", "Seats used", "Computers", "Paid until", "State"], row: (l) => ['<span class="mono">' + esc(l.license) + "</span>", esc(l.email || "—"), l.devices.length, l.devices.map((d) => esc(d.name) + ' <span class="muted small">' + ago(d.seenAt) + "</span>").join("<br>") || "—", l.paidUntil ? date(l.paidUntil) : "never ends", l.revoked ? '<span class="tag bad">revoked</span>' : l.test ? '<span class="tag warn">test</span>' : '<span class="tag good">active</span>'] },
  accounts: { head: ["Email", "Signed up"], row: (a) => [esc(a.email), date(a.createdAt) + ' <span class="muted small">(' + ago(a.createdAt) + ")</span>"] },
};

function draw() {
  const tools = tab === "tools";
  $("tools").hidden = !tools; $("list").hidden = tools; $("q").parentElement.hidden = tools;
  if (tools) { promos(); return; }
  const def = TABLES[tab], q = $("q").value.trim().toLowerCase();
  const rows = D[tab].map(def.row).filter((cells) => !q || cells.join(" ").replace(/<[^>]+>/g, " ").toLowerCase().includes(q));
  $("list").innerHTML = rows.length ? "<table><thead><tr>" + def.head.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" + rows.map((cells) => "<tr>" + cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : '<div class="empty">' + (q ? "Nothing matches." : "Nothing here yet.") + "</div>";
}

function promos() {
  $("promos").innerHTML = S.promos.length ? "<table><thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Ends</th></tr></thead><tbody>" + S.promos.map((p) => "<tr><td><b>" + esc(p.code) + "</b></td><td>" + (p.percentOff ? p.percentOff + "% off" : p.amountOff ? money(p.amountOff) + " off" : "") + (p.trialDays ? " +" + p.trialDays + " trial days" : "") + "</td><td>" + p.used + (p.maxUses ? " / " + p.maxUses : "") + "</td><td>" + (p.expiresAt ? date(p.expiresAt) : "—") + "</td></tr>").join("") + "</tbody></table>" : '<div class="empty">No codes yet.</div>';
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
  try { await call("/v1/admin/promos", body); form.reset(); say("Code created."); load(); } catch (e) { say(e.message); }
}
async function refund(form) {
  const f = Object.fromEntries(new FormData(form));
  if (!confirm("Revoke license " + f.license + "? Its computers drop to Free at their next check-in.")) return;
  try { await call("/v1/admin/refund", { license: f.license.toLowerCase(), reason: f.reason }); form.reset(); say("License revoked."); load(); } catch (e) { say(e.message); }
}
$("tabs").addEventListener("click", (event) => { const button = event.target.closest("[data-tab]"); if (!button) return; tab = button.dataset.tab; tabs(); draw(); });
load();
setInterval(() => { if (!document.hidden && token()) load(); }, 60_000);
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
      <p class="muted intro">Signing in <b>${escape(device ?? "your computer")}</b>. Your plan follows your account, so another computer only needs you to sign in. No password to remember.</p>
      <div class="methods">
        ${social.map((method) => `<button type="button" class="method" onclick="social('${method}')">${METHOD_LABELS[method]!.icon}<span>${METHOD_LABELS[method]!.label}</span></button>`).join("")}
      </div>
      ${
        methods.includes("email")
          ? `${social.length ? `<div class="or"><span>or</span></div>` : ""}
      <form class="email" id="email-form" onsubmit="event.preventDefault(); emailLink(this.email.value)">
        <input name="email" type="email" required autocomplete="email" placeholder="you@church.org" aria-label="Email" />
        <button type="submit">Email me a sign-in link</button>
      </form>
      <div class="sent" id="sent" hidden>
        <div class="sent-head">
          <div class="envelope" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
          <div>
            <h2>Check your email</h2>
            <p class="sent-copy">We sent a sign-in link to <b id="sent-to"></b>. Open it on this device; it works once, for 15 minutes.</p>
          </div>
        </div>
        <div class="sent-actions">
          <button type="button" class="resend" id="resend" onclick="resend()">Resend email</button>
          <button type="button" class="resend ghost" onclick="changeEmail()">Use a different email</button>
        </div>
        <p class="hint">Nothing yet? Check spam or promotions, then resend.</p>
      </div>`
          : ""
      }
      <p id="msg" class="msg" role="status"></p>
      <form method="post" action="/signin/${escape(id)}/cancel"><button type="submit" class="cancel">Cancel</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · Church Studio</title>
<style>${BASE_CSS}
  main { width: min(520px, calc(100% - 32px)); margin: 8vh auto; padding: 30px 28px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: 0 24px 60px rgb(0 0 0 / .12); }
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
  .sent { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); }
  .sent[hidden], .methods[hidden], .or[hidden], .email[hidden], .intro[hidden] { display: none; }
  .sent-head { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: start; }
  .envelope { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .sent h2 { margin: 0 0 4px; font-size: 17px; letter-spacing: -.01em; }
  .sent-copy { margin: 0; font-size: 14px; line-height: 1.5; color: var(--muted); word-break: break-word; }
  .sent-copy b { color: var(--ink); }
  .sent-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .resend { height: 42px; border: 0; border-radius: 11px; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
  .resend:hover:not(:disabled) { filter: brightness(1.06); }
  .resend:disabled { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--muted); cursor: default; }
  .resend.ghost { border: 1px solid var(--line); background: none; color: var(--ink); }
  .resend.ghost:hover { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); filter: none; }
  .hint { margin: -4px 0 0; font-size: 12px; color: var(--muted); }
  @media (max-width: 460px) { .sent-actions { grid-template-columns: 1fr; } }
  .email button:disabled { opacity: .7; cursor: default; }
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
// The email link: sent, then "Check your email" with Resend (after a short wait) and a way back.
let sentTo = "";
let wait = null;
async function emailLink(value) {
  const email = String(value || "").trim();
  if (!email) return;
  const button = document.querySelector("#email-form button");
  if (button) { button.disabled = true; button.textContent = "Sending…"; }
  try {
    await post("/auth/sign-in/magic-link", { email, callbackURL: here });
    sentTo = email;
    showSent();
  } catch (e) { msg(e.message); }
  finally { if (button) { button.disabled = false; button.textContent = "Email me a sign-in link"; } }
}
function showSent() {
  msg("");
  document.querySelectorAll(".methods, .or, #email-form, .intro").forEach((el) => (el.hidden = true));
  document.getElementById("sent").hidden = false;
  document.getElementById("sent-to").textContent = sentTo;
  countdown(30);
}
function countdown(seconds) {
  const button = document.getElementById("resend");
  clearInterval(wait);
  let left = seconds;
  const tick = () => {
    button.disabled = left > 0;
    button.textContent = left > 0 ? "Resend email in " + left + "s" : "Resend email";
    left -= 1;
    if (left < -1) clearInterval(wait);
  };
  tick();
  wait = setInterval(tick, 1000);
}
async function resend() {
  const button = document.getElementById("resend");
  button.disabled = true;
  button.textContent = "Sending…";
  try { await post("/auth/sign-in/magic-link", { email: sentTo, callbackURL: here }); msg("Sent again to " + sentTo + ".", true); countdown(30); }
  catch (e) { msg(e.message); countdown(5); }
}
function changeEmail() {
  clearInterval(wait);
  document.getElementById("sent").hidden = true;
  document.querySelectorAll(".methods, .or, #email-form, .intro").forEach((el) => (el.hidden = false));
  const input = document.querySelector("#email-form input");
  if (input) { input.value = sentTo; input.focus(); input.select(); }
  msg("");
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
