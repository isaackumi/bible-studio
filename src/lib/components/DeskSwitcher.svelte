<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceRoom } from "../app/rooms.svelte";
  import { pictures } from "../app/pictures.svelte";
  import { isDesktop } from "../platform/runtime";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";
  import { keys } from "../platform/os";

  // Two small groups, so the bar stays short: which desk (Presenter, Conductor or Production), and what opens
  // beside it (the design studio, Audience, Pictures). Only the desk in use and an open drawer say
  // their name; the rest are icons with their name on hover, and every name shows on a very wide bar.
  let { compact = false }: { compact?: boolean } = $props();

  const production = $derived(session.workspace.appearance.desk === "obs" && session.entitled("production"));
  const conductor = $derived(session.workspace.appearance.desk === "conductor");
  // The cloud copy at a glance, on computers that sync: synced, syncing, offline, or needing a look.
  const cloud = $derived(session.cloud && !["off", "free", "signedOut"].includes(session.cloud.status) ? session.cloud : null);
  const cloudTip = $derived(
    !cloud
      ? ""
      : cloud.status === "syncing"
        ? t("Syncing…")
        : cloud.status === "idle"
          ? cloud.lastSyncAt
            ? t("Library synced, last at {time}", { time: new Date(cloud.lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })
            : t("Library synced")
          : cloud.status === "offline"
            ? t("Offline: changes stay on this computer and sync when the internet is back.")
            : t("Sync needs a look: {reason}", { reason: cloud.message || t("open Cloud space for details.") }),
  );
  const waiting = $derived((audienceRoom.view?.questions.filter((question) => question.state === "pending").length ?? 0) > 0);
</script>

<nav class="desk-switch" class:compact aria-label={t("Desk")}>
  <div class="group" role="group" aria-label={t("Desk")}>
    <button type="button" class:on={!production && !conductor} aria-label={t("Presenter Desk")} aria-pressed={!production && !conductor} data-tip={t("Presenter Desk: scripture, songs and sermons")} onclick={() => session.setAppearance({ desk: "pewbeam" })}>
      <Icon name="pew" size={16} />
      <span class="name">{t("Presenter")}</span>
    </button>
    <button type="button" class:on={conductor} aria-label={t("Conductor Desk")} aria-pressed={conductor} data-tip={t("Conductor Desk: Next and Live side by side, a lever to go live")} onclick={() => session.setAppearance({ desk: "conductor" })}>
      <Icon name="transition" size={16} />
      <span class="name">{t("Conductor")}</span>
    </button>
    <button type="button" class:on={production} aria-label={t("Production Desk")} aria-pressed={production} data-tip={t("Production Desk: scenes, cameras and video")} onclick={() => session.requireFeature("production") && session.setAppearance({ desk: "obs" })}>
      <Icon name="obs" size={16} />
      <span class="name">{t("Production")}</span>
    </button>
  </div>
  <div class="group" role="group" aria-label={t("Open beside the desk")}>
    <!-- Not a desk: the design studio opens over whichever desk is showing. -->
    <button type="button" class:on={!!session.studio} aria-label={t("Design studio")} data-tip={keys(t("Design studio: slides, templates, lower thirds, gradients and icons (⌘K, then type “design”)"))} onclick={() => session.openStudio()}>
      <Icon name="stage" size={16} />
      <span class="name">{t("Studio")}</span>
    </button>
    <!-- The congregation's phones: Q&A, quizzes and polls (a drawer beside the desk). -->
    <button type="button" class:on={audienceRoom.open} aria-label={t("Audience")} aria-pressed={audienceRoom.open} data-tip={t("Audience: live Q&A, quizzes, Bible games and polls on people's phones")} onclick={() => (audienceRoom.open ? audienceRoom.hide() : audienceRoom.show())}>
      <Icon name="users" size={16} />
      <span class="name">{t("Audience")}</span>
      {#if waiting}<span class="dot" aria-hidden="true"></span>{/if}
    </button>
    <!-- Pictures straight from a folder, and slideshows (a drawer, like Audience). Folders need the desktop app. -->
    {#if isDesktop()}
      <button type="button" class:on={pictures.open} aria-label={t("Pictures")} aria-pressed={pictures.open} data-tip={t("Pictures: show a folder of pictures, or run it as a slideshow")} onclick={() => (pictures.open ? pictures.hide() : pictures.show())}>
        <Icon name="media" size={16} />
        <span class="name">{t("Pictures")}</span>
        {#if pictures.slideshow.running}<span class="dot" class:paused={pictures.slideshow.paused} aria-hidden="true"></span>{/if}
      </button>
    {/if}
  </div>
  {#if cloud}
    <div class="group" role="group" aria-label={t("Cloud sync")}>
      <button type="button" class="cloud" aria-label={cloudTip} data-tip={cloudTip} onclick={() => session.openSettings("account")}>
        <Icon name="cloud" size={16} />
        {#if cloud.status !== "idle"}<span class="dot" class:busy={cloud.status === "syncing"} class:paused={cloud.status === "offline"} class:bad={cloud.status !== "syncing" && cloud.status !== "offline"} aria-hidden="true"></span>{/if}
      </button>
    </div>
  {/if}
</nav>

<style>
  .desk-switch { gap: 6px; }
  /* Each group is one pill, like the page tabs beside it. */
  .group { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: calc(var(--radius-control) + 2px); background: var(--field); }
  .desk-switch .group button { height: calc(var(--tool-size) - 6px); min-width: calc(var(--tool-size) - 6px); padding: 0 8px; border: 1px solid transparent; background: transparent; justify-content: center; }
  .desk-switch .group button:hover { color: var(--ink); }
  .desk-switch .group button.on { border-color: var(--accent); background: var(--panel); color: var(--ink); }
  .name { display: none; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .on .name { display: inline; }
  /* Questions are waiting for the operator. */
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  /* A slideshow is on the screen (amber while paused). */
  .dot.paused { background: #f5a524; }
  /* Sync: under way (pulsing), or needing a look (red). */
  .dot.busy { animation: pulse 1.2s ease-in-out infinite; }
  .dot.bad { background: #ff6b4a; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .dot.busy { animation: none; } }
  /* Plenty of room: every name. */
  @container desk (min-width: 1720px) {
    .name { display: inline; }
  }
</style>
