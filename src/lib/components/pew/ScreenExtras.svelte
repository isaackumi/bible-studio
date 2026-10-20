<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockCount } from "../../domain/schedule";
  import type { ScreenDest } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import OverlaysDialog from "../OverlaysDialog.svelte";
  import { msg, t } from "../../i18n/core";

  // Two things the service can put on the audience screen by itself, each its own button that says
  // what it is and where it goes now: the countdown (time left in the running part) and the
  // leader's name. Each opens plain choices and says what the audience sees right now.
  let open = $state<"countdown" | "leader" | null>(null);
  let overlaysOpen = $state(false);
  let wrap = $state<HTMLSpanElement | undefined>();

  const CHOICES: Record<"countdown" | "leader", Array<{ dest: ScreenDest; name: string; hint: string }>> = {
    countdown: [
      { dest: "screen", name: msg("In the corner"), hint: msg("Small, over the words, the whole service: the part's name and its time left.") },
      { dest: "preview", name: msg("Full screen"), hint: msg("A big countdown goes on Preview; press LIVE to show it.") },
      { dest: "off", name: msg("Off"), hint: msg("Nothing on the screen. The desk still keeps time.") },
    ],
    leader: [
      { dest: "screen", name: msg("On screen"), hint: msg("Their name shows for a few seconds when their part begins.") },
      { dest: "preview", name: msg("Via Preview"), hint: msg("Show name puts it on Preview; press LIVE to show it.") },
      { dest: "off", name: msg("Off"), hint: msg("Names stay on the desk only.") },
    ],
  };
  const LABEL: Record<"countdown" | "leader", Record<ScreenDest, string>> = {
    countdown: { screen: msg("In the corner"), preview: msg("Full screen"), off: msg("Off") },
    leader: { screen: msg("On screen"), preview: msg("Via Preview"), off: msg("Off") },
  };

  const countdown = $derived(session.countdownTo);
  const leader = $derived(session.leaderTo);

  // What the audience sees from the countdown now, in words.
  let now = $state(Date.now());
  $effect(() => {
    if (open !== "countdown") return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const deadline = $derived.by(() => {
    void now;
    return session.runningDeadline();
  });
  const countdownNow = $derived.by(() => {
    if (countdown === "off") return t("Not on the screen.");
    if (countdown === "preview") return t("On Preview when you put it there; LIVE shows it.");
    if (!session.serviceRunning) return t("Shows once you press Start service.");
    if (!deadline) return t("Waiting: the running part has no time. Give it one on its heading.");
    return t("On the screen now: {part} · {time} left", { part: deadline.name, time: clockCount(Math.max(0, deadline.endsAt - now)) });
  });

  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap && !wrap.contains(event.target as Node)) open = null;
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });

  function choose(which: "countdown" | "leader", dest: ScreenDest) {
    if (which === "countdown") session.setCountdownTo(dest);
    else session.setLeaderTo(dest);
  }
</script>

