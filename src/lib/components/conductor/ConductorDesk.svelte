<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../app/session.svelte";
  import { api } from "../../db/api";
  import { bundledQuoteCatalog } from "../../bible/texts";
  import { CANON, formatReference, parseReference } from "../../bible/reference";
  import { buildQuoteIndex, chooseHeard, searchQuotes, type QuoteIndex } from "../../voice/detect";
  import { searchSongHits, type SongHit } from "../../domain/song-search";
  import type { BibleItem, PresentationModel } from "../../domain/types";
  import { t } from "../../i18n/core";
  import DeskSwitcher from "../DeskSwitcher.svelte";
  import OutputMenu from "../OutputMenu.svelte";
  import Screen from "../Screen.svelte";
  import Icon from "../Icon.svelte";
  import LookBar from "./LookBar.svelte";

  // The Conductor Desk: the Presenter Desk's work as one gesture. Two decks face each other, NEXT
  // (Preview) and LIVE (Program), with a lever between them: push it up and NEXT goes live. The
  // service runs along the top; anything typed in the crate below lands on NEXT. Listening drops
  // the verses it hears onto NEXT too, with the same matching as the Presenter Desk.

  const translationId = $derived(session.workspace.deskTranslationId ?? "kjv");
  const displayLive = $derived(session.output.online && session.live.program.model.layout !== "empty" && !session.programHeld);
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");

  // ---- The service rail
  const serviceItems = $derived(session.service?.sections.flatMap((section) => section.items) ?? []);
  const canService = $derived(session.entitled("service"));

  // ---- The crate: verses, songs and service items from one box
  type Hit = { key: string; kind: "verse" | "song" | "item"; title: string; detail: string; load: () => void | Promise<void> };
  let query = $state("");
  let hits = $state<Hit[]>([]);
  let active = $state(0);
  let crateEl = $state<HTMLInputElement | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function passageFor(bookOrd: number, chapter: number, start: number, end: number, version = translationId): BibleItem {
    const book = CANON.find((entry) => entry.ord === bookOrd)!;
    return { translationId: version, bookOrd, chapter, startVerse: start, endVerse: end, reference: formatReference(book.name, chapter, start, end, book.chapters) };
  }

  async function search(text: string) {
    const typed = text.trim();
    if (!typed) {
      hits = [];
      return;
    }
    const found: Hit[] = [];
    const reference = parseReference(typed);
    if (reference) {
      const item = passageFor(reference.bookOrd, reference.chapter, reference.startVerse ?? 1, reference.endVerse ?? reference.startVerse ?? 1);
      found.push({ key: `ref:${item.reference}`, kind: "verse", title: item.reference, detail: t("Bible reference"), load: () => session.previewPassage(item) });
    }
    if (session.entitled("songs")) {
      for (const hit of searchSongHits(session.songs, typed, 6)) {
        found.push({ key: `song:${hit.songId}:${hit.sectionId}`, kind: "song", title: hit.title, detail: hit.snippet || hit.label, load: () => session.previewSongHit(hit as SongHit) });
      }
    }
    if (canService) {
      const needle = typed.toLowerCase();
      for (const item of serviceItems.filter((entry) => entry.title.toLowerCase().includes(needle)).slice(0, 4)) {
        found.push({ key: `item:${item.id}`, kind: "item", title: item.title, detail: t("In this service"), load: () => session.selectItem(item.id) });
      }
    }
    if (!reference && typed.length >= 3) {
      // Exact wording first, then the spelling-forgiving index listening uses (old and modern wording).
      const exact = await api.search(translationId, typed).catch(() => []);
      if (query.trim() !== typed) return;
      const loose = listenIndex ? searchQuotes(typed, listenIndex, 12) : [];
      const seen = new Set<string>();
      const verses = [...exact, ...loose].filter((hit) => {
        const key = `${hit.bookOrd}:${hit.chapter}:${hit.verse}`;
        return !seen.has(key) && !!seen.add(key);
      });
      for (const hit of verses.slice(0, 8)) {
        const item = passageFor(hit.bookOrd, hit.chapter, hit.verse, hit.verse);
        found.push({ key: `verse:${item.reference}`, kind: "verse", title: item.reference, detail: hit.text, load: () => session.previewPassage(item) });
      }
    }
    if (query.trim() === typed) {
      hits = found;
      active = 0;
    }
  }

  $effect(() => {
    const text = query;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void search(text), 160);
  });

  async function loadHit(hit: Hit | undefined, live = false) {
    if (!hit) return;
    await hit.load();
    if (live) await session.take();
  }

  function crateKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(hits.length - 1, active + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(0, active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void loadHit(hits[active], event.shiftKey);
    } else if (event.key === "Escape") {
      query = "";
      crateEl?.blur();
    }
  }

  // ---- The lever: push it up and NEXT goes live; it springs back.
  let lever = $state(0);
  let dragging = $state(false);
  let trackEl = $state<HTMLDivElement | null>(null);
  let thrown = $state(false);

  async function throwLever() {
    thrown = true;
    lever = 1;
    await session.take();
    setTimeout(() => {
      lever = 0;
      thrown = false;
    }, 260);
  }

  function leverAt(event: PointerEvent): number {
    if (!trackEl) return 0;
    const box = trackEl.getBoundingClientRect();
    const vertical = box.height > box.width;
    const share = vertical ? (box.bottom - event.clientY) / box.height : (event.clientX - box.left) / box.width;
    return Math.max(0, Math.min(1, share));
  }

  function leverDown(event: PointerEvent) {
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    lever = leverAt(event);
  }
  function leverMove(event: PointerEvent) {
    if (dragging) lever = leverAt(event);
  }
  function leverUp() {
    if (!dragging) return;
    dragging = false;
    if (lever >= 0.8) void throwLever();
    else lever = 0;
  }
  function leverKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      void throwLever();
    }
  }

  // ---- Listening: a verse heard lands on NEXT (the King James, World English and Berean together).
  let listenIndex: QuoteIndex | null = null;
  let lastHeard = $state("");
  let lastFound = "";
  $effect(() => {
    const own = translationId;
    void Promise.all([...new Set([own, "kjv", "web", "bsb"])].map((source) => bundledQuoteCatalog(source).catch(() => []))).then((lists) => {
      if (own === translationId) listenIndex = buildQuoteIndex(lists.flat());
    });
  });

  function heard(text: string, final: boolean, alternatives: string[]) {
    if (!text) return;
    if (final) lastHeard = text;
    if (!listenIndex) return;
    const match = chooseHeard(alternatives.length ? alternatives : [text], listenIndex, translationId);
    if (!match || match.item.reference === lastFound) return;
    lastFound = match.item.reference;
    session.noteListening(`found by listening: ${match.item.reference}`);
    void session.previewPassage({ ...match.item, translationId });
    session.voice.message = t("{reference} is on Next. Push the lever to show it.", { reference: match.item.reference });
  }

  onMount(() => {
    const stop = session.onVoiceHeard(heard);
    // "/" puts the cursor in the crate, as it opens search on the other desks.
    const slash = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      crateEl?.focus();
    };
    window.addEventListener("keydown", slash);
    return () => {
      stop();
      window.removeEventListener("keydown", slash);
    };
  });

  /** Another Bible version: the verse on Next is read again in it, and the screen's too with "Live too". */
  async function useVersion(id: string, liveToo: boolean) {
    session.setDeskTranslation(id);
    const next = session.live.preview.model;
    const parsed = next.layout === "scripture" && next.reference ? parseReference(next.reference) : null;
    if (parsed?.startVerse) await session.previewPassage(passageFor(parsed.bookOrd, parsed.chapter, parsed.startVerse, parsed.endVerse ?? parsed.startVerse, id));
    if (liveToo) await session.refreshProgramTranslation(id);
  }

  /** What a deck shows, in a few words: the reference, a caption, or its first line. */
  const titleOf = (model: PresentationModel) => model.reference || model.caption || model.lines[0]?.text || "";

  const kindLabel = (kind: Hit["kind"]) => (kind === "verse" ? t("Scripture") : kind === "song" ? t("Song") : t("Service"));
