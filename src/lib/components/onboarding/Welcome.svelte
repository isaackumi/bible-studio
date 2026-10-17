<script lang="ts">
  import { fade } from "svelte/transition";
  import { session } from "../../app/session.svelte";
  import { BIBLE_CATALOG } from "../../bible/texts";
  import { api } from "../../db/api";
  import { TRIAL_DAYS } from "../../domain/plans";
  import { presentScripture, presentText } from "../../domain/present";
  import { emptyModel } from "../../domain/theme";
  import type { DeskStyle, OperatorTheme, VerseText } from "../../domain/types";
  import { isDesktop } from "../../platform/runtime";
  import { prepareListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import MiniDesk from "./MiniDesk.svelte";

  // First run, in the app's own colors. A working miniature of the desk sits beside the
  // questions and shows each answer the way the real desk will: the theme and accent recolor
  // everything at once, the church name and verses render through the real slide engine.
  let { booting = false }: { booting?: boolean } = $props();

  type Step = "welcome" | "church" | "look" | "scripture" | "voice" | "ready";
  const STEPS: { id: Step; label: string }[] = [
    { id: "welcome", label: "Welcome" },
    { id: "church", label: "Church" },
    { id: "look", label: "Look" },
    { id: "scripture", label: "Bible" },
    { id: "voice", label: "Voice" },
    { id: "ready", label: "Ready" },
  ];
  const THEMES: { id: OperatorTheme; name: string; note: string; ground: string; panel: string; ink: string }[] = [
    { id: "dark", name: "Night", note: "Black desk", ground: "#050505", panel: "#141414", ink: "#f5f5f5" },
    { id: "vespers", name: "Vespers", note: "Warm black", ground: "#0c0a09", panel: "#161311", ink: "#f6f1e7" },
    { id: "nave", name: "Nave", note: "Blue black", ground: "#070b12", panel: "#0f1520", ink: "#f4f7fb" },
    { id: "light", name: "Day", note: "White desk", ground: "#f7f5f3", panel: "#ffffff", ink: "#050505" },
  ];
  const ACCENTS = [
    { name: "Signal", value: "#fa4f00" },
    { name: "Mustard", value: "#e2cc9d" },
    { name: "Ember", value: "#ff8f55" },
    { name: "Crimson", value: "#be2119" },
    { name: "Psalm", value: "#3e7bfa" },
  ];
  const GENESIS: VerseText[] = [{ verse: 3, text: "And God said, Let there be light: and there was light." }];

  let step = $state<Step>("welcome");
  const index = $derived(STEPS.findIndex((entry) => entry.id === step));
  let churchName = $state(session.workspace.churchName);
  let translation = $state(session.translations[0]?.id ?? "kjv");
  let verses = $state<{ v16: VerseText[]; v17: VerseText[] }>({
    v16: [{ verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." }],
    v17: [{ verse: 17, text: "For God sent not his Son into the world to condemn the world; but that the world through him might be saved." }],
  });
  let micNote = $state("");
  let micAsked = $state(false);
  let desk = $state<DeskStyle>("pewbeam");
  /** Voice demo beat: 0 "next verse" → 1 John 3:17 on Preview → 2 "go live" → 3 on air. */
  let beat = $state(0);

  const appearance = $derived(session.workspace.appearance);
  const installedIds = $derived(session.translations.map((entry) => entry.id));
  const chosen = $derived(BIBLE_CATALOG.find((entry) => entry.id === translation) ?? BIBLE_CATALOG[0]!);
  const name = $derived(churchName.trim() || "Your church");

  // The bundled WEB text has stray spaces around punctuation ("world , that", "didn’ t").
  const tidy = (rows: VerseText[]) =>
    rows.map((row) => ({ ...row, text: row.text.replace(/\s+([,.;:!?])/g, "$1").replace(/(\w)([’'])\s+(\w)/g, "$1$2$3") }));

  $effect(() => {
    const id = translation;
    if (!installedIds.includes(id)) return;
    void Promise.all([api.passage(id, 43, 3, 16, 16), api.passage(id, 43, 3, 17, 17)])
      .then(([v16, v17]) => {
        if (id === translation && v16.length && v17.length) verses = { v16: tidy(v16), v17: tidy(v17) };
      })
      .catch(() => {});
  });

  $effect(() => {
    if (step !== "voice") return;
    beat = 0;
    const timer = setInterval(() => (beat = (beat + 1) % 4), 1700);
    return () => clearInterval(timer);
  });

  // What the miniature desk shows for each step, through the real slide renderer.
  const scripture = (rows: VerseText[], verse: number) =>
    presentScripture({ theme: session.theme(), reference: `John 3:${verse}`, attribution: chosen.name, verses: rows });
  const title = () => presentText({ theme: session.theme(), layout: "title", heading: name, body: "Welcome" });
  const shown = $derived.by(() => {
    const empty = emptyModel(session.theme());
    if (step === "welcome") {
      const genesis = presentScripture({ theme: session.theme(), reference: "Genesis 1:3", attribution: "King James Version", verses: GENESIS });
      return { preview: genesis, program: empty, onAir: false, reference: "Genesis 1:3", heard: "" };
    }
    if (step === "church") return { preview: title(), program: empty, onAir: false, reference: "Logo slide", heard: "" };
    if (step === "look" || step === "scripture") return { preview: scripture(verses.v16, 16), program: empty, onAir: false, reference: `John 3:16 ${chosen.abbreviation}`, heard: "" };
    if (step === "voice") {
      const next = beat >= 1;
      const live = beat >= 3;
      const preview = next ? scripture(verses.v17, 17) : scripture(verses.v16, 16);
      return { preview, program: live ? preview : empty, onAir: live, reference: next ? "John 3:17" : "John 3:16", heard: beat < 2 ? "next verse" : "go live" };
    }
    return { preview: scripture(verses.v16, 16), program: title(), onAir: true, reference: "John 3:16", heard: "" };
  });

  /** Put the cursor in the field when its step appears, so typing goes straight in. */
  function focusOnShow(node: HTMLInputElement) {
    requestAnimationFrame(() => node.focus());
  }

  function go(next: number) {
    const target = STEPS[Math.max(0, Math.min(STEPS.length - 1, next))];
    if (!target) return;
    if (step === "church") {
      session.setChurchName(churchName.trim());
      if (churchName.trim()) session.setLogoText(churchName.trim());
    }
    step = target.id;
  }

  async function askMic() {
    micAsked = true;
    micNote = "Asking for the microphone…";
    try {
      if (isDesktop()) micNote = (await prepareListening()) ?? "The microphone is ready.";
      else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        micNote = "The microphone is ready.";
      }
    } catch {
      micNote = "The microphone was not allowed. Allow it later in Settings › Sound & voice.";
    }
  }

  function finish(withTrial = false) {
    if (step === "church") go(index);
    if (withTrial) session.startTrial();
    if (desk === "obs" && (withTrial || session.entitled("production"))) session.setAppearance({ desk: "obs" });
    session.finishOnboarding();
  }

  function onKey(event: KeyboardEvent) {
    if (booting) return;
    const target = event.target as HTMLElement | null;
    if (event.key === "Enter" && !target?.closest("button, textarea")) {
      event.preventDefault();
      if (step === "ready") finish(desk === "obs" && !session.entitled("production"));
      else go(index + 1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="first-run" out:fade={{ duration: 300 }}>
  {#if booting}
    <div class="ob-boot" role="status" aria-live="polite">
      <span class="mark"><Icon name="church" size={30} /></span>
      <p class="wordmark">Church Studio</p>
      <span class="loader"><i></i></span>
      <p class="boot-note">{session.ready ? "Opening your library" : "Starting up"}</p>
    </div>
  {:else}
    <header class="ob-top">
      <span class="ob-brand"><span class="mark small"><Icon name="church" size={16} /></span>Church Studio</span>
      <span class="count">Setup, step {index + 1} of {STEPS.length}</span>
      <button type="button" class="skip" onclick={() => finish()}>Skip setup</button>
    </header>

    <main class="layout">
      <section class="ask" aria-labelledby="step-title">
        {#key step}
          <div class="step" in:fade={{ duration: 220 }}>
            {#if step === "welcome"}
              <h1 id="step-title">Let’s get your church on screen</h1>
              <p class="lede">Six quick choices. The desk on the right is the real thing: it changes as you answer, so you see how Sunday will look before you start.</p>
              <ul class="promises">
                <li><Icon name="bible" size={16} /><span>Scripture, songs and sermons, ready offline</span></li>
                <li><Icon name="mic" size={16} /><span>Say “next verse” and the desk follows</span></li>
                <li><Icon name="cast" size={16} /><span>Nothing reaches the screen until you press LIVE</span></li>
              </ul>
            {:else if step === "church"}
              <h1 id="step-title">What is your church called?</h1>
              <p class="lede">It becomes your logo slide, and it heads the app.</p>
              <label class="field-wrap">
                <span>Church name</span>
                <input use:focusOnShow placeholder="Grace Chapel" maxlength="80" bind:value={churchName} />
              </label>
            {:else if step === "look"}
              <h1 id="step-title">Make the desk yours</h1>
              <p class="lede">The theme and accent apply right away, to this screen and to the desk.</p>
              <div class="themes" role="radiogroup" aria-label="Theme">
                {#each THEMES as entry (entry.id)}
                  <button type="button" role="radio" aria-checked={appearance.theme === entry.id} class="theme" class:on={appearance.theme === entry.id} onclick={() => session.setAppearance({ theme: entry.id })}>
                    <span class="swatch" style:background={entry.ground}>
                      <i style:background={entry.panel}></i>
                      <b style:background={appearance.accent}></b>
                      <em style:color={entry.ink}>Aa</em>
                    </span>
                    <strong>{entry.name}</strong>
                    <span>{entry.note}</span>
                  </button>
                {/each}
              </div>
              <div class="accents" role="radiogroup" aria-label="Accent">
                <span class="ob-label">Accent</span>
                {#each ACCENTS as entry (entry.value)}
                  <button type="button" role="radio" aria-checked={appearance.accent === entry.value} aria-label={entry.name} title={entry.name} class="accent" class:on={appearance.accent === entry.value} style:background={entry.value} onclick={() => session.setAppearance({ accent: entry.value })}></button>
                {/each}
              </div>
            {:else if step === "scripture"}
              <h1 id="step-title">Choose your Bible</h1>
              <p class="lede">King James and the World English Bible are installed. Add others now or any time from Settings.</p>
              <div class="bibles">
                {#each BIBLE_CATALOG as entry (entry.id)}
                  {@const installed = installedIds.includes(entry.id)}
                  {@const busy = session.bibleBusy.includes(entry.id)}
                  <button
                    type="button"
                    class="bible"
                    class:on={translation === entry.id}
                    aria-pressed={translation === entry.id}
                    disabled={busy}
                    onclick={async () => {
                      if (!installed) await session.installBible(entry.id);
                      translation = entry.id;
                    }}
                  >
                    <span class="abbr">{entry.abbreviation}</span>
                    <span class="bname">{entry.name}</span>
                    <span class="state">
                      {#if busy}Downloading…{:else if installed}{translation === entry.id ? "Showing" : "Installed"}{:else}<Icon name="download" size={12} /> {entry.sizeMb} MB{/if}
                    </span>
                  </button>
                {/each}
              </div>
            {:else if step === "voice"}
              <h1 id="step-title">Run it with your voice</h1>
              <p class="lede">Say plain words like “next verse”, “go back” or “give me King James”. A command counts only when it is said on its own, so the sermon never moves the screen.</p>
              <div class="mic">
                {#if !micAsked}
                  <button type="button" class="btn" onclick={() => void askMic()}><Icon name="mic" size={16} /> Allow the microphone</button>
                {/if}
                {#if micNote}<p role="status">{micNote}</p>{/if}
              </div>
            {:else}
              <h1 id="step-title">Where do you want to start?</h1>
              <p class="lede">Switch any time with the two icons at the top left of the desk.</p>
              <div class="desks" role="radiogroup" aria-label="Desk">
                <button type="button" role="radio" aria-checked={desk === "pewbeam"} class="desk" class:on={desk === "pewbeam"} onclick={() => (desk = "pewbeam")}>
                  <Icon name="pew" size={20} />
                  <strong>Presenter Desk</strong>
                  <span>Scripture, songs and sermons. Free.</span>
                </button>
                <button type="button" role="radio" aria-checked={desk === "obs"} class="desk" class:on={desk === "obs"} onclick={() => (desk = "obs")}>
                  <Icon name="obs" size={20} />
                  <strong>Production Desk</strong>
                  <span>Scenes, cameras and video. Premium, free for {TRIAL_DAYS} days.</span>
                </button>
              </div>
            {/if}
          </div>
        {/key}

        <footer class="nav">
          <div class="progress" aria-label="Setup steps">
            {#each STEPS as entry, i (entry.id)}
              <button type="button" class="tick" class:done={i < index} class:here={i === index} aria-label={entry.label} aria-current={i === index ? "step" : undefined} title={entry.label} onclick={() => go(i)}></button>
            {/each}
          </div>
          <div class="buttons">
            {#if index > 0}<button type="button" class="btn quiet" onclick={() => go(index - 1)}>Back</button>{/if}
            {#if step === "ready"}
              {#if desk === "obs" && !session.entitled("production")}
                <button type="button" class="btn primary" onclick={() => finish(true)}>Start trial and open the desk</button>
              {:else}
                <button type="button" class="btn primary" onclick={() => finish()}>Open the desk</button>
              {/if}
            {:else}
              <button type="button" class="btn primary" onclick={() => go(index + 1)}>{step === "welcome" ? "Get started" : "Continue"}</button>
            {/if}
          </div>
        </footer>
      </section>

      <section class="show" aria-label="Preview of the desk">
        <div class="glow" aria-hidden="true"></div>
        <MiniDesk preview={shown.preview} program={shown.program} onAir={shown.onAir} reference={shown.reference} heard={shown.heard} />
        <p class="caption">
          {#if step === "voice"}{beat < 2 ? "“next verse” moves Preview to the next verse" : "“go live” sends Preview to Program"}
          {:else if step === "ready"}On air: Program is what the congregation sees
          {:else}Preview is yours. Program is what the congregation sees.{/if}
        </p>
      </section>
    </main>
  {/if}
</div>

<style>
  .first-run {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    overflow: auto;
  }

  /* Loading */
  .ob-boot { flex: 1; display: grid; place-content: center; justify-items: center; gap: 14px; }
  .mark { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 18px; background: var(--accent); color: #fff; box-shadow: 0 16px 40px color-mix(in srgb, var(--accent) 35%, transparent); }
  .mark.small { width: 28px; height: 28px; border-radius: 8px; box-shadow: none; }
  .wordmark { margin: 4px 0 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .loader { position: relative; width: 160px; height: 3px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 10%, transparent); overflow: hidden; }
  .loader i { position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 3px; background: var(--accent); animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
  .boot-note { margin: 0; font-size: 12px; color: var(--muted); }

  /* Frame */
  .ob-top { display: flex; align-items: center; gap: 12px; padding: 16px 28px; flex: none; }
  .ob-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
  .count { margin-left: auto; font-size: 12px; color: var(--muted); }
  .skip { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .skip:hover { color: var(--ink); }

  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
    gap: clamp(28px, 5vw, 72px);
    align-items: center;
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 0 28px 28px;
    min-height: 0;
  }

  /* Questions */
  .ask { display: flex; flex-direction: column; gap: 28px; min-height: 440px; justify-content: center; }
  .step { display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: clamp(26px, 2.6vw, 34px); font-weight: 750; letter-spacing: -0.025em; line-height: 1.12; }
  .lede { margin: 0; font-size: 15px; line-height: 1.55; color: var(--muted); max-width: 44ch; }
  .promises { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 10px; }
  .promises li { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .promises :global(svg) { color: var(--accent); flex: none; }

  .field-wrap { display: grid; gap: 6px; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .field-wrap input { height: 46px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 17px; outline: none; }
  .field-wrap input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }

  .themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
  .theme, .bible, .desk {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease;
  }
  .theme:hover, .bible:hover:not(:disabled), .desk:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .theme.on, .bible.on, .desk.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .theme strong, .desk strong { font-size: 13px; }
  .theme > span:last-child, .desk span { font-size: 12px; color: var(--muted); }
  .swatch { position: relative; display: block; height: 46px; margin-bottom: 6px; border-radius: 8px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25); }
  .swatch i { position: absolute; left: 8px; top: 8px; width: 40%; height: 30px; border-radius: 4px; }
  .swatch b { position: absolute; right: 8px; top: 8px; width: 22px; height: 8px; border-radius: 3px; }
  .swatch em { position: absolute; right: 9px; bottom: 5px; font-style: normal; font-family: var(--font-scripture); font-size: 16px; }
  .accents { display: flex; align-items: center; gap: 10px; }
  .ob-label { font-size: 12px; font-weight: 600; color: var(--muted); margin-right: 4px; }
  .accent { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .accent.on { outline: 2px solid var(--ink); outline-offset: 3px; }

  .bibles { display: grid; gap: 6px; margin-top: 4px; }
  .bible { flex-direction: row; align-items: center; gap: 12px; padding: 10px 12px; }
  .abbr { display: grid; place-items: center; min-width: 44px; height: 28px; border-radius: 7px; background: var(--field); font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
  .bible.on .abbr { background: var(--accent); color: #fff; }
  .bname { flex: 1; font-size: 13px; font-weight: 600; }
  .state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 650; color: var(--muted); }
  .bible.on .state { color: var(--accent); }
  .bible:disabled { opacity: 0.7; cursor: progress; }

  .mic { display: grid; gap: 10px; justify-items: start; }
  .mic p { margin: 0; font-size: 13px; color: var(--muted); }

  .desks { display: grid; gap: 8px; margin-top: 4px; }
  .desk { padding: 14px; }
  .desk :global(svg) { color: var(--accent); margin-bottom: 4px; }

  .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .progress { display: flex; gap: 6px; }
  .tick { width: 22px; height: 6px; padding: 0; border: 0; border-radius: 6px; background: color-mix(in srgb, var(--ink) 14%, transparent); cursor: pointer; transition: width 200ms ease, background 200ms ease; }
  .tick.done { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .tick.here { width: 40px; background: var(--accent); }
  .buttons { display: flex; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; }
  .btn.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.quiet { border-color: transparent; background: none; color: var(--muted); }
  .btn.quiet:hover { color: var(--ink); }
  :is(.btn, .tick, .theme, .bible, .desk, .accent, .skip):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  /* The desk */
  .show { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; }
  .glow { position: absolute; inset: -10% -6%; background: radial-gradient(ellipse 60% 55% at 50% 45%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%); pointer-events: none; }
  .show > :global(.window) { position: relative; max-width: 820px; }
  .caption { position: relative; margin: 0; font-size: 12px; color: var(--muted); text-align: center; }

  @media (max-width: 980px) {
    .layout { grid-template-columns: 1fr; }
    .show { order: -1; }
    .ask { min-height: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .loader i { animation: none; width: 100%; }
    .tick { transition: none; }
  }
</style>
