<script lang="ts">
  import { richFromText, textFromRich, type RichDoc } from "../domain/rich-text";
  import RichTextEditor from "./RichTextEditor.svelte";
  import { t } from "../i18n/core";

  // One field of words (an overlay's text, a lower third's title, a song section's lyrics, notes),
  // Simple or Formatted. Formatted keeps the same words plain in `text`, line for line.
  let {
    text,
    rich,
    onchange,
    label,
    placeholder = "",
    multiline = false,
    variant = multiline ? "lines" : "line",
    rows = 4,
  }: {
    text: string;
    rich: RichDoc | null;
    onchange: (words: { text: string; rich: RichDoc | null }) => void;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    variant?: "full" | "lines" | "line";
    rows?: number;
  } = $props();

  const formatted = $derived(rich !== null);
  let armed = $state(false);

  function toSimple() {
    if (!rich) return;
    const marked = rich.blocks.some((block) => block.align || block.type !== "p" || block.runs.some((run) => Object.keys(run).length > 1));
    if (marked && !armed) {
      armed = true;
      setTimeout(() => (armed = false), 3500);
      return;
    }
    armed = false;
    onchange({ text: textFromRich(rich), rich: null });
  }
</script>

<div class="inline-words">
  <div class="tabs" role="tablist" aria-label={t("How the words are written")}>
    <button type="button" role="tab" aria-selected={!formatted} class:armed onclick={toSimple}>{armed ? t("Drop formatting?") : t("Simple")}</button>
    <button type="button" role="tab" aria-selected={formatted} onclick={() => !rich && onchange({ text, rich: richFromText(multiline ? text : text.replace(/\n+/g, " ")) })}>{t("Formatted")}</button>
  </div>
  {#if formatted}
    <RichTextEditor doc={rich!} {variant} placeholder={placeholder || label} onchange={(doc) => onchange({ text: textFromRich(doc), rich: doc })} />
  {:else if multiline}
    <textarea aria-label={label} placeholder={placeholder} {rows} value={text} oninput={(event) => onchange({ text: event.currentTarget.value, rich: null })}></textarea>
  {:else}
    <input aria-label={label} placeholder={placeholder} value={text} oninput={(event) => onchange({ text: event.currentTarget.value, rich: null })} />
  {/if}
</div>

<style>
  .inline-words { display: grid; gap: 6px; min-width: 0; }
  .tabs { display: inline-grid; grid-template-columns: 1fr 1fr; justify-self: start; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; }
  .tabs button { height: 22px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; white-space: nowrap; }
  .tabs button[aria-selected="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
  .tabs button.armed { background: var(--danger, #e5484d); color: #fff; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  textarea { resize: vertical; line-height: 1.45; }
</style>
