<script lang="ts">
  import { session } from "../../app/session.svelte";
  import type { NoiseFilter } from "../../domain/types";
  import { msg, t } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import { restyle } from "./look.svelte";
  import { conductorTools, pins, togglePin, TOOL_GROUPS, type Tool } from "./tools.svelte";

  // Tools: what the Conductor Desk needs now and then, grouped by moment, so the desk itself stays
  // Next, the lever and Live. A pin puts a switch or button on the desk's bottom strip.

  let { onclose }: { onclose: () => void } = $props();

  const tools = $derived(conductorTools());
  const inGroup = (group: Tool["group"]) => tools.filter((tool) => tool.group === group);
  const dim = $derived(session.theme().dim ?? 0);
  const filter = $derived(session.workspace.voice.noiseFilter ?? "off");
  const FILTERS: Array<{ id: NoiseFilter; label: string }> = [
    { id: "off", label: msg("Off") },
    { id: "light", label: msg("Light") },
    { id: "strong", label: msg("Strong") },
  ];
  let platform = $state("");
  let notice = $state("");

  function run(tool: Tool) {
    void tool.run();
    // A button that opens something else closes Tools; a switch leaves it open to see it change.
    if (tool.on === undefined) onclose();
  }
</script>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />

<button type="button" class="catch" aria-label={t("Close Tools")} tabindex="-1" onclick={onclose}></button>
<div class="tools" role="dialog" aria-label={t("Tools")}>
  {#each TOOL_GROUPS as group (group.id)}
    <section>
      <h3>{t(group.label)}</h3>
      {#each inGroup(group.id) as tool (tool.id)}
        <div class="row">
          <button type="button" class="tool" class:on={tool.on} aria-pressed={tool.on} onclick={() => run(tool)}>
            <Icon name={tool.icon} size={15} />
            <span>{t(tool.label)}</span>
            {#if tool.on !== undefined}<i class="state">{tool.on ? t("On") : t("Off")}</i>{/if}
          </button>
          <button type="button" class="pin" class:pinned={pins.ids.includes(tool.id)} aria-pressed={pins.ids.includes(tool.id)} aria-label={pins.ids.includes(tool.id) ? t("Take {name} off the desk", { name: t(tool.label) }) : t("Pin {name} to the desk", { name: t(tool.label) })} title={pins.ids.includes(tool.id) ? t("Take off the desk") : t("Pin to the desk")} onclick={() => togglePin(tool.id)}>
            <Icon name={pins.ids.includes(tool.id) ? "pin-off" : "pin"} size={14} />
          </button>
        </div>
      {/each}

      {#if group.id === "listening"}
        <div class="row field">
          <span class="field-label">{t("Noise filter")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Noise filter")}>
            {#each FILTERS as option (option.id)}
              <button type="button" role="radio" class:on={filter === option.id} aria-checked={filter === option.id} onclick={() => void session.setNoiseFilter(option.id)}>{t(option.label)}</button>
            {/each}
          </div>
        </div>
      {:else if group.id === "screen"}
        <div class="row field">
          <span class="field-label">{t("Darken the background")}</span>
          <div class="seg">
            <button type="button" aria-label={t("Lighter background")} onclick={() => restyle({ dim: Math.max(0, Math.round((dim - 0.1) * 10) / 10) })}><Icon name="minus" size={13} /></button>
            <span class="value">{Math.round(dim * 100)}%</span>
            <button type="button" aria-label={t("Darker background")} onclick={() => restyle({ dim: Math.min(0.8, Math.round((dim + 0.1) * 10) / 10) })}><Icon name="plus" size={13} /></button>
          </div>
        </div>
        <form class="say" onsubmit={(event) => { event.preventDefault(); session.sendStageMessage(platform.trim()); platform = ""; }}>
          <input bind:value={platform} placeholder={t("Message to the platform")} aria-label={t("Message to the platform")} />
          <button type="submit" disabled={!platform.trim()}>{t("Send")}</button>
          {#if session.stageMessage}<button type="button" onclick={() => session.sendStageMessage("")}>{t("Clear it")}</button>{/if}
        </form>
        <form class="say" onsubmit={(event) => { event.preventDefault(); void session.showAlert({ text: notice.trim(), style: "banner", position: "bottom", seconds: null }); notice = ""; }}>
          <input bind:value={notice} placeholder={t("A notice on the screen")} aria-label={t("A notice on the screen")} />
          <button type="submit" disabled={!notice.trim()}>{t("Show")}</button>
          {#if session.alert}<button type="button" onclick={() => void session.clearAlert()}>{t("Take it off")}</button>{/if}
        </form>
      {/if}
    </section>
  {/each}
</div>

<style>
  .catch { position: fixed; inset: 0; z-index: 60; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: default; }
  .tools {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 61;
    width: min(360px, calc(100vw - 32px));
    max-height: min(70vh, 620px);
    overflow: auto;
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.4);
  }
  section { display: grid; gap: 4px; }
  h3 { margin: 0 0 2px; font-size: 11px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .tool { flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
  .tool:hover { background: var(--field); }
  .tool span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-style: normal; font-size: 11px; font-weight: 700; color: var(--muted); }
  .tool.on .state { color: var(--ink); }
  .tool.on { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); background: var(--field); }
  .pin { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
  .pin:hover, .pin.pinned { color: var(--ink); background: var(--field); }
  .field { justify-content: space-between; padding: 4px 4px 4px 10px; }
  .field-label { font-size: 13px; font-weight: 600; }
  .seg { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); }
  .seg button { min-width: 30px; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; display: grid; place-items: center; }
  .seg button.on { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); background: var(--panel); }
  .value { min-width: 36px; text-align: center; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .say { display: flex; gap: 6px; padding: 2px 0 2px 4px; }
  .say input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  .say button { height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .say button:disabled { opacity: 0.45; cursor: default; }
  :is(.tool, .pin, .seg button, .say button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
