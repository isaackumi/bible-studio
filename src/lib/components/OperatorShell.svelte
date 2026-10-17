<script lang="ts">
  import RemoteApproval from "./RemoteApproval.svelte";
  import UpgradePrompt from "./UpgradePrompt.svelte";
  import Welcome from "./onboarding/Welcome.svelte";
  import TourGuide from "./tour/TourGuide.svelte";
  import TourHub from "./tour/TourHub.svelte";
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import { createKeyboardManager, defaultShortcuts } from "../keyboard/manager";
  import FindOverlay from "./FindOverlay.svelte";
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
    root.toggleAttribute("data-calm", appearance.calm === true);
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--on-accent", readableOn(appearance.accent));
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
    // Inside a modal dialog, keys belong to the dialog (Space presses its button, never Take).
    // Escape still reaches the desk, which closes Find.
    if (target?.closest('[aria-modal="true"]') && event.code !== "Escape") return;
    createKeyboardManager(session.workspace.shortcuts ?? defaultShortcuts, {
      take: () => void session.run("take"),
      cut: () => void session.run("cut"),
      previous: () => void session.run("previous"),
      next: () => void session.run("next"),
      clear: () => void session.run("clear"),
      black: () => void session.run("black"),
      logo: () => void session.run("logo"),
      escape: () => session.run("escape"),
      focus: () => session.run("focus"),
      library: () => session.run("library"),
      queue: () => session.run("queue"),
      find: () => session.run("find"),
    }).onKeyDown({
      code: event.code,
      target: target
        ? { tagName: target.tagName, isContentEditable: target.isContentEditable, role: target.getAttribute("role") }
        : null,
      modified: event.metaKey || event.ctrlKey || event.altKey,
      defaultPrevented: event.defaultPrevented,
      preventDefault: () => event.preventDefault(),
    });
  }

  /** Black or white text, whichever reads on this accent (a light Mustard accent needs black). */
  function readableOn(hex: string): string {
    const value = hex.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return "#fff";
    const [r, g, b] = [0, 2, 4].map((at) => {
      const channel = parseInt(value.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45 ? "#111" : "#fff";
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if session.ready}
  <div class="app pb-app">
    <!-- The Production Desk is a Premium feature: on Free (or after a trial) the Presenter Desk shows. -->
    {#if session.workspace.appearance.desk === "obs" && session.entitled("production")}
      <ObsDesk />
    {:else}
      <PewDesk />
    {/if}
    <FindOverlay />
    {#if session.settingsOpen}
      <SettingsDialog />
    {/if}
    <RemoteApproval />
    <UpgradePrompt />
    {#if session.tourHubOpen}<TourHub />{/if}
    {#if session.tour}<TourGuide />{/if}
  </div>
{/if}
{#if !session.booted || !session.workspace.onboarded}
  <Welcome booting={!session.booted} />
{/if}
