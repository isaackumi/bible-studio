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
</script>

{#if !desktop}
  <p class="note stand">{t("Performance is measured in the Church Studio desktop app.")}</p>
{:else if rows}
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
  .state.warn { background: color-mix(in srgb, #f5a524 22%, transparent); color: #f5a524; }
  .state.fail { background: color-mix(in srgb, var(--live, #e5484d) 22%, transparent); color: var(--live, #e5484d); }
  .state.unknown { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--muted); }
</style>
