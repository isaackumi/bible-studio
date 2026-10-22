<script lang="ts">
  import { onMount } from "svelte";
  import type { IconNode } from "../../domain/icon";
  import { modalFocus } from "../../ui/modal-focus";
  import { t } from "../../i18n/core";

  // Choose an icon for a page. The whole set (about 1,900 Lucide icons) is loaded only when this
  // opens; the chosen icon's shapes are copied into the page, so screens never load the set.
  let { onpick, onclose }: { onpick: (icon: { name: string; nodes: IconNode[] }) => void; onclose: () => void } = $props();

  type Entry = [name: string, node: IconNode[]];
  let all = $state<Entry[]>([]);
  let query = $state("");
  let failed = $state(false);

  // First, the ones a church reaches for.
  const CHURCH = ["church", "cross", "book-open", "book-open-text", "heart", "hand-heart", "heart-handshake", "music", "mic", "users", "baby", "calendar", "clock", "map-pin", "phone", "mail", "globe", "qr-code", "gift", "coffee", "utensils", "sun", "star", "sparkles", "flame", "bird", "crown", "hand", "bell", "megaphone", "video", "droplet", "leaf", "sprout", "mountain", "wifi"];
  /** Enough to scan at a glance; typing narrows the rest. */
  const SHOWN = 180;

  onMount(() => {
    import("virtual:lucide-icons")
      .then((module) => (all = module.default as Entry[]))
      .catch(() => (failed = true));
  });

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const featured = $derived(words.length ? [] : CHURCH.map((name) => all.find((entry) => entry[0] === name)).filter((entry): entry is Entry => !!entry));
  const matches = $derived(words.length ? all.filter(([name]) => words.every((word) => name.includes(word))) : all);
  const label = (name: string) => name.replace(/-/g, " ");
</script>

{#snippet glyph(node: IconNode[])}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#each node as [tag, attrs], index (index)}<svelte:element this={tag} {...attrs} />{/each}
  </svg>
{/snippet}

<div class="backdrop" role="presentation" onclick={onclose}>
  <div class="picker" role="dialog" aria-modal="true" aria-label={t("Choose an icon")} tabindex="-1" use:modalFocus={".search"} onclick={(event) => event.stopPropagation()} onkeydown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onclose(); } }}>
    <header>
      <h2>{t("Choose an icon")}</h2>
      <input class="search" type="search" placeholder={t("Search icons: cross, music, calendar…")} aria-label={t("Search icons")} bind:value={query} />
    </header>
    {#if failed}
      <p class="note">{t("The icons could not be loaded. Close this and try again.")}</p>
    {:else if !all.length}
      <p class="note">{t("Loading icons…")}</p>
    {:else}
      <div class="scroll">
        {#if featured.length}
          <h3>{t("For church")}</h3>
          <div class="grid">
            {#each featured as [name, node] (name)}
              <button type="button" title={label(name)} aria-label={label(name)} onclick={() => onpick({ name, nodes: node })}>{@render glyph(node)}</button>
            {/each}
          </div>
          <h3>{t("All icons")}</h3>
        {/if}
        <div class="grid">
          {#each matches.slice(0, SHOWN) as [name, node] (name)}
            <button type="button" title={label(name)} aria-label={label(name)} onclick={() => onpick({ name, nodes: node })}>{@render glyph(node)}</button>
          {/each}
        </div>
        {#if matches.length > SHOWN}
          <p class="note">{t("{n} more. Type to find the one you want.", { n: matches.length - SHOWN })}</p>
        {:else if !matches.length}
          <p class="note">{t("No icon is called that. Try another word.")}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 0.55); }
  .picker { width: min(640px, 100%); max-height: min(640px, 100%); display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); color: var(--ink); box-shadow: 0 24px 64px rgb(0 0 0 / 0.5); overflow: hidden; }
  header { display: grid; gap: 10px; padding: 16px 16px 12px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; font-weight: 700; }
  h3 { margin: 4px 2px 8px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .search { height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg, transparent); color: inherit; font: inherit; font-size: 13px; }
  .scroll { overflow: auto; padding: 12px 14px 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 4px; margin-bottom: 14px; }
  .grid button { aspect-ratio: 1; display: grid; place-items: center; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ink); cursor: pointer; }
  .grid button:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .grid button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .grid svg { width: 24px; height: 24px; }
  .note { margin: 4px 2px; font-size: 12.5px; color: var(--muted); }
</style>
