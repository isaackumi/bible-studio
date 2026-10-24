<script lang="ts">
  import type { Composition } from "../../domain/composition";
  import { modalFocus } from "../../ui/modal-focus";
  import { t } from "../../i18n/core";

  // Every template at full size, each drawn for this church's screen (wide, 4:3 or portrait).
  let { aspect, onpick, onclose }: { aspect: number; onpick: (page: Composition) => void; onclose: () => void } = $props();
  // Every template comes with the browser, loaded when the gallery opens.
  const browser = import("./TemplateBrowser.svelte");
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div class="gallery" role="dialog" aria-modal="true" aria-label={t("Start from a template")} tabindex="-1" use:modalFocus onclick={(event) => event.stopPropagation()} onkeydown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onclose(); } }}>
    <header>
      <div>
        <h2>{t("Start from a template")}</h2>
        <p>{t("Each one is laid out for your screen's shape, and everything on it can be changed.")}</p>
      </div>
      <button type="button" class="close" aria-label={t("Close")} onclick={onclose}>✕</button>
    </header>
    {#await browser then module}<module.default {aspect} wide {onpick} />{/await}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 0.55); }
  .gallery { width: min(1240px, 100%); height: min(860px, 100%); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--line); border-radius: 18px; background: var(--panel); color: var(--ink); box-shadow: 0 24px 64px rgb(0 0 0 / 0.5); overflow: hidden; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 4px; }
  h2 { margin: 0; font-size: 17px; font-weight: 700; }
  header p { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
  .close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
</style>
