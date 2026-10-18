<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockLabel, DEFAULT_START, leftLabel, lengthLabel, minutesOfDay, planSchedule, slotNow } from "../../domain/schedule";
  import type { Service } from "../../domain/types";
  import { msg, t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

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
      <span>{t("Starts")}</span>
      <input type="time" aria-label={t("Service start time")} value={service.startTime ?? DEFAULT_START} onchange={(event) => session.setServiceStart(event.currentTarget.value)} />
    </label>
    {#if timed}
      <span class="fact"><span>{t("Ends")}</span><strong>{clockLabel(plan.end)}</strong></span>
      <span class="fact"><span>{t("Length")}</span><strong>{lengthLabel(plan.end - plan.start)}</strong></span>
    {:else}
      <span class="hint">{t("Give each section a time (the clock on its heading) to see the whole morning here.")}</span>
    {/if}
    <span class="countdown" role="group" aria-label={t("Countdown on the screen")}>
      <span class="cd-label">{t("Countdown")}</span>
      <button type="button" class:on={session.countdownOverlayOn} aria-pressed={session.countdownOverlayOn} title={t("The time left in a corner of the screen (place and size it in Overlays)")} onclick={() => session.toggleCountdownOverlay()}>{t("On screen")}</button>
      <button type="button" title={t("A big countdown on Preview; LIVE shows it")} onclick={() => session.showCountdown()}>{t("Full screen")}</button>
      <select aria-label={t("Full-screen countdown size")} value={String(session.workspace.countdownSize)} onchange={(event) => session.setCountdownSize(Number(event.currentTarget.value))}>
        {#each [[160, msg("Medium")], [220, msg("Large")], [300, msg("Huge")], [400, msg("Giant")]] as [size, label] (size)}<option value={String(size)}>{t(String(label))}</option>{/each}
      </select>
      <button type="button" class="sound" class:on={session.workspace.timerSounds.on} aria-pressed={session.workspace.timerSounds.on} aria-label={t("Timer sounds")} title={session.workspace.timerSounds.on ? t("Beeps at the warning times and at 00:00:00. Click to mute (Settings › Sound & voice for more).") : t("Timer sounds are off. Click to turn them on.")} onclick={() => session.setTimerSounds({ on: !session.workspace.timerSounds.on })}><Icon name={session.workspace.timerSounds.on ? "bell" : "bell-off"} size={13} /></button>
    </span>
    {#if status}
      <span class="live" class:over={status.left < 0}>
        <i class="pulse" aria-hidden="true"></i>
        <strong>{runningName}</strong> · {leftLabel(status.left)}
        {#if status.behind !== null && Math.abs(status.behind) >= 2}
          <em class:late={status.behind > 0}>{status.behind > 0 ? t("{behind} behind", { behind: lengthLabel(status.behind) }) : t("{behind} ahead", { behind: lengthLabel(-status.behind) })}</em>
        {/if}
      </span>
    {/if}
  </div>

  {#if timed}
    <div class="bar" role="img" aria-label={t("Service timeline from {start} to {end}", { start: clockLabel(plan.start), end: clockLabel(plan.end) })}>
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
            <span class="block-name"><i class="tl-dot" aria-hidden="true"></i>{slot.name}</span>
            <span class="block-time">{clockLabel(slot.start)}</span>
          </button>
        {/if}
      {/each}
      {#if nowPercent >= 0 && nowPercent <= 100}
        <span class="now" style:left="{nowPercent}%" title={t("Now, {time}", { time: clockLabel(now) })}><span>{clockLabel(now)}</span></span>
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
  .countdown { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; }
  .cd-label { padding: 0 6px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .countdown button, .countdown select { height: 26px; padding: 0 9px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .countdown button:hover { background: var(--field); }
  .countdown button.on { background: #30a46c; color: #fff; }
  .countdown select { background: var(--field); }
  .live { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; background: color-mix(in srgb, #30a46c 16%, transparent); color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; }
  .live.over { background: color-mix(in srgb, #e5484d 18%, transparent); }
  .live em { font-style: normal; font-size: 12px; padding: 1px 8px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .live em.late { background: color-mix(in srgb, #f5a524 30%, transparent); }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #30a46c; box-shadow: 0 0 0 0 rgb(48 164 108 / 0.6); animation: pulse 1.6s ease-out infinite; }
  .live.over .pulse { background: #e5484d; }
  @keyframes pulse { to { box-shadow: 0 0 0 8px rgb(48 164 108 / 0); } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

  .bar { position: relative; display: flex; gap: 3px; height: 46px; }
  .block { position: relative; flex-basis: 0; min-width: 6px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; text-align: left; overflow: hidden; }
  .block:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .block.past { opacity: 0.5; }
  .block.running { background: color-mix(in srgb, #30a46c 16%, var(--field)); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
  .block-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); flex: none; }
  .block-time { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
  .now { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: #e5484d; border-radius: 1px; pointer-events: none; }
  .now span { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); padding: 0 5px; border-radius: 4px; background: #e5484d; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ticks { display: flex; justify-content: space-between; min-height: 14px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .countdown .sound { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; color: var(--muted); }
  .countdown .sound.on { color: var(--ink); }
</style>
