<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceChip, audienceDeskLine } from "../display/status";
  import { isDesktop } from "../platform/runtime";
  import Icon from "./Icon.svelte";
  import ToolMenu from "./ToolMenu.svelte";

  // One toolbar control for the audience output: its status on the button, the output actions in the menu.
  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const desk = $derived(audienceDeskLine(session.output, isDesktop()));
  const chip = $derived(audienceChip(session.output, isDesktop()));
  const external = $derived(session.output.displays.find((display) => !display.primary));
  const fullscreen = $derived(profile?.outputMode === "fullscreen");
</script>

<ToolMenu label="Audience output" tip={`${desk.title} · ${desk.line}`} className="desk-btn output-trigger">
  {#snippet trigger()}
    <span class="lamp" class:on={chip.on}></span>
    <span class="name">{chip.label}</span>
    <Icon name="chevron-down" size={14} />
  {/snippet}
  {#snippet children(close)}
    {#if desk.line}<p class="menu-note">{desk.title} · {desk.line}</p>{/if}
    {#if session.output.desired}
      <button type="button" role="menuitem" onclick={() => { session.closeAudience(); close(); }}>Close output</button>
      {#if !session.output.online}
        <button type="button" role="menuitem" onclick={() => { session.openAudience(); close(); }}>Reopen output</button>
      {/if}
    {:else}
      <button type="button" role="menuitem" onclick={() => { session.openAudience(); close(); }}>
        {external ? `Show on ${external.name}` : "Open output"}
      </button>
    {/if}
    <button type="button" role="menuitemcheckbox" aria-checked={fullscreen} onclick={() => { session.setOutputMode(fullscreen ? "window" : "fullscreen"); close(); }}>
      Fullscreen
    </button>
    <button type="button" role="menuitem" onclick={() => { void session.openStage(); close(); }}>Stage display</button>
    <div class="menu-sep"></div>
    <button type="button" role="menuitem" onclick={() => { session.testOutput(); close(); }}>Test output</button>
    <button type="button" role="menuitem" onclick={() => { session.openSettings("audience"); close(); }}>Output settings…</button>
  {/snippet}
</ToolMenu>

<style>
  :global(.output-trigger) { max-width: min(260px, 28vw); }
  .lamp { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--line); }
  .lamp.on { background: var(--presence); box-shadow: 0 0 8px var(--presence); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
</style>
