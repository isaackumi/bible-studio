<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { onMount } from "svelte";
  import { CONTENT_KINDS, MAX_SCREENS, SCREEN_ROLES, WIFI_SCREEN, screenLetter, type ContentKind, type ScreenOutput, type ScreenRole } from "../../display/screens";
  import { isDesktop } from "../../platform/runtime";
  import { msg, t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Extra screens: each monitor beyond the desk and the audience screen gets a job, and a lock.

  const screens = $derived(session.workspace.screens ?? []);
  const places = $derived(session.screenPlaces());
  const now = $derived(session.screensForNow());
  const displays = $derived(session.output.displays);
  const entitled = $derived(session.entitled("screens"));

  const ROLE_TEXT: Record<ScreenRole, { label: string; about: string }> = {
    program: { label: msg("Program"), about: msg("Everything the audience sees, except cameras") },
    scripture: { label: msg("Scripture"), about: msg("Only verses; dark between them") },
    lyrics: { label: msg("Lyrics"), about: msg("Only song words; dark between them") },
    slides: { label: msg("Slides"), about: msg("Slides, pictures and videos; dark between them") },
    timer: { label: msg("Timer"), about: msg("The countdown, the part's time left, or the clock") },
    stage: { label: msg("Stage"), about: msg("Now and next, notes, clock and messages") },
    blank: { label: msg("Dark"), about: msg("Nothing, until it is given a job") },
  };

  // A screen can be a TV's browser on the Wi-Fi: its own address, from the Wi-Fi display.
  let wifi = $state<(typeof import("../../app/wifi-display.svelte"))["wifiDisplay"] | null>(null);
  onMount(() => {
    if (isDesktop()) void import("../../app/wifi-display.svelte").then((module) => (wifi = module.wifiDisplay));
  });
  async function chooseMonitor(id: string, value: string) {
    session.setScreenDisplay(id, value || null);
    if (value === WIFI_SCREEN && wifi && !wifi.on) await wifi.start();
  }

  function where(id: string): { text: string; ok: boolean } {
    const place = places.get(id);
    if (place?.state === "wifi") {
      return wifi?.on ? { text: t("On the TV's browser, open {url}", { url: wifi.linkFor(id).replace(/^https?:\/\//, "") }), ok: true } : { text: t("Starting the Wi-Fi screen…"), ok: false };
    }
    if (!place || place.state === "no-monitor") return { text: t("Choose its monitor"), ok: false };
    if (place.state === "missing") return { text: t("Its monitor is not connected. It comes back when the monitor does."), ok: false };
    if (place.state === "taken") {
      return {
        text: place.by === "desk" ? t("That monitor has the desk. Choose another.") : place.by === "audience" ? t("That monitor has the audience screen. Choose another.") : t("Another screen already uses that monitor."),
        ok: false,
      };
    }
    return { text: t("Showing on {name}", { name: session.monitorName(place.display) }), ok: true };
  }

  const monitorLabel = (display: (typeof displays)[number]) =>
    `${session.monitorName(display)} · ${display.width}×${display.height}${display.primary ? ` · ${t("main")}` : ""}${display.audience ? ` · ${t("audience")}` : ""}`;

  /** The main screen's monitor (the audience window's), if it is open. */
  const mainDisplay = $derived(displays.find((display) => display.audience) ?? null);
  /** What a monitor is used for now: the desk, the main screen, a screen, or nothing yet. */
  function usedFor(display: (typeof displays)[number]): string {
    if (display.key === session.output.operatorKey) return t("The desk");
    if (display.audience) return t("The main screen");
    const index = screens.findIndex((screen) => screen.displayKey === display.key);
    if (index >= 0) return t("Screen {name}", { name: screens[index]!.name || screenLetter(index) });
    return t("Not used yet");
  }
  const KIND_TEXT: Record<ContentKind, string> = { scripture: msg("Scripture"), lyrics: msg("Songs"), slides: msg("Slides and pictures") };
  const WHEN_NONE: Record<ContentKind, string> = { scripture: msg("When no verse is up"), lyrics: msg("When no song is up"), slides: msg("When no slide is up") };
  const isKind = (role: ScreenRole): role is ContentKind => (CONTENT_KINDS as readonly string[]).includes(role);
  function toggleAlso(screen: ScreenOutput, kind: ContentKind, on: boolean) {
    const also = new Set(screen.also ?? []);
    if (on) also.add(kind);
    else also.delete(kind);
    session.setScreenBetween(screen.id, "also", [...also]);
  }
</script>

<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("Screens with their own job")}</strong>
      <span>{t("Give each extra monitor a job: a timer for the preacher, only scripture, only lyrics, or the stage view. Lock a screen so nothing changes it during the service; unlocked screens can be switched any time. The desk and the audience screen keep their own monitors.")}</span>
    </div>
    <button type="button" class="btn" disabled={!isDesktop() || !screens.length} onclick={() => session.identifyScreens()}>{t("Identify")}</button>
  </div>
  {#if !isDesktop()}
    <div class="row"><div class="row-copy"><span>{t("Screens open on monitors in the desktop app.")}</span></div></div>
  {:else if displays.length < 3}
    <div class="row"><div class="row-copy"><span>{t("This computer shows {count} monitor(s). Connect another monitor for a screen; the desk and the audience screen use the first two.", { count: displays.length })}</span></div></div>
  {/if}
</section>

{#if isDesktop() && displays.length}
  <!-- Each monitor by the name people use for it ("Main auditorium"), with its own name kept beside. -->
  <p class="section-label">{t("Your monitors")}</p>
  <section class="rows">
    {#each displays as display (display.key)}
      <div class="row">
        <div class="row-copy"><strong>{display.name}</strong><span>{display.width}×{display.height} · {usedFor(display)}</span></div>
        <input class="field" value={session.workspace.monitorNames?.[display.key] ?? ""} placeholder={t("Call it… (Main auditorium)")} maxlength="40" aria-label={t("Name for {name}", { name: display.name })} onchange={(event) => session.setMonitorName(display.key, event.currentTarget.value)} />
      </div>
    {/each}
  </section>
{/if}

{#if isDesktop()}
  <!-- A TV's own browser on the church Wi-Fi as a screen: no HDMI cable, no internet. Also in the
       audience output menu at the top of the desk. -->
  <p class="section-label">{t("TV over Wi-Fi")}</p>
  <section class="rows">
    <div class="row">
      <div class="row-copy">
        <strong>{t("Show on a TV over Wi-Fi")}</strong>
        <span>{wifi?.on ? (wifi.link ? t("Bookmark on the TV, once: {url}", { url: wifi.link.replace(/^https?:\/\//, "") }) : t("On the TV's browser, open {url}", { url: wifi.url.replace(/^https?:\/\//, "") })) : t("For a TV with a web browser, or when the HDMI cable is not reliable. The TV and this computer must be on the same Wi-Fi.")}</span>
      </div>
      <input type="checkbox" class="switch" role="switch" aria-label={t("Show on a TV over Wi-Fi")} checked={!!wifi?.on} disabled={!wifi} onchange={() => void wifi?.toggle()} />
    </div>
    {#if wifi?.on}
      <div class="row">
        <div class="row-copy"><span>{tn(wifi.watching, "{n} TV is showing the screen now.", "{n} TVs are showing the screen now.")}{#if wifi.link}{" "}{t("The bookmark keeps working when this computer's Wi-Fi address changes; it needs the internet only to open. Without internet: {url}", { url: wifi.url.replace(/^https?:\/\//, "") })}{/if}</span></div>
        <button type="button" class="btn" onclick={() => wifi?.qrOnPreview()}>{t("Its address as a QR code on Preview")}</button>
      </div>
    {/if}
    {#if wifi?.on && wifi.network}
      {@const net = wifi.network}
      <!-- Which network the TV must join: the Wi-Fi's own name, once the system shares it. -->
      <div class="row">
        <div class="row-copy">
          <strong>{t("Network")}</strong>
          <span class:warn={!!net.name && !!wifi.tvNetwork && wifi.tvNetwork !== net.name}>
            {#if net.name}{t("This computer is on the Wi-Fi “{name}”. The TV must join it too.", { name: net.name })}{#if wifi.tvNetwork && wifi.tvNetwork !== net.name}{" "}{t("Last time the TV showed the screen on “{name}”.", { name: wifi.tvNetwork })}{/if}
            {:else if net.hidden}{t("This computer is on Wi-Fi. The system shares the network's name only with apps allowed to use Location; your location is never used.")}
            {:else if net.kind === "wired"}{t("This computer is on a cable (Ethernet). The TV must be on the same network: the Wi-Fi from the same router.")}
            {:else}{t("The TV must be on the same network as this computer.")}{/if}
          </span>
        </div>
        {#if net.hidden}<button type="button" class="btn" onclick={() => void wifi?.allowNetworkName()}>{t("Show the network's name")}</button>{/if}
      </div>
    {/if}
    {#if wifi?.error}<div class="row"><div class="row-copy"><span class="warn">{wifi.error}</span></div></div>{/if}
  </section>
{/if}

<p class="section-label">{t("Screens")}</p>
<!-- The main screen: everything that goes LIVE. It is what LIVE, BLACK and CLEAR are about. -->
<section class="rows screen main">
  <div class="row head">
    <span class="letter" aria-hidden="true"><Icon name="screens" size={15} /></span>
    <strong class="name">{t("Main screen")}</strong>
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Monitor")}</strong><span class:ok={!!mainDisplay} class:warn={!mainDisplay}>{mainDisplay ? t("Showing on {name}", { name: session.monitorName(mainDisplay) }) : t("Not open. Open it from the audience output menu at the top of the desk.")}</span></div>
  </div>
  <div class="row"><div class="row-copy"><strong>{t("Job")}</strong><span>{t("Everything that goes LIVE, cameras included.")}</span></div></div>
</section>

{#each screens as screen, index (screen.id)}
  {@const status = where(screen.id)}
  <section class="rows screen" class:locked={screen.locked}>
    <div class="row head">
      <span class="letter" aria-hidden="true">{screenLetter(index)}</span>
      <input class="field name" value={screen.name} placeholder={t("Screen {letter}", { letter: screenLetter(index) })} aria-label={t("Screen name")} maxlength="40" onchange={(event) => session.renameScreen(screen.id, event.currentTarget.value)} />
      <button type="button" class="btn lock" class:on={screen.locked} aria-pressed={screen.locked} title={screen.locked ? t("Locked: nothing changes this screen") : t("Unlocked: its job can be switched")} onclick={() => session.lockScreen(screen.id, !screen.locked)}>
        <Icon name={screen.locked ? "lock" : "lock-open"} size={14} /> {screen.locked ? t("Locked") : t("Lock")}
      </button>
      <button type="button" class="btn" aria-label={t("Remove screen")} title={t("Remove screen")} onclick={() => session.removeScreen(screen.id)}><Icon name="close" size={14} /></button>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Monitor")}</strong><span class:ok={status.ok} class:warn={!status.ok}>{status.text}</span></div>
      <select class="field" aria-label={t("Monitor")} value={screen.displayKey ?? ""} onchange={(event) => void chooseMonitor(screen.id, event.currentTarget.value)}>
        <option value="">{t("Choose…")}</option>
        {#each displays as display (display.key)}
          <option value={display.key}>{monitorLabel(display)}</option>
        {/each}
        <option value={WIFI_SCREEN}>{t("Wi-Fi: a TV's browser (no cable)")}</option>
        {#if screen.displayKey && screen.displayKey !== WIFI_SCREEN && !displays.some((display) => display.key === screen.displayKey)}
          <option value={screen.displayKey}>{screen.displayKey.split("|")[0]} · {t("not connected")}</option>
        {/if}
      </select>
    </div>
    {#if screen.displayKey === WIFI_SCREEN && wifi?.on}
      <div class="row"><div class="row-copy"><span>{t("The TV shows this screen's job by itself. Scan the address from the TV or a tablet, or type it in.")}</span></div><button type="button" class="btn" onclick={() => wifi?.qrOnPreview(screen.id)}>{t("Its address as a QR code on Preview")}</button></div>
    {/if}
    <div class="row stack">
      <div class="row-copy">
        <strong>{t("Job")}</strong>
        {#if screen.locked}<span>{t("Locked. Unlock to switch it.")}</span>
        {:else if now.find((item) => item.id === screen.id)?.role !== screen.role}<span class="ok">{t("Now showing {job}: the running part asks for it.", { job: t(ROLE_TEXT[now.find((item) => item.id === screen.id)!.role].label) })}</span>
        {:else}<span>{t("Parts of the service can give it another job while they run: choose that in Where it runs.")}</span>{/if}
      </div>
      <div class="roles" role="radiogroup" aria-label={t("Job")}>
        {#each SCREEN_ROLES as role (role.id)}
          <button type="button" role="radio" class="role" class:on={screen.role === role.id} aria-checked={screen.role === role.id} disabled={(screen.locked && screen.role !== role.id) || (screen.displayKey === WIFI_SCREEN && (role.id === "timer" || role.id === "stage"))} title={screen.displayKey === WIFI_SCREEN && (role.id === "timer" || role.id === "stage") ? t("Not on a TV over Wi-Fi yet: give this job to a monitor.") : undefined} onclick={() => session.setScreenRole(screen.id, role.id)}>
            <b>{t(ROLE_TEXT[role.id].label)}</b><span>{t(ROLE_TEXT[role.id].about)}</span>
          </button>
        {/each}
      </div>
    </div>
    {#if isKind(screen.role)}
      {@const own = screen.role}
      <!-- A screen with one job can take others between: its own kind always takes over the moment it goes LIVE. -->
      <div class="row stack">
        <div class="row-copy"><strong>{t(WHEN_NONE[own])}</strong><span>{t("{job} always takes over the moment it goes LIVE. BLACK and CLEAR empty it.", { job: t(KIND_TEXT[own]) })}</span></div>
        <div class="between" role="radiogroup" aria-label={t(WHEN_NONE[own])}>
          <label><input type="radio" name={`between-${screen.id}`} checked={!screen.between} disabled={screen.locked} onchange={() => session.setScreenBetween(screen.id, "dark")} /> {t("Go dark")}</label>
          <label><input type="radio" name={`between-${screen.id}`} checked={screen.between === "keep"} disabled={screen.locked} onchange={() => session.setScreenBetween(screen.id, "keep")} /> {t("Keep the last one up")}</label>
          <label><input type="radio" name={`between-${screen.id}`} checked={screen.between === "also"} disabled={screen.locked} onchange={() => session.setScreenBetween(screen.id, "also", screen.also?.length ? screen.also : CONTENT_KINDS.filter((kind) => kind !== own))} /> {t("Show these instead")}</label>
          <span class="also">
            {#each CONTENT_KINDS.filter((kind) => kind !== own) as kind (kind)}
              <label><input type="checkbox" checked={screen.between === "also" && !!screen.also?.includes(kind)} disabled={screen.locked || screen.between !== "also"} onchange={(event) => toggleAlso(screen, kind, event.currentTarget.checked)} /> {t(KIND_TEXT[kind])}</label>
            {/each}
          </span>
        </div>
      </div>
    {/if}
  </section>
{/each}

<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("Add a screen")}</strong>
      <span>{entitled ? t("Up to {max} screens. Cameras show on the audience screen only.", { max: MAX_SCREENS }) : t("Extra screens are part of Premium.")}</span>
    </div>
    <button type="button" class="btn primary" disabled={!isDesktop() || screens.length >= MAX_SCREENS} onclick={() => session.addScreen()}><Icon name="plus" size={14} /> {t("Add screen")}</button>
  </div>
</section>

<style>
  .screen { border-left: 3px solid var(--accent); }
  .screen.locked { border-left-color: var(--muted); }
  .head { gap: 10px !important; }
  .letter { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font-weight: 800; }
  .locked .letter { background: var(--muted); }
  .name { flex: 1; min-width: 0; max-width: none; }
  .lock.on { border-color: var(--accent); color: var(--accent); }
  .stack { flex-direction: column; align-items: stretch !important; gap: 10px; }
  .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .role { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .role span { font-size: 12px; color: var(--muted); }
  .role.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .role:disabled { opacity: 0.45; cursor: default; }
  .main { border-left-color: var(--presence, var(--accent)); }
  .main .letter { background: var(--presence, var(--accent)); }
  .between { display: grid; gap: 6px; font-size: 13px; }
  .between label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .between .also { display: flex; flex-wrap: wrap; gap: 14px; padding-left: 26px; color: var(--muted); }
  .ok { color: var(--ok, #2f9e6a) !important; }
  .warn { color: var(--warning, #c98a14) !important; }
</style>
