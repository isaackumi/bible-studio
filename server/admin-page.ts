// The admin console page (/admin and /admin/approve/:id). Everything it shows and changes goes
// through /admin/api/* (admin.ts), which checks who is asking on every request; the buttons a role
// may not use are hidden here only for clarity.

export function adminPage(): string {
  return String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Church Studio · Admin</title>
<link rel="icon" href="/email/logo.png">
<style>
  :root { --bg: #08080b; --panel: #121217; --panel2: #18181f; --panel3: #1f1f28; --line: rgba(255,255,255,.08); --line2: rgba(255,255,255,.14); --ink: #f3f3f6; --muted: #9a9aa6; --dim: #6c6c78; --accent: #fa4f00; --accent2: #ff9a4d; --good: #34c88a; --warn: #f5a524; --bad: #e5484d; --violet: #8b6cff; --blue: #4f8cff;
    --h: 36px; --h-sm: 30px; --r: 10px; --r-sm: 8px; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(900px 400px at 10% -10%, rgba(250,79,0,.12), transparent 60%), var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; min-height: 100vh; }
  .wrap { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 0 0 60px; }
  [hidden] { display: none !important; }
  svg.i { width: 16px; height: 16px; flex: none; vertical-align: -3px; }
  svg.i.lg { width: 28px; height: 28px; }
  .muted { color: var(--muted); } .small { font-size: 12px; } .dim { color: var(--dim); }

  /* Controls: one height for buttons, inputs and selects; a smaller one for buttons in rows. */
  button, .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: var(--h); padding: 0 14px; border: 1px solid var(--line2); border-radius: var(--r); background: var(--panel2); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s; }
  button:hover { background: var(--panel3); border-color: rgba(255,255,255,.22); }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button.hot { border-color: transparent; background: var(--accent); color: #fff; } button.hot:hover { background: #ff6420; }
  button.danger { border-color: rgba(229,72,77,.45); background: rgba(229,72,77,.08); color: #ff8b8e; } button.danger:hover { background: rgba(229,72,77,.16); }
  button.ghost { background: none; border-color: transparent; color: var(--muted); } button.ghost:hover { color: var(--ink); background: var(--panel2); }
  button.sm { height: var(--h-sm); padding: 0 11px; font-size: 12px; border-radius: var(--r-sm); }
  button.icon { width: var(--h); padding: 0; } button.icon.sm { width: var(--h-sm); }
  button:disabled { opacity: .5; cursor: default; }
  input, select { height: var(--h); padding: 0 12px; border: 1px solid var(--line2); border-radius: var(--r); background: var(--bg); color: var(--ink); font: inherit; font-size: 13px; min-width: 0; width: 100%; }
  input::placeholder { color: var(--dim); }
  select { appearance: none; padding-right: 30px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
  label.field { display: grid; gap: 6px; font-size: 12px; font-weight: 650; color: var(--muted); }

  /* Top bar */
  .top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 18px; padding: 14px 0; background: rgba(8,8,11,.82); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 15px; } .brand img { width: 28px; height: 28px; border-radius: 7px; }
  .grow { flex: 1; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: rgba(255,255,255,.07); color: var(--muted); }
  .pill.test { background: rgba(245,165,36,.14); color: var(--warn); } .pill.live { background: rgba(52,200,138,.14); color: var(--good); }
  .pill.owner { background: rgba(250,79,0,.16); color: var(--accent2); } .pill.support { background: rgba(79,140,255,.16); color: #9bbcff; }
  .me { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .avatar { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--violet)); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .02em; }
  .avatar.sm { width: 24px; height: 24px; font-size: 10px; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px rgba(52,200,138,.18); flex: none; }

  /* Numbers */
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
  .kpi { position: relative; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); overflow: hidden; }
  .kpi h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
  .kpi h3 svg { width: 14px; height: 14px; color: var(--muted); }
  .kpi b { display: block; font-size: 26px; font-weight: 750; letter-spacing: -.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .kpi span { display: block; margin-top: 4px; font-size: 12px; color: var(--muted); }
  .kpi.alert { border-color: rgba(250,79,0,.45); }
  .row2 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; }
  .card { padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); min-width: 0; }
  .card h2 { margin: 0 0 14px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .card h2 .sub { margin-left: auto; font-size: 11.5px; font-weight: 600; color: var(--dim); }
  .legend { display: flex; gap: 14px; margin-left: auto; font-size: 11.5px; font-weight: 600; color: var(--muted); } .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
  .chart { display: block; width: 100%; height: 170px; }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: 4px; }
  .funnel { display: grid; gap: 12px; }
  .step { display: grid; gap: 5px; } .step header { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); } .step header b { color: var(--ink); }
  .track { height: 8px; border-radius: 6px; background: rgba(255,255,255,.06); overflow: hidden; display: flex; } .track i { display: block; height: 100%; }
  .mix { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .bars { display: grid; gap: 10px; font-size: 12.5px; }
  .bar { display: grid; grid-template-columns: minmax(0, 130px) 1fr 44px; gap: 10px; align-items: center; }
  .bar .name { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar em { font-style: normal; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .split { display: flex; gap: 12px; margin-top: 12px; font-size: 11.5px; color: var(--muted); } .split i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }

  /* Lists */
  .listbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .tabs { display: flex; gap: 2px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); max-width: 100%; overflow-x: auto; }
  .tabs button { height: 32px; border: 0; background: none; color: var(--muted); padding: 0 12px; } .tabs button:hover { background: var(--panel2); color: var(--ink); } .tabs button[aria-selected="true"] { background: var(--panel3); color: var(--ink); }
  .tabs .count { padding: 0 6px; border-radius: 6px; background: rgba(255,255,255,.07); font-size: 11px; line-height: 18px; } .tabs .count.hot { background: var(--accent); color: #fff; }
  .search { position: relative; flex: 1; min-width: 200px; max-width: 340px; margin-left: auto; } .search input { padding-left: 34px; } .search svg { position: absolute; left: 11px; top: 10px; color: var(--dim); }
  .table { overflow: auto; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { position: sticky; top: 0; background: var(--panel2); text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); padding: 10px 14px; white-space: nowrap; }
  td { padding: 11px 14px; border-top: 1px solid var(--line); white-space: nowrap; vertical-align: middle; }
  tr[data-open] { cursor: pointer; } tr[data-open]:hover td { background: rgba(255,255,255,.025); }
  td .two { display: grid; line-height: 1.35; } td .two small { color: var(--dim); font-size: 11.5px; }
  .who { display: flex; align-items: center; gap: 10px; }
  .tag { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; margin: 1px 4px 1px 0; border-radius: 999px; font-size: 11.5px; font-weight: 650; background: rgba(255,255,255,.07); color: var(--muted); vertical-align: middle; }
  .tag.good { background: rgba(52,200,138,.14); color: #7be3b4; } .tag.warn { background: rgba(245,165,36,.14); color: var(--warn); } .tag.bad { background: rgba(229,72,77,.14); color: #ff8b8e; } .tag.violet { background: rgba(139,108,255,.16); color: #b8a6ff; } .tag.orange { background: rgba(250,79,0,.16); color: var(--accent2); } .tag.blue { background: rgba(79,140,255,.15); color: #9bbcff; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px 0 7px; margin: 1px 4px 1px 0; border: 1px solid var(--line); border-radius: 999px; background: var(--panel2); font-size: 12px; font-weight: 600; color: var(--ink); vertical-align: middle; }
  .chip .icons { display: inline-flex; gap: 3px; }
  .seats { display: flex; align-items: center; gap: 8px; } .seats .track { width: 60px; }
  .mono { font-family: SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .empty { padding: 34px; text-align: center; color: var(--dim); }
  .note { margin: 10px 2px 0; font-size: 12px; color: var(--muted); }

  /* Forms */
  form.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; align-items: end; }
  form.grid button { width: 100%; }

  /* Drawer */
  .shade { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.55); backdrop-filter: blur(2px); }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 20; width: min(580px, 100%); overflow: auto; padding: 22px 24px 40px; border-left: 1px solid var(--line); background: var(--panel); box-shadow: -30px 0 60px rgba(0,0,0,.45); }
  .drawer .head { display: flex; align-items: flex-start; gap: 14px; padding-bottom: 16px; margin-bottom: 4px; border-bottom: 1px solid var(--line); }
  .drawer .badge { display: grid; place-items: center; width: 48px; height: 48px; flex: none; border-radius: 14px; background: var(--panel2); border: 1px solid var(--line); }
  .drawer h2 { margin: 0; font-size: 18px; word-break: break-word; } .drawer .head .sub { margin-top: 3px; font-size: 12.5px; color: var(--muted); }
  .drawer h3 { margin: 22px 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
  .facts { display: grid; grid-template-columns: 140px 1fr; gap: 8px 14px; margin: 14px 0 0; font-size: 13px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; min-width: 0; word-break: break-word; }
  .stats3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; } .stats3 div { padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); } .stats3 b { display: block; font-size: 18px; } .stats3 span { font-size: 11.5px; color: var(--muted); }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .actform { display: grid; gap: 12px; margin-top: 12px; padding: 14px; border: 1px solid var(--line2); border-radius: 12px; background: var(--bg); }
  .actform .fields { display: grid; grid-template-columns: 120px 1fr; gap: 10px; }
  .actform .foot { display: flex; align-items: center; gap: 8px; } .actform .foot .note { flex: 1; margin: 0; }
  .item { display: flex; gap: 12px; align-items: center; padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
  .item .grow { min-width: 0; } .item .grow b { font-weight: 650; }
  a { color: var(--accent2); text-decoration: none; } a:hover { text-decoration: underline; }

  #gate { max-width: 460px; margin: 18vh auto; } #gate form { display: grid; gap: 10px; margin-top: 12px; }
  .approve { max-width: 560px; margin: 12vh auto; }
  #msg { position: fixed; left: 50%; bottom: 20px; translate: -50% 0; z-index: 30; max-width: calc(100% - 32px); padding: 10px 16px; border-radius: 999px; background: var(--panel3); border: 1px solid var(--line2); font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.4); opacity: 0; transition: opacity .2s; pointer-events: none; } #msg.on { opacity: 1; }
  @media (max-width: 1000px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 900px) { .row2 { grid-template-columns: 1fr; } .search { max-width: none; margin-left: 0; } .facts { grid-template-columns: 110px 1fr; } }
</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="g-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1fa2e8"/><stop offset=".55" stop-color="#0f6cbd"/><stop offset="1" stop-color="#3ccf91"/></linearGradient>
  <linearGradient id="g-fox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffbd2e"/><stop offset=".5" stop-color="#ff6a1f"/><stop offset="1" stop-color="#e31587"/></linearGradient>
  <linearGradient id="g-safari" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fc4ff"/><stop offset="1" stop-color="#1a6ff2"/></linearGradient>
</defs></svg>
<div class="wrap">
<div id="gate" class="card" hidden><h2 style="font-size:18px">Church Studio · Admin</h2><p class="muted" id="gate-text"></p><form id="token-form" hidden><input id="token" type="password" placeholder="Admin token (look only)" autocomplete="off"><button class="hot">Open</button></form><button id="gate-retry" hidden>Try again</button></div>
<div id="approve" class="card approve" hidden></div>
<div id="app" hidden>
  <header class="top"><span class="brand"><img src="/email/logo.png" alt="">Church Studio · Admin</span><span id="mode" class="pill"></span><span class="grow"></span><span class="muted small" id="updated"></span><button class="icon sm ghost" id="refresh" title="Refresh" aria-label="Refresh"></button><span class="me"><span class="avatar" id="me-avatar"></span><span id="who"></span><span id="role" class="pill"></span></span></header>
  <section class="kpis" id="kpis"></section>
  <p class="note" id="team-note" style="margin:-4px 2px 14px"></p>
  <section class="row2">
    <div class="card"><h2>Last 30 days<span class="legend"><span><i style="background:var(--blue)"></i>New installs</span><span><i style="background:var(--accent)"></i>Trials</span><span><i style="background:var(--good)"></i>Sales</span></span></h2><svg class="chart" id="chart" viewBox="0 0 600 170" preserveAspectRatio="none"></svg><div class="axis" id="axis"></div></div>
    <div class="card"><h2>Funnel</h2><div class="funnel" id="funnel"></div></div>
  </section>
  <section class="row2">
    <div class="card"><h2>Active each day<span class="sub">installed apps · 60 days</span><span class="legend"><span><i style="background:var(--blue)"></i>Computers</span><span><i style="background:var(--good)"></i>Signed-in people</span></span></h2><svg class="chart" id="usage-chart" viewBox="0 0 600 170" preserveAspectRatio="none"></svg><div class="axis" id="usage-axis"></div></div>
    <div class="card"><h2>Active now</h2><div id="usage-now"></div></div>
  </section>
  <section class="row2">
    <div class="card"><h2>Downloads from the website<span class="sub">60 days</span></h2><svg class="chart" id="dl-chart" viewBox="0 0 600 170" preserveAspectRatio="none"></svg><div class="axis" id="dl-axis"></div><div id="dl-site"></div></div>
    <div class="card"><h2>Downloads on GitHub<span class="sub">all time · each version</span></h2><div id="dl-github"></div></div>
  </section>
  <section class="mix">
    <div class="card"><h2>Systems<span class="sub">30 days</span></h2><div class="bars" id="platforms"></div><div class="split"><span><i style="background:var(--accent)"></i>Installed app</span><span><i style="background:var(--blue)"></i>Browser</span></div></div>
    <div class="card"><h2>Browsers<span class="sub">web version · 30 days</span></h2><div class="bars" id="browsers"></div></div>
    <div class="card"><h2>Plans in use<span class="sub">30 days</span></h2><div class="bars" id="plans"></div></div>
    <div class="card"><h2>Versions<span class="sub">30 days</span></h2><div class="bars" id="versions"></div></div>
  </section>
  <div class="listbar"><nav class="tabs" role="tablist" id="tabs"></nav><label class="search" id="search"><span id="search-icon"></span><input id="q" placeholder="Search this list…" aria-label="Search this list"></label></div>
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
const initials = (s) => { const parts = String(s || "?").split("@")[0].split(/[._\s-]+/).filter(Boolean); return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase(); };
const RANK = { viewer: 0, support: 1, owner: 2 };
let ME = null, S = null, D = null, AUDIT = [], APPROVALS = [], tab = "computers", open = null, form = null;

// --- Icons: systems, browsers, and a few for the page ---------------------------------------------

const ICONS = {
  mac: '<svg class="i" viewBox="0 0 24 24"><path fill="#e8e8ee" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.1zM14 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>',
  windows: '<svg class="i" viewBox="0 0 24 24"><path fill="#3a9bff" d="M3 5.3 10.4 4.3v7.1H3zM11.4 4.1 21 2.8v8.6h-9.6zM3 12.4h7.4v7.2L3 18.6zM11.4 12.4H21v8.7l-9.6-1.3z"/></svg>',
  linux: '<svg class="i" viewBox="0 0 24 24"><ellipse cx="12" cy="13.5" rx="6.6" ry="8.2" fill="#2b2b33" stroke="#8d8d99" stroke-width="1"/><ellipse cx="12" cy="15.6" rx="4.1" ry="5.3" fill="#f1f1f4"/><circle cx="10.2" cy="9.4" r="1.25" fill="#fff"/><circle cx="13.8" cy="9.4" r="1.25" fill="#fff"/><circle cx="10.4" cy="9.6" r=".55" fill="#111"/><circle cx="13.6" cy="9.6" r=".55" fill="#111"/><ellipse cx="12" cy="11.5" rx="1.9" ry="1.05" fill="#f5b400"/><ellipse cx="8.6" cy="21.4" rx="2.4" ry="1.1" fill="#f5b400"/><ellipse cx="15.4" cy="21.4" rx="2.4" ry="1.1" fill="#f5b400"/></svg>',
  other: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="#9a9aa6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  Chrome: '<svg class="i" viewBox="0 0 24 24"><path fill="#ea4335" d="M12 12 3.34 7A10 10 0 0 1 20.66 7z"/><path fill="#fbbc04" d="M12 12 20.66 7A10 10 0 0 1 12 22z"/><path fill="#34a853" d="M12 12 12 22A10 10 0 0 1 3.34 7z"/><circle cx="12" cy="12" r="4.7" fill="#fff"/><circle cx="12" cy="12" r="3.7" fill="#4285f4"/></svg>',
  Safari: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g-safari)"/><circle cx="12" cy="12" r="8.3" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="1 1.6"/><path fill="#ff3b30" d="M10.6 10.6 17.6 6.4 13.4 13.4z"/><path fill="#fff" d="M10.6 10.6 6.4 17.6 13.4 13.4z"/></svg>',
  Edge: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g-edge)"/><path d="M7.2 13.4a5 5 0 1 1 9.6 1.6c-1 1.5-3.4 1.9-5 .9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  Firefox: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g-fox)"/><circle cx="12.8" cy="12.6" r="5.4" fill="#5b2bd0"/><path d="M7.2 9.5c1.6-2.6 4.6-3.6 7.4-2.6" fill="none" stroke="#ffd567" stroke-width="1.6" stroke-linecap="round"/></svg>',
  Opera: '<svg class="i" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8.6" ry="9.6" fill="none" stroke="#ff1b2d" stroke-width="3.2"/><ellipse cx="12" cy="12" rx="3.4" ry="7" fill="none" stroke="#c4111f" stroke-width="2"/></svg>',
  Other: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="#9bbcff" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  refresh: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  people: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.7 2.6 2.4 3 5.2"/></svg>',
  monitor: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  clock: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  card: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
  chart: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  key: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  globe: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>',
};
const big = (svg) => svg.replace('class="i"', 'class="i lg"');

