<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceChip, audienceDeskLine } from "../display/status";
  import { isDesktop } from "../platform/runtime";

  let { compact = false }: { compact?: boolean } = $props();

  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const desk = $derived(audienceDeskLine(session.output, isDesktop()));
  const chip = $derived(audienceChip(session.output, isDesktop()));
  const external = $derived(session.output.displays.find((display) => !display.primary));
</script>

<div class="output-controls" class:compact>
  {#if session.output.desired}
    <button type="button" class="desk-btn" onclick={() => session.closeAudience()}>Close output</button>
  {:else}
    <button type="button" class="desk-btn" onclick={() => session.openAudience()}>
      {external ? `Show on ${external.name}` : "Open output"}
    </button>
  {/if}
  {#if session.output.desired && !session.output.online}
    <button type="button" class="desk-btn" onclick={() => session.openAudience()}>Reopen</button>
  {/if}
  <button type="button" class="desk-btn" onclick={() => session.setOutputMode(profile?.outputMode === "fullscreen" ? "window" : "fullscreen")}>
    {profile?.outputMode === "fullscreen" ? "Window" : "Fullscreen"}
  </button>
  {#if !compact}
    <button type="button" class="desk-btn" onclick={() => session.testOutput()}>Test</button>
    <button type="button" class="desk-btn" onclick={() => session.openSettings("audience")}>Output</button>
  {/if}
  <p class="status" class:on={chip.on} title={`${desk.title} · ${desk.line}`}>
    <span class="lamp" class:on={chip.on}></span>
    <span class="name">{chip.label}</span>
    {#if compact && desk.line && chip.on}
      <span class="line">{desk.line}</span>
    {/if}
  </p>
</div>

<style>
  .output-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: min(360px, 42vw);
    height: var(--control-h);
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--field);
    color: var(--muted);
    margin: 0;
    font-size: 12px;
  }
  .status.on { color: var(--ink); }
  .lamp {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--line);
  }
  .lamp.on { background: var(--presence); box-shadow: 0 0 8px var(--presence); }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 560;
  }
  .line { color: var(--muted); white-space: nowrap; }
  @media (max-width: 1280px) {
    .compact .line { display: none; }
  }
</style>
