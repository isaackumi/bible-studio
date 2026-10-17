<script lang="ts">
  import type { Snippet } from "svelte";
  import { cameraFeedForLayer, type CameraFeeds } from "../domain/camera";
  import type { PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";

  let {
    model,
    sourceId = null,
    feeds = {},
    audio = false,
    still = false,
    overlay,
    hint = "",
  }: {
    model: PresentationModel;
    sourceId?: string | null;
    /** Open camera feeds by camera source id. Absent feeds paint the camera card. */
    feeds?: CameraFeeds<MediaStream>;
    /** Audience only: let video play its sound. */
    audio?: boolean;
    /** Hold animated backgrounds still (gallery thumbnails). */
    still?: boolean;
    overlay?: Snippet;
    /** Operator monitors only: a quiet line shown while nothing is up. Never on the audience screen. */
    hint?: string;
  } = $props();
  let box: HTMLDivElement | undefined = $state();
  let scale = $state(0.3);

  const stream = $derived(model.layout === "composition" ? null : cameraFeedForLayer(sourceId, feeds));

  $effect(() => {
    const node = box;
    if (!node) return;
    const measure = () => {
      scale = node.clientWidth / 1920;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
</script>

<div class="ratio" bind:this={box}>
  <div class="canvas" style:transform="scale({scale})">
    <FrameView {model} {stream} {feeds} {audio} {still} />
  </div>
  {#if hint && model.layout === "empty"}
    <p class="screen-hint" style:font-size="{Math.max(10, Math.min(14, scale * 1920 * 0.028))}px">{hint}</p>
  {/if}
  {@render overlay?.()}
</div>

<style>
  .screen-hint {
    position: absolute;
    inset: auto 8% 50% 8%;
    transform: translateY(50%);
    margin: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.62);
    font-weight: 550;
    line-height: 1.35;
    text-wrap: balance;
    pointer-events: none;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
</style>
