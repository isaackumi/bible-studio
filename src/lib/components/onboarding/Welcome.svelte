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
  import { motionById } from "../../domain/backgrounds";
  import type { MotionId } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import MotionBackground from "../MotionBackground.svelte";
  import MiniDesk from "./MiniDesk.svelte";

  // First run, in the app's own colors, laid out as one composed stage: questions on the left,
  // and on the right a living sky drawn by the theme library, tinted with the chosen accent. A working miniature of the desk sits beside the
  // questions and shows each answer the way the real desk will: the theme and accent recolor
  // everything at once, the church name and verses render through the real slide engine.
  let { booting = false }: { booting?: boolean } = $props();

  type Step = "welcome" | "church" | "look" | "scripture" | "screen" | "voice" | "ready";
  const STEPS: { id: Step; label: string }[] = [
    { id: "welcome", label: "Welcome" },
    { id: "church", label: "Church" },
    { id: "look", label: "Look" },
    { id: "scripture", label: "Bible" },
    { id: "screen", label: "Screen" },
    { id: "voice", label: "Voice" },
    { id: "ready", label: "Ready" },
  ];
  /** What the church puts on screen. It picks the desk, so nobody has to know the desks yet. */
  type Use = "scripture" | "songs" | "sermon" | "cameras";
  const USES: { id: Use; label: string; icon: string }[] = [
    { id: "scripture", label: "Scripture", icon: "bible" },
    { id: "songs", label: "Song lyrics", icon: "note" },
    { id: "sermon", label: "Sermon points", icon: "book" },
    { id: "cameras", label: "Cameras and video", icon: "obs" },
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

  /** The sky behind the desk for each step: real theme-library backgrounds. */
  const SKY: Record<Step, MotionId> = { welcome: "rays", church: "bokeh", look: "aurora", scripture: "embers", screen: "stars", voice: "waves", ready: "rays" };

  /** A line of scripture set large over the sky; the church step shows the church name. */
  const LINES: Record<Step, { text: string; ref: string }> = {
    welcome: { text: "Let there be light.", ref: "Genesis 1:3" },
    church: { text: "", ref: "Your logo slide" },
    look: { text: "Arise, shine; for thy light is come.", ref: "Isaiah 60:1" },
    scripture: { text: "Thy word is a lamp unto my feet.", ref: "Psalm 119:105" },
    screen: { text: "Ye are the light of the world.", ref: "Matthew 5:14" },
    voice: { text: "Faith cometh by hearing.", ref: "Romans 10:17" },
    ready: { text: "This is the day which the Lord hath made.", ref: "Psalm 118:24" },
  };

  let step = $state<Step>("welcome");
  let artWidth = $state(0);
  let artHeight = $state(0);
  /** Cover the art panel with the 1920×1080 sky. */
  const skyScale = $derived(Math.max(artWidth / 1920, artHeight / 1080, 0.1));
  const sky = $derived(motionById(SKY[step])!);
  const index = $derived(STEPS.findIndex((entry) => entry.id === step));
  let churchName = $state(session.workspace.churchName);
  let translation = $state(session.translations[0]?.id ?? "kjv");
  let verses = $state<{ v16: VerseText[]; v17: VerseText[] }>({
    v16: [{ verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." }],
    v17: [{ verse: 17, text: "For God sent not his Son into the world to condemn the world; but that the world through him might be saved." }],
  });
  let micNote = $state("");
  let micAsked = $state(false);
  let uses = $state<Use[]>(["scripture", "songs"]);
  /** Set only when the operator changes the desk on the last step. */
  let deskChoice = $state<DeskStyle | null>(null);
  const desk = $derived<DeskStyle>(deskChoice ?? (uses.includes("cameras") ? "obs" : "pewbeam"));
  let tested = $state(false);
  /** Voice demo beat: 0 "next verse" → 1 John 3:17 on Preview → 2 "go live" → 3 on air. */
  let beat = $state(0);

  const appearance = $derived(session.workspace.appearance);
  const installedIds = $derived(session.translations.map((entry) => entry.id));
  const chosen = $derived(BIBLE_CATALOG.find((entry) => entry.id === translation) ?? BIBLE_CATALOG[0]!);
  const name = $derived(churchName.trim() || "Your church");

  $effect(() => {
    const id = translation;
    if (!installedIds.includes(id)) return;
    void Promise.all([api.passage(id, 43, 3, 16, 16), api.passage(id, 43, 3, 17, 17)])
      .then(([v16, v17]) => {
        if (id === translation && v16.length && v17.length) verses = { v16, v17 };
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
    if (step === "screen") return { preview: scripture(verses.v16, 16), program: title(), onAir: session.output.online, reference: "John 3:16", heard: "" };
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

  function toggleUse(id: Use) {
    uses = uses.includes(id) ? uses.filter((entry) => entry !== id) : [...uses, id];
  }

  async function openScreen() {
    await session.openAudience();
  }

  async function sendTest() {
    await session.testOutput();
    tested = true;
  }

  /** Finish setup; with `tour`, start the tour of the desk they land on. */
  function finish(tour = false) {
    if (step === "church") go(index);
    const trial = desk === "obs" && !session.entitled("production");
    if (trial) session.startTrial();
    session.setAppearance({ desk });
    session.finishOnboarding();
    if (tour) session.startTour(desk === "obs" ? "production" : uses.length === 1 && uses[0] === "songs" ? "songs" : uses.length === 1 && uses[0] === "sermon" ? "sermon" : "scriptures");
  }

  const themeName = $derived(THEMES.find((entry) => entry.id === appearance.theme)?.name ?? "Night");
  const accentName = $derived(ACCENTS.find((entry) => entry.value === appearance.accent)?.name ?? "Custom");

  function onKey(event: KeyboardEvent) {
    if (booting) return;
    const target = event.target as HTMLElement | null;
    if (event.key === "Enter" && !target?.closest("button, textarea")) {
      event.preventDefault();
      if (step === "ready") finish(true);
      else go(index + 1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="first-run" out:fade={{ duration: 300 }}>
  <div class="room" aria-hidden="true"></div>
  {#if booting}
    <div class="ob-boot" role="status" aria-live="polite">
      <span class="mark halo"><Icon name="church" size={30} /></span>
      <p class="wordmark">Church Studio</p>
      <span class="loader"><i></i></span>
      <p class="boot-note">{session.ready ? "Opening your library" : "Starting up"}</p>
    </div>
  {:else}
    <main class="stage-card">
      <section class="ask" aria-labelledby="step-title">
        <header class="ob-top">
          <span class="ob-brand"><span class="mark small"><Icon name="church" size={16} /></span>Church Studio</span>
          <button type="button" class="skip" onclick={() => finish()}>Skip setup</button>
        </header>

        <div class="where">
          <div class="progress" aria-label="Setup steps">
            {#each STEPS as entry, i (entry.id)}
              <button type="button" class="tick" class:done={i < index} class:here={i === index} aria-label={entry.label} aria-current={i === index ? "step" : undefined} title={entry.label} onclick={() => go(i)}></button>
            {/each}
          </div>
          <span class="count">Step {index + 1} of {STEPS.length}</span>
        </div>

        <div class="step-wrap">
          {#key step}
            <div class="step" in:fade={{ duration: 240 }}>
              {#if step === "welcome"}
                <h1 id="step-title">Let’s get your church on screen</h1>
                <p class="lede">About a minute. The desk beside you is the real thing: it changes as you answer, so you see Sunday before it starts.</p>
                <ul class="promises">
                  <li><span class="pi"><Icon name="bible" size={15} /></span><span>Scripture, songs and sermons, ready offline</span></li>
                  <li><span class="pi"><Icon name="mic" size={15} /></span><span>Say “next verse” and the desk follows</span></li>
                  <li><span class="pi"><Icon name="cast" size={15} /></span><span>Nothing reaches the screen until you press LIVE</span></li>
                </ul>
              {:else if step === "church"}
                <h1 id="step-title">Tell us about your church</h1>
                <p class="lede">The name becomes your logo slide. What you put on screen sets up the right desk.</p>
                <label class="field-wrap">
                  <span>Church name</span>
                  <input use:focusOnShow placeholder="Grace Chapel" maxlength="80" bind:value={churchName} />
                </label>
                <div class="uses" role="group" aria-label="What you put on screen">
                  <span class="ob-label">On Sunday we show</span>
                  <div class="use-grid">
                    {#each USES as entry (entry.id)}
                      <button type="button" class="use" class:on={uses.includes(entry.id)} aria-pressed={uses.includes(entry.id)} onclick={() => toggleUse(entry.id)}>
                        <Icon name={entry.icon} size={16} />
                        <span>{entry.label}</span>
                        {#if uses.includes(entry.id)}<Icon name="check" size={14} />{/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {:else if step === "look"}
                <h1 id="step-title">Make the desk yours</h1>
                <p class="lede">The theme and accent apply right away, here and on the desk. The sky follows your accent too.</p>
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
              {:else if step === "screen"}
                <h1 id="step-title">Put it on the big screen</h1>
                <p class="lede">Plug in the projector or TV first. The audience window opens there, full screen, and shows only what you send live.</p>
                <div class="screen-steps">
                  <div class="screen-row" class:done={session.output.online}>
                    <span class="num">{#if session.output.online}<Icon name="check" size={14} />{:else}1{/if}</span>
                    <div class="screen-copy"><strong>Open the audience window</strong><span>{session.output.online ? "It is open. Move it to the projector if it opened here." : "It opens on the second screen when there is one."}</span></div>
                    {#if !session.output.online}<button type="button" class="btn" onclick={() => void openScreen()}><Icon name="cast" size={15} /> Open</button>{/if}
                  </div>
                  <div class="screen-row" class:done={tested} class:off={!session.output.online}>
                    <span class="num">{#if tested}<Icon name="check" size={14} />{:else}2{/if}</span>
                    <div class="screen-copy"><strong>Check it from the back row</strong><span>A test pattern flashes on the audience screen. Nothing live changes.</span></div>
                    <button type="button" class="btn" disabled={!session.output.online} onclick={() => void sendTest()}>Test</button>
                  </div>
                </div>
                <p class="hint">No projector here yet? Continue. The Audience button at the top of the desk does this any time.</p>
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
                <h1 id="step-title">{name} is ready</h1>
                <p class="lede">Here is what is set up. Change any of it later in Settings.</p>
                <ul class="summary">
                  <li><Icon name="church" size={15} /><span><strong>{name}</strong> on the logo slide</span></li>
                  <li><Icon name="themes" size={15} /><span><strong>{themeName}</strong> desk with the <strong>{accentName}</strong> accent</span></li>
                  <li><Icon name="bible" size={15} /><span><strong>{chosen.name}</strong> on screen</span></li>
                  <li class:pending={!session.output.online}><Icon name="cast" size={15} /><span>{session.output.online ? "Audience window open" : "Audience screen: open it from the desk when the projector is on"}</span></li>
                  <li class:pending={!micAsked}><Icon name="mic" size={15} /><span>{micAsked ? "Microphone allowed for voice" : "Voice: turn on Listen when you want it"}</span></li>
                </ul>
                <div class="desk-pick" role="radiogroup" aria-label="Desk">
                  <button type="button" role="radio" aria-checked={desk === "pewbeam"} class:on={desk === "pewbeam"} onclick={() => (deskChoice = "pewbeam")}>
                    <Icon name="pew" size={16} /><span><strong>Presenter Desk</strong><em>Scripture, songs and sermons</em></span>
                  </button>
                  <button type="button" role="radio" aria-checked={desk === "obs"} class:on={desk === "obs"} onclick={() => (deskChoice = "obs")}>
                    <Icon name="obs" size={16} /><span><strong>Production Desk</strong><em>{session.entitled("production") ? "Cameras, scenes and video" : `Premium, free for ${TRIAL_DAYS} days`}</em></span>
                  </button>
                </div>
              {/if}
            </div>
          {/key}
        </div>

        <footer class="nav">
          {#if index > 0}<button type="button" class="btn quiet" onclick={() => go(index - 1)}>Back</button>{:else}<span></span>{/if}
          {#if step === "ready"}
            <span class="ready-buttons">
              <button type="button" class="btn" onclick={() => finish(false)}>Skip tour</button>
              <button type="button" class="btn primary" onclick={() => finish(true)}>Take the tour</button>
            </span>
          {:else}
            <button type="button" class="btn primary" onclick={() => go(index + 1)}>{step === "welcome" ? "Get started" : "Continue"}</button>
          {/if}
        </footer>
      </section>

      <section class="art" aria-label="Preview of the desk" bind:clientWidth={artWidth} bind:clientHeight={artHeight}>
        {#key step}
          <div class="sky" transition:fade={{ duration: 900 }} style:transform="translate(-50%, -50%) scale({skyScale})">
            <MotionBackground motion={sky.id} tint={appearance.accent} base={sky.base} />
          </div>
        {/key}
        <div class="vignette" aria-hidden="true"></div>
        {#key step}
          <p class="ob-verse" in:fade={{ duration: 700, delay: 150 }} aria-hidden="true">
            {step === "church" ? name : LINES[step].text}
            <span>{LINES[step].ref}</span>
          </p>
        {/key}
        <div class="grain" aria-hidden="true"></div>

        <div class="float">
          {#key step}
            <div class="settle" in:fade={{ duration: 500 }}>
              <MiniDesk preview={shown.preview} program={shown.program} onAir={shown.onAir} reference={shown.reference} heard={shown.heard} />
            </div>
          {/key}
          <div class="floor" aria-hidden="true"></div>
        </div>

        <div class="art-foot">
          <p class="credit"><Icon name="media" size={12} /> {sky.name} background, from the theme library</p>
          <p class="caption">
            {#if step === "voice"}{beat < 2 ? "“next verse” moves Preview to the next verse" : "“go live” sends Preview to Program"}
            {:else if step === "ready"}On air: Program is what the congregation sees
            {:else}Preview is yours. Program is what the congregation sees.{/if}
          </p>
        </div>
      </section>
    </main>
  {/if}
</div>

<style>
  .first-run {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: clamp(12px, 2.4vw, 28px);
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    overflow: auto;
  }
  /* The room picks up the stage light, so the card sits inside one scene. */
  .room {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(60% 70% at 72% 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
      radial-gradient(40% 50% at 18% 80%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%);
  }

  /* Loading */
  .ob-boot { position: relative; display: grid; justify-items: center; gap: 14px; }
  .mark { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 18px; background: var(--accent); color: #fff; box-shadow: 0 16px 40px color-mix(in srgb, var(--accent) 35%, transparent); }
  .mark.halo { animation: halo 2.4s ease-in-out infinite; }
  @keyframes halo { 50% { box-shadow: 0 16px 70px color-mix(in srgb, var(--accent) 60%, transparent); } }
  .mark.small { width: 28px; height: 28px; border-radius: 8px; box-shadow: none; }
  .wordmark { margin: 4px 0 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .loader { position: relative; width: 160px; height: 3px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 10%, transparent); overflow: hidden; }
  .loader i { position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 3px; background: var(--accent); animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
  .boot-note { margin: 0; font-size: 12px; color: var(--muted); }

  /* The stage card */
  .stage-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(340px, 440px) minmax(0, 1fr);
    width: min(1320px, 100%);
    height: min(800px, 100%);
    min-height: 600px;
    border: 1px solid color-mix(in srgb, var(--ink) 12%, var(--line));
    border-radius: 22px;
    background: var(--panel);
    box-shadow: 0 60px 140px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  /* Questions */
  .ask { display: flex; flex-direction: column; gap: 22px; min-height: 0; padding: 28px 36px 28px; overflow: auto; }
  .ob-top { display: flex; align-items: center; gap: 12px; }
  .ob-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
  .skip { margin-left: auto; border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .skip:hover { color: var(--ink); }
  .where { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
  .count { font-size: 12px; font-weight: 600; color: var(--muted); }
  .step-wrap { flex: 1 0 auto; display: flex; flex-direction: column; justify-content: center; }
  .step { display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: clamp(28px, 2.5vw, 36px); font-weight: 750; letter-spacing: -0.028em; line-height: 1.1; text-wrap: balance; }
  .lede { margin: 0; font-size: 15px; line-height: 1.55; color: var(--muted); max-width: 42ch; }
  .promises { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
  .promises li { display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .pi { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }

  .field-wrap { display: grid; gap: 6px; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .field-wrap input { height: 50px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--ink); font: inherit; font-size: 18px; outline: none; }
  .field-wrap input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }

  .themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
  .theme, .bible {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--field);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease;
  }
  .theme:hover, .bible:hover:not(:disabled) { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .theme.on, .bible.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .theme strong { font-size: 13px; }
  .theme > span:last-child { font-size: 12px; color: var(--muted); }
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
  .abbr { display: grid; place-items: center; min-width: 44px; height: 28px; border-radius: 7px; background: var(--panel); font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
  .bible.on .abbr { background: var(--accent); color: #fff; }
  .bname { flex: 1; font-size: 13px; font-weight: 600; }
  .state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 650; color: var(--muted); }
  .bible.on .state { color: var(--accent); }
  .bible:disabled { opacity: 0.7; cursor: progress; }

  .mic { display: grid; gap: 10px; justify-items: start; }
  .mic p { margin: 0; font-size: 13px; color: var(--muted); }

  .uses { display: grid; gap: 8px; margin-top: 6px; }
  .use-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .use { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
  .use span { flex: 1; }
  .use :global(svg:first-child) { color: var(--muted); }
  .use.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .use.on :global(svg) { color: var(--accent); }
  .screen-steps { display: grid; gap: 8px; margin-top: 4px; }
  .screen-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .screen-row.done { border-color: color-mix(in srgb, var(--presence, #3fb950) 55%, var(--line)); }
  .screen-row.off { opacity: 0.6; }
  .num { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 12px; font-weight: 800; }
  .screen-row.done .num { background: color-mix(in srgb, var(--presence, #3fb950) 18%, transparent); color: var(--presence, #3fb950); }
  .screen-copy { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .screen-copy strong { font-size: 13px; }
  .screen-copy span { font-size: 12px; color: var(--muted); }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .summary { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 9px; }
  .summary li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
  .summary li :global(svg) { flex: none; color: var(--presence, #3fb950); }
  .summary li.pending { color: var(--muted); }
  .summary li.pending :global(svg) { color: var(--muted); }
  .desk-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
  .desk-pick button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .desk-pick button :global(svg) { flex: none; color: var(--accent); }
  .desk-pick span { display: grid; gap: 1px; }
  .desk-pick strong { font-size: 13px; }
  .desk-pick em { font-style: normal; font-size: 11.5px; color: var(--muted); }
  .desk-pick button.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .ready-buttons { display: flex; gap: 8px; }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .progress { display: flex; gap: 5px; }
  .tick { width: 18px; height: 5px; padding: 0; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--ink) 14%, transparent); cursor: pointer; transition: width 240ms ease, background 240ms ease; }
  .tick.done { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .tick.here { width: 34px; background: var(--accent); }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 22px; border: 1px solid var(--line); border-radius: 11px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; }
  .btn.primary { min-width: 150px; border-color: var(--accent); background: var(--accent); color: #fff; box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 30%, transparent); }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.quiet { border-color: transparent; background: none; color: var(--muted); padding: 0 6px; }
  .btn.quiet:hover { color: var(--ink); }
  :is(.btn, .tick, .theme, .bible, .accent, .skip, .use, .desk-pick button):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  /* The art: a living sky from the theme library, with the desk floating in it. */
  .art { position: relative; min-width: 0; overflow: hidden; background: #000; isolation: isolate; }
  .sky { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; transform-origin: center; filter: blur(5px) saturate(1.15); }
  .ob-verse {
    position: absolute;
    left: clamp(28px, 5%, 64px);
    right: clamp(28px, 5%, 64px);
    top: clamp(28px, 6%, 56px);
    margin: 0;
    max-width: 18ch;
    font-family: var(--font-scripture);
    font-size: clamp(34px, 3.4vw, 54px);
    font-weight: 500;
    line-height: 1.04;
    letter-spacing: -0.01em;
    color: #fff;
    text-shadow: 0 2px 30px rgba(0, 0, 0, 0.5);
    text-wrap: balance;
    overflow-wrap: anywhere;
    pointer-events: none;
  }
  .ob-verse span { display: block; margin-top: 10px; font-family: var(--font-ui); font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: rgba(255, 255, 255, 0.65); text-shadow: none; }
  .vignette {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(80% 70% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(to bottom, transparent 60%, rgba(0, 0, 0, 0.55));
    pointer-events: none;
  }
  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.08;
    mix-blend-mode: overlay;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .float { position: absolute; inset: 0; display: grid; place-items: center; padding: clamp(150px, 24%, 210px) clamp(28px, 5%, 64px) 80px; }
  .settle { position: relative; z-index: 1; width: min(100%, 860px); animation: settle 900ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes settle { from { transform: translateY(14px) scale(0.985); } }
  .settle :global(.window) { box-shadow: 0 50px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 80px color-mix(in srgb, var(--accent) 18%, transparent); }
  .float > :global(*) { grid-area: 1 / 1; }
  .floor { align-self: end; justify-self: center; width: 70%; height: 60px; margin-bottom: -40px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent); filter: blur(10px); }
  .art-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; color: rgba(255, 255, 255, 0.82); font-size: 12px; }
  .art-foot p { margin: 0; }
  .credit { display: inline-flex; align-items: center; gap: 6px; color: rgba(255, 255, 255, 0.6); }
  .caption { padding: 7px 12px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; background: rgba(0, 0, 0, 0.42); backdrop-filter: blur(12px); font-weight: 600; text-align: right; }

  @media (max-width: 980px) {
    .first-run { place-items: stretch; padding: 0; }
    .stage-card { grid-template-columns: 1fr; grid-template-rows: auto auto; height: auto; min-height: 100%; border-radius: 0; border: 0; }
    .art { order: -1; }
    .float { position: relative; padding: 24px 24px 64px; }
    .credit, .ob-verse { display: none; }
    .ask { padding: 24px 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .loader i { animation: none; width: 100%; }
    .tick { transition: none; }
    .mark.halo, .settle { animation: none; }
  }
</style>
