<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { clockCount } from "../../domain/schedule";
  import { OVERLAY_SPOTS, paintOverlays, type OverlayFill, type OverlaySize, type ScreenOverlay } from "../../domain/screen-overlays";
  import type { ScreenDest } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import OverlaysDialog from "../OverlaysDialog.svelte";
  import Screen from "../Screen.svelte";
  import { msg, t } from "../../i18n/core";

  // Two things the service can put on the audience screen by itself, each its own button that says
  // what it is and where it goes now: the countdown (time left in the running part) and the
  // leader's name. Each opens plain choices, how it looks, and a small picture of the screen.
  let open = $state<"countdown" | "leader" | null>(null);
  let overlaysOpen = $state(false);
  let wrap = $state<HTMLSpanElement | undefined>();

  type Mode = "corner" | "full" | "off";
  const COUNT_CHOICES: Array<{ mode: Mode; name: string; hint: string }> = [
    { mode: "corner", name: msg("In the corner"), hint: msg("A small card over the words, the whole service.") },
    { mode: "full", name: msg("Full screen"), hint: msg("Covers the screen, in front of the slide, until you turn it off.") },
    { mode: "off", name: msg("Off"), hint: msg("Nothing on the screen. The desk still keeps time.") },
  ];
  const LEADER_CHOICES: Array<{ dest: ScreenDest; name: string; hint: string }> = [
    { dest: "screen", name: msg("On screen"), hint: msg("Their name shows for a few seconds when their part begins.") },
    { dest: "preview", name: msg("Via Preview"), hint: msg("Show name puts it on Preview; press LIVE to show it.") },
    { dest: "off", name: msg("Off"), hint: msg("Names stay on the desk only.") },
  ];
  const COUNT_LABEL: Record<Mode, string> = { corner: msg("In the corner"), full: msg("Full screen"), off: msg("Off") };
  const LEADER_LABEL: Record<ScreenDest, string> = { screen: msg("On screen"), preview: msg("Via Preview"), off: msg("Off") };
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

  // What the audience sees from the countdown now, in words, ticking while the window is open.
  let now = $state(Date.now());
  $effect(() => {
    if (open !== "countdown") return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const target = $derived.by(() => {
    void now;
    return session.screenCountdown();
  });
  const countdownNow = $derived.by(() => {
    if (mode === "off") return t("Not on the screen.");
    if (!target) return session.serviceRunning ? t("Waiting: the running part has no time. Give it one on its heading.") : t("Shows once you press Start service.");
    return t("On the screen now: {part} · {time} left", { part: target.name, time: clockCount(Math.max(0, target.endsAt - now)) });
  });

  // A small picture of the audience screen with the card on it, over what is live now.
  const sampleLeader = $derived.by(() => {
    const part = session.service?.sections.find((section) => section.id === session.runningSectionId && section.leader?.trim()) ?? session.service?.sections.find((section) => section.leader?.trim());
    return part ? { name: part.leader!.trim(), part: part.name } : { name: t("Pastor's name"), part: t("Sermon") };
  });
  const previewModel = $derived.by(() => {
    const base = session.live.program.model;
    if (open === "countdown") {
      const look: ScreenOverlay = { ...(countLook ?? { id: "preview", kind: "countdown", text: "", subtitle: "", corner: "top-right", edge: "bottom", assetId: null, speed: 2, color: "#30a46c", spot: "top-right", size: "m" }), on: true, cover: mode === "full" || undefined };
      const sample = target ?? { name: session.service?.sections.find((section) => !section.skip)?.name ?? t("Worship"), endsAt: now + 12 * 60_000 + 34_000 };
      return { ...base, overlays: mode === "off" ? [] : paintOverlays([look], () => null, sample) };
    }
    const look: ScreenOverlay = { ...leaderLook, text: sampleLeader.name, subtitle: sampleLeader.part, rich: undefined, subtitleRich: undefined, on: true };
    return { ...base, overlays: leader === "off" ? [] : paintOverlays([look], () => null) };
  });

  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap && !wrap.contains(event.target as Node)) open = null;
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });

  const setLook = (patch: Partial<ScreenOverlay>) => (open === "countdown" ? session.setCountdownLook(patch) : session.setLeaderLook(patch));
