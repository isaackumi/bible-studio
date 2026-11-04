<script lang="ts">
  import { fly, slide } from "../ui/motion";
  import { audienceRoom } from "../app/rooms.svelte";
  import { pictures } from "../app/pictures.svelte";
  import { session } from "../app/session.svelte";
  import { t, tn } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // Now running: what keeps going while the operator works elsewhere (a quiz on the phones, a
  // slideshow, a looping deck, music, a stream, captions). A small island hangs under the top bar
  // with the most pressing one and its next step; it opens into the whole list, each with a way
  // back to it and a way to stop it. Whatever is open on the desk already is left out.

  type Item = {
    id: string;
    icon: string;
    /** live: the room is waiting on the operator (a game); the rest run by themselves. */
    tone: "live" | "on" | "calm";
    title: string;
    detail: string;
    /** The one thing to do next (a game's next step). */
    primary?: { label: string; run: () => unknown; waiting?: boolean };
    open?: () => void;
    stop?: { label: string; run: () => unknown };
  };

  let expanded = $state(false);

  // Where the island sits: centred under the top bar until moved by its grip, then where it was
  // left (on this computer). Hidden, it waits as a small dot until something new starts.
  const PLACE_KEY = "church-studio.now-running.place";
  type Place = { x: number; y: number };
  const savedPlace = (): Place | null => {
    try {
      const value = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null") as Place | null;
      return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
    } catch {
      return null;
    }
  };
  let place = $state<Place | null>(typeof localStorage === "undefined" ? null : savedPlace());
  let island = $state<HTMLElement | null>(null);
  let drag: { dx: number; dy: number } | null = null;
  /** What was running when hidden: anything not in it brings the island back. */
  let hiddenWith = $state<Set<string> | null>(null);

  /** Keep the island (or the dot) wholly on screen. */
  function clamp(next: Place): Place {
    const box = island?.getBoundingClientRect();
    const width = box?.width ?? 40;
    const height = box?.height ?? 40;
    return { x: Math.min(Math.max(8, next.x), Math.max(8, window.innerWidth - width - 8)), y: Math.min(Math.max(8, next.y), Math.max(8, window.innerHeight - height - 8)) };
  }
  function grab(event: PointerEvent) {
    if (event.button !== 0 || !island) return;
    const box = island.getBoundingClientRect();
    drag = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    place = clamp({ x: event.clientX - drag.dx, y: event.clientY - drag.dy });
  }
  function release() {
    if (!drag) return;
    drag = null;
    try {
      if (place) localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    } catch {
      // Storage blocked: the place lasts until the desk closes.
    }
  }
  function recentre() {
    place = null;
    try {
      localStorage.removeItem(PLACE_KEY);
    } catch {
      // Nothing saved to remove.
    }
  }
  $effect(() => {
    const keep = () => {
      if (place) place = clamp(place);
    };
    window.addEventListener("resize", keep);
    return () => window.removeEventListener("resize", keep);
  });
  let now = $state(Date.now());
  $effect(() => {
    const tick = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(tick);
  });

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

  const items = $derived.by((): Item[] => {
    const list: Item[] = [];
    const room = audienceRoom;
    const roomPanel = room.open ? room.tab : null;
    const run = room.playing;
    // A quiz or poll on the phones.
    if (run && roomPanel !== "games") {
      const live = room.liveActivity;
      const closes = room.answersCloseAt;
      const left = closes !== null ? Math.max(0, Math.ceil((closes - now) / 1000)) : null;
      const state = !live ? t("Not started") : live.phase === "open" ? `${tn(room.view?.answered ?? 0, "{n} answer", "{n} answers")}${left !== null ? ` · ${t("{n} s left", { n: left })}` : ""}` : live.phase === "closed" ? t("Answers closed") : run.game.kind === "quiz" ? t("Answer showing") : t("Results showing");
      list.push({
        id: "game",
        icon: run.game.kind === "quiz" ? "sparkles" : "list",
        tone: "live",
        title: run.game.title,
        detail: `${t("Question {n} of {total}", { n: run.index + 1, total: run.game.questions.length })} · ${state}`,
        primary: room.nextStep ?? undefined,
        open: () => room.showTab("games"),
        stop: { label: t("End game"), run: () => room.endGame() },
      });
    }
    if (!run && room.gameOnScreen && roomPanel !== "games" && roomPanel !== "pick") {
      list.push({ id: "game-screen", icon: "users", tone: "on", title: t("A game is still on the screen"), detail: t("The podium or the last frame"), open: () => room.showTab("games"), stop: { label: t("Take it off"), run: () => room.takeGameOff() } });
    }
    // Questions from the room, waiting for the operator.
    const waiting = room.view?.questions.filter((question) => question.state === "pending").length ?? 0;
    if (waiting && roomPanel !== "questions") {
      list.push({ id: "questions", icon: "users", tone: "on", title: tn(waiting, "{n} question waiting", "{n} questions waiting"), detail: t("From people's phones, for you to put through"), open: () => room.showTab("questions") });
    }
    if (room.sharing && !room.open) {
      list.push({ id: "sharing", icon: "cast", tone: "on", title: t("Sharing the screen"), detail: t("Phones and browsers see what goes LIVE"), open: () => room.show(), stop: { label: t("Stop"), run: () => room.share(false) } });
    }
    // Pictures, decks and music running by themselves.
    if (pictures.slideshow.running && !pictures.open) {
      list.push({
        id: "slideshow",
        icon: "media",
        tone: pictures.slideshow.paused ? "calm" : "on",
        title: t("Slideshow"),
        detail: pictures.slideshow.paused ? t("Paused") : t("Changing on the screen"),
        primary: pictures.slideshow.paused ? { label: t("Resume"), run: () => pictures.resume() } : { label: t("Pause"), run: () => pictures.pause() },
        open: () => pictures.show(),
        stop: { label: t("Stop"), run: () => pictures.stop() },
      });
    }
    const loop = session.deckLoop;
    if (loop) {
      const deck = session.decks.find((entry) => entry.id === loop.deckId);
      list.push({ id: "loop", icon: "stage", tone: "on", title: deck?.name ?? t("Slides"), detail: t("Looping · page {n} of {total} · every {s} s", { n: loop.index + 1, total: deck?.pages.length ?? 1, s: loop.seconds }), stop: { label: t("Stop"), run: () => session.stopDeckLoop() } });
    }
    if (session.audio.playing && !session.audioOpen) {
      list.push({ id: "music", icon: "lyrics", tone: "calm", title: session.audio.current?.name ?? t("Music"), detail: t("Playing"), primary: { label: t("Pause"), run: () => session.audio.toggle() }, open: () => session.openAudio() });
    }
    const broadcast = session.broadcastState;
    if (broadcast.status === "on" && (broadcast.streaming || broadcast.recording)) {
      list.push({ id: "broadcast", icon: "camera", tone: "live", title: broadcast.streaming && broadcast.recording ? t("Streaming and recording") : broadcast.streaming ? t("Streaming") : t("Recording"), detail: clock(broadcast.seconds) });
    }
    if (session.captionsOn) {
      list.push({ id: "captions", icon: "captions", tone: "calm", title: t("Live captions"), detail: t("On the screen and on phones"), stop: { label: t("Turn off"), run: () => session.setCaptions(false) } });
    }
    return list;
  });
  const lead = $derived(items[0] ?? null);
  const more = $derived(items.length - 1);

  $effect(() => {
    if (!items.length) expanded = false;
  });
  // Hidden until something new starts; when everything has stopped, the next start shows it too.
  $effect(() => {
    const hidden = hiddenWith;
    if (!hidden) return;
    if (!items.length || items.some((item) => !hidden.has(item.id))) hiddenWith = null;
  });
  function hide() {
    expanded = false;
    hiddenWith = new Set(items.map((item) => item.id));
  }
