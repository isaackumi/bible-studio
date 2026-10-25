<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { packEntries, templateCatalog, type CatalogEntry } from "../../domain/template-catalog";
  import { FONT_PAIRS, PALETTES, type TemplateLook } from "../../domain/template-kit";
  import { TEMPLATE_CATEGORIES, type TemplateCategory } from "../../domain/page-templates";
  import { setCompositionBackground, type Composition } from "../../domain/composition";
  import { encodeFill, fillCss } from "../../domain/fill";
  import { addedPacks, loadPack, loadPackIndex, setAddedPacks, type TemplatePack } from "../../app/template-packs";
  import { t, tn } from "../../i18n/core";
  import { inView } from "../../ui/in-view";
  import DeckThumb from "./DeckThumb.svelte";

  // Every template, to search, browse by kind, try in other colours and fonts, and add more packs
  // from the website. Used in the studio's Templates panel (narrow) and its full-size gallery (wide).
  let { aspect, wide = false, onpick, onexpand }: { aspect: number; wide?: boolean; onpick: (page: Composition) => void; onexpand?: () => void } = $props();

  type View = TemplateCategory | "All" | "Downloads";
  const base = templateCatalog();
  let query = $state("");
  let view = $state<View>("All");
  let palette = $state<string | null>(null);
  let fonts = $state<string | null>(null);
  let limit = $state(60);
  let packs = $state<TemplatePack[]>([]);
  let added = $state<string[]>(addedPacks());
  let fromPacks = $state<Record<string, CatalogEntry[]>>({});
  let loading = $state<string | null>(null);
  let packError = $state<string | null>(null);
  const seen = new SvelteSet<string>();

  onMount(() => {
    void (async () => {
      packs = await loadPackIndex();
      for (const pack of packs) if (added.includes(pack.id)) void addPack(pack, false);
    })();
  });

  async function addPack(pack: TemplatePack, remember = true) {
    loading = pack.id;
    packError = null;
    const specs = await loadPack(pack);
    loading = null;
    if (!specs.length) {
      packError = t("{name} could not be downloaded. Check the internet connection and try again.", { name: pack.name });
      return;
    }
    fromPacks = { ...fromPacks, [pack.id]: packEntries(specs, pack.name) };
    if (remember) {
      added = [...added, pack.id];
      setAddedPacks(added);
    }
  }
  function removePack(pack: TemplatePack) {
    const { [pack.id]: _gone, ...rest } = fromPacks;
    fromPacks = rest;
    added = added.filter((id) => id !== pack.id);
    setAddedPacks(added);
  }

  const all = $derived([...Object.values(fromPacks).flat(), ...base]);
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = $derived(
    all.filter((entry) => (view === "All" || view === "Downloads" ? true : entry.category === view) && (view !== "Downloads" || !!entry.pack) && words.every((word) => entry.search.includes(word) || t(entry.category).toLowerCase().includes(word))),
  );
  // Browsing everything with nothing typed: a row per kind of page, like a shop window.
  const shelves = $derived(view === "All" && !words.length);
  const counts = $derived(new Map(TEMPLATE_CATEGORIES.map((category) => [category, all.filter((entry) => entry.category === category).length])));
  const look = $derived<TemplateLook>({ palette, fonts });

  const STAND_IN = encodeFill({ kind: "radial", x: 30, y: 20, stops: [{ color: "#7d8ca3", at: 0 }, { color: "#3a4352", at: 55 }, { color: "#141922", at: 100 }] });
  function preview(entry: CatalogEntry): Composition {
    const page = entry.build(aspect, look);
    return entry.clear ? setCompositionBackground(page, { type: "gradient", color: "#3a4352", to: "#141922", angle: 180, assetId: "", imageUrl: "", overlay: "#000000", overlayOpacity: 0, fill: STAND_IN }) : page;
  }
  const pick = (entry: CatalogEntry) => onpick(entry.build(aspect, look));
  function open(next: View) {
    view = next;
    limit = 60;
  }
</script>

