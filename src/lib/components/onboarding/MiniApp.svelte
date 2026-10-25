<script lang="ts">
  import type { PresentationModel } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";
  import { t } from "../../i18n/core";

  // The whole desk in miniature, laid out like the real Presenter Desk (top bar, transcript,
  // Bible, reading, Preview, Program, queue) and drawn at full size then scaled down, so setup
  // shows the app as it is. Each step picks out the parts it changes; the rest dims.
  export type Zone = "bar" | "audience" | "live" | "transcript" | "bible" | "reading" | "preview" | "program" | "queue";

  let {
    preview,
    program,
    onAir = false,
    mode = "Scriptures",
    reference = "",
    desk = "pewbeam",
    focus = [],
    verses = [],
    passage = "John 3",
    translation = "KJV",
  }: {
    preview: PresentationModel;
    program: PresentationModel;
    onAir?: boolean;
    mode?: string;
    reference?: string;
    desk?: import("../../domain/types").DeskStyle;
    /** The parts this step is about; empty shows the whole desk evenly. */
    focus?: Zone[];
    /** The verse list in the Bible pane: [verse, text]. */
    verses?: Array<[number, string]>;
    passage?: string;
    translation?: string;
  } = $props();

  const W = 1280;
  const H = 760;
  let width = $state(0);
  const scale = $derived(width ? width / W : 0.5);
  const production = $derived(desk === "obs");
  const lit = (zone: Zone) => focus.includes(zone);
  const dim = (zone: Zone) => focus.length > 0 && !focus.includes(zone);
  const PAGES = ["Scriptures", "Songs", "Sermon", "Service"];
  const STUDIO = ["Studio", "Looks"];
</script>

