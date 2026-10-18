<script lang="ts">
  import type { PresentationModel } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";

  // A working miniature of the Presenter Desk: the real top bar styles and the real slide
  // renderer for Preview and Program, so setup shows the app it is setting up.
  let {
    preview,
    program,
    onAir = false,
    mode = "Scriptures",
    reference = "",
    heard = "",
    desk = "pewbeam",
  }: {
    preview: PresentationModel;
    program: PresentationModel;
    onAir?: boolean;
    mode?: string;
    reference?: string;
    heard?: string;
    /** Which desk the miniature is: the Presenter Desk, or the Production Desk once cameras are in. */
    desk?: "pewbeam" | "obs";
  } = $props();
  const production = $derived(desk === "obs");
</script>

<div class="window" aria-hidden="true">
  <div class="titlebar">
    <span class="lights"><i></i><i></i><i></i></span>
    <span class="wtitle">Church Studio</span>
  </div>
  <div class="bar">
    <span class="desk-icons"><span class="ic" class:on={!production}><Icon name="pew" size={13} /></span><span class="ic" class:on={production}><Icon name="obs" size={13} /></span></span>
    <span class="modes">
      {#each production ? ["Studio", "Looks"] : ["Scriptures", "Songs", "Sermon"] as name (name)}<span class:on={production ? name === "Studio" : mode === name}>{name}</span>{/each}
    </span>
    <span class="grow"></span>
    <span class="aud"><i class:on={onAir}></i>Audience</span>
    <span class="live" class:on-air={onAir}><i></i>{onAir ? "ON AIR" : production ? "GO LIVE" : "LIVE"}</span>
    <span class="plain">BLACK</span>
    <span class="plain ghost">CLEAR</span>
  </div>
  <div class="monitors">
    <figure class="mon preview">
      <figcaption>Preview{#if reference}<span>{reference}</span>{/if}</figcaption>
      <div class="glass"><Screen model={preview} /></div>
    </figure>
    <figure class="mon program" class:on-air={onAir}>
      <figcaption>{#if onAir}<b class="md-dot"></b>{/if}Program<span>{onAir ? "Audience sees this" : "Nothing live"}</span></figcaption>
      <div class="glass"><Screen model={program} /></div>
    </figure>
  </div>
  {#if heard}
    <div class="heard"><Icon name="mic" size={14} />“{heard}”</div>
  {/if}
</div>

<style>
  .window {
    position: relative;
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 14px;
    background: var(--desk);
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    font-family: var(--font-ui);
    color: var(--ink);
    pointer-events: none;
    user-select: none;
    container-type: inline-size;
  }
  /* A small panel keeps the parts that explain the desk: the pages, LIVE and the two monitors. */
  @container (max-width: 560px) {
    .aud, .plain.ghost, .desk-icons { display: none; }
  }
  @container (max-width: 420px) {
    .plain, .modes span:not(.on) { display: none; }
  }
  .titlebar { position: relative; display: flex; align-items: center; height: 30px; padding: 0 12px; background: color-mix(in srgb, var(--panel) 80%, var(--desk)); border-bottom: 1px solid var(--line); }
  .lights { display: flex; gap: 6px; }
  .lights i { width: 10px; height: 10px; border-radius: 50%; background: #ff5f57; }
  .lights i:nth-child(2) { background: #febc2e; }
  .lights i:nth-child(3) { background: #28c840; }
  .wtitle { position: absolute; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: 600; color: var(--muted); }

  .bar { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 10px; font-weight: 650; white-space: nowrap; overflow: hidden; }
  .desk-icons { display: flex; gap: 3px; }
  .ic { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--muted); }
  .ic.on { color: var(--accent); border-color: var(--accent); }
  .modes { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); }
  .modes span { padding: 3px 8px; border-radius: 5px; color: var(--muted); font-size: 10px; }
  .modes span.on { background: var(--accent); color: var(--on-accent); }
  .grow { flex: 1; }
  .aud { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--muted); }
  .aud i { width: 5px; height: 5px; border-radius: 50%; background: var(--line); }
  .aud i.on { background: var(--presence, #3fb950); box-shadow: 0 0 6px var(--presence, #3fb950); }
  .live, .plain { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 6px; letter-spacing: 0.06em; }
  .live { background: var(--live); color: #fff; }
  .live i { width: 5px; height: 5px; border-radius: 50%; background: #fff; }
  .live.on-air { background: #ff1414; animation: glow 1.4s ease-in-out infinite; }
  .live.on-air i { animation: blink 1s steps(1, end) infinite; }
  .plain { border: 1px solid var(--line); background: var(--field); color: var(--ink); }
  .plain.ghost { border-color: var(--accent); background: transparent; color: var(--accent); }

  .monitors { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; padding: 10px; }
  .mon { margin: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; }
  .mon figcaption { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border-bottom: 1px solid var(--line); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .mon figcaption span { margin-left: auto; font-weight: 600; letter-spacing: 0; text-transform: none; }
  .mon.preview figcaption { color: var(--accent); }
  .mon.program { border-color: color-mix(in srgb, var(--live) 40%, var(--line)); }
  .mon.program figcaption { color: var(--live); }
  .mon.program.on-air { border-color: var(--live); animation: beam 1.8s ease-in-out infinite; }
  .md-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--live); box-shadow: 0 0 6px var(--live); }
  .glass { container-type: inline-size; background: #000; }

  .heard {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--line));
    border-radius: 999px;
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .heard :global(svg) { color: var(--accent); }

  @keyframes glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 20, 20, 0.5); }
    50% { box-shadow: 0 0 14px 3px rgba(255, 20, 20, 0.55); }
  }
  @keyframes blink { 50% { opacity: 0.25; } }
  @keyframes beam {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 16px 0 color-mix(in srgb, var(--live) 45%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .live.on-air, .live.on-air i, .mon.program.on-air { animation: none; }
  }
</style>
