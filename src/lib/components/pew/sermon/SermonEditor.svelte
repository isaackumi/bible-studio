<script lang="ts">
  import InlineWords from "../../InlineWords.svelte";
  import TextWords from "../../TextWords.svelte";
  import type { RichDoc } from "../../../domain/rich-text";
  import { session } from "../../../app/session.svelte";
  import { formatReference, parseReference } from "../../../bible/reference";
  import { api } from "../../../db/api";
  import { outlineFromNotes, plannedMinutes, referencesIn } from "../../../domain/sermon";
  import type { SermonSummary } from "../../../ai/summarize";
  import type { PresentationItem, Sermon, SermonSection } from "../../../domain/types";
  import AiSlidesDialog from "../../decks/AiSlidesDialog.svelte";
  import SuggestSongsDialog from "./SuggestSongsDialog.svelte";
  import Icon from "../../Icon.svelte";
  import ItemThumb from "../ItemThumb.svelte";
  import { msg, t, tn } from "../../../i18n/core";
  import { keys } from "../../../platform/os";

  // The sermon editor: the sections down the left to jump between, and each section as a card with
  // what the audience sees (and a still of it), its planned minutes, and the desk notes. Notes can
  // become an outline, and references written in notes become scripture sections in one click.

  let {
    sermon = null,
    translationId = "kjv",
    seriesList = [],
    onclose,
    onnote,
  }: { sermon?: Sermon | null; translationId?: string; seriesList?: string[]; onclose: (savedId: string | null) => void; onnote: (text: string) => void } = $props();

  type Show = "slide" | "scripture" | "image";
  type DraftSection = { id: string; name: string; notes: string; notesRich: RichDoc | null; show: Show; heading: string; body: string; rich: RichDoc | null; scripture: string; imageId: string; minutes: number | null };
  type Draft = { id: string; title: string; speaker: string; series: string; date: string; notes: string; notesRich: RichDoc | null; sections: DraftSection[]; isNew: boolean };

  function blankSection(name: string): DraftSection {
    return { id: crypto.randomUUID(), name, notes: "", notesRich: null, show: "slide", heading: "", body: "", rich: null, scripture: "", imageId: "", minutes: null };
  }

  function draftOf(doc: Sermon | null): Draft {
    if (!doc) return { id: crypto.randomUUID(), title: "", speaker: "", series: "", date: "", notes: "", notesRich: null, sections: [blankSection(t("Opening"))], isNew: true };
    return {
      id: doc.id,
      title: doc.title,
      speaker: doc.speaker,
      series: doc.series ?? "",
      date: doc.date ?? "",
      notes: doc.notes,
      notesRich: doc.notesRich ?? null,
      isNew: false,
      sections: doc.sections.map((section) => {
        const attached = section.items.find((item) => item.kind === "bible" || item.kind === "image") ?? null;
        const slide = section.items.find((item) => item.kind === "slide");
        return {
          id: section.id,
          name: section.name,
          notes: section.notes,
          notesRich: section.notesRich ?? null,
          rich: slide?.slide?.rich ?? null,
          show: attached?.kind === "bible" ? "scripture" : attached?.kind === "image" ? "image" : "slide",
          heading: slide?.slide?.heading ?? "",
          body: slide?.slide?.body ?? "",
          scripture: attached?.bible?.reference ?? "",
          imageId: attached?.image?.assetId ?? "",
          minutes: section.minutes ?? null,
        };
      }),
    };
  }

  // svelte-ignore state_referenced_locally
  let draft = $state<Draft>(draftOf(sermon));
  const started = JSON.stringify($state.snapshot(draft));
  const dirty = $derived(JSON.stringify($state.snapshot(draft)) !== started);
  const images = $derived(session.media.filter((asset) => asset.kind === "image"));
  const total = $derived(draft.sections.reduce((sum, section) => sum + (section.minutes ?? 0), 0));

  /** The reference as the sermon stores it, or null when it does not read as one. */
  function bibleOf(section: DraftSection): PresentationItem | null {
    const parsed = parseReference(section.scripture, session.books);
    if (!parsed) return null;
    const start = parsed.startVerse ?? 1;
    const end = parsed.endVerse ?? start;
    const chapters = session.books.find((entry) => entry.ord === parsed.bookOrd)?.chapters ?? 150;
    const reference = formatReference(parsed.bookName, parsed.chapter, start, end, chapters);
    return { id: `${section.id}-bible`, kind: "bible", title: reference, bible: { translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: start, endVerse: end, reference } };
  }

  function slideOf(section: DraftSection): PresentationItem {
    const heading = section.heading.trim() || section.name.trim() || t("Sermon");
    const words = section.show === "slide" && section.rich ? { heading: section.heading.trim(), body: section.body, imageId: null, rich: section.rich } : { heading, body: section.body, imageId: null };
    return { id: `${section.id}-slide`, kind: "slide", title: heading, slide: words };
  }

  /** What the audience sees for a section of the draft (for its still). */
  function audienceOf(section: DraftSection): PresentationItem {
    if (section.show === "scripture") return bibleOf(section) ?? slideOf(section);
    if (section.show === "image") {
      const asset = session.media.find((entry) => entry.id === section.imageId);
      if (asset) return { id: `${section.id}-image`, kind: "image", title: asset.name, image: { assetId: asset.id } };
    }
    return slideOf(section);
  }

  /** The draft as a sermon. Returns the problems instead when a reference or image is missing. */
  function build(value: Draft): { sermon: Sermon; problems: string[] } {
    const problems: string[] = [];
    const sections: SermonSection[] = value.sections.map((section) => {
      const slide = slideOf(section);
      let attached: PresentationItem | null = null;
      if (section.show === "scripture") {
        attached = bibleOf(section);
        if (!attached) problems.push(t("{name}: “{reference}” is not a reference.", { name: section.name || t("A section"), reference: section.scripture || t("no reference") }));
      } else if (section.show === "image") {
        const asset = session.media.find((entry) => entry.id === section.imageId);
        if (!asset) problems.push(t("{name}: pick an image.", { name: section.name || t("A section") }));
        else attached = { id: `${section.id}-image`, kind: "image", title: asset.name, image: { assetId: asset.id } };
      }
      return {
        id: section.id,
        name: section.name,
        notes: section.notes,
        ...(section.notesRich ? { notesRich: section.notesRich } : {}),
        items: attached ? [attached, slide] : [slide],
        ...(section.minutes ? { minutes: section.minutes } : {}),
      };
    });
    return {
      sermon: {
        id: value.id,
        title: value.title,
        speaker: value.speaker,
        notes: value.notes,
        ...(value.notesRich ? { notesRich: value.notesRich } : {}),
        sections,
        updatedAt: new Date().toISOString(),
        ...(value.series.trim() ? { series: value.series.trim() } : {}),
        ...(value.date ? { date: value.date } : {}),
      },
      problems,
    };
  }

  function previewSection(sectionId: string) {
    const { sermon: built, problems } = build(draft);
    if (problems.length) onnote(problems[0]!);
    void session.previewSermonSection(built, sectionId);
  }

  async function save() {
    const { sermon: built, problems } = build(draft);
    if (problems.length) {
      onnote(problems[0]!);
      return;
    }
    if (!(await session.saveSermon(built))) {
      onnote(session.message);
      return;
    }
    onnote(t("{title} saved. Notes stay on this desk.", { title: built.title.trim() }));
    onclose(built.id);
  }

  let armedCancel = $state(false);
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    if (dirty && !armedCancel) {
      armedCancel = true;
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => (armedCancel = false), 3000);
      return;
    }
    onclose(null);
  }

  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  }

  // Sections: add, move, copy, remove, jump to.
  let cardDrag = $state<number | null>(null);
  let cardDrop = $state<number | null>(null);
  function dropCard(to: number) {
    if (cardDrag === null) return;
    const from = cardDrag;
    cardDrag = null;
    cardDrop = null;
    if (from === to) return;
    const next = draft.sections.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    draft.sections = next;
  }

  function moveSection(sectionId: string, direction: 1 | -1) {
    const from = draft.sections.findIndex((entry) => entry.id === sectionId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= draft.sections.length) return;
    const next = draft.sections.slice();
    [next[from], next[to]] = [next[to]!, next[from]!];
    draft.sections = next;
  }

  function insertAfter(sectionId: string | null, section: DraftSection) {
    const at = sectionId ? draft.sections.findIndex((entry) => entry.id === sectionId) : -1;
    const next = draft.sections.slice();
    next.splice(at < 0 ? next.length : at + 1, 0, section);
    draft.sections = next;
    jumpTo(section.id);
  }

  function copySection(section: DraftSection) {
    insertAfter(section.id, { ...$state.snapshot(section) as DraftSection, id: crypto.randomUUID(), name: t("{name} (copy)", { name: section.name }) });
  }

  function removeSection(sectionId: string) {
    draft.sections = draft.sections.filter((entry) => entry.id !== sectionId);
  }

  function addReferenceSection(after: DraftSection, reference: string) {
    insertAfter(after.id, { ...blankSection(reference), show: "scripture", scripture: reference });
    onnote(t("{reference} is a new section after {name}.", { reference, name: after.name }));
  }

  let jumped = $state<string | null>(null);
  function jumpTo(sectionId: string) {
    jumped = sectionId;
    requestAnimationFrame(() => document.getElementById(`sermon-card-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setTimeout(() => jumped === sectionId && (jumped = null), 1400);
  }

  // The verse text under a reference, so the operator sees it is the right passage.
  let verseText = $state<Record<string, string>>({});
  async function loadVerses(sectionId: string, reference: string) {
    const parsed = parseReference(reference, session.books);
    if (!parsed) {
      verseText = { ...verseText, [sectionId]: "" };
      return;
    }
    try {
      const verses = await api.verses(translationId, parsed.bookOrd, parsed.chapter);
      const start = parsed.startVerse ?? 1;
      const end = parsed.endVerse ?? (parsed.startVerse ? start : Math.min(start + 2, verses.length));
      const text = verses.filter((verse) => verse.verse >= start && verse.verse <= end).map((verse) => `${verse.verse} ${verse.text}`).join(" ");
      verseText = { ...verseText, [sectionId]: text };
    } catch {
      verseText = { ...verseText, [sectionId]: "" };
    }
  }
  $effect(() => {
    for (const section of draft.sections) if (section.show === "scripture") void loadVerses(section.id, section.scripture);
  });

  // Notes into an outline.
  let outlineOpen = $state(false);
  let outlineText = $state("");
  const outlineParts = $derived(outlineText.trim() ? outlineFromNotes(outlineText, session.books) : []);
  function useOutline(replace: boolean) {
    const made = outlineParts.map((part) => ({ ...blankSection(part.name), notes: part.notes, show: (part.scripture ? "scripture" : "slide") as Show, scripture: part.scripture }));
    const blankOnly = draft.sections.length === 1 && !draft.sections[0]!.notes.trim() && !draft.sections[0]!.heading.trim() && !draft.sections[0]!.body.trim();
    draft.sections = replace || blankOnly ? made : [...draft.sections, ...made];
    onnote(tn(made.length, "{n} section made from the notes. Check it, then Save.", "{n} sections made from the notes. Check them, then Save."));
    outlineOpen = false;
    outlineText = "";
  }

  // Summarize with the church's own AI service: notes in, a summary and points out.
  let summarizing = $state(false);
  let summary = $state<SermonSummary | null>(null);
  let summaryError = $state("");
  let aiSlides = $state<{ notes: string; title: string } | null>(null);
  let songIdeas = $state<{ notes: string; title: string } | null>(null);

  function notesFor(value: Draft): string {
    const parts = [value.notes.trim()];
    for (const section of value.sections) {
      const lines = [section.name, section.heading, section.scripture, section.body, section.notes].map((line) => line.trim()).filter(Boolean);
      if (lines.length) parts.push(lines.join("\n"));
    }
    return parts.filter(Boolean).join("\n\n");
  }

  async function summarize() {
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
    if (!summary) return;
    const added = summary.points.map((point) => ({
      ...blankSection(point.heading),
      show: (point.scripture && parseReference(point.scripture, session.books)?.startVerse ? "scripture" : "slide") as Show,
      heading: point.heading,
      body: point.body,
      scripture: point.scripture,
    }));
    draft.sections = [...draft.sections, ...added];
    onnote(tn(added.length, "{n} point added as a section. Check it, then Save.", "{n} points added as sections. Check them, then Save."));
    summary = null;
  }

  function useSummarySlide() {
    if (!summary) return;
    draft.sections = [...draft.sections, { ...blankSection(t("Summary")), heading: draft.title || t("Summary"), body: summary.summary }];
    onnote(t("The summary is a slide at the end. Save to keep it."));
  }

  const MINUTES = [1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40];
</script>

<svelte:window onkeydown={onKey} />
{#if aiSlides}<AiSlidesDialog notes={aiSlides.notes} title={aiSlides.title} onclose={() => (aiSlides = null)} />{/if}
{#if songIdeas}<SuggestSongsDialog notes={songIdeas.notes} title={songIdeas.title} onclose={() => (songIdeas = null)} />{/if}

<form class="editor" onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <div class="head">
    <div class="head-copy">
      <h2>{draft.isNew ? t("New sermon") : t("Edit sermon")}</h2>
      <span class="sub">{tn(draft.sections.length, "{n} section", "{n} sections")}{total ? ` · ${t("{n} min planned", { n: total })}` : ""}{dirty ? ` · ${t("Not saved")}` : ""}</span>
    </div>
    <div class="actions">
      <button type="button" class="desk-btn" class:on={outlineOpen} onclick={() => (outlineOpen = !outlineOpen)} data-tip={t("Paste your notes: headings become sections, references become scripture")}><Icon name="list" size={14} /> {t("Outline from notes")}</button>
      {#if session.aiOn("summary")}<button type="button" class="desk-btn ai-btn" disabled={summarizing} data-tip={session.aiReady ? t("Make a summary and points from your notes") : t("Set up the AI first")} onclick={() => void summarize()}>
        <Icon name="sparkles" size={14} /> {summarizing ? t("Summarizing…") : t("Summarize")}
      </button>{/if}
      {#if session.aiOn("slides")}<button type="button" class="desk-btn ai-btn" data-tip={t("Make a slide deck from these notes with your AI service")} onclick={() => (aiSlides = { notes: notesFor(draft), title: draft.title })}><Icon name="stage" size={14} /> {t("Make slides")}</button>{/if}
      {#if session.aiOn("songSuggest")}<button type="button" class="desk-btn ai-btn" data-tip={t("Songs that fit this sermon, from your library first")} onclick={() => (songIdeas = { notes: notesFor(draft), title: draft.title })}><Icon name="note" size={14} /> {t("Suggest songs")}</button>{/if}
      <button type="button" class="desk-btn ghost" class:armed={armedCancel} onclick={cancel}>{armedCancel ? t("Discard changes?") : t("Cancel")}</button>
      <button type="submit" class="desk-btn primary" title={keys(t("Save (⌘S)"))}>{t("Save")}</button>
    </div>
  </div>

  {#if outlineOpen}
    <section class="outline-from" aria-label={t("Outline from notes")}>
      <textarea bind:value={outlineText} rows="7" aria-label={t("Notes to turn into sections")} placeholder={t("Paste the sermon notes. Lines like “1. God loves us”, “# Close” or “Point 2:” start a section; the first reference under each is shown on screen.")}></textarea>
      {#if outlineParts.length}
        <ol class="parts-preview">
          {#each outlineParts as part, n (n)}
            <li><b>{n + 1}</b><span>{part.name}</span>{#if part.scripture}<em><Icon name="bible" size={11} /> {part.scripture}</em>{/if}</li>
          {/each}
        </ol>
      {/if}
      <div class="row-end">
        <button type="button" class="desk-btn ghost" onclick={() => (outlineOpen = false)}>{t("Close")}</button>
        <button type="button" class="desk-btn" disabled={!outlineParts.length} onclick={() => useOutline(true)}>{t("Replace the sections")}</button>
        <button type="button" class="desk-btn primary" disabled={!outlineParts.length} onclick={() => useOutline(false)}>{tn(outlineParts.length, "Add {n} section", "Add {n} sections")}</button>
      </div>
    </section>
  {/if}

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
    <input class="title-field" aria-label={t("Sermon title")} placeholder={t("Title")} bind:value={draft.title} />
    <input aria-label={t("Speaker")} placeholder={t("Speaker")} bind:value={draft.speaker} />
    <input aria-label={t("Series")} placeholder={t("Series (optional)")} list="sermon-series" bind:value={draft.series} />
    <input type="date" aria-label={t("Preached on")} title={t("The day it is preached")} bind:value={draft.date} />
    <datalist id="sermon-series">{#each seriesList as name (name)}<option value={name}></option>{/each}</datalist>
  </div>
  <div class="desk-only">
    <span><Icon name="lock" size={12} /> {t("Notes for the whole sermon · desk only")}</span>
    <InlineWords text={draft.notes} rich={draft.notesRich} multiline variant="full" rows={2} label={t("Operator notes")} placeholder={t("Reminders for the operator. Never shown to the audience.")} onchange={(words) => { draft.notes = words.text; draft.notesRich = words.rich; }} />
  </div>

  <div class="layout">
    <nav class="nav" aria-label={t("Sections")}>
      {#each draft.sections as section, i (section.id)}
        <button type="button" class="nav-row" class:on={jumped === section.id} onclick={() => jumpTo(section.id)}>
          <i>{i + 1}</i><span>{section.name || t("Untitled section")}</span>{#if section.minutes}<em>{section.minutes}′</em>{/if}
        </button>
      {/each}
      <button type="button" class="nav-add" onclick={() => insertAfter(null, blankSection(t("Section {n}", { n: draft.sections.length + 1 })))}><Icon name="plus" size={12} /> {t("Add section")}</button>
      {#if total}<p class="nav-total">{t("{n} min planned", { n: total })}</p>{/if}
    </nav>

    <div class="cards">
      {#each draft.sections as section, i (section.id)}
        {@const refs = referencesIn(section.notes, session.books).filter((ref) => ref.reference !== bibleOf(section)?.bible?.reference)}
        <div
          id="sermon-card-{section.id}"
          class="edit-card"
          role="group"
          aria-label={section.name}
          class:jumped={jumped === section.id}
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
              onkeydown={(event) => { if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); moveSection(section.id, event.key === "ArrowUp" ? -1 : 1); } }}
            ><Icon name="grip" size={14} /></button>
            <i>{i + 1}</i>
            <input class="name" aria-label={t("Section name")} placeholder={t("Section name")} bind:value={section.name} />
            <label class="minutes" title={t("Planned minutes for this section")}>
              <Icon name="clock" size={12} />
              <select aria-label={t("Minutes for {name}", { name: section.name })} value={section.minutes === null ? "" : String(section.minutes)} onchange={(event) => (section.minutes = event.currentTarget.value ? Number(event.currentTarget.value) : null)}>
                <option value="">{t("No time")}</option>
                {#each MINUTES as n (n)}<option value={String(n)}>{t("{n} min", { n })}</option>{/each}
                {#if section.minutes && !MINUTES.includes(section.minutes)}<option value={String(section.minutes)}>{t("{n} min", { n: section.minutes })}</option>{/if}
              </select>
            </label>
            <button type="button" class="row-tool" aria-label={t("Preview {name}", { name: section.name })} title={t("Preview")} onclick={() => previewSection(section.id)}><Icon name="play" size={14} /></button>
            <button type="button" class="row-tool" aria-label={t("Copy {name}", { name: section.name })} title={t("Make a copy below")} onclick={() => copySection(section)}><Icon name="copy" size={13} /></button>
            <button type="button" class="row-tool del" aria-label={t("Delete {name}", { name: section.name })} title={t("Delete this section")} onclick={() => removeSection(section.id)}><Icon name="trash" size={14} /></button>
          </div>
          <div class="two">
            <div class="audience-edit">
              <div class="seen-row">
                <div class="seg" role="radiogroup" aria-label={t("Audience sees")}>
                  {#each [["slide", msg("Slide"), "stage"], ["scripture", msg("Scripture"), "bible"], ["image", msg("Image"), "media"]] as [id, label, icon] (id)}
                    <button type="button" role="radio" aria-checked={section.show === id} class:on={section.show === id} onclick={() => (section.show = id as Show)}><Icon name={icon} size={12} /> {t(label)}</button>
                  {/each}
                </div>
                <button type="button" class="still" title={t("What the audience sees. Click for Preview.")} onclick={() => previewSection(section.id)}>
                  <ItemThumb item={audienceOf(section)} icon={section.show === "scripture" ? "bible" : section.show === "image" ? "media" : "stage"} label={section.name} />
                </button>
              </div>
              {#if section.show === "scripture"}
                <input aria-label={t("Attach scripture")} placeholder={t("John 3:16-17")} bind:value={section.scripture} class:bad={section.scripture.trim() !== "" && !bibleOf(section)} />
                {#if verseText[section.id]}<p class="verse-text">{verseText[section.id]}</p>
                {:else if section.scripture.trim() && !bibleOf(section)}<p class="verse-bad">{t("That does not read as a reference yet.")}</p>{/if}
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
              {#if section.show === "slide"}
                <TextWords heading={section.heading} body={section.body} rich={section.rich} headingLabel={msg("Audience heading")} bodyLabel={msg("Audience body")} headingPlaceholder={t("Heading on screen")} bodyPlaceholder={t("Text on screen")} onchange={(words) => { section.heading = words.heading; section.body = words.body; section.rich = words.rich; }} />
              {:else}
                <input aria-label={t("Audience heading")} placeholder={t("Heading (when shown as a slide)")} bind:value={section.heading} />
              {/if}
            </div>
            <div class="desk-only">
              <span><Icon name="lock" size={12} /> {t("Desk notes")}</span>
              <InlineWords text={section.notes} rich={section.notesRich} multiline variant="full" rows={5} label={t("Section notes")} placeholder={t("What to say, cues, timing. Desk only.")} onchange={(words) => { section.notes = words.text; section.notesRich = words.rich; }} />
              {#if refs.length}
                <div class="refs" aria-label={t("References in these notes")}>
                  <span>{t("In your notes:")}</span>
                  {#each refs.slice(0, 6) as ref (ref.reference)}
                    <button type="button" class="ref" title={t("Add {reference} as a scripture section after this one", { reference: ref.reference })} onclick={() => addReferenceSection(section, ref.reference)}><Icon name="plus" size={11} /> {ref.reference}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
      <button type="button" class="add" onclick={() => insertAfter(null, blankSection(t("Section {n}", { n: draft.sections.length + 1 })))}>
        <Icon name="plus" size={14} /> {t("Add section")}
      </button>
    </div>
  </div>
</form>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 18px; }
  .head { position: sticky; top: -14px; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: -14px -16px 0; padding: 12px 16px; background: color-mix(in srgb, var(--panel) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
  .head-copy { display: grid; gap: 2px; }
  .sub { font-size: 12px; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .armed { color: var(--live) !important; border-color: var(--live) !important; }
  input, select, textarea { border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; min-width: 0; }
  input, select { height: 32px; padding: 0 10px; }
  textarea { padding: 10px; resize: vertical; line-height: 1.45; }
  input.bad { border-color: #f5a524; }
  i { font-style: normal; display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 5px; background: var(--panel); color: var(--ink); font-size: 11px; font-weight: 700; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; }
  .title-field { font-size: 16px; font-weight: 700; height: 38px; }
  .fields input:not(.title-field) { height: 38px; }
  .desk-only { display: flex; flex-direction: column; gap: 6px; }
  .desk-only > span { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--muted); }
  .desk-only :global(textarea) { border-style: dashed; }

  .outline-from { display: grid; gap: 10px; padding: 14px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 12px; background: color-mix(in srgb, var(--accent) 5%, var(--field)); }
  .parts-preview { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  .parts-preview li { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); font-size: 12px; }
  .parts-preview b { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); font-size: 10px; }
  .parts-preview em { display: inline-flex; align-items: center; gap: 3px; font-style: normal; color: #d4a017; font-weight: 650; }
  .row-end { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }

  .layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 14px; align-items: start; }
  .nav { position: sticky; top: 56px; display: grid; gap: 2px; max-height: calc(100vh - 220px); overflow: auto; }
  .nav-row { display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .nav-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-row em { font-style: normal; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .nav-row:hover { background: var(--field); }
  .nav-row.on { border-color: var(--accent); }
  .nav-add { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 6px 8px; border: 1px dashed var(--line); border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .nav-add:hover { color: var(--ink); }
  .nav-total { margin: 6px 0 0; padding: 0 8px; font-size: 11px; color: var(--muted); }
  .cards { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

  .edit-card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); scroll-margin-top: 64px; transition: box-shadow 0.3s ease; }
  .edit-card.jumped { box-shadow: 0 0 0 2px var(--accent); }
  .edit-card input, .edit-card select { background: var(--panel); }
  .edit-head { display: flex; align-items: center; gap: 6px; }
  .edit-head .name { flex: 1; font-weight: 650; }
  .minutes { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); }
  .minutes select { height: 28px; padding: 0 6px; font-size: 12px; }
  .two { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; }
  .audience-edit { display: flex; flex-direction: column; gap: 8px; }
  .seen-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .still { flex: none; padding: 0; border: 0; background: none; cursor: pointer; border-radius: 6px; }
  .still :global(.item-thumb) { width: 112px; }
  .still:hover :global(.item-thumb) { outline: 2px solid var(--accent); }
  .seg { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .seg button { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .seg button.on { background: var(--accent); color: var(--on-accent); }
  .verse-text { margin: 0; padding: 8px 10px; border-left: 3px solid #d4a017; border-radius: 0 6px 6px 0; background: color-mix(in srgb, #d4a017 8%, var(--panel)); font-size: 12px; line-height: 1.5; max-height: 96px; overflow: auto; }
  .verse-bad { margin: 0; font-size: 12px; color: #f5a524; }
  .refs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
  .ref { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 8px; border: 1px solid color-mix(in srgb, #d4a017 50%, var(--line)); border-radius: 11px; background: color-mix(in srgb, #d4a017 10%, transparent); color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .ref:hover { background: color-mix(in srgb, #d4a017 22%, transparent); }
  .row-tool { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .row-tool:hover { background: var(--panel); color: var(--ink); }
  .row-tool.del:hover { color: var(--danger, #e5484d); }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--panel); }
  .edit-card.dragging { opacity: 0.4; }
  .edit-card.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .add { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border: 1px dashed var(--line); border-radius: var(--radius-control, 8px); background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
  .add:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }

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

  @media (max-width: 1280px) {
    .two { grid-template-columns: 1fr; }
  }
  @media (max-width: 1000px) {
    .layout { grid-template-columns: 1fr; }
    .nav { position: static; display: flex; flex-wrap: wrap; max-height: none; }
    .fields { grid-template-columns: 1fr 1fr; }
    .title-field { grid-column: 1 / -1; }
  }
</style>
