// The page a phone opens from the QR code (/j/CODE): join, ask and upvote questions, answer quizzes
// and polls. One small page, no app, any connection. Words from the room are always set as text,
// never as HTML, so nothing anyone types can run on another person's phone.

import { CHOICE_STYLES, PLAYER_COLORS, TEAMS } from "../src/lib/domain/game-colors";
import { PHONE_WORDS, phoneWord, type PhoneLanguage } from "./room-words";

// The answer shapes, the same as on the big screen, so a player can match their tile at a glance.
const SHAPE_PATHS: Record<(typeof CHOICE_STYLES)[number]["shape"], string> = {
  triangle: '<path d="M12 3 22 20H2z"/>',
  diamond: '<path d="M12 2 22 12 12 22 2 12z"/>',
  circle: '<circle cx="12" cy="12" r="9.5"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
  star: '<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/>',
  hexagon: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/>',
};
const SHAPE_SVG = CHOICE_STYLES.map((style) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SHAPE_PATHS[style.shape]}</svg>`);

export function roomPage(code: string, origin: string, language: PhoneLanguage = "en"): string {
  const safe = code.replace(/[^A-Z0-9]/g, "");
  const w = (text: string) => phoneWord(language, text);
  if (!safe) return entryPage(language);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111013">
<title>Join ${safe} · Church Studio</title>
<style>
  :root { --bg: #111013; --panel: #1b1a1f; --line: #2c2a31; --ink: #f6f3ee; --muted: #a39d96; --accent: #fa4f00; --good: #35c27a; --gold: #f2c46b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
  main { max-width: 560px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom)); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  header h1 { margin: 0; font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
  .code { padding: 3px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; color: var(--muted); }
  .card { padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); margin-bottom: 16px; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input, textarea { width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); font: inherit; }
  textarea { min-height: 88px; resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: 1px; }
  button { font: inherit; cursor: pointer; }
  .primary { width: 100%; height: 50px; margin-top: 12px; border: 0; border-radius: 14px; background: var(--accent); color: #fff; font-weight: 750; font-size: 16px; }
  .primary:disabled { opacity: 0.5; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; font-size: 12.5px; color: var(--muted); }
  .note { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
  .note.ok { color: var(--good); }
  .note.bad { color: #ff8a73; }
  .tabs { display: flex; gap: 6px; margin: 4px 0 12px; }
  .tabs button { height: 32px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 650; }
  .tabs button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  li.q { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
  li.q.featured { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
  .q .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .q .who { display: block; margin-top: 4px; font-size: 12.5px; color: var(--muted); }
  .badge { display: inline-block; margin: 6px 6px 0 0; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .badge.pin { background: color-mix(in srgb, var(--gold) 22%, transparent); color: var(--gold); }
  .badge.done { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--good); }
  .vote { flex: none; display: grid; justify-items: center; min-width: 48px; padding: 6px 4px; border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--ink); font-weight: 750; }
  .vote svg { width: 18px; height: 18px; }
  .vote.mine { background: var(--accent); border-color: var(--accent); color: #fff; }
  .empty { padding: 26px 8px; text-align: center; color: var(--muted); font-size: 14px; }
  /* A quiz or poll question: big answers in four colours, a bar that runs down. */
  .activity h2 { margin: 2px 0 12px; font-size: 21px; line-height: 1.3; }
  .activity .meta { font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.04em; }
  .timer { height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; margin: 6px 0 14px; }
  .timer i { display: block; height: 100%; background: var(--accent); transform-origin: left; }
  .choices { display: grid; gap: 10px; }
  .choice { position: relative; display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 12px 14px; border: 0; border-radius: 14px; color: #fff; font-weight: 700; font-size: 16px; text-align: left; overflow: hidden; }
  .choice .mark { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: rgb(0 0 0 / 0.22); font-size: 14px; }
  .choice .fill { position: absolute; inset: 0 auto 0 0; background: rgb(255 255 255 / 0.18); }
  .choice span.label { position: relative; flex: 1; }
  .choice .count { position: relative; font-size: 14px; }
  .c0 { background: #e21b3c; } .c1 { background: #1368ce; } .c2 { background: #d89e00; } .c3 { background: #26890c; } .c4 { background: #864cbf; } .c5 { background: #0aa3a3; }
  .choice .mark svg { width: 18px; height: 18px; fill: #fff; }
  .choice:not(:disabled):active { transform: scale(0.97); }
  .choices.big { grid-template-columns: 1fr 1fr; }
  .choices.big .choice { min-height: 96px; flex-direction: column; align-items: flex-start; justify-content: space-between; }
  /* Who I am: my own colour, the same one the big screen gives me. */
  .me { display: inline-flex; align-items: center; gap: 7px; max-width: 50%; padding: 4px 10px 4px 4px; border-radius: 999px; background: color-mix(in srgb, var(--me, var(--accent)) 22%, transparent); font-size: 13px; font-weight: 750; }
  .me i { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--me, var(--accent)); color: #fff; font-style: normal; font-size: 12px; }
  .me span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .team { padding: 4px 10px; border-radius: 999px; color: #fff; font-size: 12px; font-weight: 800; white-space: nowrap; }
  .activity { border-color: color-mix(in srgb, var(--me, var(--accent)) 45%, var(--line)); }
  .clock { float: right; min-width: 44px; height: 44px; margin: -4px 0 6px 10px; display: grid; place-items: center; border-radius: 50%; background: var(--bg); border: 3px solid var(--accent); font-weight: 800; font-size: 17px; font-variant-numeric: tabular-nums; }
  .clock.hurry { border-color: #e21b3c; color: #ff8a8a; animation: beat 0.5s ease-in-out infinite alternate; }
  .clock.ready { border-color: var(--gold); color: var(--gold); }
  .choice:disabled:not(.dim):not(.right) { opacity: 0.55; }
  @keyframes beat { to { transform: scale(1.1); } }
  /* After the answer: right or not, the points won, a streak, and where I stand. */
  .result { margin: 14px 0 2px; padding: 16px; border-radius: 16px; text-align: center; color: #fff; animation: pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1); }
  .result.win { background: linear-gradient(135deg, #26890c, #35c27a); }
  .result.miss { background: linear-gradient(135deg, #a3122c, #e21b3c); }
  .result.none { background: var(--line); color: var(--ink); }
  .result strong { display: block; font-size: 24px; font-weight: 850; }
  .result .gain { display: block; margin-top: 2px; font-size: 34px; font-weight: 900; font-variant-numeric: tabular-nums; }
  .result .facts { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .result .facts span { padding: 4px 10px; border-radius: 999px; background: rgb(0 0 0 / 0.22); font-size: 13px; font-weight: 750; }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
  .board li.mine { color: var(--me, var(--accent)); font-weight: 800; }
  .choice.picked { box-shadow: 0 0 0 3px var(--ink); }
  .choice.dim { opacity: 0.35; }
  .choice.right { box-shadow: 0 0 0 3px var(--good); }
  .choice:disabled { cursor: default; }
  .board { margin-top: 14px; }
  .board li { display: flex; justify-content: space-between; padding: 8px 2px; border-bottom: 1px solid var(--line); font-size: 14px; }
  .hidden { display: none !important; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<main>
  <header><h1 id="room">${w("Joining…")}</h1><span class="me hidden" id="me"><i id="me-n"></i><span id="me-name"></span></span><span class="team hidden" id="team"></span><span class="code" id="code">${safe}</span></header>

  <section id="join" class="card hidden">
    <label for="name">${w("Your name (optional)")}</label>
    <input id="name" maxlength="40" autocomplete="given-name" placeholder="${w("Shown with your questions")}">
    <button class="primary" id="join-btn">${w("Join")}</button>
    <p class="note" id="join-note"></p>
  </section>

  <section id="live" class="hidden">
    <div id="activity" class="card activity hidden"></div>

    <div id="ask-card" class="card">
      <label for="question">${w("Ask a question")}</label>
      <textarea id="question" maxlength="280" placeholder="${w("Type your question…")}"></textarea>
      <div class="row"><span id="ask-hint"></span><span id="count">0 / 280</span></div>
      <button class="primary" id="ask-btn">${w("Send question")}</button>
      <p class="note" id="ask-note"></p>
    </div>

    <div class="tabs" role="tablist">
      <button class="on" data-sort="top" role="tab" aria-selected="true">${w("Top")}</button>
      <button data-sort="new" role="tab" aria-selected="false">${w("Newest")}</button>
    </div>
    <ol id="list"></ol>
  </section>

  <section id="ended" class="card hidden"><p>${w("This room has ended. Thank you for joining.")}</p></section>
</main>
<script>
(function () {
  var CODE = ${JSON.stringify(safe)};
  var COLORS = ${JSON.stringify(PLAYER_COLORS)};
  var SHAPES = ${JSON.stringify(SHAPE_SVG)};
  var lastReveal = "", lastData = null;
  var LANG = ${JSON.stringify(language)}, W = ${JSON.stringify(PHONE_WORDS[language])}, TEAMS = ${JSON.stringify(TEAMS)};
  function tr(text, values) { var line = W[text] || text; for (var key in values || {}) line = line.split("{" + key + "}").join(String(values[key])); return line; }
  var API = ${JSON.stringify(origin)} + "/v1/rooms/" + CODE;
  var KEY = "cs-room-" + CODE;
  var pid = null, sort = "top", last = null, timer = null, busy = false;
  try { pid = localStorage.getItem(KEY); } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || tr("Something went wrong.")); return d; }); });
  }
  function note(id, text, kind) { var n = $(id); n.textContent = text || ""; n.className = "note" + (kind ? " " + kind : ""); }

  function join() {
    $("join-btn").disabled = true;
    post("/join", { name: $("name").value }).then(function (d) {
      pid = d.pid; try { localStorage.setItem(KEY, pid); } catch (e) {}
      show("join", false); show("live", true); refresh();
    }).catch(function (e) { note("join-note", e.message, "bad"); $("join-btn").disabled = false; });
  }

  function ask() {
    var text = $("question").value.trim();
    if (text.length < 3 || busy) return;
    busy = true; $("ask-btn").disabled = true;
    post("/ask", { pid: pid, text: text }).then(function (d) {
      $("question").value = ""; count();
      note("ask-note", d.state === "pending" ? tr("Sent. It appears here once the church puts it through.") : tr("Sent."), "ok");
      refresh();
    }).catch(function (e) {
      if (/Join/.test(e.message)) { try { localStorage.removeItem(KEY); } catch (x) {} pid = null; show("live", false); show("join", true); }
      note("ask-note", e.message, "bad");
    }).then(function () { busy = false; $("ask-btn").disabled = false; });
  }

  function vote(id) {
    post("/vote", { pid: pid, questionId: id }).then(refresh).catch(function (e) { note("ask-note", e.message, "bad"); });
  }

  function answer(index) {
    post("/answer", { pid: pid, choice: index }).then(refresh).catch(function (e) { note("ask-note", e.message, "bad"); });
  }

  function count() { $("count").textContent = $("question").value.length + " / 280"; }

  var arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';

  function drawQuestions(d) {
    var list = $("list"); list.textContent = "";
    var items = d.questions.slice();
    items.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return sort === "top" ? (b.votes - a.votes) || (b.at - a.at) : b.at - a.at;
    });
    if (!items.length) { list.appendChild(el("li", "empty", d.room.moderate ? tr("No questions up yet. Yours appears once the church puts it through.") : tr("No questions yet. Ask the first one."))); }
    items.forEach(function (q) {
      var li = el("li", "q" + (q.featured ? " featured" : ""));
      var text = el("div", "text"); text.appendChild(el("span", null, q.text));
      if (q.name) text.appendChild(el("span", "who", q.name));
      if (q.pinned) text.appendChild(el("span", "badge pin", tr("Pinned")));
      if (q.answered) text.appendChild(el("span", "badge done", tr("Answered")));
      var b = el("button", "vote" + (q.mine ? " mine" : ""));
      b.setAttribute("aria-label", (q.mine ? tr("Take back your vote for: ") : tr("Vote for: ")) + q.text);
      b.innerHTML = arrow; b.appendChild(el("span", null, String(q.votes)));
      b.onclick = function () { vote(q.id); };
      li.appendChild(text); li.appendChild(b); list.appendChild(li);
    });
    $("ask-hint").textContent = d.waiting ? tr("{n} of yours waiting", { n: d.waiting }) : "";
    show("ask-card", d.room.open);
  }

  function drawActivity(d) {
    var a = d.activity, box = $("activity");
    if (!a || a.kind === "none") { show("activity", false); return; }
    show("activity", true); box.textContent = "";
    box.appendChild(el("div", "meta", (a.kind === "quiz" ? tr("Question {n} of {total}", { n: a.round, total: a.total }) : tr("Poll")) + (a.game ? " · " + a.game : "")));
    box.appendChild(el("h2", null, a.question.prompt));
    // Reading time first: the answers wait, and the clock starts when they open.
    var opensIn = a.phase === "open" && a.opensAt ? Math.max(0, a.opensAt - a.now) : 0;
    var reading = opensIn > 0;
    if (reading) {
      var ready = el("div", "clock ready"); box.insertBefore(ready, box.lastChild);
      var readStart = Date.now();
      var readTick = function () { var left = Math.max(0, opensIn - (Date.now() - readStart)); ready.textContent = String(Math.max(1, Math.ceil(left / 1000))); if (left > 0 && document.body.contains(ready)) requestAnimationFrame(readTick); };
      readTick();
      setTimeout(function () { if (lastData === d) { last = null; drawActivity(d); } }, opensIn + 20);
    } else if (a.endsAt && a.phase === "open") {
      var clock = el("div", "clock"); box.insertBefore(clock, box.lastChild);
      var bar = el("div", "timer"), fill = el("i"); bar.appendChild(fill); box.appendChild(bar);
      var span = a.endsAt - Math.max(a.now, a.opensAt || 0), start = Date.now() - Math.max(0, a.now - (a.opensAt || a.now));
      var tick = function () { var left = Math.max(0, Math.min(span, span - (Date.now() - start))), secs = Math.ceil(left / 1000); fill.style.transform = "scaleX(" + (span ? left / span : 0) + ")"; clock.textContent = String(secs); clock.classList.toggle("hurry", secs <= 5); if (left > 0 && document.body.contains(fill)) requestAnimationFrame(tick); };
      tick();
    }
    var total = (a.counts || []).reduce(function (s, n) { return s + n; }, 0);
    var grid = el("div", "choices" + (a.question.choices.length <= 4 && a.question.choices.every(function (c) { return c.length <= 24; }) ? " big" : ""));
    a.question.choices.forEach(function (choice, i) {
      var reveal = a.phase === "reveal";
      var cls = "choice c" + i + (a.answered === i ? " picked" : "") + (reveal && a.correct !== undefined ? (i === a.correct ? " right" : " dim") : (a.answered !== null && a.answered !== i ? " dim" : ""));
      var b = el("button", cls);
      if (reveal && a.counts) { var f = el("i", "fill"); f.style.width = (total ? (a.counts[i] / total) * 100 : 0) + "%"; b.appendChild(f); }
      var mark = el("span", "mark"); mark.innerHTML = SHAPES[i] || ""; b.appendChild(mark); b.appendChild(el("span", "label", choice));
      if (reveal && a.counts) b.appendChild(el("span", "count", String(a.counts[i])));
      b.disabled = a.phase !== "open" || a.answered !== null || reading;
      b.onclick = function () { if (navigator.vibrate) navigator.vibrate(30); answer(i); };
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var status = a.phase === "open" ? (reading ? tr("Get ready… the answers open in a moment.") : a.answered !== null ? tr("Answer in. Wait for the others…") : "") : a.phase === "closed" ? tr("Time is up!") : a.kind === "quiz" ? "" : tr("Thanks for voting.");
    if (status) box.appendChild(el("p", "note", status));
    if (a.phase === "reveal" && a.kind === "quiz") {
      var win = a.answered !== null && a.answered === a.correct;
      var card = el("div", "result " + (win ? "win" : a.answered === null ? "none" : "miss"));
      card.appendChild(el("strong", null, win ? tr("Correct!") : a.answered === null ? tr("No answer this time") : tr("Not this time")));
      if (win && a.gain) { var g = el("span", "gain", "+0"); card.appendChild(g); countUp(g, a.gain); }
      var facts = el("div", "facts");
      if (win && a.streak > 1) facts.appendChild(el("span", null, "\u{1F525} " + tr("{n} in a row", { n: a.streak })));
      if (a.rank) facts.appendChild(el("span", null, tr("{place} of {players}", { place: ordinal(a.rank), players: a.players })));
      if (a.score != null) facts.appendChild(el("span", null, tr("{n} points", { n: a.score.toLocaleString() })));
      if (facts.childNodes.length) card.appendChild(facts);
      box.appendChild(card);
      var revealKey = a.round + ":" + a.game;
      if (revealKey !== lastReveal) { lastReveal = revealKey; if (navigator.vibrate) navigator.vibrate(win ? [40, 60, 40] : 120); }
    }
    if (d.leaderboard && d.leaderboard.length) {
      var board = el("ol", "board");
      d.leaderboard.forEach(function (p, i) { var li = el("li", a.rank === i + 1 ? "mine" : null); li.appendChild(el("span", null, (i + 1) + ". " + p.name)); li.appendChild(el("b", null, p.score.toLocaleString())); board.appendChild(li); });
      box.appendChild(board);
    }
  }

  function ordinal(n) {
    if (LANG === "fr") return n + (n === 1 ? "er" : "e");
    if (LANG === "es") return n + ".º";
    var t = n % 100; return n + (t >= 11 && t <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th"));
  }
  function countUp(node, to) {
    var start = performance.now(), length = 900;
    var step = function (now) { var p = Math.min(1, (now - start) / length), e = 1 - Math.pow(1 - p, 3); node.textContent = "+" + Math.round(to * e).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function drawMe(d) {
    if (!d.me) { show("me", false); return; }
    var color = COLORS[((d.me.n % COLORS.length) + COLORS.length) % COLORS.length];
    document.documentElement.style.setProperty("--me", color);
    $("me-n").textContent = (d.me.name || "?").charAt(0).toUpperCase();
    $("me-name").textContent = d.me.name || tr("Guest");
    show("me", true); show("code", false);
    // Team mode: the team's name in its colour, beside the player's own.
    var team = d.me.team != null ? TEAMS[d.me.team] : null;
    if (team) { $("team").textContent = tr("Team {name}", { name: tr(team.name) }); $("team").style.background = team.color; }
    show("team", !!team);
  }

  function refresh() {
    clearTimeout(timer);
    fetch(API + "/state?pid=" + encodeURIComponent(pid || ""), { cache: "no-store" }).then(function (r) {
      if (r.status === 404) { show("live", false); show("join", false); show("ended", true); $("room").textContent = tr("Room ended"); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      $("room").textContent = d.room.name;
      document.title = d.room.name + " · Church Studio";
      if (!pid) { show("join", true); return; }
      show("live", true);
      var key = JSON.stringify(d);
      if (key !== last) { last = key; lastData = d; drawMe(d); drawQuestions(d); drawActivity(d); }
      timer = setTimeout(refresh, d.activity && d.activity.kind !== "none" && d.activity.phase === "open" ? 1500 : 2500);
    }).catch(function () { timer = setTimeout(refresh, 4000); });
  }

  $("join-btn").onclick = join;
  $("ask-btn").onclick = ask;
  $("question").oninput = count;
  Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) {
    b.onclick = function () { sort = b.getAttribute("data-sort"); Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); }); last = null; refresh(); };
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  refresh();
})();
</script>
</body>
</html>`;
}

