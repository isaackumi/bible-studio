<script lang="ts">
  import { emit, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { acceptProgramPacket, readLocal, readOwner, readStandbyLocal, subscribeLocal, subscribeStandbyLocal } from "../display/channel";
  import { frameBackground } from "../domain/backgrounds";
  import { cameraDeviceId, camerasIn, openCamera, planFeeds, stopCameraStream, type CameraFeeds } from "../domain/camera";
  import { acceptAudienceFrame } from "../display/output";
  import { broadcastRelayTransport, CameraRelayReceiver, relayEnabled, tauriRelayTransport } from "../display/camera-relay";
  import { api } from "../db/api";
  import { isDesktop } from "../platform/runtime";
  import { measureFrames } from "../display/frames";
  import { keepsOutgoing, transitionFrames } from "../display/transitions";
  import { tick } from "svelte";
  import { emptyModel, defaultTheme } from "../domain/theme";
  import type { PresentationModel, ProgramPacket } from "../domain/types";
  import Screen from "./Screen.svelte";
  import CaptionBar from "./CaptionBar.svelte";
  import { AUDIENCE_ASPECT_KEY, cleanAspect } from "../display/shape";

  let current = $state<PresentationModel>(emptyModel(defaultTheme()));
  let currentSource = $state<string | null>(null);
  /** This window's own camera feeds. Program cameras paint; standby cameras only warm up. */
  let feeds = $state.raw<CameraFeeds<MediaStream>>({});
  let standby = $state<string[]>([]);
  const opening = new Set<string>();
  let closed = false;
  let fading = $state(false);
  let fadeMs = $state(0);
  /** The frame being replaced, kept on the screen while a slide, zoom, dissolve or dip runs. */
  let outgoing = $state.raw<{ model: PresentationModel; sourceId: string | null; key: number } | null>(null);
  let outgoingTimer: ReturnType<typeof setTimeout> | undefined;
  let incomingLayer = $state<HTMLDivElement | null>(null);
  let outgoingLayer = $state<HTMLDivElement | null>(null);
  let revision = -1;
  let shown = $state.raw<ProgramPacket | null>(null);
  let testing = $state(false);
  let fillable = $state(false);
  /** This window's own shape; a chosen shape in the packet wins over it. */
  let own = $state(16 / 9);
  const aspect = $derived(shown?.aspect ? cleanAspect(shown.aspect) : own);
  let testTimer: ReturnType<typeof setTimeout> | undefined;

  function show(packet: ProgramPacket | null) {
    if (!acceptAudienceFrame(shown, packet)) return;
    if (!isDesktop() && !acceptProgramPacket(shown, packet, readOwner(localStorage))) return;
    const next = packet?.frame.model;
    if (!next) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The same frame sent again (an overlay or timer changed) updates in place: a running move carries on.
    const fresh = packet.revision !== revision;
    const moving = fresh && packet.transition !== "cut" && revision !== -1 && !reduce && packet.transitionMs > 0;
    const before = { model: current, sourceId: currentSource };
    shown = packet;
    revision = packet.revision;
    if (fresh) {
      fading = moving && packet.transition === "fade";
      fadeMs = packet.transitionMs;
      clearTimeout(outgoingTimer);
      outgoing = moving && keepsOutgoing(packet.transition) ? { ...before, key: packet.revision } : null;
    }
    current = next;
    if (moving && keepsOutgoing(packet.transition)) void play(packet.transition, packet.transitionMs);
    currentSource = packet.frame.sourceId ?? null;
    document.documentElement.toggleAttribute("data-calm", packet.calm === true);
  }

  /** Run a two-frame transition: the new frame comes in over the old one, then the old one goes. */
  async function play(kind: ProgramPacket["transition"], ms: number) {
    const frames = transitionFrames(kind);
    await tick();
    if (!frames) {
      outgoing = null;
      return;
    }
    const timing = { duration: ms, easing: frames.easing, fill: "both" as const };
    incomingLayer?.getAnimations().forEach((animation) => animation.cancel());
    incomingLayer?.animate(frames.incoming, timing);
    if (frames.outgoing) outgoingLayer?.animate(frames.outgoing, timing);
    outgoingTimer = setTimeout(() => {
      outgoing = null;
      incomingLayer?.getAnimations().forEach((animation) => animation.cancel());
    }, ms + 60);
  }

  function wanted(): string[] {
    return [...new Set([...camerasIn(current, currentSource), ...standby])];
  }

  function dropFeeds(ids: string[]) {
    if (!ids.length) return;
    const next = { ...feeds };
    for (const id of ids) {
      stopCameraStream(next[id]);
      delete next[id];
    }
    feeds = next;
  }

  /** Tell the desk whether this window could open a camera, so a failure never hides behind the camera card. */
  function report(id: string, error: string) {
    if (isDesktop()) void emit("audience-camera", { id, error }).catch(() => {});
  }

  const retries = new Map<string, ReturnType<typeof setTimeout>>();

  async function openFeed(id: string) {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) return report(id, "This window cannot use cameras.");
    if (opening.has(id)) return;
    opening.add(id);
    clearTimeout(retries.get(id));
    try {
      const stream = (await withTimeout(openCamera(media, cameraDeviceId(id)), 8000)) as MediaStream;
      if (closed || !wanted().includes(id)) stopCameraStream(stream);
      else {
        feeds = { ...feeds, [id]: stream };
        report(id, "");
        // A phone camera that drops (Wi-Fi, app closed) ends its track; forget it so the window reopens it.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (feeds[id] === stream) dropFeeds([id]);
        });
      }
    } catch (error) {
      // The camera card stays on screen; the rest of the frame is unaffected. Try again while it is still wanted.
      const reason = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
      console.warn("Audience camera unavailable", id, error);
      report(id, reason);
      if (!closed) retries.set(id, setTimeout(() => wanted().includes(id) && !feeds[id] && void openFeed(id), 3000));
    } finally {
      opening.delete(id);
    }
  }

  function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A late stream must not stay open behind our back.
        void work.then((late) => stopCameraStream(late as MediaStream)).catch(() => {});
        reject(new Error("The camera did not start within 8 seconds."));
      }, ms);
      work.then(
        (value) => (clearTimeout(timer), resolve(value)),
        (error) => (clearTimeout(timer), reject(error)),
      );
    });
  }

  /** On desktop the operator window owns the cameras and relays them here (WebKit allows one capturing window). */
  const relayed = typeof window !== "undefined" && relayEnabled(isDesktop(), typeof localStorage === "undefined" ? null : localStorage);

  function relayFeed(id: string, stream: MediaStream | null) {
    if (closed) return;
    if (stream) {
      feeds = { ...feeds, [id]: stream };
      report(id, "");
    } else if (feeds[id]) {
      const next = { ...feeds };
      delete next[id];
      feeds = next;
    }
  }

  async function startRelay(): Promise<() => void> {
    try {
      const transport = isDesktop() ? await tauriRelayTransport("audience") : broadcastRelayTransport("audience");
      if (closed) return () => {};
      const receiver = new CameraRelayReceiver(transport, relayFeed);
      return () => receiver.destroy();
    } catch (error) {
      console.error("Camera relay unavailable", error);
      return () => {};
    }
  }

  $effect(() => {
    if (relayed) return;
    const plan = planFeeds(Object.keys(feeds), wanted());
    dropFeeds(plan.close);
    for (const id of plan.open) void openFeed(id);
  });

  function flashTest() {
    testing = true;
    clearTimeout(testTimer);
    testTimer = setTimeout(() => {
      testing = false;
    }, 1600);
  }

  /** Measure the screen this window fills and tell the desk, so its monitors show the same shape. */
  function measureShape() {
    if (!window.innerWidth || !window.innerHeight) return;
    const next = cleanAspect(window.innerWidth / window.innerHeight);
    own = next;
    if (Math.abs(next - reported) < 0.005) return;
    reported = next;
    if (isDesktop()) void emit("audience-shape", next).catch(() => {});
    else {
      try {
        localStorage.setItem(AUDIENCE_ASPECT_KEY, String(next));
      } catch {
        // Private windows can refuse storage; the desk keeps its last shape.
      }
    }
  }

  let reported = 0;
  let shapeTimer: ReturnType<typeof setTimeout> | undefined;
  function onResize() {
    clearTimeout(shapeTimer);
    // Wait for a resize or fullscreen change to settle before reporting.
    shapeTimer = setTimeout(measureShape, 250);
  }

  onMount(() => {
    measureShape();
    window.addEventListener("resize", onResize);
    const desktop = isDesktop();
    fillable = !desktop;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "output-test") flashTest();
    };
    window.addEventListener("message", onMessage);
    const onFullscreen = () => {
      fillable = !desktop && !document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    let stopRelay = () => {};
    if (relayed) void startRelay().then((stop) => (stopRelay = stop));
    if (!desktop) {
      show(readLocal());
      standby = readStandbyLocal();
      const stop = subscribeLocal(show);
      const stopStandby = subscribeStandbyLocal((ids) => (standby = ids));
      return () => {
        closed = true;
        stopRelay();
        retries.forEach((timer) => clearTimeout(timer));
        dropFeeds(Object.keys(feeds));
        stop();
        stopStandby();
        window.removeEventListener("message", onMessage);
        window.removeEventListener("resize", onResize);
        clearTimeout(shapeTimer);
        document.removeEventListener("fullscreenchange", onFullscreen);
        clearTimeout(testTimer);
      };
    }
    let unlistenFrame = () => {};
    let unlistenTest = () => {};
    void api.getProgram().then(show).catch((error) => console.error(error));
    void listen<ProgramPacket>("program-frame", (event) => show(event.payload)).then((stop) => {
      unlistenFrame = stop;
    });
    void listen("output-test", () => flashTest()).then((stop) => {
      unlistenTest = stop;
    });
    // The Performance page asks how smoothly this screen runs: a few seconds of frames, then the answer.
    let unlistenMeasure = () => {};
    void listen<{ ms: number }>("measure-frames", (event) => {
      void measureFrames(event.payload?.ms ?? 5000).then((frames) => emit("audience-frames", frames).catch(() => {}));
    }).then((stop) => {
      unlistenMeasure = stop;
    });
    let unlistenStandby = () => {};
    void listen<string[]>("camera-standby", (event) => {
      standby = Array.isArray(event.payload) ? event.payload.filter((id) => typeof id === "string" && id.startsWith("camera:")) : [];
    }).then((stop) => {
      unlistenStandby = stop;
    });
    return () => {
      closed = true;
      stopRelay();
      retries.forEach((timer) => clearTimeout(timer));
      dropFeeds(Object.keys(feeds));
      unlistenStandby();
      unlistenFrame();
      unlistenTest();
      unlistenMeasure();
      window.removeEventListener("message", onMessage);
        window.removeEventListener("resize", onResize);
        clearTimeout(shapeTimer);
      document.removeEventListener("fullscreenchange", onFullscreen);
      clearTimeout(testTimer);
    };
  });

  function fillScreen() {
    void document.documentElement.requestFullscreen?.();
  }
