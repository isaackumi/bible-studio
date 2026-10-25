<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockCount } from "../../domain/schedule";
  import { OVERLAY_SPOTS, paintOverlays, type OverlayFill, type OverlaySize, type ScreenOverlay } from "../../domain/screen-overlays";
  import type { ScreenDest } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";
  import { msg, t } from "../../i18n/core";

  // The two cards a service puts on the audience screen by itself, side by side with a picture of
  // the screen: the countdown (time left in the running part) and the leader's name. Left: where it
  // shows and what the screen has now. Right: the picture, and how it looks. Wide, so it all fits.
  let { tab = $bindable("countdown"), onoverlays }: { tab?: "countdown" | "leader"; onoverlays?: () => void } = $props();

  type Mode = "corner" | "full" | "off";
  const COUNT_CHOICES: Array<{ mode: Mode; name: string; hint: string; icon: string }> = [
    { mode: "corner", name: msg("In the corner"), hint: msg("A small card over the words, the whole service."), icon: "layout" },
    { mode: "full", name: msg("Full screen"), hint: msg("Covers the screen, in front of the slide, until you turn it off."), icon: "expand" },
    { mode: "off", name: msg("Off"), hint: msg("Nothing on the screen. The desk still keeps time."), icon: "eye-off" },
  ];
  const LEADER_CHOICES: Array<{ dest: ScreenDest; name: string; hint: string; icon: string }> = [
    { dest: "screen", name: msg("On screen"), hint: msg("Their name shows for a few seconds when their part begins."), icon: "screens" },
    { dest: "preview", name: msg("Via Preview"), hint: msg("Show name puts it on Preview; press LIVE to show it."), icon: "play" },
    { dest: "off", name: msg("Off"), hint: msg("Names stay on the desk only."), icon: "eye-off" },
  ];
  const COLORS = ["#30a46c", "#fa4f00", "#e5484d", "#3b82f6", "#a855f7", "#f5a524", "#ffffff"];
  const FILLS: Array<[OverlayFill, string, string]> = [
    ["dark", msg("Dark"), msg("A dark box behind it")],
    ["color", msg("Colour"), msg("A box filled with the colour")],
    ["clear", msg("None"), msg("Words only, no box")],
  ];
  const SIZES: Array<[OverlaySize, string]> = [["s", msg("Small")], ["m", msg("Medium")], ["l", msg("Large")], ["xl", msg("Huge")]];

  const mode = $derived(session.countdownMode);
  const leader = $derived(session.leaderTo);
  const countLook = $derived(session.workspace.overlays.find((overlay) => overlay.kind === "countdown"));
  const leaderLook = $derived(session.leaderLook);
  const current = $derived(tab === "countdown" ? countLook : leaderLook);
  const shown = $derived(tab === "countdown" ? mode !== "off" : leader === "screen");

  // What the countdown counts to, ticking while this is open.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const target = $derived.by(() => {
    void now;
    return session.screenCountdown();
  });
  const status = $derived.by((): { live: boolean; text: string } => {
    if (tab === "leader") {
      if (leader === "off") return { live: false, text: t("Names stay on the desk only.") };
      const leaders = session.service?.sections.filter((section) => section.leader?.trim()).length ?? 0;
      return { live: leaders > 0, text: leaders ? t("{n} parts have a leader. Their name shows when their part begins.", { n: leaders }) : t("No part has a leader yet. Add one under a part's name.") };
    }
    if (mode === "off") return { live: false, text: t("Not on the screen.") };
    if (!target) return { live: false, text: session.serviceRunning ? t("Waiting: the running part has no time. Give it one on its heading.") : t("Shows once you press Start service.") };
    return { live: true, text: t("On the screen now: {part} · {time} left", { part: target.name, time: clockCount(Math.max(0, target.endsAt - now)) }) };
  });

  // The picture: what is live now, with the card drawn on it as it will look.
  const sampleLeader = $derived.by(() => {
    const part = session.service?.sections.find((section) => section.id === session.runningSectionId && section.leader?.trim()) ?? session.service?.sections.find((section) => section.leader?.trim());
    return part ? { name: part.leader!.trim(), part: part.name } : { name: t("Pastor's name"), part: t("Sermon") };
  });
  const previewModel = $derived.by(() => {
    const base = session.live.program.model;
    if (tab === "countdown") {
      if (mode === "off") return { ...base, overlays: [] };
      const look: ScreenOverlay = { ...(countLook ?? { id: "preview", kind: "countdown", text: "", subtitle: "", corner: "top-right", edge: "bottom", assetId: null, speed: 2, color: "#30a46c", spot: "top-right", size: "m" }), on: true, cover: mode === "full" || undefined };
      const sample = target ?? { name: session.service?.sections.find((section) => !section.skip)?.name ?? t("Worship"), endsAt: now + 12 * 60_000 + 34_000 };
      return { ...base, overlays: paintOverlays([look], () => null, sample) };
    }
    if (leader !== "screen") return { ...base, overlays: [] };
    const look: ScreenOverlay = { ...leaderLook, text: sampleLeader.name, subtitle: sampleLeader.part, rich: undefined, subtitleRich: undefined, on: true };
    return { ...base, overlays: paintOverlays([look], () => null) };
  });

  const setLook = (patch: Partial<ScreenOverlay>) => (tab === "countdown" ? session.setCountdownLook(patch) : session.setLeaderLook(patch));
