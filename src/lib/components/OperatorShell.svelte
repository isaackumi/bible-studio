<script lang="ts">
  import RemoteApproval from "./RemoteApproval.svelte";
  import Paywall from "./Paywall.svelte";
  import Toast from "./Toast.svelte";
  import UpdateNotice from "./UpdateNotice.svelte";
  import StatusLine from "./StatusLine.svelte";
  import WhatsNew from "./WhatsNew.svelte";
  import Welcome from "./onboarding/Welcome.svelte";
  import TourGuide from "./tour/TourGuide.svelte";
  import TourHub from "./tour/TourHub.svelte";
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { session } from "../app/session.svelte";
  import { uiLanguage } from "../i18n/i18n.svelte";
  import { outputShape } from "../display/output-shape.svelte";
  import { AUDIENCE_ASPECT_KEY, aspectFor, sanitizeScreenShape } from "../display/shape";
  import { isDesktop } from "../platform/runtime";
  import { createKeyboardManager, defaultShortcuts } from "../keyboard/manager";
  import FindOverlay from "./FindOverlay.svelte";
  import ObsDesk from "./obs/ObsDesk.svelte";
  import PewDesk from "./pew/PewDesk.svelte";
  import SettingsDialog from "./settings/SettingsDialog.svelte";

  onMount(() => {
    void session.init();
    // Development builds only: a handle for the browser console and end-to-end checks.
    if (import.meta.env.DEV) (window as unknown as { __churchStudio?: typeof session }).__churchStudio = session;
    // The audience window reports the shape of its screen; every monitor here follows it.
    let stopShape = () => {};
    if (isDesktop()) {
      void listen<number>("audience-shape", (event) => session.noteAudienceAspect(event.payload)).then((stop) => (stopShape = stop));
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUDIENCE_ASPECT_KEY && event.newValue) session.noteAudienceAspect(Number(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    // Save at once when the window is hidden or closes, so the last change is never lost.
    const onHide = () => {
      if (document.visibilityState === "hidden") void session.flushSave();
    };
    const onLeave = () => void session.flushSave();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    let stopClose = () => {};
    if (isDesktop()) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
        getCurrentWindow()
          .onCloseRequested(async () => {
            await session.flushSave();
          })
          .then((stop) => (stopClose = stop)),
      );
    }
    // Countdown beeps: a few readings a second so each mark sounds on time.
    const timerWatch = setInterval(() => session.timerTick(), 200);
    return () => {
      clearInterval(timerWatch);
      stopShape();
      stopClose();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      session.destroy();
    };
  });

  $effect(() => {
    const appearance = session.workspace.appearance;
    outputShape.aspect = aspectFor(sanitizeScreenShape(appearance.screenShape), appearance.measuredAspect ?? null);
  });

  $effect(() => {
    const appearance = session.workspace.appearance;
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.dataset.density = appearance.density;
    root.style.setProperty("--ui-scale", String(appearance.scale));
    root.style.setProperty("zoom", String(appearance.scale));
    root.dataset.desk = appearance.desk;
    uiLanguage.current = appearance.language ?? "en";
    root.lang = uiLanguage.current;
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
    // ⌘Z / Ctrl+Z outside text fields undoes the last Program change (text fields keep their own undo).
    const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if (event.code === "KeyZ" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !typing) {
      event.preventDefault();
      void session.undoProgram();
      return;
    }
    createKeyboardManager(session.workspace.shortcuts ?? defaultShortcuts, {
      take: () => void session.run("take"),
      cut: () => void session.run("cut"),
      previous: () => void session.run("previous"),
      next: () => void session.run("next"),
      clear: () => void session.run("clear"),
      "clear-words": () => void session.run("clear-words"),
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
    <Paywall />
    <Toast />
    <UpdateNotice />
    <StatusLine />
    <WhatsNew />
    {#if session.tourHubOpen}<TourHub />{/if}
    {#if session.tour}<TourGuide />{/if}
  </div>
{/if}
{#if !session.booted || !session.workspace.onboarded}
  <Welcome booting={!session.booted} />
{/if}
