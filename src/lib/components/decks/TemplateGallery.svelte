<script lang="ts">
  import { PAGE_TEMPLATES, TEMPLATE_CATEGORIES, type PageTemplate, type TemplateCategory } from "../../domain/page-templates";
  import { setCompositionBackground, type Composition } from "../../domain/composition";
  import { encodeFill } from "../../domain/fill";
  import { modalFocus } from "../../ui/modal-focus";
  import { t } from "../../i18n/core";
  import DeckThumb from "./DeckThumb.svelte";

  // Ready-made pages, each drawn for this church's screen (wide, 4:3 or portrait) before choosing.
  let { aspect, onpick, onclose }: { aspect: number; onpick: (page: Composition) => void; onclose: () => void } = $props();

  let category = $state<TemplateCategory | "All">("All");
  const shown = $derived(category === "All" ? PAGE_TEMPLATES : PAGE_TEMPLATES.filter((template) => template.category === category));
  // Built once per screen shape: the previews are the pages themselves.
  // A clear page is previewed over a stand-in picture, as it would sit over a camera.
  const STAND_IN = encodeFill({ kind: "radial", x: 30, y: 20, stops: [{ color: "#7d8ca3", at: 0 }, { color: "#3a4352", at: 55 }, { color: "#141922", at: 100 }] });
  const built = $derived(
    new Map(
      PAGE_TEMPLATES.map((template) => {
        const page = template.build(aspect);
        return [template.id, template.clear ? setCompositionBackground(page, { type: "gradient", color: "#3a4352", to: "#141922", angle: 180, assetId: "", imageUrl: "", overlay: "#000000", overlayOpacity: 0, fill: STAND_IN }) : page];
      }),
    ),
  );
  const pick = (template: PageTemplate) => onpick(template.build(aspect));
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div class="gallery" role="dialog" aria-modal="true" aria-label={t("Start from a template")} tabindex="-1" use:modalFocus onclick={(event) => event.stopPropagation()} onkeydown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onclose(); } }}>
    <header>
      <h2>{t("Start from a template")}</h2>
      <p>{t("Each one is laid out for your screen's shape, and everything on it can be changed.")}</p>
      <div class="chips" role="radiogroup" aria-label={t("Kind of page")}>
        {#each ["All", ...TEMPLATE_CATEGORIES] as name (name)}
          <button type="button" role="radio" aria-checked={category === name} class:on={category === name} onclick={() => (category = name as TemplateCategory | "All")}>{t(name)}</button>
        {/each}
      </div>
    </header>
    <div class="grid">
      {#each shown as template (template.id)}
        <button type="button" class="card" onclick={() => pick(template)} style:--aspect={aspect}>
          <span class="thumb" class:clear={template.clear}><DeckThumb page={built.get(template.id)!} /></span>
          <span class="name">{t(template.name)}</span>
          {#if template.clear}<span class="note">{t("Clear: goes over a camera")}</span>{/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 0.55); }
  .gallery { width: min(980px, 100%); max-height: min(760px, 100%); display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); color: var(--ink); box-shadow: 0 24px 64px rgb(0 0 0 / 0.5); overflow: hidden; }
  header { display: grid; gap: 6px; padding: 18px 20px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 16px; font-weight: 700; }
  header p { margin: 0; font-size: 12.5px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .chips button { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .chips button.on { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .grid { overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; padding: 18px 20px 22px; align-content: start; }
  .card { display: grid; gap: 6px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .thumb { display: block; aspect-ratio: var(--aspect); max-height: 220px; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px var(--line); transition: box-shadow 0.15s; }
  .card:hover .thumb, .card:focus-visible .thumb { box-shadow: 0 0 0 2px var(--accent); }
  .card:focus-visible { outline: none; }
  .name { font-size: 13px; font-weight: 650; }
  .note { margin-top: -4px; font-size: 11.5px; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) { .thumb { transition: none; } }
</style>
