<script lang="ts">
  import { session } from "../app/session.svelte";
  import { findItem } from "../domain/service";

  const selected = $derived(session.service && session.cursor.itemId ? findItem(session.service, session.cursor.itemId) : null);
  const item = $derived(selected?.item ?? null);
</script>

<div class="pane">
  <div class="actions">
    <button type="button" class="primary" onclick={() => session.addSlide("slide")}>Add slide</button>
    <button type="button" class="primary" onclick={() => session.addSlide("announcement")}>Add announcement</button>
  </div>
  {#if item?.kind === "slide" && item.slide}
    <input class="field" bind:value={item.slide.heading} aria-label="Slide heading" oninput={() => { item.title = item.slide?.heading ?? item.title; session.updateItem(item); }} />
    <textarea class="field" rows="6" bind:value={item.slide.body} aria-label="Slide body" oninput={() => session.updateItem(item)}></textarea>
  {:else if item?.kind === "announcement" && item.announcement}
    <input class="field" bind:value={item.announcement.heading} aria-label="Announcement heading" oninput={() => { item.title = item.announcement?.heading ?? item.title; session.updateItem(item); }} />
    <textarea class="field" rows="6" bind:value={item.announcement.body} aria-label="Announcement body" oninput={() => session.updateItem(item)}></textarea>
  {:else}
    <p class="hint">Select a slide in the rundown, or add one to the current section. Editing it changes preview only.</p>
  {/if}
</div>