/** /j with no code: for the back rows, who read the code off the screen instead of scanning it. */
function entryPage(language: PhoneLanguage = "en"): string {
  const w = (text: string) => phoneWord(language, text);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111013">
<title>${w("Join a room")} · Church Studio</title>
<style>
  :root { --bg: #111013; --panel: #1b1a1f; --line: #2c2a31; --ink: #f6f3ee; --muted: #a39d96; --accent: #fa4f00; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
  main { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 18px; padding: 24px 16px calc(24px + env(safe-area-inset-bottom)); text-align: center; }
  h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--muted); max-width: 32ch; }
  form { display: grid; justify-items: center; gap: 18px; }
  .boxes { display: flex; gap: 8px; }
  .boxes input { width: min(13vw, 54px); height: min(16vw, 66px); padding: 0; border: 2px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font-family: inherit; font-size: clamp(22px, 7vw, 30px); font-weight: 800; line-height: 1; text-align: center; text-transform: uppercase; caret-color: var(--accent); }
  .boxes input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
  button { width: min(100%, 360px); height: 52px; border: 0; border-radius: 14px; background: var(--accent); color: #fff; font: inherit; font-weight: 750; font-size: 16px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  .bad { color: #ff8a73; min-height: 1.4em; }
</style>
</head>
<body>
<main>
  <h1>${w("Join a room")}</h1>
  <p>${w("Enter the code shown on the screen.")}</p>
  <form id="f" autocomplete="off">
    <div class="boxes" id="boxes"></div>
    <div class="bad" id="note" role="status"></div>
    <button id="go" type="submit" disabled>${w("Join")}</button>
  </form>
</main>
<script>
  const SIZE = 6;
  const boxes = document.getElementById("boxes");
  const go = document.getElementById("go");
  const note = document.getElementById("note");
  const inputs = [];
  for (let i = 0; i < SIZE; i++) {
    const input = document.createElement("input");
    input.inputMode = "text";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.maxLength = 1;
    input.setAttribute("aria-label", "Character " + (i + 1) + " of " + SIZE);
    boxes.appendChild(input);
    inputs.push(input);
  }
  const clean = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = () => inputs.map((input) => input.value).join("");
  const update = () => { go.disabled = code().length !== SIZE; note.textContent = ""; };
  // Typing fills a box and moves on; a pasted code fills them all.
  const fill = (from, text) => {
    const chars = clean(text).split("");
    let at = from;
    for (const char of chars) { if (at >= SIZE) break; inputs[at].value = char; at++; }
    inputs[Math.min(at, SIZE - 1)].focus();
    update();
    if (code().length === SIZE) document.getElementById("f").requestSubmit();
  };
  inputs.forEach((input, index) => {
    input.addEventListener("input", () => { const text = input.value; input.value = ""; fill(index, text); });
    // A box that already has a character takes the next one typed in its place.
    input.addEventListener("focus", () => input.select());
    input.addEventListener("paste", (event) => { event.preventDefault(); fill(0, event.clipboardData.getData("text")); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) { inputs[index - 1].value = ""; inputs[index - 1].focus(); update(); event.preventDefault(); }
      if (event.key === "ArrowLeft" && index > 0) inputs[index - 1].focus();
      if (event.key === "ArrowRight" && index < SIZE - 1) inputs[index + 1].focus();
    });
  });
  document.getElementById("f").addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = code();
    if (value.length !== SIZE) return;
    go.disabled = true;
    go.textContent = ${JSON.stringify(w("Joining…"))};
    // Check the room is open before leaving this page, so a typo is fixed here.
    const found = await fetch("/v1/rooms/" + value + "/state").then((r) => r.status !== 404).catch(() => true);
    if (found) { location.href = "/j/" + value; return; }
    go.textContent = ${JSON.stringify(w("Join"))};
    update();
    note.textContent = ${JSON.stringify(w("No room with that code. Check the screen and try again."))};
    inputs[0].focus();
    inputs[0].select();
  });
  inputs[0].focus();
</script>
</body>
</html>`;
}
