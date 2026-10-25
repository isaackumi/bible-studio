<script lang="ts">
  import RemoteApproval from "./RemoteApproval.svelte";
  import Paywall from "./Paywall.svelte";
  import Toast from "./Toast.svelte";
  import { audienceRoom } from "../app/rooms.svelte";
  import { pictures } from "../app/pictures.svelte";
  import UpdateNotice from "./UpdateNotice.svelte";
  import StatusLine from "./StatusLine.svelte";
  import WhatsNew from "./WhatsNew.svelte";
  import Welcome from "./onboarding/Welcome.svelte";
  import TourGuide from "./tour/TourGuide.svelte";
  import TourHub from "./tour/TourHub.svelte";
  import { onMount, untrack } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { session } from "../app/session.svelte";
  import { trackProgram } from "../app/sermon-clock.svelte";
  import { uiLanguage } from "../i18n/i18n.svelte";
  import { outputShape } from "../display/output-shape.svelte";
  import { AUDIENCE_ASPECT_KEY, aspectFor, sanitizeScreenShape } from "../display/shape";
  import { isDesktop } from "../platform/runtime";
  import { loadLanguage, sanitizeUiLanguage, t, type UiLanguage } from "../i18n/core";
  import { createKeyboardManager, defaultShortcuts } from "../keyboard/manager";
  import FindOverlay from "./FindOverlay.svelte";
  import PartPickerDialog from "./pew/PartPickerDialog.svelte";
  import ObsDesk from "./obs/ObsDesk.svelte";
  import PewDesk from "./pew/PewDesk.svelte";

  // The desk's language: its lines are loaded first and the desk switches once they are here, so it
  // never shows half one language. The last one is remembered on this computer, so a French desk
  // starts loading French before the settings are even read.
  const LANGUAGE_KEY = "church-studio:ui-language";
  let wantedLanguage: UiLanguage = "en";
  function showLanguage(language: UiLanguage) {
    wantedLanguage = language;
    void loadLanguage(language)
      .then(() => {
        if (wantedLanguage !== language) return;
        uiLanguage.current = language;
        document.documentElement.lang = language;
        try {
          localStorage.setItem(LANGUAGE_KEY, language);
        } catch {
          // Storage refused: the language still comes from the settings, a moment later.
        }
      })
      .catch(() => {
        // The lines could not load (they are inside the app, so this should not happen): stay as is.
      });
  }
  try {
    showLanguage(sanitizeUiLanguage(localStorage.getItem(LANGUAGE_KEY)));
  } catch {
    // No storage: English until the settings are read.
  }

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
    // Every schematic and preview of the audience screen (CSS aspect-ratio: var(--output-aspect)) takes its shape.
    document.documentElement.style.setProperty("--output-aspect", String(outputShape.aspect));
  });

  $effect(() => {
    const appearance = session.workspace.appearance;
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.dataset.density = appearance.density;
    root.style.setProperty("--ui-scale", String(appearance.scale));
    root.style.setProperty("zoom", String(appearance.scale));
    root.dataset.desk = appearance.desk;
    showLanguage(appearance.language ?? "en");
    root.toggleAttribute("data-calm", appearance.calm === true);
    root.toggleAttribute("data-contrast", appearance.contrast === true);
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--on-accent", readableOn(appearance.accent));
    root.style.setProperty("--brass", appearance.accent);
    root.style.setProperty("--focus", appearance.accent);
  });

  // Screens follow the service: when a part begins, unlocked screens take the job it gives them.
  $effect(() => {
    const now = JSON.stringify(session.screensForNow().map((screen) => [screen.id, screen.role]));
    if (now === lastScreens) return;
    lastScreens = now;
    untrack(() => session.broadcastScreens());
  });
  let lastScreens = "";

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

  // The sermon clock follows Program on every page, so it is right whenever the Sermon page opens.
  // A black screen mid-sermon keeps it counting: the preacher is still preaching.
  $effect(() => {
    const program = session.live.program;
    if (program.model.layout !== "black") trackProgram(program.sourceId ?? "");
  });
</script>

<svelte:window onkeydown={onKeyDown} />

{#if session.ready}
  <div class="app pb-app" class:docked={audienceRoom.open || pictures.open}>
    <!-- The Production Desk is a Premium feature: on Free (or after a trial) the Presenter Desk shows. -->
    {#if session.workspace.appearance.desk === "obs" && session.entitled("production")}
      <ObsDesk />
    {:else}
      <PewDesk />
    {/if}
    <FindOverlay />
    {#if session.settingsOpen}
      <!-- Its own chunk, fetched when first opened: Settings is large and the desk starts without it. -->
      {#await import("./settings/SettingsDialog.svelte") then { default: SettingsDialog }}<SettingsDialog />{/await}
    {/if}
    <RemoteApproval />
    <Paywall />
    <PartPickerDialog />
    {#if !isDesktop() && !import.meta.env.DEV}
      <!-- The browser version is a demo: Premium and the trial are in the installed app. -->
      <a class="demo-badge" href="https://church-studio.heitechinc.com/#download" target="_blank" rel="noopener" title={t("This is the browser demo. Download the app for the Premium trial, the audience screen on a projector, voice, streaming and more.")}>
        <i aria-hidden="true"></i>{t("Browser demo")} · <b>{t("Get the app")}</b>
      </a>
    {/if}
    {#if audienceRoom.open}{#await import("./audience/AudiencePanel.svelte") then { default: AudiencePanel }}<AudiencePanel />{/await}{/if}
    <!-- Loaded when first opened: the folder browser and slideshow settings stay out of the desk's start-up. -->
    {#if pictures.open}{#await import("./pictures/PicturesPanel.svelte") then { default: PicturesPanel }}<PicturesPanel />{/await}{/if}
    {#if session.studio}
      {@const studioDeck = session.decks.find((deck) => deck.id === session.studio?.deckId)}
      {#if studioDeck}
        <!-- The studio is its own chunk, fetched when first opened. -->
        {#await import("./decks/DeckEditor.svelte") then { default: DeckEditor }}
          {#key studioDeck.id}<DeckEditor deck={studioDeck} startWith={session.studio.start} onclose={() => session.closeStudio()} />{/key}
        {/await}
      {/if}
    {/if}
    <!-- Its own chunk, loaded just after the desk starts (⌘K works a moment later). -->
    {#await import("./CommandPalette.svelte") then { default: CommandPalette }}<CommandPalette />{/await}
    <!-- The desk's notes share the bottom-left corner, stacked so none covers another: the latest
         action's note at the bottom, then the status line, then an update waiting. -->
    <div class="corner-notes">
      <Toast />
      <StatusLine />
      <UpdateNotice />
    </div>
    <!-- The audience screen dropped out: its own chunk, loaded only when that happens. -->
    {#if session.screenLost}{#await import("./ScreenLost.svelte") then { default: ScreenLost }}<ScreenLost name={session.screenLost} />{/await}{/if}
    <!-- Loaded just after start-up: nothing is running yet when the desk opens. -->
    {#await import("./NowRunning.svelte") then { default: NowRunning }}<NowRunning />{/await}
    <WhatsNew />
    {#if session.tourHubOpen}<TourHub />{/if}
    {#if session.tour}<TourGuide />{/if}
  </div>
{/if}
{#if !session.booted || !session.workspace.onboarded}
  <Welcome booting={!session.booted} />
{/if}

<style>
  .corner-notes { position: fixed; left: 20px; bottom: 20px; z-index: 900; display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 8px; pointer-events: none; }
  .corner-notes > :global(*) { pointer-events: auto; }
</style>
