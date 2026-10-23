<script lang="ts">
  import { session } from "../../../app/session.svelte";
  import { resetSermonClock, sermonClock, watchClock } from "../../../app/sermon-clock.svelte";
  import { clockText, paceOf, sectionSpent } from "../../../domain/sermon-clock";
  import { plannedMinutes, sermonAudienceItem } from "../../../domain/sermon";
  import type { Sermon } from "../../../domain/types";
  import { t } from "../../../i18n/core";
  import Icon from "../../Icon.svelte";
  import RichView from "../../RichView.svelte";
  import ItemThumb from "../ItemThumb.svelte";
  import SermonRail from "./SermonRail.svelte";
  import LiveNotesCard from "./LiveNotesCard.svelte";

  // Preach mode: the section being preached in large type for whoever runs the screen (or the
  // preacher at a confidence monitor), its time against the plan, and what comes next. One button
  // moves on: the next section goes straight to LIVE.
  let { sermon, onexit }: { sermon: Sermon; onexit: () => void } = $props();

  $effect(() => watchClock());

  const SIZE_KEY = "church-studio.preach-size";
  let size = $state(readSize());
  function readSize(): number {
    try {
      const value = Number(localStorage.getItem(SIZE_KEY));
      return value >= 14 && value <= 44 ? value : 22;
    } catch {
      return 22;
    }
  }
  function setSize(next: number) {
    size = Math.min(44, Math.max(14, next));
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      // Kept for this visit only.
    }
  }

  const programSource = $derived(session.live.program.sourceId ?? "");
  const liveId = $derived(programSource.startsWith(`sermon:${sermon.id}:`) ? programSource.slice(`sermon:${sermon.id}:`.length) : null);
  const previewId = $derived(session.sermonFocus?.sermonId === sermon.id ? session.sermonFocus.sectionId : null);
  const currentId = $derived(liveId ?? previewId ?? sermon.sections[0]?.id ?? null);
  const index = $derived(sermon.sections.findIndex((section) => section.id === currentId));
  const current = $derived(sermon.sections[index] ?? null);
  const next = $derived(index >= 0 ? (sermon.sections[index + 1] ?? null) : null);
  const previous = $derived(index > 0 ? sermon.sections[index - 1]! : null);
  const clock = $derived(sermonClock.value?.sermonId === sermon.id ? sermonClock.value : null);
  const total = $derived(plannedMinutes(sermon));
  const elapsed = $derived(clock ? sermonClock.now - clock.startedAt : 0);
  const spent = $derived(current ? sectionSpent(clock, current.id, sermonClock.now) : 0);
  const pace = $derived(paceOf(spent, current?.minutes));
  const totalPace = $derived(paceOf(elapsed, total || undefined));
  const previewWaiting = $derived(previewId !== null && previewId !== liveId);

  async function toLive(sectionId: string) {
    await session.previewSermonSection(sermon, sectionId);
    await session.take();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented || session.findOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], dialog")) return;
    event.preventDefault();
    onexit();
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="preach" aria-label={t("Preach mode")} style:--notes-size="{size}px">
  <header class="top">
    <span class="mode"><i aria-hidden="true"></i>{t("Preach mode")}</span>
    <strong class="name">{sermon.title}</strong>
    <span class="clock {totalPace}" title={t("Time since the sermon first went LIVE")}>
      <Icon name="clock" size={13} />
      {clock ? clockText(elapsed) : "0:00"}{#if total}<em>/ {t("{n} min", { n: total })}</em>{/if}
    </span>
    <button type="button" class="tool" title={t("Start the sermon clock again from zero")} aria-label={t("Reset the clock")} onclick={resetSermonClock}><Icon name="refresh" size={13} /></button>
    <span class="sizer" role="group" aria-label={t("Text size")}>
      <button type="button" class="tool" aria-label={t("Smaller text")} onclick={() => setSize(size - 2)}>A−</button>
      <button type="button" class="tool" aria-label={t("Larger text")} onclick={() => setSize(size + 2)}>A+</button>
    </span>
    <button type="button" class="desk-btn" onclick={onexit} title={t("Back to the outline (Esc)")}><Icon name="close" size={13} /> {t("Exit")}</button>
  </header>

  <SermonRail {sermon} {previewId} {liveId} big onpick={(id) => void session.previewSermonSection(sermon, id)} />

  <div class="body">
    <article class="now">
      {#if current}
        <div class="now-head">
          <span class="where" class:live={liveId === current.id}>{liveId === current.id ? t("On screen now") : t("On Preview")}</span>
          <span class="count">{t("{n} of {total}", { n: index + 1, total: sermon.sections.length })}</span>
          <span class="clock {pace}" title={t("Time on this section")}>{clockText(spent)}{#if current.minutes}<em>/ {t("{n} min", { n: current.minutes })}</em>{/if}</span>
        </div>
        <h2>{current.name}</h2>
        <div class="notes">
          {#if current.notesRich}<RichView doc={current.notesRich} base="var(--notes-size)" />
          {:else if current.notes.trim()}<p>{current.notes}</p>
          {:else}<p class="none">{t("No notes for this section.")}</p>{/if}
        </div>
        {#if sermon.notes.trim()}
          <details class="whole">
            <summary><Icon name="lock" size={12} /> {t("Notes for the whole sermon")}</summary>
            {#if sermon.notesRich}<RichView doc={sermon.notesRich} base="1em" />{:else}<p>{sermon.notes}</p>{/if}
          </details>
        {/if}
      {/if}
    </article>

    <aside class="side">
      {#if current}
        <div class="peek">
          <span class="kicker">{liveId === current.id ? t("The audience sees") : t("Will show")}</span>
          <ItemThumb item={sermonAudienceItem(current)} icon="stage" label={current.name} />
        </div>
      {/if}
      <div class="peek next">
        <span class="kicker">{t("Next")}</span>
        {#if next}
          <ItemThumb item={sermonAudienceItem(next)} icon="stage" label={next.name} />
          <strong>{next.name}</strong>
          {#if next.minutes}<em>{t("{n} min", { n: next.minutes })}</em>{/if}
          {#if next.notes.trim()}<span class="next-notes">{next.notes.trim().split("\n")[0]}</span>{/if}
        {:else}
          <strong class="end">{t("End of the sermon")}</strong>
        {/if}
      </div>
      <div class="moves">
        {#if previewWaiting}
          <button type="button" class="desk-btn live-btn" onclick={() => void session.take()}><Icon name="play" size={14} /> {t("LIVE")}</button>
        {/if}
        <button type="button" class="desk-btn primary big" disabled={!next} onclick={() => next && void toLive(next.id)}>{t("Next to LIVE")} <Icon name="chevron-right" size={16} /></button>
        <button type="button" class="desk-btn" disabled={!previous} onclick={() => previous && void toLive(previous.id)}><Icon name="chevron-left" size={14} /> {t("Back")}</button>
      </div>
      <LiveNotesCard {sermon} compact />
    </aside>
  </div>
</section>

<style>
  .preach { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .mode { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 11px; font-weight: 750; letter-spacing: 0.05em; text-transform: uppercase; }
  .mode i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .name { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .clock { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; font-weight: 750; font-size: 15px; color: var(--ink); }
  .clock em { font-style: normal; font-weight: 600; font-size: 12px; color: var(--muted); }
  .clock.near { color: #f5a524; }
  .clock.over { color: var(--live, #e5484d); }
  .tool { display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .tool:hover { background: var(--field); }
  .sizer { display: inline-flex; gap: 3px; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 260px); gap: 16px; }
  .now { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--field); }
  .now-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .where { padding: 2px 9px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: 0.05em; }
  .where.live { background: var(--live, #e5484d); color: #fff; }
  .count { font-size: 12px; color: var(--muted); }
  .now-head .clock { margin-left: auto; }
  h2 { margin: 0; font-size: clamp(22px, 3vw, 38px); line-height: 1.15; }
  .notes { font-size: var(--notes-size); line-height: 1.5; }
  .notes p { margin: 0; white-space: pre-wrap; }
  .notes .none { font-size: 14px; color: var(--muted); }
  .whole { font-size: 14px; color: var(--muted); }
  .whole summary { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 650; }
  .whole p { white-space: pre-wrap; }
  .side { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  .peek { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .peek :global(.item-thumb) { width: 100%; }
  .peek strong { font-size: 14px; }
  .peek em { font-style: normal; font-size: 12px; color: var(--muted); }
  .peek .end { color: var(--muted); }
  .next-notes { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .kicker { font-size: 11px; font-weight: 700; color: var(--muted); }
  .moves { display: grid; gap: 6px; margin-top: auto; }
  .moves .big { height: 48px; justify-content: center; font-size: 15px; }
  .moves :global(.desk-btn) { justify-content: center; }
  .live-btn { border-color: transparent; background: var(--live, #e5484d); color: #fff; font-weight: 750; }
  @media (max-width: 900px) {
    .body { grid-template-columns: 1fr; }
    .side { flex-direction: row; flex-wrap: wrap; }
    .peek { flex: 1 1 180px; }
    .moves { flex: 1 1 100%; }
  }
</style>
