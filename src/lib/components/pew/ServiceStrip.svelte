<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockCount, partState } from "../../domain/schedule";
  import { nextPart } from "../../domain/service";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // The service while working on the Presenter page: the part running and its time, what comes
  // next, and the way back. The clock, countdown and report keep going here as on the Service page.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const service = $derived(session.service);
  const runningId = $derived(session.runningSectionId ?? session.presenterPartId);
  const part = $derived(service?.sections.find((section) => section.id === runningId) ?? null);
  const deadline = $derived.by(() => {
    void now;
    return session.runningDeadline();
  });
  const left = $derived(deadline ? deadline.endsAt - now : null);
  const tone = $derived(left === null || !part ? "ok" : partState(deadline ? (deadline.endsAt - (session.sectionStarts[part.id] ?? now)) / 60_000 : 0, left, service?.warnMinutes));
  const next = $derived(service && runningId ? nextPart(service, runningId) : null);
</script>

{#if service && part}
  <div class="strip" data-state={tone} role="status" aria-label={t("The service")}>
    <span class="pulse" aria-hidden="true"></span>
    <span class="what">
      <em>{service.name}</em>
      <strong>{part.name}</strong>
    </span>
    {#if left !== null}
      <span class="time">{left >= 0 ? t("{time} left", { time: clockCount(left) }) : t("{time} over", { time: clockCount(-left) })}</span>
    {/if}
    {#if session.presenterPartId === part.id}<span class="tag" title={t("This part runs here, on the Presenter page. What goes LIVE counts as this part.")}>{t("On the Presenter page")}</span>{/if}
    <span class="grow"></span>
    {#if next}
      <button type="button" class="btn" title={t("Begin {part}: its first item goes up", { part: next.name })} onclick={() => void session.moveOn(part.id)}>{t("Next part: {part}", { part: next.name })} <Icon name="chevron-right" size={13} /></button>
    {/if}
    <button type="button" class="btn back" title={t("The running order")} onclick={() => session.returnToService()}><Icon name="list" size={13} /> {t("Back to the service")}</button>
  </div>
{/if}

<style>
  .strip { display: flex; align-items: center; gap: 12px; flex: none; min-height: 40px; margin: 8px var(--panel-pad, 12px) 0; padding: 4px 6px 4px 14px; border: 1px solid color-mix(in srgb, #30a46c 45%, var(--line)); border-radius: 11px; background: color-mix(in srgb, #30a46c 9%, var(--panel)); font-size: 13px; }
  .strip[data-state="soon"] { border-color: color-mix(in srgb, #f5a524 55%, var(--line)); background: color-mix(in srgb, #f5a524 10%, var(--panel)); }
  .strip[data-state="over"] { border-color: color-mix(in srgb, #e5484d 55%, var(--line)); background: color-mix(in srgb, #e5484d 10%, var(--panel)); }
  .pulse { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #30a46c; box-shadow: 0 0 0 0 rgb(48 164 108 / 0.6); animation: pulse 1.8s ease-out infinite; }
  .strip[data-state="soon"] .pulse { background: #f5a524; }
  .strip[data-state="over"] .pulse { background: #e5484d; }
  @keyframes pulse { to { box-shadow: 0 0 0 8px rgb(48 164 108 / 0); } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  .what { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .what em { font-style: normal; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .what strong { font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .time { font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tag { padding: 2px 8px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 10%, transparent); font-size: 11px; font-weight: 650; color: var(--muted); white-space: nowrap; }
  .grow { flex: 1; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .btn:hover { background: var(--field); }
  .btn.back { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  @media (max-width: 900px) { .what em, .tag { display: none; } }
</style>
