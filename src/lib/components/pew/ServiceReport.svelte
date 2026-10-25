<script lang="ts">
  import { overBy, runCsv, runParts, usedLabel, usualOver, type ServiceRun } from "../../domain/service-run";
  import { lengthLabel } from "../../domain/schedule";
  import type { Service } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // Planned and used time per part, and who led it, for each time the service ran. The screen's
  // countdown stops at 00:00:00; this keeps counting, so the next plan can follow what happened.
  let { service, onclose }: { service: Service; onclose: () => void } = $props();

  const runs = $derived([...(service.runs ?? [])].reverse());
  let chosenId = $state<string | null>(null);
  const run = $derived<ServiceRun | null>(runs.find((entry) => entry.id === chosenId) ?? runs[0] ?? null);
  let now = $state(Date.now());
  $effect(() => {
    if (!run || run.endedAt !== null) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const parts = $derived(run ? runParts(service, run, now) : []);
  const usual = $derived(usualOver(service));
  const planned = $derived(parts.reduce((total, part) => total + (part.planned ?? 0), 0));
  const used = $derived(parts.reduce((total, part) => total + part.usedMs, 0));
  /** The scale for the bars: the longest planned or used part. */
  const scale = $derived(Math.max(1, ...parts.map((part) => Math.max((part.planned ?? 0) * 60_000, part.usedMs))));
  let note = $state("");
  /** One colour per part, as on the Service page (--slot-0…7 there), in the timelines, dots and bars. */
  const TONES = ["#5aa0d6", "#b07cc6", "#e0884e", "#58b3a4", "#d9677a", "#c9a35b", "#7d8fe0", "#7fa36b"];
  const toneOf = (index: number) => TONES[index % TONES.length]!;

  /** Minutes over the whole plan (negative: under), counting only parts that had a time. */
  const totalOver = $derived.by(() => {
    // Only parts that had a time and ran: a part never reached is not "under".
    const timed = parts.filter((part) => part.planned !== null && part.startedAt !== null);
    if (!timed.length) return null;
    return Math.round(timed.reduce((sum, part) => sum + part.usedMs, 0) / 60_000 - timed.reduce((sum, part) => sum + (part.planned ?? 0), 0));
  });
  /** On time within a minute; over by up to five is a warning; more is late. */
  const tone = (minutes: number | null) => (minutes === null || Math.abs(minutes) <= 1 ? "good" : minutes < 0 ? "under" : minutes <= 5 ? "warn" : "late");
  const reached = $derived(parts.filter((part) => part.startedAt !== null));
  const notReached = $derived(parts.filter((part) => part.startedAt === null));
  const biggest = $derived(
    parts.map((part) => ({ part, over: overBy(part) })).filter((entry): entry is { part: (typeof parts)[number]; over: number } => entry.over !== null && entry.over > 1).sort((a, b) => b.over - a.over)[0] ?? null,
  );
  /** Where the time went, as shares of the whole: plan and what happened. */
  const planTotal = $derived(Math.max(1, parts.reduce((sum, part) => sum + (part.planned ?? 0) * 60_000, 0)));
  const usedTotal = $derived(Math.max(1, used));
  const timelineMax = $derived(Math.max(planTotal, usedTotal));
  const headline = $derived(
    !run ? "" : run.endedAt === null ? t("Running now") : totalOver === null ? t("Finished") : Math.abs(totalOver) <= 1 ? t("Finished on time") : totalOver > 0 ? t("Finished {length} over", { length: lengthLabel(totalOver) }) : t("Finished {length} early", { length: lengthLabel(-totalOver) }),
  );

  const when = (at: number) => new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  function overText(minutes: number): string {
    if (minutes === 0) return t("on time");
    return minutes > 0 ? t("{length} over", { length: lengthLabel(minutes) }) : t("{length} under", { length: lengthLabel(-minutes) });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(runCsv(parts));
      note = t("Copied. Paste it into a spreadsheet.");
    } catch {
      note = t("This window could not copy. Use Save as a spreadsheet.");
    }
  }

  function download() {
    if (!run) return;
    const blob = new Blob([runCsv(parts)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const day = new Date(run.startedAt).toISOString().slice(0, 10);
    link.download = `${service.name.replace(/[^\w\- ]+/g, "").trim() || "service"} ${day}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note = t("Saved as a spreadsheet (CSV).");
  }
</script>

<DeskDialog title={t("Service report")} huge {onclose}>
  {#if !run}
    <div class="empty">
      <span class="empty-icon"><Icon name="clock" size={24} /></span>
      <strong>{t("No times yet")}</strong>
      <p>{t("When the service runs, each part's time is kept from the moment something from it goes live. End service stops the clock.")}</p>
    </div>
  {:else}
    <div class="report">
      <!-- The answer first: did it finish on time, and when. -->
      <section class="hero" data-tone={run.endedAt === null ? "running" : tone(totalOver)}>
        <div class="hero-copy">
          <label class="pick">
            <Icon name="clock" size={13} />
            <select aria-label={t("Service of")} value={run.id} onchange={(event) => (chosenId = event.currentTarget.value)}>
              {#each runs as entry (entry.id)}<option value={entry.id}>{when(entry.startedAt)}{entry.endedAt === null ? ` · ${t("running")}` : ""}</option>{/each}
            </select>
          </label>
          <h3>{headline}</h3>
          <p class="span">{clock(run.startedAt)} – {run.endedAt === null ? t("Still running") : clock(run.endedAt)}</p>
        </div>
        <dl class="facts">
          <div><dt>{t("Planned")}</dt><dd>{lengthLabel(planned)}</dd></div>
          <div><dt>{t("Used")}</dt><dd>{usedLabel(used)}</dd></div>
          <div><dt>{t("Parts")}</dt><dd>{reached.length}<small>/{parts.length}</small></dd></div>
        </dl>
      </section>

      <!-- Where the time went: the plan and what happened, part by part, on one scale. -->
      <section class="timeline" aria-label={t("Plan and what happened")}>
        <div class="track-row">
          <span class="track-label">{t("Plan")}</span>
          <div class="track" style:width="{(planTotal / timelineMax) * 100}%">
            {#each parts as part, index (part.sectionId)}
              {#if part.planned}<span class="seg plan-seg" style:--tone={toneOf(index)} style:flex-grow={part.planned} title="{part.name} · {lengthLabel(part.planned)}"></span>{/if}
            {/each}
          </div>
        </div>
        <div class="track-row">
          <span class="track-label">{t("Actual")}</span>
          <div class="track" style:width="{(usedTotal / timelineMax) * 100}%">
            {#each parts as part, index (part.sectionId)}
              {#if part.usedMs > 0}<span class="seg" style:--tone={toneOf(index)} style:flex-grow={part.usedMs} title="{part.name} · {usedLabel(part.usedMs)}"></span>{/if}
            {/each}
          </div>
        </div>
      </section>

      {#if biggest || notReached.length}
        <ul class="insights">
          {#if biggest}<li data-tone={tone(biggest.over)}><Icon name="timer" size={14} />{t("Biggest overrun: {name}, {length} over", { name: biggest.part.name, length: lengthLabel(biggest.over) })}</li>{/if}
          {#if notReached.length}<li data-tone="under"><Icon name="eye-off" size={14} />{t("Not reached: {names}", { names: notReached.map((part) => part.name).join(", ") })}</li>{/if}
        </ul>
      {/if}

      <div class="parts" role="table" aria-label={t("Planned and used time per part")}>
        <div class="part head" role="row">
          <span role="columnheader">{t("Part")}</span>
          <span role="columnheader">{t("Planned")}</span>
          <span role="columnheader">{t("Used")}</span>
          <span role="columnheader" class="bar-col">{t("Planned and used")}</span>
          <span role="columnheader">{t("Usually")}</span>
        </div>
        {#each parts as part, index (part.sectionId)}
          {@const over = overBy(part)}
          {@const habit = usual.get(part.sectionId)}
          {@const width = Math.max((part.planned ?? 0) * 60_000, part.usedMs)}
          <div class="part" role="row" class:skipped={part.startedAt === null} style:--tone={toneOf(index)}>
            <span role="cell" class="name">
              <i aria-hidden="true"></i>
              <span><strong>{part.name}</strong>{#if part.leader}<small>{part.leader}</small>{/if}</span>
            </span>
            <span role="cell" class="num">{part.planned === null ? "—" : lengthLabel(part.planned)}</span>
            <span role="cell" class="num">
              {part.startedAt === null ? t("Not reached") : usedLabel(part.usedMs)}
              {#if over !== null && over !== 0}<em class="chip" data-tone={tone(over)}>{over > 0 ? `+${over}` : over} {t("min")}</em>{/if}
            </span>
            <span role="cell" class="bar-col">
              <span class="bar" aria-hidden="true" style:width="{(width / scale) * 100}%">
                <span class="fill" data-tone={tone(over)} style:width="{width ? (part.usedMs / width) * 100 : 0}%"></span>
                {#if part.planned}<span class="mark" style:left="{((part.planned * 60_000) / width) * 100}%" title={t("Plan")}></span>{/if}
              </span>
            </span>
            <span role="cell" class="habit">{habit && habit.runs > 1 ? `${overText(habit.over)} · ${t("{n} services", { n: habit.runs })}` : "—"}</span>
          </div>
        {/each}
      </div>

      <footer class="foot">
        <button type="button" class="btn" onclick={() => void copy()}><Icon name="copy" size={14} /> {t("Copy for a spreadsheet")}</button>
        <button type="button" class="btn ghost" onclick={download}><Icon name="download" size={14} /> {t("Save as a spreadsheet")}</button>
        {#if note}<p class="note" role="status">{note}</p>{/if}
      </footer>
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={onclose}>{t("Close")}</button>
  {/snippet}
</DeskDialog>

<style>
  .empty { display: grid; justify-items: center; gap: 10px; padding: 56px 24px; text-align: center; color: var(--muted); }
  .empty-icon { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-text); }
  .empty strong { color: var(--ink); font-size: 16px; }
  .empty p { margin: 0; max-width: 440px; font-size: 13px; line-height: 1.5; }
  .report { display: grid; gap: 18px; }

  .hero { --tint: #3b82f6; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 24px; padding: 18px 20px; border: 1px solid color-mix(in srgb, var(--tint) 40%, var(--line)); border-radius: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--tint) 16%, var(--panel)), var(--panel) 70%); }
  .hero[data-tone="good"] { --tint: #30a46c; }
  .hero[data-tone="under"] { --tint: #3b82f6; }
  .hero[data-tone="warn"] { --tint: #f5a524; }
  .hero[data-tone="late"] { --tint: #e5484d; }
  .hero[data-tone="running"] { --tint: var(--accent); }
  .hero-copy { display: grid; gap: 4px; min-width: 0; }
  .hero h3 { margin: 2px 0 0; font-size: 24px; letter-spacing: -0.015em; color: var(--ink); }
  .span { margin: 0; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pick { display: inline-flex; align-items: center; gap: 6px; width: fit-content; color: var(--muted); }
  .pick select { height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--panel) 80%, transparent); color: var(--ink); font: inherit; font-size: 12px; }
  .facts { display: flex; gap: 10px; margin: 0; }
  .facts div { min-width: 92px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--panel) 85%, transparent); }
  .facts dt { font-size: 11px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .facts dd { margin: 2px 0 0; font-size: 20px; font-weight: 750; font-variant-numeric: tabular-nums; color: var(--ink); }
  .facts small { font-size: 13px; color: var(--muted); font-weight: 600; }

  .timeline { display: grid; gap: 8px; }
  .track-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 10px; }
  .track-label { font-size: 11px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .track { display: flex; gap: 2px; height: 18px; min-width: 24px; }
  .seg { flex-basis: 0; min-width: 3px; border-radius: 4px; background: var(--tone); }
  .plan-seg { background: color-mix(in srgb, var(--tone) 22%, transparent); border: 1px dashed color-mix(in srgb, var(--tone) 70%, transparent); }

  .insights { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .insights li { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; font-size: 13px; background: color-mix(in srgb, var(--chip, var(--muted)) 14%, transparent); color: var(--ink); }
  [data-tone="good"] { --chip: #30a46c; }
  [data-tone="under"] { --chip: #3b82f6; }
  [data-tone="warn"] { --chip: #f5a524; }
  [data-tone="late"] { --chip: #e5484d; }

  .parts { display: grid; border: 1px solid var(--line); border-radius: 14px; overflow: auto; }
  .part { display: grid; grid-template-columns: minmax(170px, 1.5fr) 80px 130px minmax(160px, 2fr) minmax(130px, 1.1fr); align-items: center; gap: 14px; padding: 12px 16px; border-top: 1px solid var(--line); font-size: 13px; min-width: 760px; }
  .part:not(.head):hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
  .part.head { border-top: 0; padding-block: 9px; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: color-mix(in srgb, var(--ink) 4%, transparent); }
  .part.skipped { color: var(--muted); }
  .name { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .name i { width: 10px; height: 10px; border-radius: 3px; background: var(--tone); flex: none; }
  .name > span { display: grid; min-width: 0; }
  .name strong { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name small { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .chip { padding: 1px 7px; border-radius: 999px; font-style: normal; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--chip, var(--muted)) 18%, transparent); color: color-mix(in srgb, var(--chip, var(--muted)) 85%, var(--ink)); }
  .bar { position: relative; display: block; height: 10px; min-width: 6px; border-radius: 5px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 5px; background: var(--tone); }
  .fill[data-tone="warn"] { background: #f5a524; }
  .fill[data-tone="late"] { background: #e5484d; }
  .mark { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ink); opacity: 0.7; }
  .habit { font-size: 12px; color: var(--muted); }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.ghost { background: none; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  @media (max-width: 720px) { .facts { width: 100%; } .facts div { flex: 1; min-width: 0; } }
</style>
