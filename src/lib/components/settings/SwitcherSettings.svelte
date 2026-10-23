<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { SWITCHER_PORTS, type SwitcherKind } from "../../integrations/switcher";
  import { t } from "../../i18n/core";
  import { isDesktop } from "../../platform/runtime";

  // Settings › Production apps: which app the desk drives, where it is, and whether it answers.
  const saved = untrack(() => session.workspace.switcher);
  let kind = $state<SwitcherKind>(saved.kind);
  let host = $state(saved.host);
  let port = $state(saved.port);
  let password = $state(saved.password);
  const live = $derived(session.switcherState);

  function pick(next: SwitcherKind) {
    if (next === kind) return;
    kind = next;
    if (next !== "none") port = SWITCHER_PORTS[next];
    if (next === "none") {
      session.disconnectSwitcher();
      void session.connectSwitcher({ kind: "none" });
    }
  }

  const connect = () => void session.connectSwitcher({ kind, host: host.trim() || "127.0.0.1", port: Number(port) || (kind === "none" ? 4455 : SWITCHER_PORTS[kind]), password });
</script>

<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("App")}</strong>
      <span>{t("NDI already sends your picture and sound to any NDI app. Connect one here to also press its buttons from the desk: switch its scenes or inputs, start and stop its stream and recording.")}</span>
    </div>
    <div class="segment" role="radiogroup" aria-label={t("Production app")}>
      <button type="button" role="radio" aria-checked={kind === "none"} class:active={kind === "none"} onclick={() => pick("none")}>{t("None")}</button>
      <button type="button" role="radio" aria-checked={kind === "obs"} class:active={kind === "obs"} onclick={() => pick("obs")}>OBS</button>
      <button type="button" role="radio" aria-checked={kind === "vmix"} class:active={kind === "vmix"} onclick={() => pick("vmix")}>vMix</button>
    </div>
  </div>
  {#if kind !== "none"}
    <div class="row">
      <div class="row-copy">
        <strong>{t("Where it runs")}</strong>
        <span>{kind === "obs" ? t("In OBS: Tools › WebSocket Server Settings › Enable WebSocket server. 127.0.0.1 is this computer; for another computer, type its address.") : t("In vMix: Settings › Web Controller › Enable. 127.0.0.1 is this computer; for another computer, type its address (vMix shows it there).")}</span>
      </div>
      <div class="row-end">
        <input class="field" aria-label={t("Address")} placeholder="127.0.0.1" bind:value={host} />
        <input class="field port" aria-label={t("Port")} type="number" min="1" max="65535" bind:value={port} />
      </div>
    </div>
    {#if kind === "obs"}
      <div class="row">
        <div class="row-copy"><strong>{t("Password")}</strong><span>{t("From OBS: Tools › WebSocket Server Settings › Show Connect Info. It stays on this computer.")}</span></div>
        <input class="field" type="password" aria-label={t("OBS password")} autocomplete="off" bind:value={password} />
      </div>
    {/if}
    {#if kind === "vmix" && !isDesktop()}
      <div class="row"><div class="row-copy"><span>{t("vMix control works in the desktop app.")}</span></div></div>
    {/if}
    <div class="row">
      <div class="row-copy">
        <strong>{live.status === "on" ? t("Connected") : live.status === "connecting" ? t("Connecting…") : live.status === "error" ? t("Not connected") : t("Not connected yet")}</strong>
        <span class:form-error={live.status === "error"}>
          {#if live.status === "on"}{t("{count} scenes · on air: {program}", { count: live.scenes.length, program: live.program ?? "–" })}{live.streaming ? ` · ${t("streaming")}` : ""}{live.recording ? ` · ${t("recording")}` : ""}
          {:else}{live.message || t("Connect to see its scenes.")}{/if}
        </span>
      </div>
      <div class="row-end">
        {#if live.status === "on"}<button type="button" class="btn" onclick={() => session.disconnectSwitcher()}>{t("Disconnect")}</button>{/if}
        <button type="button" class="btn primary" disabled={live.status === "connecting"} onclick={connect}>{live.status === "on" ? t("Reconnect") : t("Connect")}</button>
      </div>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Connect when Church Studio opens")}</strong><span>{t("So the desk is ready before the service starts.")}</span></div>
      <input type="checkbox" class="switch" role="switch" aria-label={t("Connect when Church Studio opens")} checked={session.workspace.switcher.autoConnect} onchange={(event) => session.setSwitcherAutoConnect(event.currentTarget.checked)} />
    </div>
  {/if}
</section>

<style>
  .port { width: 90px; }
</style>
