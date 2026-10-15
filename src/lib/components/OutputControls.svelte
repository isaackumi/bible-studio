<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceDeskLine, audienceStatus } from "../display/status";
  import { isDesktop } from "../platform/runtime";

  let { compact = false }: { compact?: boolean } = $props();

  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const status = $derived(audienceStatus(session.output, isDesktop()));
  const desk = $derived(audienceDeskLine(session.output, isDesktop()));
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
  {#if !compact}
    <button type="button" onclick={() => session.testOutput()}>Test</button>
    <button type="button" onclick={() => session.openSettings("audience")}>Output</button>
  {/if}
  {#if compact}
    <p class="status" class:on={session.output.online} title={status.detail}>
      <span class="lamp" class:on={session.output.online}></span>
      <span class="name">{desk.title}</span>
      <span class="line">{desk.line}</span>
    </p>
  {:else}
    <p>{status.title}. {status.detail}</p>
  {/if}
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
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: min(320px, 40vw);
    padding: 4px 10px;
    border: 1px solid var(--line, #333);
    border-radius: 999px;
    background: var(--field, #1b1b1b);
    color: var(--muted, #bdbdbd);
  }
  .status.on {
    color: var(--ink, #f5f5f5);
    border-color: var(--live, #ff4458);
  }
  .lamp {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--line, #333);
  }
  .lamp.on { background: var(--live, #ff4458); }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 560;
  }
  .line { color: var(--muted, #bdbdbd); white-space: nowrap; }
</style>
