<script lang="ts">
  import { audienceRoom, type RoomQuestion } from "../../app/rooms.svelte";
  import { t, tn } from "../../i18n/core";
  import QrView from "../QrView.svelte";
  import Icon from "../Icon.svelte";
  import GamesTab from "./GamesTab.svelte";

  // The congregation's phones: a room they join by QR code, the questions they send, and the
  // quizzes and polls the operator runs. A drawer beside the desk, so the service carries on.
  type Filter = "waiting" | "up" | "answered" | "put-away";
  type Sort = "top" | "trending" | "newest" | "oldest";

  let tab = $state<"questions" | "games">("questions");
  let filter = $state<Filter>("waiting");
  let sort = $state<Sort>("top");
  let query = $state("");
  let copied = $state(false);
  let ending = $state(false);
  // The whole window, for running a game or a busy question time; remembered for next time.
  let wide = $state(readWide());

  function readWide(): boolean {
    try {
      return localStorage.getItem("church-studio:audience-wide") === "1";
    } catch {
      return false;
    }
  }

  function toggleWide() {
    wide = !wide;
    try {
      localStorage.setItem("church-studio:audience-wide", wide ? "1" : "0");
    } catch {
      // Not remembered; it still works now.
    }
  }

  const view = $derived(audienceRoom.view);
  const questions = $derived(view?.questions ?? []);
  const counts = $derived({
    waiting: questions.filter((question) => question.state === "pending").length,
    up: questions.filter((question) => question.state === "approved" && !question.hidden && !question.answered).length,
    answered: questions.filter((question) => question.state === "approved" && question.answered).length,
    "put-away": questions.filter((question) => question.state === "rejected" || question.state === "archived" || question.hidden).length,
  });
  const inFilter = (question: RoomQuestion) =>
    filter === "waiting"
      ? question.state === "pending"
      : filter === "up"
        ? question.state === "approved" && !question.hidden && !question.answered
        : filter === "answered"
          ? question.state === "approved" && question.answered
          : question.state === "rejected" || question.state === "archived" || question.hidden;
  const shown = $derived.by(() => {
    const words = query.trim().toLowerCase();
    const list = questions.filter((question) => inFilter(question) && (!words || `${question.text} ${question.name}`.toLowerCase().includes(words)));
    const order: Record<Sort, (a: RoomQuestion, b: RoomQuestion) => number> = {
      top: (a, b) => b.votes - a.votes || b.at - a.at,
      trending: (a, b) => b.trending - a.trending || b.votes - a.votes,
      newest: (a, b) => b.at - a.at,
      oldest: (a, b) => a.at - b.at,
    };
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || order[sort](a, b));
  });

  const ago = (at: number) => {
    const minutes = Math.round((Date.now() - at) / 60_000);
    return minutes < 1 ? t("just now") : minutes < 60 ? tn(minutes, "{n} min ago", "{n} min ago") : tn(Math.round(minutes / 60), "{n} hour ago", "{n} hours ago");
  };

  async function copyLink() {
    if (!audienceRoom.current) return;
    try {
      await navigator.clipboard.writeText(audienceRoom.current.joinUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<aside class="audience dock-drawer" class:wide aria-label={t("Audience")}>
  <header>
    <div>
      <h2>{t("Audience")}</h2>
      <p>{view ? tn(view.people, "{n} person joined", "{n} people joined") : t("Questions, quizzes and polls from people's phones")}</p>
    </div>
    <div class="head-tools">
      <button type="button" class="icon-btn" aria-label={wide ? t("Back to the side") : t("Full window")} data-tip={wide ? t("Back to the side") : t("Full window: more room to run the game")} aria-pressed={wide} onclick={toggleWide}><Icon name={wide ? "shrink" : "expand"} size={16} /></button>
      <button type="button" class="icon-btn" aria-label={t("Close")} onclick={() => audienceRoom.hide()}><Icon name="close" size={16} /></button>
    </div>
  </header>

  {#if !audienceRoom.current}
    <div class="start">
      <p>{t("Open a room and show its QR code. People join on their phones over the internet (no app, no Wi-Fi needed), then ask questions, vote, and play quizzes. Nothing reaches the screen until you put it there.")}</p>
      <button type="button" class="primary" disabled={audienceRoom.busy} onclick={() => audienceRoom.start()}>{audienceRoom.busy ? t("Opening…") : t("Open a room")}</button>
      {#if audienceRoom.error}<p class="error" role="alert">{audienceRoom.error}</p>{/if}
    </div>
  {:else}
    {@const room = audienceRoom.current}
    <section class="join">
      <div class="qr"><QrView qr={{ data: room.joinUrl, style: "rounded", dark: "#111111", light: "#ffffff", caption: "" }} /></div>
      <div class="join-copy">
        <span class="code" aria-label={t("Room code {code}", { code: room.code })}>{room.code}</span>
        <span class="link">{room.joinUrl.replace(/^https?:\/\//, "")}</span>
        <div class="row">
          <button type="button" class="btn accent" onclick={() => audienceRoom.qrOnPreview()}>{t("QR on Preview")}</button>
          <button type="button" class="btn" onclick={copyLink}>{copied ? t("Copied") : t("Copy link")}</button>
        </div>
      </div>
    </section>
    <!-- The screen on phones, tablets and TV browsers: anyone with the link sees what the room sees. -->
    <section class="share">
      <label class="share-head">
        <input type="checkbox" class="switch" checked={audienceRoom.sharing} onchange={(event) => audienceRoom.share(event.currentTarget.checked)} />
        <span><strong>{t("Show the screen on phones and browsers")}</strong><em>{audienceRoom.sharing ? t("Sharing what goes LIVE. Pictures and videos stay on this computer; words, songs and scripture show.") : t("For an overflow room, a TV with a browser, or people's own phones.")}</em></span>
      </label>
      {#if audienceRoom.sharing && audienceRoom.displayUrl}
        <div class="row">
          <span class="link">{audienceRoom.displayUrl.replace(/^https?:\/\//, "")}</span>
          <button type="button" class="btn" onclick={() => audienceRoom.displayQrOnPreview()}>{t("Its QR on Preview")}</button>
          <button type="button" class="btn" onclick={() => navigator.clipboard.writeText(audienceRoom.displayUrl ?? "").catch(() => {})}>{t("Copy")}</button>
        </div>
      {/if}
    </section>
    {#if audienceRoom.error}<p class="error" role="alert">{audienceRoom.error}</p>{/if}

    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "questions"} class:on={tab === "questions"} onclick={() => (tab = "questions")}>{t("Questions")}{#if counts.waiting}<b>{counts.waiting}</b>{/if}</button>
      <button type="button" role="tab" aria-selected={tab === "games"} class:on={tab === "games"} onclick={() => (tab = "games")}>{t("Quizzes and polls")}</button>
    </div>

    {#if tab === "questions"}
      <!-- How questions come in, which to show, and finding one: together, above the list. -->
      <div class="q-tools">
      <div class="switches">
        <label><input type="checkbox" class="switch" checked={view?.room.open ?? true} onchange={(event) => audienceRoom.settings({ open: event.currentTarget.checked })} /> {t("Taking questions")}</label>
        <label><input type="checkbox" class="switch" checked={view?.room.moderate ?? true} onchange={(event) => audienceRoom.settings({ moderate: event.currentTarget.checked })} /> {t("Hold for approval")}</label>
      </div>
      <div class="filters" role="radiogroup" aria-label={t("Show")}>
        {#each [["waiting", t("Waiting")], ["up", t("Up")], ["answered", t("Answered")], ["put-away", t("Put away")]] as [id, label] (id)}
          <button type="button" role="radio" aria-checked={filter === id} class:on={filter === id} onclick={() => (filter = id as Filter)}>{label} <span>{counts[id as Filter]}</span></button>
        {/each}
      </div>
      <div class="find">
        <label class="search">
          <Icon name="search" size={15} />
          <input type="text" placeholder={t("Search questions or names")} aria-label={t("Search questions")} bind:value={query} />
          {#if query}<button type="button" class="clear" aria-label={t("Clear search")} onclick={() => (query = "")}><Icon name="close" size={13} /></button>{/if}
        </label>
        <select aria-label={t("Order")} bind:value={sort}>
          <option value="top">{t("Most votes")}</option>
          <option value="trending">{t("Trending")}</option>
          <option value="newest">{t("Newest")}</option>
          <option value="oldest">{t("Oldest")}</option>
        </select>
      </div>
      </div>
      <ol class="list">
        {#each shown as question (question.id)}
          <li class:featured={question.featured}>
            <div class="q-top">
              <span class="votes" title={t("Votes")}>▲ {question.votes}</span>
              <span class="who">{question.name || t("Someone")} · {ago(question.at)}</span>
              {#if question.pinned}<span class="tag">{t("Pinned")}</span>{/if}
              {#if question.featured}<span class="tag gold">{t("Featured")}</span>{/if}
            </div>
            <p class="text">{question.text}</p>
            <div class="actions">
              {#if question.state === "pending"}
                <button type="button" class="btn accent" onclick={() => audienceRoom.moderate(question.id, "approve")}>{t("Put through")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "reject")}>{t("Turn down")}</button>
              {:else if question.state === "approved" && !question.hidden}
                <button type="button" class="btn accent" onclick={() => audienceRoom.questionOnPreview(question)}>{t("Show on Preview")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "answered")}>{question.answered ? t("Not answered") : t("Answered")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "pin")}>{question.pinned ? t("Unpin") : t("Pin")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "feature")}>{question.featured ? t("Unfeature") : t("Feature")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "hide")}>{t("Hide")}</button>
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, "archive")}>{t("Archive")}</button>
              {:else}
                <button type="button" class="btn" onclick={() => audienceRoom.moderate(question.id, question.hidden ? "show" : "restore")}>{t("Bring back")}</button>
              {/if}
            </div>
          </li>
        {:else}
          <li class="empty">{filter === "waiting" ? t("No questions waiting. Put the QR code on the screen to invite some.") : t("Nothing here.")}</li>
        {/each}
      </ol>
    {:else}
      <GamesTab />
    {/if}

    <footer>
      <!-- Two presses, so a room is never ended by a slip. -->
      <button type="button" class="link danger" onclick={() => { if (ending) void audienceRoom.end(); else { ending = true; setTimeout(() => (ending = false), 4000); } }}>{ending ? t("Press again to end the room for everyone") : t("End room")}</button>
    </footer>
  {/if}
</aside>

<style>
  .audience { position: fixed; top: 0; right: 0; bottom: 0; z-index: 30; width: min(var(--drawer-w, 420px), 100vw); display: flex; flex-direction: column; align-items: stretch; text-align: left; gap: 12px; padding: 16px; overflow: auto; background: var(--panel); color: var(--ink); border-left: 1px solid var(--line); box-shadow: -24px 0 60px rgb(0 0 0 / 0.35); font-size: 13px; }
  .audience > :global(*) { width: 100%; flex: none; }
  .audience.wide { left: 0; width: auto; z-index: 60; padding: 20px max(20px, calc((100vw - 1100px) / 2)); border-left: 0; box-shadow: none; }
  .head-tools { display: flex; gap: 2px; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; font-size: 17px; font-weight: 750; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
  .icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .icon-btn:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--ink); }
  .start p { margin: 0 0 12px; color: var(--muted); line-height: 1.5; }
  .primary { width: 100%; height: 40px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: 0.6; }
  .error { margin: 0; color: var(--danger, #ff6b5e); font-size: 12.5px; }
  .join { display: flex; gap: 14px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--field, rgb(255 255 255 / 0.03)); }
  .qr { flex: none; width: 104px; height: 104px; padding: 6px; border-radius: 10px; background: #fff; }
  .join-copy { min-width: 0; display: grid; gap: 4px; }
  .code { font-size: 24px; font-weight: 800; letter-spacing: 0.12em; }
  .link { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .btn { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .share { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .share-head { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .share-head span { display: grid; gap: 2px; }
  .share-head strong { font-size: 13px; }
  .share-head em { font-style: normal; color: var(--muted); font-size: 12px; line-height: 1.4; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 10px; background: color-mix(in srgb, currentColor 7%, transparent); }
  .tabs button { height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-weight: 650; cursor: pointer; }
  .tabs button.on { background: var(--panel-2, #2a2a30); color: var(--ink); }
  .tabs b { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font-size: 11px; }
  .q-tools { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
  .switches { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--muted); }
  .switches label { display: flex; align-items: center; gap: 6px; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .filters button { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .filters button span { margin-left: 4px; opacity: 0.7; }
  .filters button.on { border-color: transparent; background: var(--ink); color: var(--panel); }
  .find { display: flex; gap: 8px; }
  .search { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field, transparent); color: var(--muted); cursor: text; }
  .search:focus-within { border-color: var(--accent); color: var(--ink); }
  .search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  .search .clear { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
  .search .clear:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--ink); }
  .find select { flex: none; width: auto; height: 38px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--field, transparent); color: inherit; font: inherit; font-size: 12.5px; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .list li { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field, rgb(255 255 255 / 0.02)); }
  .list li.featured { border-color: #f2c46b; }
  .q-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 11.5px; }
  .votes { font-weight: 750; color: var(--ink); }
  .tag { padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); font-weight: 700; }
  .tag.gold { color: #f2c46b; }
  .text { margin: 6px 0 10px; font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .empty { color: var(--muted); text-align: center; padding: 20px 8px; }
  footer { margin-top: auto; padding-top: 8px; }
  .link { border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; padding: 4px 0; }
  .link.danger:hover { color: var(--danger, #ff6b5e); }
</style>
