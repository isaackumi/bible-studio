<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { defaultStageLayout, readStageLocal, subscribeStageLocal, parseStage, type StageSnapshot } from "../display/channel";
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
  const layout = $derived(snapshot?.layout ?? defaultStageLayout());
  /** Minutes left in the running section of the service (negative: over). */
  const sectionLeft = $derived(snapshot?.section ? Math.round((snapshot.section.endsAt - now) / 60_000) : null);
</script>

<div class="stage size-{layout.size}">
  <header>
    <span class="tag" class:live={snapshot?.live}>{snapshot?.live ? "LIVE" : "Output off"}</span>
    <span class="desk">{snapshot?.desk || "Church Studio"}</span>
    {#if snapshot?.section && sectionLeft !== null}
      <span class="section-left" class:short={sectionLeft >= 0 && sectionLeft <= 5} class:over={sectionLeft < 0}>
        {snapshot.section.name} · {sectionLeft >= 0 ? `${sectionLeft} min left` : `${-sectionLeft} min over`}
      </span>
    {/if}
    {#if layout.clock}<span class="clock">{clock}</span>{/if}
  </header>
  {#if snapshot?.message}
    <p class="stage-message" role="alert">{snapshot.message}</p>
  {/if}
  {#if snapshot?.program.alert}
    <p class="stage-alert" role="alert">Alert on screen: {snapshot.program.alert.text}</p>
  {/if}
  <section class="now" aria-live="polite">
    <p class="cue">{cue(snapshot?.program) || (stale ? "Waiting for the desk" : "")}</p>
    {#each current as line, index (index)}
      <p class="line">{line}</p>
    {/each}
  </section>
  {#if layout.notes && snapshot?.notes}
    <section class="notes"><p class="label">Notes</p><p>{snapshot.notes}</p></section>
  {/if}
  {#if layout.next}
    <section class="next">
      <p class="label">Next</p>
      <p class="next-cue">{cue(snapshot?.next) || "—"}</p>
      {#if upcoming.length}<p class="next-line">{upcoming.slice(0, 2).join(" / ")}</p>{/if}
    </section>
  {/if}
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    background: #000;
    color: #fff;
    font-family: "Inter Variable", system-ui, sans-serif;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
    grid-template-columns: minmax(0, 1fr);
    gap: 2vh;
    padding: 2.5vh 3vw;
  }
  header { display: flex; align-items: center; gap: 2vw; font-size: 2.4vh; color: #aab2bf; }
  .tag { padding: 0.3em 0.8em; border-radius: 999px; border: 1px solid #444; font-weight: 700; letter-spacing: 0.1em; }
  .tag.live { background: #d92d20; border-color: #d92d20; color: #fff; }
  .desk { flex: 1; }
  .section-left { padding: 0.35em 0.9em; border-radius: 999px; background: #1f3d2c; color: #fff; font-weight: 700; font-size: 3vh; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .section-left.short { background: #8a5a00; }
  .section-left.over { background: #c8102e; }
  .clock { font: 700 5vh/1 "Inter Variable", system-ui, sans-serif; color: #fff; font-variant-numeric: tabular-nums; }
  .stage-alert { margin: 0; padding: 1vh 1.5vw; border-radius: 8px; background: #c8102e; color: #fff; font-size: 2.6vh; font-weight: 700; }
  .now { overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
  .cue { margin: 0 0 1.5vh; font-size: 3vh; color: #f5c451; font-weight: 700; letter-spacing: 0.04em; }
  .line { margin: 0 0 1vh; font-size: 6.4vh; line-height: 1.18; font-weight: 600; }
  .stage-message { margin: 0; padding: 2vh 2vw; border-radius: 12px; background: #ffd60a; color: #000; font-size: 6vh; font-weight: 800; text-align: center; animation: call 1.2s ease-in-out infinite alternate; }
  @keyframes call { from { box-shadow: 0 0 0 0 rgba(255, 214, 10, 0.7); } to { box-shadow: 0 0 0 1.2vh rgba(255, 214, 10, 0); } }
  .notes { padding: 1.5vh 1.5vw; border: 1px dashed #444; border-radius: 10px; color: #e8e8e8; }
  .notes p:last-child { margin: 0.6vh 0 0; font-size: 3vh; line-height: 1.35; white-space: pre-wrap; max-height: 22vh; overflow: hidden; }
  .size-s .line { font-size: 4.6vh; }
  .size-l .line { font-size: 8.4vh; }
  @media (prefers-reduced-motion: reduce) { .stage-message { animation: none; } }
  .next { border-top: 2px solid #333; padding-top: 1.5vh; color: #c9ced6; }
  .label { margin: 0; font-size: 2vh; letter-spacing: 0.2em; text-transform: uppercase; color: #7d8794; }
  .next-cue { margin: 0.4vh 0 0; font-size: 3.4vh; font-weight: 700; color: #fff; }
  .next-line { margin: 0.6vh 0 0; font-size: 3vh; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
