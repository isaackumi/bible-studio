<script lang="ts">
  import { session } from "../../app/session.svelte";
  import {
    goneLiveDays,
    goneLiveKey,
    goneLiveSpan,
    goneLiveVerse,
    goneLiveView,
    hasGoneLiveToday,
    type GoneLive,
  } from "../../domain/gone-live";
  import Icon from "../Icon.svelte";
  import { parseReference } from "../../bible/reference";
  import { t } from "../../i18n/core";

  // Scriptures that have gone live, in order. A click sends one straight to the screen. The side
  // panel shows it compact; the wide window adds the words, the verses stepped through, day groups
  // and keyboard control (↑ ↓ to move, Enter to go live, P to pin, Delete to remove).
  let { wide = false, onpicked }: { wide?: boolean; onpicked?: () => void } = $props();

  let query = $state("");
  let showRemoved = $state(false);
  let scope = $state<"today" | "all">(hasGoneLiveToday(session.workspace.goneLive) ? "today" : "all");
  let cursor = $state(0);
  let searchInput = $state<HTMLInputElement | undefined>();

  const today = new Date().toDateString();
  const inScope = (entry: GoneLive) => scope === "all" || entry.pinned || new Date(entry.lastAt).toDateString() === today;
  const all = $derived(session.workspace.goneLive);
  const hasOlder = $derived(all.some((entry) => !entry.removed && new Date(entry.lastAt).toDateString() !== today));
  const view = $derived(goneLiveView(all.filter(inScope), query));
  const days = $derived(goneLiveDays(view.rest));
  /** Rows in the order shown, for the keyboard. */
  const rows = $derived([...view.pinned, ...days.flatMap((day) => day.entries)]);
  /** The verse(s) on screen now, to mark the passage (and verse) they belong to. */
  const onAir = $derived.by(() => {
    const model = session.live.program.model;
    if (model.layout !== "scripture" || !model.reference) return null;
    const parsed = parseReference(model.reference);
    return parsed?.startVerse ? { bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: parsed.startVerse, endVerse: parsed.endVerse ?? parsed.startVerse } : null;
  });
  function airOf(entry: GoneLive): boolean {
    if (!onAir || onAir.bookOrd !== entry.passage.bookOrd || onAir.chapter !== entry.passage.chapter) return false;
    const span = goneLiveSpan(entry);
    return onAir.startVerse >= span.startVerse && onAir.endVerse <= span.endVerse;
  }
  const showSearch = $derived(wide || all.length > 5);

  // The wide window opens ready to type a search (after the dialog has placed its own focus).
  $effect(() => {
    if (!wide) return;
    const timer = setTimeout(() => searchInput?.focus(), 0);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
  });

  function abbr(id: string): string {
    return session.translations.find((entry) => entry.id === id)?.abbreviation ?? id.toUpperCase();
  }

  function when(entry: GoneLive): string {
    const at = new Date(entry.lastAt);
    return at.toDateString() === today ? at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : at.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  async function send(entry: GoneLive) {
    await session.goLivePassage(entry.passage);
    onpicked?.();
  }

  async function sendVerse(entry: GoneLive, verse: number) {
    await session.goLiveGoneVerse(goneLiveVerse(entry, verse));
    onpicked?.();
  }

  function keys(event: KeyboardEvent) {
    if (!wide || !rows.length) return;
    const typing = event.target instanceof HTMLInputElement;
    const entry = rows[cursor];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      cursor = Math.max(0, Math.min(rows.length - 1, cursor + (event.key === "ArrowDown" ? 1 : -1)));
      document.getElementById(`gone-${cursor}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && entry) {
      event.preventDefault();
      void send(entry);
    } else if (!typing && (event.key === "p" || event.key === "P") && entry) {
      session.pinGoneLive(goneLiveKey(entry.passage), !entry.pinned);
    } else if (!typing && (event.key === "Delete" || event.key === "Backspace") && entry) {
      session.removeGoneLive(goneLiveKey(entry.passage), true);
    }
  }
</script>

{#snippet row(entry: GoneLive, order: number | null)}
  {@const key = goneLiveKey(entry.passage)}
  {@const span = goneLiveSpan(entry)}
  {@const index = rows.indexOf(entry)}
  <div
    class="gl-row"
    id={wide ? `gone-${index}` : undefined}
    class:pinned={entry.pinned}
    class:air={airOf(entry)}
    class:cursor={wide && index === cursor}
  >
    <button type="button" class="gl-go" title={t("Send straight to the screen")} onclick={() => void send(entry)} onfocus={() => (cursor = index)}>
      <span class="gl-n">{#if order === null}<Icon name="pin" size={12} />{:else}{order}{/if}</span>
      <span class="gl-text">
        <strong>{entry.passage.reference}{#if span.endVerse > entry.passage.endVerse || span.startVerse < entry.passage.startVerse}<span class="gl-reach">&nbsp;→ {entry.passage.chapter}:{span.endVerse}</span>{/if}</strong>
        <small>{abbr(entry.passage.translationId)} · {when(entry)}{entry.times > 1 ? ` · ${entry.times}×` : ""}{airOf(entry) ? " · on screen" : ""}</small>
        {#if wide && entry.snippet}<span class="gl-snippet">{entry.snippet}</span>{/if}
      </span>
    </button>
    <button type="button" class="gl-act" class:on={entry.pinned} aria-label={entry.pinned ? t("Unpin {reference}", { reference: entry.passage.reference }) : t("Pin {reference}", { reference: entry.passage.reference })} title={entry.pinned ? t("Unpin") : t("Pin to the top")} onclick={() => session.pinGoneLive(key, !entry.pinned)}>
      <Icon name={entry.pinned ? "pin-off" : "pin"} size={14} />
    </button>
    <button type="button" class="gl-act" aria-label={t("Remove {reference} from the list", { reference: entry.passage.reference })} title={t("Remove from the list")} onclick={() => session.removeGoneLive(key, true)}>
      <Icon name="close" size={14} />
    </button>
  </div>
  {#if wide && span.endVerse > span.startVerse}
    <div class="gl-verses" aria-label={t("Verses of {reference}", { reference: entry.passage.reference })}>
      {#each Array.from({ length: Math.min(60, span.endVerse - span.startVerse + 1) }, (_, n) => span.startVerse + n) as verse (verse)}
        <button
          type="button"
          class:air={airOf(entry) && onAir?.startVerse === verse}
          title={t("Send {chapter}:{verse} to the screen", { chapter: entry.passage.chapter, verse })}
          onclick={() => void sendVerse(entry, verse)}
        >{entry.passage.chapter}:{verse}</button>
      {/each}
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -- keyboard shortcuts for the list inside -->
<div class="gl" class:wide onkeydown={keys}>
  {#if showSearch || hasOlder}
    <div class="gl-tools">
      {#if showSearch}
        <label class="gl-search focus-box">
          <Icon name="search" size={13} />
          <input
            bind:this={searchInput}
            type="search"
            aria-label={t("Search scriptures that have gone live")}
            placeholder={wide ? t("Search, e.g. John 3 or Psalm 23") : t("Search, e.g. John 3")}
            bind:value={query}
          />
        </label>
      {/if}
      {#if hasOlder}
        <div class="gl-scope" role="radiogroup" aria-label={t("Which days")}>
          <button type="button" role="radio" aria-checked={scope === "today"} onclick={() => (scope = "today")}>{t("Today")}</button>
          <button type="button" role="radio" aria-checked={scope === "all"} onclick={() => (scope = "all")}>{t("All")}</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="gl-list">
    {#if view.pinned.length}
      {#if wide || scope === "all"}<p class="gl-day">{t("Pinned")}</p>{/if}
      {#each view.pinned as entry (goneLiveKey(entry.passage))}{@render row(entry, null)}{/each}
    {/if}
    {#each days as day (day.day)}
      {#if wide || scope === "all"}<p class="gl-day">{day.label}</p>{/if}
      {#each day.entries as entry, index (goneLiveKey(entry.passage))}{@render row(entry, index + 1)}{/each}
    {/each}
    {#if !rows.length}
      <p class="gl-empty">
        {#if query.trim()}{t("Nothing that has gone live matches “{query}”.", { query: query.trim() })}
        {:else if scope === "today" && hasOlder}{t("Nothing has gone live today yet. All shows earlier services.")}
        {:else}{t("Every scripture that goes live is kept here, in order. Click one to send it straight back to the screen.")}{/if}
      </p>
    {/if}
    {#if view.removed.length}
      <button type="button" class="gl-fold" aria-expanded={showRemoved} onclick={() => (showRemoved = !showRemoved)}>
        <Icon name={showRemoved ? "chevron-down" : "chevron-right"} size={13} /> {t("Removed ({length})", { length: view.removed.length })}
      </button>
      {#if showRemoved}
        {#each view.removed as entry (goneLiveKey(entry.passage))}
          <div class="gl-row removed">
            <span class="gl-text"><strong>{entry.passage.reference}</strong><small>{abbr(entry.passage.translationId)} · {when(entry)}</small></span>
            <button type="button" class="gl-act" aria-label={t("Add {reference} back", { reference: entry.passage.reference })} title={t("Add back to the list")} onclick={() => session.removeGoneLive(goneLiveKey(entry.passage), false)}>
              <Icon name="plus" size={14} />
            </button>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
  {#if wide}
    <p class="gl-keys"><kbd>↑</kbd><kbd>↓</kbd> {t("move")} · <kbd>Enter</kbd> {t("send to the screen")} · <kbd>P</kbd> {t("pin")} · <kbd>Delete</kbd> {t("remove")}</p>
  {/if}
</div>

<style>
  .gl { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .gl.wide { height: min(70vh, 640px); }
  .gl-tools { display: flex; gap: 6px; align-items: center; flex: none; }
  .gl-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--muted); }
  .wide .gl-search { height: 36px; }
  .gl-search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  /* Keyboard users see where they are. */
  .gl-search:focus-within { border-color: var(--accent); }
  .gl-scope { display: flex; flex: none; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .gl-scope button { height: 28px; padding: 0 9px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; }
  .gl-scope button[aria-checked="true"] { background: var(--field); color: var(--ink); }
  .gl-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; flex: 1; }
  .gl-day { margin: 6px 2px 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .gl-day:first-child { margin-top: 0; }
  .gl-row { display: flex; align-items: stretch; border: 1px solid var(--line); border-radius: 8px; background: var(--field); flex: none; }
  .gl-row.pinned { border-color: color-mix(in srgb, var(--mustard, #f5b301) 45%, var(--line)); }
  .gl-row.air { border-color: color-mix(in srgb, var(--live, #e5484d) 55%, var(--line)); background: color-mix(in srgb, var(--live, #e5484d) 9%, var(--field)); }
  .gl-row.cursor { outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: 1px; }
  .gl-row.removed { align-items: center; padding-left: 10px; opacity: 0.75; }
  .gl-go { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; border-radius: 8px 0 0 8px; }
  .wide .gl-go { padding: 10px 12px; }
  .gl-go:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .gl-n { flex: none; width: 20px; padding-top: 1px; text-align: right; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; display: inline-flex; justify-content: flex-end; }
  .gl-row.pinned .gl-n { color: var(--mustard, #f5b301); }
  .gl-text { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
  .gl-text strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wide .gl-text strong { font-size: 15px; }
  .gl-reach { color: var(--muted); font-weight: 500; }
  .gl-text small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gl-snippet { margin-top: 3px; color: color-mix(in srgb, var(--ink) 80%, transparent); font-size: 13px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .gl-act { flex: none; width: 34px; border: 0; background: none; color: var(--muted); display: grid; place-items: center; }
  .gl-act:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .gl-act.on { color: var(--mustard, #f5b301); }
  .gl-act:last-child { border-radius: 0 8px 8px 0; }
  .gl-verses { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 0 4px 40px; flex: none; }
  .gl-verses button { height: 24px; padding: 0 8px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; }
  .gl-verses button:hover { background: var(--field); }
  .gl-verses button.air { border-color: var(--live, #e5484d); color: var(--live, #e5484d); }
  .gl-fold { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; padding: 4px 2px; }
  .gl-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .gl-keys { margin: 0; color: var(--muted); font-size: 12px; flex: none; }
  .gl-keys kbd { display: inline-block; min-width: 18px; padding: 0 4px; margin-right: 2px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; text-align: center; }
</style>
