<script lang="ts">
  import { session } from "../../../app/session.svelte";
  import { wordCount } from "../../../ai/live-notes";
  import type { Sermon } from "../../../domain/types";
  import { t, tn } from "../../../i18n/core";
  import Icon from "../../Icon.svelte";

  // Live notes for one sermon: start them (listening starts too), watch the words come in, accept
  // the AI's clean version every few minutes, edit it, and add it to the sermon's notes after.
  let { sermon, compact = false }: { sermon: Sermon; compact?: boolean } = $props();

  const notes = $derived(session.liveNotes);
  const mine = $derived(notes.sermonId === sermon.id);
  const taking = $derived(mine && notes.active);
  const live = $derived(sermon.live ?? null);
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");
  const canTidy = $derived(session.aiReady && session.aiOn("notes"));
  let editing = $state<string | null>(null);
  let showTranscript = $state(false);
  let copied = $state(false);
  let busy = $state(false);

  // The running time, while notes are being taken.
  let now = $state(Date.now());
  $effect(() => {
    if (!taking) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const elapsed = $derived.by(() => {
    const seconds = Math.max(0, Math.floor((now - notes.startedAt) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });
  const sinceTidy = $derived(notes.lastTidyAt ? Math.max(0, Math.round((now - notes.lastTidyAt) / 60_000)) : 0);

  /** Notes as headings, bullets and paragraphs (the AI writes "## " and "- "). */
  type Block = { kind: "h" | "li" | "p"; text: string };
  function blocks(text: string): Block[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.startsWith("## ") ? { kind: "h", text: line.slice(3) } : line.startsWith("- ") ? { kind: "li", text: line.slice(2) } : { kind: "p", text: line }));
  }

  async function saveEdit() {
    if (editing === null) return;
    busy = true;
    // An edit of the AI's waiting version accepts it; otherwise it replaces the saved notes.
    if (mine && notes.suggestion !== null) await notes.accept(editing);
    else await notes.setNotes(sermon.id, editing);
    editing = null;
    busy = false;
  }

  /** The live notes go into the sermon's own notes, under a heading with the date. */
  async function addToSermon() {
    if (!live?.notes.trim()) return;
    busy = true;
    const day = new Date(live.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const heading = t("Live notes, {date}", { date: day });
    await session.saveSermon({ ...sermon, notes: [sermon.notes.trim(), `${heading}\n${live.notes.trim()}`].filter(Boolean).join("\n\n") });
    busy = false;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<section class="live-notes" class:compact class:taking>
  <header>
    <div class="title">
      <strong><Icon name="mic" size={14} /> {t("Live notes")}</strong>
      {#if taking}
        <span class="badge on"><i></i>{t("Taking notes")} · {elapsed} · {tn(notes.words, "{n} word", "{n} words", { n: notes.words.toLocaleString() })}</span>
      {:else if live}
        <span class="badge">{tn(wordCount(live.transcript), "{n} word heard", "{n} words heard", { n: wordCount(live.transcript).toLocaleString() })}</span>
      {/if}
    </div>
    <div class="actions">
      {#if taking}
        {#if canTidy}<button type="button" class="desk-btn" disabled={notes.tidying} onclick={() => void notes.tidy()}><Icon name="sparkles" size={13} /> {notes.tidying ? t("Tidying…") : t("Tidy now")}</button>{/if}
        <button type="button" class="desk-btn" onclick={() => void notes.stop()}><Icon name="mic-off" size={13} /> {t("Stop notes")}</button>
      {:else}
        <button type="button" class="desk-btn primary" onclick={() => void notes.start(sermon.id)} data-tip={t("Listening starts too. Everything heard is kept with this sermon.")}><Icon name="mic" size={13} /> {live ? t("Continue live notes") : t("Take live notes")}</button>
      {/if}
    </div>
  </header>

  {#if taking && !listening}
    <p class="warn">{t("Listening is off, so nothing is being noted.")} <button type="button" class="link" onclick={() => void session.startVoice()}>{t("Start listening")}</button></p>
  {/if}
  {#if !canTidy && (taking || live)}
    <p class="hint">{session.aiReady ? t("Live sermon notes are switched off in Settings › AI assistant. Words heard are still kept.") : t("Set up the AI to get clean notes every few minutes. Words heard are still kept.")} <button type="button" class="link" onclick={() => session.openSettings("ai")}>{t("AI settings")}</button></p>
  {/if}
  {#if notes.error && mine}<p class="warn" role="alert">{notes.error}</p>{/if}

  {#if taking && notes.recent.length}
    <div class="heard" aria-live="polite">
      {#each notes.recent.slice(compact ? -2 : -3) as line, i (i)}<p>{line}</p>{/each}
    </div>
    {#if canTidy && !notes.suggestion}<p class="hint">{notes.tidying ? t("The AI is tidying the notes…") : t("The AI tidies the notes every few minutes (last {n} min ago).", { n: sinceTidy })}</p>{/if}
  {/if}

  {#if mine && notes.suggestion}
    <div class="suggestion">
      <div class="suggestion-head">
        <strong><Icon name="sparkles" size={13} /> {t("New version of the notes")}</strong>
        <div class="actions">
          <button type="button" class="desk-btn primary" onclick={() => void notes.accept()}>{t("Accept")}</button>
          <button type="button" class="desk-btn" onclick={() => (editing = notes.suggestion)}>{t("Edit first")}</button>
          <button type="button" class="desk-btn" onclick={() => notes.dismiss()}>{t("Dismiss")}</button>
        </div>
      </div>
      <div class="notes-view">{#each blocks(notes.suggestion) as block, i (i)}{#if block.kind === "h"}<h4>{block.text}</h4>{:else if block.kind === "li"}<p class="li">{block.text}</p>{:else}<p>{block.text}</p>{/if}{/each}</div>
    </div>
  {/if}
  {#if taking && canTidy}
    <label class="auto"><input type="checkbox" class="switch" checked={notes.autoAccept} onchange={(event) => notes.setAutoAccept(event.currentTarget.checked)} /> <span>{t("Accept each version by itself")}</span></label>
  {/if}

  {#if editing !== null}
    <textarea class="edit" bind:value={editing} rows={compact ? 8 : 14}></textarea>
    <div class="actions">
      <button type="button" class="desk-btn primary" disabled={busy} onclick={() => void saveEdit()}>{t("Save notes")}</button>
      <button type="button" class="desk-btn" onclick={() => (editing = null)}>{t("Cancel")}</button>
    </div>
  {:else if live?.notes.trim()}
    <div class="notes-view saved">{#each blocks(live.notes) as block, i (i)}{#if block.kind === "h"}<h4>{block.text}</h4>{:else if block.kind === "li"}<p class="li">{block.text}</p>{:else}<p>{block.text}</p>{/if}{/each}</div>
    <div class="actions">
      <button type="button" class="desk-btn" onclick={() => (editing = live.notes)}><Icon name="pencil" size={13} /> {t("Edit")}</button>
      <button type="button" class="desk-btn" onclick={() => void copy(live.notes)}><Icon name="copy" size={13} /> {copied ? t("Copied") : t("Copy")}</button>
      {#if !taking}<button type="button" class="desk-btn" disabled={busy} data-tip={t("Add these notes to the sermon's own notes, under today's date")} onclick={() => void addToSermon()}>{t("Add to sermon notes")}</button>{/if}
    </div>
  {:else if !taking && !live}
    <p class="hint">{t("While the pastor preaches, everything heard is kept here, and your AI turns it into clean notes every few minutes, putting misheard words right. You accept each version.")}</p>
  {/if}

  {#if live?.transcript.trim() && !compact}
    <button type="button" class="link" onclick={() => (showTranscript = !showTranscript)}>{showTranscript ? t("Hide what was heard") : t("Show everything heard")}</button>
    {#if showTranscript}<pre class="transcript">{live.transcript}</pre>{/if}
  {/if}
</section>

<style>
  .live-notes { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--panel) 92%, transparent); }
  .live-notes.taking { border-color: color-mix(in srgb, var(--onair, #f21b1b) 45%, var(--line)); }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .title strong { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 99px; background: color-mix(in srgb, currentColor 8%, transparent); color: var(--muted); font-size: 11.5px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .badge.on { color: var(--ink); background: color-mix(in srgb, var(--onair, #f21b1b) 16%, transparent); }
  .badge.on i { width: 7px; height: 7px; border-radius: 50%; background: var(--onair, #f21b1b); animation: blink 1.4s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .actions :global(svg) { vertical-align: -2px; }
  .heard { display: grid; gap: 2px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, currentColor 5%, transparent); }
  .heard p { margin: 0; color: var(--muted); font-size: 12.5px; font-style: italic; line-height: 1.4; }
  .heard p:last-child { color: var(--ink); }
  .hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .warn { margin: 0; color: var(--danger, #ff6b6b); font-size: 12.5px; }
  .suggestion { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid color-mix(in srgb, #7c3aed 50%, var(--line)); border-radius: 12px; background: color-mix(in srgb, #7c3aed 7%, transparent); }
  .suggestion-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
  .suggestion-head strong { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
  .suggestion-head :global(svg) { color: #7c3aed; }
  .notes-view { display: grid; gap: 4px; max-height: 360px; overflow: auto; font-size: 13.5px; line-height: 1.5; }
  .compact .notes-view { max-height: 220px; }
  .notes-view h4 { margin: 8px 0 0; font-size: 13.5px; font-weight: 750; }
  .notes-view h4:first-child { margin-top: 0; }
  .notes-view p { margin: 0; }
  .notes-view .li { padding-left: 14px; position: relative; }
  .notes-view .li::before { content: "•"; position: absolute; left: 2px; color: var(--muted); }
  .auto { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
  .edit { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--field, transparent); color: var(--ink); font: 13px/1.5 var(--font-ui, inherit); resize: vertical; }
  .link { justify-self: start; border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; }
  .transcript { margin: 0; max-height: 260px; overflow: auto; padding: 10px; border-radius: 10px; background: color-mix(in srgb, currentColor 5%, transparent); font: 12px/1.5 var(--font-ui, inherit); white-space: pre-wrap; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) { .badge.on i { animation: none; } }
</style>
