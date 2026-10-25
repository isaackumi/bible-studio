<script lang="ts">
  import { onMount } from "svelte";
  import { SERVER_URL } from "../domain/billing";
  import { cleanAspect } from "../display/shape";
  import { emptyModel, defaultTheme } from "../domain/theme";
  import type { PresentationModel } from "../domain/types";
  import Screen from "./Screen.svelte";

  // A phone, tablet or TV browser used as a display (/d/CODE): it shows what the church's screen
  // shows, as the church's Church Studio shares it over the internet. Only the picture: no controls,
  // nothing that changes anything. A tap goes full screen; the device stays awake while it shows.
  // `lan`: opened from the church computer itself over the church Wi-Fi (/?lan=1), no internet needed.
  let { code, lan = false }: { code: string; lan?: boolean } = $props();

  let model = $state<PresentationModel>(emptyModel(defaultTheme()));
  let aspect = $state(16 / 9);
  let status = $state<"waiting" | "showing" | "ended" | "offline">("waiting");
  let church = $state("");
  let width = $state(0);
  let height = $state(0);
  let idle = $state(false);

  /** The largest box of the screen's shape that fits this device. */
  const box = $derived.by(() => {
    if (!width || !height) return { w: 0, h: 0 };
    return width / height > aspect ? { w: height * aspect, h: height } : { w: width, h: width / aspect };
  });

  onMount(() => {
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lock: { release(): Promise<void> } | null = null;
    let stopped = false;

    const keepAwake = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request(kind: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };

    const ask = async () => {
      if (stopped) return;
      try {
        const response = await fetch(lan ? `/display/screen?after=${revision}` : `${SERVER_URL}/v1/rooms/${code}/screen?after=${revision}`, { cache: "no-store" });
        if (response.status === 404) {
          status = "ended";
          return;
        }
        if (response.status === 200) {
          const data = (await response.json()) as { on: boolean; revision: number; frame?: string; name: string };
          revision = data.revision;
          church = data.name;
          if (data.on && data.frame) {
            const frame = JSON.parse(data.frame) as { model: PresentationModel; aspect: number };
            model = frame.model;
            aspect = cleanAspect(frame.aspect);
            if (status !== "showing") void keepAwake();
            status = "showing";
          } else status = "waiting";
        } else if (status === "offline") status = revision ? "showing" : "waiting";
      } catch {
        status = "offline";
      }
      // Once a second while the page is in view; slower when it is not.
      timer = setTimeout(ask, document.hidden ? 5000 : 1000);
    };
    void ask();

    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void ask();
        if (status === "showing") void keepAwake();
      }
    };
    document.addEventListener("visibilitychange", visible);

    // The pointer hides when still, so a TV shows nothing but the screen.
    let still: ReturnType<typeof setTimeout> | undefined;
    const moved = () => {
      idle = false;
      clearTimeout(still);
      still = setTimeout(() => (idle = true), 2500);
    };
    window.addEventListener("pointermove", moved);
    moved();

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(still);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pointermove", moved);
      void lock?.release().catch(() => {});
    };
  });

  function fullScreen() {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
  }
</script>

<svelte:head><title>{church ? `${church} · ` : ""}Church Studio</title></svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="receiver" role="presentation" class:idle bind:clientWidth={width} bind:clientHeight={height} onclick={fullScreen}>
  {#if status === "showing"}
    <div class="screen" style:width="{box.w}px" style:height="{box.h}px">
      <Screen {model} {aspect} />
    </div>
  {:else}
    <div class="wait">
      <svg class="mark" viewBox="0 0 256 256" width="64" height="64" aria-hidden="true"><path d="M52 32H108A8 8 0 0 1 116 40V80A8 8 0 0 1 108 88H40A8 8 0 0 1 32 80V52A20 20 0 0 1 52 32Z" fill="#f5f5f5" /><path d="M148 32H204A20 20 0 0 1 224 52V80A8 8 0 0 1 216 88H148A8 8 0 0 1 140 80V40A8 8 0 0 1 148 32Z" fill="#fa4f00" /><path d="M40 112H108A8 8 0 0 1 116 120V216A8 8 0 0 1 108 224H52A20 20 0 0 1 32 204V120A8 8 0 0 1 40 112Z" fill="#f5f5f5" /><path d="M148 112H216A8 8 0 0 1 224 120V204A20 20 0 0 1 204 224H148A8 8 0 0 1 140 216V120A8 8 0 0 1 148 112Z" fill="#f5f5f5" /></svg>
      {#if status === "ended"}
        <h1>This screen has ended</h1>
        <p>The church is no longer sharing it.</p>
      {:else if status === "offline"}
        <h1>Reconnecting…</h1>
        <p>{lan ? "Check that this device is on the church Wi-Fi and Church Studio is open." : "Check this device's internet connection."}</p>
      {:else if lan}
        <h1>Connected to Church Studio</h1>
        <p>The screen appears here when the church computer shows it on Wi-Fi.</p>
      {:else}
        <h1>{church ? `Waiting for ${church}` : "Connecting…"}</h1>
        <p>The screen appears here when the church shares it. Code <b>{code}</b></p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .receiver { position: fixed; inset: 0; display: grid; place-items: center; background: #000; color: #f5f5f5; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .receiver.idle { cursor: none; }
  .screen { position: relative; overflow: hidden; }
  .wait { display: grid; justify-items: center; gap: 10px; padding: 24px; text-align: center; }
  .wait h1 { margin: 6px 0 0; font-size: 22px; font-weight: 700; }
  .wait p { margin: 0; color: #a3a3ad; font-size: 15px; }
  .wait b { color: #f5f5f5; letter-spacing: 0.12em; }
</style>
