<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { sanitizeTransition, transitionChanged } from "../../domain/theme";
  import { formatReference, parseReference } from "../../bible/reference";
  import type { BibleItem } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import OutputControls from "../OutputControls.svelte";
  import Screen from "../Screen.svelte";

  let query = $state("");
  let kind = $state<"cut" | "fade">("fade");
  let duration = $state(300);
  let synced = false;

  $effect(() => {
    if (!session.ready || synced) return;
    const transition = sanitizeTransition(session.theme().transition);
    kind = transition.type;
    duration = transition.ms;
    synced = true;
  });

  $effect(() => {
    if (!synced) return;
    const theme = session.theme();
    const next = sanitizeTransition({ type: kind, ms: Number(duration) });
    if (!transitionChanged(theme.transition, kind, duration)) {
      if (duration !== next.ms) duration = next.ms;
      if (kind !== next.type) kind = next.type;
      return;
    }
    kind = next.type;
    duration = next.ms;
    session.saveTheme({ ...theme, transition: next });
  });

  const sections = $derived(session.service?.sections ?? []);
  const scene = $derived(sections.find((section) => section.id === session.cursor.sectionId) ?? sections[0] ?? null);
  const sources = $derived(scene?.items ?? []);
  const sceneName = $derived(scene?.name ?? session.service?.name ?? "Untitled");
  const previewLabel = $derived(session.live.preview.model.reference || (session.live.preview.model.lines[0] ? sceneName : "No source selected"));

  function rememberTransition() {
    duration = Number(duration) || 0;
    const theme = session.theme();
    if (theme.transition.type === kind && theme.transition.ms === duration) return;
    session.saveTheme({ ...theme, transition: { type: kind, ms: duration } });
  }

  async function transition() {
    rememberTransition();
    if (kind === "cut") await session.cut();
    else await session.take();
  }

  async function fade(ms: number) {
    kind = "fade";
    duration = ms;
    rememberTransition();
    await session.take();
  }

  async function ensureScene() {
    if (!session.service) await session.createService("Sunday Service");
    if (!session.service?.sections.length) session.addSection("Scene");
  }

  async function pickScene(id: string) {
    const next = sections.find((section) => section.id === id);
    session.cursor = { sectionId: id, itemId: next?.items[0]?.id ?? null };
    if (next?.items[0]) await session.selectItem(next.items[0].id);
  }

  function scriptureFromQuery(): BibleItem | null {
    const parsed = parseReference(query, session.books);
    if (!parsed?.startVerse) return null;
    const book = session.books.find((entry) => entry.ord === parsed.bookOrd);
    return {
      translationId: "kjv",
      bookOrd: parsed.bookOrd,
      chapter: parsed.chapter,
      startVerse: parsed.startVerse,
      endVerse: parsed.endVerse ?? parsed.startVerse,
      reference: formatReference(book?.name ?? "John", parsed.chapter, parsed.startVerse, parsed.endVerse ?? parsed.startVerse, book?.chapters ?? 1),
    };
  }

  async function previewScripture(event: Event) {
    event.preventDefault();
    const item = scriptureFromQuery();
    if (!item) return;
    await session.previewPassage(item);
  }

  async function addScripture() {
    const item = scriptureFromQuery();
    if (!item) return;
    await ensureScene();
    await session.addPassage(item);
    query = "";
  }
</script>

