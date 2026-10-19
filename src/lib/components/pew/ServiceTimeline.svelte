<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockLabel, DEFAULT_START, leftLabel, lengthLabel, minutesOfDay, partState, planSchedule, slotNow } from "../../domain/schedule";
  import type { Service } from "../../domain/types";
  import { t, tn } from "../../i18n/core";
  import ScreenExtras from "./ScreenExtras.svelte";

  // The service at a glance: when it starts and ends, each section as a block in proportion to
  // its time, the time now, and on the day how much of the running section is left.
  // `compact`: the summary row only (the flow canvas shows the parts itself).
  let { service, count = 0, compact = false }: { service: Service; count?: number; compact?: boolean } = $props();

  let now = $state(minutesOfDay(Date.now()));
  $effect(() => {
    const timer = setInterval(() => (now = minutesOfDay(Date.now())), 15_000);
    return () => clearInterval(timer);
  });

  const plan = $derived(planSchedule(service));
  const timed = $derived(plan.slots.some((slot) => !slot.untimed));
  const running = $derived(session.runningSectionId);
  const startedAt = $derived(running && session.sectionStarts[running] ? minutesOfDay(session.sectionStarts[running]) : null);
  const status = $derived(slotNow(plan, running, now, startedAt));
  const runningName = $derived(service.sections.find((section) => section.id === running)?.name ?? "");
  let bar = $state<HTMLDivElement | undefined>();
  // When the parts do not all fit, keep the running one in view.
  $effect(() => {
    const id = running;
    if (!bar || !id) return;
    const index = plan.slots.findIndex((slot) => slot.sectionId === id);
    const block = bar.querySelectorAll<HTMLElement>(".block")[index];
    if (block && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, block.offsetLeft - 24), behavior: "smooth" });
  });

  /** A colour per section, by its place in the service (set on the Service page). */
  const toneOf = (index: number) => `var(--slot-${index % 8})`;
</script>

<div class="timeline">
  <div class="summary">
    <label class="start">
      <span>{t("Starts")}</span>
      <input type="time" aria-label={t("Service start time")} value={service.startTime ?? DEFAULT_START} onchange={(event) => session.setServiceStart(event.currentTarget.value)} />
    </label>
    {#if timed}
      <span class="fact"><span>{t("Ends")}</span><strong>{clockLabel(plan.end)}</strong></span>
      <span class="fact"><span>{t("Length")}</span><strong>{lengthLabel(plan.end - plan.start)}</strong></span>
      <span class="fact items">{count === 0 ? t("Nothing added yet") : tn(count, "{n} item", "{n} items")}</span>
    {:else}
      <span class="hint">{t("Give each section a time (the clock on its heading) to see the whole morning here.")}</span>
    {/if}
    <ScreenExtras />
    {#if status}
      <span class="live" class:over={status.left < 0} class:soon={status.left >= 0 && partState(status.minutes, status.left * 60_000, service.warnMinutes) === "soon"}>
        <i class="pulse" aria-hidden="true"></i>
        <strong>{runningName}</strong> · {leftLabel(status.left)}
        {#if status.behind !== null && Math.abs(status.behind) >= 2}
          <em class:late={status.behind > 0}>{status.behind > 0 ? t("{behind} behind", { behind: lengthLabel(status.behind) }) : t("{behind} ahead", { behind: lengthLabel(-status.behind) })}</em>
        {/if}
      </span>
    {/if}
  </div>

  {#if timed && !compact}
    <div class="bar" bind:this={bar} role="img" aria-label={t("Service timeline from {start} to {end}", { start: clockLabel(plan.start), end: clockLabel(plan.end) })}>
      {#each plan.slots as slot, index (slot.sectionId)}
        {#if slot.minutes > 0}
          <button
            type="button"
            class="block"
            class:running={slot.sectionId === running}
            class:soon={slot.sectionId === running && !!status && status.left >= 0 && partState(status.minutes, status.left * 60_000, service.warnMinutes) === "soon"}
            class:late={slot.sectionId === running && !!status && status.left < 0}
            class:past={slot.end <= now && slot.sectionId !== running}
            style:flex-grow={slot.minutes}
            style:--tone={toneOf(index)}
            title="{slot.name}: {clockLabel(slot.start)} – {clockLabel(slot.end)} ({lengthLabel(slot.minutes)})"
            onclick={() => (session.cursor = { sectionId: slot.sectionId, itemId: session.cursor.itemId })}
          >
            <span class="block-name"><i class="tl-dot" aria-hidden="true"></i>{slot.name}</span>
            <span class="block-time">{clockLabel(slot.start)}{slot.sectionId === running && status ? ` · ${leftLabel(status.left)}` : ""}</span>
            {#if now >= slot.start && now < slot.end}
              <!-- The time now, inside the part it falls in (blocks have a minimum width, so not to scale). -->
              <span class="now" style:left="{((now - slot.start) / Math.max(1, slot.end - slot.start)) * 100}%" title={t("Now, {time}", { time: clockLabel(now) })}></span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
    <div class="ticks" aria-hidden="true">
      <span>{clockLabel(plan.start)}</span>
      <span>{clockLabel(plan.end)}</span>
    </div>
  {/if}
</div>

<style>
  .timeline { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 50%, transparent); }
  .summary { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; min-height: 32px; }
  .start { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .start input { height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .fact { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12px; color: var(--muted); }
  .fact strong { color: var(--ink); font-size: 14px; font-variant-numeric: tabular-nums; }
  .hint { font-size: 12px; color: var(--muted); }
  .live { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; background: color-mix(in srgb, #30a46c 16%, transparent); color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; }
  .live.over { background: color-mix(in srgb, #e5484d 18%, transparent); }
  .live.soon { background: color-mix(in srgb, #f5a524 24%, transparent); }
  .live.soon .pulse { background: #f5a524; }
  .block.soon { background: color-mix(in srgb, #f5a524 18%, var(--field)); border-color: color-mix(in srgb, #f5a524 60%, var(--line)); }
  .block.late { background: color-mix(in srgb, #e5484d 16%, var(--field)); border-color: color-mix(in srgb, #e5484d 55%, var(--line)); }
  .live em { font-style: normal; font-size: 12px; padding: 1px 8px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .live em.late { background: color-mix(in srgb, #f5a524 30%, transparent); }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #30a46c; box-shadow: 0 0 0 0 rgb(48 164 108 / 0.6); animation: pulse 1.6s ease-out infinite; }
  .live.over .pulse { background: #e5484d; }
  @keyframes pulse { to { box-shadow: 0 0 0 8px rgb(48 164 108 / 0); } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

  .bar { position: relative; display: flex; gap: 3px; height: 50px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; padding-bottom: 4px; }
  .block { position: relative; flex-basis: 0; flex-shrink: 0; min-width: 78px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; text-align: left; overflow: hidden; }
  .block:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .block.past { opacity: 0.5; }
  .block.running { min-width: 150px; background: color-mix(in srgb, #30a46c 16%, var(--field)); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
  .block-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); flex: none; }
  .block-time { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
  .now { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #e5484d; border-radius: 1px; pointer-events: none; }
  .ticks { display: flex; justify-content: space-between; min-height: 14px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
