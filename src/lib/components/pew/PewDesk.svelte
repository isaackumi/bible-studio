<script lang="ts">
  import AlertsDialog from "../AlertsDialog.svelte";
  import TimerControls from "../TimerControls.svelte";
  import { findItem } from "../../domain/service";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import { session } from "../../app/session.svelte";
  import { stepVerse } from "../../bible/passage";
  import { formatReference, parseReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import type { BibleItem, PresentationItem, SearchHit, Sermon, SermonSection, TextStyle, VerseText } from "../../domain/types";
  import { untrack } from "svelte";
  import { canUse } from "../../platform/capabilities";
  import { bundledQuoteCatalog } from "../../bible/texts";
  import { isOnlineTranslation, WORDS_TRANSLATION } from "../../bible/online-bibles";
  import { buildQuoteIndex, chooseHeard, detectVerse, searchQuotes, type QuoteIndex } from "../../voice/detect";
  import DeskSwitcher from "../DeskSwitcher.svelte";
  import Icon from "../Icon.svelte";
  import SongDesk from "./SongDesk.svelte";
  import VideoControls from "../VideoControls.svelte";
  import ServiceDesk from "./ServiceDesk.svelte";
  import SermonDesk from "./SermonDesk.svelte";
  import OutputMenu from "../OutputMenu.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import OutputType from "../OutputType.svelte";
  import Screen from "../Screen.svelte";
  import { Pane, PaneGroup, PaneResizer } from "paneforge";
  import { LIBRARY_PANEL, QUEUE_PANEL, mergeColumns, mergeSplit, panelOpen } from "../../workspace/pew";

  type Mode = "scriptures" | "songs" | "sermon" | "service";
  let mode = $state<Mode>("scriptures");
  let translationId = $state("kjv");
  let bookOrd = $state(1);
  let chapter = $state(1);
  let verses = $state<VerseText[]>([]);
  let start = $state<number | null>(1);
  let end = $state<number | null>(1);
  let anchor = $state<number | null>(1);
  let query = $state("Genesis 1");
  let detections = $state<SearchHit[]>([]);
  let note = $state("Loading scripture…");
  let sheet = $state<"help" | "lexicon" | "type" | null>(null);
  let wrapVerses = $state(false);
  let chapterToken = 0;
  let seededChapterPreview = false;
  let takeAfterPreview = false;
  let quoteIndex: QuoteIndex | null = null;
  let lastSpokenRef = "";

  const book = $derived(session.books.find((entry) => entry.ord === bookOrd) ?? session.books[0]);
  const themeName = $derived(session.theme().name.toUpperCase());
  /** Program is showing something: the desk is on air (the audience sees it once output is open). */
  /** Program has something on it. */
  const programSet = $derived(session.live.program.model.layout !== "black" && session.live.program.model.layout !== "empty");
  /** On air only when the audience can actually see Program. */
  const displayLive = $derived(programSet && session.output.online);
  const activeLayout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const libraryVisible = $derived(panelOpen(activeLayout, LIBRARY_PANEL));
  const queueVisible = $derived(panelOpen(activeLayout, QUEUE_PANEL));
  const focus = $derived(session.workspace.pew.focus);
  const showLibrary = $derived(libraryVisible && !focus);
  const showReading = $derived(!focus);
  const showQueue = $derived(queueVisible && !focus);
  /** This page's monitor choice; Focus always shows both. */
  const monitors = $derived(session.workspace.pew.monitors[mode]);
  const showPreview = $derived(focus || session.workspace.pew.monitors.scriptures.preview);
  const showProgram = $derived(focus || session.workspace.pew.monitors.scriptures.program);
  const showRight = $derived(showProgram || showQueue);
  let epoch = $state(0);
  let frozen = $state(session.workspace.pew);
  let applying = false;
  let chromeReady = false;
  const chrome = $derived(
    `${Number(focus)}:${Number(showLibrary)}:${Number(showQueue)}:${Number(showPreview)}:${Number(showProgram)}:${session.workspace.activeLayoutId}`,
  );

  function retarget() {
    applying = true;
    frozen = untrack(() => session.workspace.pew);
    // Untracked: this runs inside the chrome effect, and reading epoch there would re-run it forever.
    epoch = untrack(() => epoch) + 1;
  }

  function onColumns(reported: number[]) {
    // Without the right column the reported sizes don't map onto the saved three; keep them.
    if (applying || focus || !showRight) return;
    session.savePew({ columns: mergeColumns(session.workspace.pew.columns, reported, showLibrary) });
  }

  function onLibrarySplit(reported: number[]) {
    if (applying || focus) return;
    session.savePew({ librarySplit: mergeSplit(session.workspace.pew.librarySplit, reported) });
  }

  function onStageSplit(reported: number[]) {
    if (applying || focus || !showPreview) return;
    session.savePew({ stageSplit: mergeSplit(session.workspace.pew.stageSplit, reported) });
  }

  function onProgramSplit(reported: number[]) {
    if (applying || focus || !showProgram || !showQueue) return;
    session.savePew({ programSplit: mergeSplit(session.workspace.pew.programSplit, reported) });
  }

  function share(part: number, other: number): number {
    const sum = part + other;
    return sum > 0 ? (part / sum) * 100 : 50;
  }

  $effect(() => {
    chrome;
    if (!chromeReady) {
      chromeReady = true;
      frozen = untrack(() => session.workspace.pew);
      return;
    }
    retarget();
  });

  $effect(() => {
    epoch;
    queueMicrotask(() => {
      applying = false;
    });
  });
  const queue = $derived(session.service?.sections.flatMap((section) => section.items) ?? []);
  const reading = $derived(
    verses.filter((verse) => start !== null && verse.verse >= start && verse.verse <= (end ?? start)),
  );
  $effect(() => {
    const first = session.translations[0];
    if (first && !session.translations.some((entry) => entry.id === translationId)) translationId = first.id;
  });

  $effect(() => {
    const id = translationId;
    // Online translations are not stored, so matching reads a bundled translation's words.
    void bundledQuoteCatalog(isOnlineTranslation(id) ? WORDS_TRANSLATION : id).then((rows) => {
      if (id === translationId) quoteIndex = buildQuoteIndex(rows);
    });
  });

  $effect(() => {
    const id = translationId;
    const ord = bookOrd;
    const ch = chapter;
    const token = ++chapterToken;
    note = "Loading scripture…";
    void api
      .verses(id, ord, ch)
      .then((rows) => {
        if (token !== chapterToken) return;
        verses = rows;
        const from = start ?? 1;
        const to = end ?? from;
        note = rows.length ? "" : "This chapter has no verses.";
        if (rows.some((row) => row.verse === from)) {
          const layout = session.live.preview.model.layout;
          const skipSeed = !seededChapterPreview && layout !== "black" && layout !== "empty";
          seededChapterPreview = true;
          if (!skipSeed) void showPassage(from, Math.max(from, to));
        }
        void session.refreshProgramTranslation(id);
      })
      .catch(() => {
        if (token !== chapterToken) return;
        verses = [];
        note = "Scripture could not be loaded.";
      });
  });

  function passage(): BibleItem | null {
    if (!book || start === null) return null;
    const last = end ?? start;
    return {
      translationId,
      bookOrd,
      chapter,
      startVerse: start,
      endVerse: last,
      reference: formatReference(book.name, chapter, start, last, book.chapters),
    };
  }

  async function showPassage(from: number, to: number) {
    start = from;
    end = to;
    const item = passage();
    if (!item) {
      takeAfterPreview = false;
      return;
    }
    query = item.reference;
    await session.previewPassage(item);
    if (takeAfterPreview) {
      takeAfterPreview = false;
      await session.take();
    }
  }

  function pick(verse: number, shift = false) {
    if (shift && anchor !== null) {
      void showPassage(Math.min(anchor, verse), Math.max(anchor, verse));
      return;
    }
    anchor = verse;
    void showPassage(verse, verse);
  }

  async function lookup(event: Event) {
    event.preventDefault();
    const parsed = parseReference(query, session.books);
    if (parsed?.startVerse) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = parsed.startVerse;
      await showPassage(parsed.startVerse, parsed.endVerse ?? parsed.startVerse);
      detections = [];
      return;
    }
    if (parsed) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = 1;
      await showPassage(1, 1);
      return;
    }
    await findPhrase(query);
  }

  async function findInScripture() {
    const parsed = parseReference(query, session.books);
    if (parsed?.startVerse) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = parsed.startVerse;
      await showPassage(parsed.startVerse, parsed.endVerse ?? parsed.startVerse);
      return;
    }
    await findPhrase(query);
  }

  async function findPhrase(text: string) {
    // Exact wording first, then verses with most of the words (spelling slips allowed).
    const exact = await api.search(translationId, text);
    const ranked = quoteIndex ? searchQuotes(text, quoteIndex, 40) : [];
    const key = (hit: SearchHit) => `${hit.bookOrd}:${hit.chapter}:${hit.verse}`;
    const exactKeys = new Set(exact.map(key));
    const rankedKeys = new Set(ranked.map(key));
    const hits = [
      ...ranked.filter((hit) => exactKeys.has(key(hit))),
      ...exact.filter((hit) => !rankedKeys.has(key(hit))),
      ...ranked.filter((hit) => !exactKeys.has(key(hit))),
    ].slice(0, 40);
    detections = hits;
    note = hits.length ? `${hits.length} matches for “${text.trim()}”.` : `No matches for “${text.trim()}”.`;
    const first = hits[0];
    if (first) openHit(first);
  }

  /** Go back to a passage from the Recent row (Preview only). */
  function openRecent(item: BibleItem) {
    if (session.translations.some((entry) => entry.id === item.translationId)) translationId = item.translationId;
    bookOrd = item.bookOrd;
    chapter = item.chapter;
    anchor = item.startVerse;
    query = item.reference;
    void showPassage(item.startVerse, item.endVerse);
  }

  let bibleInput = $state<HTMLInputElement | undefined>();

  // The desk's "/" focuses the Bible search while Scriptures is open with its library showing.
  $effect(() => {
    if (mode !== "scriptures" || !showLibrary) return;
    const focusBible = () => {
      bibleInput?.focus();
      bibleInput?.select();
    };
    session.localSearch = focusBible;
    return () => {
      if (session.localSearch === focusBible) session.localSearch = null;
    };
  });

  /** ↑ ↓ in the search box move the picked verse; the desk's own arrows still step Preview elsewhere. */
  function bibleKey(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (verses.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = anchor ?? 0;
    const next = Math.min(verses.length, Math.max(1, current + (event.key === "ArrowDown" ? 1 : -1)));
    pick(next);
    requestAnimationFrame(() => document.querySelector(".verse-list .verse.picked")?.scrollIntoView({ block: "nearest" }));
  }

  function openHit(hit: SearchHit) {
    bookOrd = hit.bookOrd;
    chapter = hit.chapter;
    anchor = hit.verse;
    void showPassage(hit.verse, hit.verse);
  }

  function moveChapter(direction: 1 | -1) {
    if (!book) return;
    const next = chapter + direction;
    if (next < 1 || next > book.chapters) return;
    chapter = next;
    start = 1;
    end = 1;
    anchor = 1;
    query = `${book.name} ${next}`;
  }

  async function stepOutput(direction: 1 | -1) {
    if (mode === "songs") {
      session.stepSong(direction);
      await session.take();
      return;
    }
    if (mode === "sermon") {
      await session.stepSermon(direction);
      await session.take();
      return;
    }
    const current = mode === "scriptures" ? passage() : null;
    if (current && book) {
      const next = stepVerse(current, direction, book, verses.length);
      if (next) {
        anchor = next.startVerse;
        await showPassage(next.startVerse, next.endVerse);
        await session.take();
        return;
      }
      const nextChapter = chapter + direction;
      if (nextChapter < 1 || nextChapter > book.chapters) return;
      takeAfterPreview = true;
      moveChapter(direction);
      return;
    }
    await session.step(direction);
    await session.take();
  }

  async function ensureService(sectionName: string) {
    if (!session.service) await session.createService("Sunday Service");
    if (!session.service?.sections.length) session.addSection(sectionName);
  }

  async function queuePassage() {
    const item = passage();
    if (!item) return;
    await ensureService("Scripture");
    if (queue.some((entry) => entry.bible?.reference === item.reference && entry.bible.translationId === item.translationId)) {
      note = `${item.reference} is already in the queue.`;
      return;
    }
    await session.addPassage(item);
    note = `${item.reference} added to the queue.`;
  }

  // Presenter Desk is the words desk. Slides, media and Looks live on the Production Desk.
  const modes = $derived<{ id: Mode; label: string }[]>([
    { id: "scriptures", label: "Scriptures" },
    { id: "songs", label: "Songs" },
    ...(canUse("sermon") ? [{ id: "sermon" as const, label: "Sermon" }] : []),
    { id: "service", label: "Service" },
  ]);

  // A tour started from the hub can ask for another page.
  $effect(() => {
    const page = session.pageRequest;
    if (!page) return;
    untrack(() => pickMode(page));
    session.pageRequest = null;
  });

  /** Change page; each page keeps its own Preview (Program stays as it is). */
  function setMode(next: Mode): boolean {
    const restored = session.switchPage(mode, next);
    mode = next;
    return restored;
  }

  function pickMode(next: Mode) {
    const restored = setMode(next);
    if (next !== "scriptures" || restored) return;
    // First visit back to Scripture: stage the passage that is open.
    const item = passage();
    if (item) void session.previewPassage(item);
  }

  function onModeKey(event: KeyboardEvent) {
    if (!event.altKey || event.metaKey || event.ctrlKey || session.settingsOpen) return;
    const index = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (index < 0 || !modes[index] || target?.closest('[aria-modal="true"]')) return;
    event.preventDefault();
    pickMode(modes[index]!.id);
  }

  function open(item: PresentationItem) {
    void session.selectItem(item.id);
  }

  // Voice runs in the session (both desks). This desk turns heard words into verses on Preview.
  function detectSpokenVerse(text: string, _final: boolean, alternatives: string[]) {
    // While songs are up, lyrics that quote scripture must not pull a verse onto Preview.
    if (!text || mode === "songs") return;
    const quoted = quoteIndex ? chooseHeard(alternatives.length ? alternatives : [text], quoteIndex, translationId) : null;
    const openChapter = !quoted && book ? detectVerse(text, verses, book, chapter, translationId) : null;
    const match = quoted ?? (openChapter ? { item: openChapter, text } : null);
    if (!match) {
      if (!lastSpokenRef) session.voice.message = quoteIndex ? "Hearing you. Keep reading the verse." : "Loading the Bible so a verse can be found…";
      return;
    }
    const hit = match.item;
    if (hit.reference === lastSpokenRef) return;
    lastSpokenRef = hit.reference;
    const named = session.books.find((entry) => entry.ord === hit.bookOrd)?.name ?? hit.reference;
    if (hit.bookOrd !== bookOrd || hit.chapter !== chapter) {
      bookOrd = hit.bookOrd;
      chapter = hit.chapter;
    }
    anchor = hit.startVerse;
    session.voice.message = `${hit.reference} is on Preview. LIVE still sends Program.`;
    detections = [
      { bookOrd: hit.bookOrd, bookName: named, chapter: hit.chapter, verse: hit.startVerse, text: match.text },
      ...detections,
    ].slice(0, 12);
    // A pending arrow-key Take must never carry a spoken verse to Program.
    takeAfterPreview = false;
    void showPassage(hit.startVerse, hit.endVerse);
  }

  const voiceActive = $derived(session.voice.status === "listening" || session.voice.status === "starting");

  $effect(() => {
    const stopHeard = session.onVoiceHeard(detectSpokenVerse);
    const stopDesk = session.attachVoiceDesk(async (request) => {
      if (request.kind === "library") {
        setMode(request.tab === "songs" ? "songs" : "scriptures");
        return true;
      }
      if (request.kind === "translation") {
        if (!session.translations.some((entry) => entry.id === request.id)) return false;
        translationId = request.id;
        // Re-read the verse on Preview in the new translation; Program waits for LIVE.
        const item = passage();
        if (item) await session.previewPassage(item);
        return true;
      }
      setMode("scriptures");
      query = request.query;
      takeAfterPreview = false;
      await findInScripture();
      return true;
    });
    return () => {
      stopHeard();
      stopDesk();
    };
  });

  function toggleVoice() {
    if (!voiceActive) lastSpokenRef = "";
    void session.toggleVoice();
  }

  let alertsOpen = $state(false);
</script>

<svelte:window onkeydown={onModeKey} />

<div class="pb" class:focus>
  <header class="pb-bar">
    <div class="pb-left">
      <DeskSwitcher compact />
      <nav class="pb-modes" aria-label="Library">
        {#each modes as entry, index (entry.id)}
          <button
            type="button"
            class:on={mode === entry.id}
            aria-pressed={mode === entry.id}
            aria-keyshortcuts={`Alt+${index + 1}`}
            data-tip={`${entry.label} (Alt+${index + 1})`}
            onclick={() => pickMode(entry.id)}
          >{entry.label}</button>
        {/each}
      </nav>
    </div>
    <div class="pb-actions">
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip="Send to the audience from this window" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
      <OutputMenu />
      <button
        type="button"
        class="desk-btn live"
        class:on-air={displayLive}
        aria-label={displayLive ? "On air. Send Preview to Program" : "Go live: send Preview to Program"}
        data-tip={displayLive ? "On air: the audience sees Program" : programSet ? "Program is set, but the audience window is closed" : "Send Preview to Program"}
        onclick={() => session.take()}
      ><span class="pip"></span>{displayLive ? "ON AIR" : "LIVE"}</button>
      <button type="button" class="desk-btn danger" data-tip="Black program" onclick={() => session.black()}>BLACK</button>
      <button type="button" class="desk-btn ghost" data-tip="Clear program" onclick={() => session.clear()}>CLEAR</button>
    </div>
    <nav class="pb-tools" aria-label="Tools">
      <ToolMenu label="View" tip="Panels, monitors and focus">
        {#snippet trigger()}<Icon name="view" size={16} />{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitemcheckbox" aria-checked={libraryVisible} onclick={() => session.togglePanel(LIBRARY_PANEL)}>
            <Icon name="library" size={16} /> Library
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={queueVisible} onclick={() => session.togglePanel(QUEUE_PANEL)}>
            <Icon name="queue" size={16} /> Queue
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={focus} onclick={() => { session.savePew({ focus: !focus }); close(); }}>
            <Icon name="focus" size={16} /> Focus Preview and Program
          </button>
          <div class="menu-sep"></div>
          <p class="menu-label">On {mode === "scriptures" ? "Scripture" : mode === "songs" ? "Songs" : "Sermon"}</p>
          <button type="button" role="menuitemcheckbox" aria-checked={monitors.preview} onclick={() => session.setMonitors(mode, { preview: !monitors.preview })}>
            <Icon name="eye" size={16} /> Preview monitor
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={monitors.program} onclick={() => session.setMonitors(mode, { program: !monitors.program })}>
            <Icon name="cast" size={16} /> Program monitor
          </button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" onclick={() => { session.resetActiveLayout(); close(); }}>
            <Icon name="reset" size={16} /> Reset workspace
          </button>
        {/snippet}
      </ToolMenu>
      <button
        type="button"
        class="desk-btn icon alerts-btn"
        class:on={!!session.alert}
        aria-pressed={!!session.alert}
        data-tip={session.alert ? `Alert on Program: ${session.alert.text}` : "Alert on Program (nursery, car lights…)"}
        aria-label="Alerts"
        onclick={() => (alertsOpen = true)}
      >
        {@render icon("alerts")}
      </button>
      <button type="button" class="desk-btn icon" aria-label="Show me around" data-tip="Lost? Guided tours of every page" onclick={() => (session.tourHubOpen = true)}><Icon name="help" size={16} /></button>
      <ToolMenu label="More" tip="Displays, look, help and settings">
        {#snippet trigger()}<Icon name="more" size={16} />{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitem" onclick={() => { session.openSettings("displays"); close(); }}>{@render icon("outputs")} Displays…</button>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("themes"); close(); }}>{@render icon("themes")} Themes…</button>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("stage"); close(); }}>{@render icon("stage")} Message to the stage…</button>
          <button type="button" role="menuitem" onclick={() => { close(); session.startTour(mode); }}>{@render icon("help")} Tour this page</button>
          <button type="button" role="menuitem" onclick={() => { close(); session.tourHubOpen = true; }}>{@render icon("help")} All guided tours…</button>
          <button type="button" role="menuitem" onclick={() => { sheet = sheet === "help" ? null : "help"; close(); }}>{@render icon("help")} Help</button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("appearance"); close(); }}>{@render icon("settings")} Settings… <span class="menu-key">⌘,</span></button>
        {/snippet}
      </ToolMenu>
    </nav>
  </header>

  {#if mode === "service"}
    <ServiceDesk />
  {:else if mode === "sermon"}
    <SermonDesk {translationId} />
  {:else if mode === "songs"}
    <SongDesk />
  {:else}
    {#key epoch}
    <div class="pb-grid">
      {#if !libraryVisible && !focus}
        <button type="button" class="lib-rail" aria-label="Show library" title="Show library" onclick={() => session.togglePanel(LIBRARY_PANEL)}>
          <Icon name="library" size={16} />
          <span>{mode === "scriptures" ? "Scripture" : "Library"}</span>
        </button>
      {/if}
      <div class="pb-panes">
      <PaneGroup direction="horizontal" onLayoutChange={onColumns}>
        {#if showLibrary}
          <Pane defaultSize={frozen.columns[0]} minSize={18} order={1}>
            <div class="fill">
              <PaneGroup direction="vertical" onLayoutChange={onLibrarySplit}>
                <Pane defaultSize={frozen.librarySplit} minSize={20} order={1}>
                  <div class="pb-split">
          <section class="pb-panel">
            <header class="pb-head"><span>Live transcript</span></header>
            <div class="pb-body transcript">
              {#if session.voice.status !== "idle"}<VoiceStatus />{/if}
              {#if reading.length === 0}
                <p>{note || "Search a reference, or listen for a verse."}</p>
              {:else}
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              {/if}
            </div>
            <footer class="pb-foot">
              <button type="button" class="go" class:on={voiceActive} aria-pressed={voiceActive} onclick={toggleVoice}>
                {@render icon(voiceActive ? "mic-off" : "mic")}
                {session.voice.status === "starting" ? "Starting…" : voiceActive ? "Stop listening" : "Listen"}
              </button>
              <button type="button" class="go" onclick={() => void findInScripture()}>{@render icon("wave")} Find</button>
            </footer>
          </section>
          <section class="pb-panel">
            <header class="pb-head">
              <span>Recent detections</span>
              <button type="button" class="quiet" onclick={() => (detections = [])}><Icon name="close" size={14} /> Clear all</button>
            </header>
            <div class="pb-body detections">
              {#each detections as hit (`${hit.bookOrd}-${hit.chapter}-${hit.verse}`)}
                <button type="button" onclick={() => openHit(hit)}>
                  <strong>{hit.bookName} {hit.chapter}:{hit.verse}</strong>
                  <span>{hit.text}</span>
                </button>
              {/each}
            </div>
          </section>
        </div>
                </Pane>
                <PaneResizer />
                <Pane defaultSize={100 - frozen.librarySplit} minSize={24} order={2}>
        {#if mode === "scriptures"}
          <section class="pb-panel scriptures">
            <form class="script-bar" onsubmit={lookup}>
              <select
                value={translationId}
                aria-label="Translation"
                onchange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === "__more") {
                    event.currentTarget.value = translationId;
                    session.openSettings("bible");
                    return;
                  }
                  translationId = value;
                }}
              >
                {#if session.translations.length === 0}
                  <option value="kjv">KJV</option>
                {:else}
                  {#each session.translations as translation (translation.id)}
                    <option value={translation.id}>{translation.abbreviation}</option>
                  {/each}
                {/if}
                <option value="__more">More translations…</option>
              </select>
              {#if session.translations.length > 1}
                <select
                  class="parallel-pick"
                  class:on={!!session.workspace.parallelTranslationId}
                  value={session.workspace.parallelTranslationId ?? ""}
                  aria-label="Side-by-side translation"
                  title="Show a second translation beside the first"
                  onchange={(event) => void session.setParallelTranslation(event.currentTarget.value || null)}
                >
                  <option value="">One</option>
                  {#each session.translations.filter((entry) => entry.id !== translationId) as translation (translation.id)}
                    <option value={translation.id}>+ {translation.abbreviation}</option>
                  {/each}
                </select>
              {/if}
              <button type="button" class="mini" aria-label="Edit reference" onclick={() => document.querySelector<HTMLInputElement>('[aria-label="Bible search"]')?.select()}>{@render icon("book")}</button>
              <button type="button" class="mini" class:on={wrapVerses} aria-label="Verse layout" onclick={() => (wrapVerses = !wrapVerses)}>{@render icon("columns")}</button>
              <label class="bible-search">
                <Icon name="search" size={14} />
                <input bind:this={bibleInput} type="search" aria-label="Bible search" placeholder="John 3:16, or a book" bind:value={query} onkeydown={bibleKey} />
                {#if query}
                  <button type="button" class="clear" aria-label="Clear Bible search" onclick={() => { query = ""; bibleInput?.focus(); }}><Icon name="close" size={12} /></button>
                {:else}
                  <kbd aria-hidden="true">/</kbd>
                {/if}
              </label>
              <button type="button" class="mini" aria-label="Previous chapter" onclick={() => moveChapter(-1)}>{@render icon("chevron-left")}</button>
              <button type="button" class="mini" aria-label="Next chapter" onclick={() => moveChapter(1)}>{@render icon("chevron-right")}</button>
              <button type="button" class="mini" aria-label="Hide library" title="Hide library" onclick={() => session.togglePanel(LIBRARY_PANEL)}><Icon name="library" size={16} /></button>
            </form>
            {#if session.workspace.recent.length > 0}
              <div class="recent" aria-label="Recent passages">
                <span>Recent</span>
                {#each session.workspace.recent.slice(0, 6) as item (`${item.translationId}:${item.reference}`)}
                  <button type="button" class:on={passage()?.reference === item.reference} onclick={() => openRecent(item)}>{item.reference}</button>
                {/each}
              </div>
            {/if}
            {#if note}<p class="script-note">{note}</p>{/if}
            <div class="verse-list" class:wrap={wrapVerses}>
              {#each verses as verse (verse.verse)}
                <button
                  type="button"
                  class="verse"
                  class:picked={start !== null && verse.verse >= start && verse.verse <= (end ?? start)}
                  onclick={(event) => pick(verse.verse, event.shiftKey)}
                >
                  <span>{verse.verse}</span>
                  <span>{verse.text}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
                </Pane>
              </PaneGroup>
            </div>
          </Pane>
          <PaneResizer />
        {/if}
        <Pane defaultSize={!showRight ? (showLibrary ? frozen.columns[1] + frozen.columns[2] : 100) : showLibrary ? frozen.columns[1] : share(frozen.columns[1], frozen.columns[2])} minSize={showLibrary ? 24 : 32} order={2}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onStageSplit}>
              {#if showReading}
                <Pane defaultSize={showPreview ? frozen.stageSplit : 100} minSize={20} order={1}>
                  <section class="pb-panel">
                    <header class="pb-head"><span class="kicker plain">Scripture reading</span></header>
          <div class="pb-body display">
            {#if mode === "scriptures"}
              <article class="reading">
                <p class="reading-ref">{passage()?.reference ?? query}</p>
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              </article>
            {/if}
          </div>
        </section>
                </Pane>
                {#if showPreview}<PaneResizer />{/if}
              {/if}
              {#if showPreview}
              <Pane defaultSize={showReading ? 100 - frozen.stageSplit : 100} minSize={showReading ? 24 : 20} order={2}>
                <section class="pb-panel preview">
                  <header class="pb-head"><span class="kicker">Preview</span></header>
                  <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint="Nothing on Preview yet. Pick a verse, song or slide." /></div>
                </section>
              </Pane>
              {/if}
            </PaneGroup>
          </div>
        </Pane>
        {#if showRight}
        <PaneResizer />
        <Pane defaultSize={showLibrary ? frozen.columns[2] : share(frozen.columns[2], frozen.columns[1])} minSize={showLibrary ? 22 : 32} order={3}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onProgramSplit}>
              {#if showProgram}
              <Pane defaultSize={showQueue ? frozen.programSplit : 100} minSize={showQueue ? 28 : 20} order={1}>
                <section class="pb-panel output" class:on-air={displayLive}>
                  <header class="pb-head">
                    <span class="kicker program">{#if displayLive}<span class="pip on"></span>{/if}Program</span>
                    <button
                      type="button"
                      class="style-name"
                      data-tip="Font, color, and layout. Preview only until you press LIVE."
                      onclick={() => (sheet = sheet === "type" ? null : "type")}
                    >
                      {themeName} · {session.theme().layout === "lower-third" ? "Lower third" : "Frame"}
                    </button>
                  </header>
                  <div class="monitor main"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint="The audience sees nothing yet. Press LIVE (Space) to send Preview." /></div>
                  <TimerControls compact />
                  <VideoControls />
                  <footer class="output-tools">
                    <button type="button" class="lex" onclick={() => (sheet = sheet === "lexicon" ? null : "lexicon")}>{@render icon("book")} Lexicon</button>
                    <span class="steppers">
                      <button type="button" aria-label="Previous" onclick={() => void stepOutput(-1)}>{@render icon("chevron-left")}</button>
                      <button type="button" aria-label="Next" onclick={() => void stepOutput(1)}>{@render icon("chevron-right")}</button>
                    </span>
                  </footer>
                </section>
              </Pane>
              {/if}
              {#if showQueue}
                {#if showProgram}<PaneResizer />{/if}
                <Pane defaultSize={showProgram ? 100 - frozen.programSplit : 100} minSize={18} order={2}>
                  <section class="pb-panel">
                    <header class="pb-head">
                      <span>Queue</span>
                      <span class="queue-actions">
                        <button type="button" class="quiet" onclick={() => void queuePassage()}><Icon name="plus" size={14} /> Add</button>
                        <button type="button" class="quiet" onclick={() => session.clearQueue()}><Icon name="close" size={14} /> Clear all</button>
                      </span>
                    </header>
                    <div class="pb-body queue">
                      {#each queue as item (item.id)}
                        <button type="button" class:on={session.cursor.itemId === item.id} onclick={(event) => { event.currentTarget.blur(); open(item); }}>{item.title}</button>
                      {/each}
                    </div>
                  </section>
                </Pane>
              {/if}
            </PaneGroup>
          </div>
        </Pane>
        {/if}
      </PaneGroup>
      </div>
    </div>
    {/key}
  {/if}
  {#if sheet}
    <div class="sheet" role="dialog" aria-label={sheet}>
      <header>
        <strong>{sheet === "help" ? "How this desk works" : sheet === "type" ? "Theme" : "Lexicon"}</strong>
        <button type="button" aria-label="Close" onclick={() => (sheet = null)}><Icon name="close" size={16} /></button>
      </header>
      {#if sheet === "help"}
        <p>Click a verse to put it on Preview. Shift-click a second verse to select a range.</p>
        <p>LIVE copies Preview onto Program. BLACK and CLEAR change Program only.</p>
        <p>Search a reference such as John 3:16, or a phrase such as “in the beginning”.</p>
        <p>Listen matches spoken scripture on Preview. It never takes Program by itself.</p>
        <p>F focuses Preview and Program. [ hides the library. ] hides the queue. / searches. None of these change Program.</p>
      {:else if sheet === "type"}
        <OutputType />
      {:else}
        {#each reading as verse (verse.verse)}
          <p><sup>{verse.verse}</sup> {verse.text}</p>
        {/each}
        <p class="sheet-ref">{passage()?.reference ?? ""} · {translationId.toUpperCase()}</p>
      {/if}
    </div>
  {/if}
</div>

{#snippet icon(name: string)}
  <Icon {name} size={16} />
{/snippet}

{#if alertsOpen}
  <AlertsDialog onclose={() => (alertsOpen = false)} />
{/if}


<style>
  .alerts-btn.on { background: #c8102e; border-color: #c8102e; color: #fff; }
  .pb {
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 13px;
  }
  .pb-bar {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px 10px;
    padding: 6px calc(var(--panel-pad) + 2px);
    min-height: var(--chrome-h);
    flex: none;
    position: relative;
    z-index: 5;
  }
  /* Three groups: where you are (desk + mode), what goes out (output + LIVE/BLACK/CLEAR), and tools. */
  .pb-left { display: flex; align-items: center; gap: 10px; flex: none; }
  /* Segmented switch: never shrinks, so every mode stays visible; the tools give way instead. */
  .pb-modes {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-control) + 3px);
    background: var(--field);
  }
  .pb-modes button {
    border: 0;
    background: transparent;
    color: var(--muted);
    border-radius: var(--radius-control);
    padding: 5px 14px;
    font-weight: 560;
    font-size: 14px;
    flex: none;
  }
  .pb-modes button:hover:not(.on) { background: var(--desk); color: var(--ink); }
  .pb-modes button.on { background: var(--accent); color: white; }
  .pb-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    flex: none;
    min-width: 0;
    position: relative;
    z-index: 2;
    background: var(--desk);
  }
  .live { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 92px; letter-spacing: 0.08em; }
  .live.on-air { background: #ff1414; border-color: #ff1414; animation: live-glow 1.4s ease-in-out infinite; }
  .live.on-air .pip { animation: live-blink 1s steps(1, end) infinite; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: white; position: relative; display: inline-block; flex: none; }
  .pip.on::after, .live.on-air .pip::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    animation: live-ring 1.6s ease-out infinite;
  }
  .pip.on::after { animation-name: live-ring-red; }
  .kicker .pip { background: var(--live); margin-right: 6px; vertical-align: 1px; }
  @keyframes live-ring {
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(255, 255, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  }
  @keyframes live-ring-red {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--live) 75%, transparent); }
    70% { box-shadow: 0 0 0 8px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  @keyframes live-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 20, 20, 0.55), 0 0 10px 0 rgba(255, 20, 20, 0.35); }
    50% { box-shadow: 0 0 0 6px rgba(255, 20, 20, 0), 0 0 22px 4px rgba(255, 20, 20, 0.55); }
  }
  @keyframes live-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  @keyframes program-beam {
    0%, 100% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--live) 45%, transparent), 0 0 0 0 transparent; }
    50% { box-shadow: inset 0 0 0 2px var(--live), 0 0 18px 0 color-mix(in srgb, var(--live) 45%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .live.on-air, .pip.on::after, .live.on-air .pip::after, .live.on-air .pip, .pb-panel.output.on-air { animation: none; }
  }
  .pb-tools { display: flex; align-items: center; gap: 6px; margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--line); flex: none; }
  .pb-tools > button {
    width: var(--tool-size);
    height: var(--tool-size);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--field);
    color: var(--ink);
    display: grid;
    place-items: center;
    padding: 0;
  }
  .pb-tools > button:hover { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .pb-tools > button.on { color: var(--accent); border-color: var(--accent); }
  .pb button:active { opacity: 0.84; }
  .pb-grid {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    gap: 8px;
    padding: 0 var(--panel-pad) var(--panel-pad);
  }
  .pb-panes { flex: 1; min-width: 0; min-height: 0; }
  .lib-rail {
    flex: none;
    width: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
    background: var(--panel);
    color: var(--muted);
    font: inherit;
  }
  .lib-rail:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .lib-rail span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .bible-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--muted);
  }
  .bible-search:focus-within { border-color: var(--accent); color: var(--ink); }
  .script-bar .bible-search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; outline: none; }
  .bible-search input::-webkit-search-cancel-button { display: none; }
  .bible-search .clear { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 5px; background: var(--panel); color: var(--muted); }
  .bible-search kbd { padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; color: var(--muted); }
  .recent { display: flex; align-items: center; gap: 6px; padding: 0 8px 8px; overflow-x: auto; scrollbar-width: none; flex: none; }
  .recent span { font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); flex: none; }
  .recent button { flex: none; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink); font: inherit; font-size: 12px; white-space: nowrap; }
  .recent button:hover { background: var(--field); }
  .recent button.on { border-color: var(--accent); color: var(--accent); }
  .fill { height: 100%; min-width: 0; min-height: 0; }
  .pb-grid :global([data-pane-group]) { width: 100%; height: 100%; }
  .pb-grid :global([data-pane]) { min-width: 0; min-height: 0; overflow: hidden; }
  .pb-grid :global([data-pane-resizer]) {
    flex: 0 0 8px;
    position: relative;
    background: transparent;
  }
  .pb-grid :global([data-pane-resizer][data-direction="horizontal"]) { cursor: col-resize; }
  .pb-grid :global([data-pane-resizer][data-direction="vertical"]) { cursor: row-resize; }
  .pb-grid :global([data-pane-resizer]::after) {
    content: "";
    position: absolute;
    background: var(--line);
    border-radius: 2px;
  }
  .pb-grid :global([data-pane-resizer][data-direction="horizontal"]::after) {
    top: 10px;
    bottom: 10px;
    left: 3px;
    width: 2px;
  }
  .pb-grid :global([data-pane-resizer][data-direction="vertical"]::after) {
    left: 10px;
    right: 10px;
    top: 3px;
    height: 2px;
  }
  .pb-grid :global([data-pane-resizer]:hover::after),
  .pb-grid :global([data-pane-resizer][data-active]::after) { background: var(--accent); }
  .pb-split { height: 100%; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 4px; }
  .pb-panel {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  .pb-head, .pb-foot, .script-bar, .output-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-h);
    padding: 0 var(--panel-pad);
    color: var(--muted);
    font-size: 13px;
  }
  .pb-head { justify-content: space-between; }
  .pb-body { flex: 1; min-height: 0; }
  .quiet, .mini, .go, .lex {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
  }
  .quiet { display: inline-flex; align-items: center; gap: 4px; }
  .go { color: var(--presence); display: inline-flex; align-items: center; gap: 6px; font-weight: 560; }
  .go.on { color: var(--accent); }
  .pb-foot { justify-content: space-between; border-top: 1px solid var(--line); }
  .mini {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--muted);
    display: grid;
    place-items: center;
    flex: none;
  }
  .mini:hover, .lex:hover, .steppers button:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .mini.on { color: var(--accent); border-color: var(--accent); }
  .script-bar { padding: 8px; }
  select, .script-bar input {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
  }
  select { width: 88px; }
  .script-bar input { flex: 1; min-width: 0; }
  .script-bar .parallel-pick { width: 74px; flex: none; color: var(--muted); }
  .script-bar .parallel-pick.on { border-color: var(--accent); color: var(--accent); }
  .verse-list, .queue { overflow: auto; padding: 4px 8px 8px; display: flex; flex-direction: column; gap: 6px; }
  .verse, .queue button {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 8px;
    text-align: left;
  }
  .verse {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
    padding: 8px 10px;
  }
  .verse span:first-child { color: var(--accent); font-weight: 650; }
  .verse span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verse-list.wrap .verse span:last-child {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .script-note { margin: 0; padding: 0 12px 4px; color: var(--muted); font-size: 12px; }
  .transcript, .reading, .detections { overflow: auto; padding: var(--panel-pad); }
  .transcript p, .reading p { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
  .transcript sup, .reading sup, .sheet sup { color: var(--accent); font-size: 0.75em; margin-right: 4px; }
  .reading-ref, .sheet-ref { color: var(--mustard); font-size: 12px; letter-spacing: 0.04em; }
  .detections { display: flex; flex-direction: column; gap: 6px; }
  .detections button {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 8px;
    text-align: left;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .detections span { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .queue-actions { display: flex; gap: 8px; }
  .verse:hover:not(.picked), .queue button:hover:not(.on), .detections button:hover { border-color: color-mix(in srgb, var(--ink) 28%, var(--line)); }
  .verse.picked { border-color: var(--accent); }
  .display { padding: 12px; }
  .monitor {
    flex: 1;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
    padding: 8px 12px 12px;
  }
  .monitor :global(.ratio) {
    width: min(100cqw, calc(100cqh * var(--aspect, 1.7778)));
    max-height: 100cqh;
    border-radius: 10px;
    overflow: hidden;
    background: #050505;
  }
  .kicker { font-size: 11px; font-weight: 650; letter-spacing: 0.14em; text-transform: uppercase; }
  .kicker.plain { font-size: 12px; letter-spacing: 0; text-transform: none; }
  .kicker.program { color: var(--live); }
  .pb-panel.preview { border-style: dashed; }
  .pb-panel.output { border-color: color-mix(in srgb, var(--live) 40%, var(--line)); }
  .pb-panel.output.on-air { border-color: var(--live); animation: program-beam 1.8s ease-in-out infinite; }
  .style-name {
    margin-left: auto;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 10px;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  .output-tools { justify-content: space-between; padding-bottom: 10px; flex: none; position: relative; z-index: 1; }
  .lex, .steppers button {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
  }
  .steppers { display: flex; gap: 6px; }
  .steppers button { width: 32px; padding: 0; justify-content: center; }
  .queue button { padding: 8px 10px; }
  .queue button.on { border-color: var(--accent); }
  .sheet {
    position: absolute;
    right: 16px;
    top: 64px;
    width: min(380px, calc(100% - 32px));
    max-height: calc(100% - 80px);
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 14px;
    z-index: 5;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  }
  .sheet header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .sheet header button { border: 0; background: transparent; color: var(--accent); }
  .sheet p { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
  .pb { position: relative; }
</style>
