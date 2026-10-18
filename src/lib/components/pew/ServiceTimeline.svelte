<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockLabel, DEFAULT_START, leftLabel, lengthLabel, minutesOfDay, planSchedule, slotNow } from "../../domain/schedule";
  import type { Service } from "../../domain/types";

  // The service at a glance: when it starts and ends, each section as a block in proportion to
  // its time, the time now, and on the day how much of the running section is left.
  let { service }: { service: Service } = $props();

  let now = $state(minutesOfDay(Date.now()));
  $effect(() => {
    const timer = setInterval(() => (now = minutesOfDay(Date.now())), 15_000);
    return () => clearInterval(timer);
  });

  const plan = $derived(planSchedule(service));
  const span = $derived(Math.max(1, plan.end - plan.start));
  const timed = $derived(plan.slots.some((slot) => !slot.untimed));
  const running = $derived(session.runningSectionId);
  const startedAt = $derived(running && session.sectionStarts[running] ? minutesOfDay(session.sectionStarts[running]) : null);
  const status = $derived(slotNow(plan, running, now, startedAt));
  const runningName = $derived(service.sections.find((section) => section.id === running)?.name ?? "");
  const nowPercent = $derived(((now - plan.start) / span) * 100);

  /** A colour per section, by its place in the service (set on the Service page). */
  const toneOf = (index: number) => `var(--slot-${index % 8})`;
</script>

<div class="timeline">
  <div class="summary">
    <label class="start">
      <span>Starts</span>
      <input type="time" aria-label="Service start time" value={service.startTime ?? DEFAULT_START} onchange={(event) => session.setServiceStart(event.currentTarget.value)} />
    </label>
    {#if timed}
      <span class="fact"><span>Ends</span><strong>{clockLabel(plan.end)}</strong></span>
      <span class="fact"><span>Length</span><strong>{lengthLabel(plan.end - plan.start)}</strong></span>
    {:else}
      <span class="hint">Give each section a time (the clock on its heading) to see the whole morning here.</span>
    {/if}
    {#if status}
      <span class="live" class:over={status.left < 0}>
        <i class="pulse" aria-hidden="true"></i>
        <strong>{runningName}</strong> · {leftLabel(status.left)}
        {#if status.behind !== null && Math.abs(status.behind) >= 2}
          <em class:late={status.behind > 0}>{status.behind > 0 ? `${lengthLabel(status.behind)} behind` : `${lengthLabel(-status.behind)} ahead`}</em>
        {/if}
      </span>
    {/if}
  </div>

  {#if timed}
    <div class="bar" role="img" aria-label="Service timeline from {clockLabel(plan.start)} to {clockLabel(plan.end)}">
      {#each plan.slots as slot, index (slot.sectionId)}
        {#if slot.minutes > 0}
          <button
            type="button"
            class="block"
            class:running={slot.sectionId === running}
            class:past={slot.end <= now && slot.sectionId !== running}
            style:flex-grow={slot.minutes}
            style:--tone={toneOf(index)}
            title="{slot.name}: {clockLabel(slot.start)} – {clockLabel(slot.end)} ({lengthLabel(slot.minutes)})"
            onclick={() => (session.cursor = { sectionId: slot.sectionId, itemId: session.cursor.itemId })}
          >
            <span class="block-name">{slot.name}</span>
            <span class="block-time">{clockLabel(slot.start)}</span>
          </button>
        {/if}
      {/each}
      {#if nowPercent >= 0 && nowPercent <= 100}
        <span class="now" style:left="{nowPercent}%" title="Now, {clockLabel(now)}"><span>{clockLabel(now)}</span></span>
      {/if}
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
  .live em { font-style: normal; font-size: 12px; padding: 1px 8px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .live em.late { background: color-mix(in srgb, #f5a524 30%, transparent); }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #30a46c; box-shadow: 0 0 0 0 rgb(48 164 108 / 0.6); animation: pulse 1.6s ease-out infinite; }
  .live.over .pulse { background: #e5484d; }
  @keyframes pulse { to { box-shadow: 0 0 0 8px rgb(48 164 108 / 0); } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

  .bar { position: relative; display: flex; gap: 3px; height: 46px; }
  .block { position: relative; flex-basis: 0; min-width: 6px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 0 8px; border: 0; border-radius: 7px; background: color-mix(in srgb, var(--tone) 26%, var(--field)); box-shadow: inset 0 -3px 0 var(--tone); color: var(--ink); font: inherit; text-align: left; overflow: hidden; }
  .block:hover { background: color-mix(in srgb, var(--tone) 38%, var(--field)); }
  .block.past { opacity: 0.55; }
  .block.running { background: color-mix(in srgb, var(--tone) 48%, var(--field)); outline: 2px solid var(--tone); outline-offset: 1px; }
  .block-name { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block-time { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
  .now { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: #e5484d; border-radius: 1px; pointer-events: none; }
  .now span { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); padding: 0 5px; border-radius: 4px; background: #e5484d; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ticks { display: flex; justify-content: space-between; min-height: 14px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