<span class="extras" bind:this={wrap}>
  <button type="button" class="trigger" class:on={countdown !== "off"} aria-expanded={open === "countdown"} onclick={() => (open = open === "countdown" ? null : "countdown")} title={t("The countdown on the audience screen: time left in the running part")}>
    <Icon name="timer" size={13} />
    <span class="what">{t("Countdown")}</span>
    <span class="state">{t(LABEL.countdown[countdown])}</span>
    <Icon name="chevron-down" size={12} />
  </button>
  <button type="button" class="trigger" class:on={leader !== "off"} aria-expanded={open === "leader"} onclick={() => (open = open === "leader" ? null : "leader")} title={t("Who leads each part, as a name on the audience screen")}>
    <Icon name="user" size={13} />
    <span class="what">{t("Leaders' names")}</span>
    <span class="state">{t(LABEL.leader[leader])}</span>
    <Icon name="chevron-down" size={12} />
  </button>

  {#if open}
    {@const which = open}
    {@const value = which === "countdown" ? countdown : leader}
    <div class="pop" role="dialog" aria-label={which === "countdown" ? t("Countdown") : t("Leaders' names")}>
      <p class="pop-title"><Icon name={which === "countdown" ? "timer" : "user"} size={14} /> {which === "countdown" ? t("Countdown on the screen") : t("Leaders' names on the screen")}</p>
      <div class="choices" role="radiogroup" aria-label={which === "countdown" ? t("Countdown") : t("Leaders' names")}>
        {#each CHOICES[which] as choice (choice.dest)}
          <button type="button" role="radio" class="choice {choice.dest}" aria-checked={value === choice.dest} onclick={() => choose(which, choice.dest)}>
            <span class="radio" aria-hidden="true"></span>
            <span class="choice-copy"><strong>{t(choice.name)}</strong><em>{t(choice.hint)}</em></span>
          </button>
        {/each}
      </div>
      {#if which === "countdown"}
        <p class="now" class:live={countdown === "screen" && !!deadline && session.serviceRunning} role="status"><i aria-hidden="true"></i>{countdownNow}</p>
        <div class="settings">
          {#if countdown === "screen"}
            <button type="button" class="link" onclick={() => { overlaysOpen = true; open = null; }}><Icon name="layout" size={12} /> {t("Move or resize it")}</button>
          {:else if countdown === "preview"}
            <button type="button" class="link" onclick={() => session.showCountdown()}><Icon name="timer" size={12} /> {t("Put it on Preview now")}</button>
            <label class="size">
              <span>{t("Size")}</span>
              <select aria-label={t("Full-screen countdown size")} value={String(session.workspace.countdownSize)} onchange={(event) => session.setCountdownSize(Number(event.currentTarget.value))}>
                {#each [[160, msg("Medium")], [220, msg("Large")], [300, msg("Huge")], [400, msg("Giant")]] as [size, label] (size)}<option value={String(size)}>{t(String(label))}</option>{/each}
              </select>
            </label>
          {/if}
          <button type="button" class="sound" class:on={session.workspace.timerSounds.on} aria-pressed={session.workspace.timerSounds.on} title={t("Beeps at the warning times and at 00:00:00 (Settings › Sound & voice for more)")} onclick={() => session.setTimerSounds({ on: !session.workspace.timerSounds.on })}>
            <Icon name={session.workspace.timerSounds.on ? "bell" : "bell-off"} size={13} /> {session.workspace.timerSounds.on ? t("Sounds on") : t("Sounds off")}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</span>

{#if overlaysOpen}
  <OverlaysDialog onclose={() => (overlaysOpen = false)} />
{/if}

<style>
  .extras { position: relative; display: inline-flex; gap: 6px; flex-wrap: wrap; }
  .trigger { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px 0 10px; border: 1px solid var(--line); border-radius: 10px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .trigger:hover, .trigger[aria-expanded="true"] { background: var(--field); color: var(--ink); }
  .trigger .what { color: var(--ink); }
  .trigger .state { padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 10%, transparent); font-size: 11px; }
  .trigger.on { border-color: color-mix(in srgb, #30a46c 50%, var(--line)); }
  .trigger.on .state { background: color-mix(in srgb, #30a46c 24%, transparent); color: var(--ink); }
  .pop { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; display: grid; gap: 10px; width: 340px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); box-shadow: 0 16px 40px rgb(0 0 0 / 0.35); }
  .pop-title { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 13px; font-weight: 750; }
  .choices { display: grid; gap: 4px; }
  .choice { display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .choice:hover { background: var(--field); }
  .choice[aria-checked="true"] { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .radio { flex: none; width: 14px; height: 14px; margin-top: 1px; border: 1.5px solid var(--muted); border-radius: 50%; }
  .choice[aria-checked="true"] .radio { border-color: var(--accent); box-shadow: inset 0 0 0 3px var(--panel); background: var(--accent); }
  .choice-copy { display: grid; gap: 2px; }
  .choice-copy strong { font-size: 12.5px; font-weight: 700; }
  .choice-copy em { font-style: normal; font-size: 11.5px; line-height: 1.4; color: var(--muted); }
  .now { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--field); font-size: 12px; line-height: 1.4; color: var(--muted); font-variant-numeric: tabular-nums; }
  .now i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .now.live { color: var(--ink); }
  .now.live i { background: #30a46c; }
  .link { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .link:hover { background: var(--field); }
  .settings { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .size { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .size select { height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .sound { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .sound.on { color: var(--ink); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
</style>
