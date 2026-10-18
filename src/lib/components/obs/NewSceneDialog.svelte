<script lang="ts">
  import { untrack } from "svelte";
  import { COMPOSITION_TEMPLATES } from "../../domain/composition";
  import Icon from "../Icon.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import { sourceMeta } from "./source-meta";
  import { t } from "../../i18n/core";

  // A new scene: its name, a folder color, and what it starts with. Layouts arrive filled with
  // what is on the desk (cameras, the verse on Preview), ready to adjust.
  let {
    suggested,
    colors,
    oncreate,
    onclose,
  }: {
    suggested: string;
    colors: readonly string[];
    oncreate: (name: string, color: string | null, templateId: string | null) => void;
    onclose: () => void;
  } = $props();

  let name = $state(untrack(() => suggested));
  let color = $state<string | null>(null);
  let template = $state<string | null>(null);
  const layouts = COMPOSITION_TEMPLATES.filter((entry) => entry.slots.every((slot) => slot.role));
</script>

<DeskDialog title={t("New scene")} {onclose} wide>
  <form class="head" onsubmit={(event) => { event.preventDefault(); oncreate(name.trim() || suggested, color, template); }}>
    <label class="name">
      <span>{t("Name")}</span>
      <input aria-label={t("Scene name")} bind:value={name} />
    </label>
    <div class="colors" role="radiogroup" aria-label={t("Folder color")}>
      <span>{t("Color")}</span>
      <div class="swatches">
        <button type="button" role="radio" aria-checked={color === null} aria-label={t("No color")} class="swatch none" class:on={color === null} onclick={() => (color = null)}></button>
        {#each colors as entry (entry)}
          <button type="button" role="radio" aria-checked={color === entry} aria-label={t("Color {entry}", { entry })} class="swatch" class:on={color === entry} style:background={entry} onclick={() => (color = entry)}></button>
        {/each}
      </div>
    </div>
  </form>

  <p class="group">{t("Start with")}</p>
  <div class="layouts" role="radiogroup" aria-label={t("Start with")}>
    <button type="button" role="radio" aria-checked={template === null} class="layout" class:on={template === null} onclick={() => (template = null)}>
      <span class="schema empty"><Icon name="plus" size={18} /></span>
      <strong>{t("Empty")}</strong>
    </button>
    {#each layouts as entry (entry.id)}
      <button type="button" role="radio" aria-checked={template === entry.id} class="layout" class:on={template === entry.id} onclick={() => (template = entry.id)}>
        <span class="schema" aria-hidden="true">
          {#each entry.slots as slot (slot.id)}
            <i style:left="{slot.bounds.x}%" style:top="{slot.bounds.y}%" style:width="{slot.bounds.w}%" style:height="{slot.bounds.h}%" style:--tint={sourceMeta(slot.role === "lyrics" ? "song" : slot.role ?? "").color}></i>
          {/each}
        </span>
        <strong>{entry.name}</strong>
      </button>
    {/each}
  </div>

  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>{t("Cancel")}</button>
    <button type="button" class="desk-btn primary-soft" onclick={() => oncreate(name.trim() || suggested, color, template)}>{t("Create scene")}</button>
  {/snippet}
</DeskDialog>

<style>
  .head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: end; }
  .name, .colors { display: grid; gap: 6px; }
  .name span, .colors > span { font-size: 12px; font-weight: 650; color: var(--muted); }
  .name input { height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 15px; font-weight: 600; }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .swatch.none { background: repeating-linear-gradient(45deg, var(--field), var(--field) 4px, var(--line) 4px, var(--line) 6px); }
  .swatch.on { outline: 2px solid var(--ink); outline-offset: 2px; }
  .group { margin: 16px 2px 8px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .layouts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; max-height: 46vh; overflow: auto; padding: 2px; }
  .layout { display: grid; gap: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .layout:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .layout.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .layout strong { font-size: 12px; font-weight: 650; }
  .schema { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 8px; background: #0b0b0d; overflow: hidden; }
  .schema i { position: absolute; border-radius: 3px; background: color-mix(in srgb, var(--tint) 55%, #111); outline: 1px solid rgba(0, 0, 0, 0.5); }
  .schema.empty { display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); background: none; }
</style>
