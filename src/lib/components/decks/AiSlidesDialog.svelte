<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { SLIDE_COUNTS, type SlideSource } from "../../ai/slides";
  import { aiReady } from "../../ai/summarize";
  import type { SlideDeck } from "../../domain/decks";
  import { msg, t, tn } from "../../i18n/core";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";

  // Make slides with AI: from sermon notes, a Bible passage or a topic. The deck lands in the
  // slide library (and the service, if asked), in the usual look, ready to edit.
  let {
    onclose,
    notes = "",
    title = "",
    sectionId,
    onmade,
  }: { onclose: () => void; notes?: string; title?: string; sectionId?: string; onmade?: (deck: SlideDeck) => void } = $props();

  const SOURCES: Array<{ id: SlideSource; label: string; hint: string; placeholder: string }> = [
    { id: "notes", label: msg("From notes"), hint: msg("Paste the sermon notes or outline."), placeholder: msg("Point one: God's love finds us…") },
    { id: "passage", label: msg("From a passage"), hint: msg("A Bible passage to walk through."), placeholder: "Luke 15:11-32" },
    { id: "topic", label: msg("From a topic"), hint: msg("A theme for a talk or Bible study."), placeholder: msg("Forgiveness, for the youth service") },
  ];

  let source = $state<SlideSource>(untrack(() => (notes.trim() ? "notes" : "topic")));
  let text = $state(untrack(() => notes));
  let deckTitle = $state(untrack(() => title));
  let count = $state(8);
  let addToService = $state(untrack(() => !!session.service));
  let busy = $state(false);
  let error = $state("");
  let made = $state<SlideDeck | null>(null);
  const ready = $derived(aiReady(session.workspace.ai));
  const current = $derived(SOURCES.find((entry) => entry.id === source)!);

  async function make() {
    busy = true;
    error = "";
    try {
      made = await session.generateSlides({ source, text, title: deckTitle, count, addToService: addToService && !!session.service, sectionId });
      onmade?.(made);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
    } finally {
      busy = false;
    }
  }
</script>

<DeskDialog title={t("Make slides with AI")} wide {onclose}>
  {#if !ready}
    <div class="setup">
      <Icon name="sparkles" size={22} />
      <p>{t("Slides are written by your own AI: Claude, ChatGPT, Gemini, or an AI on this computer. Set it up once.")}</p>
      <button type="button" class="primary" onclick={() => { session.openSettings("ai"); onclose(); }}>{t("Set up the AI assistant")}</button>
    </div>
  {:else if made}
    <div class="done">
      <Icon name="check" size={22} />
      <strong>{made.name}</strong>
      <p>{tn(made.pages.length, "{n} slide is in the slide library", "{n} slides are in the slide library")}{addToService && session.service ? ` · ${t("added to {service}", { service: session.service.name })}` : ""}.</p>
      <ol class="outline">
        {#each made.pages as page (page.id)}<li>{page.name}</li>{/each}
      </ol>
      <p class="hint">{t("Edit the words or the look on the Production Desk › Media › Slides. Read them before they reach the screen.")}</p>
    </div>
  {:else}
    <div class="make">
      <div class="seg" role="radiogroup" aria-label={t("Make slides")}>
        {#each SOURCES as entry (entry.id)}
          <button type="button" role="radio" aria-checked={source === entry.id} class:on={source === entry.id} onclick={() => (source = entry.id)}>{t(entry.label)}</button>
        {/each}
      </div>
      <label class="field">
        <span>{t(current.hint)}</span>
        {#if source === "notes"}
          <textarea rows="9" aria-label={t("Sermon notes")} placeholder={t(current.placeholder)} bind:value={text}></textarea>
        {:else}
          <!-- svelte-ignore a11y_autofocus -->
          <input autofocus aria-label={t(current.label)} placeholder={source === "passage" ? current.placeholder : t(current.placeholder)} bind:value={text} />
        {/if}
      </label>
      <div class="row">
        <label class="field grow"><span>{t("Deck name (optional)")}</span><input aria-label={t("Deck name")} placeholder={t("The AI names it")} bind:value={deckTitle} /></label>
        <label class="field"><span>{t("Slides")}</span>
          <select aria-label={t("How many slides")} bind:value={count}>
            {#each SLIDE_COUNTS as n (n)}<option value={n}>{tn(n, "{n} slide", "{n} slides")}</option>{/each}
          </select>
        </label>
      </div>
      {#if session.service}
        <label class="check"><input type="checkbox" bind:checked={addToService} /> {t("Add it to {service}", { service: session.service.name })}</label>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <p class="hint">{t("Your words go to the AI service you chose only when you press Make slides; its own terms and charges apply.")}</p>
    </div>
  {/if}

  {#snippet footer()}
    {#if made}
      <button type="button" class="btn" onclick={() => { made = null; text = ""; deckTitle = ""; }}>{t("Make another")}</button>
      <span class="grow"></span>
      <button type="button" class="primary" onclick={onclose}>{t("Done")}</button>
    {:else if ready}
      <span class="grow"></span>
      <button type="button" class="btn" onclick={onclose}>{t("Cancel")}</button>
      <button type="button" class="primary" disabled={busy || !text.trim()} onclick={() => void make()}><Icon name="sparkles" size={14} /> {busy ? t("Making slides…") : t("Make slides")}</button>
    {/if}
  {/snippet}
</DeskDialog>

<style>
  .make, .done, .setup { display: grid; gap: 14px; }
  .setup, .done { justify-items: start; }
  .setup :global(svg), .done :global(svg) { color: var(--accent); }
  .setup p, .done p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); max-width: 520px; }
  .done strong { font-size: 18px; }
  .seg { display: inline-flex; gap: 2px; width: fit-content; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .seg button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .seg button.on { background: var(--accent); color: var(--on-accent, #fff); }
  .field { display: grid; gap: 5px; }
  .field span { font-size: 12px; font-weight: 650; color: var(--muted); }
  .field input, .field textarea, .field select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; resize: vertical; }
  .row { display: flex; gap: 12px; align-items: end; }
  .grow { flex: 1; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
  .error { margin: 0; font-size: 13px; color: #e5484d; }
  .outline { margin: 0; padding-left: 20px; display: grid; gap: 3px; font-size: 13px; }
  .primary { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: 0.5; }
  .btn { height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
</style>