/** A setup from a computer (os "web-windows", browser "Edge 129") or a label ("Browser · Windows · Edge"). */
function setupOf(x) {
  if (typeof x === "string") {
    const parts = x.split(" · ");
    const sys = /Mac/.test(x) ? "mac" : /Windows/.test(x) ? "windows" : /Linux/.test(x) ? "linux" : "other";
    return { sys, web: parts[0] === "Browser", browser: parts[2] || (parts[0] === "Browser" ? "Other" : ""), label: x };
  }
  const os = String(x.os || "");
  const sys = { macos: "mac", windows: "windows", linux: "linux" }[os.replace(/^web-/, "")] || "other";
  const web = os.startsWith("web");
  const browser = web ? (String(x.browser || "").replace(/\s+\d.*$/, "") || "Other") : "";
  const sysName = { mac: "Mac", windows: "Windows", linux: "Linux", other: "Other" }[sys];
  return { sys, web, browser, version: x.browser || "", label: web ? sysName + " · " + browser : os ? sysName + " app" : "Unknown" };
}
const browserIcon = (name) => ICONS[name] || ICONS.Other;
function chip(x) {
  const s = setupOf(x);
  const icons = ICONS[s.sys] + (s.web ? browserIcon(s.browser) : "");
  const label = s.web ? ({ mac: "Mac", windows: "Windows", linux: "Linux", other: "Other" }[s.sys] + " · " + s.browser + (s.version ? " " + s.version.replace(/^\D+/, "") : "")) : s.label;
  return '<span class="chip" title="' + esc(s.web ? "Browser version" : "Installed app") + '"><span class="icons">' + icons + "</span>" + esc(label) + "</span>";
}

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
const bars = (rows, icon) => { const top = Math.max(1, ...rows.map((r) => r[1])); return rows.length ? rows.map((r) => '<div class="bar"><span class="name">' + (icon ? icon(r[0]) : "") + esc(r[0]) + '</span><span class="track"><i style="width:' + Math.max(3, (r[1] / top) * 100) + '%;background:var(--accent)"></i></span><em>' + r[1] + "</em></div>").join("") : '<p class="muted small" style="margin:0">Nothing yet</p>'; };

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
  $("who").textContent = ME.email; $("me-avatar").textContent = initials(ME.email);
  $("role").textContent = ME.via === "token" ? "look only" : ME.role; $("role").className = "pill " + ME.role;
  $("refresh").innerHTML = ICONS.refresh; $("search-icon").innerHTML = ICONS.search;
  load();
}

