<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../../app/session.svelte";
  import { songSelectUrl } from "../../../ai/songs";
  import { aiReady } from "../../../ai/summarize";
  import type { Song } from "../../../domain/types";
  import { t } from "../../../i18n/core";
  import { openExternal } from "../../../platform/runtime";
  import DeskDialog from "../../sources/DeskDialog.svelte";
  import Icon from "../../Icon.svelte";

  // Songs for this sermon: the AI reads the sermon and picks from the church's own songs first,
  // then names a few it could add. Nothing goes into the service until the operator adds it.
  let { title, notes, onclose }: { title: string; notes: string; onclose: () => void } = $props();

  type Picks = Awaited<ReturnType<typeof session.suggestSongsWithAi>>;
  let busy = $state(false);
  let error = $state("");
  let picks = $state<Picks | null>(null);
  /** Songs added to the service from here, so their button says so. */
  let added = $state<string[]>([]);
  const ready = $derived(aiReady(session.workspace.ai));

  async function suggest() {
    busy = true;
    error = "";
    try {
      picks = await session.suggestSongsWithAi({ title, notes });
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
      picks = null;
    } finally {
      busy = false;
    }
  }

  function add(song: Song) {
    session.addSongToService(song);
    added = [...added, song.id];
  }

  onMount(() => {
    if (ready) void suggest();
  });
</script>

<DeskDialog title={t("Songs for this sermon")} wide {onclose}>
  {#if !ready}
    <div class="setup">
      <Icon name="sparkles" size={22} />
      <p>{t("Songs are suggested by your own AI: Claude, ChatGPT, Gemini, or an AI on this computer. Set it up once.")}</p>
      <button type="button" class="primary" onclick={() => { session.openSettings("ai"); onclose(); }}>{t("Set up the AI assistant")}</button>
    </div>
  {:else if busy}
    <p class="wait"><Icon name="sparkles" size={16} /> {t("Reading the sermon and your songs…")}</p>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {:else if picks}
    <h3>{t("From your songs")}</h3>
    {#if picks.library.length}
      <ul class="picks">
        {#each picks.library as pick (pick.song.id)}
          <li>
            <div class="what"><strong>{pick.song.title}</strong>{#if pick.song.author}<span class="by">{pick.song.author}</span>{/if}{#if pick.why}<span class="why">{pick.why}</span>{/if}</div>
            <div class="acts">
              {#if session.service}
                <button type="button" class="btn" disabled={added.includes(pick.song.id)} onclick={() => add(pick.song)}>{added.includes(pick.song.id) ? t("Added") : t("Add to service")}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">{session.songs.length ? t("None of your songs fit this sermon closely.") : t("Your song library is empty, so these are all songs to add.")}</p>
    {/if}
    {#if picks.others.length}
      <h3>{t("Songs you could add")}</h3>
      <ul class="picks">
        {#each picks.others as other (other.title)}
          <li>
            <div class="what"><strong>{other.title}</strong>{#if other.authors}<span class="by">{other.authors}</span>{/if}{#if other.why}<span class="why">{other.why}</span>{/if}</div>
            <div class="acts">
              {#if session.aiOn("songLookup")}<button type="button" class="btn" onclick={() => { session.lookUpSongWithAi(other.title + (other.authors ? `, ${other.authors}` : "")); onclose(); }}><Icon name="sparkles" size={13} /> {t("Look up")}</button>{/if}
              <button type="button" class="btn" onclick={() => void openExternal(songSelectUrl({ title: other.title, ccli: "" })).catch(() => {})}><Icon name="globe" size={13} /> {t("SongSelect")}</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    {#if !session.service && picks.library.length}<p class="hint">{t("Open or make a service to add songs to it.")}</p>{/if}
    <p class="hint">{t("The AI can be wrong. Read the words of each song before choosing it.")}</p>
  {/if}

  {#snippet footer()}
    {#if ready && !busy}<button type="button" class="btn" onclick={() => void suggest()}>{t("Suggest again")}</button>{/if}
    <span class="grow"></span>
    <button type="button" class="primary" onclick={onclose}>{t("Done")}</button>
  {/snippet}
</DeskDialog>

<style>
  .setup { display: grid; gap: 14px; justify-items: start; }
  .setup :global(svg), .wait :global(svg) { color: var(--accent-text); }
  .setup p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); max-width: 520px; }
  .wait { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; color: var(--muted); }
  h3 { margin: 4px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  h3 + .hint { margin-top: 0; }
  .picks { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 8px; }
  .picks li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .what { display: grid; gap: 3px; min-width: 0; }
  .what strong { font-size: 14px; }
  .by { font-size: 12px; color: var(--muted); }
  .why { font-size: 12px; color: var(--ink); opacity: 0.8; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; flex: none; }
  .hint { margin: 8px 0 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
  .error { margin: 0; font-size: 13px; color: #e5484d; }
  .grow { flex: 1; }
  .primary { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  .btn:disabled { opacity: 0.6; cursor: default; }
  @media (max-width: 560px) {
    .picks li { flex-direction: column; align-items: stretch; }
    .acts { justify-content: flex-start; }
  }
</style>
