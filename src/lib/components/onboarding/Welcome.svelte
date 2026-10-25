<script lang="ts">
  import { fade } from "../../ui/motion";
  import { session } from "../../app/session.svelte";
  import { BIBLE_CATALOG } from "../../bible/texts";
  import { api } from "../../db/api";
  import { isDesktop } from "../../platform/runtime";
  import { TRIAL_DAYS } from "../../domain/plans";
  import { presentLyrics, presentScripture, presentText } from "../../domain/present";
  import { presentCamera } from "../../domain/camera";
  import { emptyModel } from "../../domain/theme";
  import type { DeskStyle, OperatorTheme, PresentationModel, Theme, VerseText } from "../../domain/types";
  import { describeAspect, SCREEN_SHAPES, type ScreenShape } from "../../display/shape";
  import { motionById } from "../../domain/backgrounds";
  import type { MotionId } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import MotionBackground from "../MotionBackground.svelte";
  import Screen from "../Screen.svelte";
  import { outputShape } from "../../display/output-shape.svelte";
  import MiniApp, { type Zone } from "./MiniApp.svelte";
  import BrandMark from "../BrandMark.svelte";
  import { UI_LANGUAGES, msg, t } from "../../i18n/core";

  // First run, in the app's own colors: questions on the left; on the right the whole desk in
  // miniature over a living sky from the theme library. Every answer shows on it through the real
  // slide engine (the church name on the logo slide, the screen theme on Preview and Program, the
  // desk colors on the desk itself), and each step picks out the part of the desk it changes.
  let { booting = false }: { booting?: boolean } = $props();

  // Voice is not a setup step: the microphone is asked for the first time someone presses Listen,
  // when they know what it is for.
  type Step = "welcome" | "church" | "wall" | "look" | "scripture" | "screen" | "ready";
  const STEPS: { id: Step; label: string }[] = [
    { id: "welcome", label: msg("Welcome") },
    { id: "church", label: msg("Church") },
    { id: "wall", label: msg("On the wall") },
    { id: "look", label: msg("Desk colors") },
    { id: "scripture", label: msg("Bible") },
    { id: "screen", label: msg("Big screen") },
    { id: "ready", label: msg("Ready") },
  ];
  /** What the church puts on screen. It picks the desk, so nobody has to know the desks yet. */
  type Use = "scripture" | "songs" | "sermon" | "cameras";
  const USES: { id: Use; label: string; icon: string }[] = [
    { id: "scripture", label: msg("Scripture"), icon: "bible" },
    { id: "songs", label: msg("Song lyrics"), icon: "note" },
    { id: "sermon", label: msg("Sermon points"), icon: "book" },
    { id: "cameras", label: msg("Cameras and video"), icon: "obs" },
  ];
  /** Screen themes offered in setup: free ones with different moods. The library has the rest. */
  const WALL_THEMES = ["theme-manuscript", "theme-dawn", "theme-sea", "theme-ember", "theme-manuscript-page", "theme-caption"];
  const THEMES: { id: OperatorTheme; name: string; note: string; ground: string; panel: string; ink: string }[] = [
    { id: "dark", name: msg("Night"), note: msg("Black desk"), ground: "#050505", panel: "#141414", ink: "#f5f5f5" },
    { id: "vespers", name: msg("Vespers"), note: msg("Warm black"), ground: "#0c0a09", panel: "#161311", ink: "#f6f1e7" },
    { id: "nave", name: msg("Nave"), note: msg("Blue black"), ground: "#070b12", panel: "#0f1520", ink: "#f4f7fb" },
    { id: "light", name: msg("Day"), note: msg("White desk"), ground: "#f7f5f3", panel: "#ffffff", ink: "#050505" },
  ];
  const ACCENTS = [
    { name: msg("Orange"), value: "#fa4f00" },
    { name: msg("Gold"), value: "#e2cc9d" },
    { name: msg("Peach"), value: "#ff8f55" },
    { name: msg("Red"), value: "#be2119" },
    { name: msg("Blue"), value: "#3e7bfa" },
  ];
  const GENESIS: VerseText[] = [{ verse: 3, text: "And God said, Let there be light: and there was light." }];

  /** The sky behind the desk for each step: real theme-library backgrounds. */
  const SKY: Record<Step, MotionId> = { welcome: "rays", church: "bokeh", wall: "waves", look: "aurora", scripture: "embers", screen: "stars", ready: "rays" };

  /** The part of the desk each step is about, and the line that says so under the miniature. */
  const FOCUS: Record<Step, { zones: Zone[]; note: string }> = {
    welcome: { zones: [], note: msg("This is your desk. Preview is yours; Program is what the congregation sees.") },
    church: { zones: ["program"], note: msg("Your church name becomes the logo slide on Program.") },
    wall: { zones: ["preview", "program"], note: msg("The screen theme dresses verses, songs and the logo slide.") },
    look: { zones: [], note: msg("Desk colors are for you; the congregation never sees them.") },
    scripture: { zones: ["bible", "reading", "preview"], note: msg("Look up a verse, read on, and it waits on Preview.") },
    screen: { zones: ["audience", "program"], note: msg("Audience opens the big screen. It shows only Program.") },
    ready: { zones: ["live", "program"], note: msg("Press LIVE and Preview goes to the big screen.") },
  };
  /** John 3:14-20 for the miniature's Bible pane until the chosen translation loads. */
  const JOHN3: VerseText[] = [
    { verse: 14, text: "And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:" },
    { verse: 15, text: "That whosoever believeth in him should not perish, but have eternal life." },
    { verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
    { verse: 17, text: "For God sent not his Son into the world to condemn the world; but that the world through him might be saved." },
    { verse: 18, text: "He that believeth on him is not condemned: but he that believeth not is condemned already." },
    { verse: 19, text: "And this is the condemnation, that light is come into the world, and men loved darkness rather than light." },
    { verse: 20, text: "For every one that doeth evil hateth the light, neither cometh to the light." },
  ];

  let step = $state<Step>("welcome");
  let artWidth = $state(0);
  let artHeight = $state(0);
  /** Cover the art panel with the 1920×1080 sky. */
  const skyScale = $derived(Math.max(artWidth / 1920, artHeight / 1080, 0.1));
  const sky = $derived(motionById(SKY[step])!);
  const index = $derived(STEPS.findIndex((entry) => entry.id === step));
  let churchName = $state(session.workspace.churchName);
  let translation = $state(session.translations[0]?.id ?? "kjv");
  let verses = $state<{ v16: VerseText[]; chapter: VerseText[] }>({ v16: [JOHN3[2]!], chapter: JOHN3 });
  let uses = $state<Use[]>(["scripture", "songs"]);
  /** What the church step's Preview shows: the logo slide while typing, or the thing just ticked. */
  let showing = $state<"name" | Use>("name");
  /** Set only when the operator changes the desk on the last step. */
  let deskChoice = $state<DeskStyle | null>(null);
  const desk = $derived<DeskStyle>(deskChoice ?? (uses.includes("cameras") ? "obs" : "pewbeam"));
  let tested = $state(false);

  const appearance = $derived(session.workspace.appearance);
  const installedIds = $derived(session.translations.map((entry) => entry.id));
  const chosen = $derived(BIBLE_CATALOG.find((entry) => entry.id === translation) ?? BIBLE_CATALOG[0]!);
  const name = $derived(churchName.trim() || t("Your church"));
  const wallThemes = $derived(WALL_THEMES.map((id) => session.themes.find((theme) => theme.id === id)).filter((theme): theme is Theme => !!theme));
  const screenTheme = $derived(session.theme());
  const shape = $derived<ScreenShape>(appearance.screenShape ?? "auto");
  const measured = $derived(appearance.measuredAspect);

  $effect(() => {
    const id = translation;
    if (!installedIds.includes(id)) return;
    void api
      .passage(id, 43, 3, 14, 20)
      .then((chapter) => {
        const v16 = chapter.filter((row) => row.verse === 16);
        if (id === translation && v16.length) verses = { v16, chapter };
      })
      .catch(() => {});
  });

  // What the miniature desk shows, through the real slide renderer and the chosen screen theme.
  const scripture = (rows: VerseText[], verse: number) =>
    presentScripture({ theme: session.theme(), reference: `John 3:${verse}`, attribution: chosen.name, verses: rows });
  const title = () => presentText({ theme: session.theme(), layout: "title", heading: name, body: "Welcome" });
  const EXAMPLE: Record<Use, { model: () => PresentationModel; reference: string; mode: string }> = {
    scripture: { model: () => scripture(verses.v16, 16), reference: "John 3:16", mode: "Scriptures" },
    songs: { model: () => presentLyrics({ theme: session.theme(), label: "Chorus", lines: ["Great is Thy faithfulness", "Morning by morning new mercies I see"] }), reference: "Chorus", mode: "Songs" },
    sermon: { model: () => presentText({ theme: session.theme(), layout: "title", heading: "He knows your name", body: "Point 1 · Isaiah 43:1" }), reference: "Sermon point", mode: "Sermon" },
    cameras: { model: () => presentCamera({ theme: session.theme(), label: "Camera 1" }), reference: "Camera 1", mode: "Studio" },
  };
  type Shown = { preview: PresentationModel; program: PresentationModel; onAir: boolean; reference: string; mode: string };
  const shown = $derived.by((): Shown => {
    const empty = emptyModel(session.theme());
    const verse = scripture(verses.v16, 16);
    switch (step) {
      case "welcome":
        return { preview: presentScripture({ theme: session.theme(), reference: "Genesis 1:3", attribution: "King James Version", verses: GENESIS }), program: title(), onAir: false, reference: "Genesis 1:3", mode: "Scriptures" };
      case "church": {
        if (showing !== "name" && uses.includes(showing)) {
          const example = EXAMPLE[showing];
          return { preview: example.model(), program: title(), onAir: false, reference: example.reference, mode: example.mode };
        }
        return { preview: scripture(verses.v16, 16), program: title(), onAir: false, reference: "John 3:16", mode: "Scriptures" };
      }
      case "wall":
        return { preview: verse, program: title(), onAir: false, reference: screenTheme.name, mode: "Scriptures" };
      case "look":
      case "scripture":
        return { preview: verse, program: empty, onAir: false, reference: `John 3:16 ${chosen.abbreviation}`, mode: "Scriptures" };
      case "screen":
        return { preview: verse, program: title(), onAir: session.output.online, reference: "John 3:16", mode: "Scriptures" };
      default:
        return { preview: verse, program: title(), onAir: true, reference: "John 3:16", mode: desk === "obs" ? "Studio" : "Scriptures" };
    }
  });
  /** The miniature is the desk they will land on: the Production Desk once cameras are in. */
  const miniDesk = $derived<DeskStyle>(step === "ready" ? desk : "pewbeam");
  /** On the church step a ticked use shows on Preview, so Preview is the part to look at. */
  const zones = $derived<Zone[]>(step === "church" && showing !== "name" ? ["preview"] : FOCUS[step].zones);
  const miniVerses = $derived(verses.chapter.map((row): [number, string] => [row.verse, row.text]));

  function sample(theme: Theme): PresentationModel {
    return presentScripture({ theme, reference: "John 3:16", attribution: chosen.name, verses: verses.v16 });
  }

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

  function toggleUse(id: Use) {
    const on = !uses.includes(id);
    uses = on ? [...uses, id] : uses.filter((entry) => entry !== id);
    showing = on ? id : "name";
  }

  /** Why the audience window did not open (shown on the step, not lost). */
  let screenNote = $state("");
  async function openScreen() {
    screenNote = "";
    await session.openAudience();
    if (!session.output.online) screenNote = session.output.message || session.message || t("The audience window did not open. Check the projector is connected, then press Open again.");
  }
  /** Only this computer's own screen is connected. */
  const oneScreen = $derived(isDesktop() && session.output.displays.length === 1);

  async function sendTest() {
    await session.testOutput();
    tested = true;
  }

  /** Why signing in could not start (offline, or accounts off on the server). */
  let accountError = $state("");

  /** Why the Production Desk trial could not start (offline, or already used here). */
  let trialError = $state("");

  /** Samples to try with (hymns, a whole sample service, quizzes): on unless unticked. */
  let samples = $state(true);

  /** Everything came across from another computer: setup is done, and the desk says what arrived. */
  function moved(message: string) {
    session.finishOnboarding();
    session.notify(message, { ms: 12_000 });
  }

  /** Finish setup; with `tour`, start the tour of the desk they land on. */
  async function finish(tour = false) {
    if (step === "church") go(index);
    if (desk === "obs" && !session.entitled("production")) {
      // The trial gives the Production Desk; if it cannot start, say why and stay here to choose.
      const error = await session.startTrial();
      if (error) {
        trialError = error;
        deskChoice = "pewbeam";
        return;
      }
    }
    // The Bible chosen here is the one the desk opens on.
    if (translation) session.setDeskTranslation(translation);
    session.setAppearance({ desk });
    session.finishOnboarding();
    // Loaded only now, and added in the background while the desk opens.
    if (samples) void import("../../app/starter.svelte").then((starter) => starter.installStarterKit()).catch(() => {});
    // End on a first verse ready to show: John 3:16 on Preview, and what to press next.
    if (!tour && desk === "pewbeam") void session.showFirstVerse(translation);
    if (tour) session.startTour(desk === "obs" ? "production" : uses.length === 1 && uses[0] === "songs" ? "songs" : uses.length === 1 && uses[0] === "sermon" ? "sermon" : "scriptures");
  }

  const themeName = $derived(THEMES.find((entry) => entry.id === appearance.theme)?.name ?? msg("Night"));
  const accentName = $derived(ACCENTS.find((entry) => entry.value === appearance.accent)?.name.toLowerCase() ?? "custom");

  function onKey(event: KeyboardEvent) {
    if (booting) return;
    const target = event.target as HTMLElement | null;
    if (event.key === "Enter" && !target?.closest("button, textarea, select")) {
      event.preventDefault();
      if (step === "ready") void finish(false);
      else go(index + 1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="first-run" out:fade={{ duration: 300 }}>
  <div class="room" aria-hidden="true"></div>
  {#if booting}
    <div class="ob-boot" role="status" aria-live="polite">
      <BrandMark size={76} boot tone="current" />
      <p class="wordmark">{t("Church Studio")}</p>
      <span class="loader"><i></i></span>
      <p class="boot-note">{session.ready ? t("Opening your library") : t("Starting up")}</p>
    </div>
  {:else}
    <main class="stage-card">
      <section class="ask" aria-labelledby="step-title">
        <header class="ob-top">
          <span class="ob-brand"><BrandMark size={28} tone="current" />{t("Church Studio")}</span>
          <button type="button" class="skip" onclick={() => void finish()}>{t("Skip setup")}</button>
        </header>

        <div class="where">
          <div class="progress" aria-label={t("Setup steps")}>
            {#each STEPS as entry, i (entry.id)}
              <button type="button" class="tick" class:done={i < index} class:here={i === index} aria-label={t(entry.label)} aria-current={i === index ? "step" : undefined} title={t(entry.label)} onclick={() => go(i)}></button>
            {/each}
          </div>
          <span class="count">{t("Step {index} of {length}", { index: index + 1, length: STEPS.length })}</span>
        </div>

        <div class="step-wrap">
          {#key step}
            <div class="step" in:fade={{ duration: 240 }}>
              {#if step === "welcome"}
                <h1 id="step-title">{t("Let’s get your church on screen")}</h1>
                <p class="lede">{t("About a minute. The preview beside you changes as you answer, so you see your Sunday before it starts.")}</p>
                <ul class="promises">
                  <li><span class="pi"><Icon name="bible" size={15} /></span><span>{t("Scripture, songs and sermons, ready offline")}</span></li>
                  <li><span class="pi"><Icon name="mic" size={15} /></span><span>{t("Say “next verse” and the desk follows")}</span></li>
                  <li><span class="pi"><Icon name="cast" size={15} /></span><span>{t("Nothing reaches the screen until you press LIVE")}</span></li>
                </ul>
                <div class="ob-lang" role="radiogroup" aria-label={t("Language")}>
                  {#each UI_LANGUAGES as language (language.id)}
                    <button type="button" role="radio" lang={language.id} aria-checked={(session.workspace.appearance.language ?? "en") === language.id} onclick={() => session.setAppearance({ language: language.id })}>{language.name}</button>
                  {/each}
                </div>
                {#await import("../settings/MoveComputer.svelte") then { default: MoveComputer }}
                  <MoveComputer compact ondone={moved} />
                {/await}
              {:else if step === "church"}
                <h1 id="step-title">{t("Tell us about your church")}</h1>
                <p class="lede">{t("The name becomes your logo slide. Tick what you show and the preview shows it.")}</p>
                <label class="field-wrap">
                  <span>{t("Church name")}</span>
                  <input use:focusOnShow placeholder={t("Grace Chapel")} maxlength="80" bind:value={churchName} oninput={() => (showing = "name")} />
                </label>
                <div class="uses" role="group" aria-label={t("What you put on screen")}>
                  <span class="ob-label">{t("On Sunday we show")}</span>
                  <div class="use-grid">
                    {#each USES as entry (entry.id)}
                      <button type="button" class="use" class:on={uses.includes(entry.id)} aria-pressed={uses.includes(entry.id)} onclick={() => toggleUse(entry.id)}>
                        <Icon name={entry.icon} size={16} />
                        <span>{t(entry.label)}</span>
                        {#if uses.includes(entry.id)}<Icon name="check" size={14} />{/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {:else if step === "wall"}
                <h1 id="step-title">{t("How it looks on the wall")}</h1>
                <p class="lede">{t("Pick the look for verses, songs and your logo slide. Preview and Program change as you pick; the theme library has many more.")}</p>
                <div class="walls" role="radiogroup" aria-label={t("Screen theme")}>
                  {#each wallThemes as theme (theme.id)}
                    <button type="button" role="radio" aria-checked={screenTheme.id === theme.id} class="wall" class:on={screenTheme.id === theme.id} onclick={() => session.useTheme(theme.id)}>
                      <span class="wall-shot"><Screen model={sample(theme)} still aspect={outputShape.aspect} /></span>
                      <strong>{theme.name}</strong>
                    </button>
                  {/each}
                </div>
              {:else if step === "look"}
                <h1 id="step-title">{t("Colors for your desk")}</h1>
                <p class="lede">{t("This is the desk you work at. The congregation never sees it, so pick what is easy on your eyes in your room.")}</p>
                <div class="themes" role="radiogroup" aria-label={t("Theme")}>
                  {#each THEMES as entry (entry.id)}
                    <button type="button" role="radio" aria-checked={appearance.theme === entry.id} class="theme" class:on={appearance.theme === entry.id} onclick={() => session.setAppearance({ theme: entry.id })}>
                      <span class="swatch" style:background={entry.ground}>
                        <i style:background={entry.panel}></i>
                        <b style:background={appearance.accent}></b>
                        <em style:color={entry.ink}>{t("Aa")}</em>
                      </span>
                      <strong>{t(entry.name)}</strong>
                      <span>{t(entry.note)}</span>
                    </button>
                  {/each}
                </div>
                <div class="accents" role="radiogroup" aria-label={t("Accent")}>
                  <span class="ob-label">{t("Accent")}</span>
                  {#each ACCENTS as entry (entry.value)}
                    <button type="button" role="radio" aria-checked={appearance.accent === entry.value} aria-label={t(entry.name)} title={t(entry.name)} class="accent" class:on={appearance.accent === entry.value} style:background={entry.value} onclick={() => session.setAppearance({ accent: entry.value })}></button>
                  {/each}
                </div>
              {:else if step === "scripture"}
                <h1 id="step-title">{t("Choose your Bible")}</h1>
                <p class="lede">{t("King James and the World English Bible are installed. Add others now or any time from Settings.")}</p>
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
                        // Only a Bible that is actually here can be chosen (a download can fail).
                        if (session.translations.some((item) => item.id === entry.id)) translation = entry.id;
                      }}
                    >
                      <span class="abbr">{entry.abbreviation}</span>
                      <span class="bname">{entry.name}</span>
                      <span class="state">
                        {#if busy}{t("Downloading…")}{:else if installed}{translation === entry.id ? t("Showing") : t("Installed")}{:else}<Icon name="download" size={12} /> {t("{sizeMb} MB", { sizeMb: entry.sizeMb })}{/if}
                      </span>
                    </button>
                  {/each}
                </div>
              {:else if step === "screen"}
                <h1 id="step-title">{t("Put it on the big screen")}</h1>
                <p class="lede">{t("Plug in the projector or TV first. The audience window opens there, full screen, and shows only what you send live.")}</p>
                <div class="screen-steps">
                  <div class="screen-row" class:done={session.output.online}>
                    <span class="num">{#if session.output.online}<Icon name="check" size={14} />{:else}1{/if}</span>
                    <div class="screen-copy"><strong>{t("Open the audience window")}</strong><span>{session.output.online ? t("It is open. Move it to the projector if it opened here.") : t("It opens on the second screen when there is one.")}</span></div>
                    {#if !session.output.online}<button type="button" class="btn" onclick={() => void openScreen()}><Icon name="cast" size={15} /> {t("Open")}</button>{/if}
                  </div>
                  {#if screenNote}<p class="screen-note" role="alert">{screenNote}</p>{/if}
                  {#if oneScreen && !session.output.online}<p class="screen-note" role="status">{t("Only one screen is connected. Plug in the projector or TV; without one, the audience window opens on this screen.")}</p>{/if}
                  <div class="screen-row" class:done={tested} class:off={!session.output.online}>
                    <span class="num">{#if tested}<Icon name="check" size={14} />{:else}2{/if}</span>
                    <div class="screen-copy"><strong>{t("Check it from the back row")}</strong><span>{t("A test pattern flashes on the audience screen. Nothing live changes.")}</span></div>
                    <button type="button" class="btn" disabled={!session.output.online} onclick={() => void sendTest()}>{t("Test")}</button>
                  </div>
                </div>
                <label class="shape-line">
                  <span>{t("Screen shape")}</span>
                  <select aria-label={t("Screen shape")} value={shape} onchange={(event) => session.setScreenShape(event.currentTarget.value as ScreenShape)}>
                    {#each SCREEN_SHAPES as entry (entry.id)}<option value={entry.id}>{entry.id === "auto" ? t("Fit any screen") : t(entry.label)}</option>{/each}
                  </select>
                  <em>{shape !== "auto" ? `Always ${shape}.` : measured ? `Found: ${describeAspect(measured)}.` : t("Found when the window opens.")}</em>
                </label>
                <p class="hint">{t("No projector here yet? Continue. The Audience button at the top of the desk does this any time.")}</p>
              {:else}
                <h1 id="step-title">{t("{name} is ready", { name })}</h1>
                <p class="lede">{t("Here is what is set up. Change any of it later in Settings.")}</p>
                <ul class="summary">
                  <li><Icon name="church" size={15} /><span><strong>{name}</strong> {t("on the logo slide")}</span></li>
                  <li><Icon name="themes" size={15} /><span><strong>{screenTheme.name}</strong> {t("on the screen")}</span></li>
                  <li><Icon name="look" size={15} /><span><strong>{themeName}</strong> {t("desk, {accentName} accent", { accentName })}</span></li>
                  <li><Icon name="bible" size={15} /><span><strong>{chosen.name}</strong> {t("on screen")}</span></li>
                  <li class:pending={!session.output.online}><Icon name="cast" size={15} /><span>{session.output.online ? t("Audience window open") : t("Audience screen: open it from the desk when the projector is on")}</span></li>
                  <li class="pending"><Icon name="mic" size={15} /><span>{t("Voice: press Listen on the desk when you want it")}</span></li>
                </ul>
                <label class="samples">
                  <input type="checkbox" class="switch" bind:checked={samples} />
                  <span><strong>{t("Start with samples")}</strong><em>{t("18 classic hymns, a whole sample Sunday service with its readings, sermon and announcements, and quizzes for phones. Change or delete them any time.")}</em></span>
                </label>
                {#if session.plan === "free" && !session.workspace.entitlement.trialUsed}
                  <p class="trial-note"><Icon name="sparkles" size={14} /> {t("Premium is free for {n} days, from when you open your desk. No card needed.", { n: TRIAL_DAYS })}</p>
                {/if}
                <div class="account-card" aria-live="polite">
                  {#if session.workspace.profile?.token}
                    <Icon name="check" size={15} />
                    <span><strong class="one-line">{t("Signed in as {name}", { name: session.workspace.profile.name || session.workspace.profile.email })}</strong><em>{t("Your trial and plans follow you to every computer.")}</em></span>
                  {:else if session.accountSignin?.status === "waiting"}
                    <Icon name="globe" size={15} />
                    {#if session.accountSignin.mode === "code"}
                      <span><strong>{t("Type {code} on the sign-in page", { code: session.accountSignin.code ?? "" })}</strong><em>{t("Sign in there, then type this code.")}</em></span>
                    {:else}
                      <span><strong>{t("Finish signing in in your browser")}</strong><em>{t("Sign in there and choose Continue. Church Studio carries on by itself.")}</em></span>
                    {/if}
                    <span class="account-actions">
                      <button type="button" class="btn quiet small" onclick={() => session.reopenAccountSignin()}>{t("Open the page again")}</button>
                      <button type="button" class="btn quiet small" onclick={() => session.cancelAccountSignin()}>{t("Cancel")}</button>
                    </span>
                  {:else}
                    <Icon name="user" size={15} />
                    <span><strong>{t("Sign in to start your free trial")}</strong><em>{accountError || session.accountSignin?.message || t("Google, Microsoft, Apple or an email link. Your trial and any plan follow you to every computer. You can also sign in later.")}</em></span>
                    <span class="account-actions"><button type="button" class="btn quiet small" onclick={async () => (accountError = (await session.startAccountSignin()) ?? "")}>{t("Sign in")}</button></span>
                  {/if}
                </div>
                <div class="desk-pick" role="radiogroup" aria-label={t("Desk")}>
                  <button type="button" role="radio" aria-checked={desk === "pewbeam"} class:on={desk === "pewbeam"} onclick={() => (deskChoice = "pewbeam")}>
                    <Icon name="pew" size={16} /><span><strong>{t("Presenter Desk")}</strong><em>{t("Scripture, songs and sermons")}</em></span>
                  </button>
                  <button type="button" role="radio" aria-checked={desk === "obs"} class:on={desk === "obs"} onclick={() => (deskChoice = "obs")}>
                    <Icon name="obs" size={16} /><span><strong>{t("Production Desk")}</strong><em>{session.entitled("production") ? t("Cameras, scenes and video") : `Premium, free for ${TRIAL_DAYS} days`}</em></span>
                  </button>
                </div>
                {#if trialError}<p class="trial-error" role="alert">{t("The Production Desk trial could not start: {reason} You can start on the Presenter Desk and try again from Settings › Plan & account.", { reason: trialError })}</p>{/if}
                <button type="button" class="tour-link" onclick={() => void finish(true)}>{t("New to this? Show me around first")}</button>
              {/if}
            </div>
          {/key}
        </div>

        <footer class="nav">
          {#if index > 0}<button type="button" class="btn quiet" onclick={() => go(index - 1)}>{t("Back")}</button>{:else}<span></span>{/if}
          {#if step === "ready"}
            <span class="ready-buttons">
              <button type="button" class="btn primary" onclick={() => void finish(false)}>{t("Open my desk")}</button>
            </span>
          {:else}
            <button type="button" class="btn primary" onclick={() => go(index + 1)}>{step === "welcome" ? t("Get started") : t("Continue")}</button>
          {/if}
        </footer>
      </section>

      <section class="art" aria-label={t("Preview of the desk")} bind:clientWidth={artWidth} bind:clientHeight={artHeight}>
        {#key step}
          <div class="sky" transition:fade={{ duration: 900 }} style:transform="translate(-50%, -50%) scale({skyScale})">
            <MotionBackground motion={sky.id} tint={appearance.accent} base={sky.base} />
          </div>
        {/key}
        <div class="vignette" aria-hidden="true"></div>
        <div class="grain" aria-hidden="true"></div>

        <div class="float">
          <div class="settle">
            <MiniApp preview={shown.preview} program={shown.program} onAir={shown.onAir} reference={shown.reference} mode={shown.mode} desk={miniDesk} focus={zones} verses={miniVerses} translation={chosen.abbreviation} />
          </div>
          <div class="floor" aria-hidden="true"></div>
        </div>

        <div class="art-foot">
          <p class="credit"><Icon name="media" size={12} /> {t("{name} background, from the theme library", { name: sky.name })}</p>
          {#key step}
            <p class="caption" in:fade={{ duration: 300 }}><span class="cap-dot"></span>{t(FOCUS[step].note)}</p>
          {/key}
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
  .step-wrap { flex: 1 0 auto; display: flex; flex-direction: column; justify-content: flex-start; padding-top: clamp(8px, 6vh, 64px); }
  .step { display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: clamp(28px, 2.5vw, 36px); font-weight: 750; letter-spacing: -0.028em; line-height: 1.1; text-wrap: balance; }
  .lede { margin: 0; font-size: 15px; line-height: 1.55; color: var(--muted); max-width: 42ch; }
  .promises { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
  .promises li { display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .pi { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-text); }

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
  .bible.on .abbr { background: var(--accent); color: var(--on-accent); }
  .bname { flex: 1; font-size: 13px; font-weight: 600; }
  .state { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 650; color: var(--muted); }
  .bible.on .state { color: var(--accent-text); }
  .bible:disabled { opacity: 0.7; cursor: progress; }

  .walls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
  .wall { display: grid; gap: 6px; padding: 6px 6px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .wall:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .wall.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .wall strong { padding: 0 2px; font-weight: 650; }
  .wall-shot { display: block; border-radius: 7px; overflow: hidden; pointer-events: none; }
  .shape-line { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .shape-line select { height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .shape-line em { font-style: normal; font-weight: 500; }

  .uses { display: grid; gap: 8px; margin-top: 6px; }
  .use-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .use { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
  .use span { flex: 1; }
  .use :global(svg:first-child) { color: var(--muted); }
  .use.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .use.on :global(svg) { color: var(--accent-text); }
  .screen-steps { display: grid; gap: 8px; margin-top: 4px; }
  .screen-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .screen-row.done { border-color: color-mix(in srgb, var(--presence, #3fb950) 55%, var(--line)); }
  .screen-row.off { opacity: 0.6; }
  .num { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent-text); font-size: 12px; font-weight: 800; }
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
  .desk-pick button :global(svg) { flex: none; color: var(--accent-text); }
  .desk-pick span { display: grid; gap: 1px; }
  .desk-pick strong { font-size: 13px; }
  .desk-pick em { font-style: normal; font-size: 11.5px; color: var(--muted); }
  .desk-pick button.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .ready-buttons { display: flex; gap: 8px; }
  .tour-link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .tour-link:hover { text-decoration: underline; }
  .screen-note { margin: 0; padding: 8px 10px; border: 1px solid color-mix(in srgb, #f5a524 55%, transparent); border-radius: 8px; background: color-mix(in srgb, #f5a524 10%, transparent); font-size: 13px; line-height: 1.4; }
  .trial-note { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; color: var(--muted); }
  .trial-note :global(svg) { color: var(--accent-text); flex: none; }
  .account-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 60%, transparent); }
  .account-card > :global(svg) { flex: none; color: var(--muted); }
  .account-card > span:not(.account-actions) { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .account-card strong { font-size: 13px; font-weight: 700; }
  .account-card em { font-style: normal; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .account-actions { display: flex; gap: 4px; flex: none; }
  .account-actions .btn.small { height: 32px; padding: 0 12px; font-size: 13px; border-color: var(--line); background: var(--field); color: var(--ink); }
  .account-actions .btn.small:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .trial-error { margin: 0; padding: 8px 10px; border: 1px solid color-mix(in srgb, #f5a524 60%, transparent); border-radius: 8px; background: color-mix(in srgb, #f5a524 12%, transparent); font-size: 13px; line-height: 1.4; }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .progress { display: flex; gap: 5px; }
  .tick { width: 18px; height: 5px; padding: 0; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--ink) 14%, transparent); cursor: pointer; transition: width 240ms ease, background 240ms ease; }
  .tick.done { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .tick.here { width: 34px; background: var(--accent); }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 22px; border: 1px solid var(--line); border-radius: 11px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; }
  .btn.primary { min-width: 150px; border-color: var(--accent); background: var(--accent); color: var(--on-accent); box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 30%, transparent); }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.quiet { border-color: transparent; background: none; color: var(--muted); padding: 0 6px; }
  .btn.quiet:hover { color: var(--ink); }
  :is(.btn, .tick, .theme, .bible, .accent, .skip, .use, .wall, .tour-link, .desk-pick button):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  /* The art: a living sky from the theme library, with the desk floating in it. */
  .art { position: relative; min-width: 0; overflow: hidden; background: #000; isolation: isolate; }
  .sky { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; transform-origin: center; filter: blur(5px) saturate(1.15); }
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
  .float { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: clamp(28px, 5%, 56px) clamp(24px, 4%, 48px) 76px; }
  .settle { position: relative; z-index: 1; width: min(100%, 1040px); min-width: 0; animation: settle 900ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes settle { from { transform: translateY(14px) scale(0.985); } }
  .settle :global(.mini-app) { box-shadow: 0 50px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 80px color-mix(in srgb, var(--accent) 18%, transparent); }
  .float > :global(*) { grid-area: 1 / 1; }
  .floor { align-self: end; justify-self: center; width: 70%; height: 60px; margin-bottom: -40px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent); filter: blur(10px); }
  .art-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-wrap: wrap-reverse; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 18px 22px; color: rgba(255, 255, 255, 0.82); font-size: 12px; }
  .art-foot p { margin: 0; }
  .cap-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .credit { display: inline-flex; align-items: center; gap: 6px; color: rgba(255, 255, 255, 0.6); }
  .caption { display: inline-flex; align-items: center; gap: 8px; margin-left: auto !important; padding: 7px 12px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; background: rgba(0, 0, 0, 0.42); backdrop-filter: blur(12px); font-weight: 600; text-align: right; }

  @media (max-width: 980px) {
    .first-run { place-items: stretch; padding: 0; }
    .stage-card { grid-template-columns: 1fr; grid-template-rows: auto auto; height: auto; min-height: 100%; border-radius: 0; border: 0; }
    .art { order: -1; }
    .float { position: relative; padding: 24px 24px 64px; }
    .credit { display: none; }
    .ask { padding: 24px 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .loader i { animation: none; width: 100%; }
    .tick { transition: none; }
    .settle { animation: none; }
  }
  .ob-lang { display: inline-flex; align-self: flex-start; width: max-content; gap: 4px; margin-top: 18px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; }
  .ob-lang button { height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .ob-lang button[aria-checked="true"] { background: var(--field); color: var(--ink); }
  .one-line { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .samples { display: flex; align-items: flex-start; gap: 10px; margin: 14px 0 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
  .samples span { display: grid; gap: 3px; }
  .samples strong { font-size: 13.5px; }
  .samples em { font-style: normal; color: var(--muted); font-size: 12px; line-height: 1.45; }
</style>
