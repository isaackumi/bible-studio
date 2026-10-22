// The page a phone opens from the QR code (/j/CODE): join, ask and upvote questions, answer quizzes
// and polls. One small page, no app, any connection. Words from the room are always set as text,
// never as HTML, so nothing anyone types can run on another person's phone.

export function roomPage(code: string, origin: string): string {
  const safe = code.replace(/[^A-Z0-9]/g, "");
  return `<!doctype html>
<html lang="en">
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
  .c0 { background: #e5484d; } .c1 { background: #3e63dd; } .c2 { background: #d4a017; } .c3 { background: #30a46c; } .c4 { background: #8e4ec6; } .c5 { background: #12a5b8; }
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
  <header><h1 id="room">Joining…</h1><span class="code">${safe}</span></header>

  <section id="join" class="card hidden">
    <label for="name">Your name (optional)</label>
    <input id="name" maxlength="40" autocomplete="given-name" placeholder="Shown with your questions">
    <button class="primary" id="join-btn">Join</button>
    <p class="note" id="join-note"></p>
  </section>

  <section id="live" class="hidden">
    <div id="activity" class="card activity hidden"></div>

    <div id="ask-card" class="card">
      <label for="question">Ask a question</label>
      <textarea id="question" maxlength="280" placeholder="Type your question…"></textarea>
      <div class="row"><span id="ask-hint"></span><span id="count">0 / 280</span></div>
      <button class="primary" id="ask-btn">Send question</button>
      <p class="note" id="ask-note"></p>
    </div>

    <div class="tabs" role="tablist">
      <button class="on" data-sort="top" role="tab" aria-selected="true">Top</button>
      <button data-sort="new" role="tab" aria-selected="false">Newest</button>
    </div>
    <ol id="list"></ol>
  </section>

  <section id="ended" class="card hidden"><p>This room has ended. Thank you for joining.</p></section>
</main>
<script>
(function () {
  var CODE = ${JSON.stringify(safe)};
  var API = ${JSON.stringify(origin)} + "/v1/rooms/" + CODE;
  var KEY = "cs-room-" + CODE;
  var pid = null, sort = "top", last = null, timer = null, busy = false;
  try { pid = localStorage.getItem(KEY); } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Something went wrong."); return d; }); });
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
      note("ask-note", d.state === "pending" ? "Sent. It appears here once the church puts it through." : "Sent.", "ok");
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
    if (!items.length) { list.appendChild(el("li", "empty", d.room.moderate ? "No questions up yet. Yours appears once the church puts it through." : "No questions yet. Ask the first one.")); }
    items.forEach(function (q) {
      var li = el("li", "q" + (q.featured ? " featured" : ""));
      var text = el("div", "text"); text.appendChild(el("span", null, q.text));
      if (q.name) text.appendChild(el("span", "who", q.name));
      if (q.pinned) text.appendChild(el("span", "badge pin", "Pinned"));
      if (q.answered) text.appendChild(el("span", "badge done", "Answered"));
      var b = el("button", "vote" + (q.mine ? " mine" : ""));
      b.setAttribute("aria-label", (q.mine ? "Take back your vote for: " : "Vote for: ") + q.text);
      b.innerHTML = arrow; b.appendChild(el("span", null, String(q.votes)));
      b.onclick = function () { vote(q.id); };
      li.appendChild(text); li.appendChild(b); list.appendChild(li);
    });
    $("ask-hint").textContent = d.waiting ? d.waiting + " of yours waiting" : "";
    show("ask-card", d.room.open);
  }

  function drawActivity(d) {
    var a = d.activity, box = $("activity");
    if (!a || a.kind === "none") { show("activity", false); return; }
    show("activity", true); box.textContent = "";
    box.appendChild(el("div", "meta", (a.kind === "quiz" ? "Question " + a.round + " of " + a.total : "Poll") + (a.game ? " · " + a.game : "")));
    box.appendChild(el("h2", null, a.question.prompt));
    if (a.endsAt && a.phase === "open") {
      var bar = el("div", "timer"), fill = el("i"); bar.appendChild(fill); box.appendChild(bar);
      var span = a.endsAt - a.now, start = Date.now();
      var tick = function () { var left = Math.max(0, span - (Date.now() - start)); fill.style.transform = "scaleX(" + (span ? left / span : 0) + ")"; if (left > 0 && document.body.contains(fill)) requestAnimationFrame(tick); };
      tick();
    }
    var marks = ["A", "B", "C", "D", "E", "F"], total = (a.counts || []).reduce(function (s, n) { return s + n; }, 0);
    var grid = el("div", "choices");
    a.question.choices.forEach(function (choice, i) {
      var reveal = a.phase === "reveal";
      var cls = "choice c" + i + (a.answered === i ? " picked" : "") + (reveal && a.correct !== undefined ? (i === a.correct ? " right" : " dim") : (a.answered !== null && a.answered !== i ? " dim" : ""));
      var b = el("button", cls);
      if (reveal && a.counts) { var f = el("i", "fill"); f.style.width = (total ? (a.counts[i] / total) * 100 : 0) + "%"; b.appendChild(f); }
      b.appendChild(el("span", "mark", marks[i])); b.appendChild(el("span", "label", choice));
      if (reveal && a.counts) b.appendChild(el("span", "count", String(a.counts[i])));
      b.disabled = a.phase !== "open" || a.answered !== null;
      b.onclick = function () { answer(i); };
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var status = a.phase === "open" ? (a.answered !== null ? "Answer in. Wait for the others…" : "") : a.phase === "closed" ? "Time is up." : (a.kind === "quiz" ? (a.answered === a.correct ? "Right! " : a.answered === null ? "" : "Not this time. ") + (a.score != null ? "Your score: " + a.score : "") : "Thanks for voting.");
    if (status) box.appendChild(el("p", "note" + (a.phase === "reveal" && a.answered === a.correct ? " ok" : ""), status));
    if (d.leaderboard && d.leaderboard.length) {
      var board = el("ol", "board");
      d.leaderboard.forEach(function (p, i) { var li = el("li"); li.appendChild(el("span", null, (i + 1) + ". " + p.name)); li.appendChild(el("b", null, String(p.score))); board.appendChild(li); });
      box.appendChild(board);
    }
  }

  function refresh() {
    clearTimeout(timer);
    fetch(API + "/state?pid=" + encodeURIComponent(pid || ""), { cache: "no-store" }).then(function (r) {
      if (r.status === 404) { show("live", false); show("join", false); show("ended", true); $("room").textContent = "Room ended"; return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      $("room").textContent = d.room.name;
      document.title = d.room.name + " · Church Studio";
      if (!pid) { show("join", true); return; }
      show("live", true);
      var key = JSON.stringify(d);
      if (key !== last) { last = key; drawQuestions(d); drawActivity(d); }
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
