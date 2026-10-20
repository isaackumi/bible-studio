<script lang="ts">
  import { session } from "../app/session.svelte";
  import { elapsed, streamTarget } from "../domain/broadcast";
  import { t } from "../i18n/core";
  import { isDesktop } from "../platform/runtime";
  import Icon from "./Icon.svelte";
  import ToolMenu from "./ToolMenu.svelte";

  // Go live and record from the desk. Quiet when off; red with the running time when on.
  const status = $derived(session.broadcastState);
  const running = $derived((status.status === "on" || status.status === "starting") && !status.pattern);
  const ready = $derived(!("missing" in streamTarget(session.workspace.broadcast)));
  /** Stopping a live stream takes a second click. */
  let armed = $state(false);

  function stop() {
    if (status.streaming && !armed) {
      armed = true;
      setTimeout(() => (armed = false), 4000);
      return;
    }
    armed = false;
    void session.stopBroadcast();
  }
</script>

{#if isDesktop()}
  <ToolMenu
    label={t("Stream & record")}
    tip={running ? (status.streaming ? (status.live ? t("Live on the stream · {time}", { time: elapsed(status.seconds) }) : t("Connecting to the stream server…")) : t("Recording · {time}", { time: elapsed(status.seconds) })) : t("Go live: stream to YouTube or Facebook, and record")}
    on={running}
  >
    {#snippet trigger()}
      {#if running}
        <span class="onair" class:connecting={status.streaming && !status.live}><i></i>{status.streaming ? t("LIVE") : t("REC")} {elapsed(status.seconds)}</span>
      {:else}
        <Icon name="video" size={16} />
        {#if status.status === "error"}<span class="warn"></span>{/if}
      {/if}
    {/snippet}
    {#snippet children(close)}
      {#if running}
        <p class="menu-note">
          {status.streaming ? (status.live ? t("Live · {kbps} kbps", { kbps: status.kbps }) : t("Connecting to the stream server…")) : ""}
          {status.streaming && status.recording ? " · " : ""}{status.recording ? t("Recording") : ""}
        </p>
        <button type="button" role="menuitem" class="stop" onclick={stop}><Icon name="square" size={14} /> {armed ? t("Click again to stop") : status.streaming ? t("Stop streaming") : t("Stop recording")}</button>
      {:else}
        {#if status.status === "error"}<p class="menu-note error">{status.message}</p>{/if}
        {#if status.status === "off" && status.message}<p class="menu-note">{status.message}</p>{/if}
        <button type="button" role="menuitem" onclick={() => { void session.startBroadcast({ stream: true, record: true }); close(); }}><Icon name="video" size={16} /> {t("Go live and record")}</button>
        <button type="button" role="menuitem" onclick={() => { void session.startBroadcast({ stream: true, record: false }); close(); }}><Icon name="cast" size={16} /> {t("Go live only")}</button>
        <button type="button" role="menuitem" onclick={() => { void session.startBroadcast({ stream: false, record: true }); close(); }}><Icon name="download" size={16} /> {t("Record only")}</button>
        {#if !ready}<p class="menu-note">{t("Add your stream key in Settings › Stream & record to stream.")}</p>{/if}
      {/if}
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" onclick={() => { session.openSettings("broadcast"); close(); }}><Icon name="settings" size={16} /> {t("Stream & record settings…")}</button>
    {/snippet}
  </ToolMenu>
{/if}

<style>
  .onair { display: inline-flex; align-items: center; gap: 6px; padding: 0 2px; font-size: 11px; font-weight: 800; letter-spacing: 0.03em; color: #e5484d; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .onair i { width: 8px; height: 8px; border-radius: 50%; background: #e5484d; box-shadow: 0 0 8px #e5484d; animation: pulse 1.6s ease-in-out infinite; }
  .onair.connecting { color: #f5a524; }
  .onair.connecting i { background: #f5a524; box-shadow: 0 0 8px #f5a524; }
  @keyframes pulse { 50% { opacity: 0.4; } }
  @media (prefers-reduced-motion: reduce) { .onair i { animation: none; } }
  .warn { position: absolute; right: 4px; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: #f5a524; }
  .error { color: #e5484d; }
  .stop { color: #e5484d; }
</style>
