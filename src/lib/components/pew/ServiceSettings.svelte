<script lang="ts">
  import ScreenCardEditor from "./ScreenCardEditor.svelte";
  import { session } from "../../app/session.svelte";
  import type { ScreenDest, Service } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { msg, t, tn } from "../../i18n/core";

  // Everything this service does by itself while it runs, one topic at a time: each topic in the
  // list says how it is set now, and the summary on top reads the whole service in one line.
  let { service, onclose }: { service: Service; onclose: () => void } = $props();

  type Topic = "live" | "moving" | "readings" | "screen" | "warnings";
  let topic = $state<Topic>("moving");
  let armedReset = $state(false);

  const DESTS: Array<[ScreenDest, string]> = [
    ["screen", msg("Screen")],
    ["preview", msg("Preview")],
    ["off", msg("Off")],
  ];
  const destName = (dest: ScreenDest) => t(DESTS.find(([id]) => id === dest)![1]);

  const liveOnClick = $derived(service.liveOnClick !== false);
  const mode = $derived(service.autoAdvance ?? "remind");
  let screenTab = $state<"countdown" | "leader">("countdown");
  const MODES: Array<{ id: "remind" | "next" | "off"; name: string; hint: string }> = [
    { id: "remind", name: msg("Remind me"), hint: msg("The desk asks you to move on, and chimes. Nothing moves until you say.") },
    { id: "next", name: msg("Move on by itself"), hint: msg("The next part begins and its first item goes up. A message lets you stay.") },
    { id: "off", name: msg("Only show it as over"), hint: msg("The part turns red. You move on with Next.") },
  ];
  const modeName = $derived(t(MODES.find((entry) => entry.id === mode)!.name));
  const verses = $derived(service.versesPerScreen ?? 0);

  const COUNT_MODES: Array<["corner" | "full" | "off", string]> = [["corner", msg("In the corner")], ["full", msg("Full screen")], ["off", msg("Off")]];
  const TOPICS = $derived<Array<{ id: Topic; icon: string; name: string; value: string }>>([
    { id: "live", icon: "play", name: t("Going live"), value: liveOnClick ? t("Auto LIVE") : t("Preview first") },
    { id: "moving", icon: "chevron-right", name: t("When time is up"), value: modeName },
    { id: "readings", icon: "bible", name: t("Readings"), value: verses ? tn(verses, "{n} verse a screen", "{n} verses a screen") : t("All verses") },
    { id: "screen", icon: "screens", name: t("On the screen"), value: `${t("Countdown")} ${t(COUNT_MODES.find(([id]) => id === session.countdownMode)![1])} · ${t("Names")} ${destName(session.leaderTo)}` },
    { id: "warnings", icon: "alerts", name: t("Warnings"), value: service.warnMinutes ? t("{n} min before", { n: service.warnMinutes }) : t("Last fifth") },
  ]);

  function reset() {
    if (!armedReset) {
      armedReset = true;
      setTimeout(() => (armedReset = false), 3000);
      return;
    }
    armedReset = false;
    session.resetServiceSettings();
  }
</script>

