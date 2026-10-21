<script lang="ts">
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";
  import ToolMenu from "./ToolMenu.svelte";

  // The production app (OBS or vMix) on the desk: its scenes or inputs to put on air, and its
  // stream and recording. Shown once an app is chosen in Settings › Production apps.
  const config = $derived(session.workspace.switcher);
  const live = $derived(session.switcherState);
  const name = $derived(config.kind === "vmix" ? "vMix" : "OBS");
  /** A stop is pressed twice: once to arm, once to stop (a stream ending by mistake is costly). */
  let armed = $state<"stream" | "record" | null>(null);

  function toggle(kind: "stream" | "record", on: boolean) {
    if (on && armed !== kind) {
      armed = kind;
      setTimeout(() => {
        if (armed === kind) armed = null;
      }, 4000);
      return;
    }
    armed = null;
    void (kind === "stream" ? session.setSwitcherStreaming(!on) : session.setSwitcherRecording(!on));
  }
</script>

{#if config.kind !== "none"}
  <ToolMenu
    label={name}
    tip={live.status === "on" ? t("{app}: {scene} on air", { app: name, scene: live.program ?? "–" }) : t("{app} is not connected", { app: name })}
    on={live.streaming || live.recording}
  >
    {#snippet trigger()}
      <Icon name="obs" size={16} />
      <span class="dot" class:on={live.status === "on"} class:live={live.streaming} class:bad={live.status === "error"}></span>
    {/snippet}
    {#snippet children(close)}
      {#if live.status !== "on"}
        <p class="menu-note">{live.status === "connecting" ? t("Connecting to {app}…", { app: name }) : live.message || t("{app} is not connected.", { app: name })}</p>
        <button type="button" role="menuitem" onclick={() => void session.connectSwitcher()}><Icon name="refresh" size={16} /> {t("Connect")}</button>
        <button type="button" role="menuitem" onclick={() => { session.openSettings("switcher"); close(); }}><Icon name="settings" size={16} /> {t("Production apps…")}</button>
      {:else}
        <p class="menu-label">{config.kind === "vmix" ? t("Inputs: click to put on air") : t("Scenes: click to put on air")}</p>
        <div class="scenes">
          {#each live.scenes as scene, index (`${index}:${scene}`)}
            <button type="button" role="menuitemradio" aria-checked={live.program === scene} class:preview={live.preview === scene} onclick={() => void session.switchScene(scene)}>
              <span class="tally" class:on={live.program === scene} class:pv={live.preview === scene && live.program !== scene}></span>{scene}
            </button>
          {:else}
            <p class="menu-note">{t("No scenes yet.")}</p>
          {/each}
        </div>
        <div class="menu-sep"></div>
        <button type="button" role="menuitem" class="out" class:live={live.streaming} onclick={() => toggle("stream", live.streaming)}>
          <span class="rec"></span>{live.streaming ? (armed === "stream" ? t("Click again to stop the stream") : t("Streaming · Stop")) : t("Start streaming")}
        </button>
        <button type="button" role="menuitem" class="out" class:live={live.recording} onclick={() => toggle("record", live.recording)}>
          <span class="rec"></span>{live.recording ? (armed === "record" ? t("Click again to stop recording") : t("Recording · Stop")) : t("Start recording")}
        </button>
        <div class="menu-sep"></div>
        <button type="button" role="menuitem" onclick={() => { session.openSettings("switcher"); close(); }}><Icon name="settings" size={16} /> {t("Production apps…")}</button>
      {/if}
    {/snippet}
  </ToolMenu>
{/if}

<style>
  .dot { position: absolute; right: 4px; bottom: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--line); box-shadow: 0 0 0 2px var(--panel); }
  .dot.on { background: var(--presence, #30a46c); }
  .dot.live { background: #e5484d; }
  .dot.bad { background: #f5a524; }
  .scenes { display: grid; max-height: 46vh; overflow: auto; }
  .tally { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 2px; background: var(--line); }
  .tally.on { background: #e5484d; }
  .tally.pv { background: #30a46c; }
  .out .rec { display: inline-block; width: 9px; height: 9px; margin-right: 8px; border-radius: 50%; border: 2px solid currentColor; }
  .out.live { color: #e5484d; }
  .out.live .rec { background: #e5484d; border-color: #e5484d; }
</style>
