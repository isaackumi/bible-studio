<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../app/session.svelte";
  import type { HealthAction, HealthRow, HealthTip } from "../../domain/health";
  import { t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Performance: how Church Studio runs on this computer, and what to do about anything slow. Plain
  // words only; the technical detail is in the support file (Updates › Save a support file).
  let { ongo }: { ongo: (section: string) => void } = $props();

  let rows = $state<HealthRow[] | null>(null);
  let tips = $state<HealthTip[]>([]);
  let desktop = $state(true);
  let busy = $state(false);
  let measuring = $state(false);

  async function load() {
    busy = true;
    try {
      const found = await session.checkHealth();
      rows = found.rows;
      tips = found.tips;
      desktop = found.desktop;
    } finally {
      busy = false;
    }
  }

  async function act(action: HealthAction) {
    if (action === "storage") ongo("storage");
    else if (action === "open-audience") {
      await session.openAudience();
      await load();
    } else {
      measuring = true;
      await session.measureSmoothness();
      measuring = false;
      await load();
    }
  }

  onMount(() => void load());

  // ---- Right now: the load watch's latest reading, and its alert thresholds (kept on this computer).
  const watch = session.loadWatch;
  const latest = $derived(watch.latest);
  const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
  const freeShare = $derived(latest && latest.memoryTotal ? Math.round((100 * latest.memoryAvailable) / latest.memoryTotal) : null);
  const CPU_WARN = [70, 80, 85, 90];
  const CPU_CRITICAL = [90, 95, 98];
  const MEMORY_WARN = [8, 12, 15, 20];
  const SUSTAIN = [15_000, 30_000, 60_000, 120_000];
  const seconds = (ms: number) => (ms >= 60_000 ? t("{n} min", { n: ms / 60_000 }) : t("{n} s", { n: ms / 1000 }));
  const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
</script>

{#if !desktop}
  <p class="note stand">{t("Performance is measured in the Church Studio desktop app.")}</p>
{:else if rows}
  <p class="section-label">{t("Right now")}</p>
  <section class="rows live">
    <div class="row">
      <span class="state {watch.levels.cpu === 'ok' ? 'ok' : watch.levels.cpu === 'warn' ? 'warn' : 'fail'}"><Icon name="speed" size={13} /></span>
      <div class="row-copy">
        <strong>{t("Processors")}</strong>
        <span>{latest ? t("{cpu}% busy · Church Studio {app}%", { cpu: Math.round(latest.cpu), app: Math.round(latest.appCpu) }) : t("Reading…")}</span>
      </div>
      <div class="bar" role="meter" aria-label={t("Processors")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(latest?.cpu ?? 0)}>
        <i style:width="{latest?.cpu ?? 0}%" data-level={watch.levels.cpu}></i><b style:left="{watch.thresholds.cpuWarn}%"></b>
      </div>
    </div>
    <div class="row">
      <span class="state {watch.levels.memory === 'ok' && watch.levels['app-memory'] === 'ok' ? 'ok' : watch.levels.memory === 'critical' || watch.levels['app-memory'] === 'critical' ? 'fail' : 'warn'}"><Icon name="layers" size={13} /></span>
      <div class="row-copy">
        <strong>{t("Memory")}</strong>
        <span>{latest ? t("{free} GB free of {total} GB · Church Studio {used} GB", { free: gb(latest.memoryAvailable), total: gb(latest.memoryTotal), used: gb(latest.appMemory) }) : t("Reading…")}</span>
      </div>
      <div class="bar" role="meter" aria-label={t("Memory in use")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={freeShare === null ? 0 : 100 - freeShare}>
        <i style:width="{freeShare === null ? 0 : 100 - freeShare}%" data-level={watch.levels.memory}></i><b style:left="{100 - watch.thresholds.memoryWarn}%"></b>
      </div>
    </div>
  </section>

  <p class="section-label">{t("Alerts")}</p>
  <section class="rows">
    <div class="row">
      <div class="row-copy"><strong>{t("Warn me before it shows on the screen")}</strong><span>{t("An alert with what to do when the computer stays too busy or runs low on memory. A moment's spike never sets it off.")}</span></div>
      <input type="checkbox" class="switch" role="switch" aria-label={t("Load alerts")} checked={watch.alertsOn} onchange={(event) => watch.setAlertsOn(event.currentTarget.checked)} />
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Processors busy above")}</strong><span>{t("A warning, then an alert when it gets worse.")}</span></div>
      <div class="pair">
        <select class="field" aria-label={t("Warn when the processors are busy above")} value={watch.thresholds.cpuWarn} onchange={(event) => watch.setThresholds({ cpuWarn: Number(event.currentTarget.value) })}>
          {#each CPU_WARN as value (value)}<option {value}>{value}%</option>{/each}
        </select>
        <select class="field" aria-label={t("Alert when the processors are busy above")} value={watch.thresholds.cpuCritical} onchange={(event) => watch.setThresholds({ cpuCritical: Number(event.currentTarget.value) })}>
          {#each CPU_CRITICAL as value (value)}<option {value}>{value}%</option>{/each}
        </select>
      </div>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("For at least")}</strong><span>{t("How long it must last before it counts.")}</span></div>
      <select class="field" aria-label={t("For at least")} value={watch.thresholds.sustainMs} onchange={(event) => watch.setThresholds({ sustainMs: Number(event.currentTarget.value) })}>
        {#each SUSTAIN as value (value)}<option {value}>{seconds(value)}</option>{/each}
      </select>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Free memory below")}</strong><span>{t("Of the computer's memory.")}</span></div>
      <select class="field" aria-label={t("Warn when free memory is below")} value={watch.thresholds.memoryWarn} onchange={(event) => watch.setThresholds({ memoryWarn: Number(event.currentTarget.value) })}>
        {#each MEMORY_WARN as value (value)}<option {value}>{value}%</option>{/each}
      </select>
    </div>
    {#if watch.recent.length}
      {#each [...watch.recent].reverse().slice(0, 5) as entry (entry.at + entry.kind)}
        <div class="row">
          <span class="state {entry.level === 'critical' ? 'fail' : 'warn'}"><Icon name="alerts" size={13} /></span>
          <div class="row-copy"><strong>{t(entry.title)}</strong><span>{clock(entry.at)}</span></div>
        </div>
      {/each}
    {/if}
  </section>

  {#if tips.length}
    <p class="section-label">{t("Suggestions")}</p>
    <section class="rows tips">
      {#each tips as tip (tip.id)}
        <div class="row">
          <Icon name="sparkles" size={15} />
          <div class="row-copy"><span class="tip">{t(tip.text, tip.values)}</span></div>
          {#if tip.action}<button type="button" class="btn" onclick={() => void act(tip.action!.action)}>{t(tip.action.label)}</button>{/if}
        </div>
      {/each}
    </section>
  {:else}
    <section class="all-good">
      <Icon name="check" size={20} />
      <div><strong>{t("Running well")}</strong><span>{t("Nothing to change on this computer right now.")}</span></div>
    </section>
  {/if}

  <p class="section-label">{t("On this computer")}</p>
  <section class="rows figures">
    {#each rows as row (row.id)}
      <div class="row">
        <span class="state {row.state}"><Icon name={row.state === "ok" ? "check" : row.state === "unknown" ? "clock" : row.state === "warn" ? "alerts" : "close"} size={13} /></span>
        <div class="row-copy"><strong>{t(row.title, row.values)}</strong><span>{t(row.detail, row.values)}</span></div>
        {#if row.action}
          <button type="button" class="btn" disabled={measuring} onclick={() => void act(row.action!.action)}>{measuring && row.action.action === "measure" ? t("Measuring…") : t(row.action.label)}</button>
        {/if}
      </div>
    {/each}
  </section>
  <p class="note stand">{t("Kept on this computer only. For a problem that keeps coming back, save a support file in Updates and send it to us.")}</p>
{:else if busy}
  <p class="note stand">{t("Checking…")}</p>
{/if}

<style>
  .all-good { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--presence, #3fb950) 45%, var(--line)); border-radius: 13px; background: color-mix(in srgb, var(--field) 75%, var(--panel)); }
  .all-good > :global(svg) { color: var(--presence, #3fb950); flex: none; }
  .all-good div { display: grid; gap: 2px; }
  .all-good strong { font-size: 14px; }
  .all-good span { font-size: 12.5px; color: var(--muted); }
  /* Settings' own rows spread their parts apart; here the mark, words and button sit in a line. */
  :global(.settings-body) .figures .row, :global(.settings-body) .tips .row { justify-content: flex-start; gap: 14px; }
  :global(.settings-body) .figures .row-copy, :global(.settings-body) .tips .row-copy { flex: 1; min-width: 0; }
  :global(.settings-body) .figures .row > .btn, :global(.settings-body) .tips .row > .btn { flex: none; margin-left: auto; }
  .tips .row > :global(svg) { flex: none; color: #a78bfa; }
  .tip { color: var(--ink); font-size: 13px; line-height: 1.45; }
  .state { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; }
  .state.ok { background: color-mix(in srgb, var(--presence, #3fb950) 20%, transparent); color: var(--presence, #3fb950); }
  .state.warn { background: color-mix(in srgb, #f5a524 22%, transparent); color: var(--warn-text); }
  .state.fail { background: color-mix(in srgb, var(--live, #e5484d) 22%, transparent); color: var(--live, #e5484d); }
  .bar { position: relative; flex: none; width: 160px; height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 10%, transparent); overflow: hidden; }
  .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--presence, #3fb950); transition: width 0.6s ease; }
  .bar i[data-level="warn"] { background: #f5a524; }
  .bar i[data-level="critical"] { background: var(--live, #e5484d); }
  .bar b { position: absolute; top: 0; bottom: 0; width: 2px; background: color-mix(in srgb, var(--ink) 45%, transparent); }
  .pair { display: flex; gap: 6px; flex: none; }
  :global(.settings-body) .live .row { justify-content: flex-start; gap: 14px; }
  :global(.settings-body) .live .row-copy { flex: 1; min-width: 0; }
  @media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
  .state.unknown { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--muted); }
</style>