<div class="mini-app" bind:clientWidth={width} style:height="{H * scale}px" aria-hidden="true">
  <div class="canvas" style:width="{W}px" style:height="{H}px" style:transform="scale({scale})">
    <header class="bar zone" class:lit={lit("bar")} class:dim={dim("bar")}>
      <span class="desk-btn" class:on={!production}><Icon name="pew" size={15} />{t("Presenter")}</span>
      <span class="desk-btn" class:on={production}><Icon name="obs" size={15} />{t("Production")}</span>
      <span class="pages">
        {#each production ? STUDIO : PAGES as page (page)}<span class:on={production ? page === "Studio" : mode === page}>{t(page)}</span>{/each}
      </span>
      <span class="grow"></span>
      <span class="aud zone" class:lit={lit("audience")} class:dim={dim("audience") && !lit("bar")}><i class:on={onAir}></i>{t("Audience")}</span>
      <span class="live zone" class:on-air={onAir} class:lit={lit("live")} class:dim={dim("live") && !lit("bar")}><i></i>{onAir ? t("ON AIR") : t("LIVE")}</span>
      <span class="plain">{t("BLACK")}</span>
      <span class="plain ghost">{t("CLEAR WORDS")}</span>
      <span class="plain ghost">{t("CLEAR")}</span>
    </header>

    <div class="body">
      <div class="left">
        <div class="pair">
          <section class="card zone" class:lit={lit("transcript")} class:dim={dim("transcript")}>
            <h4>{t("Live transcript")}</h4>
            <p class="soft">“…turn with me to John chapter three, verse sixteen…”</p>
            <footer class="tools"><span class="green"><Icon name="mic" size={13} />{t("Listen")}</span><span class="green"><Icon name="search" size={13} />{t("Find")}</span></footer>
          </section>
          <section class="card zone" class:dim={focus.length > 0}>
            <h4><span class="tab on">{t("Gone live")}</span><span class="tab">{t("Detections")}</span></h4>
            <ul class="gone"><li><b>Genesis 1:3</b><span>9:42</span></li><li><b>{passage}:16</b><span>9:58</span></li></ul>
          </section>
        </div>
        <section class="card bible zone" class:lit={lit("bible")} class:dim={dim("bible")}>
          <div class="bible-tools"><span class="pill">{translation}</span><span class="search"><Icon name="search" size={13} />{passage}:16</span><span class="grow"></span><span class="ico"><Icon name="chevron-left" size={13} /></span><span class="ico"><Icon name="chevron-right" size={13} /></span></div>
          <ol class="verses">
            {#each verses as [n, text] (n)}<li class:on={n === 16}><b>{n}</b><span>{text}</span></li>{/each}
          </ol>
        </section>
      </div>

      <div class="mid">
        <section class="card zone" class:lit={lit("reading")} class:dim={dim("reading")}>
          <h4>{t("Scripture reading")}</h4>
          {#each verses.filter(([n]) => n >= 16 && n <= 17) as [n, text] (n)}<p class="read"><sup>{n}</sup>{text}</p>{/each}
        </section>
        <section class="card mon zone" class:lit={lit("preview")} class:dim={dim("preview")}>
          <h4 class="cap preview">{t("Preview")}<span>{reference}</span></h4>
          <div class="glass"><Screen model={preview} /></div>
        </section>
      </div>

      <div class="right">
        <section class="card mon program zone" class:on-air={onAir} class:lit={lit("program")} class:dim={dim("program")}>
          <h4 class="cap program">{#if onAir}<b class="dot"></b>{/if}{t("Program")}<span>{program.layout === "empty" ? t("Nothing live") : t("Audience sees this")}</span></h4>
          <div class="glass"><Screen model={program} /></div>
        </section>
        <section class="card zone" class:lit={lit("queue")} class:dim={dim("queue")}>
          <h4>{t("Queue")}</h4>
          <ul class="queue"><li>{passage}:16–17</li><li>Romans 5:8</li><li>Ephesians 2:8</li></ul>
        </section>
      </div>
    </div>
  </div>
</div>

<style>
  .mini-app {
    position: relative;
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 12px;
    background: var(--desk);
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }
  .canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; display: flex; flex-direction: column; font-family: var(--font-ui); color: var(--ink); }
  .zone { transition: opacity 360ms ease, box-shadow 360ms ease, filter 360ms ease; }
  .zone.dim { opacity: 0.32; filter: saturate(0.5); }
  .zone.lit { box-shadow: 0 0 0 3px var(--accent), 0 0 46px color-mix(in srgb, var(--accent) 38%, transparent); }

  .bar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 650; white-space: nowrap; }
  .desk-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--muted); }
  .desk-btn.on { border-color: var(--accent); color: var(--ink); }
  .desk-btn.on :global(svg) { color: var(--accent-text); }
  .pages { display: flex; gap: 2px; margin-left: 8px; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); }
  .pages span { padding: 7px 14px; border-radius: 6px; color: var(--muted); font-size: 15px; }
  .pages span.on { background: var(--accent); color: var(--on-accent); }
  .grow { flex: 1; }
  .aud, .live, .plain { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 8px; letter-spacing: 0.05em; font-size: 13px; }
  .aud { border: 1px solid var(--line); background: var(--field); color: var(--muted); letter-spacing: 0; }
  .aud i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
  .aud i.on { background: var(--presence, #3fb950); box-shadow: 0 0 8px var(--presence, #3fb950); }
  .live { background: var(--live); color: #fff; font-weight: 800; }
  .live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; }
  .live.on-air { background: #ff1414; }
  .plain { border: 1px solid var(--line); background: var(--field); font-weight: 800; }
  .plain.ghost { border-color: transparent; background: none; color: var(--muted); }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 500px minmax(0, 1fr) 360px; gap: 10px; padding: 10px; }
  .left, .mid, .right { display: grid; gap: 10px; min-height: 0; }
  .left { grid-template-rows: 250px minmax(0, 1fr); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 0; }
  .mid { grid-template-rows: minmax(0, 1fr) auto; }
  .right { grid-template-rows: auto minmax(0, 1fr); align-content: start; }
  .card { position: relative; display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
  h4 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; font-weight: 650; }
  .tab { padding: 5px 10px; border-radius: 7px; color: var(--muted); }
  .tab.on { background: var(--field); color: var(--ink); }
  .soft { margin: 0; font-size: 15px; line-height: 1.5; color: var(--muted); }
  .tools { display: flex; justify-content: space-between; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; font-weight: 700; }
  .green { display: inline-flex; align-items: center; gap: 6px; color: var(--presence, #3fb950); }
  .gone { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13px; }
  .gone li { display: flex; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; }
  .gone span { color: var(--muted); }
  .bible-tools { display: flex; align-items: center; gap: 6px; }
  .pill, .search, .ico { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); font-size: 14px; font-weight: 600; }
  .search { min-width: 200px; }
  .ico { padding: 0 9px; color: var(--muted); }
  .verses { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .verses li { display: flex; gap: 14px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; white-space: nowrap; overflow: hidden; }
  .verses li span { overflow: hidden; text-overflow: ellipsis; }
  .verses b { min-width: 20px; color: var(--accent-text); }
  .verses li.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .read { margin: 0; font-size: 15px; line-height: 1.55; }
  .read sup { margin-right: 4px; color: var(--accent-text); }
  .mon { padding: 0; gap: 0; }
  .cap { height: 34px; padding: 0 12px; border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .cap span { margin-left: auto; font-weight: 600; letter-spacing: 0; text-transform: none; }
  .cap.preview { color: var(--accent-text); }
  .cap.program { color: var(--live); }
  .program { border-color: color-mix(in srgb, var(--live) 45%, var(--line)); }
  .program.on-air { border-color: var(--live); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--live); box-shadow: 0 0 8px var(--live); }
  .glass { container-type: inline-size; background: #000; }
  .queue { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 14px; }
  .queue li { padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; }
  @media (prefers-reduced-motion: reduce) { .zone { transition: none; } }
</style>