<div class="obs">
  <div class="studio">
    <section class="pane">
      <header>Preview: {sceneName}</header>
      <div class="well"><Screen model={session.live.preview.model} stream={session.live.preview.sourceId?.startsWith("camera:") ? session.cameraStream : null} /></div>
      <footer>
        <span>{previewLabel}</span>
        <span class="tools">
          <button type="button" data-tip="Theme" onclick={() => (session.settingsOpen = true)}>Properties</button>
        </span>
      </footer>
    </section>

    <aside class="transitions">
      <button type="button" class="ghost" data-tip="Copy preview to program" onclick={() => void transition()}>Transition</button>
      <p>Quick Transitions</p>
      <button type="button" class="ghost" data-tip="Cut to program" onclick={() => session.cut()}>Cut</button>
      <button type="button" class="ghost" data-tip="Fade to program" onclick={() => void fade(duration)}>Fade ({duration}ms)</button>
      <button type="button" class="ghost" data-tip="Fade program to black" onclick={() => session.black()}>Fade to Black</button>
    </aside>

    <section class="pane">
      <header>
        <span>Program: {sceneName}</span>
        <span class="live-dot"></span>
      </header>
      <div class="well"><Screen model={session.live.program.model} /></div>
    </section>
  </div>

  <div class="docks">
    <section class="dock">
      <header><Icon name="studio" size={14} /> Scenes</header>
      <div class="list">
        {#if sections.length === 0}
          <button type="button" onclick={() => void ensureScene()}>New scene</button>
        {/if}
        {#each sections as section (section.id)}
          <button type="button" class:on={scene?.id === section.id} onclick={() => void pickScene(section.id)}>{section.name}</button>
        {/each}
      </div>
      <footer class="bar">
        <button type="button" data-tip="Add scene" onclick={() => { void ensureScene(); session.addSection("Scene"); }}>+</button>
        <button type="button" data-tip="Remove scene" onclick={() => scene && session.removeSection(scene.id)}>−</button>
      </footer>
    </section>

    <section class="dock">
      <header><Icon name="list" size={14} /> Sources</header>
      <div class="list">
        {#each sources as item (item.id)}
          <button type="button" class:on={session.cursor.itemId === item.id} onclick={() => session.selectItem(item.id)}>
            <span>{item.title}</span>
          </button>
        {/each}
      </div>
      <form class="add" onsubmit={previewScripture}>
        <input aria-label="Add scripture" placeholder="John 3:16" bind:value={query} data-tip="Enter previews. Add puts it in the scene." />
        <button type="button" data-tip="Add the reference to this scene" onclick={() => void addScripture()}>Add</button>
      </form>
      <footer class="bar">
        <button type="button" data-tip="Add slide" onclick={() => { void ensureScene(); session.addSlide("slide"); }}>+</button>
      </footer>
    </section>

    <section class="dock">
      <header><Icon name="audio" size={14} /> Audio Mixer</header>
      <div class="mixer">
        <div class="meter">
          <span>Program</span>
          <div class="scale"></div>
          <div class="fader"></div>
        </div>
      </div>
    </section>

    <section class="dock">
      <header><Icon name="transition" size={14} /> Scene Transitions</header>
      <label>
        <select
          bind:value={kind}
          onchange={(event) => {
            kind = event.currentTarget.value === "cut" ? "cut" : "fade";
            rememberTransition();
          }}
        >
          <option value="fade">Fade</option>
          <option value="cut">Cut</option>
        </select>
      </label>
      <label class="duration">
        Duration
        <input
          type="number"
          min="0"
          max="2000"
          step="50"
          bind:value={duration}
          onchange={(event) => {
            duration = Number(event.currentTarget.value) || 0;
            rememberTransition();
          }}
        />
        <span>ms</span>
      </label>
    </section>

    <section class="dock">
      <header><Icon name="settings" size={14} /> Controls</header>
      <div class="controls">
        <OutputControls />
        <p class="audience-owner">{session.audienceLabel()}</p>
        {#if !session.controlsAudience}
          <button type="button" data-tip="Send from this window after you Take" onclick={() => session.claimAudience()}>Take control</button>
        {/if}
        <button type="button" class="studio-mode" data-tip="Selecting a source stays on preview">Studio Mode</button>
        <button type="button" data-tip="Settings" onclick={() => session.openSettings("appearance")}>Settings</button>
        <div class="desk-switch">
          <button type="button" data-tip="PewBeam desk" aria-label="PewBeam" onclick={() => session.setAppearance({ desk: "pewbeam" })}><Icon name="pew" size={14} /></button>
          <button type="button" class="on" data-tip="OBS desk" aria-label="OBS" onclick={() => session.setAppearance({ desk: "obs" })}><Icon name="obs" size={14} /></button>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .obs {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 228px;
    background: #1b1e26;
    color: #e8eaef;
    font-family: var(--font-ui);
    font-size: 12px;
    overflow: hidden;
  }
  .studio {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 168px minmax(0, 1.05fr);
    gap: 8px;
    padding: 8px 8px 0;
  }
  .pane, .dock {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #242833;
    border: 1px solid #343a46;
    border-radius: 4px;
    overflow: hidden;
  }
  header, footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 28px;
    padding: 0 8px;
    color: #c9ced8;
    background: #2c313c;
  }
  .well {
    flex: 1;
    min-height: 0;
    background: #000;
    display: grid;
    place-items: center;
    container-type: size;
    overflow: hidden;
  }
  .well :global(.ratio) {
    width: min(100cqw, calc(100cqh * 16 / 9));
    height: min(100cqh, calc(100cqw * 9 / 16));
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: auto;
    overflow: hidden;
    background: #000;
  }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #3dd68c; box-shadow: 0 0 0 2px rgba(61, 214, 140, 0.25); }
  .transitions {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 4px;
  }
  .transitions p { margin: 8px 0 0; text-align: center; color: #9aa3b2; }
  .ghost, .controls button, .list button, .bar button, .desk-switch button {
    border: 1px solid #4a5160;
    background: #343a46;
    color: #e8eaef;
    border-radius: 4px;
    min-height: 28px;
    padding: 0 8px;
  }
  .ghost { width: 100%; }
  .docks {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 0.85fr) minmax(0, 0.9fr);
    gap: 8px;
    padding: 8px;
  }
  .dock header { justify-content: flex-start; gap: 6px; font-weight: 600; }
  .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: 4px; gap: 2px; }
  .list button { text-align: left; background: transparent; border-color: transparent; }
  .list button.on { background: #2f6fbe; border-color: #2f6fbe; color: white; }
  .bar { justify-content: flex-start; gap: 4px; background: #232833; }
  .bar button { width: 26px; padding: 0; }
  .add { padding: 0 6px 6px; }
  .add input, .dock select, .duration input {
    width: 100%;
    height: 28px;
    border-radius: 4px;
    border: 1px solid #4a5160;
    background: #1b1e26;
    color: #e8eaef;
    padding: 0 8px;
  }
  .mixer { flex: 1; display: flex; align-items: end; padding: 8px 12px 12px; }
  .meter { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .scale {
    height: 10px;
    border-radius: 99px;
    background: linear-gradient(90deg, #3dd68c 0 55%, #e2cc4a 55% 75%, #e25b4a 75% 100%);
  }
  .fader { height: 4px; border-radius: 99px; background: #6d7585; position: relative; }
  .fader::after {
    content: "";
    position: absolute;
    left: 42%;
    top: -5px;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: #d7dbe3;
  }
  .duration { display: flex; align-items: center; gap: 6px; padding: 8px; color: #c9ced8; }
  .duration input { width: 72px; }
  .controls { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 8px; }
  .audience-owner { margin: 0; color: #9aa3b2; font-size: 12px; }
  .controls button { width: 100%; }
  .studio-mode { background: #2f6fbe; border-color: #2f6fbe; color: white; font-weight: 650; }
  .desk-switch { display: flex; gap: 6px; }
  .desk-switch button { flex: 1; display: grid; place-items: center; }
  .desk-switch button.on { border-color: #2f6fbe; color: white; }
  .obs :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 1100px) {
    .obs { grid-template-rows: auto minmax(220px, 1fr); overflow: auto; }
    .studio { grid-template-columns: 1fr; }
    .pane { min-height: 220px; }
    .docks { grid-template-columns: repeat(5, minmax(180px, 1fr)); }
  }
</style>
