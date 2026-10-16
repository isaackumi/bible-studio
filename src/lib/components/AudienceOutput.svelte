<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { acceptProgramPacket, readLocal, readOwner, readStandbyLocal, subscribeLocal, subscribeStandbyLocal } from "../display/channel";
  import { frameBackground } from "../domain/backgrounds";
  import { cameraDeviceId, camerasIn, openCamera, planFeeds, stopCameraStream, type CameraFeeds } from "../domain/camera";
  import { acceptAudienceFrame } from "../display/output";
  import { api } from "../db/api";
  import { isDesktop } from "../platform/runtime";
  import { emptyModel, defaultTheme } from "../domain/theme";
  import type { PresentationModel, ProgramPacket } from "../domain/types";
  import Screen from "./Screen.svelte";

  let current = $state<PresentationModel>(emptyModel(defaultTheme()));
  let currentSource = $state<string | null>(null);
  /** This window's own camera feeds. Program cameras paint; standby cameras only warm up. */
  let feeds = $state.raw<CameraFeeds<MediaStream>>({});
  let standby = $state<string[]>([]);
  const opening = new Set<string>();
  let closed = false;
  let fading = $state(false);
  let fadeMs = $state(0);
  let revision = -1;
  let shown: ProgramPacket | null = null;
  let testing = $state(false);
  let fillable = $state(false);
  let testTimer: ReturnType<typeof setTimeout> | undefined;

  function show(packet: ProgramPacket | null) {
    if (!acceptAudienceFrame(shown, packet)) return;
    if (!isDesktop() && !acceptProgramPacket(shown, packet, readOwner(localStorage))) return;
    const next = packet?.frame.model;
    if (!next) return;
    const animate = packet.transition === "fade" && packet.revision !== revision && revision !== -1;
    shown = packet;
    revision = packet.revision;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fading = animate && !reduce;
    fadeMs = packet.transitionMs;
    current = next;
    currentSource = packet.frame.sourceId ?? null;
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

  async function openFeed(id: string) {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia || opening.has(id)) return;
    opening.add(id);
    try {
      const stream = (await openCamera(media, cameraDeviceId(id))) as MediaStream;
      if (closed || !wanted().includes(id)) stopCameraStream(stream);
      else feeds = { ...feeds, [id]: stream };
    } catch (error) {
      // The camera card stays on screen; the rest of the frame is unaffected.
      console.warn("Audience camera unavailable", id, error);
    } finally {
      opening.delete(id);
    }
  }

  $effect(() => {
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

  onMount(() => {
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
    if (!desktop) {
      show(readLocal());
      standby = readStandbyLocal();
      const stop = subscribeLocal(show);
      const stopStandby = subscribeStandbyLocal((ids) => (standby = ids));
      return () => {
        closed = true;
        dropFeeds(Object.keys(feeds));
        stop();
        stopStandby();
        window.removeEventListener("message", onMessage);
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
    let unlistenStandby = () => {};
    void listen<string[]>("camera-standby", (event) => {
      standby = Array.isArray(event.payload) ? event.payload.filter((id) => typeof id === "string" && id.startsWith("camera:")) : [];
    }).then((stop) => {
      unlistenStandby = stop;
    });
    return () => {
      closed = true;
      dropFeeds(Object.keys(feeds));
      unlistenStandby();
      unlistenFrame();
      unlistenTest();
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", onFullscreen);
      clearTimeout(testTimer);
    };
  });

  function fillScreen() {
    void document.documentElement.requestFullscreen?.();
  }
</script>

<div class="audience" style:background={frameBackground(current)}>
  <div class:fade-in={fading} style:--fade="{fadeMs}ms">
    <Screen model={current} sourceId={currentSource} {feeds} />
  </div>
  {#if testing}
    <p class="test-card">Test. Program was not changed.</p>
  {/if}
  {#if fillable}
    <button type="button" class="fill-screen" onclick={fillScreen}>Fill this screen</button>
  {/if}
</div>

<style>
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
