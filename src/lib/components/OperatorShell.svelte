<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import { createKeyboardManager, defaultShortcuts } from "../keyboard/manager";
  import ObsDesk from "./obs/ObsDesk.svelte";
  import PewDesk from "./pew/PewDesk.svelte";
  import SettingsDialog from "./settings/SettingsDialog.svelte";

  onMount(() => {
    void session.init();
    return () => session.destroy();
  });

  $effect(() => {
    const appearance = session.workspace.appearance;
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.dataset.density = appearance.density;
    root.style.setProperty("--ui-scale", String(appearance.scale));
    root.style.setProperty("zoom", String(appearance.scale));
    root.dataset.desk = appearance.desk;
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--brass", appearance.accent);
    root.style.setProperty("--focus", appearance.accent);
  });

  function onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.code === "Comma") {
      event.preventDefault();
      session.settingsOpen = true;
      return;
    }
    if (session.settingsOpen) {
      if (event.code === "Escape") {
        session.settingsOpen = false;
        event.preventDefault();
      }
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    createKeyboardManager(session.workspace.shortcuts ?? defaultShortcuts, {
      take: () => void session.run("take"),
      cut: () => void session.run("cut"),
      previous: () => void session.run("previous"),
      next: () => void session.run("next"),
      clear: () => void session.run("clear"),
      black: () => void session.run("black"),
      logo: () => void session.run("logo"),
      escape: () => session.run("escape"),
    }).onKeyDown({
      code: event.code,
      target,
      preventDefault: () => event.preventDefault(),
    });
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if !session.ready}
  <div class="boot">CHURCH STUDIO</div>
{:else}
  <div class="app pb-app">
    {#if session.workspace.appearance.desk === "obs"}
      <ObsDesk />
    {:else}
      <PewDesk />
    {/if}
    {#if session.settingsOpen}
      <SettingsDialog />
    {/if}
  </div>
{/if}