</script>

<div class="audience" style:background={frameBackground(current)} style:--aspect={aspect}>
  {#if outgoing}
    {#key outgoing.key}
      <div class="layer" bind:this={outgoingLayer} aria-hidden="true">
        <Screen model={outgoing.model} sourceId={outgoing.sourceId} {feeds} {aspect} />
      </div>
    {/key}
  {/if}
  <div class="layer" class:fade-in={fading} style:--fade="{fadeMs}ms" bind:this={incomingLayer}>
    <Screen model={current} sourceId={currentSource} {feeds} {aspect} audio />
  </div>
  <CaptionBar />
  {#if testing}
    <p class="test-card">Test. Program was not changed.</p>
  {/if}
  {#if fillable}
    <button type="button" class="fill-screen" onclick={fillScreen}>Fill this screen</button>
  {/if}
</div>

<style>
  /* Old and new frames on top of each other, so a transition can move both; the screen clips what slides off. */
  .audience { overflow: hidden; }
  .layer { position: absolute; inset: 0; }
  .test-card, .fill-screen {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
  }
  .test-card {
    top: 24px;
    margin: 0;
    color: white;
    font: 600 28px/1.2 Inter, sans-serif;
  }
  .fill-screen {
    bottom: 28px;
    border: 0;
    border-radius: 999px;
    background: white;
    color: black;
    padding: 10px 16px;
    font: 600 14px/1 Inter, sans-serif;
  }
</style>