</script>

<div class="editor">
  <div class="tabs" role="tablist" aria-label={t("On the screen")}>
    <button type="button" role="tab" aria-selected={tab === "countdown"} onclick={() => (tab = "countdown")}>
      <Icon name="timer" size={14} /> {t("Countdown")}<span class="tab-state" class:on={mode !== "off"}>{t(COUNT_CHOICES.find((choice) => choice.mode === mode)!.name)}</span>
    </button>
    <button type="button" role="tab" aria-selected={tab === "leader"} onclick={() => (tab = "leader")}>
      <Icon name="user" size={14} /> {t("Leaders' names")}<span class="tab-state" class:on={leader !== "off"}>{t(LEADER_CHOICES.find((choice) => choice.dest === leader)!.name)}</span>
    </button>
  </div>

  <div class="cols" role="tabpanel">
    <div class="left">
      <p class="col-title">{t("Where it shows")}</p>
      <div class="choices" role="radiogroup" aria-label={tab === "countdown" ? t("Countdown") : t("Leaders' names")}>
        {#if tab === "countdown"}
          {#each COUNT_CHOICES as choice (choice.mode)}
            <button type="button" role="radio" class="choice" aria-checked={mode === choice.mode} onclick={() => session.setCountdownMode(choice.mode)}>
              <span class="choice-icon"><Icon name={choice.icon} size={15} /></span>
              <span class="choice-copy"><strong>{t(choice.name)}</strong><em>{t(choice.hint)}</em></span>
              <span class="radio" aria-hidden="true"></span>
            </button>
          {/each}
        {:else}
          {#each LEADER_CHOICES as choice (choice.dest)}
            <button type="button" role="radio" class="choice" aria-checked={leader === choice.dest} onclick={() => session.setLeaderTo(choice.dest)}>
              <span class="choice-icon"><Icon name={choice.icon} size={15} /></span>
              <span class="choice-copy"><strong>{t(choice.name)}</strong><em>{t(choice.hint)}</em></span>
              <span class="radio" aria-hidden="true"></span>
            </button>
          {/each}
        {/if}
      </div>
      <p class="status" class:live={status.live} role="status"><i aria-hidden="true"></i>{status.text}</p>
      <div class="actions">
        {#if tab === "countdown"}
          <button type="button" class="link sound" class:on={session.workspace.timerSounds.on} aria-pressed={session.workspace.timerSounds.on} title={t("Beeps at the warning times and at 00:00:00 (Settings › Sound & voice for more)")} onclick={() => session.setTimerSounds({ on: !session.workspace.timerSounds.on })}>
            <Icon name={session.workspace.timerSounds.on ? "bell" : "bell-off"} size={12} /> {session.workspace.timerSounds.on ? t("Sounds on") : t("Sounds off")}
          </button>
          <button type="button" class="link" title={t("A countdown slide on Preview instead; LIVE sends it like any slide")} onclick={() => session.showCountdown()}><Icon name="timer" size={12} /> {t("Put a countdown slide on Preview")}</button>
          {#if onoverlays}<button type="button" class="link" onclick={onoverlays}><Icon name="layers" size={12} /> {t("More in Overlays")}</button>{/if}
        {:else}
          <span class="field-name inline">{t("How long")}</span>
          <div class="seg" role="radiogroup" aria-label={t("How long")}>
            {#each [5, 10, 20, 30] as seconds (seconds)}
              <button type="button" role="radio" aria-checked={(session.service?.leaderSeconds ?? 10) === seconds} disabled={leader !== "screen"} onclick={() => session.setServiceSettings({ leaderSeconds: seconds })}>{t("{n} s", { n: seconds })}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="right">
      <div class="mini" class:off={!shown} aria-label={t("How it looks on the screen")}>
        <Screen model={previewModel} still />
        {#if !shown}<span class="mini-off">{t("Off: nothing on the screen")}</span>{/if}
      </div>
      <div class="look" class:dim={!shown}>
        <div class="field">
          <span class="field-name">{t("Show")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Show")}>
            <button type="button" role="radio" aria-checked={current?.showLabel !== false} onclick={() => setLook({ showLabel: undefined })}>{tab === "countdown" ? t("Name and time") : t("Name and part")}</button>
            <button type="button" role="radio" aria-checked={current?.showLabel === false} onclick={() => setLook({ showLabel: false })}>{tab === "countdown" ? t("Time only") : t("Name only")}</button>
          </div>
        </div>
        <div class="field">
          <span class="field-name">{t("Box")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Box")}>
            {#each FILLS as [fill, name, hint] (fill)}
              <button type="button" role="radio" aria-checked={(current?.fill ?? "dark") === fill} title={t(hint)} onclick={() => setLook({ fill: fill === "dark" ? undefined : fill })}>{t(name)}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="field-name">{t("Colour")}</span>
          <div class="swatches" role="radiogroup" aria-label={t("Colour")}>
            {#each COLORS as color (color)}
              <button type="button" role="radio" class="swatch" aria-checked={current?.color === color} aria-label={color} title={color} style:--swatch={color} onclick={() => setLook({ color })}></button>
            {/each}
            <label class="swatch custom" title={t("Any colour")}><input type="color" aria-label={t("Any colour")} value={current?.color ?? "#30a46c"} onchange={(event) => setLook({ color: event.currentTarget.value })} /></label>
          </div>
        </div>
        {#if tab === "countdown"}
          <div class="field">
            <span class="field-name">{t("Size")}</span>
            <div class="seg" role="radiogroup" aria-label={t("Size")}>
              {#each SIZES as [size, name] (size)}
                <button type="button" role="radio" aria-checked={(countLook?.size ?? "m") === size} onclick={() => session.setCountdownLook({ size })}>{t(name)}</button>
              {/each}
            </div>
          </div>
          {#if mode !== "full"}
            <div class="field">
              <span class="field-name">{t("Where")}</span>
              <div class="spots" role="radiogroup" aria-label={t("Where")}>
                {#each OVERLAY_SPOTS as [spot, label] (spot)}
                  <button type="button" role="radio" class="spot spot-{spot}" aria-checked={(countLook?.spot ?? "top-right") === spot} aria-label={t(label)} title={t(label)} onclick={() => session.setCountdownLook({ spot })}><i></i></button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .editor { container-type: inline-size; display: grid; gap: 14px; }
  .tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 11px; width: max-content; max-width: 100%; }
  .tabs button { display: inline-flex; white-space: nowrap; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .tabs button:hover { color: var(--ink); }
  .tabs button[aria-selected="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .tab-state { white-space: nowrap; padding: 1px 8px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 10%, transparent); font-size: 11px; font-weight: 650; color: var(--muted); }
  .tab-state.on { background: color-mix(in srgb, #30a46c 24%, transparent); color: var(--ink); }

  .cols { display: grid; grid-template-columns: minmax(230px, 0.85fr) minmax(0, 1.15fr); gap: 20px; align-items: start; }
  @container (max-width: 620px) { .cols { grid-template-columns: 1fr; } }
  .left, .right { display: grid; gap: 10px; min-width: 0; }
  .col-title { margin: 0; font-size: 11px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }

  .choices { display: grid; gap: 6px; }
  .choice { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
  .choice:hover { background: var(--field); }
  .choice[aria-checked="true"] { border-color: color-mix(in srgb, var(--accent) 65%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .choice-icon { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--field); color: var(--muted); }
  .choice[aria-checked="true"] .choice-icon { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent-text); }
  .choice-copy { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .choice-copy strong { font-size: 13px; font-weight: 700; }
  .choice-copy em { font-style: normal; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .radio { flex: none; width: 16px; height: 16px; border: 1.5px solid var(--muted); border-radius: 50%; }
  .choice[aria-checked="true"] .radio { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 3px var(--panel); }

  .status { display: flex; align-items: center; gap: 8px; margin: 0; padding: 9px 11px; border-radius: 9px; background: var(--field); font-size: 12px; line-height: 1.4; color: var(--muted); font-variant-numeric: tabular-nums; }
  .status i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .status.live { color: var(--ink); }
  .status.live i { background: #30a46c; box-shadow: 0 0 0 3px color-mix(in srgb, #30a46c 25%, transparent); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .link { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .link:hover { background: var(--field); }
  .link.sound { color: var(--muted); }
  .link.sound.on { color: var(--ink); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }

  .mini { position: relative; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #000; box-shadow: 0 10px 30px rgb(0 0 0 / 0.3); }
  .mini.off :global(.ratio) { opacity: 0.35; }
  .mini-off { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 13px; font-weight: 650; text-shadow: 0 1px 4px rgb(0 0 0 / 0.8); }
  .look { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; transition: opacity 0.2s ease; }
  @container (max-width: 760px) { .look { grid-template-columns: 1fr; } }
  .look.dim { opacity: 0.5; }
  .field { display: grid; gap: 5px; min-width: 0; }
  .field-name { font-size: 11px; font-weight: 750; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .field-name.inline { margin-right: 2px; }
  .seg { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; }
  .seg button { flex: 1; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .seg button:hover:not(:disabled) { color: var(--ink); }
  .seg button:disabled { opacity: 0.4; cursor: default; }
  .seg button[aria-checked="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
  .swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; min-height: 32px; }
  .swatch { width: 24px; height: 24px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: var(--swatch); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25); cursor: pointer; transition: transform 0.12s ease; }
  .swatch:hover { transform: scale(1.1); }
  .swatch[aria-checked="true"] { border-color: var(--ink); }
  .swatch.custom { position: relative; overflow: hidden; background: conic-gradient(#e5484d, #f5a524, #30a46c, #3b82f6, #a855f7, #e5484d); }
  .swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .spots { display: grid; grid-template-columns: repeat(3, 30px); grid-template-rows: repeat(3, 20px); gap: 3px; padding: 4px; width: max-content; border: 1px solid var(--line); border-radius: 8px; }
  .spot { position: relative; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: none; cursor: pointer; }
  .spot i { position: absolute; inset: 5px 7px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 25%, transparent); }
  .spot[aria-checked="true"] { border-color: var(--accent); }
  .spot[aria-checked="true"] i { background: var(--accent); }
  .spot-top-left { grid-area: 1 / 1; } .spot-top { grid-area: 1 / 2; } .spot-top-right { grid-area: 1 / 3; }
  .spot-center { grid-area: 2 / 2; }
  .spot-bottom-left { grid-area: 3 / 1; } .spot-bottom { grid-area: 3 / 2; } .spot-bottom-right { grid-area: 3 / 3; }
</style>
