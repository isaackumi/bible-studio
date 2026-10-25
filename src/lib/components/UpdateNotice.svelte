<script lang="ts">
  import { fly } from "../ui/motion";
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // An update is ready: a quiet note in the corner of the desk, never a dialog in the middle of a
  // service. Installing restarts the app, so it refuses while something is live.
  const update = $derived(session.availableUpdate && session.updateDismissed !== session.availableUpdate.version ? session.availableUpdate : null);
  /** The release's first highlight ("- **Sign in, and your plan follows you.** …"), as plain text. */
  const highlight = $derived(update?.notes.match(/^- \*\*(.+?)\.?\*\*/m)?.[1] ?? "");
  let error = $state("");
</script>

{#if update}
  <div class="update" role="status" aria-live="polite" transition:fly={{ y: 10, duration: 180 }}>
    <span class="badge"><Icon name="download" size={15} /></span>
    <div class="copy">
      <strong>{t("Church Studio {version} is ready", { version: update.version })}</strong>
      <span>{error || highlight || t("Install it after the service; Church Studio restarts.")}</span>
    </div>
    <button type="button" class="act primary" disabled={session.updateBusy} onclick={async () => { error = await session.installUpdate(); }}>{session.updateBusy ? t("Installing…") : t("Install and restart")}</button>
    <button type="button" class="act" onclick={() => session.dismissUpdate()}>{t("Later")}</button>
  </div>
{/if}

<style>
  .update {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(560px, calc(100vw - 40px));
    padding: 10px 10px 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 92%, var(--ink) 8%);
    color: var(--ink);
    box-shadow: 0 14px 40px rgb(0 0 0 / 0.35);
  }
  .badge { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent-text); }
  .copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .copy strong { font-size: 13px; font-weight: 700; }
  .copy span { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act { flex: none; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .act:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .act.primary { border-color: transparent; background: var(--accent); color: var(--on-accent); }
  .act:disabled { opacity: 0.6; }
  @media (max-width: 640px) { .update { flex-wrap: wrap; } .copy { flex-basis: calc(100% - 40px); } }
</style>
