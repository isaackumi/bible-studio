// The admin console page (/admin and /admin/approve/:id). Everything it shows and changes goes
// through /admin/api/* (admin.ts), which checks who is asking on every request; the buttons a role
// may not use are hidden here only for clarity.

export function adminPage(): string {
  return String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Church Studio · Admin</title>
<link rel="icon" href="/email/logo.png">
<style>
  :root { --bg: #08080b; --panel: #121217; --panel2: #18181f; --line: rgba(255,255,255,.08); --ink: #f3f3f6; --muted: #9a9aa6; --dim: #6c6c78; --accent: #fa4f00; --accent2: #ff9a4d; --good: #34c88a; --warn: #f5a524; --bad: #e5484d; --violet: #8b6cff; --blue: #4f8cff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(900px 400px at 10% -10%, rgba(250,79,0,.14), transparent 60%), var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; min-height: 100vh; }
  .wrap { width: min(1240px, calc(100% - 32px)); margin: 0 auto; padding: 22px 0 60px; }
  header.top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 16px; } .brand img { width: 28px; height: 28px; border-radius: 7px; }
  .grow { flex: 1; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: rgba(255,255,255,.07); color: var(--muted); }
  .pill.test { background: rgba(245,165,36,.16); color: var(--warn); } .pill.live { background: rgba(52,200,138,.16); color: var(--good); }
  .pill.owner { background: rgba(250,79,0,.16); color: var(--accent2); } .pill.support { background: rgba(79,140,255,.16); color: #9bbcff; }
  .muted { color: var(--muted); } .small { font-size: 12px; }
  button, .btn { height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); color: var(--ink); font: inherit; font-weight: 650; cursor: pointer; white-space: nowrap; }
  button:hover { background: var(--panel2); } button.hot { border: 0; background: var(--accent); color: #fff; } button.danger { border-color: rgba(229,72,77,.4); color: #ff8b8e; }
  button.sm { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 7px; }
  button:disabled { opacity: .5; cursor: default; }
  [hidden] { display: none !important; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
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
  .step { display: grid; gap: 4px; } .step header { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); } .step header b { color: var(--ink); }
  .track { height: 10px; border-radius: 6px; background: rgba(255,255,255,.06); overflow: hidden; } .track i { display: block; height: 100%; border-radius: 6px; }
  .mix { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .bars { display: grid; gap: 8px; font-size: 12.5px; } .bars div { display: grid; grid-template-columns: 130px 1fr 40px; gap: 8px; align-items: center; } .bars em { font-style: normal; text-align: right; color: var(--muted); }
  .tabs { display: flex; gap: 4px; padding: 4px; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); width: max-content; max-width: 100%; overflow-x: auto; }
  .tabs button { border: 0; background: none; height: 32px; color: var(--muted); } .tabs button[aria-selected="true"] { background: var(--panel2); color: var(--ink); }
  .tabs .count { margin-left: 6px; padding: 0 6px; border-radius: 6px; background: rgba(255,255,255,.07); font-size: 11px; } .tabs .count.hot { background: var(--accent); color: #fff; }
  .tools { display: flex; gap: 8px; margin-bottom: 10px; } .tools input { flex: 1; max-width: 320px; }
  input, select { height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg); color: var(--ink); font: inherit; min-width: 0; }
  .table { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { position: sticky; top: 0; background: var(--panel2); text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); padding: 10px 12px; }
  td { padding: 10px 12px; border-top: 1px solid var(--line); white-space: nowrap; vertical-align: top; } tr[data-open] { cursor: pointer; } tr[data-open]:hover td { background: rgba(255,255,255,.03); }
  .tag { display: inline-block; padding: 2px 8px; margin: 1px 2px 1px 0; border-radius: 999px; font-size: 11.5px; font-weight: 650; background: rgba(255,255,255,.07); color: var(--muted); }
  .tag.good { background: rgba(52,200,138,.15); color: #7be3b4; } .tag.warn { background: rgba(245,165,36,.15); color: var(--warn); } .tag.bad { background: rgba(229,72,77,.15); color: #ff8b8e; } .tag.violet { background: rgba(139,108,255,.16); color: #b8a6ff; } .tag.orange { background: rgba(250,79,0,.16); color: var(--accent2); } .tag.blue { background: rgba(79,140,255,.16); color: #9bbcff; }
  .mono { font-family: SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .empty { padding: 26px; text-align: center; color: var(--dim); }
  form.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: end; }
  form.grid label, .field { display: grid; gap: 4px; font-size: 11.5px; font-weight: 650; color: var(--muted); }
  #gate { max-width: 460px; margin: 18vh auto; } #gate form { display: grid; gap: 10px; margin-top: 12px; }
  #msg { position: fixed; left: 50%; bottom: 20px; translate: -50% 0; z-index: 30; max-width: calc(100% - 32px); padding: 9px 16px; border-radius: 999px; background: var(--panel2); border: 1px solid var(--line); font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; } #msg.on { opacity: 1; }
  .shade { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.5); }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 20; width: min(560px, 100%); overflow: auto; padding: 22px; border-left: 1px solid var(--line); background: var(--panel); box-shadow: -30px 0 60px rgba(0,0,0,.4); }
  .drawer h2 { margin: 0; font-size: 18px; word-break: break-word; } .drawer h3 { margin: 22px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
  .drawer .head { display: flex; align-items: start; gap: 10px; margin-bottom: 6px; }
  .facts { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; font-size: 13px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; min-width: 0; word-break: break-word; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; }
  .actform { display: grid; gap: 8px; margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
  .actform .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; } .actform .row > * { flex: 1; min-width: 120px; } .actform .row > button { flex: none; }
  .item { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; display: flex; gap: 10px; align-items: center; }
  .item .grow { min-width: 0; }
  .note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .approve { max-width: 560px; margin: 12vh auto; }
  @media (max-width: 900px) { .row2 { grid-template-columns: 1fr; } }
</style></head><body><div class="wrap">
<div id="gate" class="card" hidden><h2 style="font-size:18px">Church Studio · Admin</h2><p class="muted" id="gate-text"></p><form id="token-form" hidden><input id="token" type="password" placeholder="Admin token (look only)" autocomplete="off"><button class="hot">Open</button></form><button id="gate-retry" hidden>Try again</button></div>
<div id="approve" class="card approve" hidden></div>
<div id="app" hidden>
  <header class="top"><span class="brand"><img src="/email/logo.png" alt="">Church Studio · Admin</span><span id="mode" class="pill"></span><span class="grow"></span><span class="muted small" id="who"></span><span id="role" class="pill"></span><span class="muted small" id="updated"></span><button id="refresh">Refresh</button></header>
  <section class="kpis" id="kpis"></section>
  <section class="row2">
    <div class="card"><h2>Last 30 days<span class="legend"><span><i style="background:var(--blue)"></i>New computers</span><span><i style="background:var(--accent)"></i>Trials</span><span><i style="background:var(--good)"></i>Sales</span></span></h2><svg class="chart" id="chart" viewBox="0 0 600 170" preserveAspectRatio="none"></svg><div class="axis" id="axis"></div></div>
    <div class="card"><h2>Funnel</h2><div class="funnel" id="funnel"></div></div>
  </section>
  <section class="mix">
    <div class="card"><h2>Plans in use (30 days)</h2><div class="bars" id="plans"></div></div>
    <div class="card"><h2>Systems</h2><div class="bars" id="systems"></div></div>
    <div class="card"><h2>Versions</h2><div class="bars" id="versions"></div></div>
  </section>
  <nav class="tabs" role="tablist" id="tabs"></nav>
  <div class="tools" id="search"><input id="q" placeholder="Search this list…"></div>
  <div id="list"></div>
</div>
<div class="shade" id="shade" hidden></div>
<aside class="drawer" id="drawer" hidden aria-modal="true" role="dialog"></aside>
<p id="msg" role="status"></p>
</div>
<script>
const $ = (id) => document.getElementById(id);
const tokenOf = () => { try { return sessionStorage.getItem("cs-admin") || ""; } catch { return ""; } };
const money = (c) => "$" + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (t) => { if (!t) return "—"; const s = (Date.now() - (typeof t === "string" ? Date.parse(t) : t)) / 1000; if (s < 0) return "in " + Math.max(1, Math.round(-s / 86400)) + " d"; if (s < 90) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; };
const date = (t) => t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const when = (t) => t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const say = (text) => { const m = $("msg"); m.textContent = text; m.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(() => m.classList.remove("on"), 4500); };
const RANK = { viewer: 0, support: 1, owner: 2 };
let ME = null, S = null, D = null, AUDIT = [], APPROVALS = [], tab = "computers", open = null, form = null;

async function call(path, body) {
  const headers = { "content-type": "application/json" };
  if (tokenOf()) headers.authorization = "Bearer " + tokenOf();
  const r = await fetch(path, { method: body ? "POST" : "GET", headers, credentials: "same-origin", body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || ("Error " + r.status)); e.status = r.status; e.token = data.token; throw e; }
  return Object.assign(data, { _status: r.status });
}
const can = (role) => ME && ME.via !== "token" && RANK[ME.role] >= RANK[role];
const planTag = (p) => '<span class="tag ' + ({ premium: "orange", church: "violet", trial: "warn", free: "" }[p] ?? "") + '">' + esc(p || "free") + "</span>";
const setupTag = (s) => '<span class="tag ' + (String(s).startsWith("Browser") ? "blue" : "") + '">' + esc(s) + "</span>";
const osName = (o) => ({ macos: "Mac app", windows: "Windows app", linux: "Linux app", "web-macos": "Browser · Mac", "web-windows": "Browser · Windows", "web-linux": "Browser · Linux" }[o] ?? (o || "—"));
const bars = (rows) => { const total = rows.reduce((a, r) => a + r[1], 0) || 1; return rows.length ? rows.map((r) => '<div><span>' + esc(r[0]) + '</span><span class="track"><i style="width:' + Math.max(3, (r[1] / total) * 100) + '%;background:var(--accent)"></i></span><em>' + r[1] + "</em></div>").join("") : '<p class="muted small">Nothing yet</p>'; };

function gate(text, opts) {
  $("app").hidden = true; $("gate").hidden = false; $("gate-text").textContent = text;
  $("token-form").hidden = !(opts && opts.token); $("gate-retry").hidden = !!(opts && opts.token);
}

async function boot() {
  try { ME = await call("/admin/api/me"); }
  catch (e) {
    if (e.token) return gate("Cloudflare Access is not set up yet. The old admin token opens this page to look only.", { token: true });
    return gate(e.message + (e.status === 401 ? " If you just signed in, reload this page." : ""));
  }
  const m = location.pathname.match(/^\/admin\/approve\/([0-9a-f]{20})$/);
  if (m) return approvalPage(m[1], location.hash.slice(1));
  $("gate").hidden = true; $("app").hidden = false;
  $("who").textContent = ME.email; $("role").textContent = ME.via === "token" ? "look only" : ME.role; $("role").className = "pill " + ME.role;
  load();
}

async function load() {
  try {
    const parts = await Promise.all([call("/admin/api/stats"), call("/admin/api/details"), call("/admin/api/audit"), call("/admin/api/approvals")]);
    S = parts[0]; D = parts[1]; AUDIT = parts[2].entries; APPROVALS = parts[3].approvals;
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
      + kpi("Accounts", D.accounts.length, D.accounts.filter((a) => a.setups.length > 1).length + " on more than one setup");
    chart(); funnel();
    $("plans").innerHTML = bars(S.plans); $("systems").innerHTML = bars(S.systems.map((r) => [osName(r[0]), r[1]])); $("versions").innerHTML = bars(S.versions.map((r) => [r[0] === "unknown" ? "unknown" : "v" + r[0], r[1]]));
    tabs(); draw();
    if (open) show(open.kind, open.id, true);
  } catch (e) { say("Could not load: " + e.message); }
}

function chart() {
  const series = [["computers", "var(--blue)"], ["trials", "var(--accent)"], ["sales", "var(--good)"]];
  const max = Math.max(1, ...series.flatMap((s) => D.series[s[0]]));
  const n = D.days.length, w = 600 / n, bw = (w - 4) / 3;
  let svg = "";
  for (let g = 1; g <= 3; g++) svg += '<line x1="0" x2="600" y1="' + (170 - (g / 3) * 160) + '" y2="' + (170 - (g / 3) * 160) + '" stroke="rgba(255,255,255,.06)"/>';
  D.days.forEach((day, i) => series.forEach((s, j) => { const v = D.series[s[0]][i]; if (!v) return; const h = (v / max) * 160; svg += '<rect x="' + (i * w + 2 + j * bw) + '" y="' + (170 - h) + '" width="' + Math.max(1, bw - 1) + '" height="' + h + '" rx="1.5" fill="' + s[1] + '"><title>' + day + ": " + v + " " + s[0] + "</title></rect>"; }));
  $("chart").innerHTML = svg;
  $("axis").innerHTML = "<span>" + date(D.days[0]) + "</span><span>peak " + max + " a day</span><span>Today</span>";
}
function funnel() {
  const f = D.funnel, top = Math.max(1, f.computers);
  const step = (label, v, color) => '<div class="step"><header><span>' + label + "</span><b>" + v + (v && label !== "Computers" ? " · " + Math.round((v / top) * 100) + "%" : "") + '</b></header><div class="track"><i style="width:' + Math.max(2, (v / top) * 100) + "%;background:" + color + '"></i></div></div>';
  $("funnel").innerHTML = step("Computers", f.computers, "var(--blue)") + step("Trials", f.trials, "var(--accent)") + step("Paid", f.paid, "var(--good)");
}

const TABS = [["computers", "Computers"], ["accounts", "Accounts"], ["licenses", "Licenses"], ["trials", "Trials"], ["checkouts", "Sales"], ["promos", "Promo codes"], ["activity", "Activity"], ["approvals", "Approvals"]];
function tabs() {
  const pending = APPROVALS.filter((a) => a.status === "pending" && !a.expired).length;
  const count = { computers: D.computers.length, accounts: D.accounts.length, licenses: D.licenses.length, trials: D.trials.length, checkouts: D.checkouts.length, promos: D.promos.length, activity: AUDIT.length, approvals: pending };
  $("tabs").innerHTML = TABS.map((t) => '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '<span class="count' + (t[0] === "approvals" && pending ? " hot" : "") + '">' + count[t[0]] + "</span></button>").join("");
}

const stateTag = (l) => l.revoked ? '<span class="tag bad">stopped</span>' : l.test ? '<span class="tag warn">test</span>' : l.paidUntil && l.paidUntil < Date.now() ? '<span class="tag">ended</span>' : '<span class="tag good">active</span>';
const outcomeTag = (o) => '<span class="tag ' + ({ done: "good", approved: "good", refused: "bad", pending: "warn", declined: "" }[o] ?? "") + '">' + esc(o) + "</span>";
const TABLES = {
  computers: { open: (c) => "computer:" + c.device, head: ["Computer", "Setup", "Version", "Plan", "Account", "First seen", "Last seen"], row: (c) => ['<span class="mono">' + esc(c.id) + "</span>", setupTag(c.setup) + (c.browser ? ' <span class="muted small">' + esc(c.browser) + "</span>" : ""), "v" + esc(c.version || "—"), planTag(c.plan), c.account ? esc(c.account) : '<span class="muted">—</span>', date(c.first), ago(c.last)] },
  accounts: { open: (a) => a.id ? "account:" + a.id : null, head: ["Email", "Setups", "Signed up"], row: (a) => [esc(a.email), (a.setups.length ? a.setups.map(setupTag).join("") : '<span class="muted">—</span>') + (a.setups.length > 2 ? ' <span class="tag warn">' + a.setups.length + " setups</span>" : ""), date(a.createdAt) + ' <span class="muted small">(' + ago(a.createdAt) + ")</span>"] },
  licenses: { open: (l) => "license:" + l.license, head: ["License", "Owner", "Seats used", "Computers", "Paid until", "State"], row: (l) => ['<span class="mono">' + esc(l.license) + "</span>", esc(l.email || "—"), l.devices.length, l.devices.map((d) => esc(d.name) + ' <span class="muted small">' + ago(d.seenAt) + "</span>").join("<br>") || "—", l.paidUntil ? date(l.paidUntil) : "never ends", stateTag(l)] },
  trials: { open: (t) => "computer:" + t.deviceId, head: ["Computer", "Started", "Ends", "State"], row: (t) => ['<span class="mono">' + esc(t.device) + "</span>", date(t.startedAt), date(t.endsAt) + ' <span class="muted small">(' + ago(t.endsAt) + ")</span>", '<span class="tag ' + ({ running: "good", ending: "warn", converted: "violet", ended: "" }[t.state]) + '">' + t.state + "</span>"] },
  checkouts: { open: () => null, head: ["When", "Who", "Plan", "Amount", "Promo", "Status"], row: (c) => [c.createdAt ? date(c.createdAt) : date(c.paidAt), esc(c.name || "—") + '<div class="muted small">' + esc(c.email || "") + "</div>", planTag(c.plan) + ' <span class="muted small">' + esc(c.interval) + "</span>", money(c.due), c.promo ? '<span class="tag orange">' + esc(c.promo) + "</span>" : "—", '<span class="tag ' + ({ paid: "good", pending: "warn", cancelled: "bad" }[c.status] ?? "") + '">' + esc(c.status) + "</span>"] },
  activity: { open: () => null, head: ["When", "Who", "What", "Outcome", "Detail"], row: (a) => [when(a.at), esc(a.by) + ' <span class="muted small">' + esc(a.role) + "</span>", esc(a.action) + ' <span class="muted small">' + esc(a.target) + "</span>", outcomeTag(a.outcome), '<span class="small">' + esc(a.detail) + (a.approvedBy ? " · approved by " + esc(a.approvedBy) : "") + (a.address ? ' <span class="muted">· ' + esc(a.address) + "</span>" : "") + "</span>"] },
  approvals: { open: () => null, head: ["Asked", "Who", "What", "State"], row: (a) => [when(a.at), esc(a.by), esc(a.words), outcomeTag(a.status === "pending" && a.expired ? "expired" : a.status)] },
};

function table(def, items, q) {
  const rows = items.map((item) => ({ item, cells: def.row(item) })).filter((r) => !q || r.cells.join(" ").replace(/<[^>]+>/g, " ").toLowerCase().includes(q));
  if (!rows.length) return '<div class="table"><div class="empty">' + (q ? "Nothing matches." : "Nothing here yet.") + "</div></div>";
  return '<div class="table"><table><thead><tr>' + def.head.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => { const o = def.open(r.item); return "<tr" + (o ? ' data-open="' + esc(o) + '"' : "") + ">" + r.cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>"; }).join("") + "</tbody></table></div>";
}

function draw() {
  const q = $("q").value.trim().toLowerCase();
  $("search").hidden = tab === "promos";
  if (tab === "promos") return promos();
  const items = tab === "activity" ? AUDIT : tab === "approvals" ? APPROVALS : D[tab];
  let note = "";
  if (tab === "activity") note = '<p class="note">Every change and every refused attempt, newest first. Nobody can remove entries from here; each one was also emailed to the alert address.</p>';
  if (tab === "approvals") note = '<p class="note">Big changes wait here until an owner approves them from the emailed link.</p>';
  $("list").innerHTML = table(TABLES[tab], items, q) + note;
}

function promos() {
  const live = (p) => (!p.expiresAt || p.expiresAt > Date.now()) && (p.maxUses == null || p.used < p.maxUses);
  const L = ME.limits.promo;
  let h = '<div class="table" style="margin-bottom:14px">' + (D.promos.length ? "<table><thead><tr><th>Code</th><th>Gives</th><th>Used</th><th>Ends</th><th>Note</th><th></th></tr></thead><tbody>" + D.promos.map((p) => "<tr><td><b>" + esc(p.code) + "</b> " + (live(p) ? '<span class="tag good">live</span>' : '<span class="tag">ended</span>') + "</td><td>" + (p.percentOff ? p.percentOff + "% off " : "") + (p.amountOff ? money(p.amountOff) + " off " : "") + (p.trialDays ? "+" + p.trialDays + " trial days" : "") + "</td><td>" + p.used + (p.maxUses ? " / " + p.maxUses : "") + "</td><td>" + (p.expiresAt ? date(p.expiresAt) : "—") + '</td><td class="muted small">' + esc(p.note || "") + "</td><td>" + (live(p) && can("owner") ? '<button class="sm danger" data-end="' + esc(p.code) + '">End now</button>' : "") + "</td></tr>").join("") + "</tbody></table>" : '<div class="empty">No codes yet.</div>') + "</div>";
  if (can("owner")) h += '<div class="card"><h2>New promo code</h2><form class="grid" id="promo-form"><label>Code<input name="code" required placeholder="EASTER25"></label><label>% off<input name="percentOff" type="number" min="1" max="100"></label><label>$ off<input name="amountOff" type="number" min="1" step="0.01"></label><label>Extra trial days<input name="trialDays" type="number" min="1"></label><label>Plan<select name="plans"><option value="">Any</option><option>premium</option><option>church</option></select></label><label>Uses (required)<input name="maxUses" type="number" min="1" max="' + L.mostUses + '" required></label><label>Ends (required)<input name="expiresAt" type="date" required></label><button class="hot">Create code</button></form><p class="note">Over ' + L.percentOff + "% or " + money(L.amountOff) + " off, over " + L.trialDays + " trial days or over " + L.maxUses + " uses, a code waits for an owner’s approval by email. Codes run at most " + L.longestDays + " days.</p></div>";
  else h += '<p class="note">Only an owner can create or end codes.</p>';
  $("list").innerHTML = h;
}

// --- The drawer: one account, license or computer, with what may be done to it -----------------

const ACTS = {
  "extend-license": { label: "Extend", role: "support", fields: [["days", "Days", "number"], ["reason", "Reason", "text"]], hint: () => "Up to " + ME.limits.licenseDays[ME.role === "owner" ? "owner" : "support"] + " days at once; more waits for an owner’s approval." },
  "resend-key": { label: "Resend key email", role: "support", fields: [], hint: () => "Sent only to the email that bought it." },
  "reset-seats": { label: "Free all seats", role: "support", fields: [["reason", "Reason", "text"]], hint: () => "Freed computers keep working until their next check-in, then must activate again." },
  suspend: { label: "Suspend", role: "owner", danger: true, fields: [["reason", "Reason (required)", "text"]], hint: () => "Its computers drop to Free at their next check-in. It can be restored." },
  resume: { label: "Restore", role: "owner", fields: [["reason", "Reason", "text"]], hint: () => "Restoring always waits for an owner’s approval by email." },
  refund: { label: "Revoke for refund", role: "owner", danger: true, fields: [["reason", "Reason", "text"]], hint: () => "Refund the money in Paddle; this stops the license." },
  "extend-trial": { label: "Extend trial", role: "support", fields: [["days", "Days", "number"], ["reason", "Reason", "text"]], hint: () => "Up to " + ME.limits.trialDays[ME.role === "owner" ? "owner" : "support"] + " days at once; more waits for an owner’s approval." },
};

function actButtons(list, target) {
  const shown = list.filter((a) => can(ACTS[a].role));
  if (!shown.length) return '<p class="note">' + (ME.via === "token" ? "Look only: sign in through Cloudflare Access to make changes." : "Your role can only look.") + "</p>";
  return '<div class="acts">' + shown.map((a) => '<button class="sm' + (ACTS[a].danger ? " danger" : "") + '" data-act="' + a + '" data-target="' + esc(JSON.stringify(target)) + '">' + ACTS[a].label + "</button>").join("") + "</div>" + (form && JSON.stringify(form.target) === JSON.stringify(target) ? actForm() : "");
}
function actForm() {
  const def = ACTS[form.action];
  return '<form class="actform" id="act-form"><b>' + def.label + "</b>" + (def.fields.length ? '<div class="row">' + def.fields.map((f) => '<label class="field">' + f[1] + '<input name="' + f[0] + '" type="' + f[2] + '"' + (f[2] === "number" ? ' min="1" max="365" required' : "") + (f[1].includes("required") ? " required" : "") + "></label>").join("") + "</div>" : "") + '<div class="row"><span class="note" style="margin:0">' + def.hint() + '</span><button type="button" class="sm" id="act-cancel">Cancel</button><button class="sm hot">' + def.label + "</button></div></form>";
}

const facts = (pairs) => '<dl class="facts">' + pairs.filter((p) => p[1] !== null && p[1] !== undefined && p[1] !== "").map((p) => "<dt>" + p[0] + "</dt><dd>" + p[1] + "</dd>").join("") + "</dl>";
const head = (title, sub) => '<div class="head"><div class="grow"><h2>' + title + '</h2><div class="muted small">' + sub + '</div></div><button class="sm" id="close">Close</button></div>';
const computerItem = (c, license) => '<div class="item"><div class="grow"><b>' + esc(c.name || c.device.slice(0, 8)) + "</b> " + setupTag(c.setup) + '<div class="muted small">' + (c.browser ? esc(c.browser) + " · " : "") + "v" + esc(c.version || "—") + " · seen " + ago(c.seenAt || c.last) + (c.account ? " · " + esc(c.account) : "") + '</div></div><button class="sm" data-open="computer:' + esc(c.device) + '">Open</button>' + (license && can("support") ? '<button class="sm" data-free="' + esc(c.device) + '" data-license="' + esc(license) + '">Free seat</button>' : "") + "</div>";

function licenseBody(l) {
  const stopped = l.stopped ? '<span class="tag bad">stopped</span> <span class="small">' + esc(l.stopped.reason) + " · " + date(l.stopped.at) + "</span>" : l.paidUntil && l.paidUntil < Date.now() ? '<span class="tag">ended</span>' : '<span class="tag good">active</span>';
  const acts = l.stopped ? ["resume", "resend-key"] : ["extend-license", "resend-key", "reset-seats", "suspend", "refund"];
  return facts([["State", stopped], ["Plan", l.plan ? planTag(l.plan) + (l.subscription ? ' <span class="muted small">' + esc(l.subscription.interval) + " · " + esc(l.subscription.status) + "</span>" : "") : "—"], ["Bought with", esc(l.email || "—")], ["Accounts", l.accounts.map((a) => '<a href="#" data-open="account:' + esc(a.id) + '">' + esc(a.email) + "</a>").join(", ") || "—"], ["Paid until", l.paidUntil ? date(l.paidUntil) + ' <span class="muted small">(' + ago(l.paidUntil) + ")</span>" : "never ends"], ["Seats", l.computers.length + (l.seats ? " of " + l.seats : "")], ["Test key", l.test ? "yes (cannot unlock a real copy)" : ""], ["Added by hand", l.extensions.length ? l.extensions.map((e) => e.days + " d by " + esc(e.by) + " on " + date(e.at)).join("<br>") : ""]])
    + "<h3>Actions</h3>" + actButtons(acts, { license: l.license })
    + "<h3>Computers on this license</h3>" + (l.computers.map((c) => computerItem(c, l.license)).join("") || '<p class="note">None right now.</p>');
}

async function show(kind, id, quiet) {
  if (!id) return;
  open = { kind, id };
  $("drawer").hidden = false; $("shade").hidden = false;
  if (!quiet) $("drawer").innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (kind === "license") {
      const l = await call("/admin/api/license?id=" + encodeURIComponent(id));
      $("drawer").innerHTML = head('License <span class="mono">' + esc(l.license) + "</span>", esc(l.email || "")) + licenseBody(l);
    } else if (kind === "account") {
      const a = await call("/admin/api/account?id=" + encodeURIComponent(id));
      $("drawer").innerHTML = head(esc(a.email), esc(a.name || "") + " · signed up " + date(a.createdAt))
        + "<h3>Setups</h3>" + (a.setups.length ? a.setups.map(setupTag).join("") + (a.setups.length > 2 ? '<p class="note">Used on ' + a.setups.length + " different setups.</p>" : "") : '<p class="note">No computers seen yet.</p>')
        + facts([["Trial", a.trial ? date(a.trial.startedAt) + " → " + date(a.trial.endsAt) : "none"]])
        + "<h3>Licenses</h3>" + (a.licenses.map((l) => '<div class="item"><div class="grow"><span class="mono">' + esc(l.license) + "</span> " + (l.plan ? planTag(l.plan) : "") + " " + (l.stopped ? '<span class="tag bad">stopped</span>' : '<span class="tag good">active</span>') + '<div class="muted small">' + l.computers.length + (l.seats ? " of " + l.seats : "") + " seats · paid until " + (l.paidUntil ? date(l.paidUntil) : "—") + '</div></div><button class="sm" data-open="license:' + esc(l.license) + '">Open</button></div>').join("") || '<p class="note">No licenses.</p>')
        + "<h3>Computers</h3>" + (a.computers.map((c) => computerItem(c)).join("") || '<p class="note">None.</p>');
    } else {
      const c = D.computers.find((x) => x.device === id) || { device: id, setup: "Unknown" };
      const trial = D.trials.find((t) => t.deviceId === id);
      const seats = D.licenses.filter((l) => l.devices.some((d) => d.device === id));
      $("drawer").innerHTML = head('Computer <span class="mono">' + esc(id.slice(0, 8)) + "</span>", setupTag(c.setup))
        + facts([["Setup", esc(c.setup)], ["Browser", esc(c.browser || "")], ["Version", c.version ? "v" + esc(c.version) : ""], ["Plan", c.plan ? planTag(c.plan) : ""], ["Account", c.accountId ? '<a href="#" data-open="account:' + esc(c.accountId) + '">' + esc(c.account || c.accountId) + "</a>" : "not signed in"], ["First seen", date(c.first)], ["Last seen", ago(c.last)], ["Full id", '<span class="mono">' + esc(id) + "</span>"]])
        + "<h3>Trial</h3>" + (trial ? facts([["Started", date(trial.startedAt)], ["Ends", date(trial.endsAt) + ' <span class="muted small">(' + ago(trial.endsAt) + ")</span>"], ["State", esc(trial.state)]]) + (trial.state !== "converted" ? actButtons(["extend-trial"], { device: id }) : "") : '<p class="note">No trial on this computer.</p>')
        + "<h3>Licenses</h3>" + (seats.map((l) => '<div class="item"><div class="grow"><span class="mono">' + esc(l.license) + "</span> " + stateTag(l) + '<div class="muted small">' + esc(l.email) + '</div></div><button class="sm" data-open="license:' + esc(l.license) + '">Open</button></div>').join("") || '<p class="note">Not on any license.</p>');
    }
  } catch (e) { $("drawer").innerHTML = head("Could not open", "") + '<p class="note">' + esc(e.message) + "</p>"; }
}
function closeDrawer() { open = null; form = null; $("drawer").hidden = true; $("shade").hidden = true; }

async function run(body, label) {
  try {
    const r = await call("/admin/api/action", body);
    say(r._status === 202 ? r.message : label + ": " + (r.detail || "done"));
    form = null; await load();
  } catch (e) { say(e.message); }
}

// --- Approval page (/admin/approve/:id#token, from the email) ------------------------------------

async function approvalPage(id, token) {
  $("gate").hidden = true; $("approve").hidden = false;
  let a = null;
  try { a = (await call("/admin/api/approvals")).approvals.find((x) => x.id === id); } catch (e) { $("approve").innerHTML = "<h2>Could not load</h2><p class=muted>" + esc(e.message) + "</p>"; return; }
  if (!a) { $("approve").innerHTML = '<h2>No such approval</h2><p class="muted">It may have been removed. <a href="/admin">Open the admin page</a>.</p>'; return; }
  const done = a.status !== "pending" || a.expired;
  $("approve").innerHTML = '<h2 style="font-size:18px">Approve this change?</h2>' + facts([["Asked by", esc(a.by) + " (" + esc(a.role) + ")"], ["Change", esc(a.words)], ["Reason", esc(a.reason || "—")], ["Asked", when(a.at)], ["State", a.expired && a.status === "pending" ? "expired" : esc(a.status)]])
    + (done ? '<p class="note">Nothing to do. <a href="/admin">Open the admin page</a>.</p>' : ME.role !== "owner" ? '<p class="note">Only an owner can approve.</p>' : '<div class="acts" style="margin-top:16px"><button class="hot" id="yes">Approve</button><button class="danger" id="no">Decline</button></div><p class="note">You are signed in as ' + esc(ME.email) + ".</p>");
  const go = async (decline) => {
    try { const r = await call("/admin/api/approve", { id, token, decline }); $("approve").innerHTML = "<h2>" + (decline ? "Declined" : "Approved and done") + '</h2><p class="muted">' + esc(r.detail || "Nothing was changed.") + '</p><p><a href="/admin">Open the admin page</a></p>'; }
    catch (e) { say(e.message); }
  };
  if ($("yes")) { $("yes").onclick = () => go(false); $("no").onclick = () => go(true); }
}

// --- Wiring ---------------------------------------------------------------------------------------

document.addEventListener("click", (event) => {
  const t = event.target.closest("[data-tab],[data-open],[data-act],[data-free],[data-end],#close,#shade,#act-cancel,#refresh,#gate-retry");
  if (!t) return;
  if (t.id === "close" || t.id === "shade") return closeDrawer();
  if (t.id === "refresh") return load();
  if (t.id === "gate-retry") return location.reload();
  if (t.id === "act-cancel") { form = null; return show(open.kind, open.id, true); }
  if (t.dataset.tab) { tab = t.dataset.tab; tabs(); return draw(); }
  if (t.dataset.open) { event.preventDefault(); const i = t.dataset.open.indexOf(":"); form = null; return show(t.dataset.open.slice(0, i), t.dataset.open.slice(i + 1)); }
  if (t.dataset.act) { form = { action: t.dataset.act, target: JSON.parse(t.dataset.target) }; if (!ACTS[form.action].fields.length) { const f = form; return confirm(ACTS[f.action].label + "?") && run(Object.assign({ action: f.action }, f.target), ACTS[f.action].label); } return show(open.kind, open.id, true); }
  if (t.dataset.free) { if (confirm("Free this computer’s seat? It keeps working until its next check-in.")) run({ action: "release-device", license: t.dataset.license, device: t.dataset.free }, "Seat freed"); return; }
  if (t.dataset.end) { if (confirm("End code " + t.dataset.end + " now? It stops working at once.")) run({ action: "end-promo", code: t.dataset.end }, "Code ended"); }
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const el = event.target;
  const f = Object.fromEntries(new FormData(el));
  if (el.id === "token-form") { try { sessionStorage.setItem("cs-admin", $("token").value.trim()); } catch {} return boot(); }
  if (el.id === "act-form") {
    const body = Object.assign({ action: form.action }, form.target);
    if (f.days) body.days = Number(f.days);
    if (f.reason) body.reason = f.reason;
    const def = ACTS[form.action];
    if (def.danger && !confirm(def.label + "? " + def.hint())) return;
    return run(body, def.label);
  }
  if (el.id === "promo-form") {
    const body = { action: "create-promo", code: f.code, maxUses: Number(f.maxUses), expiresAt: f.expiresAt + "T23:59:59Z" };
    if (f.percentOff) body.percentOff = Number(f.percentOff);
    if (f.amountOff) body.amountOff = Math.round(Number(f.amountOff) * 100);
    if (f.trialDays) body.trialDays = Number(f.trialDays);
    if (f.plans) body.plans = [f.plans];
    return run(body, "Code created");
  }
});
$("q").addEventListener("input", draw);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && open) closeDrawer(); });
boot();
setInterval(() => { if (!document.hidden && S && !open) load(); }, 60000);
</script></body></html>`;
}
