<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockLabel, lengthLabel, minutesOfDay, planSchedule, shiftSchedule, startCheck } from "../../domain/schedule";
  import type { Service } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // Before the service starts: the time now against the planned start. Late, the plan can move to
  // now (each part keeps its length) or run behind; early, the start can wait for the planned time.
  let { service, onclose }: { service: Service; onclose: () => void } = $props();

  let now = $state(minutesOfDay(Date.now()));
  $effect(() => {
    const timer = setInterval(() => (now = minutesOfDay(Date.now())), 1000);
    return () => clearInterval(timer);
  });
  const check = $derived(startCheck(service, now));
  const plan = $derived(planSchedule(service));
  const moved = $derived(planSchedule(shiftSchedule(service, Math.floor(now))));
  let countdown = $state(true);

  // On time: nothing to decide.
  $effect(() => {
    if (check.kind !== "on-time") return;
    session.startService();
    onclose();
  });

  function start(move: boolean) {
    session.startService(move);
    onclose();
  }

  function wait() {
    session.queueStart(countdown);
    onclose();
  }
</script>

<DeskDialog title={t("Start {name}", { name: service.name })} {onclose}>
  <div class="start">
    <div class="clocks">
      <span class="clock"><span>{t("Now")}</span><strong>{clockLabel(now)}</strong></span>
      <Icon name="chevron-right" size={16} />
      <span class="clock" class:late={check.kind === "late"} class:early={check.kind === "early"}><span>{t("Planned start")}</span><strong>{clockLabel(check.planned)}</strong></span>
    </div>

    {#if check.kind === "late"}
      <p class="lead"><strong>{t("This service was planned to start {length} ago.", { length: lengthLabel(check.by) })}</strong> {t("A service cannot start in the past. Move its times to now, or keep the plan and run behind.")}</p>
      <div class="choices">
        <button type="button" class="choice primary" onclick={() => start(true)}>
          <Icon name="clock" size={16} />
          <span><strong>{t("Start now at {time}", { time: clockLabel(Math.floor(now)) })}</strong><em>{t("Every part keeps its length. Ends at {end} instead of {planned}.", { end: clockLabel(moved.end), planned: clockLabel(plan.end) })}</em></span>
        </button>
        <button type="button" class="choice" onclick={() => start(false)}>
          <Icon name="play" size={16} />
          <span><strong>{t("Start now, keep the planned times")}</strong><em>{t("The desk shows the service {length} behind.", { length: lengthLabel(check.by) })}</em></span>
        </button>
      </div>
    {:else if check.kind === "early"}
      <p class="lead"><strong>{t("This service starts at {time}, in {length}.", { time: clockLabel(check.planned), length: lengthLabel(check.by) })}</strong> {t("Wait for the planned time, or start now and move the times earlier.")}</p>
      <div class="choices">
        <button type="button" class="choice primary" onclick={wait}>
          <Icon name="timer" size={16} />
          <span><strong>{t("Wait and start at {time}", { time: clockLabel(check.planned) })}</strong><em>{t("The service starts by itself at that time. Keep the app open.")}</em></span>
        </button>
        <label class="also"><input type="checkbox" bind:checked={countdown} /> {t("Put the “Service starts in” countdown on Preview (LIVE shows it)")}</label>
        <button type="button" class="choice" onclick={() => start(true)}>
          <Icon name="play" size={16} />
          <span><strong>{t("Start now at {time}", { time: clockLabel(Math.floor(now)) })}</strong><em>{t("Every part keeps its length. Ends at {end} instead of {planned}.", { end: clockLabel(moved.end), planned: clockLabel(plan.end) })}</em></span>
        </button>
      </div>
    {/if}
    <footer class="foot">
      <button type="button" class="ghost" onclick={onclose}>{t("Cancel")}</button>
    </footer>
  </div>
</DeskDialog>

<style>
  .start { display: grid; gap: 16px; width: min(520px, 100%); }
  .clocks { display: flex; align-items: center; gap: 14px; color: var(--muted); }
  .clock { display: grid; gap: 2px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; font-size: 12px; }
  .clock strong { font-size: 22px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .clock.late { border-color: color-mix(in srgb, var(--danger, #e5484d) 60%, var(--line)); }
  .clock.late strong { color: var(--danger, #e5484d); }
  .clock.early { border-color: color-mix(in srgb, #30a46c 60%, var(--line)); }
  .lead { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .lead strong { display: block; color: var(--ink); font-size: 14px; }
  .choices { display: grid; gap: 8px; }
  .choice { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .choice:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
  .choice.primary { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .choice span { display: grid; gap: 3px; }
  .choice strong { font-size: 14px; }
  .choice em { font-style: normal; font-size: 12px; color: var(--muted); }
  .also { display: flex; align-items: center; gap: 8px; margin: -2px 0 4px 14px; font-size: 12px; color: var(--muted); }
  .foot { display: flex; justify-content: flex-end; }
  .ghost { height: 32px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--ink); font: inherit; font-size: 13px; }
</style>
