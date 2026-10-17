<script lang="ts">
  import { SOURCE_KINDS, type SourceKind } from "../../domain/sources";
  import Icon from "../Icon.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import { sourceMeta } from "./source-meta";

  // Choosing what to add to a scene: big, labelled tiles grouped by what they are for, plus a
  // quick way to drop a verse straight in.
  let {
    scene,
    onpick,
    onscripture,
    onclose,
  }: {
    scene: string;
    onpick: (type: SourceKind) => void;
    onscripture: (reference: string) => void;
    onclose: () => void;
  } = $props();

  let reference = $state("");
  const GROUPS = ["Live", "Words", "Time", "Graphics"] as const;
  const kinds = $derived(SOURCE_KINDS.map((kind) => ({ ...kind, meta: sourceMeta(kind.type) })));
</script>

<DeskDialog title="Add to {scene}" {onclose} wide>
  <form class="quick" onsubmit={(event) => { event.preventDefault(); if (reference.trim()) onscripture(reference.trim()); }}>
    <span class="quick-icon" style:--tint="#c18a3d"><Icon name="bible" size={16} /></span>
    <label class="quick-copy">
      <strong>Quick scripture</strong>
      <input aria-label="Quick scripture reference" placeholder="John 3:16, Psalm 23" bind:value={reference} />
    </label>
    <button type="submit" class="desk-btn primary-soft" disabled={!reference.trim()}>Add verse</button>
  </form>

  {#each GROUPS as group (group)}
    {@const items = kinds.filter((kind) => kind.meta.group === group)}
    {#if items.length}
      <p class="group">{group}</p>
      <div class="tiles">
        {#each items as kind (kind.type)}
          <button type="button" class="tile" style:--tint={kind.meta.color} onclick={() => onpick(kind.type)}>
            <span class="tile-icon"><Icon name={kind.meta.icon} size={20} /></span>
            <strong>{kind.label}</strong>
            <span class="blurb">{kind.meta.blurb}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/each}
</DeskDialog>

<style>
  .quick { display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .quick-icon, .tile-icon { display: grid; place-items: center; flex: none; border-radius: 10px; background: color-mix(in srgb, var(--tint) 18%, transparent); color: var(--tint); }
  .quick-icon { width: 36px; height: 36px; }
  .quick-copy { flex: 1; display: grid; gap: 4px; min-width: 0; }
  .quick-copy strong { font-size: 12px; }
  .quick-copy input { height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; min-width: 0; }
  .group { margin: 14px 2px 8px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .tile { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; row-gap: 2px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease; }
  .tile:hover { border-color: var(--tint); box-shadow: 0 8px 24px color-mix(in srgb, var(--tint) 16%, transparent); transform: translateY(-1px); }
  .tile:focus-visible { outline: 2px solid var(--tint); outline-offset: 2px; }
  .tile-icon { grid-row: span 2; width: 42px; height: 42px; }
  .tile strong { font-size: 14px; }
  .blurb { font-size: 12px; color: var(--muted); line-height: 1.35; }
  @media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }
</style>
