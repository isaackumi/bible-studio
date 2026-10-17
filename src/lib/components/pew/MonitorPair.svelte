<script lang="ts">
  import { session } from "../../app/session.svelte";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";
  import VideoControls from "../VideoControls.svelte";
  import type { PewPage } from "../../domain/types";

  // Framed Preview and Program monitors for the Songs and Sermon windows.
  // Each page chooses which monitors it shows (View menu); Program keeps running when hidden.
  let { page, place = "", onstep }: { page: PewPage; place?: string; onstep?: (direction: 1 | -1) => void } = $props();
  const shown = $derived(session.workspace.pew.monitors[page]);

  const programSet = $derived(session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  /** On air only when the audience window is open to see it. */
  const programLive = $derived(programSet && session.output.online);
</script>

{#if shown.preview}
<figure class="screen preview">
  <figcaption>
    <span class="kicker">Preview</span>
    <span class="place">{place || (session.live.preview.model.layout === "empty" ? "Nothing staged on this page yet" : "")}</span>
    {#if onstep}
      <span class="steps">
        <button type="button" class="row-tool" aria-label="Previous section" title="Previous section" onclick={() => onstep(-1)}><Icon name="chevron-left" size={14} /></button>
        <button type="button" class="row-tool" aria-label="Next section" title="Next section" onclick={() => onstep(1)}><Icon name="chevron-right" size={14} /></button>
      </span>
    {/if}
  </figcaption>
  <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
</figure>
{/if}
{#if shown.program}
<figure class="screen program" class:on-air={programLive}>
  <figcaption>
    <span class="kicker">{#if programLive}<span class="dot"></span>{/if}Program</span>
    <span class="place" class:warn={programSet && !programLive}>{programLive ? "Audience sees this" : programSet ? "Audience window closed" : "Nothing live"}</span>
    {#if session.deckLoop}
      <button type="button" class="loop-chip" title="Stop the loop; Program stays on this page" onclick={() => session.stopDeckLoop()}><Icon name="refresh" size={12} /> Looping · Stop</button>
    {/if}
  </figcaption>
  <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
  <VideoControls />
</figure>
{/if}

<style>
  .screen {
    margin: 0;
    flex: none;
    border: 1px solid color-mix(in srgb, var(--ink) 22%, var(--line));
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    overflow: hidden;
  }
  figcaption { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 4px 6px 4px 10px; border-bottom: 1px solid var(--line); }
  .kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .place { flex: 1; min-width: 0; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .preview .kicker { color: var(--accent); }
  .program { border-color: color-mix(in srgb, var(--live) 45%, var(--line)); }
  .program .kicker { color: var(--live); }
  .program.on-air { border-color: var(--live); box-shadow: 0 0 0 1px var(--live), 0 0 18px color-mix(in srgb, var(--live) 25%, transparent); }
  .place.warn { color: #f5a524; font-weight: 600; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--live); box-shadow: 0 0 6px var(--live); }
  .steps { display: flex; gap: 2px; }
  .row-tool { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .row-tool:hover { background: var(--panel); color: var(--ink); }
  .monitor { container-type: inline-size; background: #000; }
  .loop-chip { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 24px; padding: 0 9px; border: 1px solid color-mix(in srgb, var(--live) 50%, var(--line)); border-radius: 999px; background: color-mix(in srgb, var(--live) 12%, transparent); color: var(--live); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
</style>
