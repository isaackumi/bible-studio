<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { songSelectUrl, wordsAreFree, type SongMatch } from "../../ai/songs";
  import { aiReady } from "../../ai/summarize";
  import type { Song } from "../../domain/types";
  import { t } from "../../i18n/core";
  import { openExternal } from "../../platform/runtime";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";

  // Look up a song with AI: a title, a line remembered or what the song is about, and the AI names
  // the songs it may be. Old hymns in the public domain can have their words written out (to check
  // and save); every other song comes from SongSelect under the church's CCLI license, as a file.
  let {
    query: asked = "",
    onclose,
    folder = "",
    onwords,
    onopen,
    onimport,
  }: {
    /** Look this up straight away (a song suggested for a sermon). */
    query?: string;
    onclose: () => void;
    /** The library folder new songs go into. */
    folder?: string;
    /** A hymn's words, as a new song to check and save. */
    onwords: (song: Song) => void;
    /** A song the church already has. */
    onopen: (song: Song) => void;
    /** Import a file downloaded from SongSelect. */
    onimport: () => void;
  } = $props();

  let query = $state(untrack(() => asked));
  let busy = $state(false);
  let error = $state("");
  let matches = $state<SongMatch[] | null>(null);
  /** The song whose words are being written. */
  let writing = $state<string | null>(null);
  const ready = $derived(aiReady(session.workspace.ai));

  const key = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  function owned(match: SongMatch): Song | undefined {
    return session.songs.find((song) => (match.ccli && song.ccli === match.ccli) || key(song.title) === key(match.title));
  }

  async function find() {
    busy = true;
    error = "";
    try {
      matches = await session.findSongsWithAi(query);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
      matches = null;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (query.trim() && ready) void find();
  });

  async function words(match: SongMatch) {
    writing = match.title;
    error = "";
    try {
      onwords(await session.hymnWithAi(match, folder));
      onclose();
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
    } finally {
      writing = null;
    }
  }
</script>

<DeskDialog title={t("Look up a song with AI")} wide {onclose}>
  {#if !ready}
    <div class="setup">
      <Icon name="sparkles" size={22} />
      <p>{t("Songs are looked up by your own AI: Claude, ChatGPT, Gemini, or an AI on this computer. Set it up once.")}</p>
      <button type="button" class="primary" onclick={() => { session.openSettings("ai"); onclose(); }}>{t("Set up the AI assistant")}</button>
    </div>
  {:else}
    <form class="ask" onsubmit={(event) => { event.preventDefault(); void find(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input autofocus aria-label={t("Song to look up")} placeholder={t("A title, a line you remember, or what the song is about")} bind:value={query} />
      <button type="submit" class="primary" disabled={busy || !query.trim()}><Icon name="sparkles" size={14} /> {busy ? t("Looking…") : t("Look up")}</button>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if matches}
      <ul class="matches">
        {#each matches as match (match.title + match.authors)}
          {@const mine = owned(match)}
          {@const free = wordsAreFree(match)}
          <li>
            <div class="what">
              <strong>{match.title}</strong>
              <span class="by">{[match.authors, match.year ? String(match.year) : ""].filter(Boolean).join(" · ")}</span>
              {#if match.firstLine}<span class="line">“{match.firstLine}”</span>{/if}
              <span class="tags">
                {#if mine}<span class="tag have">{t("In your library")}</span>{/if}
                {#if free}<span class="tag free">{t("Public domain")}</span>{:else}<span class="tag">{match.ccli ? t("CCLI {number}", { number: match.ccli }) : t("Under copyright")}</span>{/if}
              </span>
            </div>
            <div class="acts">
              {#if mine}
                <button type="button" class="btn" onclick={() => { onopen(mine); onclose(); }}>{t("Open")}</button>
              {:else if free}
                <button type="button" class="primary" disabled={writing !== null} onclick={() => void words(match)}>{writing === match.title ? t("Writing…") : t("Add the words")}</button>
              {:else}
                <button type="button" class="btn" onclick={() => void openExternal(songSelectUrl(match)).catch(() => {})}><Icon name="globe" size={13} /> {t("Open in SongSelect")}</button>
                <button type="button" class="btn" onclick={() => { onimport(); onclose(); }}>{t("Import the file")}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      <p class="hint">{t("Old hymns in the public domain: the AI writes the words for you to check. Other songs: download them from SongSelect with your CCLI license, then import the file.")}</p>
    {:else}
      <p class="hint">{t("For songs you don't have yet. The AI names the song, its writers and its CCLI number, and can be wrong: check before Sunday.")}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <span class="grow"></span>
    <button type="button" class="btn" onclick={onclose}>{t("Close")}</button>
  {/snippet}
</DeskDialog>

<style>
  .setup { display: grid; gap: 14px; justify-items: start; }
  .setup :global(svg) { color: var(--accent); }
  .setup p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); max-width: 520px; }
  .ask { display: flex; gap: 8px; }
  .ask input { flex: 1; min-width: 0; padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; }
  .matches { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
  .matches li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .what { display: grid; gap: 3px; min-width: 0; }
  .what strong { font-size: 14px; }
  .by, .line { font-size: 12px; color: var(--muted); }
  .line { font-style: italic; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .tag { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); }
  .tag.free { background: color-mix(in srgb, var(--presence, #3fb950) 18%, transparent); color: var(--presence, #3fb950); }
  .tag.have { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; flex: none; }
  .hint { margin: 12px 0 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
  .error { margin: 10px 0 0; font-size: 13px; color: #e5484d; }
  .grow { flex: 1; }
  .primary { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .primary:disabled { opacity: 0.5; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  @media (max-width: 560px) {
    .matches li { flex-direction: column; align-items: stretch; }
    .acts { justify-content: flex-start; }
  }
</style>