</script>

{#snippet look(current: ScreenOverlay | undefined, labels: [string, string])}
  <div class="field">
    <span class="field-name">{t("Show")}</span>
    <div class="seg" role="radiogroup" aria-label={t("Show")}>
      <button type="button" role="radio" aria-checked={current?.showLabel !== false} onclick={() => setLook({ showLabel: undefined })}>{t(labels[0])}</button>
      <button type="button" role="radio" aria-checked={current?.showLabel === false} onclick={() => setLook({ showLabel: false })}>{t(labels[1])}</button>
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
{/snippet}

<span class="extras" bind:this={wrap}>
  <button type="button" class="trigger" class:on={mode !== "off"} aria-expanded={open === "countdown"} onclick={() => (open = open === "countdown" ? null : "countdown")} title={t("The countdown on the audience screen: time left in the running part")}>
    <Icon name="timer" size={13} />
    <span class="what">{t("Countdown")}</span>
    <span class="state">{t(COUNT_LABEL[mode])}</span>
    <Icon name="chevron-down" size={12} />
  </button>
  <button type="button" class="trigger" class:on={leader !== "off"} aria-expanded={open === "leader"} onclick={() => (open = open === "leader" ? null : "leader")} title={t("Who leads each part, as a name on the audience screen")}>
    <Icon name="user" size={13} />
    <span class="what">{t("Leaders' names")}</span>
    <span class="state">{t(LEADER_LABEL[leader])}</span>
    <Icon name="chevron-down" size={12} />
  </button>

  {#if open === "countdown"}
    <div class="pop" role="dialog" aria-label={t("Countdown on the screen")}>
      <p class="pop-title"><Icon name="timer" size={14} /> {t("Countdown on the screen")}</p>
      <div class="choices" role="radiogroup" aria-label={t("Countdown")}>
        {#each COUNT_CHOICES as choice (choice.mode)}
          <button type="button" role="radio" class="choice" aria-checked={mode === choice.mode} onclick={() => session.setCountdownMode(choice.mode)}>
            <span class="radio" aria-hidden="true"></span>
            <span class="choice-copy"><strong>{t(choice.name)}</strong><em>{t(choice.hint)}</em></span>
          </button>
        {/each}
      </div>
      <p class="now" class:live={mode !== "off" && !!target} role="status"><i aria-hidden="true"></i>{countdownNow}</p>
      {#if mode !== "off"}
        <div class="mini" aria-label={t("How it looks on the screen")}><Screen model={previewModel} still /></div>
        {@render look(countLook, [msg("Name and time"), msg("Time only")])}
        {#if mode === "corner"}
          <div class="field">
            <span class="field-name">{t("Where")}</span>
            <div class="spots" role="radiogroup" aria-label={t("Where")}>
              {#each OVERLAY_SPOTS as [spot, label] (spot)}
                <button type="button" role="radio" class="spot spot-{spot}" aria-checked={(countLook?.spot ?? "top-right") === spot} aria-label={t(label)} title={t(label)} onclick={() => session.setCountdownLook({ spot })}><i></i></button>
              {/each}
            </div>
          </div>
        {/if}
        <div class="field">
          <span class="field-name">{t("Size")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Size")}>
            {#each SIZES as [size, name] (size)}
              <button type="button" role="radio" aria-checked={(countLook?.size ?? "m") === size} onclick={() => session.setCountdownLook({ size })}>{t(name)}</button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="actions">
        {#if mode === "corner"}<button type="button" class="link" onclick={() => { overlaysOpen = true; open = null; }}><Icon name="layout" size={12} /> {t("More in Overlays")}</button>{/if}
        <button type="button" class="link" title={t("A countdown slide on Preview instead; LIVE sends it like any slide")} onclick={() => session.showCountdown()}><Icon name="timer" size={12} /> {t("Put a countdown slide on Preview")}</button>
        <button type="button" class="link sound" class:on={session.workspace.timerSounds.on} aria-pressed={session.workspace.timerSounds.on} title={t("Beeps at the warning times and at 00:00:00 (Settings › Sound & voice for more)")} onclick={() => session.setTimerSounds({ on: !session.workspace.timerSounds.on })}>
          <Icon name={session.workspace.timerSounds.on ? "bell" : "bell-off"} size={12} /> {session.workspace.timerSounds.on ? t("Sounds on") : t("Sounds off")}
        </button>
      </div>
    </div>
  {:else if open === "leader"}
    <div class="pop" role="dialog" aria-label={t("Leaders' names on the screen")}>
      <p class="pop-title"><Icon name="user" size={14} /> {t("Leaders' names on the screen")}</p>
      <div class="choices" role="radiogroup" aria-label={t("Leaders' names")}>
        {#each LEADER_CHOICES as choice (choice.dest)}
          <button type="button" role="radio" class="choice" aria-checked={leader === choice.dest} onclick={() => session.setLeaderTo(choice.dest)}>
            <span class="radio" aria-hidden="true"></span>
            <span class="choice-copy"><strong>{t(choice.name)}</strong><em>{t(choice.hint)}</em></span>
          </button>
        {/each}
      </div>
      {#if leader === "screen"}
        <div class="mini" aria-label={t("How it looks on the screen")}><Screen model={previewModel} still /></div>
        {@render look(leaderLook, [msg("Name and part"), msg("Name only")])}
        <div class="field">
          <span class="field-name">{t("How long")}</span>
          <div class="seg" role="radiogroup" aria-label={t("How long")}>
            {#each [5, 10, 20, 30] as seconds (seconds)}
              <button type="button" role="radio" aria-checked={(session.service?.leaderSeconds ?? 10) === seconds} onclick={() => session.setServiceSettings({ leaderSeconds: seconds })}>{t("{n} s", { n: seconds })}</button>
            {/each}
          </div>
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
  .sound { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .sound.on { color: var(--ink); border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
  .pop { max-height: min(640px, calc(100vh - 180px)); overflow: auto; width: 360px; }
  .mini { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #000; }
  .field { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 8px; }
  .field-name { font-size: 12px; font-weight: 650; color: var(--muted); }
  .seg { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; }
  .seg button { flex: 1; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .seg button:hover { color: var(--ink); }
  .seg button[aria-checked="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
  .swatches { display: flex; flex-wrap: wrap; gap: 6px; }
  .swatch { width: 22px; height: 22px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: var(--swatch); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25); cursor: pointer; }
  .swatch[aria-checked="true"] { border-color: var(--ink); }
  .swatch.custom { position: relative; overflow: hidden; background: conic-gradient(#e5484d, #f5a524, #30a46c, #3b82f6, #a855f7, #e5484d); }
  .swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .spots { display: grid; grid-template-columns: repeat(3, 26px); grid-template-rows: repeat(3, 18px); gap: 3px; padding: 4px; width: max-content; border: 1px solid var(--line); border-radius: 8px; }
  .spot { position: relative; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: none; cursor: pointer; }
  .spot i { position: absolute; inset: 4px 6px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 25%, transparent); }
  .spot[aria-checked="true"] { border-color: var(--accent); }
  .spot[aria-checked="true"] i { background: var(--accent); }
  .spot-top-left { grid-area: 1 / 1; } .spot-top { grid-area: 1 / 2; } .spot-top-right { grid-area: 1 / 3; }
  .spot-center { grid-area: 2 / 2; }
  .spot-bottom-left { grid-area: 3 / 1; } .spot-bottom { grid-area: 3 / 2; } .spot-bottom-right { grid-area: 3 / 3; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
