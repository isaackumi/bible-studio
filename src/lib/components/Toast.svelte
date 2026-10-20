<script lang="ts">
  import { fly } from "svelte/transition";
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // A short note after an action, bottom right (clear of the bar, the service strip and Preview): what happened, where, and one or two buttons.
  const toast = $derived(session.toast);
</script>

{#if toast}
  {#key toast.id}
    <div class="toast" role="status" aria-live="polite" transition:fly={{ y: 10, duration: 180 }}>
      <span class="tick"><Icon name="check" size={14} /></span>
      <div class="copy">
        <strong>{toast.text}</strong>
        {#if toast.detail}<span>{toast.detail}</span>{/if}
      </div>
      {#each toast.actions as action (action.label)}
        <button type="button" class="act" onclick={action.run}>{action.label}</button>
      {/each}
      <button type="button" class="x" aria-label={t("Dismiss")} onclick={() => session.dismissToast()}><Icon name="close" size={13} /></button>
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(520px, calc(100vw - 32px));
    padding: 10px 10px 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 92%, var(--ink) 8%);
    color: var(--ink);
    box-shadow: 0 14px 40px rgb(0 0 0 / 0.35);
  }
  .tick { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, #30a46c 22%, transparent); color: #3dd68c; }
  .copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .copy strong { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act { flex: none; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .act:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .x { flex: none; width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; }
  .x:hover { color: var(--ink); background: var(--field); }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
</style>
