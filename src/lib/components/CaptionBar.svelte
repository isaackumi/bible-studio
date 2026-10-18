<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { parseCaptionFrame, subscribeCaptionsLocal, type CaptionFrame } from "../display/channel";
  import { isDesktop } from "../platform/runtime";
  import { t } from "../i18n/core";

  // Live captions on the audience screen: the newest words in a bar over Program. The desk sends
  // them apart from Program, so captions never disturb what is on the screen.
  let frame = $state<CaptionFrame | null>(null);

  onMount(() => {
    const stop = subscribeCaptionsLocal((next) => (frame = next));
    let unlisten = () => {};
    if (isDesktop()) {
      void listen<string>("captions", (event) => {
        const next = parseCaptionFrame(event.payload);
        if (next) frame = next;
      }).then((stopListening) => (unlisten = stopListening));
    }
    return () => {
      stop();
      unlisten();
    };
  });
</script>

{#if frame && frame.rows.length}
  <div class="captions {frame.position} size-{frame.size}" role="log" aria-live="polite" aria-label={t("Captions")}>
    {#each frame.rows as row, n (n)}<p>{row}</p>{/each}
  </div>
{/if}

<style>
  .captions {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    width: min(88vw, 1500px);
    padding: 0.5em 1em;
    border-radius: 0.4em;
    background: rgb(0 0 0 / 0.78);
    color: #fff;
    font-family: Inter, system-ui, sans-serif;
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
    pointer-events: none;
  }
  .captions.bottom { bottom: 4vh; }
  .captions.top { top: 4vh; }
  .captions p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .size-s { font-size: 2.4vh; }
  .size-m { font-size: 3.2vh; }
  .size-l { font-size: 4.2vh; }
</style>
