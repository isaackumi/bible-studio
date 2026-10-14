<script lang="ts">
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";

  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const selected = $derived(session.output.displays.find((display) => display.key === profile?.assignments.audience));
  const label = $derived(
    isDesktop()
      ? selected?.name || (profile?.assignments.audience ? "Saved display is disconnected" : "No external display")
      : "Browser window",
  );
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
  <button type="button" onclick={() => session.openSettings("displays")}>Displays</button>
  <p>{label} · {session.output.online ? "Connected" : "Not showing"} · {session.output.message}</p>
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
    color: var(--muted, #9aa3b2);
    font-size: 12px;
  }
</style>
