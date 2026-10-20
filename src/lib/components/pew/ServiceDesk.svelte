<script lang="ts">
  import { untrack } from "svelte";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { session } from "../../app/session.svelte";
  import { sectionShort, sectionTone } from "../../domain/song";
  import { restoreComposition } from "../../domain/composition";
  import type { PresentationItem } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import MonitorPair from "./MonitorPair.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import ItemThumb from "./ItemThumb.svelte";
  import ServiceTimeline from "./ServiceTimeline.svelte";
  import TemplatesDialog from "./TemplatesDialog.svelte";
  import OutlineDialog from "./OutlineDialog.svelte";
  import MacroBar from "../MacroBar.svelte";
  import FollowSermon from "./FollowSermon.svelte";
  import SectionTime from "./SectionTime.svelte";
  import PartLeader from "./PartLeader.svelte";
  import ServiceReport from "./ServiceReport.svelte";
  import ServiceCanvas from "./ServiceCanvas.svelte";
  import StartServiceDialog from "./StartServiceDialog.svelte";
  import ServiceSettings from "./ServiceSettings.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import { defaultShortcuts, shortcutLabel } from "../../keyboard/manager";
  import { activeRun } from "../../domain/service-run";
  import { clockCount } from "../../domain/schedule";
  import { clockLabel, minutesOfDay, parseClock } from "../../domain/schedule";
  import { partDesks, serviceSummary } from "../../domain/service";
  import { screenStarts } from "../../bible/passage";
  import QuickVerse from "./QuickVerse.svelte";
  import PartRunPicker from "./PartRunPicker.svelte";
  import { planSchedule } from "../../domain/schedule";
  import AddSourcesDialog, { type AddKind } from "./AddSourcesDialog.svelte";
  import { msg, t, tn } from "../../i18n/core";

  // The running order for a whole service: sections in order, any kind of item, and a way to
  // move through it item by item. Nothing here changes Program; LIVE still does.
  const SUGGESTED = ["Welcome", "Worship", "Word", "Offering", "Announcements", "Closing"];
  const ADD_TILES: Array<[AddKind, string, string]> = [
    ["song", msg("Song"), "note"],
    ["scripture", msg("Scripture"), "bible"],
    ["text", msg("Text"), "pencil"],
    ["announcement", msg("Announcement"), "alerts"],
    ["slides", msg("Slides"), "stage"],
    ["media", msg("Media"), "media"],
    ["look", msg("Look"), "studio"],
  ];
  /** The add window, open on a part and a kind of thing. */
  let addOpen = $state<{ sectionId: string | null; kind: AddKind } | null>(null);
  // Room to work: the services list and the monitors can each be hidden (remembered here).
  let listHidden = $state<boolean | undefined>(undefined);
  let stageHidden = $state(readHidden());
  function readHidden(): boolean {
    try {
      return localStorage.getItem("service.stage") === "hidden";
    } catch {
      return false;
    }
  }
  function setStage(hidden: boolean) {
    stageHidden = hidden;
    try {
      localStorage.setItem("service.stage", hidden ? "hidden" : "shown");
    } catch {
      /* not kept */
    }
  }
  const wide = $derived(listHidden === true && stageHidden);
  function toggleWide() {
    const next = !wide;
    listHidden = next;
    setStage(next);
  }

  let newName = $state("");
  let sectionName = $state("");
  /** The templates window, opened on a template (or the first). */
  let templatesOpen = $state<{ id: string | null } | null>(null);
  /** A service whose delete button was pressed once (press again to delete). */
  let armedService = $state<string | null>(null);
  let outlineOpen = $state(false);
  let reportOpen = $state(false);

  // Folding parts in the list: each part's items fold away under its heading (remembered per service).
  let folded = $state<Set<string>>(new Set());
  let foldedFor = "";
  const FOLD_KEY = (id: string) => `service.folded.${id}`;
  $effect(() => {
    const id = session.service?.id ?? "";
    if (id === foldedFor) return;
    foldedFor = id;
    try {
      const raw = id ? localStorage.getItem(FOLD_KEY(id)) : null;
      folded = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      folded = new Set();
    }
  });
  function saveFolded(next: Set<string>) {
    folded = next;
    try {
      if (foldedFor) localStorage.setItem(FOLD_KEY(foldedFor), JSON.stringify([...next]));
    } catch {
      /* not kept */
    }
  }
  function toggleFold(id: string) {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveFolded(next);
  }
  function foldAll(fold: boolean) {
    saveFolded(fold ? new Set(session.service?.sections.map((section) => section.id) ?? []) : new Set());
  }
  // When the item on Preview or the running part moves into a folded part, that part opens by itself
  // (once: folding it again afterwards is the operator's choice).
  let lastFocus = "";
  $effect(() => {
    const previewPart = session.cursor.itemId ? session.cursor.sectionId : null;
    const running = session.runningSectionId;
    const key = `${previewPart}|${session.cursor.itemId}|${running}`;
    if (key === lastFocus) return;
    lastFocus = key;
    untrack(() => {
      const open = [previewPart, running].filter((id): id is string => !!id && folded.has(id));
      if (open.length) saveFolded(new Set([...folded].filter((id) => !open.includes(id))));
    });
  });
  /** Unfold animation; none when the computer asks for less motion. */
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const unfold = { duration: reduced ? 0 : 220, easing: cubicOut };
  let startOpen = $state(false);
  // The services list: the running one first, then by when they were last worked on.
  let serviceQuery = $state("");
  const serviceGroups = $derived.by(() => {
    const query = serviceQuery.trim().toLowerCase();
    const list = session.services.filter((entry) => !query || entry.name.toLowerCase().includes(query));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = today.getTime() - 6 * 86_400_000;
    const running = session.serviceRunning ? session.service?.id : null;
    const groups: Array<{ id: string; label: string; entries: typeof list }> = [
      { id: "running", label: msg("Running now"), entries: list.filter((entry) => entry.id === running) },
      { id: "today", label: msg("Today"), entries: [] },
      { id: "week", label: msg("This week"), entries: [] },
      { id: "earlier", label: msg("Earlier"), entries: [] },
    ];
    for (const entry of list) {
      if (entry.id === running) continue;
      const at = new Date(entry.updatedAt).getTime();
      groups[at >= today.getTime() ? 1 : at >= week ? 2 : 3]!.entries.push(entry);
    }
    return groups.filter((group) => group.entries.length > 0);
  });
  let settingsOpen = $state(false);
  /** When the open service's run began (epoch ms), and a clock ticking each second while it runs. */
  const runStartedAt = $derived(activeRun(session.service)?.startedAt ?? null);
  let clockNow = $state(Date.now());
  $effect(() => {
    if (runStartedAt === null) return;
    const timer = setInterval(() => (clockNow = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  /** Time left until a waiting start, ticking each second while there is one. */
  let tickNow = $state(Date.now());
  $effect(() => {
    if (session.queuedStart === null) return;
    const timer = setInterval(() => (tickNow = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  function untilStart(at: number): string {
    const total = Math.max(0, Math.round((at - tickNow) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }
  /** The running order as a list, or as a flow on a canvas (remembered here). */
  let view = $state<"list" | "canvas">(readView());
  function readView(): "list" | "canvas" {
    try {
      return localStorage.getItem("service.view") === "canvas" ? "canvas" : "list";
    } catch {
      return "list";
    }
  }
  function setView(next: "list" | "canvas") {
    view = next;
    try {
      localStorage.setItem("service.view", next);
    } catch {
      /* not kept */
    }
  }
  /** End service was pressed once (press again to end). */
  let armedEnd = $state(false);
  function endService() {
    if (!armedEnd) {
      armedEnd = true;
      setTimeout(() => (armedEnd = false), 3000);
      return;
    }
    armedEnd = false;
    session.endService();
    reportOpen = true;
  }

  // Drag and drop in the running order: a section by its handle, an item by its handle (into any
  // section). Alt+arrow keys on a handle move it without a mouse.
  let dragSection = $state<string | null>(null);
  let dragItem = $state<string | null>(null);
  let dropSection = $state<number | null>(null);
  let dropItem = $state<{ sectionId: string; index: number } | null>(null);

  function endDrag() {
    dragSection = null;
    dragItem = null;
    dropSection = null;
    dropItem = null;
  }

  /** Over an item: drop before it, or after it when past its middle. */
  function overItem(event: DragEvent, sectionId: string, index: number) {
    if (!dragItem) return;
    event.preventDefault();
    event.stopPropagation();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropItem = { sectionId, index: event.clientY > box.top + box.height / 2 ? index + 1 : index };
  }

  function dropHere(event: DragEvent) {
    event.preventDefault();
    if (dragItem && dropItem) session.moveItemTo(dragItem, dropItem.sectionId, dropItem.index);
    else if (dragSection && dropSection !== null) session.moveSectionTo(dragSection, dropSection);
    endDrag();
  }

  function gripKey(event: KeyboardEvent, move: (direction: 1 | -1) => void) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    move(event.key === "ArrowUp" ? -1 : 1);
    const target = event.currentTarget as HTMLElement;
    queueMicrotask(() => document.getElementById(target.id)?.focus());
  }
  /** The item open in the editor. */
  let editing = $state<PresentationItem | null>(null);

  function edit(itemId: string) {
    editing = service?.sections.flatMap((section) => section.items).find((entry) => entry.id === itemId) ?? null;
  }

  /** A blank text slide, opened straight in the editor. */
  async function addText() {
    const id = await session.addToService({ kind: "slide", title: "Text", slide: { heading: "Text", body: "", imageId: null } }, true);
    edit(id);
  }

  const service = $derived(session.service);
  const count = $derived(service?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0);
  const upNext = $derived(session.nextItem());
  /** The reading selected, as screens: Next goes through its verses before the next item. */
  const reading = $derived(session.readingNow());
  const current = $derived(service && session.cursor.itemId ? service.sections.flatMap((section) => section.items).find((item) => item.id === session.cursor.itemId) : null);
  const barPart = $derived(service?.sections.find((section) => section.id === session.cursor.sectionId)?.id ?? service?.sections[0]?.id ?? null);

  const KIND: Record<string, { icon: string; label: string }> = {
    lyric: { icon: "note", label: msg("Song") },
    bible: { icon: "bible", label: msg("Scripture") },
    deck: { icon: "stage", label: msg("Slides") },
    slide: { icon: "pencil", label: msg("Text") },
    image: { icon: "media", label: msg("Picture") },
    video: { icon: "play", label: msg("Video") },
    announcement: { icon: "alerts", label: msg("Announcement") },
    composition: { icon: "studio", label: msg("Look") },
  };

  function kindOf(item: PresentationItem) {
    const kind = KIND[item.kind];
    return kind ? { icon: kind.icon, label: t(kind.label) } : { icon: "list", label: item.kind };
  }

  const songOf = (item: PresentationItem) => (item.lyric ? session.songs.find((entry) => entry.id === item.lyric?.songId) : undefined);

  function detail(item: PresentationItem): string {
    if (item.kind === "lyric" && item.lyric) {
      const song = session.songs.find((entry) => entry.id === item.lyric?.songId);
      return song ? `${tn(song.sections.length, "{n} section", "{n} sections")}${song.author ? ` · ${song.author}` : ""}` : t("Song not found");
    }
    if (item.kind === "deck" && item.deck) {
      const deck = session.decks.find((entry) => entry.id === item.deck?.deckId);
      return deck ? tn(deck.pages.length, "{n} page", "{n} pages") : t("Deck not found");
    }
    if (item.kind === "bible" && item.bible) {
      const abbreviation = session.translations.find((entry) => entry.id === item.bible?.translationId)?.abbreviation ?? "";
      const per = session.perScreenOf(item.bible);
      const screens = per ? screenStarts(item.bible, per).length : 1;
      return screens > 1 ? `${abbreviation} · ${tn(screens, "{n} screen", "{n} screens")}` : abbreviation;
    }
    if (item.kind === "announcement") return item.announcement?.body.split("\n")[0] ?? "";
    return kindOf(item).label;
  }

  /** What an item on Preview or LIVE does next: the next verses, its page, the song part showing. */
  function hint(item: PresentationItem): string {
    const active = live(item) || session.cursor.itemId === item.id;
    if (!active) return "";
    if (item.kind === "bible" && item.bible && session.cursor.itemId === item.id) {
      const reading = session.readingNow();
      if (!reading || reading.itemId !== item.id) return "";
      return reading.next ? t("Next: {reference}", { reference: reading.next }) : t("Last verses · Next moves on");
    }
    if (item.kind === "deck" && item.deck) {
      const deck = session.decks.find((entry) => entry.id === item.deck?.deckId);
      const focus = session.deckFocus?.deckId === item.deck.deckId ? session.deckFocus : null;
      if (!deck || !focus) return "";
      return focus.index + 1 >= deck.pages.length ? t("Last page · Next moves on") : t("Page {n} of {total}", { n: focus.index + 1, total: deck.pages.length });
    }
    if (item.kind === "lyric" && item.lyric) {
      const focus = session.songFocus?.songId === item.lyric.songId ? session.songFocus : null;
      const part = focus ? songOf(item)?.sections.find((entry) => entry.id === focus.sectionId) : null;
      return part ? t("On {part}", { part: part.label }) : "";
    }
    return "";
  }

  const live = (item: PresentationItem) =>
    session.live.program.sourceId === item.id || (item.kind === "composition" && session.live.program.sourceId?.includes(item.composition?.compositionId ?? "~"));

  /** The part whose "Where it runs" window is open. */
  let runPicker = $state<string | null>(null);

  /** A part whose "who leads it" line was asked for (parts without a leader keep it hidden). */
  let leaderOpen = $state<string | null>(null);
  function openLeader(sectionId: string) {
    leaderOpen = sectionId;
  }
  /** Put the cursor in the leader field when its line was just asked for. */
  function focusLeader(node: HTMLElement, wanted: boolean) {
    if (wanted) requestAnimationFrame(() => node.querySelector("input")?.focus());
    const away = (event: FocusEvent) => {
      if (!node.contains(event.relatedTarget as Node | null) && leaderOpen && !node.querySelector("input")?.value.trim()) leaderOpen = null;
    };
    node.addEventListener("focusout", away);
    return { destroy: () => node.removeEventListener("focusout", away) };
  }

  function open(item: PresentationItem, event: MouseEvent) {
    (event.currentTarget as HTMLElement).blur();
    // A reading set to run on the Presenter page opens there, with its verses picked out.
    if (session.readingOnPresenter(item.id)) session.openReadingOnPresenter(item.id);
    else void session.chooseItem(item.id);
  }

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if ((event.key === "a" || event.key === "A") && !event.metaKey && !event.ctrlKey && !event.altKey && service && barPart && !addOpen && !editing) {
      event.preventDefault();
      addOpen = { sectionId: barPart, kind: "song" };
      return;
    }
    if (event.key === "PageDown" || (event.key === "ArrowDown" && event.altKey)) {
      event.preventDefault();
      void session.stepItem(1);
    } else if (event.key === "PageUp" || (event.key === "ArrowUp" && event.altKey)) {
      event.preventDefault();
      void session.stepItem(-1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if editing}
  <ItemEditor item={editing} onclose={() => (editing = null)} />
{/if}

<section class="service-desk" class:no-stage={stageHidden}>
  <LibrarySidebar title={t("Services")} icon="list" count={session.services.length} storageKey="services" bind:collapsed={listHidden}>
    {#snippet actions()}
      <button type="button" class="desk-btn" title={t("Start a service from a template, or edit the templates")} onclick={() => (templatesOpen = { id: null })}><Icon name="list" size={14} /> {t("Templates")}</button>
      <button type="button" class="desk-btn" onclick={() => void session.createService(`${t("Service")} ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`)}><Icon name="plus" size={14} /> {t("New")}</button>
    {/snippet}
    <div class="list">
      {#if session.services.length === 0}<p class="empty">{t("No services yet. Start one to plan the order.")}</p>{/if}
      {#if session.services.length > 5}
        <label class="svc-find"><Icon name="search" size={13} /><input type="search" aria-label={t("Find a service")} placeholder={t("Find a service")} bind:value={serviceQuery} /></label>
      {/if}
      {#each serviceGroups as group (group.id)}
      <p class="svc-group">{t(group.label)}</p>
      {#each group.entries as entry (entry.id)}
        {@const info = service?.id === entry.id ? serviceSummary(service) : entry}
        {@const when = new Date(info.lastRunAt ?? entry.updatedAt)}
        {@const liveHere = service?.id === entry.id && runStartedAt !== null}
        <div class="svc" class:on={service?.id === entry.id}>
          <button type="button" class="row" class:on={service?.id === entry.id} class:live={liveHere} onclick={() => void session.openService(entry.id)}>
            <span class="svc-date" aria-hidden="true">
              <small>{when.toLocaleDateString(undefined, { weekday: "short" })}</small>
              <b>{when.getDate()}</b>
            </span>
            <span class="svc-copy">
              <strong>{entry.name}</strong>
              {#if liveHere && runStartedAt !== null}
                <span class="running-clock" title={t("Running since {time}", { time: new Date(runStartedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}><i aria-hidden="true"></i>{t("LIVE")} · {clockCount(clockNow - runStartedAt)}</span>
              {:else}
                <span class="svc-meta">{[info.startTime ? clockLabel(parseClock(info.startTime) ?? 0) : "", tn(info.parts ?? 0, "{n} part", "{n} parts")].filter(Boolean).join(" · ")}{#if info.skipped}<em>{` · ${tn(info.skipped, "{n} skipped", "{n} skipped")}`}</em>{/if}</span>
              {/if}
              <span class="svc-when">{info.lastRunAt ? t("Last ran {date}", { date: when.toLocaleDateString(undefined, { day: "numeric", month: "short" }) }) : t("Edited {date}", { date: when.toLocaleDateString(undefined, { day: "numeric", month: "short" }) })}</span>
            </span>
          </button>
          <span class="svc-tools">
            <button type="button" class="row-tool" aria-label={t("Duplicate {name}", { name: entry.name })} title={t("Duplicate")} onclick={() => void session.duplicateService(entry.id)}><Icon name="copy" size={13} /></button>
            <button
              type="button"
              class="row-tool"
              class:armed={armedService === entry.id}
              aria-label={armedService === entry.id ? t("Confirm delete {name}", { name: entry.name }) : t("Delete {name}", { name: entry.name })}
              title={armedService === entry.id ? t("Click again to delete") : t("Delete")}
              onclick={() => {
                if (armedService !== entry.id) {
                  armedService = entry.id;
                  setTimeout(() => (armedService = armedService === entry.id ? null : armedService), 3000);
                  return;
                }
                armedService = null;
                void session.deleteService(entry.id);
              }}
            >{#if armedService === entry.id}{t("Delete?")}{:else}<Icon name="trash" size={13} />{/if}</button>
          </span>
        </div>
      {/each}
      {/each}
    </div>
  </LibrarySidebar>

  <div class="sheet">
    {#if service}
      <header class="head">
        <button type="button" class="desk-btn icon panel-toggle" aria-pressed={listHidden !== true} aria-label={listHidden ? t("Show the services list") : t("Hide the services list")} title={listHidden ? t("Show the services list") : t("Hide the services list, for more room")} onclick={() => (listHidden = !listHidden)}><Icon name="panel-left" size={15} /></button>
        <div class="title">
          <input class="name" aria-label={t("Service name")} value={service.name} onchange={(event) => session.renameService(event.currentTarget.value)} />
        </div>
        <div class="views" role="radiogroup" aria-label={t("View")}>
          <button type="button" role="radio" aria-checked={view === "list"} aria-label={t("List")} title={t("The running order as a list")} onclick={() => setView("list")}><Icon name="list" size={14} /><span class="view-name">{t("List")}</span></button>
          <button type="button" role="radio" aria-checked={view === "canvas"} aria-label={t("Flow")} title={t("The service as a flow chart: drag parts, wire the order")} onclick={() => setView("canvas")}><Icon name="layers" size={14} /><span class="view-name">{t("Flow")}</span></button>
        </div>
        <button type="button" class="desk-btn labelled" title={t("Service settings: Auto LIVE, moving on when time is up, readings, screen, warnings")} onclick={() => (settingsOpen = true)}><Icon name="settings" size={14} /> <span class="lbl">{t("Settings")}</span></button>
        <ToolMenu label={t("More: report, outline, save as template, fold parts")} className="desk-btn icon more">
          {#snippet trigger()}<Icon name="more" size={15} />{/snippet}
          {#snippet children(close)}
            <button type="button" role="menuitem" onclick={() => { reportOpen = true; close(); }}><Icon name="clock" size={13} /> {t("Report")}<span class="menu-hint">{t("Planned and used time per part")}</span></button>
            <button type="button" role="menuitem" onclick={() => { outlineOpen = true; close(); }}><Icon name="files" size={13} /> {t("Outline")}<span class="menu-hint">{t("Print, PDF or copy")}</span></button>
            <button type="button" role="menuitem" onclick={() => { const made = session.saveServiceAsTemplate(service.name); if (made) templatesOpen = { id: made.id }; close(); }}><Icon name="copy" size={13} /> {t("Save as template")}</button>
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" onclick={() => { settingsOpen = true; close(); }}><Icon name="settings" size={13} /> {t("Service settings…")}<span class="menu-hint">{t("Auto LIVE, moving on, readings")}</span></button>
            <button type="button" role="menuitemcheckbox" aria-checked={service.liveOnClick !== false} onclick={() => { session.setLiveOnClick(service.liveOnClick === false); close(); }}><Icon name="play" size={13} /> {t("Auto LIVE while running")}</button>
            <p class="menu-note">{t("When a part's time is up")}</p>
            {#each [["remind", msg("Remind me")], ["next", msg("Move on by itself")], ["off", msg("Only show it as over")]] as [mode, label] (mode)}
              <button type="button" role="menuitemradio" aria-checked={(service.autoAdvance ?? "remind") === mode} onclick={() => { session.setServiceSettings({ autoAdvance: mode as "remind" | "next" | "off" }); close(); }}>{t(label)}</button>
            {/each}
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" onclick={() => { foldAll(true); close(); }}><Icon name="chevron-up" size={13} /> {t("Fold all parts")}</button>
            <button type="button" role="menuitem" onclick={() => { foldAll(false); close(); }}><Icon name="chevron-down" size={13} /> {t("Unfold all parts")}</button>
            <div class="menu-sep"></div>
            <button type="button" role="menuitemcheckbox" aria-checked={!stageHidden} onclick={() => { setStage(!stageHidden); close(); }}><Icon name="panel-right" size={13} /> {t("Preview and Program")}</button>
            <button type="button" role="menuitemcheckbox" aria-checked={wide} onclick={() => { toggleWide(); close(); }}><Icon name={wide ? "columns" : "expand"} size={13} /> {t("Hide both side panels")}</button>
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" onclick={() => { void session.closeService(); close(); }}><Icon name="close" size={13} /> {session.serviceRunning ? t("End and close") : t("Close service")}</button>
          {/snippet}
        </ToolMenu>
        {#if session.queuedStart !== null}
          <span class="queued" role="status">
            <i aria-hidden="true"></i>{t("Starts at {time}", { time: clockLabel(minutesOfDay(session.queuedStart)) })} · <strong>{untilStart(session.queuedStart)}</strong>
            <button type="button" onclick={() => session.startService(true)}>{t("Start now")}</button>
            <button type="button" onclick={() => session.cancelQueuedStart()}>{t("Cancel")}</button>
          </span>
        {:else if session.serviceRunning}
          <button type="button" class="auto-live" class:on={session.liveOnClick} aria-pressed={session.liveOnClick} title={session.liveOnClick ? t("A click (or Next) sends the item straight to LIVE. Click to put items on Preview first.") : t("Items go to Preview first. Click to send them straight to LIVE while the service runs.")} onclick={() => session.setLiveOnClick(!session.liveOnClick)}>
            <span class="switch" aria-hidden="true"><i></i></span>{t("Auto LIVE")}
          </button>
          <button type="button" class="desk-btn end" class:armed={armedEnd} title={t("Stop the clock: the countdown leaves the screen and the times are kept in Report")} onclick={endService}><Icon name="square" size={12} /> {armedEnd ? t("End now?") : t("End service")}</button>
        {:else if service.sections.length > 0}
          {#if service.runs?.length}
            <button type="button" class="desk-btn" title={t("Planned and used time per part")} onclick={() => (reportOpen = true)}><Icon name="clock" size={12} /> {t("Report")}</button>
          {/if}
          <button type="button" class="desk-btn start" title={t("Begin the service: checks the time against the planned start first")} onclick={() => (startOpen = true)}><Icon name="play" size={12} /> {t("Start service")}</button>
        {/if}
        <button type="button" class="desk-btn icon panel-toggle" aria-pressed={!stageHidden} aria-label={stageHidden ? t("Show Preview and Program") : t("Hide Preview and Program")} title={stageHidden ? t("Show Preview and Program") : t("Hide Preview and Program, for more room")} onclick={() => setStage(!stageHidden)}><Icon name="panel-right" size={15} /></button>
      </header>

      {#if session.serviceRunning}
        {@const keys = session.workspace.shortcuts ?? defaultShortcuts}
        <p class="key-hints" aria-label={t("Keys")}>
          <span><kbd>{shortcutLabel(keys, "next")}</kbd> {t("next verse or slide")}</span>
          <span><kbd>Page Down</kbd> {t("next item")}</span>
          <span><kbd>{shortcutLabel(keys, "take")}</kbd> {t("LIVE")}</span>
          <span><kbd>{shortcutLabel(keys, "black")}</kbd> {t("black")}</span>
          <span><kbd>{shortcutLabel(keys, "logo")}</kbd> {t("logo")}</span>
        </p>
      {/if}
      {#if session.timeUp}
        {@const up = session.timeUp}
        {@const part = service.sections.find((entry) => entry.id === up.sectionId)}
        {@const nextPart = up.nextId ? service.sections.find((entry) => entry.id === up.nextId) : null}
        <div class="time-up" role="alert">
          <span class="time-up-icon" aria-hidden="true"><Icon name="timer" size={16} /></span>
          <span class="time-up-copy">
            <strong>{t("{part}'s time is up", { part: part?.name ?? "" })}</strong>
            <em>{nextPart ? t("Next: {next}", { next: nextPart.name }) : t("This is the last part.")} · {t("{time} over", { time: clockCount(clockNow - up.since) })}</em>
          </span>
          {#if nextPart}<button type="button" class="tu-btn primary" onclick={() => void session.moveOn(up.sectionId)}>{t("Move on now")}<Icon name="chevron-right" size={13} /></button>{/if}
          <button type="button" class="tu-btn" onclick={() => session.snoozeTimeUp(5)}>{t("5 more min")}</button>
          <button type="button" class="tu-btn ghost" title={t("No more reminders for this part; move on by hand")} onclick={() => session.stayOnPart()}>{t("Stay")}</button>
        </div>
      {/if}
      <div class="timeline-wrap"><ServiceTimeline {service} {count} compact={view === "canvas"} /></div>

      {#if view === "canvas"}
        <ServiceCanvas {service} {kindOf} onadd={(sectionId) => (addOpen = { sectionId, kind: "song" })} onedit={edit} />
      {:else}
      <div class="order">
        {#if count === 0 && service.sections.length === 0}
          <div class="start-guide">
            <Icon name="list" size={22} />
            <strong>{t("Build the running order")}</strong>
            <p>{t("Add songs, scripture, slides and announcements with the buttons below, in the order the service goes. On Sunday, Next item moves through them.")}</p>
            <p class="soft">{t("Sections like Welcome or Worship are optional; they group items under a heading.")}</p>
          </div>
        {/if}
        {#each service.sections as section, sectionIndex (section.id)}
          {@const plan = planSchedule(service)}
          {@const slot = plan.slots[sectionIndex]!}
          <section
            class="block"
            role="group"
            aria-label={section.name}
            class:target={session.cursor.sectionId === section.id}
            class:running={session.runningSectionId === section.id}
            class:skipped={section.skip}
            class:dragging={dragSection === section.id}
            class:folded={folded.has(section.id)}
            class:drop-before={dragSection !== null && dropSection === sectionIndex && dragSection !== section.id}
            style:--tone="var(--slot-{sectionIndex % 8})"
            ondragover={(event) => {
              if (dragSection) { event.preventDefault(); dropSection = sectionIndex; }
              else if (dragItem) { event.preventDefault(); dropItem = { sectionId: section.id, index: section.items.length }; }
            }}
            ondragenter={() => { if (dragItem && folded.has(section.id)) toggleFold(section.id); }}
            ondrop={dropHere}
          >
            <header class="block-head">
              <div class="head-main">
              <button
                type="button"
                class="fold"
                class:open={!folded.has(section.id)}
                aria-expanded={!folded.has(section.id)}
                aria-controls="part-body-{section.id}"
                aria-label={folded.has(section.id) ? t("Unfold {name}", { name: section.name }) : t("Fold {name}", { name: section.name })}
                title={folded.has(section.id) ? t("Show what is in this part") : t("Fold this part away")}
                onclick={() => toggleFold(section.id)}
              ><Icon name="chevron-right" size={14} /></button>
              <button
                type="button"
                id="grip-section-{section.id}"
                class="grip"
                draggable="true"
                aria-label={t("Move {name}: drag, or Alt+arrow keys", { name: section.name })}
                title={t("Drag to move this part")}
                ondragstart={(event) => { dragSection = section.id; event.dataTransfer?.setData("text/plain", section.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                ondragend={endDrag}
                onkeydown={(event) => gripKey(event, (direction) => session.moveSection(section.id, direction))}
              ><Icon name="grip" size={14} /></button>
              <span class="dot" aria-hidden="true"></span>
              <input class="section-name" aria-label={t("Section name")} value={section.name} onchange={(event) => session.renameSection(section.id, event.currentTarget.value)} onfocus={() => (session.cursor = { sectionId: section.id, itemId: session.cursor.itemId })} />
              {#if session.runningSectionId === section.id}<span class="now-tag">{t("Now")}</span>{/if}
              {#if section.skip}
                <span class="skip-tag" title={t("Takes no time, Next passes over it, and it is not in the report")}><Icon name="eye-off" size={12} /> {t("Skipped this time")}</span>
              {:else}
                <SectionTime {section} {slot} {plan} tone="var(--slot-{sectionIndex % 8})" showLeft={false} />
              {/if}
              <button type="button" class="part-add" title={t("Add songs, scripture, slides and more to {part} (A adds to the selected part)", { part: section.name })} onclick={() => (addOpen = { sectionId: section.id, kind: "song" })}><Icon name="plus" size={13} /> {t("Add")}</button>
              {#if section.skip}
                <button type="button" class="desk-tag" title={t("Put this part back in the service")} onclick={() => session.setSectionSkip(section.id, false)}><Icon name="eye" size={12} /> {t("Bring back")}</button>
              {:else if session.runningSectionId === section.id && partDesks(session.partRunOf(section)).length > 1}
                {@const run = session.partRunOf(section)}
                <!-- Running and using other desks too: one click to each (the part keeps counting). -->
                <span class="desk-jump" role="group" aria-label={t("Desks for {part}", { part: section.name })}>
                  {#each partDesks(run).filter((desk) => desk !== "service") as desk (desk)}
                    <button type="button" class="desk-tag" class:production={desk === "production"} title={t("Go to the {desk}", { desk: desk === "production" ? t("Production desk") : t("Presenter desk") })} onclick={() => session.goToDesk(desk, run.page)}><Icon name={desk === "production" ? "obs" : "layout"} size={12} /> {desk === "production" ? t("Production") : t("Presenter")}</button>
                  {/each}
                  <button type="button" class="row-tool" aria-label={t("Where it runs")} title={t("Where it runs")} onclick={() => (runPicker = section.id)}><Icon name="settings" size={13} /></button>
                </span>
              {:else if session.partRunOf(section).desk !== "service" || session.partRunOf(section).also?.length}
                {@const run = session.partRunOf(section)}
                <button type="button" class="desk-tag" class:production={run.desk === "production"} title={t("When this part begins, the desk opens there with every tool; the service keeps time. Click to change.")} onclick={() => (runPicker = section.id)}><Icon name={run.desk === "production" ? "obs" : "layout"} size={12} /> {session.partRunLabel(run)}</button>
              {/if}
              <ToolMenu label={t("More for {part}", { part: section.name })} className="row-tool part-menu">
                {#snippet trigger()}<Icon name="more" size={15} />{/snippet}
                {#snippet children(close)}
                  {#if !section.leader?.trim()}
                    <button type="button" role="menuitem" onclick={() => { close(); openLeader(section.id); }}><Icon name="user" size={13} /> {t("Add who leads it")}</button>
                  {/if}
                  <button type="button" role="menuitem" onclick={() => { close(); runPicker = section.id; }}><Icon name="layout" size={13} /> {t("Where it runs")}<span class="menu-hint">{session.partRunLabel(session.partRunOf(section))}</span></button>
                  <button type="button" role="menuitemcheckbox" aria-checked={!!section.skip} onclick={() => { session.setSectionSkip(section.id, !section.skip); close(); }}><Icon name="eye-off" size={13} /> {t("Skip this time")}<span class="menu-hint">{t("No time, not in the report")}</span></button>
                  <div class="menu-sep"></div>
                  <button type="button" role="menuitem" class="danger" onclick={() => { session.removeSection(section.id); close(); }}><Icon name="trash" size={13} /> {t("Delete this part")}</button>
                {/snippet}
              </ToolMenu>
              </div>
              {#if section.leader?.trim() || session.runningSectionId === section.id || leaderOpen === section.id}
                <div class="head-meta" use:focusLeader={leaderOpen === section.id}><PartLeader {section} {slot} {plan} /></div>
              {/if}
              {#if folded.has(section.id)}
                <button type="button" class="fold-summary" onclick={() => toggleFold(section.id)} title={t("Show what is in this part")}>
                  {#if section.items.length === 0}
                    <span class="muted">{t("Nothing in this part yet")}</span>
                  {:else}
                    {#each section.items.slice(0, 3) as item (item.id)}
                      {@const kind = kindOf(item)}
                      <span class="peek" class:live={live(item)}><Icon name={kind.icon} size={11} />{item.title}</span>
                    {/each}
                    {#if section.items.length > 3}<span class="peek more">{t("+{n} more", { n: section.items.length - 3 })}</span>{/if}
                  {/if}
                </button>
              {/if}
            </header>
            {#if !folded.has(section.id)}
            <div class="part-body" id="part-body-{section.id}" transition:slide={unfold}>
            {#if section.items.length === 0}
              <button type="button" class="drop-hint" class:drop-on={dropItem?.sectionId === section.id} onclick={() => { session.cursor = { sectionId: section.id, itemId: null }; if (!dragItem) addOpen = { sectionId: section.id, kind: "song" }; }}><Icon name="plus" size={12} /> {dragItem ? t("Drop here") : t("Add to {part}: songs, scripture, slides, text", { part: section.name })}</button>
            {/if}
            <ol class="items">
              {#each section.items as item, itemIndex (item.id)}
                {@const kind = kindOf(item)}
                <li
                  class="item"
                  class:on={session.cursor.itemId === item.id && !live(item)}
                  class:live={live(item)}
                  class:dragging={dragItem === item.id}
                  class:drop-before={dragItem !== null && dropItem?.sectionId === section.id && dropItem.index === itemIndex}
                  class:drop-after={dragItem !== null && dropItem?.sectionId === section.id && dropItem.index === itemIndex + 1 && itemIndex === section.items.length - 1}
                  ondragover={(event) => overItem(event, section.id, itemIndex)}
                  ondrop={dropHere}
                >
                  <button
                    type="button"
                    id="grip-item-{item.id}"
                    class="grip"
                    draggable="true"
                    aria-label={t("Move {title}: drag, or Alt+arrow keys", { title: item.title })}
                    title={t("Drag to move (into any part)")}
                    ondragstart={(event) => { dragItem = item.id; event.dataTransfer?.setData("text/plain", item.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                    ondragend={endDrag}
                    onkeydown={(event) => gripKey(event, (direction) => session.moveItem(item.id, direction))}
                  ><Icon name="grip" size={14} /></button>
                  <button type="button" class="item-main" onclick={(event) => open(item, event)} ondblclick={() => edit(item.id)} title={t("Click for Preview; double-click to edit")}>
                    <ItemThumb {item} icon={kind.icon} label={kind.label} />
                    <span class="item-copy">
                      <strong>{item.title}</strong>
                      {#if item.kind === "lyric" && songOf(item)}
                        <span class="mini-map" aria-label={t("Song map")}>
                          {#each songOf(item)!.sections as part (part.id)}<i style:--tone="var(--sec-{sectionTone(part)})" title={part.label}>{sectionShort(part)}</i>{/each}
                        </span>
                      {:else}
                        <em>{detail(item)}</em>
                      {/if}
                      {#if hint(item)}<span class="next-hint">{hint(item)}</span>{/if}
                    </span>
                    {#if live(item)}<span class="badge live-badge"><i aria-hidden="true"></i>{t("LIVE")}</span>{:else if session.cursor.itemId === item.id}<span class="badge preview-badge">{t("Preview")}</span>{/if}
                  </button>
                  <span class="tools">
                    {#if item.kind === "bible" && item.bible}
                      {@const span = item.bible.endVerse - item.bible.startVerse + 1}
                      {@const per = session.perScreenOf(item.bible)}
                      {@const reading = session.cursor.itemId === item.id || live(item) ? session.readingNow() : null}
                      {#if reading && reading.itemId === item.id && reading.count > 1}
                        <span class="verse-at" title={t("Screen on LIVE and on Preview. Next shows the next verses.")}>
                          {#if reading.live}<b class="at-live">{reading.live}</b>{/if}{#if reading.preview && reading.preview !== reading.live}<b class="at-preview">{reading.preview}</b>{/if}<span>{t("of {n}", { n: reading.count })}</span>
                        </span>
                      {/if}
                      <button type="button" class="row-tool" aria-label={t("Open {title} on the Presenter page", { title: item.title })} title={t("Open on the Presenter page: its Bible, verse list and search. The service keeps time.")} onclick={() => session.openReadingOnPresenter(item.id)}><Icon name="expand" size={13} /></button>
                      {#if span > 1}
                        <label class="per-screen" title={t("How many verses each screen shows; Next steps to the next ones")}>
                          <select aria-label={t("Verses per screen for {title}", { title: item.title })} value={item.bible.perScreen === undefined ? "auto" : String(item.bible.perScreen)} onchange={(event) => void session.setVersesPerScreen(item.id, event.currentTarget.value === "auto" ? null : Number(event.currentTarget.value))}>
                            <option value="auto">{per ? t("Auto · {n} a screen", { n: per }) : t("Auto · one screen")}</option>
                            <option value="0">{t("All verses")}</option>
                            {#each [1, 2, 3, 4, 5, 6, 8, 10].filter((n) => n < span) as n (n)}<option value={String(n)}>{tn(n, "{n} verse a screen", "{n} verses a screen")}</option>{/each}
                          </select>
                        </label>
                      {/if}
                    {/if}
                    {#if item.kind === "deck" && item.deck}
                      {@const looping = session.deckLoop?.deckId === item.deck.deckId}
                      <button type="button" class="loop" class:on={looping} title={looping ? t("Stop the loop") : t("Play on the screen by itself, a page every 8 seconds, round and round")} onclick={() => (looping ? session.stopDeckLoop() : void session.startDeckLoop(item.deck!.deckId, 8))}>
                        <Icon name="refresh" size={12} /> {looping ? t("Stop loop") : t("Loop")}
                      </button>
                    {/if}
                    <button type="button" class="row-tool" aria-label={t("Edit {title}", { title: item.title })} title={t("Edit")} onclick={() => edit(item.id)}><Icon name="pencil" size={13} /></button>
                    <button type="button" class="row-tool del" aria-label={t("Remove {title}", { title: item.title })} title={t("Delete")} onclick={() => session.deleteItem(item.id)}><Icon name="trash" size={14} /></button>
                  </span>
                </li>
              {/each}
            </ol>
            </div>
            {/if}
          </section>
        {/each}

        <form class="add-section" class:quiet={count === 0 && service.sections.length === 0} onsubmit={(event) => { event.preventDefault(); if (sectionName.trim()) session.addSection(sectionName.trim()); sectionName = ""; }}>
          <input aria-label={t("New section")} placeholder={t("Add a section")} bind:value={sectionName} />
          {#each SUGGESTED.filter((name) => !service.sections.some((section) => section.name === name)).slice(0, 4) as name (name)}
            <button type="button" class="chip" onclick={() => session.addSection(name)}>{name}</button>
          {/each}
        </form>
      </div>
      {/if}

      {#if view === "canvas"}
      <footer class="add-bar">
        <label class="add-to">
          <span>{t("Add to")}</span>
          <select aria-label={t("Part to add to")} value={barPart ?? ""} onchange={(event) => (session.cursor = { sectionId: event.currentTarget.value, itemId: session.cursor.itemId })}>
            {#each service.sections as section (section.id)}<option value={section.id}>{section.name}</option>{/each}
          </select>
        </label>
        <div class="tiles">
          {#each ADD_TILES as [id, label, icon] (id)}
            <button type="button" class="tile" disabled={!barPart} onclick={() => (addOpen = { sectionId: barPart, kind: id })}><Icon name={icon} size={16} /><span>{t(label)}</span></button>
          {/each}
        </div>
      </footer>
      {/if}
    {:else}
      <div class="blank">
        <Icon name="list" size={28} />
        <p>{t("Plan the whole service in order: welcome, songs, the reading, the sermon, announcements.")}</p>
        {#if session.workspace.serviceTemplates.length}
          <p class="from-label">{t("Start from a template, with its parts and times in place")}</p>
          <div class="from-templates">
            {#each session.workspace.serviceTemplates as template (template.id)}
              <button type="button" class="tpl-card" onclick={() => void session.createServiceFromTemplate(template.id)}>
                <strong>{template.name}</strong>
                <span>{template.parts.map((part) => part.name).slice(0, 4).join(" · ")}{template.parts.length > 4 ? " …" : ""}</span>
              </button>
            {/each}
            <button type="button" class="tpl-card edit" onclick={() => (templatesOpen = { id: null })}><strong>{t("Edit templates")}</strong><span>{t("Change the parts and times")}</span></button>
          </div>
          <p class="from-label">{t("Or a blank one")}</p>
        {/if}
        <form class="inline" onsubmit={(event) => { event.preventDefault(); void session.createService(newName.trim() || t("Sunday Service")); newName = ""; }}>
          <input aria-label={t("Service name")} placeholder={t("Sunday Service")} bind:value={newName} />
          <button type="submit" class="desk-btn primary-soft">{t("Start a service")}</button>
        </form>
      </div>
    {/if}
  </div>

  {#if stageHidden}
    <aside class="stage-rail">
      <button type="button" class="rail-show" aria-label={t("Show the monitors")} title={t("Show the monitors")} onclick={() => setStage(false)}><Icon name="chevron-left" size={16} /></button>
      <span class="rail-title">{t("Preview")} · {t("Program")}</span>
    </aside>
  {:else}
  <aside class="stage">
    <QuickVerse />
    <MonitorPair page="service" place={current?.title ?? ""} onstep={(direction) => void session.step(direction)} />
    <div class="next">
      <span class="kicker">{reading?.next ? t("Next verses") : t("Up next")}</span>
      {#if reading?.next}
        <div class="next-card reading-next">
          <span class="screen-dots" aria-hidden="true">
            {#each Array.from({ length: Math.min(reading.count, 12) }, (_, i) => i + 1) as n (n)}<i class:done={reading.live !== null && n <= reading.live} class:next={n === reading.nextIndex}></i>{/each}
          </span>
          <span class="next-copy">
            <strong>{reading.next}</strong>
            <em>{t("Screen {n} of {count}", { n: reading.nextIndex ?? 1, count: reading.count })}{upNext ? ` · ${t("then {title}", { title: upNext.title })}` : ""}</em>
          </span>
        </div>
      {:else if upNext}
        {@const kind = kindOf(upNext)}
        {@const nextPart = service?.sections.find((section) => section.items.some((entry) => entry.id === upNext.id))}
        <div class="next-card">
          <ItemThumb item={upNext} icon={kind.icon} label={kind.label} />
          <span class="next-copy">
            <strong>{upNext.title}</strong>
            <em>{kind.label}{nextPart && nextPart.id !== session.cursor.sectionId ? ` · ${t("starts {part}", { part: nextPart.name })}` : ""}</em>
          </span>
        </div>
      {:else}
        <strong class="next-none">{!service || count === 0 ? t("Nothing added yet") : t("End of the service")}</strong>
      {/if}
      <div class="item-steps">
        <button type="button" class="desk-btn" disabled={!service} onclick={() => void session.stepItem(-1)} title={t("Previous item (Page Up)")}><Icon name="chevron-left" size={15} /> {t("Previous")}</button>
        {#if reading?.next}
          <button type="button" class="desk-btn next-btn" onclick={() => void session.step(1)} title={t("The next verses (→). Page Down skips to the next item.")}>{reading.live !== null || session.liveOnClick ? t("Next verses to LIVE") : t("Next verses")} <Icon name="chevron-right" size={15} /></button>
        {:else}
          <button type="button" class="desk-btn next-btn" disabled={!upNext} onclick={() => void session.stepItem(1)} title={t("Next item (Page Down)")}>{session.liveOnClick ? t("Next to LIVE") : t("Next item")} <Icon name="chevron-right" size={15} /></button>
        {/if}
      </div>
      {#if reading?.next && upNext}<button type="button" class="skip-reading" onclick={() => void session.stepItem(1)} title={t("Leave the reading and go to the next item (Page Down)")}>{t("Skip to {title}", { title: upNext.title })} <Icon name="chevron-right" size={12} /></button>{/if}
    </div>
    <details class="more-tools">
      <summary><Icon name="chevron-right" size={13} /> {t("More tools")}<span class="muted">{t("Follow the sermon, macros")}</span></summary>
      <FollowSermon />
      <MacroBar />
    </details>
  </aside>
  {/if}
</section>

{#if runPicker}
  <PartRunPicker sectionId={runPicker} onclose={() => (runPicker = null)} />
{/if}

{#if addOpen}
  <AddSourcesDialog sectionId={addOpen.sectionId} kind={addOpen.kind} onclose={() => (addOpen = null)} />
{/if}

{#if outlineOpen && session.service}
  <OutlineDialog service={session.service} onclose={() => (outlineOpen = false)} />
{/if}
{#if settingsOpen && session.service}
  <ServiceSettings service={session.service} onclose={() => (settingsOpen = false)} />
{/if}
{#if startOpen && session.service}
  <StartServiceDialog service={session.service} onclose={() => (startOpen = false)} />
{/if}
{#if reportOpen && session.service}
  <ServiceReport service={session.service} onclose={() => (reportOpen = false)} />
{/if}
{#if templatesOpen}
  <TemplatesDialog initialId={templatesOpen.id} onclose={() => (templatesOpen = null)} />
{/if}

<style>
  .service-desk {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(280px, 380px);
    gap: var(--gap, 10px);
    padding: var(--gap, 10px) var(--panel-pad, 12px) var(--panel-pad, 12px);
  }
  .sheet, .stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
    overflow: hidden;
  }
  input { border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; min-width: 0; }
  input { height: 32px; padding: 0 10px; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .empty { margin: 0; padding: 8px 6px; color: var(--muted); font-size: 12px; }

  .list { margin: 0; padding: 0 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .list > :global(*) { flex: none; }
  .row { position: relative; width: 100%; display: flex; align-items: center; gap: 11px; padding: 9px 10px; border: 1px solid transparent; border-radius: 10px; background: none; color: var(--ink); text-align: left; font: inherit; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
  .row:hover { background: var(--field); }
  .row.on { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, var(--panel)); }
  .row.on::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--accent); }
  .row.live { border-color: color-mix(in srgb, #30a46c 55%, var(--line)); background: color-mix(in srgb, #30a46c 9%, var(--panel)); }
  .row.live::before { background: #30a46c; }
  /* A small calendar leaf: the day it last ran (or was edited). */
  .svc-date { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 38px; height: 40px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); line-height: 1; }
  .svc-date small { font-size: 9px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .svc-date b { margin-top: 3px; font-size: 16px; font-weight: 750; font-variant-numeric: tabular-nums; }
  .row.on .svc-date { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .row.on .svc-date small { color: var(--accent); }
  .row.live .svc-date small { color: #30a46c; }
  .svc-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .svc-copy strong { font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .svc-meta, .svc-when, .svc-copy .running-clock { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .svc-meta { color: var(--ink); opacity: 0.75; font-variant-numeric: tabular-nums; }
  .svc-meta em { font-style: normal; color: var(--muted); }
  .svc-when { color: var(--muted); }

  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); flex: none; }
  .title { flex: 1 1 160px; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
  .name { flex: 0 1 auto; width: 100%; min-width: 120px; height: 38px; font-size: 17px; font-weight: 700; border-color: transparent; background: none; text-overflow: ellipsis; }
  .head :global(.more), .panel-toggle { width: 32px; height: 30px; padding: 0; display: grid; place-items: center; flex: none; }
  .panel-toggle { color: var(--muted); }
  .panel-toggle[aria-pressed="false"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  /* A narrow middle pane: the header keeps one row, buttons keep their icon and tooltip. */
  .sheet { container-type: inline-size; }
  @container (max-width: 820px) {
    .views .view-name, .labelled .lbl { display: none; }
    .views button { padding: 0 8px; }
    .labelled { width: 32px; padding: 0; justify-content: center; }
  }
  @container (max-width: 640px) {
    .auto-live { font-size: 0; gap: 0; }
  }
  .labelled { display: inline-flex; align-items: center; gap: 6px; height: 30px; flex: none; }
  .head :global(.menu .menu-hint) { margin-left: auto; padding-left: 14px; font-size: 11px; color: var(--muted); }
  .head :global(.menu button) { display: flex; align-items: center; gap: 8px; }
  .name:hover, .name:focus { border-color: var(--line); background: var(--field); }

  .timeline-wrap { flex: none; padding: 12px 14px 0; }
  .order { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .order > :global(*) { flex: none; }
  .block { border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 50%, var(--panel)); }
  .block { position: relative; }
  .block.running { border-color: color-mix(in srgb, #30a46c 45%, var(--line)); box-shadow: inset 4px 0 0 #30a46c; }
  .block.running .block-head { background: color-mix(in srgb, #30a46c 8%, transparent); border-radius: 10px 10px 0 0; }
  .block.running .section-name { color: var(--ink); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone, var(--muted)); flex: none; margin-left: 6px; }
  .now-tag { flex: none; height: 20px; padding: 0 8px; border-radius: 10px; background: #30a46c; color: #fff; font-size: 11px; font-weight: 750; display: inline-flex; align-items: center; letter-spacing: 0.02em; }
  /* The same colours as the timeline, by a section's place in the service. */
  .service-desk { --slot-0: #5aa0d6; --slot-1: #b07cc6; --slot-2: #e0884e; --slot-3: #58b3a4; --slot-4: #d9677a; --slot-5: #c9a35b; --slot-6: #7d8fe0; --slot-7: #7fa36b; }
  .block.target:not(.running) { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  .block-head { display: grid; gap: 2px; padding: 6px 8px 6px 6px; border-bottom: 1px solid var(--line); }
  .head-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .fold { flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--muted); cursor: pointer; }
  .fold :global(svg) { transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1); }
  .fold.open :global(svg) { transform: rotate(90deg); }
  .fold:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .fold:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .block.folded .block-head { border-bottom: 0; }
  .fold-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin: 2px 0 2px 36px; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .peek { display: inline-flex; align-items: center; gap: 5px; max-width: 200px; height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 11px; background: var(--field); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .peek :global(svg) { flex: none; color: var(--muted); }
  .peek.live { border-color: color-mix(in srgb, var(--live, #fa4f00) 60%, transparent); }
  .peek.more { color: var(--muted); }
  .fold-summary:hover .peek { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  .part-body { overflow: hidden; }
  @media (prefers-reduced-motion: reduce) { .fold :global(svg) { transition: none; } }
  .head-meta { padding: 0 0 2px 36px; min-width: 0; }
  .head-main :global(.part-menu) { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; }
  .head-main :global(.part-menu:hover) { background: var(--field); color: var(--ink); }
  .head-main :global(.menu button) { display: flex; align-items: center; gap: 8px; }
  .head-main :global(.menu .menu-hint) { margin-left: auto; padding-left: 14px; font-size: 11px; color: var(--muted); }
  .head-main :global(.menu .danger) { color: var(--danger, #e5484d); }
  .section-name { flex: 1 1 120px; min-width: 80px; height: 30px; border-color: transparent; background: none; font-size: 14px; font-weight: 750; letter-spacing: 0; color: var(--ink); text-overflow: ellipsis; }
  .section-name:focus { border-color: var(--line); background: var(--field); color: var(--ink); }
  .tools { display: flex; gap: 2px; flex: none; }
  .row-tool { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .row-tool:hover:not(:disabled) { background: var(--field); color: var(--ink); }
  .row-tool:disabled { opacity: 0.3; }
  .drop-hint { display: flex; align-items: center; gap: 6px; width: calc(100% - 12px); height: 30px; margin: 4px 6px 6px; padding: 0 10px; border: 1px dashed transparent; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .drop-hint:hover, .drop-hint:focus-visible { border-color: var(--line); color: var(--ink); background: var(--field); }
  .items { list-style: none; margin: 0; padding: 4px; display: grid; gap: 2px; }
  .items :global(.item-thumb) { width: 68px; }
  /* Edit and delete show on the row in hand (hovered, selected or live), not on every row. */
  .item .row-tool { opacity: 0; transition: opacity 0.12s ease; }
  .item:hover .row-tool, .item:focus-within .row-tool, .item.on .row-tool, .item.live .row-tool { opacity: 1; }
  @media (hover: none) { .item .row-tool { opacity: 1; } }
  .item { display: flex; align-items: center; gap: 4px; border: 1px solid transparent; border-radius: 8px; }
  .item:hover { background: var(--field); }
  .item.on { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); box-shadow: inset 4px 0 0 var(--accent); }
  .item.live { border-color: color-mix(in srgb, var(--live, #e5484d) 55%, transparent); background: color-mix(in srgb, var(--live, #e5484d) 11%, var(--panel)); box-shadow: inset 4px 0 0 var(--live, #e5484d); }
  .item.live .item-copy strong { font-weight: 750; }
  .next-hint { justify-self: start; margin-top: 2px; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, var(--ink) 9%, transparent); color: var(--ink); font-size: 11px; font-weight: 650; white-space: nowrap; }
  .item-main { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 5px 8px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .item-copy { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .item-copy strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-map { display: flex; gap: 2px; overflow: hidden; }
  .mini-map i { flex: none; padding: 0 4px; border-radius: 3px; background: color-mix(in srgb, var(--tone) 26%, var(--field)); color: var(--ink); font-style: normal; font-size: 10px; font-weight: 700; line-height: 15px; }
  .item-copy em { font-style: normal; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex: none; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 10px; font-weight: 750; }
  .live-badge { display: inline-flex; align-items: center; gap: 5px; background: var(--live); color: #fff; letter-spacing: 0.04em; }
  .live-badge i { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: live-dot 1.4s ease-in-out infinite; }
  @keyframes live-dot { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .live-badge i { animation: none; } }
  .preview-badge { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .loop { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; margin-right: 4px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .loop:hover { color: var(--ink); border-color: var(--accent); }
  .loop.on { border-color: var(--live); color: var(--live); background: color-mix(in srgb, var(--live) 10%, transparent); }
  .start-guide { display: grid; justify-items: center; gap: 8px; max-width: 460px; margin: 48px auto 24px; text-align: center; color: var(--muted); }
  .start-guide strong { color: var(--ink); font-size: 16px; }
  .start-guide p { margin: 0; font-size: 13px; line-height: 1.5; }
  .start-guide .soft { font-size: 12px; opacity: 0.85; }
  .add-section.quiet { opacity: 0.75; }
  .add-section { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .add-section input { width: 180px; }
  .chip { height: 28px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .chip:hover { color: var(--ink); border-color: var(--accent); }

  .add-bar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--line); flex: none; background: color-mix(in srgb, var(--field) 35%, transparent); }
  .add-to { display: flex; align-items: center; gap: 8px; flex: none; }
  .add-to span { font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .add-to select { height: 34px; max-width: 170px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .tiles { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; height: 50px; padding: 0 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; min-width: 0; }
  .tile span { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile :global(svg) { color: var(--muted); }
  .tile:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
  .tile:hover:not(:disabled) :global(svg) { color: var(--accent); }
  .tile:disabled { opacity: 0.45; cursor: default; }
  /* A part left out this time: still in the order (to bring back), but quiet and dashed. */
  .block.skipped { border-style: dashed; background: transparent; }
  .block.skipped .block-head { border-bottom-style: dashed; }
  .block.skipped .section-name { color: var(--muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent); }
  .block.skipped .dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
  .block.skipped .part-body, .block.skipped .head-meta, .block.skipped .fold-summary { opacity: 0.45; }
  .block.skipped .part-add { display: none; }
  .skip-tag { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 26px; padding: 0 9px; border: 1px dashed var(--line); border-radius: 13px; color: var(--muted); font-size: 12px; font-weight: 650; white-space: nowrap; }
  .desk-tag { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 26px; padding: 0 9px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 13px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .desk-tag:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .desk-jump { display: inline-flex; align-items: center; gap: 4px; flex: none; }
  .desk-tag.production { border-color: color-mix(in srgb, #a855f7 50%, var(--line)); background: color-mix(in srgb, #a855f7 12%, transparent); }
  .head-main :global(.menu .menu-note) { margin: 6px 10px 2px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .part-add { display: inline-flex; align-items: center; gap: 4px; flex: none; height: 26px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .part-add:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent); }
  .service-desk.no-stage { grid-template-columns: auto minmax(0, 1fr) auto; }
  .stage { position: relative; }
  .stage-rail { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 40px; padding: 8px 0; border: 1px solid var(--line); border-radius: var(--radius-panel, 12px); background: var(--panel); }
  .rail-show { width: 28px; height: 28px; border: 0; border-radius: 7px; background: var(--field); color: var(--ink); display: grid; place-items: center; cursor: pointer; }
  .rail-title { writing-mode: vertical-rl; font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.02em; }
  @media (max-width: 1100px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } .tile { height: 40px; flex-direction: row; } }
  .inline { display: flex; gap: 6px; }
  .inline input { flex: 1; }

  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 12px; padding: 24px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; max-width: 40ch; }

  .stage { padding: 12px; gap: 12px; overflow: auto; }
  .next { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); flex: none; }
  .next-card { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .next-card :global(.item-thumb) { width: 112px; }
  .next-copy { display: grid; gap: 3px; min-width: 0; }
  .next-copy em { font-style: normal; font-size: 12px; color: var(--muted); }
  .next-none { font-size: 15px; }
  .kicker { font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .next-copy strong { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .next-btn { border-color: var(--accent); background: var(--accent); color: var(--on-accent); height: 40px; font-weight: 750; }
  .next-btn:disabled { opacity: 0.45; }
  .more-tools { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); padding: 8px 10px; }
  .more-tools summary { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; cursor: pointer; list-style: none; }
  .more-tools summary::-webkit-details-marker { display: none; }
  .more-tools summary :global(svg) { transition: transform 0.2s; }
  .more-tools[open] summary :global(svg) { transform: rotate(90deg); }
  .more-tools summary .muted { margin-left: auto; font-weight: 500; font-size: 11px; }
  .item-steps { display: flex; gap: 6px; }
  .item-steps :global(.desk-btn) { flex: 1; justify-content: center; }

  @media (max-width: 1280px) {
    .service-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
  }
  .views { display: inline-flex; flex: none; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; }
  .views button { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .views button[aria-checked="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
  .running-clock { display: inline-flex; align-items: center; gap: 5px; color: #30a46c !important; font-weight: 700; font-variant-numeric: tabular-nums; }
  .running-clock i { width: 6px; height: 6px; border-radius: 50%; background: #30a46c; }
  .key-hints { display: flex; flex-wrap: nowrap; overflow: hidden; gap: 4px 14px; margin: 6px 14px 0; font-size: 11px; color: var(--muted); opacity: 0.75; mask-image: linear-gradient(90deg, #000 85%, transparent); }
  .key-hints:hover { opacity: 1; }
  .key-hints span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .key-hints kbd { min-width: 18px; padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--field); color: var(--ink); font: inherit; font-size: 10px; font-weight: 700; text-align: center; }
  .time-up { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; margin: 10px 14px 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, #f5a524 60%, var(--line)); border-radius: 12px; background: color-mix(in srgb, #f5a524 14%, var(--panel)); animation: time-up-in 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
  .time-up-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #f5a524; color: #111; animation: time-up-pulse 1.6s ease-out infinite; }
  .time-up-copy { flex: 1 1 200px; display: grid; gap: 1px; min-width: 0; }
  .time-up-copy strong { font-size: 14px; }
  .time-up-copy em { font-style: normal; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .tu-btn { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .tu-btn.primary { border-color: #f5a524; background: #f5a524; color: #111; }
  .tu-btn.ghost { background: none; }
  @keyframes time-up-in { from { opacity: 0; transform: translateY(-6px); } }
  @keyframes time-up-pulse { 0% { box-shadow: 0 0 0 0 rgb(245 165 36 / 0.6); } 100% { box-shadow: 0 0 0 10px rgb(245 165 36 / 0); } }
  @media (prefers-reduced-motion: reduce) { .time-up, .time-up-icon { animation: none; } }
  .auto-live { display: inline-flex; align-items: center; gap: 7px; flex: none; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .auto-live.on { color: var(--ink); border-color: color-mix(in srgb, var(--live, #fa4f00) 55%, var(--line)); }
  .switch { position: relative; width: 26px; height: 15px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 22%, transparent); transition: background 0.15s; }
  .switch i { position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
  .auto-live.on .switch { background: var(--live, #fa4f00); }
  .auto-live.on .switch i { transform: translateX(11px); }
  .per-screen select { height: 24px; max-width: 132px; padding: 0 4px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 11px; }
  .verse-at { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 7px; background: color-mix(in srgb, var(--ink) 8%, transparent); font-size: 11px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .verse-at b { min-width: 16px; padding: 0 4px; border-radius: 5px; text-align: center; color: #fff; }
  .verse-at .at-live { background: var(--live, #e5484d); }
  .verse-at .at-preview { background: #30a46c; }
  .verse-at span { color: var(--muted); }
  .screen-dots { display: grid; grid-template-columns: repeat(4, 8px); gap: 4px; flex: none; padding: 6px; }
  .screen-dots i { width: 8px; height: 8px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .screen-dots i.done { background: color-mix(in srgb, var(--live, #e5484d) 70%, transparent); }
  .screen-dots i.next { background: #30a46c; box-shadow: 0 0 0 2px color-mix(in srgb, #30a46c 35%, transparent); }
  .skip-reading { justify-self: end; display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .skip-reading:hover { color: var(--ink); text-decoration: underline; }
  .end { flex: none; height: 30px; font-size: 12px; border-color: var(--danger, #e5484d); color: var(--danger, #e5484d); background: none; }
  .end.armed { background: var(--danger, #e5484d); color: #fff; }
  .start { flex: none; height: 30px; font-size: 12px; border-color: #30a46c; background: #30a46c; color: #fff; }
  .queued { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px 0 10px; border: 1px solid color-mix(in srgb, #30a46c 55%, var(--line)); border-radius: 15px; background: color-mix(in srgb, #30a46c 12%, transparent); font-size: 12px; font-variant-numeric: tabular-nums; }
  .queued i { width: 7px; height: 7px; border-radius: 50%; background: #30a46c; }
  .queued button { height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 11px; background: var(--panel); color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; }
  .from-label { margin: 6px 0 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .from-templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; width: min(640px, 100%); }
  .tpl-card { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; }
  .tpl-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .tpl-card strong { font-size: 14px; }
  .tpl-card span { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .tpl-card.edit { border-style: dashed; background: none; }
  .svc { position: relative; flex: none; }
  .svc-group { margin: 8px 6px 2px; font-size: 11px; font-weight: 750; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
  .svc-find { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--muted); }
  .svc-find input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; outline: none; }
  .svc .row { padding-right: 10px; }
  .svc:hover .row, .svc:focus-within .row { padding-right: 64px; }
  .svc-tools { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); display: none; gap: 2px; }
  .svc:hover .svc-tools, .svc:focus-within .svc-tools, .svc-tools:has(.armed) { display: inline-flex; }
  .svc-tools .armed { width: auto; padding: 0 8px; color: var(--danger, #e5484d); font-size: 12px; font-weight: 700; }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--field); }
  .grip:active { cursor: grabbing; }
  .block.dragging, .item.dragging { opacity: 0.4; }
  .block.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .item.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .item.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .drop-hint.drop-on { border-color: var(--accent); color: var(--accent); }
  .row-tool.del:hover { color: var(--danger, #e5484d); }
</style>
