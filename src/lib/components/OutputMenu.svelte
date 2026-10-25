<script lang="ts">
  import { session } from "../app/session.svelte";
  import { onMount } from "svelte";
  import { screenLetter, type ScreenRole } from "../display/screens";
  import { audienceChip, audienceDeskLine } from "../display/status";
  import { isDesktop } from "../platform/runtime";
  import Icon from "./Icon.svelte";
  import ToolMenu from "./ToolMenu.svelte";
  import { msg, t, tn } from "../i18n/core";

  // One toolbar control for the audience output: its status on the button, the output actions in the menu.
  // The TV over Wi-Fi: its own chunk, loaded just after the desk starts (it keeps the desk's start-up small).
  let wifiDisplay = $state<(typeof import("../app/wifi-display.svelte"))["wifiDisplay"] | null>(null);
  onMount(() => {
    if (isDesktop()) void import("../app/wifi-display.svelte").then((module) => (wifiDisplay = module.wifiDisplay));
  });
  const JOB: Record<ScreenRole, string> = { program: msg("Program"), scripture: msg("Scripture"), lyrics: msg("Lyrics"), slides: msg("Slides"), timer: msg("Timer"), stage: msg("Stage"), blank: msg("Dark") };
  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const desk = $derived(audienceDeskLine(session.output, isDesktop()));
  const chip = $derived(audienceChip(session.output, isDesktop()));
  const external = $derived(session.output.displays.find((display) => !display.primary));
  const fullscreen = $derived(profile?.outputMode === "fullscreen");
  /** Program has content the audience cannot see yet: ask for attention. */
  /** NDI on the network: sending, starting or stopped with an error. */
  const ndiOn = $derived(session.ndi.status === "on" || session.ndi.status === "starting");
  const ndiWatchers = $derived(session.ndi.connections + (session.ndiKey.status === "on" ? session.ndiKey.connections : 0));
  const unseen = $derived(!session.output.online && session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
</script>

<ToolMenu
  label={t("Audience output")}
  tip={unseen ? t("Program has content, but the audience window is closed. Open output.") : `${desk.title} · ${desk.line}`}
  className={unseen ? "desk-btn output-trigger unseen" : "desk-btn output-trigger"}
>
  {#snippet trigger()}
    <span class="lamp" class:on={chip.on} class:warn={unseen}></span>
    {#if unseen}<span class="name long">{t("Not showing · Open")}</span><span class="name short">{t("Not showing")}</span>{:else}<span class="name">{chip.label}</span>{/if}
    {#if ndiOn || session.ndi.status === "error" || session.ndiKey.status === "on"}
      <span class="ndi" class:live={ndiWatchers > 0} class:bad={session.ndi.status === "error"} title={session.ndi.status === "error" ? session.ndi.message : tn(ndiWatchers, "NDI: {n} receiver watching", "NDI: {n} receivers watching")}>NDI{#if ndiWatchers}<b>{ndiWatchers}</b>{/if}</span>
    {/if}
    <Icon name="chevron-down" size={14} />
  {/snippet}
  {#snippet children(close)}
    {#if desk.line}<p class="menu-note">{desk.title} · {desk.line}</p>{/if}
    {#if session.output.desired}
      <button type="button" role="menuitem" onclick={() => { session.closeAudience(); close(); }}>{t("Close output")}</button>
      {#if !session.output.online}
        <button type="button" role="menuitem" onclick={() => { session.openAudience(); close(); }}>{t("Reopen output")}</button>
      {/if}
    {:else}
      <button type="button" role="menuitem" onclick={() => { session.openAudience(); close(); }}>
        {external ? t("Show on {name}", { name: session.monitorName(external) }) : t("Open output")}
      </button>
    {/if}
    <button type="button" role="menuitemcheckbox" aria-checked={fullscreen} onclick={() => { session.setOutputMode(fullscreen ? "window" : "fullscreen"); close(); }}>
      {t("Fullscreen")}
    </button>
    <button type="button" role="menuitem" onclick={() => { void session.openStage(); close(); }}>{t("Stage display")}</button>
    {#if isDesktop()}
      <div class="menu-sep"></div>
      <button type="button" role="menuitemcheckbox" aria-checked={ndiOn} onclick={() => { void (ndiOn ? session.stopNdi() : session.startNdi()); close(); }}>
        {t("Send over NDI")}{#if ndiOn}<span class="menu-note-inline">{tn(session.ndi.connections, "{n} watching", "{n} watching")}{session.ndi.audio ? ` · ${t("with sound")}` : ""}</span>{/if}
      </button>
      {#if wifiDisplay}
        {@const wifi = wifiDisplay}
        <!-- No HDMI cable (or one that drops): a TV's own browser on the church Wi-Fi shows the screen. -->
        <button type="button" role="menuitemcheckbox" aria-checked={wifi.on} onclick={() => { void wifi.toggle(); close(); }}>
          {t("Show on a TV over Wi-Fi")}{#if wifi.on}<span class="menu-note-inline">{tn(wifi.watching, "{n} watching", "{n} watching")}</span>{/if}
        </button>
        {#if wifi.on}
          <p class="menu-note">{t("On the TV's browser, open {url}", { url: wifi.url.replace(/^https?:\/\//, "") })}</p>
          <button type="button" role="menuitem" onclick={() => { wifi.qrOnPreview(); close(); }}>{t("Its address as a QR code on Preview")}</button>
        {/if}
        {#if wifi.error}<p class="menu-note">{wifi.error}</p>{/if}
      {/if}
    {/if}
    {#if isDesktop() && (session.workspace.screens ?? []).length}
      <!-- The extra screens, by name and job, so nobody has to dig into Settings to know what goes where. -->
      <div class="menu-sep"></div>
      {#each session.screensForNow() as screen, index (screen.id)}
        {@const place = session.screenPlaces().get(screen.id)}
        <p class="menu-note">{screen.name || (place?.state === "showing" ? session.monitorName(place.display) : place?.state === "wifi" ? t("TV over Wi-Fi") : t("Screen {name}", { name: screenLetter(index) }))} · {t(JOB[screen.role])}{place?.state !== "showing" && place?.state !== "wifi" ? ` · ${t("not showing")}` : ""}</p>
      {/each}
    {/if}
    <button type="button" role="menuitem" onclick={() => { session.openSettings("screens"); close(); }}>{t("Screens and monitors…")}</button>
    <div class="menu-sep"></div>
    <button type="button" role="menuitem" onclick={() => { session.testOutput(); close(); }}>{t("Test output")}</button>
    <button type="button" role="menuitem" onclick={() => { session.openSettings("audience"); close(); }}>{t("Output settings…")}</button>
  {/snippet}
</ToolMenu>

<style>
  :global(.output-trigger) { max-width: min(260px, 28vw); flex-shrink: 0; }
  .lamp { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--line); }
  .lamp.on { background: var(--presence); box-shadow: 0 0 8px var(--presence); }
  .lamp.warn { background: #f5a524; box-shadow: 0 0 8px #f5a524; animation: warn-blink 1.2s ease-in-out infinite; }
  :global(.output-trigger.unseen) { border-color: #f5a524 !important; color: #f5a524 !important; background: color-mix(in srgb, #f5a524 12%, var(--field)) !important; }
  @keyframes warn-blink { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .lamp.warn { animation: none; } }
  .ndi { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 5px; border: 1px solid var(--line); border-radius: 5px; font-size: 10px; font-weight: 800; letter-spacing: 0.02em; color: var(--muted); }
  .ndi.live { border-color: color-mix(in srgb, var(--presence) 60%, var(--line)); color: var(--presence); }
  .ndi.bad { border-color: #e5484d; color: #e5484d; }
  .ndi b { font-weight: 800; }
  .menu-note-inline { margin-left: auto; padding-left: 10px; font-size: 11px; color: var(--muted); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  /* A narrow bar keeps the warning whole and lets the menu say how to open the screen. */
  .short { display: none; }
  @container desk (max-width: 1180px) { .long { display: none; } .short { display: inline; } }
</style>
