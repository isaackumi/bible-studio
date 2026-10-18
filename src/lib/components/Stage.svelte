<script lang="ts">
  import { session } from "../app/session.svelte";
  import Screen from "./Screen.svelte";
  import { t } from "../i18n/core";

  let { part }: { part: "preview" | "program" } = $props();
</script>

<section class="stage">
  {#if part === "preview"}
    <div class="well preview-well">
      <div class="well-label"><span>{t("Preview")}</span><span>{t("Preparing")}</span></div>
      <div class="mat"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint={t("Nothing on Preview yet. Pick a verse, song or slide.")} /></div>
    </div>
  {:else}
    <div class="well program-well">
      <div class="well-label"><span>{t("Program")}</span><span class="lamp" aria-hidden="true"></span></div>
      <div class="mat"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint={t("The audience sees nothing yet. Press LIVE (Space) to send Preview.")} /></div>
    </div>
  {/if}
</section>
