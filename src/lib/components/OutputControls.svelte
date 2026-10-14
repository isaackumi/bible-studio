<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceStatus } from "../display/status";
  import { isDesktop } from "../platform/runtime";

  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const status = $derived(audienceStatus(session.output, isDesktop()));
</script>

<div class="output-controls">
  {#if session.output.desired}
    <button type="button" onclick={() => session.closeAudience()}>Close output</button>
  {:else}
    <button type="button" onclick={() => session.openAudience()}>Open output</button>
  {/if}
  {#if session.output.desired && !session.output.online}
    <button type="button" onclick={() => session.openAudience()}>Reopen</button>
  {/if}
  <button type="button" onclick={() => session.setOutputMode(profile?.outputMode === "fullscreen" ? "window" : "fullscreen")}>
    {profile?.outputMode === "fullscreen" ? "Window" : "Fullscreen"}
  </button>
  <button type="button" onclick={() => session.testOutput()}>Test</button>
  <button type="button" onclick={() => session.openSettings("audience")}>Output</button>
  <p>{status.title}. {status.detail}</p>
</div>

<style>
  .output-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  button {
    border: 1px solid var(--line, #333);
    background: transparent;
    color: inherit;
    border-radius: 999px;
    height: 28px;
    padding: 0 10px;
    font: inherit;
    font-size: 12px;
  }
  p {
    margin: 0;
    color: var(--ink, #f5f5f5);
    font-size: 12px;
  }
</style>
