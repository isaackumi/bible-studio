<script lang="ts">
  import { cameraFeedForLayer, type CameraFeeds } from "../domain/camera";
  import { displayWash, frameBackground } from "../domain/backgrounds";
  import { effectsCss } from "../domain/text-style";
  import { cubicIn, cubicInOut, cubicOut, linear } from "svelte/easing";
  import type { TransitionConfig } from "svelte/transition";
  import { timerDisplay, timerFromPaint } from "../domain/timer";
  import type { PaintedLayer, PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";
  import QrView from "./QrView.svelte";
  import MotionBackground from "./MotionBackground.svelte";

  let {
    model,
    stream = null,
    feeds = {},
    nested = false,
    mirror = false,
    audio = false,
    still = false,
  }: {
    model: PresentationModel;
    /** Live pixels for this frame's own camera source. */
    stream?: MediaStream | null;
    /** Open camera feeds by camera source id, resolved per composition layer. */
    feeds?: CameraFeeds<MediaStream>;
    nested?: boolean;
    mirror?: boolean;
    /** Only the audience screen plays sound; operator monitors stay silent. */
    audio?: boolean;
    /** Hold animated backgrounds still (gallery thumbnails). */
    still?: boolean;
  } = $props();

  /** A layer that is hidden or leaves the scene plays its exit animation. */
  function leave(node: Element, animation: PaintedLayer["animation"]): TransitionConfig {
    const kind = animation?.exit ?? "none";
    const reduced = node.closest(".app") !== null && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (kind === "none" || reduced) return { duration: 0 };
    const easing = animation?.easing === "linear" ? linear : animation?.easing === "ease-in" ? cubicIn : animation?.easing === "ease" ? cubicInOut : cubicOut;
    const shift: Record<string, string> = {
      "slide-left": "translateX(-12%)",
      "slide-right": "translateX(12%)",
      "slide-up": "translateY(-18%)",
      "slide-down": "translateY(18%)",
    };
    const away = shift[kind];
    return {
      duration: Math.max(0, animation?.durationMs ?? 400),
      easing,
      css: (t) => (away ? `opacity: ${t}; transform: ${away.replace(/(-?\d+)%/, (_, n) => `${Number(n) * (1 - t)}%`)};` : `opacity: ${t};`),
    };
  }

  /** Start playback; if sound is not allowed without a click, keep playing muted. */
  function playClip(node: HTMLVideoElement, muted: boolean) {
    node.muted = muted;
    const start = () => {
      void node.play().catch(() => {
        node.muted = true;
        void node.play().catch(() => {});
      });
    };
    start();
    return {
      update(next: boolean) {
        node.muted = next;
        if (node.paused) start();
      },
    };
  }
  let video = $state<HTMLVideoElement | undefined>();
  let playing = $state(false);
  let now = $state(0);

  $effect(() => {
    const node = video;
    if (!node) return;
    playing = false;
    node.srcObject = stream ?? null;
    return () => {
      node.srcObject = null;
    };
  });

  $effect(() => {
    const paint = model.timer;
    if (model.layout !== "timer" || !paint) return;
    now = Date.now();
    if (!paint.running && paint.mode !== "clock" && paint.mode !== "target") return;
    const id = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(id);
  });

  const wash = $derived(model.theme.background.type === "wash" ? displayWash(model.theme.background.washId) : null);
  const timerView = $derived(
    model.layout === "timer" && model.timer ? timerDisplay(timerFromPaint(model.timer), now || Date.now()) : null,
  );

  const background = $derived(frameBackground(model, nested));
  /** Text frames get the theme's animated, video and darkening layers behind the words. */
  const TEXT_LAYOUTS = new Set(["scripture", "lyrics", "title", "timer", "lower-third", "empty", "announcement", "slide"]);
  const backdrop = $derived(!nested && !model.fill && !model.backgroundImageUrl && TEXT_LAYOUTS.has(model.layout) ? model.theme.background : null);
  /** The theme's text panel, for words only (not timers, logos or cameras). */
  const panel = $derived(model.theme.panel && (model.layout === "scripture" || model.layout === "lyrics" || model.layout === "title" || model.layout === "lower-third") && !stream ? model.theme.panel : null);
  const dim = $derived(!nested && TEXT_LAYOUTS.has(model.layout) ? (model.theme.dim ?? 0) : 0);
  const effects = $derived(effectsCss(model.style, model.theme));

  const justify = $derived(
    model.theme.vertical === "top" ? "flex-start" : model.theme.vertical === "bottom" ? "flex-end" : "center",
  );

  const displayLines = $derived(timerView ? [{ text: timerView.text }] : model.lines);
</script>

{#snippet words()}
  {#if model.reference && model.theme.reference.show}
    <p class="ref" style:font-size="{model.theme.reference.size}px" style:color={model.theme.reference.color}>{model.reference}</p>
  {/if}
  {#if model.parallel && model.layout === "scripture"}
    <!-- Two translations side by side: one reference, each column with its own attribution. -->
    <div class="parallel">
      {#each [{ lines: displayLines, attribution: model.attribution }, { lines: model.parallel.lines, attribution: model.parallel.attribution }] as column, n (n)}
        <div class="parallel-col">
          {#each column.lines as line}
            <p class="line" style:font-size="{Math.round(model.theme.fontSize * 0.74)}px">{#if line.marker}<sup class="marker">{line.marker}</sup>{/if}{line.text}</p>
          {/each}
          {#if column.attribution}<p class="attr" style:font-size="{model.theme.attribution.size}px" style:color={model.theme.attribution.color}>{column.attribution}</p>{/if}
        </div>
      {/each}
    </div>
  {:else}
  {#each displayLines as line}
    <p class="line" class:clock={model.layout === "timer"} style:font-size="{model.layout === 'logo' ? 92 : model.theme.fontSize}px">
      {#if line.marker}<sup class="marker">{line.marker}</sup>{/if}{line.text}
    </p>
  {/each}
  {#if model.attribution}
    <p class="attr" style:font-size="{model.theme.attribution.size}px" style:color={model.theme.attribution.color}>{model.attribution}</p>
  {/if}
  {/if}
{/snippet}


<div
  class="frame"
  class:black={model.layout === "black"}
  class:wash={!!wash && model.layout !== "black" && !nested}
  class:light={!!wash?.light}
  class:drift={wash?.motion === "drift" && model.layout !== "black" && !nested}
  class:glow={wash?.motion === "glow" && model.layout !== "black" && !nested}
  class:paneled={!!panel}
  class:lower={(model.theme.layout === "lower-third" || model.layout === "lower-third") && model.layout !== "black" && model.layout !== "empty" && model.layout !== "image"}
  class:nested
  class:composition={model.layout === "composition"}
  class:timer={model.layout === "timer"}
  class:warning={!!timerView?.warning}
  class:done={!!timerView?.complete && model.timer?.mode !== "clock"}
  style:background={background}
  style:color={model.theme.color}
  style:font-family={model.theme.fontFamily}
>
  {#if backdrop?.type === "motion"}
    <MotionBackground motion={backdrop.motionId} tint={backdrop.tint} base={backdrop.base} {still} />
  {:else if backdrop?.type === "video" && model.backgroundVideoUrl}
    <video class="backdrop-video" src={model.backgroundVideoUrl} autoplay loop muted playsinline preload="auto"></video>
  {/if}
  {#if dim > 0}<div class="backdrop-dim" style:opacity={dim} aria-hidden="true"></div>{/if}
  {#if model.layout === "composition"}
    {#each model.layers ?? [] as layer (layer.id)}
      <div
        out:leave={layer.animation}
        class="comp-layer enter-{layer.animation?.entrance ?? "none"}"
        class:fit-cover={layer.fit === "cover"}
        class:fit-fill={layer.fit === "fill"}
        style:left="{layer.bounds.x}%"
        style:top="{layer.bounds.y}%"
        style:width="{layer.bounds.w}%"
        style:height="{layer.bounds.h}%"
        style:opacity={layer.opacity}
        style:background={layer.backing}
        style:--layer-opacity={layer.opacity}
        style:z-index={layer.zIndex}
        style:--layer-dur="{layer.animation?.durationMs ?? 400}ms"
        style:--layer-ease={layer.animation?.easing ?? "ease-out"}
      >
        <FrameView
          model={layer.model}
          nested
          mirror={layer.mirror ?? false}
          {audio}
          stream={cameraFeedForLayer(layer.sourceId, feeds)}
        />
      </div>
    {/each}
  {:else if model.layout === "video" && model.video}
    {#key model.video.url}
      <!-- svelte-ignore a11y_media_has_caption -- operator media on a projection screen; captions belong in the file -->
      <video class="cover" src={model.video.url} loop={model.video.loop} playsinline preload="auto" use:playClip={!audio || model.video.muted}></video>
    {/key}
  {:else if model.layout === "shape" && model.shape}
    <div
      class="shape"
      style:background={model.shape.fill}
      style:border-radius={model.shape.kind === "ellipse" ? "50%" : `${model.shape.radius}%`}
    ></div>
  {:else if model.layout === "qr" && model.qr}
    <QrView qr={model.qr} />
  {:else if model.layout === "image" && model.imageUrl}
    <img class="cover" src={model.imageUrl} alt="" />
  {:else if model.layout === "logo" && model.imageUrl}
    <img class="logo" src={model.imageUrl} alt="" />
  {:else if model.layout !== "empty" && model.layout !== "black" && !(stream && (playing || audio))}
    <!-- A camera's name card is for the desk while the feed starts; it never sits on a live picture or reaches the audience. -->
    <div
      class="stack"
      style:text-align={model.theme.align}
      style:justify-content={justify}
      style:padding="{nested ? 16 : model.theme.margin}px"
      style:font-weight={effects["font-weight"]}
      style:font-style={effects["font-style"]}
      style:text-decoration={effects["text-decoration"]}
      style:text-transform={effects["text-transform"]}
      style:text-shadow={effects["text-shadow"]}
    >
      {#if panel}
        <div
          class="tpanel {panel.style}"
          class:tag={panel.tag}
          style:--panel-bg="color-mix(in srgb, {panel.color} {Math.round(panel.opacity * 100)}%, transparent)"
          style:--panel-accent={panel.accent}
          style:--panel-bleed="{nested ? 16 : model.theme.margin}px"
          style:align-self={model.theme.align === "left" ? "flex-start" : model.theme.align === "right" ? "flex-end" : "center"}
        >
          {@render words()}
        </div>
      {:else}
        {@render words()}
      {/if}
    </div>
  {/if}
  {#if model.alert && !nested}
    <div class="alert-bar {model.alert.style} {model.alert.position}" role="alert">
      {#if model.alert.style === "ticker"}
        <span class="ticker-track"><span>{model.alert.text}</span><span aria-hidden="true">{model.alert.text}</span></span>
      {:else}
        <span>{model.alert.text}</span>
      {/if}
    </div>
  {/if}
  {#if stream && model.layout !== "composition"}
    <!-- The camera card stays underneath until real frames arrive, so a slow or failed camera never shows black. -->
    <video bind:this={video} class="cover live" class:ready={playing} class:mirror autoplay muted playsinline onplaying={() => (playing = true)}></video>
  {/if}
</div>