<DeskDialog title={t("Service settings")} wide {onclose}>
  <div class="layout">
    <p class="summary">
      <span class="who">{t("For {name}", { name: service.name })}</span>
      <span class="chips">
        <span class="chip" class:on={liveOnClick}><Icon name="play" size={11} />{liveOnClick ? t("Auto LIVE") : t("Preview first")}</span>
        <span class="chip" class:on={mode !== "off"}><Icon name="timer" size={11} />{modeName}</span>
        {#if verses}<span class="chip on"><Icon name="bible" size={11} />{tn(verses, "{n} verse a screen", "{n} verses a screen")}</span>{/if}
        {#if session.countdownMode !== "off"}<span class="chip on"><Icon name="clock" size={11} />{t("Countdown")}</span>{/if}
        {#if session.leaderTo !== "off"}<span class="chip on"><Icon name="user" size={11} />{t("Names")}</span>{/if}
      </span>
    </p>

    <nav class="topics" aria-label={t("Service settings")}>
      {#each TOPICS as entry (entry.id)}
        <button type="button" class="topic" class:on={topic === entry.id} aria-current={topic === entry.id ? "page" : undefined} onclick={() => (topic = entry.id)}>
          <span class="topic-icon"><Icon name={entry.icon} size={15} /></span>
          <span class="topic-copy"><strong>{entry.name}</strong><em>{entry.value}</em></span>
        </button>
      {/each}
    </nav>

    <section class="pane" aria-live="polite">
      {#if topic === "live"}
        <h3>{t("Going live")}</h3>
        <p class="intro">{t("While the service runs, how an item gets to the screen.")}</p>
        <div class="cards two">
          <button type="button" class="card" aria-pressed={liveOnClick} onclick={() => session.setServiceSettings({ liveOnClick: true })}>
            <span class="diagram"><i class="box sel"></i><Icon name="chevron-right" size={12} /><i class="box live"></i></span>
            <strong>{t("Auto LIVE")}</strong>
            <em>{t("A click on an item, or Next, sends it straight to LIVE.")}</em>
          </button>
          <button type="button" class="card" aria-pressed={!liveOnClick} onclick={() => session.setServiceSettings({ liveOnClick: false })}>
            <span class="diagram"><i class="box sel"></i><Icon name="chevron-right" size={12} /><i class="box prev"></i><Icon name="chevron-right" size={12} /><i class="box live"></i></span>
            <strong>{t("Preview first")}</strong>
            <em>{t("Items go to Preview; LIVE (Space) sends them.")}</em>
          </button>
        </div>
      {:else if topic === "moving"}
        <h3>{t("When a part's time is up")}</h3>
        <p class="intro">{t("The plan follows the room: a part's clock starts when it is moved on to, or when something from it goes live. A part that runs long shows the service as behind.")}</p>
        <div class="cards">
          {#each MODES as entry (entry.id)}
            <button type="button" class="card row" aria-pressed={mode === entry.id} onclick={() => session.setServiceSettings({ autoAdvance: entry.id })}>
              <span class="radio" aria-hidden="true"></span>
              <span class="card-copy">
                <strong>{t(entry.name)}{#if entry.id === "remind"}<span class="tag">{t("Recommended")}</span>{/if}</strong>
                <em>{t(entry.hint)}</em>
              </span>
            </button>
          {/each}
        </div>
        <div class="field" class:dim={mode === "off"}>
          <span class="field-copy"><strong>{t("Allow a part to run over by")}</strong><em>{t("Before reminding or moving on.")}</em></span>
          <div class="steps" role="radiogroup" aria-label={t("Allow a part to run over by")}>
            {#each [0, 1, 2, 5, 10] as minutes (minutes)}
              <button type="button" role="radio" disabled={mode === "off"} aria-checked={(service.advanceGrace ?? 0) === minutes} onclick={() => session.setServiceSettings({ advanceGrace: minutes || undefined })}>{minutes ? t("{n} min", { n: minutes }) : t("None")}</button>
            {/each}
          </div>
        </div>
      {:else if topic === "readings"}
        <h3>{t("Readings")}</h3>
        <p class="intro">{t("How many verses each screen shows for readings. Auto splits readings longer than three verses. Each reading can still be changed on its row.")}</p>
        <div class="steps big" role="radiogroup" aria-label={t("Verses per screen")}>
          {#each [0, 1, 2, 3, 4, 5, 6] as n (n)}
            <button type="button" role="radio" aria-checked={verses === n} onclick={() => session.setServiceSettings({ versesPerScreen: n || undefined })}>
              <strong>{n || t("Auto")}</strong><small>{n ? tn(n, "verse", "verses") : t("long ones split")}</small>
            </button>
          {/each}
        </div>
        <div class="field">
          <span class="field-copy"><strong>{t("Readings open on")}</strong><em>{t("The Presenter page gives its Bible, verse list and search for readings; the service keeps time either way.")}</em></span>
          <div class="steps" role="radiogroup" aria-label={t("Readings open on")}>
            <button type="button" role="radio" aria-checked={(service.readingsOn ?? "service") === "service"} onclick={() => session.setServiceSettings({ readingsOn: undefined })}>{t("Service page")}</button>
            <button type="button" role="radio" aria-checked={service.readingsOn === "presenter"} onclick={() => session.setServiceSettings({ readingsOn: "presenter" })}>{t("Presenter page")}</button>
          </div>
        </div>
      {:else if topic === "screen"}
        <h3>{t("On the screen")}</h3>
        <p class="intro">{t("The countdown and the leaders' names: where each shows, and how it looks.")}</p>
        <ScreenCardEditor bind:tab={screenTab} />
      {:else}
        <h3>{t("Warnings")}</h3>
        <p class="intro">{t("When a part shows “Ending soon” (amber) on its row and on the timeline, before its time is up.")}</p>
        <div class="steps big" role="radiogroup" aria-label={t("Show “Ending soon”")}>
          {#each [0, 1, 2, 3, 5, 10] as minutes (minutes)}
            <button type="button" role="radio" aria-checked={(service.warnMinutes ?? 0) === minutes} onclick={() => session.setServiceSettings({ warnMinutes: minutes || undefined })}>
              <strong>{minutes || t("Auto")}</strong><small>{minutes ? t("min before") : t("last fifth")}</small>
            </button>
          {/each}
        </div>
        <div class="sample" aria-hidden="true">
          <span class="sample-bar"><i></i></span>
          <span class="sample-pill"><i></i>{t("Ending soon")} · 3:12</span>
        </div>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <button type="button" class="foot-btn ghost" class:armed={armedReset} onclick={reset}>{armedReset ? t("Reset? Click again") : t("Reset to defaults")}</button>
    <button type="button" class="foot-btn" title={t("New services on this computer start with these settings")} onclick={() => session.saveServiceDefaults()}><Icon name="copy" size={13} /> {t("Use for new services")}</button>
    <button type="button" class="foot-btn primary" onclick={onclose}>{t("Done")}</button>
  {/snippet}
</DeskDialog>

<style>
  .layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); grid-template-rows: auto 1fr; gap: 14px 18px; width: 100%; min-height: 380px; }
  .summary { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .who { font-size: 12px; font-weight: 700; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border: 1px solid var(--line); border-radius: 11px; color: var(--muted); font-size: 11px; font-weight: 650; }
  .chip.on { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  .topics { display: grid; align-content: start; gap: 4px; }
  .topic { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid transparent; border-radius: 10px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .topic:hover { background: var(--field); }
  .topic.on { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, var(--field)); }
  .topic-icon { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--field); color: var(--muted); }
  .topic.on .topic-icon { background: var(--accent); color: var(--on-accent); }
  .topic-copy { display: grid; gap: 1px; min-width: 0; }
  .topic-copy strong { font-size: 13px; }
  .topic-copy em { font-style: normal; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pane { display: grid; align-content: start; gap: 12px; min-width: 0; padding: 4px 2px 4px 18px; border-left: 1px solid var(--line); animation: pane-in 0.18s ease-out; }
  @keyframes pane-in { from { opacity: 0; transform: translateX(4px); } }
  h3 { margin: 0; font-size: 16px; }
  .intro { margin: -6px 0 2px; font-size: 12px; line-height: 1.5; color: var(--muted); }

  .cards { display: grid; gap: 8px; }
  .cards.two { grid-template-columns: 1fr 1fr; }
  .card { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .card.row { display: flex; align-items: center; gap: 12px; }
  .card:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .card[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .card strong { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
  .card em { font-style: normal; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .card-copy { display: grid; gap: 2px; }
  .radio { flex: none; width: 16px; height: 16px; border: 2px solid var(--line); border-radius: 50%; }
  .card[aria-pressed="true"] .radio { border-color: var(--accent); background: radial-gradient(circle, var(--accent) 45%, transparent 50%); }
  .tag { padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, #30a46c 20%, transparent); font-size: 10px; font-weight: 750; }
  .diagram { display: flex; align-items: center; gap: 6px; height: 34px; color: var(--muted); }
  .box { width: 34px; height: 22px; border-radius: 4px; border: 1px solid var(--line); background: var(--field); }
  .box.prev { border-color: var(--accent); }
  .box.live { border-color: var(--live, #e5484d); background: color-mix(in srgb, var(--live, #e5484d) 22%, var(--field)); }

  .field { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
  .field.dim { opacity: 0.5; }
  .field-copy { display: grid; gap: 2px; min-width: 160px; }
  .field-copy strong { font-size: 13px; }
  .field-copy em { font-style: normal; font-size: 12px; color: var(--muted); }

  .steps { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; }
  .steps button { min-width: 44px; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .steps button[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }
  .steps button:disabled { cursor: default; }
  .steps.big { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; padding: 0; border: 0; }
  .steps.big button { display: grid; justify-items: center; gap: 1px; height: auto; padding: 10px 6px; border: 1px solid var(--line); border-radius: 10px; }
  .steps.big button strong { font-size: 18px; color: var(--ink); }
  .steps.big button small { font-size: 10px; }
  .steps.big button[aria-checked="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }

  .sample { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 10px; }
  .sample-bar { position: relative; width: 90px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 12%, transparent); overflow: hidden; }
  .sample-bar i { position: absolute; inset: 0 auto 0 0; width: 85%; background: #f5a524; }
  .sample-pill { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 8px; background: color-mix(in srgb, #f5a524 26%, transparent); color: #f5a524; font-size: 12px; font-weight: 650; }
  .sample-pill i { width: 7px; height: 7px; border-radius: 50%; background: #f5a524; }


  .foot-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .foot-btn.ghost { margin-right: auto; background: none; color: var(--muted); }
  .foot-btn.armed { border-color: var(--danger, #e5484d); color: var(--danger, #e5484d); }
  .foot-btn.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
  @media (max-width: 720px) {
    .layout { grid-template-columns: 1fr; }
    .topics { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .pane { padding-left: 0; border-left: 0; }
    .cards.two { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .pane { animation: none; } }
</style>
