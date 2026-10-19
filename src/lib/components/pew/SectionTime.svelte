<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockLabel, clockValue, LENGTH_PRESETS, leftLabel, lengthLabel, minutesOfDay, type SlotPlan, slotNow, type SchedulePlan } from "../../domain/schedule";
  import type { ServiceSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // A section's time on its heading: "9:00 – 9:45 · 45 min", with a small editor for its length
  // or the clock time it runs until, and on the day how much is left.
  // `showLeft`: the time left beside the chip (the list shows it on the part's second line instead).
  let { section, slot, plan, tone, showLeft = true }: { section: ServiceSection; slot: SlotPlan; plan: SchedulePlan; tone: string; showLeft?: boolean } = $props();

  let open = $state(false);
  let wrap = $state<HTMLSpanElement | undefined>();
  let now = $state(minutesOfDay(Date.now()));
  $effect(() => {
    const timer = setInterval(() => (now = minutesOfDay(Date.now())), 15_000);
    return () => clearInterval(timer);
  });

  const running = $derived(session.runningSectionId === section.id);
  const started = $derived(session.sectionStarts[section.id]);
  const status = $derived(running ? slotNow(plan, section.id, now, started ? minutesOfDay(started) : null) : null);
  const mode = $derived(section.until ? "until" : "length");

  // Close when clicking elsewhere.
  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap && !wrap.contains(event.target as Node)) open = false;
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });
</script>

<span class="time" bind:this={wrap} style:--tone={tone}>
  {#if status && showLeft}
    <span class="left" class:over={status.left < 0}>{leftLabel(status.left)}</span>
  {/if}
  <button type="button" class="chip" class:untimed={slot.untimed} aria-expanded={open} aria-label={t("Time for {name}", { name: section.name })} onclick={() => (open = !open)}>
    <Icon name="clock" size={12} />
    {#if slot.untimed}
      {t("Set time")}
    {:else}
      <span class="range">{clockLabel(slot.start)} – {clockLabel(slot.end)}</span>
      <span class="len">{slot.until ? t("until {end}", { end: clockLabel(slot.end) }) : lengthLabel(slot.minutes)}</span>
    {/if}
  </button>

  {#if open}
    <div class="pop" role="dialog" aria-label={t("Time for {name}", { name: section.name })}>
      <div class="seg" role="radiogroup" aria-label={t("How the time is set")}>
        <button type="button" role="radio" aria-checked={mode === "length"} onclick={() => session.setSectionTiming(section.id, { minutes: section.minutes ?? (slot.minutes || 15) })}>{t("A length")}</button>
        <button type="button" role="radio" aria-checked={mode === "until"} onclick={() => session.setSectionTiming(section.id, { until: section.until ?? clockValue(slot.end > slot.start ? slot.end : slot.start + 30) })}>{t("Until a time")}</button>
      </div>

      {#if mode === "length"}
        <div class="presets">
          {#each LENGTH_PRESETS as minutes (minutes)}
            <button type="button" class:on={section.minutes === minutes} onclick={() => session.setSectionTiming(section.id, { minutes })}>{lengthLabel(minutes)}</button>
          {/each}
        </div>
        <div class="stepper">
          <button type="button" aria-label={t("Five minutes less")} onclick={() => session.setSectionTiming(section.id, { minutes: Math.max(0, (section.minutes ?? 0) - 5) })}><Icon name="minus" size={14} /></button>
          <label>
            <input type="number" min="0" max="600" step="5" aria-label={t("Minutes")} value={section.minutes ?? ""} placeholder="0" onchange={(event) => session.setSectionTiming(section.id, { minutes: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} />
            <span>{t("min")}</span>
          </label>
          <button type="button" aria-label={t("Five minutes more")} onclick={() => session.setSectionTiming(section.id, { minutes: (section.minutes ?? 0) + 5 })}><Icon name="plus" size={14} /></button>
        </div>
      {:else}
        <label class="until">
          <span>{t("Ends at")}</span>
          <input type="time" aria-label={t("Ends at")} value={section.until ?? ""} onchange={(event) => session.setSectionTiming(section.id, { until: event.currentTarget.value || null })} />
        </label>
        <p class="note">{t("Starts {start}, so {minutes} long.", { start: clockLabel(slot.start), minutes: lengthLabel(slot.minutes) })}</p>
      {/if}

      <div class="foot">
        <button type="button" class="ghost" onclick={() => { session.setSectionTiming(section.id, { minutes: null }); open = false; }}>{t("No time")}</button>
        <button type="button" class="ghost start" title={t("Mark this section as begun now (also happens when something in it goes live)")} onclick={() => { session.startSection(section.id); open = false; }}><Icon name="play" size={12} /> {t("Starting now")}</button>
        <button type="button" class="ghost" title={t("A big countdown to the end of this section on Preview; LIVE shows it")} onclick={() => { session.showCountdown(section.id); open = false; }}><Icon name="timer" size={12} /> {t("Countdown")}</button>
        <button type="button" class="done" onclick={() => (open = false)}>{t("Done")}</button>
      </div>
    </div>
  {/if}
</span>

<style>
  .time { position: relative; display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 13px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chip:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .chip.untimed { border-style: dashed; color: var(--muted); background: none; }
  .len { color: var(--muted); font-weight: 500; }
  .left { height: 24px; padding: 0 9px; border-radius: 12px; background: color-mix(in srgb, #30a46c 18%, transparent); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; font-variant-numeric: tabular-nums; }
  .left.over { background: color-mix(in srgb, #e5484d 20%, transparent); }
  .pop { position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; width: 290px; display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); box-shadow: 0 16px 40px rgb(0 0 0 / 0.45); }
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 3px; border-radius: 9px; background: var(--field); }
  .seg button { height: 28px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .seg button[aria-checked="true"] { background: var(--panel); color: var(--ink); }
  .presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .presets button { height: 30px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .presets button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .stepper { display: flex; align-items: center; gap: 6px; }
  .stepper > button { width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--ink); display: grid; place-items: center; }
  .stepper label { flex: 1; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); font-size: 12px; color: var(--muted); }
  .stepper input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; outline: none; }
  .until { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); }
  .until input { height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; font-weight: 700; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  .foot { display: flex; align-items: center; gap: 6px; }
  .foot button { height: 28px; padding: 0 10px; border-radius: 7px; font: inherit; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .ghost { border: 0; background: none; color: var(--muted); }
  .ghost:hover { color: var(--ink); }
  .ghost.start { color: #30a46c; }
  .done { margin-left: auto; border: 0; background: var(--accent); color: #fff; }
</style>
