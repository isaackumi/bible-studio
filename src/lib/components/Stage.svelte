<script lang="ts">
  import { session } from "../app/session.svelte";
  import Screen from "./Screen.svelte";

  let { part }: { part: "preview" | "program" } = $props();
</script>

<section class="stage">
  {#if part === "preview"}
    <div class="well preview-well">
      <div class="well-label"><span>Preview</span><span>Preparing</span></div>
      <div class="mat"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
    </div>
  {:else}
    <div class="well program-well">
      <div class="well-label"><span>Program</span><span class="lamp" aria-hidden="true"></span></div>
      <div class="mat"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
    </div>
  {/if}
</section>
