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
      <Icon name="clock" size={22} />
      <strong>{t("No times yet")}</strong>
      <p>{t("When the service runs, each part's time is kept from the moment something from it goes live. End service stops the clock.")}</p>
    </div>
  {:else}
    <div class="report">
      <header class="top">
        <label class="pick">
          <span>{t("Service of")}</span>
          <select value={run.id} onchange={(event) => (chosenId = event.currentTarget.value)}>
            {#each runs as entry (entry.id)}<option value={entry.id}>{when(entry.startedAt)}{entry.endedAt === null ? ` · ${t("running")}` : ""}</option>{/each}
          </select>
        </label>
        <span class="fact"><span>{t("Began")}</span><strong>{clock(run.startedAt)}</strong></span>
        <span class="fact"><span>{t("Ended")}</span><strong>{run.endedAt === null ? t("Still running") : clock(run.endedAt)}</strong></span>
        <span class="fact"><span>{t("Planned")}</span><strong>{lengthLabel(planned)}</strong></span>
        <span class="fact" class:over={planned > 0 && used / 60_000 > planned + 1}><span>{t("Used")}</span><strong>{usedLabel(used)}</strong></span>
      </header>

      <div class="table" role="table" aria-label={t("Planned and used time per part")}>
        <div class="row head" role="row">
          <span role="columnheader">{t("Part")}</span>
          <span role="columnheader">{t("Led by")}</span>
          <span role="columnheader">{t("Planned")}</span>
          <span role="columnheader">{t("Used")}</span>
          <span role="columnheader" class="bar-col">{t("Planned and used")}</span>
          <span role="columnheader">{t("Usually")}</span>
        </div>
        {#each parts as part, index (part.sectionId)}
          {@const over = overBy(part)}
          {@const habit = usual.get(part.sectionId)}
          <div class="row" role="row" class:skipped={part.startedAt === null} style:--tone="var(--slot-{index % 8})">
            <span role="cell" class="name"><i aria-hidden="true"></i>{part.name}</span>
            <span role="cell" class="leader">{part.leader || "—"}</span>
            <span role="cell">{part.planned === null ? "—" : lengthLabel(part.planned)}</span>
            <span role="cell" class="used">
              {part.startedAt === null ? t("Not reached") : usedLabel(part.usedMs)}
              {#if over !== null && over !== 0}<em class:late={over > 0}>{over > 0 ? `+${over}` : over} {t("min")}</em>{/if}
            </span>
            <span role="cell" class="bar-col">
              <span class="bar" aria-hidden="true">
                {#if part.planned}<span class="plan" style:width="{((part.planned * 60_000) / scale) * 100}%"></span>{/if}
                <span class="fill" class:late={over !== null && over > 0} style:width="{(part.usedMs / scale) * 100}%"></span>
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
</DeskDialog>

<style>
  .empty { display: grid; justify-items: center; gap: 8px; padding: 48px 24px; text-align: center; color: var(--muted); }
  .empty strong { color: var(--ink); font-size: 15px; }
  .empty p { margin: 0; max-width: 420px; font-size: 13px; line-height: 1.5; }
  .report { display: grid; gap: 16px; }
  .top { display: flex; flex-wrap: wrap; align-items: end; gap: 18px; }
  .pick { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .pick select { height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  .fact { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
  .fact strong { font-size: 15px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .fact.over strong { color: var(--danger, #e5484d); }
  .table { display: grid; border: 1px solid var(--line); border-radius: 12px; overflow: auto; }
  .row { display: grid; grid-template-columns: minmax(140px, 1.4fr) minmax(100px, 1fr) 80px 110px minmax(140px, 2fr) minmax(120px, 1.2fr); align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 13px; min-width: 760px; }
  .row.head { border-top: 0; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: color-mix(in srgb, var(--ink) 4%, transparent); }
  .row.skipped { color: var(--muted); }
  .name { display: flex; align-items: center; gap: 8px; font-weight: 650; }
  .name i { width: 8px; height: 8px; border-radius: 50%; background: var(--tone); flex: none; }
  .used { font-variant-numeric: tabular-nums; }
  .used em { margin-left: 6px; font-style: normal; font-size: 12px; color: var(--muted); }
  .used em.late { color: var(--danger, #e5484d); font-weight: 650; }
  .bar { position: relative; display: block; height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .plan { position: absolute; inset: 0 auto 0 0; border-radius: 5px; border: 1px dashed color-mix(in srgb, var(--ink) 35%, transparent); }
  .fill { position: absolute; inset: 2px auto 2px 0; border-radius: 4px; background: var(--tone); }
  .fill.late { background: var(--danger, #e5484d); }
  .habit { font-size: 12px; color: var(--muted); }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.ghost { background: none; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
</style>
