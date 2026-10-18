<script lang="ts">
  import { untrack } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { session } from "../../app/session.svelte";
  import { cleanFolder, sectionShort, sectionTone, songFolders } from "../../domain/song";
  import { searchSongHits } from "../../domain/song-search";
  import type { Song } from "../../domain/types";
  import FavoriteStar from "../FavoriteStar.svelte";
  import Icon from "../Icon.svelte";

  // Find a song: type part of a title or any line you remember. Lists (favorites, recently used,
  // most sung, this service) and folders narrow it; the chosen song's parts sit beside the
  // results, ready for Preview or the screen. Everything works from the keyboard.
  let {
    onclose,
    onopen,
    clickLive = false,
  }: {
    onclose: () => void;
    /** Open the song on the Songs page. */
    onopen: (songId: string) => void;
    /** The Songs page's Click mode: Live sends a part straight to the screen. */
    clickLive?: boolean;
  } = $props();

  let query = $state("");
  const lists = $derived(session.songLists);
  const folders = $derived(songFolders(session.songs, session.workspace.songFolders));
  /** A list id, or "folder:<name>". Starts on Recently used when there is history. */
  let scope = $state(untrack(() => (session.songLists.find((list) => list.id === "recent")?.songs.length ? "recent" : "all")));
  /** Until a list is picked by hand, typing searches every song (the opening list is only a start). */
  let scopePicked = $state(false);
  const activeScope = $derived(query.trim() && !scopePicked ? "all" : scope);
  let selectedId = $state<string | null>(null);
  let input = $state<HTMLInputElement | undefined>();
  let listEl = $state<HTMLUListElement | undefined>();

  const pool = $derived.by((): Song[] => {
    if (activeScope.startsWith("folder:")) {
      const name = activeScope.slice(7);
      return session.songs.filter((song) => cleanFolder(song.folder) === name);
    }
    return lists.find((list) => list.id === activeScope)?.songs ?? session.songs;
  });
  const scopeEmpty = $derived(lists.find((list) => list.id === activeScope)?.empty ?? "This folder is empty.");

  /** Results: songs in scope, or search hits (one per song, with the line that matched). */
  const results = $derived.by((): Array<{ song: Song; line: string; sectionId: string | null }> => {
    const text = query.trim();
    if (!text) {
      return pool.map((song) => ({ song, line: firstLine(song), sectionId: null }));
    }
    const allowed = new Set(pool.map((song) => song.id));
    const seen = new Set<string>();
    const rows: Array<{ song: Song; line: string; sectionId: string | null }> = [];
    for (const hit of searchSongHits(session.songs, text, 80)) {
      if (!allowed.has(hit.songId) || seen.has(hit.songId)) continue;
      const song = session.songs.find((entry) => entry.id === hit.songId);
      if (!song) continue;
      seen.add(hit.songId);
      rows.push({ song, line: hit.snippet, sectionId: hit.sectionId });
    }
    return rows;
  });

  // Opening with the "/" key can drop that slash into the box; no title starts with one.
  $effect(() => {
    if (query.startsWith("/")) query = query.replace(/^\/+/, "");
  });

  const current = $derived(results.find((row) => row.song.id === selectedId) ?? results[0] ?? null);

  // Keep a choice that is still in the results; otherwise the first.
  $effect(() => {
    const ids = results.map((row) => row.song.id);
    if (!selectedId || !ids.includes(selectedId)) selectedId = ids[0] ?? null;
  });

  function firstLine(song: Song): string {
    return song.sections.flatMap((section) => section.lines).find((line) => line.trim())?.trim() ?? "";
  }

  function move(direction: 1 | -1) {
    if (results.length === 0) return;
    const at = results.findIndex((row) => row.song.id === selectedId);
    const next = Math.min(results.length - 1, Math.max(0, (at < 0 ? 0 : at) + direction));
    selectedId = results[next]!.song.id;
    requestAnimationFrame(() => listEl?.querySelector(".row.on")?.scrollIntoView({ block: "nearest" }));
  }

  function open(song: Song | undefined = current?.song) {
    if (!song) return;
    onopen(song.id);
    onclose();
  }

  async function showPart(song: Song, sectionId: string, live = clickLive) {
    session.previewSongSection(song, sectionId);
    if (live) await session.take();
  }

  /** Start: the matching part (or the first) on Preview, or on the screen in Live mode. */
  async function start(live = clickLive) {
    const row = current;
    const sectionId = row?.sectionId ?? row?.song.sections[0]?.id;
    if (!row || !sectionId) return;
    onopen(row.song.id);
    await showPart(row.song, sectionId, live);
    onclose();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) query = "";
      else onclose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) void start();
      else open();
      return;
    }
    // Keep the desk's own keys (Space for LIVE, arrows to step) out of the typing.
    event.stopPropagation();
  }

  function pickScope(next: string) {
    scope = next;
    scopePicked = true;
    input?.focus();
  }

  const scopes = $derived([
    ...lists.filter((list) => list.id === "all" || list.id === "favorites" || list.id === "recent" || list.songs.length > 0).map((list) => ({ id: list.id as string, label: list.label, icon: list.icon, count: list.songs.length })),
    ...folders.map((entry) => ({ id: `folder:${entry.name}`, label: entry.name, icon: "folder", count: entry.count })),
  ]);
