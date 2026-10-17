<script lang="ts">
  import { fade } from "svelte/transition";
  import { session } from "../../app/session.svelte";
  import { BIBLE_CATALOG } from "../../bible/texts";
  import { api } from "../../db/api";
  import { TRIAL_DAYS } from "../../domain/plans";
  import type { DeskStyle, OperatorTheme } from "../../domain/types";
  import { isDesktop } from "../../platform/runtime";
  import { prepareListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import Sanctuary from "./Sanctuary.svelte";

  // First run. The projection above the console shows each choice as the room would see it.
  let { booting = false }: { booting?: boolean } = $props();

  type Step = "welcome" | "church" | "look" | "scripture" | "voice" | "ready";
  const STEPS: { id: Step; label: string }[] = [
    { id: "welcome", label: "Welcome" },
    { id: "church", label: "Your church" },
    { id: "look", label: "Look" },
    { id: "scripture", label: "Scripture" },
    { id: "voice", label: "Voice" },
    { id: "ready", label: "Ready" },
  ];
  const THEMES: { id: OperatorTheme; name: string; ground: string; ink: string }[] = [
    { id: "dark", name: "Night", ground: "#050505", ink: "#f5f5f5" },
    { id: "vespers", name: "Vespers", ground: "#0c0a09", ink: "#f6f1e7" },
    { id: "nave", name: "Nave", ground: "#070b12", ink: "#f4f7fb" },
    { id: "light", name: "Day", ground: "#f7f5f3", ink: "#050505" },
  ];
  const ACCENTS = [
    { name: "Signal", value: "#fa4f00" },
    { name: "Gold", value: "#e2b65d" },
    { name: "Ember", value: "#ff8f55" },
    { name: "Crimson", value: "#be2119" },
    { name: "Psalm", value: "#3e7bfa" },
  ];
  const VOICE_DEMO = [
    { said: "next verse", does: "John 3:17 goes to Preview" },
    { said: "give me King James", does: "The verse switches to KJV" },
    { said: "turn to Romans 8:28", does: "Romans 8:28 goes to Preview" },
    { said: "go live", does: "The verse goes to the screen" },
  ];

  let step = $state<Step>("welcome");
  const index = $derived(STEPS.findIndex((entry) => entry.id === step));
  let churchName = $state(session.workspace.churchName);
  let theme = $state<OperatorTheme>(session.workspace.appearance.theme);
  let accent = $state(session.workspace.appearance.accent);
  let translation = $state(session.translations[0]?.id ?? "kjv");
  let verse = $state("For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.");
  let micNote = $state("");
  let micAsked = $state(false);
  let desk = $state<DeskStyle>("pewbeam");
  let demo = $state(0);

  const look = $derived(THEMES.find((entry) => entry.id === theme) ?? THEMES[0]!);
  const installedIds = $derived(session.translations.map((entry) => entry.id));
  const chosen = $derived(BIBLE_CATALOG.find((entry) => entry.id === translation) ?? BIBLE_CATALOG[0]!);

  // John 3:16 in the chosen translation, for the projection.
  $effect(() => {
    const id = translation;
    if (!installedIds.includes(id)) return;
    void api
      .passage(id, 43, 3, 16, 16)
      .then((rows) => {
        if (rows[0]?.text && id === translation) verse = rows[0].text.replace(/\s+([,.;:!?])/g, "$1");
      })
      .catch(() => {});
  });

  // The voice step plays its examples on the screen, one after another.
  $effect(() => {
    if (step !== "voice") return;
    const timer = setInterval(() => (demo = (demo + 1) % VOICE_DEMO.length), 2600);
    return () => clearInterval(timer);
  });

  /** Put the cursor in the field when its step appears, so typing goes straight in. */
  function focusOnShow(node: HTMLInputElement) {
    requestAnimationFrame(() => node.focus());
  }

  function go(next: number) {
    const target = STEPS[Math.max(0, Math.min(STEPS.length - 1, next))];
    if (!target) return;
    // Save each step as it is left, so skipping later keeps what was chosen.
    if (step === "church") {
      session.setChurchName(churchName.trim());
      if (churchName.trim()) session.setLogoText(churchName.trim());
    }
    if (step === "look") session.setAppearance({ theme, accent });
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
      micNote = "The microphone was not allowed. You can allow it later in Settings › Sound & voice.";
    }
  }

  function finish(withTrial = false) {
    if (step === "church" || step === "look") go(index);
    session.setAppearance({ theme, accent });
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

<div class="first-run" out:fade={{ duration: 450 }}>
  <Sanctuary lit={!booting || session.ready} ground={step === "welcome" || booting ? "#0b0f19" : look.ground} ink={step === "welcome" || booting ? "#f3ecdd" : look.ink}>
    {#snippet screen()}
      {#key booting ? "boot" : step === "voice" ? `voice-${demo}` : step}
        <div class="slide" in:fade={{ duration: 500, delay: 120 }}>
          {#if booting}
            <p class="pj-wordmark">Church Studio</p>
            <p class="pj-sub">Warming the projector</p>
          {:else if step === "welcome"}
            <p class="pj-verse big">Let there be light: and there was light.</p>
            <p class="pj-ref">Genesis 1:3</p>
          {:else if step === "church"}
            <p class="pj-sub">Welcome to</p>
            <p class="pj-title">{churchName.trim() || "Your church"}</p>
          {:else if step === "look" || step === "scripture"}
            <p class="pj-ref" style:color={accent}>John 3:16 ({chosen.abbreviation})</p>
            <p class="pj-verse">{verse}</p>
          {:else if step === "voice"}
            <p class="pj-said">“{VOICE_DEMO[demo]!.said}”</p>
            <p class="pj-does" style:color={accent}>{VOICE_DEMO[demo]!.does}</p>
          {:else}
            <p class="pj-title">{churchName.trim() || "Church Studio"}</p>
            <p class="pj-sub">Ready when you are</p>
          {/if}
        </div>
      {/key}
    {/snippet}
    {#snippet console()}
      <div class="panel">
        {#if booting}
          <div class="boot-line" role="status">
            <span class="dot"></span>
            <span>{session.ready ? "Opening your library" : "Starting up"}</span>
          </div>
        {:else}
          <nav class="progress" aria-label="Setup steps">
            {#each STEPS as entry, i (entry.id)}
              <button type="button" class="tick" class:done={i < index} class:here={i === index} aria-current={i === index ? "step" : undefined} onclick={() => go(i)}>
                <span class="mark"></span><span class="tick-label">{entry.label}</span>
              </button>
            {/each}
          </nav>

          <div class="ob-body">
            {#if step === "welcome"}
              <div class="ask">
                <h1>Set up Church Studio</h1>
                <p>Six short choices and your first service is ready to present. Everything stays on this computer, and you can change any of it later in Settings.</p>
              </div>
            {:else if step === "church"}
              <div class="ask">
                <h1>What is your church called?</h1>
                <p>It appears on the logo slide and at the top of Settings.</p>
              </div>
              <label class="field-wrap">
                <span>Church name</span>
                <input use:focusOnShow placeholder="Grace Chapel" maxlength="80" bind:value={churchName} />
              </label>
            {:else if step === "look"}
              <div class="ask">
                <h1>Choose how the desk looks</h1>
                <p>The theme colors the desk and the slides you start with. The accent marks buttons and highlights.</p>
              </div>
              <div class="choices">
                <div class="themes" role="radiogroup" aria-label="Theme">
                  {#each THEMES as entry (entry.id)}
                    <button type="button" role="radio" aria-checked={theme === entry.id} class="theme" class:on={theme === entry.id} onclick={() => (theme = entry.id)}>
                      <span class="swatch" style:background={entry.ground} style:color={entry.ink}>Aa</span>
                      <span>{entry.name}</span>
                    </button>
                  {/each}
                </div>
                <div class="accents" role="radiogroup" aria-label="Accent">
                  {#each ACCENTS as entry (entry.value)}
                    <button type="button" role="radio" aria-checked={accent === entry.value} aria-label={entry.name} title={entry.name} class="accent" class:on={accent === entry.value} style:background={entry.value} onclick={() => (accent = entry.value)}></button>
                  {/each}
                </div>
              </div>
            {:else if step === "scripture"}
              <div class="ask">
                <h1>Pick your Bible</h1>
                <p>King James and the World English Bible are ready. Download others now or later; they stay on this computer.</p>
              </div>
              <div class="bibles">
                {#each BIBLE_CATALOG as entry (entry.id)}
                  {@const installed = installedIds.includes(entry.id)}
                  {@const busy = session.bibleBusy.includes(entry.id)}
                  <button
                    type="button"
                    class="bible"
                    class:on={translation === entry.id}
                    class:missing={!installed}
                    aria-pressed={translation === entry.id}
                    disabled={busy}
                    onclick={async () => {
                      if (!installed) await session.installBible(entry.id);
                      translation = entry.id;
                    }}
                  >
                    <strong>{entry.abbreviation}</strong>
                    <span>{entry.name}</span>
                    <em>{busy ? "Downloading…" : installed ? (translation === entry.id ? "Showing" : "Ready") : `Download, ${entry.sizeMb} MB`}</em>
                  </button>
                {/each}
              </div>
            {:else if step === "voice"}
              <div class="ask">
                <h1>Talk to the desk</h1>
                <p>Say “next verse”, “go back” or “give me King James” and the desk follows. A command counts only when it is said on its own, so the sermon never moves the screen.</p>
              </div>
              <div class="mic">
                {#if !micAsked}
                  <button type="button" class="ghost" onclick={() => void askMic()}><Icon name="mic" size={16} /> Allow the microphone</button>
                {/if}
                {#if micNote}<p role="status">{micNote}</p>{/if}
              </div>
            {:else}
              <div class="ask">
                <h1>Which desk do you want to start on?</h1>
                <p>You can switch any time with the two icons at the top left.</p>
              </div>
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

          <div class="ob-actions">
            {#if index > 0}
              <button type="button" class="quiet" onclick={() => go(index - 1)}>Back</button>
            {:else}
              <button type="button" class="quiet" onclick={() => finish()}>Skip setup</button>
            {/if}
            {#if step === "ready"}
              {#if desk === "obs" && !session.entitled("production")}
                <button type="button" class="ob-primary" onclick={() => finish(true)}>Start the trial and open the desk</button>
              {:else}
                <button type="button" class="ob-primary" onclick={() => finish()}>Open the desk</button>
              {/if}
            {:else}
              <button type="button" class="ob-primary" onclick={() => go(index + 1)}>{step === "welcome" ? "Begin" : "Continue"}</button>
            {/if}
          </div>
        {/if}
      </div>
    {/snippet}
  </Sanctuary>
</div>

<style>
  .first-run { position: fixed; inset: 0; z-index: 60; }

  /* Projection */
  .slide { display: flex; flex-direction: column; align-items: center; gap: 2.2cqw; width: 100%; }
  .pj-wordmark, .pj-title {
    margin: 0;
    font-family: "Instrument Serif", var(--font-scripture), serif;
    font-size: 8.4cqw;
    line-height: 1.02;
    letter-spacing: -0.01em;
  }
  .pj-wordmark { color: #f3ecdd; text-shadow: 0 0 40px rgba(244, 196, 112, 0.35); }
  .pj-sub { margin: 0; font-size: 2.2cqw; letter-spacing: 0.04em; opacity: 0.72; }
  .pj-verse {
    margin: 0;
    max-width: 30ch;
    font-family: "Instrument Serif", var(--font-scripture), serif;
    font-size: 4.2cqw;
    line-height: 1.22;
    text-wrap: balance;
  }
  .pj-verse.big { font-size: 6.4cqw; font-style: italic; max-width: 18ch; }
  .pj-ref { margin: 0; font-size: 1.9cqw; font-weight: 600; letter-spacing: 0.06em; opacity: 0.85; }
  .pj-said { margin: 0; font-family: "Instrument Serif", var(--font-scripture), serif; font-size: 7cqw; font-style: italic; }
  .pj-does { margin: 0; font-size: 2.4cqw; font-weight: 600; }

  /* Console */
  .panel { width: min(1080px, 100%); margin: 0 auto; padding: 18px 28px 22px; display: grid; gap: 16px; }
  .boot-line { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 64px; color: var(--slate); font-size: 14px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 12px var(--gold); animation: breathe 1.6s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: 0.35; } }

  .progress { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .tick { display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; color: var(--slate); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .mark { height: 3px; border-radius: 3px; background: rgba(140, 149, 168, 0.25); transition: background 300ms ease, box-shadow 300ms ease; }
  .tick.done .mark { background: rgba(244, 196, 112, 0.55); }
  .tick.here .mark { background: var(--gold); box-shadow: 0 0 10px rgba(244, 196, 112, 0.6); }
  .tick.here { color: var(--parchment); }
  .tick:focus-visible { outline: 2px solid var(--gold); outline-offset: 4px; border-radius: 4px; }

  .ob-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 28px; align-items: center; min-height: 120px; }
  .ask h1 { margin: 0 0 6px; font-size: 24px; font-weight: 650; letter-spacing: -0.01em; color: var(--parchment); }
  .ask p { margin: 0; max-width: 52ch; font-size: 14px; line-height: 1.55; color: var(--slate); }

  .field-wrap { display: grid; gap: 6px; font-size: 12px; color: var(--slate); }
  .field-wrap input {
    height: 48px;
    padding: 0 16px;
    border: 1px solid rgba(244, 196, 112, 0.28);
    border-radius: 10px;
    background: rgba(13, 19, 33, 0.8);
    color: var(--parchment);
    font: inherit;
    font-size: 18px;
    outline: none;
  }
  .field-wrap input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(244, 196, 112, 0.18); }

  .choices { display: grid; gap: 14px; }
  .themes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .theme, .bible, .desk {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid rgba(140, 149, 168, 0.22);
    border-radius: 12px;
    background: rgba(13, 19, 33, 0.6);
    color: var(--parchment);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease;
  }
  .theme:hover, .bible:hover, .desk:hover { border-color: rgba(244, 196, 112, 0.45); }
  .theme.on, .bible.on, .desk.on { border-color: var(--gold); background: rgba(244, 196, 112, 0.08); box-shadow: 0 0 0 1px var(--gold); }
  .swatch { display: grid; place-items: center; height: 40px; border-radius: 8px; font-family: "Instrument Serif", serif; font-size: 20px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
  .accents { display: flex; gap: 10px; }
  .accent { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .accent.on { outline: 2px solid var(--parchment); outline-offset: 3px; }

  .bibles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .bible strong { font-size: 15px; letter-spacing: 0.04em; }
  .bible span { color: var(--slate); font-size: 12px; }
  .bible em { font-style: normal; font-size: 11px; font-weight: 650; color: var(--gold); }
  .bible.missing em { color: var(--slate); }
  .bible:disabled { opacity: 0.7; cursor: progress; }

  .mic { display: grid; gap: 10px; justify-items: start; }
  .mic p { margin: 0; font-size: 13px; color: var(--slate); }

  .desks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .desk { padding: 14px; gap: 4px; }
  .desk :global(svg) { color: var(--gold); margin-bottom: 4px; }
  .desk strong { font-size: 15px; }
  .desk span { color: var(--slate); font-size: 12px; line-height: 1.45; }

  .ob-actions { display: flex; justify-content: space-between; gap: 10px; }
  .ob-actions button, .ghost {
    height: 44px;
    padding: 0 22px;
    border-radius: 999px;
    font: inherit;
    font-size: 15px;
    font-weight: 650;
    cursor: pointer;
  }
  .ob-primary { border: 0; background: var(--gold); color: #1a1408; box-shadow: 0 8px 30px rgba(244, 196, 112, 0.25); }
  .ob-primary:hover { background: #f7d08a; }
  .quiet { border: 0; background: none; color: var(--slate); }
  .quiet:hover { color: var(--parchment); }
  .ghost { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(244, 196, 112, 0.4); background: none; color: var(--parchment); }
  .ob-actions button:focus-visible, .ghost:focus-visible, .theme:focus-visible, .bible:focus-visible, .desk:focus-visible, .accent:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
  }

  @media (max-width: 860px) {
    .ob-body { grid-template-columns: 1fr; gap: 16px; }
    .tick-label { display: none; }
    .themes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; }
  }
</style>
