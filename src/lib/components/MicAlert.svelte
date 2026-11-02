<script lang="ts">
  import { fly } from "../ui/motion";
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";
  import { t } from "../i18n/core";
  import { micAlertTitle, type MicAlert } from "../voice/microphone";
  import Icon from "./Icon.svelte";

  // Listening cannot hear: said at the top of the desk on every page, with the way to fix it, until
  // it is fixed or the operator closes it. The voice strip is only on some desks, and small.
  let { alert }: { alert: MicAlert } = $props();
</script>

<div class="mic-alert" role="alert" transition:fly={{ y: -10, duration: 180 }}>
  <span class="badge"><Icon name="mic" size={15} /></span>
  <div class="copy">
    <strong>{t(micAlertTitle(alert.kind))}</strong>
    <span>{alert.message}</span>
  </div>
  <div class="acts">
    {#if alert.kind !== "silent"}<button type="button" class="act" onclick={() => void session.toggleVoice()}>{t("Try again")}</button>{/if}
    {#if alert.kind === "denied" && isDesktop()}
      <button type="button" class="act" onclick={session.openVoicePrivacy}>{t("Open Privacy settings")}</button>
    {:else}
      <button type="button" class="act" onclick={() => session.openSettings("audio")}>{t("Choose microphone")}</button>
    {/if}
  </div>
  <button type="button" class="close" aria-label={t("Close")} title={t("Close")} onclick={session.closeMicAlert}><Icon name="close" size={14} /></button>
</div>

<style>
  .mic-alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    border: 1px solid color-mix(in srgb, #ff6b4a 55%, var(--line));
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 88%, #ff6b4a 12%);
    color: var(--ink);
    box-shadow: 0 14px 40px rgb(0 0 0 / 0.35);
  }
  .badge { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, #ff6b4a 25%, transparent); color: #ff6b4a; }
  .copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .copy strong { font-size: 13px; font-weight: 700; }
  .copy span { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .acts { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 45%; }
  .act { height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .act:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .close { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--muted); display: grid; place-items: center; }
  .close:hover { background: var(--field); color: var(--ink); }
</style>