</script>

<div class="finder-layer" transition:fade={{ duration: 120 }}>
  <button type="button" class="finder-backdrop" aria-label="Close song search" onclick={onclose}></button>
  <div class="finder" role="dialog" aria-modal="true" aria-label="Find a song" transition:scale={{ start: 0.98, duration: 140 }}>
    <header class="finder-search">
      <Icon name="search" size={18} />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={input}
        bind:value={query}
        autofocus
        aria-label="Find a song"
        placeholder="Type a title or any line you remember…"
        onkeydown={onKey}
      />
      {#if query}<button type="button" class="clear" aria-label="Clear" onclick={() => { query = ""; input?.focus(); }}><Icon name="close" size={14} /></button>{/if}
      <kbd>esc</kbd>
    </header>

    <nav class="scopes" aria-label="Lists and folders">
      {#each scopes as entry (entry.id)}
        <button type="button" class:on={activeScope === entry.id} aria-pressed={activeScope === entry.id} onclick={() => pickScope(entry.id)}>
          <Icon name={entry.icon} size={13} />{entry.label}<small>{entry.count}</small>
        </button>
      {/each}
    </nav>

    <div class="finder-body">
      <ul class="results" bind:this={listEl} aria-label="Songs found">
        {#each results as row (row.song.id)}
          <li class="row" class:on={row.song.id === current?.song.id}>
            <button type="button" class="row-main" onclick={() => (selectedId = row.song.id)} ondblclick={() => open(row.song)}>
              <strong>{row.song.title || "Untitled song"}</strong>
              <span>{row.line}</span>
            </button>
            <span class="row-end">
              <small>{row.song.sections.length}</small>
              <FavoriteStar on={session.isFavorite("songs", row.song.id)} label={row.song.title} onclick={() => session.toggleFavorite("songs", row.song.id)} size={13} />
            </span>
          </li>
        {:else}
          <li class="none">
            {#if query.trim()}
              No song has “{query.trim()}”{activeScope === "all" ? "" : " in this list"}.
              {#if activeScope !== "all"}<button type="button" class="link" onclick={() => pickScope("all")}>Search all songs</button>{/if}
            {:else}{scopeEmpty}{/if}
          </li>
        {/each}
      </ul>

      <section class="detail" aria-label="Song">
        {#if current}
          {@const song = current.song}
          <header>
            <h3>{song.title || "Untitled song"}</h3>
            <p>{[song.author, `${song.sections.length} part${song.sections.length === 1 ? "" : "s"}`, cleanFolder(song.folder)].filter(Boolean).join(" · ")}</p>
          </header>
          <ol class="parts">
            {#each song.sections as section (section.id)}
              <li class:match={section.id === current.sectionId} style:--tone="var(--sec-{sectionTone(section)})">
                <button type="button" title={clickLive ? "Show on the screen" : "Put on Preview"} onclick={() => void showPart(song, section.id)}>
                  <b>{sectionShort(section)}</b>
                  <span>
                    <em>{section.label}</em>
                    {section.lines.filter((line) => line.trim()).slice(0, 2).join(" / ")}
                  </span>
                  <i>{clickLive ? "Live" : "Preview"}</i>
                </button>
              </li>
            {/each}
          </ol>
          <footer class="detail-actions">
            <button type="button" class="desk-btn" onclick={() => void session.addSongToService(song)}><Icon name="queue" size={14} /> Add to service</button>
            <button type="button" class="desk-btn" onclick={() => open(song)}>Open</button>
            <button type="button" class="desk-btn {clickLive ? 'live' : 'primary-soft'}" onclick={() => void start()}><Icon name="play" size={14} /> {clickLive ? "Show it" : "Start"}</button>
          </footer>
        {:else}
          <p class="detail-empty">Pick a song to see its parts.</p>
        {/if}
      </section>
    </div>

    <footer class="keys">
      <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
      <span><kbd>Enter</kbd> open</span>
      <span><kbd>⇧</kbd><kbd>Enter</kbd> {clickLive ? "show it" : "start on Preview"}</span>
      <span><kbd>esc</kbd> close</span>
    </footer>
  </div>
</div>

<style>
  .finder-layer { position: fixed; inset: 0; z-index: 70; display: grid; place-items: start center; padding: 9vh 16px 16px; }
  .finder-backdrop { position: absolute; inset: 0; border: 0; background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(3px); cursor: default; }
  .finder {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(980px, 100%);
    max-height: min(680px, 84vh);
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .finder-search { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--line); color: var(--muted); }
  .finder-search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 19px; font-weight: 500; outline: none; }
  .finder-search input::placeholder { color: color-mix(in srgb, var(--muted) 80%, transparent); }
  .clear { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: var(--field); color: var(--muted); cursor: pointer; }
  kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; font: inherit; font-size: 11px; color: var(--muted); }

  .scopes { display: flex; gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .scopes button { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .scopes button:hover { color: var(--ink); }
  .scopes button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }
  .scopes small { font-size: 11px; opacity: 0.7; }

  .finder-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
  .results { margin: 0; padding: 8px; list-style: none; overflow: auto; border-right: 1px solid var(--line); }
  .row { display: flex; align-items: center; gap: 4px; border-radius: 10px; }
  .row.on { background: color-mix(in srgb, var(--accent) 14%, var(--field)); box-shadow: inset 3px 0 0 var(--accent); }
  .row:hover:not(.on) { background: var(--field); }
  .row-main { flex: 1; min-width: 0; display: grid; gap: 2px; padding: 9px 10px 9px 14px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .row-main strong { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-main span { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-end { display: flex; align-items: center; gap: 2px; padding-right: 6px; color: var(--muted); font-size: 11px; }
  .none { padding: 28px 16px; color: var(--muted); font-size: 13px; line-height: 1.5; text-align: center; }
  .link { margin-left: 4px; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }

  .detail { display: flex; flex-direction: column; min-height: 0; padding: 16px 18px; gap: 12px; overflow: auto; }
  .detail h3 { margin: 0; font-size: 18px; }
  .detail header p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .parts { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .parts button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-left: 4px solid var(--tone); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .parts button:hover { border-color: color-mix(in srgb, var(--tone) 60%, var(--line)); border-left-color: var(--tone); }
  .parts .match button { box-shadow: 0 0 0 1px var(--accent); }
  .parts b { display: grid; place-items: center; min-width: 30px; height: 24px; padding: 0 6px; border-radius: 6px; background: color-mix(in srgb, var(--tone) 24%, var(--panel)); font-size: 11px; }
  .parts span { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .parts em { display: block; font-style: normal; font-size: 11px; font-weight: 650; color: var(--muted); }
  .parts i { font-style: normal; font-size: 11px; font-weight: 650; color: var(--muted); opacity: 0; }
  .parts button:hover i { opacity: 1; }
  .detail-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-top: auto; padding-top: 6px; }
  .detail-empty { margin: auto; color: var(--muted); font-size: 13px; }

  .keys { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 10px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  .keys kbd { margin-right: 2px; }

  @media (max-width: 760px) {
    .finder-body { grid-template-columns: 1fr; }
    .detail { display: none; }
    .results { border-right: 0; }
  }
</style>
