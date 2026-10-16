<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { presentComposition, type Composition } from "../../domain/composition";
  import { withMediaUrls } from "../../domain/sources";
  import { mediaUrl } from "../../db/api";
  import Screen from "../Screen.svelte";

  // A live miniature of a deck page, painted by the same engine as Preview and Program.
  let { page }: { page: Composition } = $props();
  const model = $derived(
    presentComposition(
      withMediaUrls(page, (id) => mediaUrl(session.media.find((asset) => asset.id === id) ?? null)),
      { theme: session.theme(), now: 0 },
    ),
  );
</script>

<div class="thumb"><Screen {model} /></div>

<style>
  .thumb { width: 100%; border-radius: 8px; overflow: hidden; pointer-events: none; }
  .thumb :global(.ratio) { width: 100%; }
</style>
