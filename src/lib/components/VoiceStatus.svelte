<script lang="ts">
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";
  import { t } from "../i18n/core";
  import { micLabel } from "../voice/microphone";

  let { compact = false }: { compact?: boolean } = $props();

  const voice = $derived(session.voice);
  const label = $derived.by(() => {
    if (voice.status === "starting") return t("Starting");
    if (voice.status === "listening") return voice.hearing ? t("Hearing") : t("Listening");
    if (voice.status === "stopped") return t("Stopped");
    if (voice.status === "idle") return t("Voice off");
    switch (voice.error) {
      case "denied":
        return t("Permission denied");
      case "no-mic":
        return t("No microphone");
      case "unsupported":
        return t("Speech unavailable");
      case "network":
        return t("Network error");
      default:
        return t("Voice error");
    }
  });
  const recent = $derived(voice.command && Date.now() - voice.command.at < 15_000 ? voice.command : null);
</script>

<!-- Only the status is announced (Listening, Off, Permission denied), never every word heard. -->
<div class="voice" class:compact data-status={voice.status}>
  <div class="row">
    <span class="chip" role="status" aria-live="polite">
      <span class="dot"></span>
      {label}
    </span>
    {#if voice.status === "listening"}
      <span class="meter" aria-hidden="true" title={session.micInUse ?? ""}><span style="width: {Math.max(4, Math.round(voice.level * 100))}%"></span></span>
      {#if session.micInUse && !compact}<span class="mic" title={t("Listening on {name}. Choose another in Settings › Sound & voice.", { name: session.micInUse })}>{micLabel(session.micInUse)}</span>{/if}
    {/if}
    <label class="live" data-tip={t("Let voice go live, cut, clear, black and show the logo. Off on every launch.")}>
      <input type="checkbox" checked={voice.allowLive} onchange={(event) => session.setVoiceAllowLive(event.currentTarget.checked)} />
      {t("Live voice commands")}
    </label>
  </div>
  {#if voice.heard && (voice.status === "listening" || voice.status === "stopped")}
    <p class="heard" class:interim={voice.hearing}>“{voice.heard}”</p>
  {/if}
  {#if recent}
    <p class="command" data-outcome={recent.outcome}>
      {recent.outcome === "executed" ? t("Done") : recent.outcome === "blocked" ? t("Blocked") : t("Failed")}: {recent.label}
    </p>
  {/if}
  {#if voice.message && (!compact || voice.status === "error")}
    <p class="note" role={voice.status === "error" ? "alert" : undefined}>{voice.message}</p>
  {/if}
  {#if voice.status === "error" && voice.error === "denied" && isDesktop()}
    <button type="button" class="desk-btn" onclick={session.openVoicePrivacy}>{t("Open Privacy settings")}</button>
  {:else if voice.status === "error" && voice.error === "no-mic" && isDesktop()}
    <button type="button" class="desk-btn" onclick={session.openVoicePrivacy}>{t("Open Sound settings")}</button>
  {/if}
</div>

<style>
  .voice { display: flex; flex-direction: column; gap: 4px; font-size: 12px; min-width: 0; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-weight: 600;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  [data-status="starting"] .dot { background: #e0b341; }
  [data-status="listening"] .dot { background: #3ccf6e; box-shadow: 0 0 0 3px color-mix(in srgb, #3ccf6e 25%, transparent); }
  [data-status="error"] .dot { background: #ff5a5a; }
  [data-status="error"] .chip { border-color: #ff5a5a; color: #ff8a8a; }
  .meter { flex: 0 0 64px; height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .meter span { display: block; height: 100%; background: #3ccf6e; }
  .mic { min-width: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
  .live { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; color: var(--muted); }
  .heard { margin: 0; color: var(--accent-text); font-style: italic; overflow-wrap: anywhere; }
  .heard.interim { opacity: 0.7; }
  .command { margin: 0; font-weight: 600; }
  .command[data-outcome="executed"] { color: #3ccf6e; }
  .command[data-outcome="blocked"] { color: #e0b341; }
  .command[data-outcome="failed"] { color: #ff8a8a; }
  .note { margin: 0; color: var(--muted); }
</style>
