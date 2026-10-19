<script lang="ts">
  import { session } from "../../app/session.svelte";
  import type { ScreenDest } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import { msg, t } from "../../i18n/core";

  // The service's extras and where each goes: straight to the audience screen, onto Preview for
  // LIVE to send, or nowhere. One button opens the choices; it says at a glance what is on.
  let open = $state(false);
  let wrap = $state<HTMLSpanElement | undefined>();

  const DESTS: Array<[ScreenDest, string]> = [
    ["screen", msg("Screen")],
    ["preview", msg("Preview")],
    ["off", msg("Off")],
  ];
  const HINT: Record<"countdown" | "leader", Record<ScreenDest, string>> = {
    countdown: {
      screen: msg("Time left in a corner of the audience screen (place and size it in Overlays)."),
      preview: msg("A big countdown on Preview; LIVE shows it full screen."),
      off: msg("No countdown on the screen. The desk still keeps time."),
    },
    leader: {
      screen: msg("The leader's name shows for 10 seconds when their part begins, and with Show name."),
      preview: msg("Show name puts the leader's name on Preview; LIVE sends it."),
      off: msg("No names on the screen. They stay on the desk."),
    },
  };

  const countdown = $derived(session.countdownTo);
  const leader = $derived(session.leaderTo);
  const onCount = $derived([countdown, leader].filter((dest) => dest !== "off").length);

  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap && !wrap.contains(event.target as Node)) open = false;
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });
</script>

<span class="extras" bind:this={wrap}>
  <button type="button" class="trigger" class:on={onCount > 0} aria-expanded={open} onclick={() => (open = !open)} title={t("Countdown and leaders' names: on the screen, on Preview, or off")}>
    <Icon name="screens" size={13} />
    {t("Countdown & names")}
    {#if countdown !== "off"}<span class="pill">{t("Countdown")}</span>{/if}
    {#if leader !== "off"}<span class="pill">{t("Names")}</span>{/if}
    {#if session.workspace.timerSounds.on}<Icon name="bell" size={12} />{/if}
    <Icon name="chevron-down" size={12} />
  </button>
  {#if open}
    <div class="pop" role="dialog" aria-label={t("Countdown & names")}>
      {#each [["countdown", msg("Countdown"), "timer"], ["leader", msg("Led by"), "user"]] as [key, label, icon] (key)}
        {@const value = key === "countdown" ? countdown : leader}
        <div class="row">
          <span class="label"><Icon name={icon} size={13} /> {t(label)}</span>
          <div class="seg" role="radiogroup" aria-label={t(label)}>
            {#each DESTS as [dest, name] (dest)}
              <button
                type="button"
                role="radio"
                aria-checked={value === dest}
                class={dest}
                onclick={() => (key === "countdown" ? session.setCountdownTo(dest) : session.setLeaderTo(dest))}
              >{t(name)}</button>
            {/each}
          </div>
          <p class="hint">{t(HINT[key as "countdown" | "leader"][value])}</p>
        </div>
      {/each}
      <div class="row">
        <span class="label"><Icon name="settings" size={13} /> {t("Countdown settings")}</span>
        <div class="settings">
          <label class="size">
            <span>{t("Size")}</span>
            <select aria-label={t("Full-screen countdown size")} value={String(session.workspace.countdownSize)} onchange={(event) => session.setCountdownSize(Number(event.currentTarget.value))}>
              {#each [[160, msg("Medium")], [220, msg("Large")], [300, msg("Huge")], [400, msg("Giant")]] as [size, label] (size)}<option value={String(size)}>{t(String(label))}</option>{/each}
            </select>
          </label>
          <button type="button" class="sound" class:on={session.workspace.timerSounds.on} aria-pressed={session.workspace.timerSounds.on} title={t("Beeps at the warning times and at 00:00:00 (Settings › Sound & voice for more)")} onclick={() => session.setTimerSounds({ on: !session.workspace.timerSounds.on })}>
            <Icon name={session.workspace.timerSounds.on ? "bell" : "bell-off"} size={13} /> {session.workspace.timerSounds.on ? t("Sounds on") : t("Sounds off")}
          </button>
        </div>
      </div>
      {#if countdown === "preview"}
        <button type="button" class="again" onclick={() => session.showCountdown()}><Icon name="timer" size={12} /> {t("Put the countdown on Preview again")}</button>
      {/if}
    </div>
  {/if}
</span>

<style>
  .extras { position: relative; display: inline-flex; }
  .trigger { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .trigger:hover { background: var(--field); }
  .pill { padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, #30a46c 22%, transparent); font-size: 11px; }
  .pop { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; display: grid; gap: 14px; width: 330px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); box-shadow: 0 16px 40px rgb(0 0 0 / 0.35); }
  .row { display: grid; gap: 6px; }
  .label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; }
  .seg button { height: 28px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .seg button:hover { background: var(--field); }
  .seg button[aria-checked="true"].screen { background: var(--live, #fa4f00); color: #fff; }
  .seg button[aria-checked="true"].preview { background: #30a46c; color: #fff; }
  .seg button[aria-checked="true"].off { background: color-mix(in srgb, var(--ink) 14%, transparent); }
  .hint { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .settings { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .size { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .size select { height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .sound { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .sound.on { color: var(--ink); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
  .again { justify-self: start; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; }
</style>
