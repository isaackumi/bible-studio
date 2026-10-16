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
    overlay,
  }: {
    model: PresentationModel;
    sourceId?: string | null;
    /** Open camera feeds by camera source id. Absent feeds paint the camera card. */
    feeds?: CameraFeeds<MediaStream>;
    /** Audience only: let video play its sound. */
    audio?: boolean;
    overlay?: Snippet;
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
    <FrameView {model} {stream} {feeds} {audio} />
  </div>
  {@render overlay?.()}
</div>