</script>

<div class="conductor">
  <header class="bar">
    <DeskSwitcher compact />
    <div class="bar-end">
      <OutputMenu />
      <button type="button" class="tool" aria-label={t("Settings")} title={t("Settings")} onclick={() => session.openSettings()}><Icon name="settings" size={16} /></button>
    </div>
  </header>

  <!-- The service, as a rail: what comes, what is up. -->
  <nav class="rail" aria-label={t("This service")}>
    {#if !canService}
      <button type="button" class="rail-empty" onclick={() => session.requireFeature("service")}>{t("The running order is part of Premium. Type in the crate below to load anything.")}</button>
    {:else if !serviceItems.length}
      <button type="button" class="rail-empty" onclick={() => session.goToDesk("service")}>{t("No service is open. Open one on the Presenter Desk's Service page.")}</button>
    {:else}
      {#each serviceItems as item, index (item.id)}
        <button type="button" class="stop" class:here={session.cursor.itemId === item.id} aria-current={session.cursor.itemId === item.id ? "step" : undefined} onclick={() => void session.selectItem(item.id)}>
          <span class="stop-n">{index + 1}</span><span class="stop-t">{item.title}</span>
        </button>
      {/each}
    {/if}
  </nav>

  <main class="cd-stage">
    <section class="deck next" aria-label={t("Next")}>
      <span class="deck-name" aria-hidden="true">{t("Next")}</span>
      <div class="screen"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint={t("Type in the crate, pick from the rail, or let listening find the verse.")} /></div>
      <div class="deck-tools">
        <button type="button" class="step" aria-label={t("Previous on Next")} onclick={() => void session.step(-1)}><Icon name="chevron-left" size={18} /></button>
        <span class="deck-title">{titleOf(session.live.preview.model) || t("Nothing on Next")}</span>
        <button type="button" class="step" aria-label={t("Next on Next")} onclick={() => void session.step(1)}><Icon name="chevron-right" size={18} /></button>
      </div>
    </section>

    <!-- The lever: the one move this desk is built around. -->
    <div class="lever-col">
      <div
        class="track"
        class:dragging
        class:thrown
        bind:this={trackEl}
        role="slider"
        tabindex="0"
        aria-label={t("Push up to show Next live (Space)")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(lever * 100)}
        style:--lever={lever}
        onpointerdown={leverDown}
        onpointermove={leverMove}
        onpointerup={leverUp}
        onpointercancel={leverUp}
        onkeydown={leverKey}
      >
        <span class="groove"></span>
        <span class="knob"><Icon name="chevron-up" size={16} /></span>
      </div>
      <span class="lever-word">{t("Live")}</span>
      <div class="pads">
        <button type="button" class="pad black" onclick={() => session.black()}>{t("Black")}</button>
        <button type="button" class="pad" onclick={() => session.clear()}>{t("Clear")}</button>
        <button type="button" class="pad" title={t("Take the words off; the background stays")} onclick={() => void session.clearWords()}>{t("Clear words")}</button>
        <button type="button" class="pad" onclick={() => session.logo()}>{t("Logo")}</button>
        {#if session.canUndoProgram}<button type="button" class="pad" onclick={() => void session.undoProgram()}>{t("Undo")}</button>{/if}
      </div>
    </div>

    <section class="deck live" class:on-air={displayLive} aria-label={t("Live")}>
      <span class="deck-name" aria-hidden="true">{#if displayLive}<i class="dot" aria-hidden="true"></i>{/if}{displayLive ? t("Live: the congregation sees this") : t("Live")}</span>
      <div class="screen"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint={t("The congregation sees nothing yet.")} /></div>
      <div class="deck-tools">
        <button type="button" class="step" aria-label={t("Previous, live")} onclick={async () => { await session.step(-1); await session.take(); }}><Icon name="chevron-left" size={18} /></button>
        <span class="deck-title">{titleOf(session.live.program.model) || (displayLive ? t("On the screen") : t("Not on the screen"))}</span>
        <button type="button" class="step" aria-label={t("Next, live")} onclick={async () => { await session.step(1); await session.take(); }}><Icon name="chevron-right" size={18} /></button>
      </div>
    </section>
  </main>

  <div class="look-row"><LookBar onversion={(id, liveToo) => void useVersion(id, liveToo)} /></div>

  <footer class="crate">
    <div class="listen">
      <button type="button" class="mic" class:on={listening} aria-pressed={listening} aria-label={listening ? t("Stop listening") : t("Listen for verses")} onclick={() => (listening ? session.stopVoice() : void session.startVoice())}>
        <Icon name={listening ? "mic-off" : "mic"} size={16} />
      </button>
      <span class="meter" aria-hidden="true"><span style:width="{Math.round((listening ? session.voice.level : 0) * 100)}%"></span></span>
      <span class="said">{listening ? lastHeard || session.voice.message : t("Listen, and the verses the preacher mentions land on Next.")}</span>
    </div>
    <label class="find">
      <Icon name="search" size={16} />
      <input bind:this={crateEl} bind:value={query} onkeydown={crateKey} placeholder={t("Type a verse, a song, or a line from one")} aria-label={t("Find something to load on Next")} />
    </label>
    {#if hits.length}
      <ul class="hits" role="listbox" aria-label={t("Found")}>
        {#each hits as hit, index (hit.key)}
          <li role="option" aria-selected={index === active}>
            <button type="button" class="hit {hit.kind}" class:active={index === active} onclick={() => void loadHit(hit)} ondblclick={() => void loadHit(hit, true)}>
              <span class="hit-kind">{kindLabel(hit.kind)}</span>
              <strong>{hit.title}</strong>
              <span class="hit-detail">{hit.detail}</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="crate-hint">{t("Enter loads it on Next. Shift+Enter, or a double click, shows it live.")}</p>
    {/if}
  </footer>
</div>

<style>
  .conductor {
    /* Next is calm and only Live glows: one colour, one meaning. */
    --next: color-mix(in srgb, var(--ink) 78%, var(--desk));
    --live: var(--onair);
    height: 100%;
    min-height: 0;
    container: desk / inline-size;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    gap: 10px;
    padding: 10px 14px 12px;
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
  }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
  .bar-end { display: flex; align-items: center; gap: 8px; }
  .tool { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); cursor: pointer; }

  /* The rail: the service as a line of stops; the one up now stands out. */
  .rail { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
  .stop { flex: none; display: flex; align-items: baseline; gap: 7px; max-width: 220px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
  .stop-n { font-variant-numeric: tabular-nums; font-size: 11px; opacity: 0.7; }
  .stop-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stop.here { border-color: var(--next); color: var(--ink); background: color-mix(in srgb, var(--next) 14%, transparent); }
  .rail-empty { padding: 7px 12px; border: 1px dashed var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }

  /* The stage: two decks facing each other, the lever between. */
  .cd-stage { display: grid; grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr); gap: 14px; min-height: 0; }
  .deck { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; min-height: 0; padding: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); overflow: hidden; }
  .deck.next { border-color: color-mix(in srgb, var(--next) 30%, var(--line)); }
  .deck.live.on-air { border-color: var(--live); box-shadow: 0 0 0 1px var(--live), 0 0 40px color-mix(in srgb, var(--live) 18%, transparent); }
  /* Each deck names itself in words, so neither leans on colour alone. */
  .deck-name { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 750; }
  .next .deck-name { color: var(--next); }
  .live .deck-name { color: var(--live-text); }
  .screen { position: relative; min-height: 0; display: grid; place-items: center; border-radius: 10px; overflow: hidden; }
  .deck-tools { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .deck-title { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--live); box-shadow: 0 0 10px var(--live); }
  .step { width: 38px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); cursor: pointer; }
  .live .step { border-color: color-mix(in srgb, var(--live) 35%, var(--line)); }

  /* The lever. */
  .lever-col { display: grid; grid-template-rows: minmax(0, 1fr) auto auto; justify-items: center; gap: 10px; min-height: 0; }
  .track { --lever: 0; position: relative; width: 56px; height: 100%; min-height: 160px; border-radius: 28px; background: color-mix(in srgb, var(--ink) 6%, var(--field)); border: 1px solid var(--line); touch-action: none; cursor: grab; outline: none; }
  .track:focus-visible { box-shadow: 0 0 0 2px var(--next); }
  .track.dragging { cursor: grabbing; }
  .groove { position: absolute; left: 50%; top: 14px; bottom: 14px; width: 4px; transform: translateX(-50%); border-radius: 2px; background: linear-gradient(to top, var(--next), var(--live)); opacity: 0.55; }
  .knob { position: absolute; left: 50%; bottom: calc(6px + (100% - 56px) * var(--lever)); width: 44px; height: 44px; transform: translateX(-50%); display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--live) calc(var(--lever) * 100%), var(--next)); color: var(--desk); box-shadow: 0 6px 18px rgb(0 0 0 / 0.35); transition: bottom 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2), background 220ms; }
  .track.dragging .knob { transition: none; }
  .lever-word { font-size: 13px; font-weight: 800; color: var(--live-text); }
  .pads { display: grid; gap: 6px; width: 100%; }
  .pad { height: 34px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
  .pad.black { background: #000; color: #fff; border-color: #000; }

  .look-row { display: grid; gap: 8px; min-width: 0; }

  /* The crate: listening on one line, then the box that loads anything onto Next. */
  .crate { display: grid; gap: 8px; }
  .listen { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; color: var(--muted); }
  .mic { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%; background: var(--field); color: var(--ink); cursor: pointer; }
  .mic.on { background: var(--live); border-color: var(--live); color: #fff; }
  .meter { flex: none; width: 70px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .meter span { display: block; height: 100%; background: var(--live); transition: width 120ms linear; }
  .said { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .find { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 48px; border: 1px solid var(--line); border-radius: 14px; background: var(--field); color: var(--muted); }
  .find:focus-within { border-color: var(--next); box-shadow: 0 0 0 1px var(--next); }
  .find input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 17px; outline: none; }
  .hits { display: flex; gap: 8px; margin: 0; padding: 0 0 2px; list-style: none; overflow-x: auto; }
  .crate .hit { width: 220px; height: 92px; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 2px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .crate .hit.active { border-color: var(--next); box-shadow: inset 0 0 0 1px var(--next); }
  .hit-kind { font-size: 11px; color: var(--muted); }
  .hit strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit-detail { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .crate-hint { margin: 0; font-size: 12px; color: var(--muted); }

  @media (prefers-reduced-motion: reduce) {
    .knob, .meter span { transition: none; }
  }
  /* A narrow window: Live on top, the lever lies down, Next below. */
  @media (max-width: 900px) {
    /* The desk scrolls instead, so each screen keeps the church's screen shape. */
    .conductor { grid-template-rows: none; grid-auto-rows: auto; overflow-y: auto; }
    .cd-stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
    .deck { grid-template-rows: auto auto auto; }
    .live { order: 1; }
    .lever-col { order: 2; grid-template-rows: none; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; }
    .next { order: 3; }
    .track { width: 100%; height: 52px; min-height: 0; }
    .groove { left: 14px; right: 14px; top: 50%; bottom: auto; width: auto; height: 4px; transform: translateY(-50%); background: linear-gradient(to right, var(--next), var(--live)); }
    .knob { bottom: auto; top: 50%; left: calc(4px + (100% - 52px) * var(--lever)); transform: translateY(-50%) rotate(90deg); transition: left 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2), background 220ms; }
    .pads { grid-auto-flow: column; width: auto; }
  }
</style>
