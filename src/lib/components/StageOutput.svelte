<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { readStageLocal, subscribeStageLocal, parseStage, type StageSnapshot } from "../display/channel";
  import { timerDisplay, timerFromPaint } from "../domain/timer";
  import type { PresentationModel } from "../domain/types";
  import { isDesktop } from "../platform/runtime";

  // Confidence monitor for the platform: Program now (large), Preview as next, a clock and any timer.
  let snapshot = $state<StageSnapshot | null>(null);
  let now = $state(Date.now());

  onMount(() => {
    snapshot = readStageLocal();
    const tick = setInterval(() => (now = Date.now()), 500);
    const stop = subscribeStageLocal((next) => (snapshot = next));
    let unlisten = () => {};
    if (isDesktop()) {
      void listen<string>("stage-frame", (event) => {
        const next = parseStage(event.payload);
        if (next) snapshot = next;
      }).then((stopListening) => (unlisten = stopListening));
    }
    return () => {
      clearInterval(tick);
      stop();
      unlisten();
    };
  });

  function lines(model: PresentationModel | undefined): string[] {
    if (!model) return [];
    if (model.layout === "timer" && model.timer) return [timerDisplay(timerFromPaint(model.timer), now).text];
    if (model.layout === "composition") {
      return (model.layers ?? []).flatMap((layer) => lines(layer.model)).filter(Boolean).slice(0, 8);
    }
    return model.lines.map((line) => (line.marker ? `${line.marker} ${line.text}` : line.text)).filter((text) => text.trim());
  }

  function cue(model: PresentationModel | undefined): string {
    if (!model) return "";
    if (model.layout === "black") return "Black";
    if (model.layout === "empty") return "Clear";
    if (model.layout === "logo") return "Logo";
    return model.reference ?? "";
  }

  const current = $derived(lines(snapshot?.program));
  const upcoming = $derived(lines(snapshot?.next));
  const clock = $derived(new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  const stale = $derived(!snapshot || now - snapshot.at > 6 * 60 * 60 * 1000);
</script>

<div class="stage">
  <header>
    <span class="tag" class:live={snapshot?.live}>{snapshot?.live ? "LIVE" : "Output off"}</span>
    <span class="desk">{snapshot?.desk || "Church Studio"}</span>
    <span class="clock">{clock}</span>
  </header>
  <section class="now" aria-live="polite">
    <p class="cue">{cue(snapshot?.program) || (stale ? "Waiting for the desk" : "")}</p>
    {#each current as line, index (index)}
      <p class="line">{line}</p>
    {/each}
  </section>
  <section class="next">
    <p class="label">Next</p>
    <p class="next-cue">{cue(snapshot?.next) || "—"}</p>
    {#if upcoming.length}<p class="next-line">{upcoming.slice(0, 2).join(" / ")}</p>{/if}
  </section>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    background: #000;
    color: #fff;
    font-family: "Inter Variable", system-ui, sans-serif;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr);
    gap: 2vh;
    padding: 2.5vh 3vw;
  }
  header { display: flex; align-items: center; gap: 2vw; font-size: 2.4vh; color: #aab2bf; }
  .tag { padding: 0.3em 0.8em; border-radius: 999px; border: 1px solid #444; font-weight: 700; letter-spacing: 0.1em; }
  .tag.live { background: #d92d20; border-color: #d92d20; color: #fff; }
  .desk { flex: 1; }
  .clock { font: 700 5vh/1 "Inter Variable", system-ui, sans-serif; color: #fff; font-variant-numeric: tabular-nums; }
  .now { overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
  .cue { margin: 0 0 1.5vh; font-size: 3vh; color: #f5c451; font-weight: 700; letter-spacing: 0.04em; }
  .line { margin: 0 0 1vh; font-size: 6.4vh; line-height: 1.18; font-weight: 600; }
  .next { border-top: 2px solid #333; padding-top: 1.5vh; color: #c9ced6; }
  .label { margin: 0; font-size: 2vh; letter-spacing: 0.2em; text-transform: uppercase; color: #7d8794; }
  .next-cue { margin: 0.4vh 0 0; font-size: 3.4vh; font-weight: 700; color: #fff; }
  .next-line { margin: 0.6vh 0 0; font-size: 3vh; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
