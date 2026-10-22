<script lang="ts">
  import RichView from "../RichView.svelte";
  import { session } from "../../app/session.svelte";
  import { sermonClock, watchClock } from "../../app/sermon-clock.svelte";
  import { clockText, paceOf, sectionSpent } from "../../domain/sermon-clock";
  import { duplicateSermon, plannedMinutes, searchSermonHits, sermonAudienceItem, sermonSeries } from "../../domain/sermon";
  import type { Sermon, SermonSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import ItemThumb from "./ItemThumb.svelte";
  import MonitorPair from "./MonitorPair.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import SearchField from "./SearchField.svelte";
  import SermonEditor from "./sermon/SermonEditor.svelte";
  import SermonPreach from "./sermon/SermonPreach.svelte";
  import SermonRail from "./sermon/SermonRail.svelte";
  import { t, tn } from "../../i18n/core";

  // Sermon window: a library of sermons (by series), the outline as a timeline and cards (what the
  // audience sees, its time, and the notes that stay on this desk), Preach mode for running it,
  // and the speaker's notes beside Preview and Program. Notes never reach Preview or Program.

  let { translationId = "kjv" }: { translationId?: string } = $props();

  let query = $state("");
  let selectedId = $state<string | null>(null);
  /** The editor: a sermon to change, "new" for a blank one, or closed. */
  let editing = $state<Sermon | "new" | null>(null);
  let preaching = $state(false);
  let note = $state("");
  let armed = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let seriesFilter = $state<string | null>(null);

  $effect(() => watchClock());

  const series = $derived(sermonSeries(session.sermons));
  const sermons = $derived([...session.sermons].filter((doc) => !seriesFilter || doc.series === seriesFilter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  const hits = $derived(query.trim() ? searchSermonHits(session.sermons, query) : []);
  let hitIndex = $state(-1);
  $effect(() => {
    query;
    hitIndex = -1;
  });

  /** Sermons by when they were last edited. */
  const groups = $derived.by(() => {
    const now = Date.now();
    const day = 86_400_000;
    const buckets: { label: string; items: Sermon[] }[] = [
      { label: t("This week"), items: [] },
      { label: t("This month"), items: [] },
      { label: t("Earlier"), items: [] },
    ];
    for (const doc of sermons) {
      const age = now - new Date(doc.updatedAt).getTime();
      buckets[age < 7 * day ? 0 : age < 31 * day ? 1 : 2]!.items.push(doc);
    }
    return buckets.filter((bucket) => bucket.items.length > 0);
  });

  function navigate(key: "up" | "down" | "enter") {
    if (query.trim()) {
      if (hits.length === 0) return;
      if (key === "enter") {
        const hit = hits[Math.max(0, hitIndex)]!;
        openHit(hit.sermonId, hit.sectionId);
        return;
      }
      hitIndex = Math.min(hits.length - 1, Math.max(0, hitIndex + (key === "down" ? 1 : -1)));
    } else {
      const order = groups.flatMap((group) => group.items);
      if (order.length === 0) return;
      const at = order.findIndex((doc) => doc.id === selectedId);
      if (key === "enter") {
        const doc = at >= 0 ? order[at]! : order[0]!;
        pick(doc.id);
        if (doc.sections[0]) show(doc, doc.sections[0].id);
        return;
      }
      pick(order[at < 0 ? 0 : Math.min(order.length - 1, Math.max(0, at + (key === "down" ? 1 : -1)))]!.id);
    }
    requestAnimationFrame(() => document.querySelector(".list .row.on")?.scrollIntoView({ block: "nearest" }));
  }
  const selected = $derived(session.sermons.find((entry) => entry.id === selectedId) ?? null);
  const focus = $derived(session.sermonFocus);
  const programSource = $derived(session.live.program.sourceId ?? "");
  const programLive = $derived(!session.programHeld && session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  const liveSectionOf = (doc: Sermon) => (programLive && programSource.startsWith(`sermon:${doc.id}:`) ? programSource.slice(`sermon:${doc.id}:`.length) : null);
  const focusSection = $derived.by(() => {
    const doc = focus ? session.sermons.find((entry) => entry.id === focus.sermonId) : null;
    return doc?.sections.find((entry) => entry.id === focus?.sectionId) ?? null;
  });
  const deskNotes = $derived(session.sermonDeskNotes());
  const deskNotesDoc = $derived(session.sermonDeskNotesRich());
  const place = $derived.by(() => {
    const doc = focus ? session.sermons.find((entry) => entry.id === focus.sermonId) : null;
    const index = doc?.sections.findIndex((entry) => entry.id === focus?.sectionId) ?? -1;
    return doc && index >= 0 ? `${doc.sections[index]!.name} · ${index + 1} of ${doc.sections.length}` : "";
  });
  const clock = $derived(selected && sermonClock.value?.sermonId === selected.id ? sermonClock.value : null);

  $effect(() => {
    const current = session.sermonFocus;
    if (current && !editing) selectedId = current.sermonId;
  });
  $effect(() => {
    if (!selected) preaching = false;
  });

  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!note) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ""), 6000);
    return () => clearTimeout(noteTimer);
  });

  function arm(key: string): boolean {
    clearTimeout(armTimer);
    if (armed === key) {
      armed = null;
      return true;
    }
    armed = key;
    armTimer = setTimeout(() => (armed = null), 3000);
    return false;
  }

  function when(iso: string): string {
    const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /** What the audience sees for a saved section, in a few words. */
  function audience(section: SermonSection): { icon: string; kind: string; title: string; body: string } {
    const item = sermonAudienceItem(section);
    if (item.kind === "bible") return { icon: "bible", kind: t("Scripture"), title: item.bible?.reference ?? item.title, body: "" };
    if (item.kind === "image") {
      const asset = session.media.find((entry) => entry.id === item.image?.assetId);
      return { icon: "media", kind: t("Picture"), title: asset?.name ?? item.title, body: "" };
    }
    return { icon: "stage", kind: t("Slide"), title: item.slide?.heading || item.title, body: item.slide?.body ?? "" };
  }

  function pick(id: string) {
    editing = null;
    selectedId = id;
  }

  function show(doc: Sermon, sectionId: string) {
    void session.previewSermonSection(doc, sectionId);
  }

  async function showAndTake(doc: Sermon, sectionId: string) {
    await session.previewSermonSection(doc, sectionId);
    await session.take();
  }

  function openHit(sermonId: string, sectionId: string) {
    const doc = session.sermons.find((entry) => entry.id === sermonId);
    if (!doc) return;
    pick(doc.id);
    show(doc, sectionId);
  }

  async function queueAll(doc: Sermon) {
    const part = await session.pickServicePart(tn(doc.sections.length, "{title} · {n} section", "{title} · {n} sections", { title: doc.title }));
    if (!part) return;
    for (const section of doc.sections) session.addSermonSection(section, `${doc.title} — ${section.name}`, part);
    note = tn(doc.sections.length, "{n} section added to the service. Notes were not added.", "{n} sections added to the service. Notes were not added.");
  }

  async function queueOne(doc: Sermon, section: SermonSection) {
    const part = await session.pickServicePart(`${doc.title} — ${section.name}`);
    if (!part) return;
    session.addSermonSection(section, `${doc.title} — ${section.name}`, part);
    note = t("{name} added to the service. Notes were not added.", { name: section.name });
  }

  async function remove(doc: Sermon) {
    if (!arm(`sermon:${doc.id}`)) return;
    await session.deleteSermon(doc.id);
    selectedId = null;
    note = t("{title} deleted.", { title: doc.title });
  }

  async function duplicate(doc: Sermon) {
    const copy = duplicateSermon(doc, t("{title} (copy)", { title: doc.title }));
    if (await session.saveSermon(copy)) {
      selectedId = copy.id;
      note = t("A copy of {title} is ready to change.", { title: doc.title });
    }
  }

  async function preach(doc: Sermon) {
    preaching = true;
    if (focus?.sermonId !== doc.id && doc.sections[0]) await session.previewSermonSection(doc, doc.sections[0].id);
  }

  function closeEditor(savedId: string | null) {
    if (savedId) selectedId = savedId;
    editing = null;
  }
</script>

<section class="sermon-desk" class:preaching>
  {#if !preaching}
  <!-- Library -->
  <LibrarySidebar title={t("Sermons")} icon="book" count={session.sermons.length} storageKey="sermons">
    {#snippet actions()}
      <button type="button" class="desk-btn" onclick={() => (editing = "new")}><Icon name="plus" size={14} /> {t("New")}</button>
    {/snippet}
    <SearchField bind:value={query} label={t("Search sermons")} placeholder={t("Title, speaker, notes or scripture")} onnavigate={navigate} />
    {#if series.length && !query.trim()}
      <div class="series" role="group" aria-label={t("Series")}>
        <button type="button" class:on={seriesFilter === null} aria-pressed={seriesFilter === null} onclick={() => (seriesFilter = null)}>{t("All")}</button>
        {#each series as name (name)}
          <button type="button" class:on={seriesFilter === name} aria-pressed={seriesFilter === name} onclick={() => (seriesFilter = seriesFilter === name ? null : name)}>{name}</button>
        {/each}
      </div>
    {/if}
    <div class="list">
      {#if query.trim()}
        <p class="group">{t("Matches")} <span>{hits.length}</span></p>
        {#if hits.length === 0}<p class="empty">{t("No sermons match.")}</p>{/if}
        {#each hits as hit, h (`${hit.sermonId}:${hit.sectionId}`)}
          <button type="button" class="row" class:on={h === hitIndex} onclick={() => openHit(hit.sermonId, hit.sectionId)}>
            <strong>{hit.title}</strong>
            <span>{[hit.label, hit.speaker].filter(Boolean).join(" · ")}</span>
            {#if hit.snippet && hit.snippet !== hit.label}<span class="snippet">{hit.snippet}</span>{/if}
          </button>
        {/each}
      {:else}
        {#if session.sermons.length === 0}<p class="empty">{t("No sermons yet. Create one to plan the message and its notes.")}</p>{/if}
        {#each groups as group (group.label)}
          <p class="group">{group.label} <span>{group.items.length}</span></p>
          {#each group.items as doc (doc.id)}
            {@const minutes = plannedMinutes(doc)}
            <button type="button" class="row" class:on={selectedId === doc.id && !editing} onclick={() => pick(doc.id)}>
              <strong>
                <span class="row-title">{doc.title || t("Untitled sermon")}</span>
                {#if liveSectionOf(doc)}<em class="badge live">{t("Live")}</em>
                {:else if focus?.sermonId === doc.id}<em class="badge">{t("Preview")}</em>{/if}
              </strong>
              {#if doc.series}<span class="row-series">{doc.series}</span>{/if}
              <span class="row-bars" aria-hidden="true">{#each doc.sections.slice(0, 16) as section (section.id)}<i class={sermonAudienceItem(section).kind} style:flex-grow={section.minutes ?? 1}></i>{/each}</span>
              <span>{[doc.speaker, tn(doc.sections.length, "{n} section", "{n} sections"), minutes ? t("{n} min", { n: minutes }) : "", when(doc.date ?? doc.updatedAt)].filter(Boolean).join(" · ")}</span>
            </button>
          {/each}
        {/each}
      {/if}
    </div>
  </LibrarySidebar>
  {/if}

  <!-- Outline -->
  <div class="sheet" class:wide={preaching}>
    {#if note}
      <p class="note" role="status"><span>{note}</span><button type="button" aria-label={t("Dismiss")} onclick={() => (note = "")}><Icon name="close" size={14} /></button></p>
    {/if}
    {#if editing}
      {#key editing === "new" ? "new" : editing.id}
        <SermonEditor sermon={editing === "new" ? null : editing} {translationId} seriesList={series} onclose={closeEditor} onnote={(text) => (note = text)} />
      {/key}
    {:else if selected && preaching}
      <SermonPreach sermon={selected} onexit={() => (preaching = false)} />
    {:else if selected}
      {@const total = plannedMinutes(selected)}
      {@const liveId = liveSectionOf(selected)}
      {@const previewId = focus?.sermonId === selected.id ? focus.sectionId : null}
      <header class="hero">
        <div class="hero-copy">
          {#if selected.series}<span class="hero-series"><Icon name="layers" size={12} /> {selected.series}</span>{/if}
          <h2 class="title">{selected.title}</h2>
          <p class="meta">
            <span><Icon name="user" size={12} /> {selected.speaker || t("No speaker")}</span>
            {#if selected.date}<span><Icon name="timer" size={12} /> {when(selected.date)}</span>{/if}
            <span><Icon name="list" size={12} /> {tn(selected.sections.length, "{n} section", "{n} sections")}</span>
            {#if total}<span><Icon name="clock" size={12} /> {t("{n} min planned", { n: total })}</span>{/if}
            {#if clock}<span class="running {paceOf(sermonClock.now - clock.startedAt, total || undefined)}"><i aria-hidden="true"></i>{t("Running {time}", { time: clockText(sermonClock.now - clock.startedAt) })}</span>{/if}
          </p>
        </div>
        <div class="actions">
          <button type="button" class="desk-btn primary" onclick={() => void preach(selected)} title={t("Run the sermon: big notes, the time, and Next to LIVE")}><Icon name="play" size={14} /> {t("Preach")}</button>
          <button type="button" class="desk-btn" onclick={() => void queueAll(selected)}><Icon name="queue" size={14} /> {t("Add all to service")}</button>
          <button type="button" class="desk-btn" onclick={() => (editing = selected)}><Icon name="pencil" size={14} /> {t("Edit")}</button>
          <ToolMenu label={t("More for this sermon")} className="desk-btn icon">
            {#snippet trigger()}<Icon name="more" size={15} />{/snippet}
            {#snippet children(close)}
              <button type="button" role="menuitem" onclick={() => { close(); void duplicate(selected); }}><Icon name="copy" size={13} /> {t("Duplicate")}<span class="menu-hint">{t("For another Sunday")}</span></button>
              <button type="button" role="menuitem" class="danger" onclick={() => { if (armed === `sermon:${selected.id}`) close(); void remove(selected); }}><Icon name="trash" size={13} /> {armed === `sermon:${selected.id}` ? t("Click again to delete") : t("Delete sermon")}</button>
            {/snippet}
          </ToolMenu>
        </div>
      </header>
      {#if selected.sections.length}
        <SermonRail sermon={selected} {previewId} {liveId} onpick={(id) => show(selected, id)} />
      {/if}
      {#if selected.notes.trim()}
        <div class="sermon-notes"><Icon name="lock" size={12} /> {#if selected.notesRich}<RichView doc={selected.notesRich} base="1em" />{:else}{selected.notes}{/if}</div>
      {/if}
      <p class="hint">{t("Click a section for Preview · double-click sends it LIVE")} · <kbd>←</kbd> <kbd>→</kbd> {t("step sections")} · {t("notes never leave this desk")}</p>
      <ol class="outline">
        {#each selected.sections as section, n (section.id)}
          {@const seen = audience(section)}
          {@const isLive = liveId === section.id}
          {@const onPreview = previewId === section.id}
          {@const spent = sectionSpent(clock, section.id, sermonClock.now)}
          <li class="card {sermonAudienceItem(section).kind}" class:on={onPreview} class:live={isLive}>
            <button type="button" class="card-main" onclick={() => show(selected, section.id)} ondblclick={() => void showAndTake(selected, section.id)}>
              <span class="thumb"><ItemThumb item={sermonAudienceItem(section)} icon={seen.icon} label={seen.kind} /></span>
              <span class="card-copy">
                <span class="card-head">
                  <i>{n + 1}</i>
                  <strong>{section.name}</strong>
                  {#if isLive}<em class="badge live">{t("Live")}</em>{/if}
                  {#if onPreview}<em class="badge">{t("Preview")}</em>{/if}
                  {#if spent || section.minutes}
                    <span class="time {paceOf(spent, section.minutes)}">{spent ? clockText(spent) : ""}{spent && section.minutes ? " / " : ""}{section.minutes ? t("{n} min", { n: section.minutes }) : ""}</span>
                  {/if}
                </span>
                <span class="seen">
                  <span class="kind"><Icon name={seen.icon} size={12} />{seen.kind}</span>
                  <span class="seen-title">{seen.title}</span>
                  {#if seen.body}<span class="seen-body">{seen.body}</span>{/if}
                </span>
                {#if section.notes.trim()}
                  <span class="notes"><Icon name="lock" size={12} /><span>{#if section.notesRich}<RichView doc={section.notesRich} base="1em" />{:else}{section.notes}{/if}</span></span>
                {/if}
              </span>
            </button>
            <span class="card-tools">
              <button type="button" class="row-tool go-live" aria-label={t("Send {name} LIVE", { name: section.name })} title={t("LIVE")} onclick={() => void showAndTake(selected, section.id)}><Icon name="play" size={13} /></button>
              <button type="button" class="row-tool" aria-label={t("Add {name} to the service", { name: section.name })} title={t("Add to the service")} onclick={() => void queueOne(selected, section)}><Icon name="queue" size={14} /></button>
            </span>
          </li>
        {/each}
      </ol>
      <button type="button" class="add-more" onclick={() => (editing = selected)}><Icon name="plus" size={13} /> {t("Add or change sections")}</button>
    {:else}
      <div class="blank">
        <span class="blank-icon"><Icon name="book" size={30} /></span>
        <h2>{t("Plan the message, then preach it")}</h2>
        <p>{t("Sections with what the audience sees, notes only you see, and the time each part takes. Paste your notes and the outline is made for you.")}</p>
        <div class="blank-actions">
          <button type="button" class="desk-btn primary" onclick={() => (editing = "new")}><Icon name="plus" size={14} /> {t("New sermon")}</button>
        </div>
        {#if session.sermons.length}<p class="muted">{t("Or pick one from the library.")}</p>{/if}
      </div>
    {/if}
  </div>

  <!-- Speaker notes and monitors -->
  <aside class="stage">
    {#if !preaching}
      <section class="speaker" aria-label={t("Desk notes")}>
        <header>
          <span class="kicker"><Icon name="lock" size={12} /> {t("Desk notes")}</span>
          <span class="muted">{focusSection?.name ?? ""}</span>
        </header>
        {#if deskNotesDoc}
          <div class="rich-notes"><RichView doc={deskNotesDoc} base="1em" /></div>
        {:else}
          <p class:empty-notes={!deskNotes}>{deskNotes || t("Notes for the section on Preview show here. They never reach Preview or Program.")}</p>
        {/if}
      </section>
    {/if}
    <MonitorPair page="sermon" {place} onstep={(direction) => void session.stepSermon(direction)} />
  </aside>
</section>

<style>
  .sermon-desk {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(280px, 380px);
    gap: var(--gap, 10px);
    padding: var(--gap, 10px) var(--panel-pad, 12px) var(--panel-pad, 12px);
  }
  .sermon-desk.preaching { grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); }
  .sheet, .stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
    overflow: hidden;
  }
  h2 { margin: 0; font-size: 16px; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  i { font-style: normal; display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 6px; background: var(--panel); color: var(--ink); font-size: 11px; font-weight: 750; }
  .row-tool { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .row-tool:hover:not(:disabled) { background: var(--panel); color: var(--ink); }
  .row-tool.go-live:hover { color: var(--live, #e5484d); }
  .badge { flex: none; padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); font-size: 10px; font-style: normal; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .badge.live { background: var(--live); color: #fff; }

  /* Library */
  .series { display: flex; gap: 4px; padding: 0 10px 8px; overflow-x: auto; scrollbar-width: none; }
  .series button { flex: none; height: 24px; padding: 0 10px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  .series button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }
  .group { margin: 0; padding: 10px 6px 6px; font-size: 12px; font-weight: 700; color: var(--muted); }
  .group span { margin-left: 4px; opacity: 0.8; }
  .list { margin: 0; padding: 0 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .list > :global(*) { flex: none; }
  .list > .group:first-child { padding-top: 0; }
  .row { width: 100%; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); background: none; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
  .row strong { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; min-width: 0; }
  .row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .row-series { color: var(--accent); font-weight: 650; }
  .row .snippet { font-style: italic; }
  .row-bars { display: flex; gap: 2px; height: 4px; }
  .row-bars i { flex: 1 1 0; width: auto; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--accent) 55%, var(--field)); }
  .row-bars i.bible { background: color-mix(in srgb, #d4a017 70%, var(--field)); }
  .row-bars i.image { background: color-mix(in srgb, #30a46c 70%, var(--field)); }
  .row:hover { background: var(--field); }
  .row.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .empty { margin: 0; padding: 12px 6px; color: var(--muted); font-size: 12px; }

  /* Outline */
  .sheet { overflow: auto; padding: 14px 16px 18px; gap: 14px; }
  .sheet.wide { padding: 16px 18px; }
  .note { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 8px 8px 12px; border-radius: var(--radius-control, 8px); background: color-mix(in srgb, var(--accent) 10%, var(--field)); font-size: 12px; color: var(--ink); flex: none; }
  .note span { flex: 1; }
  .note button { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; flex: none; padding: 16px 18px; border: 1px solid var(--line); border-radius: 14px; background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--field); }
  .hero-copy { display: grid; gap: 4px; min-width: 0; }
  .hero-series { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 750; letter-spacing: 0.05em; text-transform: uppercase; color: var(--accent); }
  .title { font-size: clamp(20px, 2.2vw, 28px); line-height: 1.15; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .meta span { display: inline-flex; align-items: center; gap: 5px; }
  .running { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
  .running i { width: 7px; height: 7px; border-radius: 50%; background: var(--live, #e5484d); animation: pulse 1.4s ease-in-out infinite; }
  .running.near { color: #f5a524; }
  .running.over { color: var(--live, #e5484d); }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sermon-notes, .notes { display: flex; gap: 6px; align-items: flex-start; color: var(--muted); font-size: 12px; white-space: pre-wrap; }
  .sermon-notes { margin: 0; padding: 8px 10px; border: 1px dashed var(--line); border-radius: var(--radius-control, 8px); flex: none; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); flex: none; }
  kbd { padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; font: inherit; font-size: 11px; }
  .outline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .card { --tone: var(--accent); position: relative; display: flex; align-items: stretch; border: 1px solid var(--line); border-left: 4px solid var(--tone); border-radius: 10px; background: var(--field); transition: border-color 0.12s ease, box-shadow 0.12s ease; }
  .card.bible { --tone: #d4a017; }
  .card.image { --tone: #30a46c; }
  .card:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); border-left-color: var(--tone); }
  .card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .card.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); background: color-mix(in srgb, var(--live) 7%, var(--field)); }
  .card-main { flex: 1; min-width: 0; display: flex; gap: 14px; padding: 10px 12px; border: 0; background: none; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
  .thumb { flex: none; align-self: flex-start; }
  .thumb :global(.item-thumb) { width: 132px; }
  .card-copy { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px 16px; align-content: start; }
  .card-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .card-head strong { font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .time { margin-left: auto; padding: 1px 8px; border-radius: 999px; background: var(--panel); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--muted); }
  .time.near { color: #f5a524; }
  .time.over { color: #fff; background: var(--live, #e5484d); }
  .seen { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kind { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--tone); }
  .seen-title { font-size: 14px; font-weight: 600; }
  .seen-body { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .notes { padding-left: 12px; border-left: 1px dashed var(--line); }
  .notes span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  .card-tools { display: flex; flex-direction: column; gap: 2px; padding: 6px 6px 6px 0; opacity: 0.55; transition: opacity 0.12s ease; }
  .card:hover .card-tools, .card:focus-within .card-tools, .card.on .card-tools, .card.live .card-tools { opacity: 1; }
  @media (hover: none) { .card-tools { opacity: 1; } }
  .add-more { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .add-more:hover { color: var(--ink); }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; max-width: 460px; margin: 0 auto; color: var(--muted); text-align: center; }
  .blank-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 18px; background: color-mix(in srgb, var(--accent) 14%, var(--field)); color: var(--accent); }
  .blank h2 { color: var(--ink); font-size: 20px; }
  .blank p { margin: 0; line-height: 1.5; }
  .blank-actions { display: flex; gap: 8px; }

  /* Stage */
  .stage { padding: 12px; gap: 12px; overflow: auto; }
  .speaker { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px dashed color-mix(in srgb, var(--ink) 25%, var(--line)); border-radius: var(--radius-control, 8px); background: var(--field); flex: none; }
  .speaker header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kicker { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--muted); }
  .speaker p { margin: 0; font-size: 16px; line-height: 1.5; white-space: pre-wrap; max-height: 220px; overflow: auto; }
  .speaker p.empty-notes { font-size: 12px; color: var(--muted); }

  @media (max-width: 1280px) {
    .sermon-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
    .sermon-desk.preaching { grid-template-columns: minmax(0, 1fr) minmax(220px, 280px); }
    .card-copy { grid-template-columns: 1fr; }
    .notes { padding-left: 0; border-left: 0; }
    .thumb :global(.item-thumb) { width: 104px; }
  }
  @media (max-width: 900px) {
    .sermon-desk, .sermon-desk.preaching { grid-template-columns: 1fr; overflow: auto; }
    .thumb { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .running i { animation: none; } }
</style>
