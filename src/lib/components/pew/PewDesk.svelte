<script lang="ts">
  import GoneLiveList from "./GoneLiveList.svelte";
  import ScriptureFinder from "./ScriptureFinder.svelte";
  import { quickRead } from "../../bible/quick";
  import AudioDialog from "../AudioDialog.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import AlertsDialog from "../AlertsDialog.svelte";
  import MacrosDialog from "../MacrosDialog.svelte";
  import SwitcherMenu from "../SwitcherMenu.svelte";
  import BroadcastMenu from "../BroadcastMenu.svelte";
  import OverlaysDialog from "../OverlaysDialog.svelte";
  import GoLive from "./GoLive.svelte";
  import ServiceStrip from "./ServiceStrip.svelte";
  import TimerControls from "../TimerControls.svelte";
  import { findItem } from "../../domain/service";
  import { inPassages, preferService, serviceFirst, servicePassages } from "../../domain/service-first";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import { session } from "../../app/session.svelte";
  import { screenLetter, showsOn } from "../../display/screens";
  import type { PlanFeature } from "../../domain/plans";
  import { defaultShortcuts, shortcutLabel } from "../../keyboard/manager";
  import { stepVerse } from "../../bible/passage";
  import { formatReference, parseReference } from "../../bible/reference";
  import { soundsLikeScripture } from "../../ai/verses";
  import { api } from "../../db/api";
  import type { BibleItem, PewPanel, PresentationItem, SearchHit, Sermon, SermonSection, TextStyle, VerseText } from "../../domain/types";
  import { untrack } from "svelte";
  import { fitBar } from "../../ui/fit-bar";
  import { canUse } from "../../platform/capabilities";
  import { bundledQuoteCatalog } from "../../bible/texts";
  import { isOnlineTranslation, WORDS_TRANSLATION } from "../../bible/online-bibles";
  import { buildQuoteIndex, chooseHeard, detectVerse, searchQuotes, type QuoteIndex } from "../../voice/detect";
  import DeskSwitcher from "../DeskSwitcher.svelte";
  import Icon from "../Icon.svelte";
  import FavoriteStar from "../FavoriteStar.svelte";
  import SongDesk from "./SongDesk.svelte";
  import VideoControls from "../VideoControls.svelte";
  import DocumentControls from "../DocumentControls.svelte";
  import ServiceDesk from "./ServiceDesk.svelte";
  import SermonDesk from "./SermonDesk.svelte";
  import OutputMenu from "../OutputMenu.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import OutputType from "../OutputType.svelte";
  import Screen from "../Screen.svelte";
  import { Pane, PaneGroup, PaneResizer } from "paneforge";
  import { LIBRARY_PANEL, QUEUE_PANEL, defaultSlots, mergeColumns, mergeSplit, panelOpen, swapPanels } from "../../workspace/pew";
  import { t } from "../../i18n/core";
  import { keys } from "../../platform/os";

  type Mode = "scriptures" | "songs" | "sermon" | "service";
  let mode = $state<Mode>("scriptures");
  // The translation the page was last on (kept with the workspace).
  let translationId = $state(untrack(() => session.workspace.deskTranslationId ?? "kjv"));
  let bookOrd = $state(1);
  let chapter = $state(1);
  let verses = $state<VerseText[]>([]);
  let start = $state<number | null>(1);
  let end = $state<number | null>(1);
  let anchor = $state<number | null>(1);
  let query = $state("Genesis 1");
  let detections = $state<SearchHit[]>([]);
  const undoKey = keys("⌘Z");
  /** The key for a desk action, as set in Settings › Keyboard. */
  const keyOf = (action: "take" | "black" | "clear" | "clear-words") => shortcutLabel(session.workspace.shortcuts ?? defaultShortcuts, action);
  /** The queue's Clear all was pressed once. */
  let clearArmed = $state(false);
  // The transcript follows the newest words as they are heard.
  let transcriptEl = $state<HTMLDivElement | undefined>();
  $effect(() => {
    void session.captions.lines.length;
    void session.captions.interim;
    const node = transcriptEl;
    if (node) requestAnimationFrame(() => (node.scrollTop = node.scrollHeight));
  });

  // Scriptures that have gone live: kept in order, one click sends one straight back to Program.
  let sideTab = $state<"live" | "detections">("live");
  let goneWide = $state(false);
  const goneCount = $derived(session.workspace.goneLive.filter((entry) => !entry.removed).length);
  const pinnedCount = $derived(session.workspace.goneLive.filter((entry) => entry.pinned && !entry.removed).length);
  // A new detection shows its tab; the operator can switch back.
  let seenDetections = 0;
  $effect(() => {
    const count = detections.length;
    if (count > seenDetections) sideTab = "detections";
    seenDetections = count;
  });
  let note = $state(t("Loading scripture…"));
  let sheet = $state<"help" | "versions" | "type" | null>(null);

  // Versions: the verse on Program in every installed Bible, side by side. Choosing one shows it on
  // the screen in that version at once (the same passage, so nothing else changes).
  let versions = $state<Array<{ id: string; name: string; abbreviation: string; text: string }>>([]);
  let versionsFor = $state("");
  const programReference = $derived(session.live.program.model.layout === "scripture" ? (session.live.program.model.reference ?? "") : "");
  const programVersion = $derived(session.live.program.model.attribution ?? "");
  $effect(() => {
    if (sheet !== "versions") return;
    const reference = programReference;
    if (!reference || reference === versionsFor) return;
    const parsed = parseReference(reference);
    if (!parsed?.startVerse) {
      versions = [];
      return;
    }
    versionsFor = reference;
    void Promise.all(
      session.translations.map(async (entry) => {
        const verses = await api.passage(entry.id, parsed.bookOrd, parsed.chapter, parsed.startVerse!, parsed.endVerse ?? parsed.startVerse!).catch(() => []);
        return { id: entry.id, name: entry.name, abbreviation: entry.abbreviation, text: verses.map((verse) => verse.text).join(" ") };
      }),
    ).then((list) => {
      if (versionsFor === reference) versions = list.filter((entry) => entry.text.trim());
    });
  });
  let wrapVerses = $state(false);
  let chapterToken = 0;
  let seededChapterPreview = false;
  let takeAfterPreview = false;
  let quoteIndex: QuoteIndex | null = null;
  let lastSpokenRef = "";

  // The open service's passages are looked at first, by listening and by word search.
  const passagesInService = $derived(servicePassages(session.service));
  let serviceQuotes: { from: QuoteIndex; key: string; index: QuoteIndex } | null = null;
  function serviceQuoteIndex(): QuoteIndex | null {
    const passages = passagesInService;
    if (!quoteIndex || passages.length === 0) return null;
    const key = passages.map((p) => `${p.bookOrd}:${p.chapter}:${p.startVerse}-${p.endVerse}`).join(",");
    if (serviceQuotes?.from !== quoteIndex || serviceQuotes.key !== key) {
      const rows = quoteIndex.catalog.filter((row) => inPassages(passages, row.bookOrd, row.chapter, row.verse));
      serviceQuotes = { from: quoteIndex, key, index: buildQuoteIndex(rows) };
    }
    return serviceQuotes.index;
  }

  const book = $derived(session.books.find((entry) => entry.ord === bookOrd) ?? session.books[0]);
  const themeName = $derived(session.theme().name.toUpperCase());
  /** Program is showing something: the desk is on air (the audience sees it once output is open). */
  /** Program has something on it. */
  const programSet = $derived(session.live.program.model.layout !== "black" && session.live.program.model.layout !== "empty");
  /** On air only when the audience can actually see Program. */
  /**
   * With extra screens: where LIVE will show what is on Preview ("Main auditorium (HISENSE), Scripture
   * Monitor"), so no one has to guess which screen a verse or a song reaches.
   */
  const liveShowsOn = $derived.by(() => {
    if (!(session.workspace.screens ?? []).length || session.live.preview.model.layout === "empty") return "";
    const now = session.screensForNow();
    const places = session.screenPlaces();
    const reach = new Set(showsOn(now, session.live.preview.model));
    const main = session.output.displays.find((display) => display.audience);
    const names = session.output.online ? [main ? session.monitorName(main) : t("Main screen")] : [];
    now.forEach((screen, index) => {
      const place = places.get(screen.id);
      if (!reach.has(screen.id)) return;
      if (place?.state === "showing") names.push(screen.name || session.monitorName(place.display) || t("Screen {name}", { name: screenLetter(index) }));
      else if (place?.state === "wifi") names.push(screen.name || t("TV over Wi-Fi"));
    });
    return names.join(", ");
  });
  const displayLive = $derived(programSet && !session.programHeld && session.output.online);
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
  // The "On the screen" menu: what sits over the live picture right now.
  const overlaysOn = $derived(session.workspace.overlays.filter((overlay) => overlay.on).length);
  const onScreenCount = $derived((session.alert ? 1 : 0) + (session.captionsOn ? 1 : 0) + overlaysOn);
  const onScreenTip = $derived(onScreenCount ? t("On the screen now: alerts, captions, overlays ({n})", { n: onScreenCount }) : t("Alerts, live captions, overlays and stage messages"));
  const showPreview = $derived(focus || session.workspace.pew.monitors.scriptures.preview);
  const showProgram = $derived(focus || session.workspace.pew.monitors.scriptures.program);
  const showRight = $derived(showProgram || showQueue);

  // Panels can be dragged onto each other on the scripture page: each place shows the panel
  // assigned to it (saved with the desk). Focus mode always uses the starting places, so Preview
  // and Program stay where focus expects them.
  const slots = $derived<Record<PewPanel, PewPanel>>(focus ? defaultSlots() : (session.workspace.pew.slots ?? defaultSlots()));
  /** Whether a panel shows (the View menu's switches follow the panel, wherever it sits). */
  const panelShown = (panel: PewPanel) => (panel === "reading" ? showReading : panel === "preview" ? showPreview : panel === "program" ? showProgram : panel === "queue" ? showQueue : true);
  const placeReading = $derived(panelShown(slots.reading));
  const placePreview = $derived(panelShown(slots.preview));
  const placeProgram = $derived(panelShown(slots.program));
  const placeQueue = $derived(panelShown(slots.queue));
  const placeRight = $derived(placeProgram || placeQueue);
  const movedPanels = $derived(!!session.workspace.pew.slots);
  let dragging = $state<PewPanel | null>(null);
  let dropPlace = $state<PewPanel | null>(null);

  function dragPanel(event: DragEvent, panel: PewPanel) {
    // Only a drag that starts on the title bar itself (not one of its buttons or tabs) moves the panel.
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (focus || (target && target.closest("button, input, select, a") && !target.matches("header"))) {
      event.preventDefault();
      return;
    }
    dragging = panel;
    event.dataTransfer?.setData("application/x-church-panel", panel);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
  function overPlace(event: DragEvent, place: PewPanel) {
    if (!dragging) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dropPlace = place;
  }
  function dropOnPlace(event: DragEvent, place: PewPanel) {
    if (!dragging) return;
    event.preventDefault();
    const target = slots[place];
    if (target !== dragging) session.savePew({ slots: swapPanels(session.workspace.pew.slots, dragging, target) });
    endPanelDrag();
  }
  function endPanelDrag() {
    dragging = null;
    dropPlace = null;
  }
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
  // Once the workspace and translations have loaded, go back to the translation used last; only
  // after that are changes saved (so the starting KJV never overwrites it).
  let translationRestored = false;
  $effect(() => {
    const first = session.translations[0];
    if (!first || !session.booted) return;
    const has = (id: string | null | undefined) => !!id && session.translations.some((entry) => entry.id === id);
    if (!translationRestored) {
      translationRestored = true;
      const saved = session.workspace.deskTranslationId;
      if (has(saved) && saved !== translationId) {
        translationId = saved!;
        return;
      }
    }
    if (!has(translationId)) {
      translationId = first.id;
      return;
    }
    session.setDeskTranslation(translationId);
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
    note = t("Loading scripture…");
    void api
      .verses(id, ord, ch)
      .then((rows) => {
        if (token !== chapterToken) return;
        verses = rows;
        const from = start ?? 1;
        const to = end ?? from;
        note = rows.length ? "" : t("This chapter has no verses.");
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
        note = t("Scripture could not be loaded.");
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
    // Short ways first: "jn316", "ps23", "16" or "3:16" in the chapter open now.
    const quick = quickRead(query, { bookOrd, chapter }, session.books).refs[0];
    if (quick) {
      bookOrd = quick.bookOrd;
      chapter = quick.chapter;
      anchor = quick.startVerse ?? 1;
      await showPassage(quick.startVerse ?? 1, quick.endVerse ?? quick.startVerse ?? 1);
      detections = [];
      return;
    }
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

  /** Verses with these words: exact wording first, then most of the words (spelling slips allowed). */
  async function searchWords(text: string, translation = translationId): Promise<SearchHit[]> {
    const exact = await api.search(translation, text);
    // The spelling-forgiving index is built for the desk's translation only.
    const ranked = quoteIndex && translation === translationId ? searchQuotes(text, quoteIndex, 40) : [];
    const key = (hit: SearchHit) => `${hit.bookOrd}:${hit.chapter}:${hit.verse}`;
    const exactKeys = new Set(exact.map(key));
    const rankedKeys = new Set(ranked.map(key));
    const merged = [
      ...ranked.filter((hit) => exactKeys.has(key(hit))),
      ...exact.filter((hit) => !rankedKeys.has(key(hit))),
      ...ranked.filter((hit) => !exactKeys.has(key(hit))),
    ];
    return serviceFirst(merged, (hit) => inPassages(passagesInService, hit.bookOrd, hit.chapter, hit.verse)).slice(0, 40);
  }

  async function findPhrase(text: string) {
    const hits = await searchWords(text);
    detections = hits;
    note = hits.length ? `${hits.length} matches for “${text.trim()}”.` : `No matches for “${text.trim()}”.`;
    const first = hits[0];
    if (first) openHit(first);
  }

  // The Find a verse window: short patterns, books, a chapter's verses and words, with a preview.
  let finderOpen = $state(false);
  let finderInitial = $state("");

  function openFound(item: BibleItem, live: boolean) {
    finderOpen = false;
    takeAfterPreview = live;
    openRecent(item);
    detections = [];
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
      finderInitial = "";
      finderOpen = true;
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
    if (!session.service) await session.createService(t("Sunday Service"));
    if (!session.service?.sections.length) session.addSection(sectionName);
  }

  async function queuePassage() {
    if (!session.requireFeature("service")) return;
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
    { id: "scriptures", label: t("Scriptures") },
    { id: "songs", label: t("Songs") },
    ...(canUse("sermon") ? [{ id: "sermon" as const, label: t("Sermon") }] : []),
    { id: "service", label: t("Service") },
  ]);

  // A tour started from the hub can ask for another page.
  $effect(() => {
    const page = session.pageRequest;
    if (!page) return;
    untrack(() => pickMode(page));
    session.pageRequest = null;
  });

  /** Scroll the verse list to the picked verses once the chapter has loaded (a reading opened here). */
  let revealPicked = $state(false);
  $effect(() => {
    if (!revealPicked || verses.length === 0 || mode !== "scriptures") return;
    const first = start;
    if (first === null || !verses.some((verse) => verse.verse === first)) return;
    revealPicked = false;
    requestAnimationFrame(() => document.querySelector(".verse-list .verse.picked")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  });

  // A reading from the running order opened here: its book and chapter, its verses picked out, and
  // its first screen on Preview (then the verse list, search and arrows work as always).
  $effect(() => {
    const wanted = session.passageRequest;
    if (!wanted) return;
    untrack(() => {
      session.passageRequest = null;
      if (session.translations.some((entry) => entry.id === wanted.translationId)) translationId = wanted.translationId;
      bookOrd = wanted.bookOrd;
      chapter = wanted.chapter;
      anchor = wanted.startVerse;
      revealPicked = true;
      const per = session.perScreenOf(wanted);
      void showPassage(wanted.startVerse, per ? Math.min(wanted.endVerse, wanted.startVerse + per - 1) : wanted.endVerse);
    });
  });

  /** Change page; each page keeps its own Preview (Program stays as it is). */
  /** Pages past Scripture are Premium: the tab shows a tag, and opens the upgrade prompt instead. */
  const PAGE_FEATURE: Partial<Record<Mode, PlanFeature>> = { songs: "songs", sermon: "sermon", service: "service" };

  function setMode(next: Mode): boolean {
    const needs = PAGE_FEATURE[next];
    if (needs && !session.requireFeature(needs)) return true;
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
  function detectSpokenVerse(text: string, final: boolean, alternatives: string[]) {
    // While songs are up, lyrics that quote scripture must not pull a verse onto Preview.
    if (!text || mode === "songs") return;
    const phrases = alternatives.length ? alternatives : [text];
    const inService = serviceQuoteIndex();
    const own = inService && inService.catalog.length ? chooseHeard(phrases, inService, translationId) : null;
    const quoted = quoteIndex ? preferService(own, chooseHeard(phrases, quoteIndex, translationId)) : null;
    const openChapter = !quoted && book ? detectVerse(text, verses, book, chapter, translationId) : null;
    const match = quoted ?? (openChapter ? { item: openChapter, text } : null);
    if (!match) {
      if (!lastSpokenRef) session.voice.message = quoteIndex ? t("Hearing you. Keep reading the verse.") : t("Loading the Bible so a verse can be found…");
      if (final) askAiForVerse(text);
      return;
    }
    takeHeard(match.item, match.text);
  }

  /** The last finished phrases, so the AI hears a whole thought rather than a fragment. */
  let heardLately: string[] = [];
  /** Counts verses taken from speech, so a late AI answer can tell something newer came first. */
  let takenCount = 0;

  /** Nothing matched: if it sounds like scripture, ask the church's AI (when switched on). */
  function askAiForVerse(text: string) {
    heardLately = [...heardLately, text].slice(-3);
    const heard = heardLately.join(" ");
    if (!session.aiOn("verses") || !soundsLikeScripture(heard)) return;
    const takenBefore = takenCount;
    void session.versesFromSpeech(heard).then((found) => {
      if (mode === "songs") return;
      // A verse heard while the AI was thinking is newer: the AI's answer only waits under Detections.
      const overtaken = takenCount !== takenBefore;
      const items = found.flatMap((entry) => {
        const parsed = parseReference(entry.reference, session.books);
        const named = parsed && session.books.find((candidate) => candidate.ord === parsed.bookOrd);
        if (!parsed?.startVerse || !named) return [];
        const end = parsed.endVerse ?? parsed.startVerse;
        const item: BibleItem = { translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: parsed.startVerse, endVerse: end, reference: formatReference(named.name, parsed.chapter, parsed.startVerse, end, named.chapters) };
        return [{ item, sure: entry.sure }];
      });
      if (!found.length) return;
      heardLately = [];
      const [first, ...rest] = items;
      // Others the AI named wait under Detections, for the operator to choose.
      for (const other of [...rest].reverse()) noteHeard(other.item, heard, true);
      if (first?.sure && !overtaken) takeHeard(first.item, heard, true);
      else if (first) {
        noteHeard(first.item, heard, true);
        session.voice.message = t("The AI thinks {reference} was meant. It is under Detections.", { reference: first.item.reference });
      }
    });
  }

  /** A verse heard (or named by the AI) goes to the top of Detections. */
  function noteHeard(hit: BibleItem, text: string, ai = false) {
    const named = session.books.find((entry) => entry.ord === hit.bookOrd)?.name ?? hit.reference;
    // A verse heard again moves to the top instead of being listed twice (a repeated key stops the
    // list from drawing).
    const again = (entry: SearchHit) => entry.bookOrd === hit.bookOrd && entry.chapter === hit.chapter && entry.verse === hit.startVerse;
    detections = [
      { bookOrd: hit.bookOrd, bookName: named, chapter: hit.chapter, verse: hit.startVerse, text, ...(ai ? { ai: true } : {}) },
      ...detections.filter((entry) => !again(entry)),
    ].slice(0, 12);
  }

  /** A verse heard: listed, and staged on Preview (or offered beside it on the Service page). */
  function takeHeard(hit: BibleItem, text: string, ai = false) {
    if (hit.reference === lastSpokenRef) return;
    lastSpokenRef = hit.reference;
    takenCount++;
    // What was said before this verse is about something else now.
    heardLately = [];
    if (hit.bookOrd !== bookOrd || hit.chapter !== chapter) {
      bookOrd = hit.bookOrd;
      chapter = hit.chapter;
    }
    anchor = hit.startVerse;
    session.voice.message = ai ? t("{reference} (found by the AI) is on Preview. LIVE still sends Program.", { reference: hit.reference }) : `${hit.reference} is on Preview. LIVE still sends Program.`;
    noteHeard(hit, text, ai);
    // A pending arrow-key Take must never carry a spoken verse to Program.
    takeAfterPreview = false;
    // On the Service page the running order keeps Preview: the verse heard is offered beside it.
    if (mode === "service") {
      session.offerHeardVerse({ ...hit, translationId: hit.translationId || translationId });
      session.voice.message = `${hit.reference} heard. It waits beside Preview.`;
      return;
    }
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
  let overlaysOpen = $state(false);
</script>

<svelte:window onkeydown={onModeKey} />

<div class="pb" class:focus>
  <header class="pb-bar" use:fitBar>
    <div class="pb-left">
      <DeskSwitcher compact />
      <nav class="pb-modes" aria-label={t("Library")}>
        {#each modes as entry, index (entry.id)}
          <button
            type="button"
            class:on={mode === entry.id}
            aria-pressed={mode === entry.id}
            aria-keyshortcuts={`Alt+${index + 1}`}
            data-tip={t("{label} (Alt+{index})", { label: entry.label, index: index + 1 })}
            onclick={() => pickMode(entry.id)}
          >{entry.label}{#if PAGE_FEATURE[entry.id] && !session.entitled(PAGE_FEATURE[entry.id]!)}<em class="lock">{t("Premium")}</em>{/if}</button>
        {/each}
      </nav>
    </div>
    <div class="pb-actions">
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip={t("Send to the audience from this window")} onclick={() => session.claimAudience()}>{t("Take control")}</button>
      {/if}
      <OutputMenu />
      {#if session.liveOnClick}
        <!-- Auto LIVE: while the service runs a click or an arrow goes straight to the audience. Said
             beside LIVE, and one click puts Preview first again. -->
        <button type="button" class="desk-btn auto-live" data-tip={t("Auto LIVE is on: a click or an arrow goes straight to the audience. Click for Preview first.")} onclick={() => session.setLiveOnClick(false)}>{t("Auto LIVE")}</button>
      {/if}
      <button
        type="button"
        class="desk-btn live"
        class:on-air={displayLive}
        aria-label={displayLive ? t("On air. Send Preview to Program") : t("Go live: send Preview to Program")}
        data-tip={`${displayLive ? t("On air: the audience sees Program") : programSet ? t("Program is set, but the audience window is closed") : t("Send Preview to Program")} (${keyOf("take")})`}
        onclick={() => session.take()}
      ><span class="pip"></span>{t("LIVE")}</button>
      <!-- BLACK always shows: it is the button for when the wrong thing is up. CLEAR shows too;
           hovering (or tabbing to) it slides out CLEAR WORDS. Every key works whether or not it shows. -->
      <button type="button" class="desk-btn danger" data-tip={`${t("Black program")} (${keyOf("black")})`} onclick={() => session.black()}>{t("BLACK")}</button>
      <span class="clears" role="group" aria-label={t("Clear")}>
        <span class="clears-more">
          <span class="clears-row">
            <button type="button" class="desk-btn ghost" data-tip={`${t("Clear the words; the background, camera or video stays")} (${keyOf("clear-words")})`} aria-label={t("Clear words")} onclick={() => void session.clearWords()}>{t("CLEAR WORDS")}</button>
          </span>
        </span>
        <button type="button" class="desk-btn ghost clears-main" data-tip={`${t("Clear everything back to the theme")} (${keyOf("clear")})`} onclick={() => session.clear()}>{t("CLEAR")}</button>
      </span>
      {#if session.canUndoProgram}
        <!-- The wrong thing went up: put back what the audience saw before, without the keyboard. -->
        <button type="button" class="desk-btn ghost" data-tip={`${t("Put back what the audience saw before")} (⌘Z)`} onclick={() => void session.undoProgram()}>{t("Undo")}</button>
      {/if}
    </div>
    <nav class="pb-tools" aria-label={t("Tools")}>
      <button type="button" class="desk-btn icon" aria-label={t("Go to anything")} data-tip={keys(t("Go to a page, song, verse, part or setting (⌘K)"))} onclick={() => (session.commandOpen = true)}><Icon name="search" size={16} /></button>
      <ToolMenu label={t("View")} tip={t("Panels, monitors and focus")} tour="view">
        {#snippet trigger()}<Icon name="view" size={16} />{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitemcheckbox" aria-checked={libraryVisible} onclick={() => session.togglePanel(LIBRARY_PANEL)}>
            <Icon name="library" size={16} /> {t("Library")}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={queueVisible} onclick={() => session.togglePanel(QUEUE_PANEL)}>
            <Icon name="queue" size={16} /> {t("Queue")}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={focus} onclick={() => { session.savePew({ focus: !focus }); close(); }}>
            <Icon name="focus" size={16} /> {t("Focus Preview and Program")}
          </button>
          <div class="menu-sep"></div>
          <p class="menu-label">{mode === "scriptures" ? t("On Scripture") : mode === "songs" ? t("On Songs") : t("On Sermon")}</p>
          <button type="button" role="menuitemcheckbox" aria-checked={monitors.preview} onclick={() => session.setMonitors(mode, { preview: !monitors.preview })}>
            <Icon name="eye" size={16} /> {t("Preview monitor")}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={monitors.program} onclick={() => session.setMonitors(mode, { program: !monitors.program })}>
            <Icon name="cast" size={16} /> {t("Program monitor")}
          </button>
          <div class="menu-sep"></div>
          {#if movedPanels}
            <button type="button" role="menuitem" onclick={() => { session.savePew({ slots: undefined }); close(); }}>
              <Icon name="layout" size={16} /> {t("Put panels back")}
            </button>
          {/if}
          <button type="button" role="menuitem" onclick={() => { session.resetActiveLayout(); close(); }}>
            <Icon name="reset" size={16} /> {t("Reset workspace")}
          </button>
        {/snippet}
      </ToolMenu>
      {#if session.audio.current && (session.audio.playing || session.audio.fading)}
        <span class="now-audio">
          <button type="button" class="now-audio-name" aria-label={t("Audio: {name}", { name: session.audio.current.name })} data-tip={t("Audio: playlists and the player")} onclick={() => session.openAudio()}><Icon name="audio" size={13} /><span class="chip-name">{session.audio.current.name.replace(/\.[a-z0-9]+$/i, "")}</span></button>
          <button type="button" class="now-audio-btn" aria-label={t("Pause the music")} data-tip={t("Pause")} onclick={() => void session.audio.toggle()}><Icon name="square" size={12} /></button>
        </span>
      {:else}
        <button type="button" class="desk-btn icon" aria-label={t("Audio")} data-tip={t("Audio: walk-in music, backing tracks, playlists")} onclick={() => session.openAudio()}><Icon name="audio" size={16} /></button>
      {/if}
      <BroadcastMenu />
      <SwitcherMenu />
      <ToolMenu label={t("On the screen")} tip={onScreenTip} on={onScreenCount > 0}>
        {#snippet trigger()}<Icon name="layers" size={16} />{#if onScreenCount}<span class="tool-dot">{onScreenCount}</span>{/if}{/snippet}
        {#snippet children(close)}
          <p class="menu-label">{t("Over what is live")}</p>
          <button type="button" role="menuitem" onclick={() => { alertsOpen = true; close(); }}>{@render icon("alerts")} {t("Alert…")}{#if session.alert}<span class="menu-state on">{t("On")}</span>{/if}</button>
          <button type="button" role="menuitemcheckbox" aria-checked={session.captionsOn} onclick={() => { void session.setCaptions(!session.captionsOn); close(); }}>{@render icon("captions")} {t("Live captions")}</button>
          <button type="button" role="menuitem" onclick={() => { overlaysOpen = true; close(); }}>{@render icon("layers")} {t("Overlays…")}{#if overlaysOn}<span class="menu-state on">{overlaysOn}</span>{/if}</button>
          <div class="menu-sep"></div>
          <p class="menu-label">{t("For the people on stage")}</p>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("stage"); close(); }}>{@render icon("stage")} {t("Message to the stage…")}</button>
        {/snippet}
      </ToolMenu>
      <ToolMenu label={t("More")} tip={t("Displays, look, help and settings")} tour="more">
        {#snippet trigger()}<Icon name="more" size={16} />{/snippet}
        {#snippet children(close)}
          <p class="menu-label">{t("Screens and look")}</p>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("displays"); close(); }}>{@render icon("outputs")} {t("Displays…")}</button>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("themes"); close(); }}>{@render icon("themes")} {t("Themes…")}</button>
          <div class="menu-sep"></div>
          <p class="menu-label">{t("Service")}</p>
          <button type="button" role="menuitem" onclick={() => { session.macrosOpen = true; close(); }}>{@render icon("play")} {t("Macros…")}</button>
          <div class="menu-sep"></div>
          <p class="menu-label">{t("Help")}</p>
          <button type="button" role="menuitem" data-tour="tours" onclick={() => { close(); session.tourHubOpen = true; }}>{@render icon("help")} {t("Guided tours…")}</button>
          <button type="button" role="menuitem" onclick={() => { close(); session.startTour(mode); }}>{@render icon("help")} {t("Tour this page")}</button>
          <button type="button" role="menuitem" onclick={() => { sheet = sheet === "help" ? null : "help"; close(); }}>{@render icon("help")} {t("How this desk works")}</button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("ready"); close(); }}>{@render icon("check")} {t("Readiness check…")}</button>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("appearance"); close(); }}>{@render icon("settings")} {t("Settings…")} <span class="menu-key">{keys("⌘,")}</span></button>
        {/snippet}
      </ToolMenu>
    </nav>
  </header>

  {#if mode !== "service" && session.service && (session.serviceRunning || session.presenterPartId)}<ServiceStrip />{/if}
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
        <button type="button" class="lib-rail" aria-label={t("Show library")} title={t("Show library")} onclick={() => session.togglePanel(LIBRARY_PANEL)}>
          <Icon name="library" size={16} />
          <span>{mode === "scriptures" ? t("Scripture") : t("Library")}</span>
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
{@render place("transcript")}
{@render place("lists")}
        </div>
                </Pane>
                <PaneResizer />
                <Pane defaultSize={100 - frozen.librarySplit} minSize={24} order={2}>
{@render place("scriptures")}
                </Pane>
              </PaneGroup>
            </div>
          </Pane>
          <PaneResizer />
        {/if}
        <Pane defaultSize={!placeRight ? (showLibrary ? frozen.columns[1] + frozen.columns[2] : 100) : showLibrary ? frozen.columns[1] : share(frozen.columns[1], frozen.columns[2])} minSize={showLibrary ? 24 : 32} order={2}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onStageSplit}>
              {#if placeReading}
                <Pane defaultSize={placePreview ? frozen.stageSplit : 100} minSize={20} order={1}>
{@render place("reading")}
                </Pane>
                {#if placePreview}<PaneResizer />{/if}
              {/if}
              {#if placePreview}
              <Pane defaultSize={placeReading ? 100 - frozen.stageSplit : 100} minSize={placeReading ? 24 : 20} order={2}>
{@render place("preview")}
              </Pane>
              {/if}
            </PaneGroup>
          </div>
        </Pane>
        {#if placeRight}
        <PaneResizer />
        <Pane defaultSize={showLibrary ? frozen.columns[2] : share(frozen.columns[2], frozen.columns[1])} minSize={showLibrary ? 22 : 32} order={3}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onProgramSplit}>
              {#if placeProgram}
              <Pane defaultSize={placeQueue ? frozen.programSplit : 100} minSize={placeQueue ? 28 : 20} order={1}>
{@render place("program")}
              </Pane>
              {/if}
              {#if placeQueue}
                {#if placeProgram}<PaneResizer />{/if}
                <Pane defaultSize={placeProgram ? 100 - frozen.programSplit : 100} minSize={18} order={2}>
{@render place("queue")}
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
        <strong>{sheet === "help" ? t("How this desk works") : sheet === "type" ? t("Theme") : t("Versions")}</strong>
        <button type="button" aria-label={t("Close")} onclick={() => (sheet = null)}><Icon name="close" size={16} /></button>
      </header>
      {#if sheet === "help"}
        <p>{t("Click a verse to put it on Preview. Shift-click a second verse to select a range.")}</p>
        <p>{t("LIVE copies Preview onto Program. BLACK and CLEAR change Program only.")}</p>
        <p>{t("The arrow keys and the arrows on Preview step Preview. The Live arrows under Program change the screen at once.")}{#if session.liveOnClick}{" "}{t("Auto LIVE is on, so for now a click or an arrow goes straight to the screen.")}{/if}</p>
        <p>{t("{key} undoes the last change to Program: LIVE, CLEAR, BLACK or LOGO.", { key: undoKey })}</p>
        <p>{t("Search a reference such as John 3:16, or a phrase such as “in the beginning”.")}</p>
        <p>{t("Listen matches spoken scripture on Preview. It never takes Program by itself.")}</p>
        <p>{t("F focuses Preview and Program. [ hides the library. ] hides the queue. / searches. None of these change Program.")}</p>
      {:else if sheet === "type"}
        <OutputType />
      {:else if !programReference}
        <p class="sheet-ref">{t("Put a verse on Program to compare it in every installed Bible.")}</p>
      {:else}
        <p class="sheet-ref">{t("{reference} on the screen. Pick a version to show it in that version at once.", { reference: programReference })}</p>
        <div class="versions">
          {#each versions as entry (entry.id)}
            {@const showing = programVersion === entry.name}
            <button type="button" class="version" class:on={showing} aria-pressed={showing} onclick={() => void session.refreshProgramTranslation(entry.id).then(() => (versionsFor = ""))}>
              <span class="version-head"><b>{entry.abbreviation}</b><span>{entry.name}</span>{#if showing}<em>{t("On screen")}</em>{/if}</span>
              <span class="version-text">{entry.text}</span>
            </button>
          {:else}
            <p class="sheet-ref">{t("Reading the versions…")}</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet panel_transcript()}
          <section class="pb-panel">
            <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "transcript")} ondragend={endPanelDrag}>
              <span>{t("Live transcript")}</span>
              {#if session.captions.lines.length}
                <button type="button" class="quiet" title={t("Clear what was heard")} onclick={() => session.clearCaptions()}><Icon name="close" size={14} /> {t("Clear")}</button>
              {/if}
            </header>
            <!-- What the microphone heard (never the verses on screen: those are under Scripture reading). -->
            <div class="pb-body transcript" bind:this={transcriptEl}>
              {#if session.voice.status !== "idle"}<VoiceStatus />{/if}
              {#if note}<p class="transcript-note">{note}</p>{/if}
              {#each session.captions.lines.slice(-40) as line (line.id)}
                <p class="heard">{line.text}</p>
              {/each}
              {#if session.captions.interim}<p class="heard interim">{session.captions.interim}</p>{/if}
              {#if !session.captions.lines.length && !session.captions.interim}
                <p class="transcript-empty">{voiceActive ? t("Listening. What is said shows here, and verses it hears go to Preview.") : t("Press Listen: what is said shows here, and verses it hears go to Preview.")}</p>
              {/if}
            </div>
            <footer class="pb-foot">
              <button type="button" class="go" class:on={voiceActive} aria-pressed={voiceActive} onclick={toggleVoice}>
                {@render icon(voiceActive ? "mic-off" : "mic")}
                {session.voice.status === "starting" ? t("Starting…") : voiceActive ? t("Stop listening") : t("Listen")}
              </button>
              {#if session.freeListenMinutes !== null}<span class="free-left" title={t("The Free plan listens for {minutes} minutes a month; Premium has no limit.", { minutes: 60 })}>{t("{n} min free", { n: session.freeListenMinutes })}</span>{/if}
              <button type="button" class="go" onclick={() => void findInScripture()}>{@render icon("wave")} {t("Find")}</button>
            </footer>
          </section>
{/snippet}

{#snippet panel_lists()}
          <section class="pb-panel">
            <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "lists")} ondragend={endPanelDrag}>
              <div class="side-tabs" role="tablist" aria-label={t("Scripture lists")}>
                <button type="button" role="tab" aria-selected={sideTab === "live"} onclick={() => (sideTab = "live")}>{t("Gone live")}{#if goneCount}<em>{goneCount}</em>{/if}</button>
                <button type="button" role="tab" aria-selected={sideTab === "detections"} onclick={() => (sideTab = "detections")}>{t("Detections")}{#if detections.length}<em>{detections.length}</em>{/if}</button>
              </div>
              {#if sideTab === "detections"}
                <button type="button" class="quiet" onclick={() => (detections = [])}><Icon name="close" size={14} /> {t("Clear all")}</button>
              {:else}
                <span class="side-actions">
                  {#if goneCount > pinnedCount}
                    <button type="button" class="quiet" aria-label={t("Clear the gone live list")} title={t("Clear the list (pinned passages stay)")} onclick={() => session.clearGoneLive()}><Icon name="trash" size={14} /></button>
                  {/if}
                  <button type="button" class="quiet" aria-label={t("Open the gone live list wide")} title={t("Wider view: the words, every verse stepped through, keyboard")} onclick={() => (goneWide = true)}><Icon name="expand" size={14} /></button>
                </span>
              {/if}
            </header>
            {#if sideTab === "detections"}
              <div class="pb-body detections">
                {#each detections as hit (`${hit.bookOrd}-${hit.chapter}-${hit.verse}`)}
                  <button type="button" onclick={() => openHit(hit)}>
                    <strong>{hit.bookName} {hit.chapter}:{hit.verse}{#if hit.ai}<em class="ai-tag" title={t("Named by the AI from what was said")}>{t("AI")}</em>{/if}</strong>
                    <span>{hit.text}</span>
                  </button>
                {:else}
                  <p class="side-empty">{t("Verses heard while listening, or found with Find, show here.")}</p>
                {/each}
              </div>
            {:else}
              <div class="pb-body gone"><GoneLiveList /></div>
            {/if}
          </section>
{/snippet}

{#snippet panel_scriptures()}
        {#if mode === "scriptures"}
          <section class="pb-panel scriptures">
            <form class="script-bar" onsubmit={lookup}>
              {#if !focus}<span class="grip" role="group" aria-label={t("Drag to move this panel")} title={t("Drag to move this panel")} draggable="true" ondragstart={(event) => dragPanel(event, "scriptures")} ondragend={endPanelDrag}></span>{/if}
              <select
                value={translationId}
                aria-label={t("Translation")}
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
                  <option value="kjv">{t("KJV")}</option>
                {:else}
                  {#each session.translations as translation (translation.id)}
                    <option value={translation.id}>{translation.abbreviation}</option>
                  {/each}
                {/if}
                <option value="__more">{t("More translations…")}</option>
              </select>
              {#if session.translations.length > 1}
                <select
                  class="parallel-pick"
                  class:on={!!session.workspace.parallelTranslationId}
                  value={session.workspace.parallelTranslationId ?? ""}
                  aria-label={t("Side-by-side translation")}
                  title={t("Show a second translation beside the first")}
                  onchange={(event) => void session.setParallelTranslation(event.currentTarget.value || null)}
                >
                  <option value="">{t("One")}</option>
                  {#each session.translations.filter((entry) => entry.id !== translationId) as translation (translation.id)}
                    <option value={translation.id}>+ {translation.abbreviation}</option>
                  {/each}
                </select>
              {/if}
              <button type="button" class="mini" class:on={wrapVerses} aria-label={t("Verse layout")} onclick={() => (wrapVerses = !wrapVerses)}>{@render icon("columns")}</button>
              <label class="bible-search">
                <Icon name="search" size={14} />
                <input bind:this={bibleInput} type="search" aria-label={t("Bible search")} placeholder={t("John 3:16, or a book")} bind:value={query} onkeydown={bibleKey} />
                {#if query}
                  <button type="button" class="clear" aria-label={t("Clear Bible search")} onclick={() => { query = ""; bibleInput?.focus(); }}><Icon name="close" size={12} /></button>
                {:else}
                  <kbd aria-hidden="true">/</kbd>
                {/if}
              </label>
              {#if passage()}
                {@const current = passage()!}
                <FavoriteStar on={session.isFavoritePassage(current)} label={current.reference} onclick={() => session.toggleFavoritePassage(current)} size={16} />
              {/if}
              <button type="button" class="mini" aria-label={t("Find a verse")} title={t("Find a verse: jn316, ps23, 3:16, words (/)")} onclick={() => { finderInitial = query === passage()?.reference ? "" : query; finderOpen = true; }}><Icon name="expand" size={15} /></button>
              <button type="button" class="mini" aria-label={t("Previous chapter")} onclick={() => moveChapter(-1)}>{@render icon("chevron-left")}</button>
              <button type="button" class="mini" aria-label={t("Next chapter")} onclick={() => moveChapter(1)}>{@render icon("chevron-right")}</button>
              <button type="button" class="mini" aria-label={t("Hide library")} title={t("Hide library")} onclick={() => session.togglePanel(LIBRARY_PANEL)}><Icon name="library" size={16} /></button>
            </form>
            {#if session.workspace.favorites.passages.length > 0}
              <div class="recent favorites" aria-label={t("Favorite passages")}>
                <span><Icon name="star" size={12} /> {t("Favorites")}</span>
                {#each session.workspace.favorites.passages.slice(0, 12) as item (`${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`)}
                  <button type="button" class:on={passage()?.reference === item.reference} onclick={() => openRecent(item)}>{item.reference}</button>
                {/each}
              </div>
            {/if}
            {#if session.workspace.recent.length > 0}
              <div class="recent" aria-label={t("Recent passages")}>
                <span>{t("Recent")}</span>
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
{/snippet}

{#snippet panel_reading()}
                  <section class="pb-panel">
                    <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "reading")} ondragend={endPanelDrag}><span class="kicker plain">{t("Scripture reading")}</span></header>
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
{/snippet}

{#snippet panel_preview()}
                <section class="pb-panel preview">
                  <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "preview")} ondragend={endPanelDrag}><span class="kicker">{t("Preview")}</span>{#if liveShowsOn}<button type="button" class="shows-on" data-tip={t("Which screens show it when you press LIVE. Change it in Settings › More screens.")} onclick={() => session.openSettings("screens")}>{t("LIVE shows it on {screens}", { screens: liveShowsOn })}</button>{/if}</header>
                  <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint={t("Nothing on Preview yet. Pick a verse, song or slide.")} /><GoLive /></div>
                </section>
{/snippet}

{#snippet panel_program()}
                <section class="pb-panel output" class:on-air={displayLive}>
                  <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "program")} ondragend={endPanelDrag}>
                    <span class="kicker program">{#if displayLive}<span class="pip on"></span>{/if}{t("Program")}</span>
                    {#if programSet && !displayLive}<span class="unseen" role="status" title={t("The audience can't see this")}>{t("Not on the screen")}</span>{/if}
                    <button
                      type="button"
                      class="style-name"
                      data-tip={t("Font, color, and layout. Preview only until you press LIVE.")}
                      onclick={() => (sheet = sheet === "type" ? null : "type")}
                    >
                      {themeName} · {session.theme().layout === "lower-third" ? t("Lower third") : t("Frame")}
                    </button>
                  </header>
                  <!-- A PDF scrolling on Program: the mouse wheel over the monitor scrolls the screen. -->
                  <div class="monitor main" onwheel={(event) => { if (session.live.program.model.layout === "document") session.scrollProgramBy(event.deltaY / 500); }}><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint={t("The audience sees nothing yet. Press LIVE (Space) to send Preview.")} /></div>
                  <TimerControls compact />
                  <VideoControls />
                  <DocumentControls />
                  <footer class="output-tools">
                    <button type="button" class="lex" data-tip={t("The verse on Program in every installed Bible; pick one to show it in that version")} onclick={() => (sheet = sheet === "versions" ? null : "versions")}>{@render icon("bible")} {t("Versions")}</button>
                    <!-- On Program, these change the screen at once (the arrow keys only change Preview). -->
                    <span class="steppers live-steps">
                      <span class="steps-label">{t("Live")}</span>
                      <button type="button" aria-label={t("Previous, straight to the screen")} data-tip={t("Previous, straight to the screen (the ← key only changes Preview)")} onclick={() => void stepOutput(-1)}>{@render icon("chevron-left")}</button>
                      <button type="button" aria-label={t("Next, straight to the screen")} data-tip={t("Next, straight to the screen (the → key only changes Preview)")} onclick={() => void stepOutput(1)}>{@render icon("chevron-right")}</button>
                    </span>
                  </footer>
                </section>
{/snippet}

{#snippet panel_queue()}
                  <section class="pb-panel">
                    <header class="pb-head" role="group" aria-label={t("Drag to move this panel")} draggable={!focus} ondragstart={(event) => dragPanel(event, "queue")} ondragend={endPanelDrag}>
                      <span>{t("Queue")}</span>
                      <span class="queue-actions">
                        <button type="button" class="quiet" onclick={() => void queuePassage()}><Icon name="plus" size={14} /> {t("Add")}</button>
                        {#if queue.length}
                          <!-- Two clicks: the first arms it (it empties the whole service; Undo follows). -->
                          <button type="button" class="quiet" class:armed={clearArmed} onclick={() => { if (!clearArmed) { clearArmed = true; setTimeout(() => (clearArmed = false), 3000); return; } clearArmed = false; session.clearQueue(); }}><Icon name="close" size={14} /> {clearArmed ? t("Click again to clear") : t("Clear all")}</button>
                        {/if}
                      </span>
                    </header>
                    <div class="pb-body queue">
                      {#each queue as item (item.id)}
                        <button type="button" class:on={session.cursor.itemId === item.id} onclick={(event) => { event.currentTarget.blur(); open(item); }}>{item.title}</button>
                      {:else}
                        <p class="queue-empty">{t("Nothing queued. Add puts the verse on Preview into the service, to show later in order.")}</p>
                      {/each}
                    </div>
                  </section>
{/snippet}

{#snippet place(name: PewPanel)}
  <!-- A place on the scripture page: it shows whichever panel is assigned to it; dropping another
       panel's title here swaps the two (the layout keeps its shape). -->
  {@const panel = slots[name]}
  <div class="place" class:drop={dropPlace === name && dragging !== panel} role="presentation" ondragover={(event) => overPlace(event, name)} ondragleave={() => (dropPlace = dropPlace === name ? null : dropPlace)} ondrop={(event) => dropOnPlace(event, name)}>
    {#if panel === "transcript"}{@render panel_transcript()}
    {:else if panel === "lists"}{@render panel_lists()}
    {:else if panel === "scriptures"}{@render panel_scriptures()}
    {:else if panel === "reading"}{@render panel_reading()}
    {:else if panel === "preview"}{@render panel_preview()}
    {:else if panel === "program"}{@render panel_program()}
    {:else}{@render panel_queue()}{/if}
  </div>
{/snippet}

{#snippet icon(name: string)}
  <Icon {name} size={16} />
{/snippet}

{#if finderOpen}
  <ScriptureFinder
    {translationId}
    here={{ bookOrd, chapter }}
    initial={finderInitial}
    {searchWords}
    onopen={openFound}
    onclose={() => (finderOpen = false)}
  />
{/if}
{#if session.audioOpen}
  <AudioDialog onclose={() => (session.audioOpen = false)} />
{/if}
{#if goneWide}
  <DeskDialog title={t("Scriptures that have gone live")} wide onclose={() => (goneWide = false)}>
    <GoneLiveList wide onpicked={() => (goneWide = false)} />
  </DeskDialog>
{/if}
{#if overlaysOpen}
  <OverlaysDialog onclose={() => (overlaysOpen = false)} />
{/if}
{#if alertsOpen}
  <AlertsDialog onclose={() => (alertsOpen = false)} />
{/if}
{#if session.macrosOpen}
  <MacrosDialog onclose={() => (session.macrosOpen = false)} />
{/if}


<style>
  /* Where LIVE will show Preview, with extra screens: quiet, one line, a way to Settings › Screens. */
  .shows-on { min-width: 0; margin-left: auto; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .shows-on:hover { color: var(--ink); }
  /* Auto LIVE is on: said beside LIVE, in its colour. */
  .auto-live { border-color: color-mix(in srgb, #ff4d4d 55%, var(--line)); color: #ff6b6b; font-size: 11px; font-weight: 750; letter-spacing: 0.02em; }
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
  .pb-modes .lock { margin-left: 6px; padding: 1px 5px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-size: 9.5px; font-weight: 800; font-style: normal; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: 1px; }
  .pb-modes button.on .lock { background: rgb(255 255 255 / 0.22); color: white; }
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
  .pb-tools { display: flex; align-items: center; gap: 3px; margin-left: 4px; padding-left: 8px; border-left: 1px solid var(--line); flex: none; }
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
  /* The reference box is what the operator types in most: it keeps room for "1 Corinthians 13:4"
     and the buttons move to a second row before it gets squeezed. */
  .bible-search {
    flex: 1 1 140px;
    min-width: 110px;
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
  .recent.favorites span { display: inline-flex; align-items: center; gap: 4px; color: #f5b301; }
  .recent.favorites button { border-color: color-mix(in srgb, #f5b301 40%, var(--line)); }
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
  /* Panels move by their title bar; the wrapper adds no box, so the layout keeps its shape. */
  .place { display: contents; }
  .pb-head[draggable="true"] { cursor: grab; }
  .pb-head[draggable="true"]:active { cursor: grabbing; }
  .pb-head[draggable="true"] > span:first-child::before,
  .grip::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 10px;
    margin-right: 7px;
    vertical-align: -1px;
    opacity: 0;
    background: radial-gradient(circle, currentColor 1px, transparent 1.4px) 0 0 / 3px 3.4px;
    transition: opacity 0.15s ease;
  }
  .pb-head[draggable="true"]:hover > span:first-child::before,
  .grip:hover::before,
  .script-bar:hover .grip::before { opacity: 0.7; }
  .grip { flex: none; display: flex; align-items: center; align-self: stretch; padding: 0 2px; margin-right: -4px; cursor: grab; color: var(--muted); }
  .grip::before { margin-right: 0; }
  .place.drop > :global(.pb-panel),
  .place.drop > :global(*) > :global(.pb-panel) {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
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
  .script-bar { padding: 8px; flex-wrap: wrap; flex: none; }
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
  .reading sup { color: var(--accent); font-size: 0.75em; margin-right: 4px; }
  .reading-ref, .sheet-ref { color: var(--mustard); font-size: 12px; letter-spacing: 0.04em; }
  .detections { display: flex; flex-direction: column; gap: 6px; }
  .ai-tag { margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, #7c3aed 22%, transparent); color: #a78bfa; font-size: 10px; font-style: normal; font-weight: 700; vertical-align: 1px; }
  .side-tabs { display: flex; gap: 2px; min-width: 0; }
  .side-tabs button { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; }
  .side-tabs button[aria-selected="true"] { background: var(--field); color: var(--ink); }
  .side-tabs em { font-style: normal; font-size: 11px; min-width: 18px; padding: 0 5px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 12%, transparent); text-align: center; }
  .side-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .gone { overflow: hidden; padding: var(--panel-pad); display: flex; flex-direction: column; }
  .side-actions { display: inline-flex; align-items: center; gap: 2px; }
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
    position: relative;
    --go-live-inset: 22px;
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .clears { display: inline-flex; align-items: center; gap: 6px; }
  /* CLEAR WORDS slides out of CLEAR on hover. A grid track from 0fr to 1fr animates to the words'
     real width (max-width to a guess overshot: done in a third of the time, then a wait before it
     closed), with the gap folded in so nothing jumps. */
  .clears-more { display: grid; grid-template-columns: 0fr; margin-right: -6px; opacity: 0; transition: grid-template-columns 240ms cubic-bezier(0.2, 0.8, 0.2, 1), margin-right 240ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms ease 40ms; }
  .clears-row { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; padding-right: 6px; transform: translateX(6px); transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .clears:hover .clears-more, .clears:focus-within .clears-more { grid-template-columns: 1fr; margin-right: 0; opacity: 1; transition-delay: 0ms, 0ms, 0ms; }
  .clears:hover .clears-row, .clears:focus-within .clears-row { transform: none; }
  .clears-main { position: relative; }
  .clears-main::after { content: ""; position: absolute; right: 3px; top: 50%; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: currentColor; opacity: 0.45; transition: opacity 160ms ease; }
  .clears:hover .clears-main::after, .clears:focus-within .clears-main::after { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .clears-more, .clears-row { transition: none; } }
  .live-steps { align-items: center; }
  .versions { display: grid; gap: 8px; max-height: 56vh; overflow: auto; }
  .version { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .version:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .version.on { border-color: var(--live, #e5484d); box-shadow: 0 0 0 1px var(--live, #e5484d); }
  .version-head { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--muted); }
  .version-head b { color: var(--accent); font-size: 12px; letter-spacing: 0.04em; }
  .version-head em { margin-left: auto; font-style: normal; font-weight: 700; color: var(--live, #e5484d); }
  .version-text { font-size: 14px; line-height: 1.45; }
  .unseen { flex: none; font-size: 11px; font-weight: 650; color: #f5a524; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* A narrow Program column keeps the warning and drops the look's name (it comes back once the screen shows). */
  .pb-panel.output { container-type: inline-size; }
  @container (max-width: 380px) { .unseen ~ .style-name { display: none; } }
  .live-steps .steps-label { font-size: 11px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--live, #e5484d); }
  .live-steps button { border-color: color-mix(in srgb, var(--live, #e5484d) 45%, var(--line)); }
  .steppers button { width: 32px; padding: 0; justify-content: center; }
  .queue button { padding: 8px 10px; }
  .queue-empty { margin: 4px 2px; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .quiet.armed { color: var(--live, #e5484d); font-weight: 700; }
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
  /* The bar fits the desk's own width (a docked drawer narrows the desk, not the window). */
  .pb { position: relative; container: desk / inline-size; }
  .now-audio { display: inline-flex; align-items: center; height: 32px; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, var(--field)); overflow: hidden; }
  .now-audio-name { display: inline-flex; align-items: center; gap: 6px; max-width: 160px; height: 100%; padding: 0 8px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .now-audio-name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  @container desk (max-width: 1560px) { .chip-name { display: none; } }
  /* Guided tours are also in the More menu; narrower desks keep the bar for live tools. */
  .pb-tools :global(.tool-menu > button) { position: relative; }
  .tool-dot { position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font-size: 10px; font-weight: 800; line-height: 16px; text-align: center; }
  .menu-state { margin-left: auto; padding: 1px 7px; border-radius: 8px; font-size: 11px; font-weight: 700; background: var(--field); color: var(--muted); }
  .menu-state.on { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
  .now-audio-btn { width: 28px; height: 100%; border: 0; border-left: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); background: none; color: var(--ink); display: grid; place-items: center; }
  .now-audio-btn:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
  /* Narrower desks: shorter labels so the tools on the right stay in reach. */
  @container desk (max-width: 1320px) {
    .pb-bar :global(.wide-only) { display: none; }
    .now-audio-name { padding: 0 7px; }
  }
  @container desk (max-width: 1180px) {
    .pb-bar { gap: 6px; }
    .pb-left { gap: 6px; }
    .clears .desk-btn { padding-inline: 8px; }
    .pb-modes button { padding-inline: 9px; }
    .pb-bar :global(.output-trigger) { max-width: 150px; }
  }
  @container desk (max-width: 1100px) {
    .pb-bar { padding-inline: 6px; gap: 4px; }
    .pb-tools { padding-left: 8px; margin-left: 2px; }
    .pb-modes button { padding-inline: 6px; font-size: 13px; }
    .pb-bar :global(.output-trigger) { max-width: 140px; }
    .pb-tools { gap: 1px; --tool-size: 32px; }
    .desk-btn.live, .desk-btn.danger { padding-inline: 10px; }
    .now-audio-name { padding: 0 5px; }
    .now-audio-btn { width: 24px; }
  }
  .transcript .heard { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
  .transcript .heard.interim { color: var(--muted); font-style: italic; }
  .transcript-note { margin: 0 0 8px; font-size: 12px; color: var(--muted); }
  .transcript-empty { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .free-left { align-self: center; font-size: 11px; font-weight: 650; color: var(--muted); white-space: nowrap; }
</style>