</script>

{#if lead && hiddenWith}
  <button type="button" class="dot tone-{lead.tone}" class:placed={place} bind:this={island} style:left={place ? `${place.x}px` : undefined} style:top={place ? `${place.y}px` : undefined} aria-label={t("Show what is running ({n})", { n: items.length })} data-tip={t("Show what is running")} onclick={() => (hiddenWith = null)} transition:fly={{ y: -8, duration: 160 }}>
    <span class="pulse" aria-hidden="true"></span><b>{items.length}</b>
  </button>
{:else if lead}
  <div class="island" class:expanded class:placed={place} bind:this={island} style:left={place ? `${place.x}px` : undefined} style:top={place ? `${place.y}px` : undefined} role="region" data-tour="now-running" aria-label={t("Now running")} transition:fly={{ y: -16, duration: 220 }}>
    <div class="pill tone-{lead.tone}">
      <span class="grip" role="button" tabindex="-1" aria-label={t("Move")} data-tip={t("Drag to move · double-click to centre")} onpointerdown={grab} onpointermove={move} onpointerup={release} onpointercancel={release} ondblclick={recentre}><Icon name="grip" size={14} /></span>
      <span class="pulse" aria-hidden="true"></span>
      <Icon name={lead.icon} size={14} />
      <button type="button" class="what" onclick={() => (lead.open ? lead.open() : (expanded = !expanded))} title={lead.open ? t("Go to it") : undefined}>
        <strong>{lead.title}</strong><span>{lead.detail}</span>
      </button>
      {#if lead.primary}
        <button type="button" class="step" class:waiting={lead.primary.waiting} disabled={lead.primary.waiting} onclick={() => void lead.primary?.run()}>{lead.primary.label}</button>
      {/if}
      <button type="button" class="more" aria-expanded={expanded} aria-label={expanded ? t("Show less") : t("Show everything running")} onclick={() => (expanded = !expanded)}>
        {#if more > 0}<b>+{more}</b>{/if}<Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      <button type="button" class="hide" aria-label={t("Hide")} data-tip={t("Hide until something new starts")} onclick={hide}><Icon name="close" size={13} /></button>
    </div>
    {#if expanded}
      <ul class="list" transition:slide={{ duration: 180 }}>
        {#each items as item (item.id)}
          <li class="tone-{item.tone}">
            <span class="ico"><Icon name={item.icon} size={15} /></span>
            <span class="words"><strong>{item.title}</strong><span>{item.detail}</span></span>
            <span class="acts">
              {#if item.primary}<button type="button" class="act main" disabled={item.primary.waiting} onclick={() => void item.primary?.run()}>{item.primary.label}</button>{/if}
              {#if item.open}<button type="button" class="act" onclick={() => { item.open?.(); expanded = false; }}>{t("Open")}</button>{/if}
              {#if item.stop}<button type="button" class="act stop" onclick={() => void item.stop?.run()}>{item.stop.label}</button>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  /* An island hanging under the top bar, centred: it covers no button, and grows when opened. */
  .island { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); z-index: 880; width: max-content; max-width: min(640px, calc(100vw - 32px)); }
  .island.placed, .dot.placed { transform: none; }
  .pill { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 6px 0 4px; border-radius: 999px; background: color-mix(in srgb, #0d0d12 92%, transparent); color: #fff; box-shadow: 0 10px 34px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.08); backdrop-filter: blur(12px); }
  .expanded .pill { border-radius: 20px 20px 0 0; }
  .pulse { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #3fb950; }
  .tone-live .pulse { background: #ff3b3b; box-shadow: 0 0 0 0 rgb(255 59 59 / 0.6); animation: pulse 1.6s ease-out infinite; }
  .tone-calm .pulse { background: #8b8b96; }
  @keyframes pulse { 70% { box-shadow: 0 0 0 8px rgb(255 59 59 / 0); } 100% { box-shadow: 0 0 0 0 rgb(255 59 59 / 0); } }
  .what { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .what strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .what span { color: rgb(255 255 255 / 0.65); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .what:hover strong { text-decoration: underline; }
  .step { flex: none; height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--accent); color: #fff; font: inherit; font-size: 12.5px; font-weight: 750; cursor: pointer; }
  .step.waiting { background: rgb(255 255 255 / 0.12); color: rgb(255 255 255 / 0.7); cursor: default; }
  .more { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 30px; padding: 0 8px; border: 0; border-radius: 999px; background: rgb(255 255 255 / 0.08); color: #fff; font: inherit; font-size: 12px; cursor: pointer; }
  .more b { font-weight: 750; }
  .more:hover { background: rgb(255 255 255 / 0.16); }
  .list { list-style: none; margin: 0; padding: 6px; display: grid; gap: 4px; border-radius: 0 0 18px 18px; background: color-mix(in srgb, #0d0d12 96%, transparent); color: #fff; box-shadow: 0 18px 40px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; }
  .list li:hover { background: rgb(255 255 255 / 0.05); }
  .ico { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: rgb(255 255 255 / 0.08); }
  .tone-live .ico { background: rgb(255 59 59 / 0.2); color: #ff8a8a; }
  .words { display: grid; flex: 1; min-width: 0; }
  .words strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .words span { color: rgb(255 255 255 / 0.6); font-size: 12px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acts { flex: none; display: flex; gap: 4px; }
  .act { height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: rgb(255 255 255 / 0.1); color: #fff; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .act:hover { background: rgb(255 255 255 / 0.18); }
  .act.main { background: var(--accent); }
  .act.stop { color: #ff8a8a; }
  .act:disabled { opacity: 0.5; cursor: default; }
  .grip { flex: none; display: grid; place-items: center; width: 22px; height: 30px; border-radius: 999px; color: rgb(255 255 255 / 0.45); cursor: grab; touch-action: none; }
  .grip:hover { color: #fff; background: rgb(255 255 255 / 0.08); }
  .grip:active { cursor: grabbing; }
  .hide { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 50%; background: none; color: rgb(255 255 255 / 0.55); cursor: pointer; }
  .hide:hover { background: rgb(255 255 255 / 0.12); color: #fff; }
  /* Hidden: a small dot that still says something is running, and how many. */
  .dot { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); z-index: 880; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 0; border-radius: 999px; background: color-mix(in srgb, #0d0d12 92%, transparent); color: #fff; font: inherit; font-size: 12px; box-shadow: 0 6px 20px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(255 255 255 / 0.08); cursor: pointer; }
  .dot b { font-weight: 750; font-variant-numeric: tabular-nums; }
  .dot:hover { background: #0d0d12; }
  :is(button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .tone-live .pulse { animation: none; } }
</style>
