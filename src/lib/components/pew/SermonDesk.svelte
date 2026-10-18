<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { formatReference, parseReference } from "../../bible/reference";
  import { searchSermonHits, sermonAudienceItem } from "../../domain/sermon";
  import type { SermonSummary } from "../../ai/summarize";
  import type { PresentationItem, Sermon, SermonSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import MonitorPair from "./MonitorPair.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import SearchField from "./SearchField.svelte";
  import { t, tn } from "../../i18n/core";

  // Sermon window: a library of sermons, the outline as cards (what the audience sees, and the
  // notes that stay on this desk), and the speaker's notes beside Preview and Program.
  // Notes never reach Preview or Program. LIVE sends Program.

  let { translationId = "kjv" }: { translationId?: string } = $props();

  type Show = "slide" | "scripture" | "image";
  type DraftSection = { id: string; name: string; notes: string; show: Show; heading: string; body: string; scripture: string; imageId: string };
  type Draft = { id: string; title: string; speaker: string; notes: string; sections: DraftSection[]; isNew: boolean };

  let query = $state("");
  let selectedId = $state<string | null>(null);
  let draft = $state<Draft | null>(null);
  let note = $state("");
  let armed = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  const sermons = $derived([...session.sermons].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
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
  const programLive = $derived(session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  const images = $derived(session.media.filter((asset) => asset.kind === "image"));
  const focusSection = $derived.by(() => {
    const doc = focus ? session.sermons.find((entry) => entry.id === focus.sermonId) : null;
    return doc?.sections.find((entry) => entry.id === focus?.sectionId) ?? null;
  });
  const deskNotes = $derived(session.sermonDeskNotes());
  const place = $derived.by(() => {
    const doc = focus ? session.sermons.find((entry) => entry.id === focus.sermonId) : null;
    const index = doc?.sections.findIndex((entry) => entry.id === focus?.sectionId) ?? -1;
    return doc && index >= 0 ? `${doc.sections[index]!.name} · ${index + 1} of ${doc.sections.length}` : "";
  });

  $effect(() => {
    const current = session.sermonFocus;
    if (current && !draft) selectedId = current.sermonId;
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
    const date = new Date(iso);
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
    draft = null;
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

  async function ensureService() {
    if (!session.service) await session.createService(t("Sunday Service"));
    if (!session.service?.sections.length) session.addSection(t("Sermon"));
  }

  async function queueAll(doc: Sermon) {
    await ensureService();
    for (const section of doc.sections) session.addSermonSection(section, `${doc.title} — ${section.name}`);
    note = `${doc.sections.length} section${doc.sections.length === 1 ? "" : "s"} added to the queue. Notes were not queued.`;
  }

  async function queueOne(doc: Sermon, section: SermonSection) {
    await ensureService();
    session.addSermonSection(section, `${doc.title} — ${section.name}`);
    note = `${section.name} added to the queue. Notes were not queued.`;
  }

  async function remove(doc: Sermon) {
    if (!arm(`sermon:${doc.id}`)) return;
    await session.deleteSermon(doc.id);
    selectedId = null;
    note = `${doc.title} deleted.`;
  }

  // Editing

  // Summarize with the church's own AI service: notes in, a summary and points out.
  let summarizing = $state(false);
  let summary = $state<SermonSummary | null>(null);
  let summaryError = $state("");

  /** Everything written for this sermon, as the AI reads it. */
  function notesFor(value: Draft): string {
    const parts = [value.notes.trim()];
    for (const section of value.sections) {
      const lines = [section.name, section.heading, section.scripture, section.body, section.notes].map((line) => line.trim()).filter(Boolean);
      if (lines.length) parts.push(lines.join("\n"));
    }
    return parts.filter(Boolean).join("\n\n");
  }

  async function summarize() {
    if (!draft) return;
    if (!session.aiReady) {
      session.openSettings("ai");
      return;
    }
    summarizing = true;
    summaryError = "";
    try {
      summary = await session.summarizeSermon({ title: draft.title, notes: notesFor(draft) });
    } catch (error) {
      summaryError = error instanceof Error ? error.message : String(error);
      summary = null;
    } finally {
      summarizing = false;
    }
  }

  function usePoints() {
    if (!draft || !summary) return;
    const added = summary.points.map((point) => ({
      ...blankSection(point.heading),
      show: (point.scripture && parseReference(point.scripture, session.books)?.startVerse ? "scripture" : "slide") as Show,
      heading: point.heading,
      body: point.body,
      scripture: point.scripture,
    }));
    draft.sections = [...draft.sections, ...added];
    note = `${added.length} point${added.length === 1 ? "" : "s"} added as sections. Check them, then Save.`;
    summary = null;
  }

  function useSummarySlide() {
    if (!draft || !summary) return;
    draft.sections = [...draft.sections, { ...blankSection(t("Summary")), heading: draft.title || t("Summary"), body: summary.summary }];
    note = t("The summary is a slide at the end. Save to keep it.");
  }

  function blankSection(name: string): DraftSection {
    return { id: crypto.randomUUID(), name, notes: "", show: "slide", heading: "", body: "", scripture: "", imageId: "" };
  }

  function newSermon() {
    draft = { id: crypto.randomUUID(), title: "", speaker: "", notes: "", sections: [blankSection(t("Opening"))], isNew: true };
  }

  function edit(doc: Sermon) {
    draft = {
      id: doc.id,
      title: doc.title,
      speaker: doc.speaker,
      notes: doc.notes,
      isNew: false,
      sections: doc.sections.map((section) => {
        const attached = section.items.find((item) => item.kind === "bible" || item.kind === "image") ?? null;
        const slide = section.items.find((item) => item.kind === "slide");
        return {
          id: section.id,
          name: section.name,
          notes: section.notes,
          show: attached?.kind === "bible" ? "scripture" : attached?.kind === "image" ? "image" : "slide",
          heading: slide?.slide?.heading ?? "",
          body: slide?.slide?.body ?? "",
          scripture: attached?.bible?.reference ?? "",
          imageId: attached?.image?.assetId ?? "",
        };
      }),
    };
  }

  /** The draft as a sermon. Returns the problems instead when a reference or image is missing. */
  function build(value: Draft): { sermon: Sermon; problems: string[] } {
    const problems: string[] = [];
    const sections: SermonSection[] = value.sections.map((section) => {
      const heading = section.heading.trim() || section.name.trim() || t("Sermon");
      const slide: PresentationItem = { id: `${section.id}-slide`, kind: "slide", title: heading, slide: { heading, body: section.body, imageId: null } };
      let attached: PresentationItem | null = null;
      if (section.show === "scripture") {
        const parsed = parseReference(section.scripture);
        if (!parsed) problems.push(t("{name}: “{reference}” is not a reference.", { name: section.name || t("A section"), reference: section.scripture || t("no reference") }));
        else {
          const start = parsed.startVerse ?? 1;
          const end = parsed.endVerse ?? start;
          const chapters = session.books.find((entry) => entry.ord === parsed.bookOrd)?.chapters ?? 150;
          const reference = formatReference(parsed.bookName, parsed.chapter, start, end, chapters);
          attached = {
            id: `${section.id}-bible`,
            kind: "bible",
            title: reference,
            bible: { translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: start, endVerse: end, reference },
          };
        }
      } else if (section.show === "image") {
        const asset = session.media.find((entry) => entry.id === section.imageId);
        if (!asset) problems.push(t("{name}: pick an image.", { name: section.name || t("A section") }));
        else attached = { id: `${section.id}-image`, kind: "image", title: asset.name, image: { assetId: asset.id } };
      }
      return { id: section.id, name: section.name, notes: section.notes, items: attached ? [attached, slide] : [slide] };
    });
    return {
      sermon: { id: value.id, title: value.title, speaker: value.speaker, notes: value.notes, sections, updatedAt: new Date().toISOString() },
      problems,
    };
  }

  function previewDraftSection(sectionId: string) {
    if (!draft) return;
    const { sermon, problems } = build(draft);
    if (problems.length) note = problems[0]!;
    void session.previewSermonSection(sermon, sectionId);
  }

  // Dragging sermon sections in the editor.
  let cardDrag = $state<number | null>(null);
  let cardDrop = $state<number | null>(null);
  function dropCard(to: number) {
    if (cardDrag === null || !draft) return;
    const from = cardDrag;
    cardDrag = null;
    cardDrop = null;
    if (from === to) return;
    const next = draft.sections.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    draft.sections = next;
  }

  function moveDraft(sectionId: string, direction: 1 | -1) {
    if (!draft) return;
    const from = draft.sections.findIndex((entry) => entry.id === sectionId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= draft.sections.length) return;
    const next = draft.sections.slice();
    [next[from], next[to]] = [next[to]!, next[from]!];
    draft.sections = next;
  }

  function removeDraft(sectionId: string) {
    if (draft) draft.sections = draft.sections.filter((entry) => entry.id !== sectionId);
  }

  async function saveDraft() {
    if (!draft) return;
    const { sermon, problems } = build(draft);
    if (problems.length) {
      note = problems[0]!;
      return;
    }
    if (!(await session.saveSermon(sermon))) {
      note = session.message;
      return;
    }
    note = `${sermon.title.trim()} saved. Notes stay on this desk.`;
    selectedId = sermon.id;
    draft = null;
  }
</script>

<section class="sermon-desk">
  <!-- Library -->
  <LibrarySidebar title={t("Sermons")} icon="book" count={sermons.length} storageKey="sermons">
    {#snippet actions()}
      <button type="button" class="desk-btn" onclick={newSermon}><Icon name="plus" size={14} /> {t("New")}</button>
    {/snippet}
    <SearchField bind:value={query} label={t("Search sermons")} placeholder={t("Title, speaker, notes or scripture")} onnavigate={navigate} />
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
        {#if sermons.length === 0}<p class="empty">{t("No sermons yet. Create one to plan the message and its notes.")}</p>{/if}
        {#each groups as group (group.label)}
          <p class="group">{group.label} <span>{group.items.length}</span></p>
          {#each group.items as doc (doc.id)}
            <button type="button" class="row" class:on={selectedId === doc.id && !draft} onclick={() => pick(doc.id)}>
              <strong>
                {doc.title || t("Untitled sermon")}
                {#if programLive && programSource.startsWith(`sermon:${doc.id}:`)}<em class="badge live">{t("Live")}</em>
                {:else if focus?.sermonId === doc.id}<em class="badge">{t("Preview")}</em>{/if}
              </strong>
              {#if doc.sections[0]}<span class="snippet">{doc.sections.map((section) => section.name).join(" → ")}</span>{/if}
              <span>{[doc.speaker, `${doc.sections.length} section${doc.sections.length === 1 ? "" : "s"}`, when(doc.updatedAt)].filter(Boolean).join(" · ")}</span>
            </button>
          {/each}
        {/each}
      {/if}
    </div>
  </LibrarySidebar>

  <!-- Outline -->
  <div class="sheet">
    {#if note}
      <p class="note" role="status"><span>{note}</span><button type="button" aria-label={t("Dismiss")} onclick={() => (note = "")}><Icon name="close" size={14} /></button></p>
    {/if}
    {#if draft}
      <form class="editor" onsubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <div class="head">
          <h2>{draft.isNew ? t("New sermon") : t("Edit sermon")}</h2>
          <div class="actions">
            <button type="button" class="desk-btn ai-btn" disabled={summarizing} data-tip={session.aiReady ? t("Make a summary and points from your notes") : t("Set up your AI key first")} onclick={() => void summarize()}>
              <Icon name="sparkles" size={14} /> {summarizing ? t("Summarizing…") : t("Summarize")}
            </button>
            <button type="button" class="desk-btn ghost" onclick={() => (draft = null)}>{t("Cancel")}</button>
            <button type="submit" class="desk-btn primary">{t("Save")}</button>
          </div>
        </div>
        {#if summaryError}<p class="ai-error" role="alert">{summaryError}</p>{/if}
        {#if summary}
          <section class="ai-card" aria-label={t("AI summary")}>
            <header><span><Icon name="sparkles" size={14} /> {t("Summary")}</span><button type="button" class="ai-close" aria-label={t("Close summary")} onclick={() => (summary = null)}><Icon name="close" size={13} /></button></header>
            {#if summary.summary}<p class="ai-summary">{summary.summary}</p>{/if}
            {#if summary.points.length}
              <ol class="ai-points">
                {#each summary.points as point, n (n)}
                  <li><strong>{point.heading}</strong>{#if point.scripture}<em>{point.scripture}</em>{/if}{#if point.body}<span>{point.body}</span>{/if}</li>
                {/each}
              </ol>
            {/if}
            <div class="ai-actions">
              <button type="button" class="desk-btn" disabled={!summary.summary} onclick={useSummarySlide}>{t("Add summary as a slide")}</button>
              <button type="button" class="desk-btn primary-soft" disabled={!summary.points.length} onclick={usePoints}>{t("Add points as sections")}</button>
            </div>
            <p class="ai-foot">{t("Written by AI from your notes. Read it before it reaches the screen.")}</p>
          </section>
        {/if}
        <div class="fields">
          <input aria-label={t("Sermon title")} placeholder={t("Title")} bind:value={draft.title} />
          <input aria-label={t("Speaker")} placeholder={t("Speaker")} bind:value={draft.speaker} />
        </div>
        <label class="desk-only">
          <span><Icon name="lock" size={12} /> {t("Notes for the whole sermon · desk only")}</span>
          <textarea aria-label={t("Operator notes")} rows="2" placeholder={t("Reminders for the operator. Never shown to the audience.")} bind:value={draft.notes}></textarea>
        </label>

        {#each draft.sections as section, i (section.id)}
          <div
            class="edit-card"
            role="group"
            aria-label={section.name}
            class:drop-before={cardDrag !== null && cardDrop === i && cardDrag !== i}
            class:dragging={cardDrag === i}
            ondragover={(event) => { if (cardDrag !== null) { event.preventDefault(); cardDrop = i; } }}
            ondrop={(event) => { event.preventDefault(); dropCard(i); }}
          >
            <div class="edit-head">
              <button
                type="button"
                class="grip"
                draggable="true"
                aria-label={t("Move {name}: drag, or Alt+arrow keys", { name: section.name || t("this section") })}
                title={t("Drag to move")}
                ondragstart={(event) => { cardDrag = i; event.dataTransfer?.setData("text/plain", String(i)); }}
                ondragend={() => { cardDrag = null; cardDrop = null; }}
                onkeydown={(event) => { if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); moveDraft(section.id, event.key === "ArrowUp" ? -1 : 1); } }}
              ><Icon name="grip" size={14} /></button>
              <i>{i + 1}</i>
              <input aria-label={t("Section name")} placeholder={t("Section name")} bind:value={section.name} />
              <button type="button" class="row-tool" aria-label={t("Preview {name}", { name: section.name })} title={t("Preview")} onclick={() => previewDraftSection(section.id)}><Icon name="play" size={14} /></button>
              <button type="button" class="row-tool del" aria-label={t("Delete {name}", { name: section.name })} title={t("Delete this section")} onclick={() => removeDraft(section.id)}><Icon name="trash" size={14} /></button>
            </div>
            <div class="two">
              <div class="audience-edit">
                <div class="seg" role="radiogroup" aria-label={t("Audience sees")}>
                  {#each [["slide", "Slide"], ["scripture", "Scripture"], ["image", "Image"]] as [id, label] (id)}
                    <button type="button" role="radio" aria-checked={section.show === id} class:on={section.show === id} onclick={() => (section.show = id as Show)}>{label}</button>
                  {/each}
                </div>
                {#if section.show === "scripture"}
                  <input aria-label={t("Attach scripture")} placeholder={t("John 3:16-17")} bind:value={section.scripture} />
                {:else if section.show === "image"}
                  {#if images.length}
                    <select aria-label={t("Attach image")} bind:value={section.imageId}>
                      <option value="">{t("Pick an image")}</option>
                      {#each images as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
                    </select>
                  {:else}
                    <p class="muted">{t("Import images in the Production Desk's Media panel first.")}</p>
                  {/if}
                {/if}
                <input aria-label={t("Audience heading")} placeholder={section.show === "slide" ? t("Heading on screen") : t("Heading (when shown as a slide)")} bind:value={section.heading} />
                {#if section.show === "slide"}
                  <textarea aria-label={t("Audience body")} rows="3" placeholder={t("Text on screen")} bind:value={section.body}></textarea>
                {/if}
              </div>
              <label class="desk-only">
                <span><Icon name="lock" size={12} /> {t("Desk notes")}</span>
                <textarea aria-label={t("Section notes")} rows="5" placeholder={t("What to say, cues, timing. Desk only.")} bind:value={section.notes}></textarea>
              </label>
            </div>
          </div>
        {/each}
        <button type="button" class="add" onclick={() => draft && (draft.sections = [...draft.sections, blankSection(`Section ${draft.sections.length + 1}`)])}>
          <Icon name="plus" size={14} /> {t("Add section")}
        </button>
      </form>
    {:else if selected}
      <header class="head">
        <div>
          <h2 class="title">{selected.title}</h2>
          <p class="meta">
            <span>{selected.speaker || t("No speaker")}</span>
            <span>{tn(selected.sections.length, "{n} section", "{n} sections")}</span>
            {#if when(selected.updatedAt)}<span>{t("Updated {updatedAt}", { updatedAt: when(selected.updatedAt) })}</span>{/if}
          </p>
        </div>
        <div class="actions">
          <button type="button" class="desk-btn" onclick={() => void queueAll(selected)}><Icon name="queue" size={14} /> {t("Queue all")}</button>
          <button type="button" class="desk-btn" onclick={() => edit(selected)}><Icon name="pencil" size={14} /> {t("Edit")}</button>
          <button
            type="button"
            class="desk-btn ghost icon"
            class:armed={armed === `sermon:${selected.id}`}
            aria-label={armed === `sermon:${selected.id}` ? t("Confirm delete sermon") : t("Delete sermon")}
            data-tip={armed === `sermon:${selected.id}` ? t("Click again to delete") : t("Delete sermon")}
            onclick={() => void remove(selected)}
          ><Icon name="close" size={14} /></button>
        </div>
      </header>
      {#if selected.notes.trim()}
        <p class="sermon-notes"><Icon name="lock" size={12} /> {selected.notes}</p>
      {/if}
      <p class="hint">{t("Click a section for Preview · double-click sends it LIVE")} · <kbd>←</kbd> <kbd>→</kbd> {t("step sections")} · {t("notes never leave this desk")}</p>
      <ol class="outline">
        {#each selected.sections as section, n (section.id)}
          {@const seen = audience(section)}
          {@const isLive = programLive && programSource === `sermon:${selected.id}:${section.id}`}
          {@const onPreview = focus?.sermonId === selected.id && focus.sectionId === section.id}
          <li class="card" class:on={onPreview} class:live={isLive}>
            <button type="button" class="card-main" onclick={() => show(selected, section.id)} ondblclick={() => void showAndTake(selected, section.id)}>
              <span class="card-head">
                <i>{n + 1}</i>
                <strong>{section.name}</strong>
                <span class="tags">
                  {#if isLive}<em class="badge live">{t("Live")}</em>{/if}
                  {#if onPreview}<em class="badge">{t("Preview")}</em>{/if}
                </span>
              </span>
              <span class="seen">
                <span class="kind"><Icon name={seen.icon} size={12} />{seen.kind}</span>
                <span class="seen-title">{seen.title}</span>
                {#if seen.body}<span class="seen-body">{seen.body}</span>{/if}
              </span>
              {#if section.notes.trim()}
                <span class="notes"><Icon name="lock" size={12} /><span>{section.notes}</span></span>
              {/if}
            </button>
            <button type="button" class="row-tool queue" aria-label={t("Queue {name}", { name: section.name })} title={t("Add to queue")} onclick={() => void queueOne(selected, section)}><Icon name="queue" size={14} /></button>
          </li>
        {/each}
      </ol>
    {:else}
      <div class="blank">
        <Icon name="book" size={28} />
        <p>{t("Pick a sermon from the library, or create one.")}</p>
        <button type="button" class="desk-btn" onclick={newSermon}><Icon name="plus" size={14} /> {t("New sermon")}</button>
      </div>
    {/if}
  </div>

  <!-- Speaker notes and monitors -->
  <aside class="stage">
    <section class="speaker" aria-label={t("Desk notes")}>
      <header>
        <span class="kicker"><Icon name="lock" size={12} /> {t("Desk notes")}</span>
        <span class="muted">{focusSection?.name ?? ""}</span>
      </header>
      <p class:empty-notes={!deskNotes}>{deskNotes || t("Notes for the section on Preview show here. They never reach Preview or Program.")}</p>
    </section>
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
  input, select, textarea {
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    font: inherit;
    min-width: 0;
  }
  input, select { height: 32px; padding: 0 10px; }
  textarea { padding: 8px 10px; resize: vertical; line-height: 1.45; }
  i { font-style: normal; display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 5px; background: var(--panel); color: var(--ink); font-size: 11px; font-weight: 700; }
  .row-tool { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .row-tool:hover:not(:disabled) { background: var(--field); color: var(--ink); }
  .row-tool:disabled { opacity: 0.35; }
  .armed { color: var(--live) !important; border-color: var(--live) !important; }
  .badge { flex: none; padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); font-size: 10px; font-style: normal; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .badge.live { background: color-mix(in srgb, var(--live) 22%, transparent); color: var(--live); }

  /* Library */
  .group { margin: 0; padding: 10px 6px 6px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .group span { margin-left: 4px; opacity: 0.8; }
  .list { margin: 0; padding: 0 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .list > :global(*) { flex: none; }
  .list > .group:first-child { padding-top: 0; }
  .row { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); background: none; color: var(--ink); text-align: left; font: inherit; }
  .row strong { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; overflow: hidden; white-space: nowrap; }
  .row span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .snippet { font-style: italic; }
  .row:hover { background: var(--field); }
  .row.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .empty { margin: 0; padding: 12px 6px; color: var(--muted); font-size: 12px; }

  /* Outline */
  .sheet { overflow: auto; padding: 14px 16px 18px; gap: 12px; }
  .note { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 8px 8px 12px; border-radius: var(--radius-control, 8px); background: var(--field); font-size: 12px; color: var(--muted); flex: none; }
  .note span { flex: 1; }
  .note button { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; flex: none; }
  .title { font-size: 20px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sermon-notes, .notes { display: flex; gap: 6px; align-items: flex-start; color: var(--muted); font-size: 12px; white-space: pre-wrap; }
  .sermon-notes { margin: 0; padding: 8px 10px; border: 1px dashed var(--line); border-radius: var(--radius-control, 8px); flex: none; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); flex: none; }
  kbd { padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; font: inherit; font-size: 11px; }
  .outline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .card { position: relative; display: flex; border: 1px solid var(--line); border-left: 4px solid var(--muted); border-radius: var(--radius-control, 8px); background: var(--field); }
  .card:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); border-left-color: var(--muted); }
  .card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .card.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
  .card-main { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 6px 18px; padding: 12px 14px; border: 0; background: none; color: var(--ink); text-align: left; font: inherit; }
  .card-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
  .card-head strong { font-size: 14px; }
  .tags { margin-left: auto; display: flex; gap: 4px; }
  .seen { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kind { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--accent); }
  .seen-title { font-size: 14px; font-weight: 600; }
  .seen-body { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .notes { padding-left: 12px; border-left: 1px dashed var(--line); }
  .notes span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  .queue { position: absolute; top: 8px; right: 8px; }
  .card .tags { margin-right: 30px; }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; }

  /* Editor */
  .editor { display: flex; flex-direction: column; gap: 12px; }
  .fields { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
  .desk-only { display: flex; flex-direction: column; gap: 6px; }
  .ai-btn :global(svg) { color: #7c3aed; }
  .ai-error { margin: 0; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--live) 12%, var(--field)); color: var(--ink); font-size: 13px; }
  .ai-card { display: grid; gap: 10px; padding: 14px; border: 1px solid color-mix(in srgb, #7c3aed 45%, var(--line)); border-radius: 12px; background: color-mix(in srgb, #7c3aed 6%, var(--field)); }
  .ai-card header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; }
  .ai-card header span { display: inline-flex; align-items: center; gap: 6px; }
  .ai-card header :global(svg) { color: #7c3aed; }
  .ai-close { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .ai-summary { margin: 0; font-size: 14px; line-height: 1.5; }
  .ai-points { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 13px; }
  .ai-points li strong { font-weight: 650; }
  .ai-points li em { margin-left: 8px; font-style: normal; font-size: 12px; color: var(--accent); }
  .ai-points li span { display: block; color: var(--muted); }
  .ai-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
  .ai-foot { margin: 0; font-size: 11px; color: var(--muted); }
  .desk-only > span { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .desk-only textarea { border-style: dashed; }
  .edit-card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); }
  .edit-card input, .edit-card select, .edit-card textarea { background: var(--panel); }
  .edit-head { display: flex; align-items: center; gap: 6px; }
  .edit-head input { flex: 1; font-weight: 600; }
  .two { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; }
  .audience-edit { display: flex; flex-direction: column; gap: 8px; }
  .seg { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .seg button { height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; }
  .seg button.on { background: var(--accent); color: var(--on-accent); }
  .add { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border: 1px dashed var(--line); border-radius: var(--radius-control, 8px); background: none; color: var(--muted); font: inherit; font-weight: 600; }
  .add:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }

  /* Stage */
  .stage { padding: 12px; gap: 12px; overflow: auto; }
  .speaker { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px dashed color-mix(in srgb, var(--ink) 25%, var(--line)); border-radius: var(--radius-control, 8px); background: var(--field); flex: none; }
  .speaker header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kicker { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .speaker p { margin: 0; font-size: 16px; line-height: 1.5; white-space: pre-wrap; max-height: 220px; overflow: auto; }
  .speaker p.empty-notes { font-size: 12px; color: var(--muted); }

  @media (max-width: 1280px) {
    .sermon-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
    .card-main, .two { grid-template-columns: 1fr; }
    .notes { padding-left: 0; border-left: 0; }
  }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--field); }
  .edit-card.dragging { opacity: 0.4; }
  .edit-card.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .row-tool.del:hover { color: var(--danger, #e5484d); }
</style>
