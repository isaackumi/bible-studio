<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount, untrack } from "svelte";
  import { api } from "../db/api";
  import { parseStage, readLocal, readStageLocal, subscribeLocal, subscribeStageLocal, type StageSnapshot } from "../display/channel";
  import { readScreensLocal, screenLetter, screenShows, type ScreenOutput } from "../display/screens";
  import { frameBackground } from "../domain/backgrounds";
  import { formatClock, formatCountdown, timerDisplay, timerFromPaint, timersIn } from "../domain/timer";
  import type { PresentationModel, ProgramPacket } from "../domain/types";
  import { isDesktop } from "../platform/runtime";
  import { t } from "../i18n/core";
  import Screen from "./Screen.svelte";
  import StageOutput from "./StageOutput.svelte";

  // One of the extra screens (Settings › Screens): its job comes from the desk, and it shows
  // Program, only verses, only song words, a big timer, the stage view, or nothing.
  let { id }: { id: string } = $props();

  let screens = $state<ScreenOutput[]>([]);
  let program = $state<PresentationModel | null>(null);
  let sourceId = $state<string | null>(null);
  let stage = $state<StageSnapshot | null>(null);
  let now = $state(Date.now());
  let identify = $state(false);
  let aspect = $state(16 / 9);

  const index = $derived(screens.findIndex((screen) => screen.id === id));
  const screen = $derived(index >= 0 ? screens[index]! : null);
  const role = $derived(screen?.role ?? "blank");
  /** What it shows: its own kind the moment it goes live; between, the other kinds it takes, the last one kept, or dark. */
  let shown = $state<PresentationModel | null>(null);
  let kept: PresentationModel | null = null;
  $effect(() => {
    const next = screenShows(screen ?? { role }, program, untrack(() => kept));
    kept = next.last;
    shown = next.show;
  });
  const label = $derived(screen ? screen.name || t("Screen {letter}", { letter: screenLetter(index) }) : "");

  /** The timer screen: a timer on Program, else the part's time left, else the clock. */
  const timer = $derived.by(() => {
    const live = program ? (program.layout === "timer" && program.timer ? [program.timer] : timersIn(program)) : [];
    if (live[0]) {
      const view = timerDisplay(timerFromPaint(live[0]), now);
      return { big: view.text, caption: live[0].label || "", warning: view.warning };
    }
    const section = stage?.section;
    if (section?.endsAt) {
      const left = section.endsAt - now;
      const short = (ms: number, up: boolean) => formatCountdown(ms, up).replace(/^00:/, "");
      return { big: left >= 0 ? short(left, true) : `+${short(-left, false)}`, caption: section.name, warning: left < 120_000 };
    }
    return { big: formatClock(now), caption: "", warning: false };
  });

  function accept(packet: ProgramPacket | null) {
    const model = packet?.frame?.model;
    if (!model) return;
    program = model;
    sourceId = packet!.frame.sourceId ?? null;
  }

  onMount(() => {
    screens = readScreensLocal();
    stage = readStageLocal();
    const measure = () => {
      if (window.innerWidth && window.innerHeight) aspect = window.innerWidth / window.innerHeight;
    };
    measure();
    window.addEventListener("resize", measure);
    const tick = setInterval(() => (now = Date.now()), 250);
    const stopStage = subscribeStageLocal((next) => (stage = next));
    const stops: Array<() => void> = [stopStage, () => clearInterval(tick), () => window.removeEventListener("resize", measure)];
    let identifyTimer: ReturnType<typeof setTimeout> | undefined;
    if (isDesktop()) {
      void api.getProgram().then(accept).catch(() => {});
      void listen<ProgramPacket>("program-frame", (event) => accept(event.payload)).then((stop) => stops.push(stop));
      void listen<string>("stage-frame", (event) => {
        const next = parseStage(event.payload);
        if (next) stage = next;
      }).then((stop) => stops.push(stop));
      void listen<ScreenOutput[]>("screens-config", (event) => (screens = Array.isArray(event.payload) ? event.payload : screens)).then((stop) => stops.push(stop));
      void listen("screens-identify", () => {
        identify = true;
        clearTimeout(identifyTimer);
        identifyTimer = setTimeout(() => (identify = false), 4000);
      }).then((stop) => stops.push(stop));
    } else {
      accept(readLocal());
      stops.push(subscribeLocal(accept));
    }
    return () => {
      clearTimeout(identifyTimer);
      for (const stop of stops) stop();
    };
  });
</script>

<div class="screen-out" style:background={role === "stage" ? "#000" : shown ? frameBackground(shown) : "#000"}>
  {#if role === "stage"}
    <StageOutput />
  {:else if role === "timer"}
    <div class="timer" class:warning={timer.warning}>
      {#if timer.caption}<p class="caption">{timer.caption}</p>{/if}
      <p class="big">{timer.big}</p>
    </div>
  {:else if shown}
    <Screen model={shown} {sourceId} feeds={{}} {aspect} />
  {/if}
  {#if identify && screen}
    <div class="identify" aria-live="polite">
      <b>{screenLetter(index)}</b>
      <span>{label}</span>
    </div>
  {/if}
</div>

<style>
  .screen-out { position: fixed; inset: 0; overflow: hidden; color: #fff; }
  .timer { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 2vh; font-family: Inter, system-ui, sans-serif; }
  .timer .big { margin: 0; font-size: min(30vw, 52vh); font-weight: 700; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .timer .caption { margin: 0; font-size: min(5vw, 7vh); font-weight: 600; color: rgba(255, 255, 255, 0.7); }
  .timer.warning .big { color: #ff5a4f; }
  .identify { position: absolute; inset: 0; z-index: 10; display: grid; place-content: center; gap: 2vh; text-align: center; background: rgba(0, 0, 0, 0.82); font-family: Inter, system-ui, sans-serif; }
  .identify b { font-size: 40vh; line-height: 1; color: #fa4f00; }
  .identify span { font-size: 6vh; font-weight: 600; }
</style>