{#snippet card(entry: CatalogEntry)}
  <button type="button" class="card" onclick={() => pick(entry)} title={`${t(entry.name)} · ${t(entry.category)}`}>
    <span class="thumb" style:--aspect={aspect} use:inView={() => seen.add(entry.id)}>
      {#if seen.has(entry.id)}<DeckThumb page={preview(entry)} />{/if}
      {#if entry.clear}<span class="badge">{t("Over a camera")}</span>{:else if entry.pack}<span class="badge">{entry.pack}</span>{/if}
    </span>
    {#if wide}<span class="name">{t(entry.name)}</span>{/if}
  </button>
{/snippet}

<div class="browser" class:wide>
  <div class="top">
    <input class="search" type="search" placeholder={t("Search templates")} aria-label={t("Search templates")} bind:value={query} oninput={() => (limit = 60)} />
    <div class="chips" role="radiogroup" aria-label={t("Kind of page")}>
      {#each ["All", ...TEMPLATE_CATEGORIES, ...(packs.length ? ["Downloads"] : [])] as name (name)}
        <button type="button" role="radio" aria-checked={view === name} class:on={view === name} onclick={() => open(name as View)}>{t(name)}</button>
      {/each}
    </div>
    <div class="look">
      <div class="swatches" role="radiogroup" aria-label={t("Colours")}>
        <button type="button" role="radio" aria-checked={!palette} class="swatch original" class:on={!palette} title={t("Each template's own colours")} onclick={() => (palette = null)}>{t("Own")}</button>
        {#each PALETTES as entry (entry.id)}
          <button type="button" role="radio" aria-checked={palette === entry.id} aria-label={t(entry.name)} title={t(entry.name)} class="swatch" class:on={palette === entry.id} style:background={fillCss(entry.bg)} onclick={() => (palette = entry.id)}>
            <span style:background={entry.accent}></span>
          </button>
        {/each}
      </div>
      <select class="fonts" aria-label={t("Fonts")} value={fonts ?? ""} onchange={(event) => (fonts = event.currentTarget.value || null)}>
        <option value="">{t("Each template's own fonts")}</option>
        {#each FONT_PAIRS as pair (pair.id)}<option value={pair.id}>{t(pair.name)}</option>{/each}
      </select>
    </div>
    {#if palette || fonts}<p class="hint">{t("Colours and fonts change every template except the hand-made Featured ones.")}</p>{/if}
  </div>

  <div class="scroll">
    {#if shelves}
      {#if all.some((entry) => entry.featured)}
        <section>
          <header><h3>{t("Featured")}</h3></header>
          <div class="grid">{#each all.filter((entry) => entry.featured).slice(0, wide ? 10 : 4) as entry (entry.id)}{@render card(entry)}{/each}</div>
        </section>
      {/if}
      {#each TEMPLATE_CATEGORIES as category (category)}
        <section>
          <header>
            <h3>{t(category)}</h3>
            <button type="button" class="more" onclick={() => open(category)}>{tn(counts.get(category) ?? 0, "See all {n}", "See all {n}")}</button>
          </header>
          <div class="grid">{#each all.filter((entry) => entry.category === category && !entry.featured).slice(0, wide ? 5 : 2) as entry (entry.id)}{@render card(entry)}{/each}</div>
        </section>
      {/each}
    {:else}
      <p class="count">{tn(matches.length, "{n} template", "{n} templates")}</p>
      <div class="grid">{#each matches.slice(0, limit) as entry (entry.id)}{@render card(entry)}{/each}</div>
      {#if matches.length > limit}<button type="button" class="show-more" onclick={() => (limit += 60)}>{t("Show more")}</button>{/if}
      {#if !matches.length}<p class="empty">{t("No templates match. Try another word, or another kind of page.")}</p>{/if}
    {/if}

    {#if packs.length && (shelves || view === "Downloads")}
      <section class="packs">
        <header><h3>{t("More templates to download")}</h3></header>
        {#if packError}<p class="error" role="alert">{packError}</p>{/if}
        {#each packs as pack (pack.id)}
          <div class="pack">
            <div>
              <strong>{pack.name}</strong>
              <span>{pack.description}</span>
              <small>{tn(pack.count, "{n} template", "{n} templates")}</small>
            </div>
            {#if added.includes(pack.id)}
              <button type="button" class="pack-btn" onclick={() => removePack(pack)}>{t("Remove")}</button>
            {:else}
              <button type="button" class="pack-btn add" disabled={loading === pack.id} onclick={() => addPack(pack)}>{loading === pack.id ? t("Downloading…") : t("Add")}</button>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
  </div>
  {#if onexpand}<button type="button" class="expand" onclick={onexpand}>{t("Open the full gallery")}</button>{/if}
</div>

<style>
  .browser { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .top { flex: none; display: grid; gap: 10px; padding: 12px 14px 10px; border-bottom: 1px solid var(--line); }
  .search { height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 12px; font: inherit; font-size: 13px; }
  .chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
  .wide .chips { flex-wrap: wrap; overflow: visible; }
  .chips button { flex: none; height: 28px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .chips button.on { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .look { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .swatches { display: flex; gap: 5px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .swatch { position: relative; width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); cursor: pointer; overflow: hidden; }
  .swatch span { position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px; border-radius: 50%; }
  .swatch.on { outline: 2px solid var(--accent); outline-offset: 2px; }
  .swatch.original { width: auto; padding: 0 8px; border-radius: 999px; background: var(--field); color: var(--ink); font: inherit; font-size: 11px; font-weight: 600; }
  .fonts { height: 32px; padding: 0 8px; line-height: normal; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-size: 12px; max-width: 100%; }
  .hint { margin: 0; font-size: 11.5px; color: var(--muted); }
  .scroll { flex: 1; min-height: 0; overflow: auto; padding: 6px 14px 16px; }
  section { margin-top: 12px; }
  section header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 13px; font-weight: 700; }
  .more { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .wide .grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  .card { display: grid; gap: 6px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; }
  .thumb { position: relative; display: block; aspect-ratio: var(--aspect); max-height: 240px; border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--ink) 6%, transparent); box-shadow: 0 0 0 1px var(--line); transition: box-shadow 0.15s, transform 0.15s; }
  .card:hover .thumb, .card:focus-visible .thumb { box-shadow: 0 0 0 2px var(--accent); transform: translateY(-1px); }
  .card:focus-visible { outline: none; }
  .badge { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; border-radius: 6px; background: rgb(0 0 0 / 0.6); color: #fff; font-size: 10px; font-weight: 600; }
  .name { font-size: 12.5px; font-weight: 600; }
  .count, .empty { margin: 8px 0; font-size: 12px; color: var(--muted); }
  .show-more { display: block; margin: 14px auto 0; height: 32px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; cursor: pointer; }
  .packs { margin-top: 22px; padding-top: 12px; border-top: 1px solid var(--line); display: grid; gap: 8px; }
  .pack { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
  .pack div { display: grid; gap: 2px; min-width: 0; }
  .pack strong { font-size: 13px; }
  .pack span { font-size: 12px; color: var(--muted); }
  .pack small { font-size: 11px; color: var(--muted); }
  .pack-btn { flex: none; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .pack-btn.add { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .error { margin: 0; font-size: 12px; color: var(--danger, #ff6b5e); }
  .expand { margin: 0 14px 12px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) { .thumb { transition: none; } }
</style>
