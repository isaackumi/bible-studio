<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { sanitizeTransition, transitionChanged } from "../../domain/theme";
  import { formatReference, parseReference } from "../../bible/reference";
  import type { BibleItem } from "../../domain/types";
  import DeskSwitcher from "../DeskSwitcher.svelte";
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
  const displayLive = $derived(
    session.output.online && session.live.program.model.layout !== "black" && session.live.program.model.layout !== "empty",
  );
  const focus = $derived(session.workspace.pew.focus);
  const activeLayout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const scenesOpen = $derived(activeLayout?.panels.find((panel) => panel.panelId === "service")?.visible !== false);
  const controlsOpen = $derived(activeLayout?.panels.find((panel) => panel.panelId === "controls")?.visible !== false);

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

<div class="prod" class:focus>
  <header class="prod-bar">
    <DeskSwitcher />
    <p class="desk-title">Production Desk</p>
    <div class="prod-actions">
      <OutputControls compact />
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip="Send from this window after you Take" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
    </div>
    <nav class="prod-tools" aria-label="Workspace">
      <button type="button" class="desk-btn icon" class:on={focus} aria-pressed={focus} aria-label={focus ? "Leave focus" : "Focus Preview and Program"} data-tip={focus ? "Leave focus" : "Focus Preview and Program"} onclick={() => session.savePew({ focus: !focus })}>
        <Icon name="focus" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={scenesOpen} aria-pressed={scenesOpen} aria-label={scenesOpen ? "Hide scenes" : "Show scenes"} data-tip={scenesOpen ? "Hide scenes" : "Show scenes"} onclick={() => session.togglePanel("service")}>
        <Icon name="studio" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={controlsOpen} aria-pressed={controlsOpen} aria-label={controlsOpen ? "Hide controls" : "Show controls"} data-tip={controlsOpen ? "Hide controls" : "Show controls"} onclick={() => session.togglePanel("controls")}>
        <Icon name="list" size={16} />
      </button>
      <button type="button" class="desk-btn icon" aria-label="Reset workspace" data-tip="Reset workspace" onclick={() => session.resetActiveLayout()}>
        <Icon name="reset" size={16} />
      </button>
      <button type="button" class="desk-btn icon" aria-label="Settings" data-tip="Settings" onclick={() => session.openSettings("appearance")}>
        <Icon name="settings" size={16} />
      </button>
    </nav>
  </header>

  <div class="studio">
    <section class="pane preview">
      <header>
        <span class="kicker">Preview</span>
        <span class="meta">{sceneName}</span>
      </header>
      <div class="well"><Screen model={session.live.preview.model} stream={session.cameraStream} sourceId={session.live.preview.sourceId} cameraFeedId={session.cameraFeedId} surface="preview" /></div>
      <footer>
        <span>{previewLabel}</span>
        <button type="button" class="desk-btn" data-tip="Theme" onclick={() => (session.settingsOpen = true)}>Properties</button>
      </footer>
    </section>

    <aside class="bridge" aria-label="Transition">
      <p class="flow">Preview <Icon name="transition" size={16} /> Program</p>
      <button type="button" class="desk-btn primary" data-tip="Send Preview to Program" onclick={() => void transition()}>
        <Icon name="play" size={16} /> TAKE
      </button>
      <button type="button" class="desk-btn" data-tip="Cut Preview to Program" onclick={() => session.cut()}>
        <Icon name="scissors" size={16} /> CUT
      </button>
      <button type="button" class="desk-btn" data-tip="Fade Preview to Program" onclick={() => void fade(duration)}>
        AUTO
      </button>
      <div class="resets">
        <button type="button" class="desk-btn ghost" data-tip="Clear Program" onclick={() => session.clear()}>
          <Icon name="square" size={16} /> CLEAR
        </button>
        <button type="button" class="desk-btn danger" data-tip="Black Program" onclick={() => session.black()}>
          <Icon name="moon" size={16} /> BLACK
        </button>
        <button type="button" class="desk-btn" data-tip="Logo on Program" onclick={() => session.logo()}>
          <Icon name="logo" size={16} /> LOGO
        </button>
      </div>
      {#if kind === "fade"}
        <label class="duration">
          Fade
          <input
            type="number"
            min="0"
            max="2000"
            step="50"
            bind:value={duration}
            aria-label="Fade duration in milliseconds"
            onchange={(event) => {
              duration = Number(event.currentTarget.value) || 0;
              rememberTransition();
            }}
          />
          <span>ms</span>
        </label>
      {/if}
    </aside>

    <section class="pane program" class:on-air={displayLive}>
      <header>
        <span class="kicker program">{#if displayLive}<span class="pip"></span>{/if}Program</span>
        <span class="meta">{sceneName}</span>
      </header>
      <div class="well"><Screen model={session.live.program.model} /></div>
      <footer>
        <span>{session.live.program.model.reference || "Audience sees this frame."}</span>
      </footer>
    </section>
  </div>

  {#if !focus}
    <div class="docks">
      {#if scenesOpen}
        <section class="dock">
          <header><Icon name="studio" size={16} /> Scenes</header>
          <div class="list">
            {#if sections.length === 0}
              <button type="button" onclick={() => void ensureScene()}>New scene</button>
            {/if}
            {#each sections as section (section.id)}
              <button type="button" class:on={scene?.id === section.id} onclick={() => void pickScene(section.id)}>{section.name}</button>
            {/each}
          </div>
          <footer class="bar">
            <button type="button" class="desk-btn icon" data-tip="Add scene" aria-label="Add scene" onclick={() => { void ensureScene(); session.addSection("Scene"); }}>
              <Icon name="plus" size={16} />
            </button>
            <button type="button" class="desk-btn icon" data-tip="Remove scene" aria-label="Remove scene" onclick={() => scene && session.removeSection(scene.id)}>
              <Icon name="minus" size={16} />
            </button>
          </footer>
        </section>
      {/if}

      <section class="dock">
        <header><Icon name="list" size={16} /> Sources</header>
        <div class="list">
          {#each sources as item (item.id)}
            <button type="button" class:on={session.cursor.itemId === item.id} onclick={() => session.selectItem(item.id)}>
              <span>{item.title}</span>
            </button>
          {/each}
        </div>
        <form class="add" onsubmit={previewScripture}>
          <input aria-label="Add scripture" placeholder="John 3:16" bind:value={query} data-tip="Enter previews. Add puts it in the scene." />
          <button type="button" class="desk-btn" data-tip="Add the reference to this scene" onclick={() => void addScripture()}>Add</button>
        </form>
        <footer class="bar">
          <button type="button" class="desk-btn icon" data-tip="Add slide" aria-label="Add slide" onclick={() => { void ensureScene(); session.addSlide("slide"); }}>
            <Icon name="plus" size={16} />
          </button>
        </footer>
      </section>

      <section class="dock dock-mixer">
        <header><Icon name="audio" size={16} /> Audio Mixer</header>
        <div class="mixer">
          <div class="meter">
            <span>Program</span>
            <div class="scale"></div>
            <div class="fader"></div>
          </div>
        </div>
      </section>

      <section class="dock dock-fx">
        <header><Icon name="transition" size={16} /> Scene Transitions</header>
        <label>
          <select
            aria-label="Transition type"
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

      {#if controlsOpen}
        <section class="dock">
          <header><Icon name="settings" size={16} /> Controls</header>
          <div class="controls">
            <p class="studio-mode">Studio — select stays on Preview</p>
            <button type="button" class="desk-btn" data-tip="Settings" onclick={() => session.openSettings("appearance")}>Settings</button>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .prod {
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) minmax(148px, 200px);
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 12px;
    overflow: hidden;
  }
  .prod.focus { grid-template-rows: auto minmax(0, 1fr); }
  .prod-bar {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    min-height: var(--chrome-h);
    padding: 6px var(--panel-pad);
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    overflow: hidden;
  }
  .desk-title {
    margin: 0;
    flex: none;
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .prod-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .prod-tools { display: flex; align-items: center; gap: 4px; flex: none; }
  .studio {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(148px, 168px) minmax(240px, 1.05fr);
    gap: var(--gap);
    padding: var(--gap) var(--panel-pad) 0;
  }
  .pane, .dock {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  .pane.program { border-color: color-mix(in srgb, var(--onair) 45%, var(--line)); }
  .pane.program.on-air { border-color: var(--onair); }
  header, footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--desk-head-h);
    padding: 0 var(--panel-pad);
    color: var(--muted);
    background: var(--panel-2);
  }
  .kicker {
    font-family: var(--font-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 11px;
    color: var(--ink);
  }
  .kicker.program { color: var(--pigment-live-ink); display: inline-flex; align-items: center; gap: 6px; }
  .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 8px var(--live);
  }
  .well {
    flex: 1;
    min-height: 0;
    background: var(--glass);
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
  .bridge {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 8px 4px;
  }
  .flow {
    margin: 0 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--muted);
    font-family: var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 10px;
  }
  .bridge .desk-btn { width: 100%; }
  .resets { display: flex; flex-direction: column; gap: 6px; }
  .docks {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--gap);
    padding: var(--gap) var(--panel-pad);
  }
  .dock header { justify-content: flex-start; gap: 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; }
  .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: 4px; gap: 2px; }
  .list button {
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    min-height: 28px;
    padding: 0 8px;
    color: inherit;
  }
  .list button.on { background: color-mix(in srgb, var(--accent) 22%, var(--panel)); border-color: var(--accent); }
  .bar { justify-content: flex-start; gap: 4px; }
  .add { display: flex; gap: 6px; padding: 0 6px 6px; }
  .add input, .dock select, .duration input {
    width: 100%;
    height: var(--control-h);
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 8px;
  }
  .mixer { flex: 1; display: flex; align-items: end; padding: 8px 12px 12px; min-height: 0; overflow: auto; }
  .meter { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .scale {
    height: 10px;
    border-radius: var(--radius-control);
    background: linear-gradient(90deg, var(--presence) 0 55%, var(--mustard) 55% 75%, var(--live) 75% 100%);
  }
  .fader { height: 4px; border-radius: var(--radius-control); background: var(--line); position: relative; }
  .fader::after {
    content: "";
    position: absolute;
    left: 42%;
    top: -5px;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: var(--ink);
  }
  .duration { display: flex; align-items: center; gap: 6px; padding: 8px; color: var(--muted); }
  .duration input { width: 72px; flex: none; }
  .controls { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 8px; overflow: auto; }
  .studio-mode { margin: 0; color: var(--muted); }
  .prod :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 1440px) {
    .desk-title { display: none; }
    .dock-mixer, .dock-fx { display: none; }
    .docks { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 1280px) {
    .prod-actions :global(.output-controls button:not(:first-child):not(:last-child)) { display: none; }
  }
  @media (max-width: 1100px) {
    .studio { grid-template-columns: minmax(0, 1fr) minmax(132px, 148px) minmax(0, 1fr); }
    .docks { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
