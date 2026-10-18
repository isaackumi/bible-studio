<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../../app/session.svelte";
  import { QUALITIES, STREAM_SERVERS, streamTarget, type BroadcastQuality, type StreamService } from "../../domain/broadcast";
  import { msg, t } from "../../i18n/core";
  import { isDesktop } from "../../platform/runtime";

  // Settings › Stream & record: stream to YouTube, Facebook or any RTMP service, and record the service.
  const settings = $derived(session.workspace.broadcast);
  const status = $derived(session.broadcastState);
  let showKey = $state(false);
  const target = $derived(streamTarget(settings));
  const running = $derived(status.status === "on" || status.status === "starting");

  const KEY_HELP: Record<StreamService, string> = {
    youtube: msg("In YouTube Studio: Create › Go live › Stream. Copy the Stream key."),
    facebook: msg("On Facebook: Live Producer › Streaming software. Copy the Stream key."),
    custom: msg("Your service shows a server address (rtmp:// or rtmps://) and a stream key."),
  };

  async function chooseFolder() {
    const picked = await open({ directory: true, multiple: false, title: t("Where recordings go") });
    if (typeof picked === "string") session.setBroadcast({ recordFolder: picked });
  }
</script>

<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("Stream to")}</strong>
      <span>{t("Church Studio streams the audience screen, with its sound, straight to the service you choose. No other software needed.")}</span>
    </div>
    <div class="segment" role="radiogroup" aria-label={t("Stream to")}>
      {#each [["youtube", "YouTube"], ["facebook", "Facebook"], ["custom", t("Other")]] as [id, label] (id)}
        <button type="button" role="radio" aria-checked={settings.service === id} class:active={settings.service === id} onclick={() => session.setBroadcast({ service: id as StreamService })}>{label}</button>
      {/each}
    </div>
  </div>
  {#if settings.service === "custom"}
    <div class="row">
      <div class="row-copy"><strong>{t("Server")}</strong><span>{t("The server address from your streaming service, e.g. rtmp://live.example.com/app.")}</span></div>
      <input class="field wide" aria-label={t("Stream server")} placeholder="rtmps://…" value={settings.server} onchange={(event) => session.setBroadcast({ server: event.currentTarget.value })} />
    </div>
  {:else}
    <div class="row">
      <div class="row-copy"><strong>{t("Server")}</strong><span class="mono">{STREAM_SERVERS[settings.service]}</span></div>
    </div>
  {/if}
  <div class="row">
    <div class="row-copy"><strong>{t("Stream key")}</strong><span>{t(KEY_HELP[settings.service])} {t("It stays on this computer and goes only to that server.")}</span></div>
    <div class="row-end">
      <input class="field" type={showKey ? "text" : "password"} autocomplete="off" spellcheck="false" aria-label={t("Stream key")} value={settings.key} onchange={(event) => session.setBroadcast({ key: event.currentTarget.value })} />
      <button type="button" class="btn" onclick={() => (showKey = !showKey)}>{showKey ? t("Hide") : t("Show")}</button>
    </div>
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Quality")}</strong><span>{t("1080p needs about {kbps} kbps of upload; 720p suits slower church internet.", { kbps: QUALITIES["1080p"].videoKbps + 200 })}</span></div>
    <select class="field" aria-label={t("Quality")} value={settings.quality} onchange={(event) => session.setBroadcast({ quality: event.currentTarget.value as BroadcastQuality })}>
      <option value="720p">{t("720p, 30 frames (3 Mbps)")}</option>
      <option value="1080p">{t("1080p, 30 frames (5 Mbps)")}</option>
      <option value="1080p60">{t("1080p, 60 frames (8 Mbps)")}</option>
    </select>
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Sound")}</strong><span>{t("Videos and music on Program go out with the picture. For the preacher's microphone, stream from OBS or vMix with the sound desk's feed, or send this computer the desk's mix.")}</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Sound")} checked={settings.sound} onchange={(event) => session.setBroadcast({ sound: event.currentTarget.checked })} />
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Recordings")}</strong><span class="path">{settings.recordFolder || t("Movies › Church Studio")}</span></div>
    <div class="row-end">
      {#if settings.recordFolder}<button type="button" class="btn" onclick={() => session.setBroadcast({ recordFolder: "" })}>{t("Reset")}</button>{/if}
      <button type="button" class="btn" disabled={!isDesktop()} onclick={() => void chooseFolder()}>{t("Choose folder")}</button>
    </div>
  </div>
  <div class="row">
    <div class="row-copy">
      <strong>{t("Test the stream key")}</strong>
      <span class:form-error={status.status === "error"}>
        {#if status.status === "error"}{status.message}
        {:else if running && status.pattern}{status.live ? t("Live: colour bars and a beep are on your stream page now. Stop when you have seen them.") : t("Connecting to the stream server…")}
        {:else if "missing" in target}{target.missing === "key" ? t("Add the stream key to test it.") : t("Add the server address to test it.")}
        {:else}{t("Sends colour bars and a beep to the stream, so you can check it reaches your page before Sunday. Set the stream to unlisted or private first.")}{/if}
      </span>
    </div>
    {#if running && status.pattern}
      <button type="button" class="btn" onclick={() => void session.stopBroadcast()}>{t("Stop test")}</button>
    {:else}
      <button type="button" class="btn" disabled={!isDesktop() || "missing" in target || running} onclick={() => void session.startBroadcast({ stream: true, record: false, pattern: true })}>{t("Send test")}</button>
    {/if}
  </div>
</section>

<style>
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; word-break: break-all; }
  .wide { width: min(360px, 100%); }
  .path { word-break: break-all; }
</style>