async function load() {
  try {
    const parts = await Promise.all([call("/admin/api/stats"), call("/admin/api/details"), call("/admin/api/audit"), call("/admin/api/approvals")]);
    S = parts[0]; D = parts[1]; AUDIT = parts[2].entries; APPROVALS = parts[3].approvals;
    $("mode").innerHTML = (S.test ? "" : '<span class="live-dot"></span>') + esc(S.test ? S.provider + " · test mode" : S.provider + " · live");
    $("mode").className = "pill " + (S.test ? "test" : "live");
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    $("team-note").textContent = (S.team ? "Your team’s " + S.team + (S.team === 1 ? " computer is" : " computers are") + " left out of the numbers (signed in to an admin’s account, or marked as ours). " : "") + "The browser demo counts browsers, not people: a private window is a new one.";
    kpis(); chart(); funnel(); mix(); usage(); downloads();
    tabs(); draw();
    if (open) show(open.kind, open.id, true);
  } catch (e) { say("Could not load: " + e.message); }
}

function kpis() {
  const conv = S.trials.started ? Math.round((S.trials.converted / S.trials.started) * 100) : 0;
  const seats = D.licenses.reduce((n, l) => n + l.devices.length, 0);
  const pending = APPROVALS.filter((a) => a.status === "pending" && !a.expired).length;
  const kpi = (icon, t, v, sub, cls) => '<div class="kpi' + (cls ? " " + cls : "") + '"><h3>' + ICONS[icon] + t + "</h3><b>" + v + "</b><span>" + sub + "</span></div>";
  $("kpis").innerHTML = kpi("monitor", "Installed · this week", S.computers.active7, S.computers.active1 + " today · " + S.computers.returning + " of " + S.computers.total + " came back another day")
    + kpi("globe", "Browser demo · this week", S.web.active7, S.web.total + " browsers · " + S.web.returning + " came back another day")
    + kpi("clock", "Trials running", S.trials.running, S.trials.started + " started · " + conv + "% bought")
    + kpi("chart", "MRR", money(S.subscriptions.mrr), S.subscriptions.active + " active subscriptions")
    + kpi("card", "Revenue · 30 days", money(S.sales.revenue30), money(S.sales.revenue) + " all time · " + S.sales.paid + " sales")
    + kpi("key", "Licenses", D.licenses.length, seats + " seats in use")
    + kpi("people", "Accounts", D.accounts.length, D.accounts.filter((a) => a.setups.length > 1).length + " on more than one setup")
    + kpi("check", "Approvals waiting", pending, pending ? "check the alert inbox" : "nothing waiting", pending ? "alert" : "");
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
// Usage over time (Analytics Engine): daily computers and people, weekly actives, and what churches did.
function usage() {
  const U = S.usage;
  if (!U || U.error) {
    $("usage-chart").innerHTML = "";
    $("usage-axis").innerHTML = "";
    $("usage-now").innerHTML = '<p class="note">' + (U && U.error ? "Could not read usage: " + esc(U.error) : "Usage over time starts once the server can read it: set the ANALYTICS_TOKEN secret (a Cloudflare API token with Account Analytics Read). Check-ins are being recorded already.") + "</p>";
    return;
  }
  const days = U.daily, max = Math.max(1, ...days.map((d) => d.computers));
  const x = (i) => (days.length > 1 ? (i / (days.length - 1)) * 600 : 300), y = (v) => 165 - (v / max) * 155;
  const line = (key, color) => days.length ? '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + days.map((d, i) => x(i) + "," + y(d[key])).join(" ") + '"/>' : "";
  let svg = "";
  for (let g = 1; g <= 3; g++) svg += '<line x1="0" x2="600" y1="' + y((g / 3) * max) + '" y2="' + y((g / 3) * max) + '" stroke="rgba(255,255,255,.06)"/>';
  svg += line("computers", "var(--blue)") + line("people", "var(--good)");
  days.forEach((d, i) => { svg += '<circle cx="' + x(i) + '" cy="' + y(d.computers) + '" r="2.5" fill="var(--blue)"><title>' + d.day + ": " + d.computers + " computers, " + d.people + " people, " + d.services + " services, " + d.scripture + " scripture, " + d.songs + " songs</title></circle>"; });
  $("usage-chart").innerHTML = svg;
  $("usage-axis").innerHTML = days.length ? "<span>" + date(days[0].day) + "</span><span>peak " + max + " a day</span><span>" + date(days[days.length - 1].day) + "</span>" : "<span>No check-ins recorded yet.</span>";
  const A = U.active, sticky = A.computers.month ? Math.round((A.computers.day / A.computers.month) * 100) : 0;
  const last30 = days.slice(-30).reduce((t, d) => ({ services: t.services + d.services, scripture: t.scripture + d.scripture, songs: t.songs + d.songs }), { services: 0, scripture: 0, songs: 0 });
  const weeks = U.weekly.slice(-12), wmax = Math.max(1, ...weeks.map((w) => w.computers));
  $("usage-now").innerHTML = '<div class="stats3"><div><b>' + A.computers.day + " / " + A.computers.week + " / " + A.computers.month + "</b><span>computers · day / week / month</span></div><div><b>" + A.people.day + " / " + A.people.week + " / " + A.people.month + "</b><span>signed-in people</span></div><div><b>" + sticky + "%</b><span>DAU ÷ MAU</span></div></div>"
    + "<h3>Active each week</h3>" + (weeks.map((w) => '<div class="bar"><span class="name">' + date(w.week) + '</span><span class="track" title="' + w.people + ' signed in"><i style="width:' + (w.computers / wmax) * 100 + '%;background:var(--blue)"></i></span><em>' + w.computers + "</em></div>").join("") || '<p class="note">No weeks yet.</p>')
    + '<p class="note">Last 30 days: ' + last30.services + " services run · " + last30.scripture + " scripture shown · " + last30.songs + " songs shown. Churches peak once a week, so the weekly number says the most.</p>";
}
// Downloads: the website's own count (Analytics Engine) and GitHub's per-file counts.
function downloads() {
  const R = S.downloads || {}, site = R.site, gh = R.github;
  const NAMES = { mac: "Mac", windows: "Windows", "windows-msi": "Windows (.msi)", linux: "Linux AppImage", "linux-deb": "Linux .deb", "linux-rpm": "Linux .rpm" };
  if (!site) {
    $("dl-chart").innerHTML = ""; $("dl-axis").innerHTML = "";
    $("dl-site").innerHTML = '<p class="note">Website downloads are counted from now on. The numbers appear once the server can read Analytics Engine (the ANALYTICS_TOKEN secret).</p>';
  } else {
    const days = site.days, max = Math.max(1, ...days.map((d) => d.downloads)), w = 600 / Math.max(1, days.length);
    $("dl-chart").innerHTML = days.map((d, i) => { const h = (d.downloads / max) * 155; return '<rect x="' + (i * w + 1) + '" y="' + (165 - h) + '" width="' + Math.max(1, w - 2) + '" height="' + h + '" rx="2" fill="var(--accent)"><title>' + d.day + ": " + d.downloads + "</title></rect>"; }).join("");
    $("dl-axis").innerHTML = days.length ? "<span>" + date(days[0].day) + "</span><span>peak " + max + " a day</span><span>" + date(days[days.length - 1].day) + "</span>" : "<span>No downloads recorded yet.</span>";
    const sum = (k) => site.platforms.reduce((t, p) => t + p[k], 0);
    const top = Math.max(1, ...site.platforms.map((p) => p.month));
    $("dl-site").innerHTML = '<div class="stats3"><div><b>' + sum("day") + '</b><span>today</span></div><div><b>' + sum("week") + '</b><span>7 days</span></div><div><b>' + sum("month") + " · " + sum("quarter") + '</b><span>30 · 90 days</span></div></div>'
      + "<h3>By system · 30 days</h3>" + (site.platforms.map((p) => '<div class="bar"><span class="name">' + esc(NAMES[p.platform] || p.platform) + '</span><span class="track" title="' + p.week + " this week · " + p.quarter + ' in 90 days"><i style="width:' + Math.max(3, (p.month / top) * 100) + '%;background:var(--accent)"></i></span><em>' + p.month + "</em></div>").join("") || '<p class="note">None yet.</p>')
      + (site.countries.length ? "<h3>Where from · 30 days</h3>" + bars(site.countries) : "");
  }
  if (!gh || gh.error) { $("dl-github").innerHTML = '<p class="note">Could not read GitHub: ' + esc((gh && gh.error) || "no answer") + "</p>"; return; }
  const rows = gh.releases, all = rows.reduce((t, r) => ({ mac: t.mac + r.mac, windows: t.windows + r.windows, linux: t.linux + r.linux, updates: t.updates + r.updates }), { mac: 0, windows: 0, linux: 0, updates: 0 });
  $("dl-github").innerHTML = '<div class="stats3"><div><b>' + (all.mac + all.windows + all.linux) + '</b><span>installers, all versions</span></div><div><b>' + all.mac + " / " + all.windows + " / " + all.linux + '</b><span>Mac / Windows / Linux</span></div><div><b>' + all.updates + '</b><span>Mac and Linux updates</span></div></div>'
    + '<div class="table" style="margin-top:12px"><table><thead><tr><th>Version</th><th>Released</th><th>Mac</th><th>Windows</th><th>Linux</th><th>Updates</th></tr></thead><tbody>'
    + rows.map((r) => "<tr><td>v" + esc(r.version) + "</td><td>" + date(r.date) + "</td><td>" + r.mac + "</td><td>" + r.windows + "</td><td>" + r.linux + "</td><td>" + r.updates + "</td></tr>").join("") + "</tbody></table></div>"
    + '<p class="note">GitHub counts the app’s own updates (Windows updates use the installer, so they land under Windows) and only the website downloads Cloudflare did not already have a copy of. Files every version gets about equally often (.msi, .deb, .rpm, AppImage) are mostly link checkers and bots. The website count on the left is the one to watch.</p>';
}
function funnel() {
  const f = D.funnel, top = Math.max(1, f.computers);
  const step = (label, v, color) => '<div class="step"><header><span>' + label + "</span><b>" + v + (v && label !== "Installed computers" ? " · " + Math.round((v / top) * 100) + "%" : "") + '</b></header><div class="track"><i style="width:' + Math.max(2, (v / top) * 100) + "%;background:" + color + '"></i></div></div>';
  $("funnel").innerHTML = step("Installed computers", f.computers, "var(--blue)") + step("Trials", f.trials, "var(--accent)") + step("Paid", f.paid, "var(--good)");
}
function mix() {
  const P = S.platforms || [], top = Math.max(1, ...P.map((p) => p.app + p.web));
  $("platforms").innerHTML = P.map((p) => { const sys = { macos: "mac", windows: "windows", linux: "linux" }[p.os]; return '<div class="bar"><span class="name">' + ICONS[sys] + { mac: "Mac", windows: "Windows", linux: "Linux" }[sys] + '</span><span class="track" title="' + p.app + " app · " + p.web + ' browser"><i style="width:' + (p.app / top) * 100 + '%;background:var(--accent)"></i><i style="width:' + (p.web / top) * 100 + '%;background:var(--blue)"></i></span><em>' + (p.app + p.web) + "</em></div>"; }).join("");
  $("browsers").innerHTML = bars(S.browsers || [], (name) => browserIcon(name));
  $("plans").innerHTML = bars(S.plans);
  $("versions").innerHTML = bars(S.versions.map((r) => [r[0] === "unknown" ? "unknown" : "v" + r[0], r[1]]));
}

const TABS = [["computers", "Computers"], ["accounts", "Accounts"], ["licenses", "Licenses"], ["trials", "Trials"], ["checkouts", "Sales"], ["promos", "Promo codes"], ["activity", "Activity"], ["approvals", "Approvals"]];
function tabs() {
  const pending = APPROVALS.filter((a) => a.status === "pending" && !a.expired).length;
  const count = { computers: D.computers.length, accounts: D.accounts.length, licenses: D.licenses.length, trials: D.trials.length, checkouts: D.checkouts.length, promos: D.promos.length, activity: AUDIT.length, approvals: pending };
  $("tabs").innerHTML = TABS.map((t) => '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '<span class="count' + (t[0] === "approvals" && pending ? " hot" : "") + '">' + count[t[0]] + "</span></button>").join("");
}

const latest = () => (S.versions[0] || [""])[0];
const stateTag = (l) => l.revoked ? '<span class="tag bad">stopped</span>' : l.test ? '<span class="tag warn">test</span>' : l.paidUntil && l.paidUntil < Date.now() ? '<span class="tag">ended</span>' : '<span class="tag good">active</span>';
const outcomeTag = (o) => '<span class="tag ' + ({ done: "good", approved: "good", refused: "bad", pending: "warn", declined: "", expired: "" }[o] ?? "") + '">' + esc(o) + "</span>";
const two = (a, b) => '<span class="two"><span>' + a + "</span>" + (b ? "<small>" + b + "</small>" : "") + "</span>";
const seen = (t) => (t && Date.now() - t < 86400000 ? '<span class="live-dot" style="display:inline-block;margin-right:7px"></span>' : "") + ago(t);
const TABLES = {
  computers: { open: (c) => "computer:" + c.device, head: ["Computer", "Setup", "Version", "Plan", "Account", "Days seen", "First seen", "Last seen"], row: (c) => [two('<span class="mono">' + esc(c.id) + "</span>" + (c.team ? ' <span class="tag">ours</span>' : "")), chip(c), c.version ? "v" + esc(c.version) + (c.version === latest() ? ' <span class="tag good">latest</span>' : "") : '<span class="dim">—</span>', planTag(c.plan), c.account ? '<span class="who"><span class="avatar sm">' + esc(initials(c.account)) + "</span>" + esc(c.account) + "</span>" : '<span class="dim">not signed in</span>', (c.days || 1) + ((c.days || 1) >= 2 ? ' <span class="tag good">returning</span>' : ""), date(c.first), seen(c.last)] },
  accounts: { open: (a) => a.id ? "account:" + a.id : null, head: ["Person", "Setups", "Licenses", "Computers", "Last seen", "Signed up"], row: (a) => ['<span class="who"><span class="avatar">' + esc(initials(a.name || a.email)) + "</span>" + two(esc(a.name || a.email), a.name ? esc(a.email) : "") + "</span>", (a.setups.length ? a.setups.map(chip).join("") : '<span class="dim">—</span>') + (a.setups.length > 2 ? '<span class="tag warn">' + a.setups.length + " setups</span>" : ""), a.licenses || '<span class="dim">0</span>', a.computers || '<span class="dim">0</span>', a.lastSeen ? seen(a.lastSeen) : '<span class="dim">—</span>', two(date(a.createdAt), ago(a.createdAt))] },
  licenses: { open: (l) => "license:" + l.license, head: ["License", "Owner", "Seats", "Computers", "Paid until", "State"], row: (l) => ['<span class="mono">' + esc(l.license) + "</span>", esc(l.email || "—"), '<span class="seats">' + l.devices.length + '<span class="track"><i style="width:' + Math.min(100, l.devices.length * 34) + '%;background:var(--accent)"></i></span></span>', l.devices.map((d) => { const c = D.computers.find((x) => x.device === d.device); return (c ? chip(c) : "") + esc(d.name); }).join("<br>") || '<span class="dim">—</span>', l.paidUntil ? two(date(l.paidUntil), ago(l.paidUntil)) : "never ends", stateTag(l)] },
  trials: { open: (t) => "computer:" + t.deviceId, head: ["Computer", "Setup", "Started", "Ends", "State"], row: (t) => { const c = D.computers.find((x) => x.device === t.deviceId); return ['<span class="mono">' + esc(t.device) + "</span>", c ? chip(c) : '<span class="dim">—</span>', date(t.startedAt), two(date(t.endsAt), ago(t.endsAt)), '<span class="tag ' + ({ running: "good", ending: "warn", converted: "violet", ended: "" }[t.state]) + '">' + t.state + "</span>"]; } },
  checkouts: { open: () => null, head: ["When", "Who", "Plan", "Amount", "Promo", "Status"], row: (c) => [two(date(c.createdAt || c.paidAt), ago(c.createdAt || c.paidAt)), '<span class="who"><span class="avatar sm">' + esc(initials(c.name || c.email)) + "</span>" + two(esc(c.name || "—"), esc(c.email || "")) + "</span>", planTag(c.plan) + ' <span class="muted small">' + esc(c.interval) + "</span>", "<b>" + money(c.due) + "</b>", c.promo ? '<span class="tag orange">' + esc(c.promo) + "</span>" : '<span class="dim">—</span>', '<span class="tag ' + ({ paid: "good", pending: "warn", cancelled: "bad" }[c.status] ?? "") + '">' + esc(c.status) + "</span>"] },
  activity: { open: () => null, head: ["When", "Who", "What", "Outcome", "Detail"], row: (a) => [two(when(a.at), ago(a.at)), '<span class="who"><span class="avatar sm">' + esc(initials(a.by)) + "</span>" + two(esc(a.by), esc(a.role)) + "</span>", two(esc(a.action), esc(a.target)), outcomeTag(a.outcome), '<span class="small">' + esc(a.detail) + (a.approvedBy ? " · approved by " + esc(a.approvedBy) : "") + (a.address ? ' <span class="dim">· ' + esc(a.address) + "</span>" : "") + "</span>"] },
  approvals: { open: () => null, head: ["Asked", "Who", "What", "State"], row: (a) => [two(when(a.at), ago(a.at)), esc(a.by), esc(a.words), outcomeTag(a.status === "pending" && a.expired ? "expired" : a.status)] },
};

function table(def, items, q) {
  const rows = items.map((item) => ({ item, cells: def.row(item) })).filter((r) => !q || r.cells.join(" ").replace(/<[^>]+>/g, " ").toLowerCase().includes(q));
  if (!rows.length) return '<div class="table"><div class="empty">' + (q ? "Nothing matches “" + esc(q) + "”." : "Nothing here yet.") + "</div></div>";
  return '<div class="table"><table><thead><tr>' + def.head.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => { const o = def.open(r.item); return "<tr" + (o ? ' data-open="' + esc(o) + '" tabindex="0"' : "") + ">" + r.cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>"; }).join("") + "</tbody></table></div>";
}

function draw() {
  const q = $("q").value.trim().toLowerCase();
  $("search").hidden = tab === "promos";
  if (tab === "promos") return promos();
  const items = tab === "activity" ? AUDIT : tab === "approvals" ? APPROVALS : D[tab];
  let note = "";
  if (tab === "activity") note = '<p class="note">Every change and every refused attempt, newest first. Nobody can remove entries; each one was also emailed to the alert address.</p>';
  if (tab === "approvals") note = '<p class="note">Big changes wait here until an owner approves them from the emailed link.</p>';
  if (tab === "computers" || tab === "accounts" || tab === "licenses") note = '<p class="note">Click a row for details and actions.</p>';
  $("list").innerHTML = table(TABLES[tab], items, q) + note;
}

function promos() {
  const live = (p) => (!p.expiresAt || p.expiresAt > Date.now()) && (p.maxUses == null || p.used < p.maxUses);
  const L = ME.limits.promo;
  let h = '<div class="table" style="margin-bottom:14px">' + (D.promos.length ? "<table><thead><tr><th>Code</th><th>Gives</th><th>Used</th><th>Ends</th><th>Note</th><th></th></tr></thead><tbody>" + D.promos.map((p) => "<tr><td><b class=mono>" + esc(p.code) + "</b> " + (live(p) ? '<span class="tag good">live</span>' : '<span class="tag">ended</span>') + "</td><td>" + (p.percentOff ? '<span class="tag orange">' + p.percentOff + "% off</span>" : "") + (p.amountOff ? '<span class="tag orange">' + money(p.amountOff) + " off</span>" : "") + (p.trialDays ? '<span class="tag blue">+' + p.trialDays + " trial days</span>" : "") + '</td><td><span class="seats">' + p.used + (p.maxUses ? " / " + p.maxUses + '<span class="track"><i style="width:' + Math.min(100, (p.used / p.maxUses) * 100) + '%;background:var(--accent)"></i></span>' : "") + "</span></td><td>" + (p.expiresAt ? two(date(p.expiresAt), ago(p.expiresAt)) : "—") + '</td><td class="muted small">' + esc(p.note || "") + '</td><td style="text-align:right">' + (live(p) && can("owner") ? '<button class="sm danger" data-end="' + esc(p.code) + '">End now</button>' : "") + "</td></tr>").join("") + "</tbody></table>" : '<div class="empty">No codes yet.</div>') + "</div>";
  if (can("owner")) h += '<div class="card"><h2>New promo code</h2><form class="grid" id="promo-form"><label class="field">Code<input name="code" required placeholder="EASTER25" style="text-transform:uppercase"></label><label class="field">% off<input name="percentOff" type="number" min="1" max="100" placeholder="—"></label><label class="field">$ off<input name="amountOff" type="number" min="1" step="0.01" placeholder="—"></label><label class="field">Extra trial days<input name="trialDays" type="number" min="1" placeholder="—"></label><label class="field">Plan<select name="plans"><option value="">Any plan</option><option value="premium">Premium</option><option value="church">Church</option></select></label><label class="field">Uses<input name="maxUses" type="number" min="1" max="' + L.mostUses + '" required placeholder="50"></label><label class="field">Ends<input name="expiresAt" type="date" required></label><button class="hot">Create code</button></form><p class="note">Over ' + L.percentOff + "% or " + money(L.amountOff) + " off, over " + L.trialDays + " trial days or over " + L.maxUses + " uses, a code waits for an owner’s approval by email. Codes run at most " + L.longestDays + " days.</p></div>";
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
  return '<form class="actform" id="act-form"><b>' + def.label + "</b>" + (def.fields.length ? '<div class="fields">' + def.fields.map((f) => '<label class="field">' + f[1] + '<input name="' + f[0] + '" type="' + f[2] + '"' + (f[2] === "number" ? ' min="1" max="365" required placeholder="7"' : ' placeholder="Optional"') + (f[1].includes("required") ? ' required placeholder="Why"' : "") + "></label>").join("") + "</div>" : "") + '<div class="foot"><p class="note">' + def.hint() + '</p><button type="button" class="sm ghost" id="act-cancel">Cancel</button><button class="sm ' + (def.danger ? "danger" : "hot") + '">' + def.label + "</button></div></form>";
}

const facts = (pairs) => '<dl class="facts">' + pairs.filter((p) => p[1] !== null && p[1] !== undefined && p[1] !== "").map((p) => "<dt>" + p[0] + "</dt><dd>" + p[1] + "</dd>").join("") + "</dl>";
const head = (badge, title, sub) => '<div class="head"><span class="badge">' + badge + '</span><div class="grow"><h2>' + title + '</h2><div class="sub">' + sub + '</div></div><button class="sm ghost" id="close">Close</button></div>';
const computerItem = (c, license) => '<div class="item"><span class="badge" style="width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--panel2)">' + ICONS[setupOf(c).sys] + '</span><div class="grow"><b>' + esc(c.name || c.device.slice(0, 8)) + "</b> " + chip(c) + '<div class="muted small">v' + esc(c.version || "—") + " · seen " + ago(c.seenAt || c.last) + (c.account ? " · " + esc(c.account) : "") + '</div></div><button class="sm" data-open="computer:' + esc(c.device) + '">Open</button>' + (license && can("support") ? '<button class="sm" data-free="' + esc(c.device) + '" data-license="' + esc(license) + '">Free seat</button>' : "") + "</div>";

function licenseBody(l) {
  const stopped = l.stopped ? '<span class="tag bad">stopped</span> <span class="small">' + esc(l.stopped.reason) + " · " + date(l.stopped.at) + "</span>" : l.paidUntil && l.paidUntil < Date.now() ? '<span class="tag">ended</span>' : '<span class="tag good">active</span>';
  const acts = l.stopped ? ["resume", "resend-key"] : ["extend-license", "resend-key", "reset-seats", "suspend", "refund"];
  const added = l.extensions.reduce((n, e) => n + e.days, 0);
  return '<div class="stats3"><div><b>' + l.computers.length + (l.seats ? " / " + l.seats : "") + "</b><span>seats used</span></div><div><b>" + (l.paidUntil ? Math.max(0, Math.round((l.paidUntil - Date.now()) / 86400000)) + " d" : "∞") + "</b><span>left</span></div><div><b>" + added + " d</b><span>added by hand</span></div></div>"
    + facts([["State", stopped], ["Plan", l.plan ? planTag(l.plan) + (l.subscription ? ' <span class="muted small">' + esc(l.subscription.interval) + " · " + esc(l.subscription.status) + "</span>" : "") : "—"], ["Bought with", esc(l.email || "—")], ["Owner", l.owner ? '<a href="#" data-open="account:' + esc(l.owner.id) + '">' + esc(l.owner.email || l.owner.id) + "</a>" : '<span class="dim">nobody yet (claimed at first sign-in)</span>'], ["People added", (l.members || []).map(esc).join(", ")], ["Accounts", l.accounts.map((a) => '<a href="#" data-open="account:' + esc(a.id) + '">' + esc(a.email) + "</a>").join(", ") || "—"], ["Paid until", l.paidUntil ? date(l.paidUntil) + ' <span class="muted small">(' + ago(l.paidUntil) + ")</span>" : "never ends"], ["Renews", l.subscription ? date(l.subscription.renewsAt) : ""], ["Test key", l.test ? "yes (cannot unlock a real copy)" : ""], ["History", l.extensions.length ? l.extensions.map((e) => "+" + e.days + " d by " + esc(e.by) + " · " + date(e.at)).join("<br>") : ""]])
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
      $("drawer").innerHTML = head(big(ICONS.key).replace('stroke="currentColor"', 'stroke="#ff9a4d"'), 'License <span class="mono">' + esc(l.license) + "</span>", esc(l.email || "")) + licenseBody(l);
    } else if (kind === "account") {
      const a = await call("/admin/api/account?id=" + encodeURIComponent(id));
      $("drawer").innerHTML = head('<span class="avatar" style="width:40px;height:40px;font-size:14px">' + esc(initials(a.name || a.email)) + "</span>", esc(a.name || a.email), esc(a.email) + " · signed up " + date(a.createdAt))
        + '<div class="stats3"><div><b>' + a.licenses.length + "</b><span>licenses</span></div><div><b>" + a.computers.length + "</b><span>computers</span></div><div><b>" + a.setups.length + "</b><span>setups</span></div></div>"
        + "<h3>Setups</h3>" + (a.setups.length ? a.setups.map(chip).join("") + (a.setups.length > 2 ? '<p class="note">Used on ' + a.setups.length + " different setups.</p>" : "") : '<p class="note">No computers seen yet.</p>')
        + facts([["Trial", a.trial ? date(a.trial.startedAt) + " → " + date(a.trial.endsAt) + ' <span class="muted small">(' + ago(a.trial.endsAt) + ")</span>" : "none"]])
        + "<h3>Licenses</h3>" + (a.licenses.map((l) => '<div class="item"><span class="badge" style="width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--panel2);color:var(--accent2)">' + ICONS.key + '</span><div class="grow"><span class="mono">' + esc(l.license) + "</span> " + (l.plan ? planTag(l.plan) : "") + (l.stopped ? '<span class="tag bad">stopped</span>' : '<span class="tag good">active</span>') + '<div class="muted small">' + l.computers.length + (l.seats ? " of " + l.seats : "") + " seats · paid until " + (l.paidUntil ? date(l.paidUntil) : "—") + '</div></div><button class="sm" data-open="license:' + esc(l.license) + '">Open</button></div>').join("") || '<p class="note">No licenses.</p>')
        + "<h3>Computers</h3>" + (a.computers.map((c) => computerItem(c)).join("") || '<p class="note">None.</p>');
    } else {
      const c = D.computers.find((x) => x.device === id) || { device: id, os: "" };
      const s = setupOf(c);
      const trial = D.trials.find((t) => t.deviceId === id);
      const seats = D.licenses.filter((l) => l.devices.some((d) => d.device === id));
      $("drawer").innerHTML = head(big(ICONS[s.sys]) + (s.web ? "" : ""), 'Computer <span class="mono">' + esc(id.slice(0, 8)) + "</span>", chip(c))
        + facts([["Setup", s.web ? "Browser version" : c.os ? "Installed app" : "Unknown"], ["System", { mac: "macOS", windows: "Windows", linux: "Linux", other: "—" }[s.sys]], ["Browser", s.web ? browserIcon(s.browser) + " " + esc(c.browser || s.browser) : ""], ["Version", c.version ? "v" + esc(c.version) + (c.version === latest() ? ' <span class="tag good">latest</span>' : ' <span class="tag warn">update available</span>') : ""], ["Plan", c.plan ? planTag(c.plan) : ""], ["Account", c.accountId ? '<a href="#" data-open="account:' + esc(c.accountId) + '">' + esc(c.account || c.accountId) + "</a>" : "not signed in"], ["First seen", date(c.first)], ["Last seen", c.last ? when(c.last) + ' <span class="muted small">(' + ago(c.last) + ")</span>" : ""], ["Full id", '<span class="mono">' + esc(id) + "</span>"]])
        + "<h3>Counting</h3>" + '<p class="note" style="margin:0 0 10px">' + (c.team ? "One of your team’s computers: left out of the numbers." : "Counted as a church’s computer. Seen on " + (c.days || 1) + ((c.days || 1) > 1 ? " days." : " day.")) + "</p>" + (can("support") && c.os ? '<button class="sm" data-team="' + esc(id) + '" data-on="' + (c.team ? "0" : "1") + '">' + (c.team ? "Count it again" : "Mark as ours (leave out of the numbers)") + "</button>" : "")
        + "<h3>Trial</h3>" + (trial ? facts([["Started", date(trial.startedAt)], ["Ends", date(trial.endsAt) + ' <span class="muted small">(' + ago(trial.endsAt) + ")</span>"], ["State", esc(trial.state)]]) + (trial.state !== "converted" ? '<div style="margin-top:12px">' + actButtons(["extend-trial"], { device: id }) + "</div>" : "") : '<p class="note">No trial on this computer.</p>')
        + "<h3>Licenses</h3>" + (seats.map((l) => '<div class="item"><div class="grow"><span class="mono">' + esc(l.license) + "</span> " + stateTag(l) + '<div class="muted small">' + esc(l.email) + '</div></div><button class="sm" data-open="license:' + esc(l.license) + '">Open</button></div>').join("") || '<p class="note">Not on any license.</p>');
    }
  } catch (e) { $("drawer").innerHTML = head(ICONS.other, "Could not open", "") + '<p class="note">' + esc(e.message) + "</p>"; }
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
  if (!a) { $("approve").innerHTML = '<h2>No such approval</h2><p class="muted">It may have run out. <a href="/admin">Open the admin page</a>.</p>'; return; }
  const done = a.status !== "pending" || a.expired;
  $("approve").innerHTML = '<h2 style="font-size:18px;display:flex;gap:10px;align-items:center">' + ICONS.check + "Approve this change?</h2>" + facts([["Asked by", esc(a.by) + " (" + esc(a.role) + ")"], ["Change", "<b>" + esc(a.words) + "</b>"], ["Reason", esc(a.reason || "—")], ["Asked", when(a.at) + ' <span class="muted small">(' + ago(a.at) + ")</span>"], ["State", a.expired && a.status === "pending" ? "expired" : esc(a.status)]])
    + (done ? '<p class="note">Nothing to do. <a href="/admin">Open the admin page</a>.</p>' : ME.role !== "owner" ? '<p class="note">Only an owner can approve.</p>' : '<div class="acts" style="margin-top:18px"><button class="hot" id="yes">Approve</button><button class="danger" id="no">Decline</button></div><p class="note">You are signed in as ' + esc(ME.email) + ".</p>");
  const go = async (decline) => {
    try { const r = await call("/admin/api/approve", { id, token, decline }); $("approve").innerHTML = "<h2>" + (decline ? "Declined" : "Approved and done") + '</h2><p class="muted">' + esc(r.detail || "Nothing was changed.") + '</p><p><a href="/admin">Open the admin page</a></p>'; }
    catch (e) { say(e.message); }
  };
  if ($("yes")) { $("yes").onclick = () => go(false); $("no").onclick = () => go(true); }
}

// --- Wiring ---------------------------------------------------------------------------------------

document.addEventListener("click", (event) => {
  const t = event.target.closest("[data-tab],[data-open],[data-act],[data-free],[data-end],[data-team],#close,#shade,#act-cancel,#refresh,#gate-retry");
  if (!t) return;
  if (t.id === "close" || t.id === "shade") return closeDrawer();
  if (t.id === "refresh") return load();
  if (t.id === "gate-retry") return location.reload();
  if (t.id === "act-cancel") { form = null; return show(open.kind, open.id, true); }
  if (t.dataset.tab) { tab = t.dataset.tab; tabs(); return draw(); }
  if (t.dataset.open) { event.preventDefault(); const i = t.dataset.open.indexOf(":"); form = null; return show(t.dataset.open.slice(0, i), t.dataset.open.slice(i + 1)); }
  if (t.dataset.act) { form = { action: t.dataset.act, target: JSON.parse(t.dataset.target) }; if (!ACTS[form.action].fields.length) { const f = form; return confirm(ACTS[f.action].label + "?") && run(Object.assign({ action: f.action }, f.target), ACTS[f.action].label); } return show(open.kind, open.id, true); }
  if (t.dataset.free) { if (confirm("Free this computer’s seat? It keeps working until its next check-in.")) run({ action: "release-device", license: t.dataset.license, device: t.dataset.free }, "Seat freed"); return; }
  if (t.dataset.team) return run({ action: "mark-team", device: t.dataset.team, team: t.dataset.on === "1" }, t.dataset.on === "1" ? "Marked as ours" : "Counted again");
  if (t.dataset.end) { if (confirm("End code " + t.dataset.end + " now? It stops working at once.")) run({ action: "end-promo", code: t.dataset.end }, "Code ended"); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && open) return closeDrawer();
  if (event.key === "Enter" && event.target.matches && event.target.matches("tr[data-open]")) event.target.click();
  if (event.key === "/" && document.activeElement === document.body && !$("app").hidden) { event.preventDefault(); $("q").focus(); }
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
boot();
setInterval(() => { if (!document.hidden && S && !open) load(); }, 60000);
</script></body></html>`;
}
