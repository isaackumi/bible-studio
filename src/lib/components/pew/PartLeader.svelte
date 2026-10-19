<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockCount, partState, sectionDeadline, type SchedulePlan, type SlotPlan } from "../../domain/schedule";
  import { activeRun, usedBySection, usedLabel } from "../../domain/service-run";
  import type { ServiceSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // A part's second line: who leads it (a button puts the name on the screen or on Preview), and on
  // the day the time it has really used against its plan, as a bar that keeps going past the end.
  let { section, slot, plan }: { section: ServiceSection; slot: SlotPlan; plan: SchedulePlan } = $props();

  const planned = $derived(slot.untimed ? null : slot.minutes);
  const run = $derived(activeRun(session.service));
  const running = $derived(session.runningSectionId === section.id);
  let now = $state(Date.now());
  $effect(() => {
    if (!run) return;
    const timer = setInterval(() => (now = Date.now()), running ? 1000 : 15_000);
    return () => clearInterval(timer);
  });
  const used = $derived(run ? (usedBySection(run, now).get(section.id) ?? 0) : 0);
  const share = $derived(planned ? used / (planned * 60_000) : 0);
  const over = $derived(planned !== null && share > 1);
  /** Time left in the running part (ms; negative: over), from when it began and its plan. */
  const leftMs = $derived.by(() => {
    if (!running) return null;
    const deadline = sectionDeadline(plan, section.id, session.sectionStarts[section.id] ?? null);
    return deadline ? deadline.endsAt - now : null;
  });
  const standing = $derived(leftMs === null || planned === null ? null : partState(planned, leftMs, session.service?.warnMinutes));
  const onScreen = $derived(session.leaderOnScreen === section.id);
  const leader = $derived(section.leader?.trim() ?? "");
</script>

<div class="meta">
  <label class="who" title={t("Who leads {part}", { part: section.name })}>
    <Icon name="user" size={12} />
    <input aria-label={t("Who leads {part}", { part: section.name })} placeholder={t("Led by…")} value={section.leader ?? ""} onchange={(event) => session.setSectionLeader(section.id, event.currentTarget.value)} />
  </label>
  {#if leader && session.leaderTo === "screen"}
    <button
      type="button"
      class="show"
      class:on={onScreen}
      aria-pressed={onScreen}
      title={onScreen ? t("Take the name off the screen") : t("Put {leader} · {part} on the screen as a name lower third for 10 seconds", { leader, part: section.name })}
      onclick={() => (onScreen ? session.hideLeader() : session.showLeader(section.id))}
    >{onScreen ? t("On screen") : t("Show name")}</button>
  {:else if leader && session.leaderTo === "preview"}
    <button type="button" class="show" title={t("Put {leader} · {part} on Preview as a name lower third; LIVE sends it", { leader, part: section.name })} onclick={() => session.showLeader(section.id)}>{t("To Preview")}</button>
  {/if}
  {#if used > 0 || running}
    <span class="time" class:over class:running class:soon={standing === "soon"} title={planned !== null ? t("Used so far, against {planned} planned", { planned: `${planned} ${t("min")}` }) : t("Used so far")}>
      {#if planned}
        <span class="bar" aria-hidden="true"><i style:width="{Math.min(1, share) * 100}%"></i></span>
      {/if}
      <span class="used">{#if !running && used > 0}<Icon name="check" size={11} />{/if}{usedLabel(used)}{#if planned !== null}<span class="of">&nbsp;/ {planned} {t("min")}</span>{/if}</span>
      {#if leftMs !== null}
        <span class="left" class:soon={standing === "soon"} class:late={standing === "over"} role={standing === "soon" || standing === "over" ? "status" : undefined}>
          {#if standing === "soon"}<i class="beacon" aria-hidden="true"></i>{t("Ending soon")} · {/if}
          {#if leftMs >= 0}{t("{time} left", { time: clockCount(leftMs) })}{:else}{t("{time} over", { time: clockCount(-leftMs) })}{/if}
        </span>
      {/if}
    </span>
  {/if}
</div>

<style>
  .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
  .who { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 6px; border: 1px solid transparent; border-radius: 7px; color: var(--muted); }
  .who:hover, .who:focus-within { border-color: var(--line); background: var(--field); }
  .who input { width: 140px; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; outline: none; }
  .who input::placeholder { color: var(--muted); }
  .show { height: 22px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; white-space: nowrap; }
  .show.on { border-color: var(--live, #fa4f00); background: color-mix(in srgb, var(--live, #fa4f00) 16%, transparent); color: var(--live, #fa4f00); }
  .time { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
  .bar { position: relative; width: 72px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); overflow: hidden; }
  .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: #30a46c; }
  .used { display: inline-flex; align-items: center; gap: 4px; font-weight: 650; }
  .running .used { color: var(--ink); }
  .of { font-weight: 500; color: var(--muted); }
  .left { padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, #30a46c 18%, transparent); color: var(--ink); font-weight: 650; }
  .over .bar i { background: var(--danger, #e5484d); }
  .over .used, .over .left { color: var(--danger, #e5484d); }
  .over .left { background: color-mix(in srgb, var(--danger, #e5484d) 16%, transparent); }
  .left { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
  .left.soon { background: color-mix(in srgb, #f5a524 26%, transparent); color: #f5a524; }
  .left.late { background: color-mix(in srgb, var(--danger, #e5484d) 18%, transparent); color: var(--danger, #e5484d); animation: nudge 1.6s ease-in-out infinite; }
  .soon .bar i { background: #f5a524; }
  .beacon { width: 7px; height: 7px; border-radius: 50%; background: #f5a524; box-shadow: 0 0 0 0 rgb(245 165 36 / 0.7); animation: beacon 1.2s ease-out infinite; }
  @keyframes beacon { to { box-shadow: 0 0 0 7px rgb(245 165 36 / 0); } }
  @keyframes nudge { 50% { opacity: 0.65; } }
  @media (prefers-reduced-motion: reduce) { .beacon, .left.late { animation: none; } }
</style>
