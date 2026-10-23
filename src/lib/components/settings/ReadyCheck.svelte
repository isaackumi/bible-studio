<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../app/session.svelte";
  import type { ReadyCheck, ReadyFix } from "../../domain/readiness";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Ready for Sunday: one press checks what the service depends on. Worst first; each line says what
  // to do, with a button that goes there.
  let { ongo }: { ongo: (section: string) => void } = $props();

  let checks = $state<ReadyCheck[] | null>(null);
  let busy = $state(false);
  let checkedAt = $state<Date | null>(null);
  const failing = $derived(checks?.filter((check) => check.state === "fail").length ?? 0);
  const looking = $derived(checks?.filter((check) => check.state === "warn").length ?? 0);

  async function run() {
    busy = true;
    try {
      checks = await session.checkReady();
      checkedAt = new Date();
    } finally {
      busy = false;
    }
  }

  async function fix(action: ReadyFix) {
    if (action === "open-audience") {
      await session.openAudience();
      await run();
    } else if (action === "service") {
      session.settingsOpen = false;
      session.goToDesk("service");
    } else if (action === "plans") session.openPlans();
    else ongo({ displays: "displays", backup: "storage", storage: "storage", ai: "ai", recording: "broadcast" }[action]);
  }

  onMount(() => void run());
</script>

<section class="ready-head" class:good={checks && !failing && !looking} class:bad={failing > 0}>
  <div class="verdict">
    <Icon name={busy ? "refresh" : failing ? "close" : looking ? "alerts" : "check"} size={22} />
    <div>
      <strong>
        {#if busy && !checks}{t("Checking…")}
        {:else if failing}{tn(failing, "{n} thing needs fixing before the service", "{n} things need fixing before the service")}
        {:else if looking}{tn(looking, "Ready, with {n} thing to look at", "Ready, with {n} things to look at")}
        {:else}{t("All set for Sunday")}{/if}
      </strong>
      <span>{checkedAt ? t("Checked at {time}.", { time: checkedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }) : t("Screens, the service, space, backups and more.")}</span>
    </div>
  </div>
  <button type="button" class="btn primary" disabled={busy} onclick={() => void run()}>{busy ? t("Checking…") : t("Check again")}</button>
</section>

{#if checks}
  <section class="rows ready-rows">
    {#each checks as check (check.id)}
      <div class="row">
        <span class="state {check.state}" aria-label={check.state === "ok" ? t("Fine") : check.state === "warn" ? t("Worth a look") : t("Needs fixing")}>
          <Icon name={check.state === "ok" ? "check" : check.state === "warn" ? "alerts" : "close"} size={13} />
        </span>
        <div class="row-copy"><strong>{t(check.title, check.values)}</strong><span>{t(check.detail, check.values)}</span></div>
        {#if check.fix && check.state !== "ok"}
          <button type="button" class="btn" onclick={() => void fix(check.fix!.action)}>{t(check.fix.label)}</button>
        {/if}
      </div>
    {/each}
  </section>
  <p class="note stand">{t("Run this on Sunday morning, with the projector and microphone plugged in. Nothing here changes the screen.")}</p>
{/if}

<style>
  .ready-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--field) 75%, var(--panel)); }
  .verdict { display: flex; align-items: center; gap: 12px; }
  .verdict > :global(svg) { flex: none; color: var(--muted); }
  .verdict div { display: grid; gap: 2px; }
  .verdict strong { font-size: 15px; }
  .verdict span { font-size: 12.5px; color: var(--muted); }
  .good { border-color: color-mix(in srgb, var(--presence, #3fb950) 45%, var(--line)); }
  .good .verdict > :global(svg) { color: var(--presence, #3fb950); }
  .bad { border-color: color-mix(in srgb, var(--live, #e5484d) 45%, var(--line)); }
  .bad .verdict > :global(svg) { color: var(--live, #e5484d); }
  .state { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; }
  .state.ok { background: color-mix(in srgb, var(--presence, #3fb950) 20%, transparent); color: var(--presence, #3fb950); }
  .state.warn { background: color-mix(in srgb, #f5a524 22%, transparent); color: #f5a524; }
  .state.fail { background: color-mix(in srgb, var(--live, #e5484d) 22%, transparent); color: var(--live, #e5484d); }
  /* Settings' own rows spread their parts apart; here the mark, words and button sit in a line. */
  :global(.settings-body) .ready-rows .row { justify-content: flex-start; gap: 14px; }
  :global(.settings-body) .ready-rows .row-copy { flex: 1; min-width: 0; }
  :global(.settings-body) .ready-rows .row > .btn { flex: none; margin-left: auto; }
</style>
