<script lang="ts" module>
  import type { RichDoc as Doc } from "../domain/rich-text";
  export type Words = { heading: string; body: string; rich: Doc | null };
  /**
   * How the heading is handled: "inline" (text: in Formatted it becomes the document's title line),
   * "separate" (announcements: a plain heading the design styles; only the body is formatted), or
   * "none" (a text box with no heading, as on a deck page).
   */
  export type HeadingMode = "inline" | "separate" | "none";
</script>

<script lang="ts">
  import { plainFromRich, richFromPlain, richLines, type RichDoc } from "../domain/rich-text";
  import RichTextEditor from "./RichTextEditor.svelte";
  import { msg, t } from "../i18n/core";

  // The words of anything with text on the screen, two ways: Simple (a heading and a body, in the
  // theme's style) or Formatted (word-processor style). Formatted keeps the same words plain in
  // heading and body too, so search, captions and anything reading plain text keep working.
  let {
    heading,
    body,
    rich,
    onchange,
    headingMode = "inline",
    headingLabel = msg("Heading"),
    bodyLabel = msg("Body"),
    headingPlaceholder = "",
    bodyPlaceholder = "",
  }: {
    heading: string;
    body: string;
    rich: RichDoc | null;
    onchange: (words: Words) => void;
    headingMode?: HeadingMode;
    headingLabel?: string;
    bodyLabel?: string;
    headingPlaceholder?: string;
    bodyPlaceholder?: string;
  } = $props();

  const mode = $derived(rich ? "formatted" : "simple");
  /** Simple was pressed once while there is formatting (press again to drop it). */
  let armed = $state(false);

  /** The plain words of a document: heading and body (inline), or the body alone. */
  function plainOf(doc: RichDoc): { heading: string; body: string } {
    return headingMode === "inline" ? plainFromRich(doc) : { heading, body: richLines(doc).join("\n") };
  }

  function toFormatted() {
    if (rich) return;
    onchange({ heading, body, rich: headingMode === "inline" ? richFromPlain(heading, body) : richFromPlain("", body) });
  }

  function toSimple() {
    if (!rich) return;
    const marked = rich.blocks.some((block) => block.align || block.type !== "p" || block.runs.some((run) => Object.keys(run).length > 1));
    if (marked && !armed) {
      armed = true;
      setTimeout(() => (armed = false), 3500);
      return;
    }
    armed = false;
    onchange({ ...plainOf(rich), rich: null });
  }

  function setRich(next: RichDoc) {
    onchange({ ...plainOf(next), rich: next });
  }
</script>

<div class="words">
  <div class="tabs" role="tablist" aria-label={t("How the words are written")}>
    <button type="button" role="tab" aria-selected={mode === "simple"} class:armed onclick={toSimple} title={t("A heading and a body, in the theme's style")}>
      {armed ? t("Drop formatting?") : t("Simple")}
    </button>
    <button type="button" role="tab" aria-selected={mode === "formatted"} onclick={toFormatted} title={t("Fonts, sizes, colours, highlight, bold, italic, underline, bullets and more")}>
      {t("Formatted")}
    </button>
  </div>

  {#if headingMode === "separate" || (headingMode === "inline" && mode === "simple")}
    <input aria-label={t(headingLabel)} placeholder={headingPlaceholder || t(headingLabel)} value={heading} oninput={(event) => onchange({ heading: event.currentTarget.value, body, rich })} />
  {/if}
  {#if mode === "simple"}
    <textarea aria-label={t(bodyLabel)} placeholder={bodyPlaceholder || t(bodyLabel)} rows="5" value={body} oninput={(event) => onchange({ heading, body: event.currentTarget.value, rich: null })}></textarea>
  {:else}
    <RichTextEditor doc={rich!} onchange={setRich} placeholder={bodyPlaceholder || msg("Type the words")} />
    <p class="hint">{t("Select words, then choose a style. The theme's text size is the starting size; Fit still shrinks long text to the screen.")}</p>
  {/if}
</div>

<style>
  .words { display: grid; gap: 8px; min-width: 0; }
  .tabs { display: inline-grid; grid-template-columns: 1fr 1fr; justify-self: start; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; }
  .tabs button { height: 28px; padding: 0 14px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .tabs button[aria-selected="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
  .tabs button.armed { background: var(--danger, #e5484d); color: #fff; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  textarea { resize: vertical; }
  .hint { margin: 0; font-size: 11px; line-height: 1.45; color: var(--muted); }
</style>
