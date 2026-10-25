<script lang="ts">
  import { session } from "../app/session.svelte";
  import type { SongHit } from "../domain/song-search";
  import { t } from "../i18n/core";

  let field: HTMLInputElement | null = $state(null);
  let selected = $state(0);

  $effect(() => {
    if (!session.findOpen) return;
    selected = 0;
    queueMicrotask(() => field?.focus());
  });

  $effect(() => {
    session.findHits;
    selected = 0;
  });

  function pick(hit: SongHit) {
    session.previewSongHit(hit);
  }

  function onKey(event: KeyboardEvent) {
    const hits = session.findHits;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = hits.length === 0 ? 0 : (selected + 1) % hits.length;
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = hits.length === 0 ? 0 : (selected - 1 + hits.length) % hits.length;
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[selected];
      if (hit) pick(hit);
    }
  }
</script>

{#if session.findOpen}
  <div class="scrim">
    <button type="button" class="backdrop" aria-label={t("Close song search")} onclick={() => session.closeFind()}></button>
    <div
      class="finder"
      role="dialog"
      aria-label={t("Search songs")}
      aria-modal="true"
      tabindex="-1"
    >
      <input
        bind:this={field}
        aria-label={t("Search songs")}
        placeholder={t("Title, author, or lyric")}
        value={session.findQuery}
        oninput={(event) => void session.searchFind(event.currentTarget.value)}
        onkeydown={onKey}
      />
      <p class="hint">{t("A match is Preview only. LIVE still sends Program.")}</p>
      {#if session.findHits.length === 0}
        <p class="empty">{session.findQuery.trim() ? t("No songs match.") : t("Recent songs appear here after you preview one.")}</p>
      {:else}
        <ul>
          {#each session.findHits as hit, index (`${hit.songId}:${hit.sectionId}`)}
            <li class:on={index === selected}>
              <button type="button" onclick={() => pick(hit)}>
                <strong>{hit.title}</strong>
                <span>{hit.label}{hit.author ? ` · ${hit.author}` : ""}</span>
                <span class="snip">{hit.snippet}</span>
              </button>
              <button type="button" class="queue" onclick={() => void session.queueSongHit(hit)}>{t("Queue")}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 8;
    display: flex;
    justify-content: center;
    padding: 12vh 16px 16px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: color-mix(in srgb, #050505 45%, transparent);
  }
  .finder {
    position: relative;
    width: min(560px, 100%);
    max-height: min(70vh, 640px);
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  input {
    width: 100%;
    height: var(--control-h, 36px);
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
  }
  .hint, .empty { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; gap: 8px; }
  li.on button:first-child { border-color: var(--accent); }
  li button:first-child {
    flex: 1;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li span { color: var(--muted); font-size: 12px; }
  .snip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .queue {
    height: 32px;
    align-self: center;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent-text);
    padding: 0 12px;
  }
</style>
