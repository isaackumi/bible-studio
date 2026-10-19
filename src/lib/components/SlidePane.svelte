<script lang="ts">
  import { session } from "../app/session.svelte";
  import { findItem } from "../domain/service";
  import { msg, t } from "../i18n/core";
  import { itemWithWords } from "../domain/rich-text";
  import TextWords from "./TextWords.svelte";

  const selected = $derived(session.service && session.cursor.itemId ? findItem(session.service, session.cursor.itemId) : null);
  const item = $derived(selected?.item ?? null);
</script>

<div class="pane">
  <div class="actions">
    <button type="button" class="primary" onclick={() => session.addSlide("slide")}>{t("Add slide")}</button>
    <button type="button" class="primary" onclick={() => session.addSlide("announcement")}>{t("Add announcement")}</button>
  </div>
  {#if item?.kind === "slide" && item.slide}
    <TextWords heading={item.slide.heading} body={item.slide.body} rich={item.slide.rich ?? null} headingLabel={msg("Slide heading")} bodyLabel={msg("Slide body")} onchange={(words) => session.updateItem(itemWithWords(item, words))} />
  {:else if item?.kind === "announcement" && item.announcement}
    <TextWords heading={item.announcement.heading} body={item.announcement.body} rich={item.announcement.rich ?? null} headingMode="separate" headingLabel={msg("Announcement heading")} bodyLabel={msg("Announcement body")} onchange={(words) => session.updateItem(itemWithWords(item, words))} />
  {:else}
    <p class="hint">{t("Select a slide in the rundown, or add one to the current section. Editing it changes preview only.")}</p>
  {/if}
</div>
