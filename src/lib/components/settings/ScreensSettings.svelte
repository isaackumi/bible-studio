<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { MAX_SCREENS, SCREEN_ROLES, screenLetter, type ScreenRole } from "../../display/screens";
  import { isDesktop } from "../../platform/runtime";
  import { msg, t } from "../../i18n/core";
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

  function where(id: string): { text: string; ok: boolean } {
    const place = places.get(id);
    if (!place || place.state === "no-monitor") return { text: t("Choose its monitor"), ok: false };
    if (place.state === "missing") return { text: t("Its monitor is not connected. It comes back when the monitor does."), ok: false };
    if (place.state === "taken") {
      return {
        text: place.by === "desk" ? t("That monitor has the desk. Choose another.") : place.by === "audience" ? t("That monitor has the audience screen. Choose another.") : t("Another screen already uses that monitor."),
        ok: false,
      };
    }
    return { text: t("Showing on {name}", { name: place.display.name }), ok: true };
  }

  const monitorLabel = (display: (typeof displays)[number]) =>
    `${display.name} · ${display.width}×${display.height}${display.primary ? ` · ${t("main")}` : ""}${display.audience ? ` · ${t("audience")}` : ""}`;
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
      <select class="field" aria-label={t("Monitor")} value={screen.displayKey ?? ""} onchange={(event) => session.setScreenDisplay(screen.id, event.currentTarget.value || null)}>
        <option value="">{t("Choose…")}</option>
        {#each displays as display (display.key)}
          <option value={display.key}>{monitorLabel(display)}</option>
        {/each}
        {#if screen.displayKey && !displays.some((display) => display.key === screen.displayKey)}
          <option value={screen.displayKey}>{screen.displayKey.split("|")[0]} · {t("not connected")}</option>
        {/if}
      </select>
    </div>
    <div class="row stack">
      <div class="row-copy">
        <strong>{t("Job")}</strong>
        {#if screen.locked}<span>{t("Locked. Unlock to switch it.")}</span>
        {:else if now.find((item) => item.id === screen.id)?.role !== screen.role}<span class="ok">{t("Now showing {job}: the running part asks for it.", { job: t(ROLE_TEXT[now.find((item) => item.id === screen.id)!.role].label) })}</span>
        {:else}<span>{t("Parts of the service can give it another job while they run: choose that in Where it runs.")}</span>{/if}
      </div>
      <div class="roles" role="radiogroup" aria-label={t("Job")}>
        {#each SCREEN_ROLES as role (role.id)}
          <button type="button" role="radio" class="role" class:on={screen.role === role.id} aria-checked={screen.role === role.id} disabled={screen.locked && screen.role !== role.id} onclick={() => session.setScreenRole(screen.id, role.id)}>
            <b>{t(ROLE_TEXT[role.id].label)}</b><span>{t(ROLE_TEXT[role.id].about)}</span>
          </button>
        {/each}
      </div>
    </div>
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
  .ok { color: var(--ok, #2f9e6a) !important; }
  .warn { color: var(--warning, #c98a14) !important; }
</style>
