<script lang="ts">
  import { session } from "../../app/session.svelte";
  import type { PresentationItem, PresentationModel } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";

  // A small still of what a running-order item puts on screen, painted by the same engine as
  // Preview. The kind icon sits in the corner so a row still reads at a glance.
  let { item, icon, label }: { item: PresentationItem; icon: string; label: string } = $props();
  let model = $state<PresentationModel | null>(null);

  $effect(() => {
    const snapshot = $state.snapshot(item) as PresentationItem;
    void session.theme();
    let stale = false;
    void session
      .renderItem(snapshot)
      .then((next) => !stale && (model = next))
      .catch(() => !stale && (model = null));
    return () => {
      stale = true;
    };
  });
</script>

<span class="item-thumb" title={label}>
  {#if model}<Screen {model} still />{/if}
  <span class="item-thumb-kind"><Icon name={icon} size={10} /></span>
</span>

<style>
  .item-thumb { position: relative; flex: none; width: 76px; border-radius: 5px; overflow: hidden; background: #000; border: 1px solid var(--line); pointer-events: none; }
  .item-thumb :global(.ratio) { width: 100%; }
  .item-thumb-kind { position: absolute; left: 3px; bottom: 3px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; background: rgba(0, 0, 0, 0.72); color: #fff; }
</style>
