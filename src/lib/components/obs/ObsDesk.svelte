<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import {
    hideLayer,
    layerStackFrontFirst,
    moveLayerTo,
    renameComposition,
    reorderLayers,
    restoreComposition,
    setLayerLocked,
    showLayer,
    type Composition,
    type CompositionLayer,
  } from "../../domain/composition";
  import {
    buildSource,
    defaultFields,
    fieldsFromSource,
    SOURCE_KINDS,
    type SourceFields,
    type SourceKind,
  } from "../../domain/sources";
  import { sanitizeTransition, transitionChanged } from "../../domain/theme";
  import CompositionPane from "../CompositionPane.svelte";
  import AddSourceDialog from "../sources/AddSourceDialog.svelte";
  import SourceProperties from "../sources/SourceProperties.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import TimerControls from "../TimerControls.svelte";
  import DeskSwitcher from "../DeskSwitcher.svelte";
  import Icon from "../Icon.svelte";
  import OutputControls from "../OutputControls.svelte";
  import Screen from "../Screen.svelte";
  import { Pane, PaneGroup, PaneResizer } from "paneforge";
  import { mergeProductionDocks, mergeProductionRows, mergeProductionStage } from "../../workspace/production";

  let query = $state("");
  let kind = $state<"cut" | "fade">("fade");
  let duration = $state(300);
  let synced = false;
  let looksOpen = $state(false);
  let selectedLayerId = $state<string | null>(null);
  let renameDraft = $state("");
  let typeMenu = $state(false);
  /** Drag-to-reorder in the Sources list (front of the stack is the top row). */
  let dragId = $state<string | null>(null);
  let dropIndex = $state<number | null>(null);
  let adding = $state<SourceKind | null>(null);
  let editing = $state<{
    layerId: string | null;
    sourceKey: string | null;
    name: string;
    fields: SourceFields;
    readonly: boolean;
    notice: string | null;
  } | null>(null);
  let epoch = $state(0);
  let frozen = $state(session.workspace.production);
  let applying = false;
  let chromeReady = false;

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

  const scenes = $derived(session.workspace.compositions.map((entry) => restoreComposition(entry)));
  const activeScene = $derived(session.lookOnPreview ? restoreComposition(session.lookOnPreview) : null);
  const sourceLayers = $derived(activeScene ? layerStackFrontFirst(activeScene) : []);
  const selectedLayer = $derived(sourceLayers.find((layer) => layer.id === selectedLayerId) ?? sourceLayers[0] ?? null);
  const sceneLocked = $derived(!!activeScene?.locked);
  const sceneName = $derived(activeScene?.name ?? "No scene");
  const previewLabel = $derived(
    session.live.preview.model.reference ||
      session.live.preview.model.lines[0]?.text ||
      (activeScene ? activeScene.name : "No source selected"),
  );
  const programLabel = $derived(
    session.live.program.model.reference ||
      session.live.program.model.lines[0]?.text ||
      (session.live.program.model.layout === "empty" ? "No scene" : "Live output"),
  );
  const displayLive = $derived(
    session.output.online && session.live.program.model.layout !== "black" && session.live.program.model.layout !== "empty",
  );
  const focus = $derived(session.workspace.pew.focus);
  const activeLayout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const scenesOpen = $derived(activeLayout?.panels.find((panel) => panel.panelId === "service")?.visible !== false);
  const controlsOpen = $derived(activeLayout?.panels.find((panel) => panel.panelId === "controls")?.visible !== false);
  const chrome = $derived(
    `${Number(session.ready)}:${Number(focus)}:${Number(scenesOpen)}:${Number(controlsOpen)}:${session.workspace.activeLayoutId}`,
  );

  function retarget() {
    applying = true;
    frozen = untrack(() => session.workspace.production);
    epoch = untrack(() => epoch) + 1;
  }

  function onStageLayout(reported: number[]) {
    if (applying || focus) return;
    session.saveProductionLayout({
      ...session.workspace.production,
      stage: mergeProductionStage(session.workspace.production.stage, reported),
    });
  }

  function onRowsLayout(reported: number[]) {
    if (applying || focus) return;
    session.saveProductionLayout({
      ...session.workspace.production,
      rows: mergeProductionRows(session.workspace.production.rows, reported),
    });
  }

  function onDocksLayout(reported: number[]) {
    if (applying || focus) return;
    session.saveProductionLayout({
      ...session.workspace.production,
      docks: mergeProductionDocks(session.workspace.production.docks, reported, scenesOpen, controlsOpen),
    });
  }

  function dockSize(index: 0 | 1 | 2): number {
    const sizes = frozen.docks;
    if (scenesOpen && controlsOpen) return sizes[index];
    if (!scenesOpen && controlsOpen) {
      if (index === 1) return (sizes[1] / (100 - sizes[0])) * 100;
      if (index === 2) return (sizes[2] / (100 - sizes[0])) * 100;
    }
    if (scenesOpen && !controlsOpen) {
      if (index === 0) return (sizes[0] / (100 - sizes[2])) * 100;
      if (index === 1) return (sizes[1] / (100 - sizes[2])) * 100;
    }
    return 100;
  }

  function toggleDock(panelId: "service" | "controls") {
    session.togglePanel(panelId);
  }

  function resetWorkspace() {
    session.resetActiveLayout();
    retarget();
  }

  $effect(() => {
    chrome;
    if (!chromeReady) {
      chromeReady = true;
      frozen = untrack(() => session.workspace.production);
      return;
    }
    retarget();
  });

  $effect(() => {
    epoch;
    queueMicrotask(() => {
      applying = false;
    });
  });

  $effect(() => {
    if (activeScene && renameDraft !== activeScene.name && document.activeElement?.getAttribute("aria-label") !== "Scene name") {
      renameDraft = activeScene.name;
    }
    if (selectedLayerId && activeScene && !activeScene.layers.some((layer) => layer.id === selectedLayerId)) {
      selectedLayerId = activeScene.layers[0]?.id ?? null;
    }
  });

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

  function pickScene(id: string) {
    const next = scenes.find((entry) => entry.id === id);
    if (!next) return;
    selectedLayerId = next.layers[0]?.id ?? null;
    session.previewLook(next);
  }

  function newScene() {
    const scene = session.createSceneLook(`Scene ${scenes.length + 1}`);
    selectedLayerId = scene.layers[0]?.id ?? null;
    renameDraft = scene.name;
  }

  function removeActiveScene() {
    if (!activeScene || activeScene.locked) return;
    session.deleteLook(activeScene.id);
    selectedLayerId = null;
  }

  function commitSceneName() {
    if (!activeScene || activeScene.locked) return;
    const next = renameComposition(activeScene, renameDraft);
    if (next === activeScene) return;
    session.editSceneLook(next);
  }

  function toggleSceneLock() {
    if (!activeScene) return;
    session.setSceneLocked(activeScene.id, !activeScene.locked);
  }

  function mutate(next: Composition) {
    if (!activeScene || activeScene.locked) return;
    session.editSceneLook(next);
  }

  function ensureScene(): Composition {
    return activeScene ?? session.createSceneLook(`Scene ${scenes.length + 1}`);
  }

  function pickType(type: SourceKind) {
    typeMenu = false;
    adding = type;
    if (type === "camera") void session.loadCameras();
  }

  function createNamed(name: string) {
    if (!adding) return;
    editing = {
      layerId: null,
      sourceKey: null,
      name,
      fields: defaultFields(adding, { cameras: session.cameras }),
      readonly: false,
      notice: null,
    };
    adding = null;
  }

  function pickExisting(id: string) {
    const scene = ensureScene();
    selectedLayerId = session.addExistingSourceToScene(scene, id) ?? selectedLayerId;
    adding = null;
  }

  function openProperties(layer: CompositionLayer) {
    const fields = fieldsFromSource(layer.source);
    if (!fields) return;
    if (fields.type === "camera") void session.loadCameras();
    const blocked = layer.sourceKey ? session.lockedScenesUsing(layer.sourceKey) : [];
    selectedLayerId = layer.id;
    editing = {
      layerId: layer.id,
      sourceKey: layer.sourceKey ?? null,
      name: layer.name,
      fields,
      readonly: sceneLocked || blocked.length > 0,
      notice: sceneLocked
        ? "This scene is locked. Unlock it to edit sources."
        : blocked.length
          ? `Used in locked scene “${blocked[0]}” — unlock to edit.`
          : null,
    };
  }

  function saveProperties(name: string, fields: SourceFields) {
    if (!editing) return;
    const source = buildSource(fields);
    if (editing.layerId === null) {
      selectedLayerId = session.createSourceInScene(ensureScene(), name, source) ?? selectedLayerId;
    } else if (editing.sourceKey) {
      if (session.saveSharedSource(editing.sourceKey, name, source).length) return;
    } else if (activeScene) {
      session.linkLayerToNewSource(activeScene, editing.layerId, name, source);
    }
    editing = null;
  }

  function removeSelectedSource() {
    if (!activeScene || sceneLocked || !selectedLayer) return;
    session.removeSceneLayer(activeScene, selectedLayer.id);
    selectedLayerId = null;
  }

  async function addScriptureLayer(event?: Event) {
    event?.preventDefault();
    if (sceneLocked || !query.trim()) return;
    const fields = await session.scriptureFields(query);
    if (!fields || fields.type !== "scripture") {
      session.message = "Reference not found.";
      return;
    }
    selectedLayerId = session.createSourceInScene(ensureScene(), fields.reference, buildSource(fields)) ?? selectedLayerId;
    query = "";
  }
</script>

<div class="prod" class:focus class:looks={looksOpen}>
  <header class="prod-bar">
    <DeskSwitcher />
    <p class="desk-title">Production Desk</p>
    <div class="prod-actions">
      <OutputControls compact />
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip="Send from this window after you Take" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
      {#if looksOpen}
        <button type="button" class="desk-btn primary" data-tip="Send Preview to Program" onclick={() => void transition()}>
          <Icon name="play" size={16} /> TAKE
        </button>
        <button type="button" class="desk-btn" data-tip="Cut Preview to Program" onclick={() => session.cut()}>
          <Icon name="scissors" size={16} /> CUT
        </button>
      {/if}
    </div>
    <nav class="prod-tools" aria-label="Workspace">
      <button type="button" class="desk-btn icon" class:on={looksOpen} aria-pressed={looksOpen} aria-label={looksOpen ? "Hide Looks" : "Show Looks"} data-tip={looksOpen ? "Hide Looks" : "Looks — compositions stay on Preview until TAKE"} onclick={() => (looksOpen = !looksOpen)}>
        <Icon name="layout" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={focus} aria-pressed={focus} aria-label={focus ? "Leave focus" : "Focus Preview and Program"} data-tip={focus ? "Leave focus" : "Focus Preview and Program"} onclick={() => session.savePew({ focus: !focus })}>
        <Icon name="focus" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={scenesOpen} aria-pressed={scenesOpen} aria-label={scenesOpen ? "Hide scenes" : "Show scenes"} data-tip={scenesOpen ? "Hide scenes" : "Show scenes"} onclick={() => toggleDock("service")}>
        <Icon name="studio" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={controlsOpen} aria-pressed={controlsOpen} aria-label={controlsOpen ? "Hide controls" : "Show controls"} data-tip={controlsOpen ? "Hide controls" : "Show controls"} onclick={() => toggleDock("controls")}>
        <Icon name="list" size={16} />
      </button>
      <button type="button" class="desk-btn icon" aria-label="Reset workspace" data-tip="Reset workspace" onclick={resetWorkspace}>
        <Icon name="reset" size={16} />
      </button>
      <button type="button" class="desk-btn icon" aria-label="Settings" data-tip="Settings" onclick={() => session.openSettings("appearance")}>
        <Icon name="settings" size={16} />
      </button>
    </nav>
  </header>

  {#if looksOpen}
    <div class="prod-looks">
      <CompositionPane />
    </div>
  {:else}
  {#key epoch}
  <PaneGroup class="rows" direction="vertical" onLayoutChange={onRowsLayout}>
  <Pane defaultSize={focus ? 100 : frozen.rows[0]} minSize={35} order={1}>
  <PaneGroup class="studio" direction="horizontal" onLayoutChange={onStageLayout}>
    <Pane defaultSize={frozen.stage[0]} minSize={20} order={1}>
    <section class="pane preview">
      <header>
        <span class="kicker">Preview</span>
        <span class="meta">{sceneName}</span>
      </header>
      <div class="well"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
      <footer>
        <span>{previewLabel}</span>
        <button type="button" class="desk-btn" data-tip="Theme" onclick={() => (session.settingsOpen = true)}>Properties</button>
      </footer>
    </section>
    </Pane>
    <PaneResizer />
    <Pane defaultSize={frozen.stage[1]} minSize={12} maxSize={28} order={2}>
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
      <TimerControls />
    </aside>
    </Pane>
    <PaneResizer />
    <Pane defaultSize={frozen.stage[2]} minSize={20} order={3}>
    <section class="pane program" class:on-air={displayLive}>
      <header>
        <span class="kicker program">{#if displayLive}<span class="pip"></span>{/if}Program</span>
        <span class="meta">{programLabel}</span>
      </header>
      <div class="well"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
      <footer>
        <span>{session.live.program.model.reference || "Audience sees this frame."}</span>
      </footer>
    </section>
    </Pane>
  </PaneGroup>
  </Pane>

  {#if !focus}
    <PaneResizer />
    <Pane defaultSize={frozen.rows[1]} minSize={12} maxSize={60} order={2}>
    <PaneGroup class="docks" direction="horizontal" onLayoutChange={onDocksLayout}>
      {#if scenesOpen}
        <Pane defaultSize={dockSize(0)} minSize={15} order={1}>
        <section class="dock">
          <header><Icon name="studio" size={16} /> Scenes</header>
          <div class="list">
            {#if scenes.length === 0}
              <button type="button" onclick={newScene}>New scene</button>
            {/if}
            {#each scenes as entry (entry.id)}
              <button type="button" class:on={activeScene?.id === entry.id} onclick={() => pickScene(entry.id)}>
                {entry.name}{entry.locked ? " · locked" : ""}
              </button>
            {/each}
          </div>
          {#if activeScene}
            <label class="scene-name">
              Name
              <input
                aria-label="Scene name"
                bind:value={renameDraft}
                disabled={sceneLocked}
                onchange={commitSceneName}
              />
            </label>
          {/if}
          <footer class="bar">
            <button type="button" class="desk-btn icon" data-tip="Add scene" aria-label="Add scene" onclick={newScene}>
              <Icon name="plus" size={16} />
            </button>
            <button
              type="button"
              class="desk-btn"
              data-tip={sceneLocked ? "Unlock scene" : "Lock scene"}
              aria-label={sceneLocked ? "Unlock scene" : "Lock scene"}
              disabled={!activeScene}
              onclick={toggleSceneLock}
            >{sceneLocked ? "Unlock" : "Lock"}</button>
            <button
              type="button"
              class="desk-btn icon"
              data-tip="Remove scene"
              aria-label="Remove scene"
              disabled={!activeScene || sceneLocked}
              onclick={removeActiveScene}
            >
              <Icon name="minus" size={16} />
            </button>
          </footer>
        </section>
        </Pane>
        <PaneResizer />
      {/if}

      <Pane defaultSize={dockSize(1)} minSize={20} order={2}>
      <section class="dock">
        <header><Icon name="list" size={16} /> Sources</header>
        <div class="list">
          {#each sourceLayers as layer, index (layer.id)}
            <div
              class="source-row"
              class:dragging={dragId === layer.id}
              class:drop-before={dropIndex === index && dragId !== layer.id}
              role="listitem"
              draggable={!sceneLocked}
              ondragstart={(event) => {
                dragId = layer.id;
                event.dataTransfer?.setData("text/plain", layer.id);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              ondragover={(event) => {
                if (!dragId) return;
                event.preventDefault();
                dropIndex = index;
              }}
              ondragleave={() => {
                if (dropIndex === index) dropIndex = null;
              }}
              ondrop={(event) => {
                event.preventDefault();
                if (activeScene && dragId) mutate(moveLayerTo(activeScene, dragId, index));
                dragId = null;
                dropIndex = null;
              }}
              ondragend={() => {
                dragId = null;
                dropIndex = null;
              }}
            >
              <button
                type="button"
                class:on={selectedLayer?.id === layer.id}
                data-tip="Double-click for properties"
                onclick={() => (selectedLayerId = layer.id)}
                ondblclick={() => openProperties(layer)}
              >
                <span>{layer.name}</span>
                <span class="kind">{layer.source.type}{layer.sourceKey ? " · shared" : ""}{layer.visible ? "" : " · hidden"}{layer.locked ? " · locked" : ""}</span>
              </button>
              {#if fieldsFromSource(layer.source)}
                <button type="button" class="desk-btn ghost icon" aria-label="Source properties" data-tip="Properties" onclick={() => openProperties(layer)}>
                  <Icon name="settings" size={14} />
                </button>
              {/if}
              {#if activeScene && !sceneLocked}
                <button type="button" class="desk-btn ghost" aria-label="Move source up" onclick={() => mutate(reorderLayers(activeScene, layer.id, 1))}>↑</button>
                <button type="button" class="desk-btn ghost" aria-label="Move source down" onclick={() => mutate(reorderLayers(activeScene, layer.id, -1))}>↓</button>
                <button
                  type="button"
                  class="desk-btn ghost"
                  aria-label={layer.visible ? "Hide source" : "Show source"}
                  onclick={() => mutate(layer.visible ? hideLayer(activeScene, layer.id) : showLayer(activeScene, layer.id))}
                >{layer.visible ? "Hide" : "Show"}</button>
                <button
                  type="button"
                  class="desk-btn ghost"
                  aria-label={layer.locked ? "Unlock source" : "Lock source"}
                  onclick={() => mutate(setLayerLocked(activeScene, layer.id, !layer.locked))}
                >{layer.locked ? "Unlock" : "Lock"}</button>
              {/if}
            </div>
          {/each}
          {#if !activeScene}
            <p class="empty">Select or create a scene.</p>
          {:else if sourceLayers.length === 0}
            <p class="empty">No sources yet.</p>
          {/if}
        </div>
        <form class="add" onsubmit={(event) => void addScriptureLayer(event)}>
          <input
            aria-label="Add scripture"
            placeholder="John 3:16"
            bind:value={query}
            disabled={sceneLocked}
            data-tip="Add scripture as a layer on this scene (Preview only)."
          />
          <button type="button" class="desk-btn" disabled={sceneLocked} data-tip="Add scripture layer" onclick={() => void addScriptureLayer()}>Add</button>
        </form>
        <footer class="bar source-add">
          {#if typeMenu}
            <div class="type-menu" role="menu" aria-label="Source type">
              {#each SOURCE_KINDS as kind (kind.type)}
                <button type="button" role="menuitem" onclick={() => pickType(kind.type)}>{kind.label}</button>
              {/each}
            </div>
          {/if}
          <button
            type="button"
            class="desk-btn icon"
            class:on={typeMenu}
            aria-label="Add source"
            aria-haspopup="menu"
            aria-expanded={typeMenu}
            data-tip="Add source"
            disabled={sceneLocked}
            onclick={() => (typeMenu = !typeMenu)}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            class="desk-btn icon"
            aria-label="Remove source"
            data-tip="Remove source from this scene"
            disabled={sceneLocked || !selectedLayer}
            onclick={removeSelectedSource}
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            type="button"
            class="desk-btn icon"
            aria-label="Properties of selected source"
            data-tip="Properties"
            disabled={!selectedLayer || !fieldsFromSource(selectedLayer.source)}
            onclick={() => selectedLayer && openProperties(selectedLayer)}
          >
            <Icon name="settings" size={16} />
          </button>
        </footer>
      </section>
      </Pane>

      {#if controlsOpen}
        <PaneResizer />
        <Pane defaultSize={dockSize(2)} minSize={15} order={3}>
        <section class="dock">
          <header><Icon name="settings" size={16} /> Controls</header>
          <div class="controls">
            <p class="studio-mode">Studio — select stays on Preview</p>
            <div class="voice-row">
              <button
                type="button"
                class="desk-btn"
                class:on={session.voice.status === "listening" || session.voice.status === "starting"}
                aria-pressed={session.voice.status === "listening" || session.voice.status === "starting"}
                data-tip="Voice: say “Studio next”, “Studio take” (needs Live voice commands), “Studio show John 3 verse 16”."
                onclick={() => void session.toggleVoice()}
              >
                <Icon name={session.voice.status === "listening" ? "mic-off" : "mic"} size={16} />
                {session.voice.status === "starting" ? "Starting…" : session.voice.status === "listening" ? "Stop listening" : "Listen"}
              </button>
            </div>
            {#if session.voice.status !== "idle"}<VoiceStatus compact />{/if}
            <label class="transition-select">
              Transition
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
                aria-label="Transition duration in milliseconds"
                onchange={(event) => {
                  duration = Number(event.currentTarget.value) || 0;
                  rememberTransition();
                }}
              />
              <span>ms</span>
            </label>
            <div class="control-actions">
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
            <button type="button" class="desk-btn" data-tip="Settings" onclick={() => session.openSettings("appearance")}>Settings</button>
          </div>
        </section>
        </Pane>
      {/if}
    </PaneGroup>
    </Pane>
  {/if}
  </PaneGroup>
  {/key}
  {/if}
</div>

<svelte:window
  onpointerdown={(event) => {
    if (typeMenu && !(event.target as Element | null)?.closest?.(".source-add")) typeMenu = false;
  }}
  onkeydown={(event) => {
    if (typeMenu && event.key === "Escape") typeMenu = false;
  }}
/>

{#if adding}
  <AddSourceDialog type={adding} sources={session.sharedSources} oncreate={createNamed} onpick={pickExisting} onclose={() => (adding = null)} />
{/if}
{#if editing}
  <SourceProperties
    name={editing.name}
    fields={editing.fields}
    readonly={editing.readonly}
    notice={editing.notice}
    onsave={saveProperties}
    onclose={() => (editing = null)}
  />
{/if}

<style>
  .prod {
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 12px;
    overflow: hidden;
  }
  .prod.focus, .prod.looks { grid-template-rows: auto minmax(0, 1fr); }
  .prod-looks {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 0 12px 12px;
  }
  .prod-looks :global(.pb-songs) { height: 100%; }
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
    flex: none;
    min-width: 0;
    position: relative;
    z-index: 2;
    background: var(--panel);
  }
  .prod-tools { display: flex; align-items: center; gap: 4px; flex: none; }
  :global(.studio) {
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    padding: var(--gap) var(--panel-pad) 0;
  }
  :global(.studio [data-pane]) { padding: 0 4px; }
  .pane, .dock {
    height: 100%;
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
  :global(.docks) {
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    padding: 0 var(--panel-pad) var(--gap);
  }
  :global(.docks [data-pane]) { padding: 0 4px; }
  .prod :global([data-pane-group]) { width: 100%; height: 100%; }
  .prod :global([data-pane]) { min-width: 0; min-height: 0; overflow: hidden; }
  .prod :global([data-pane-resizer]) {
    flex: 0 0 8px;
    position: relative;
    background: transparent;
  }
  .prod :global([data-pane-resizer][data-direction="horizontal"]) { cursor: col-resize; }
  .prod :global([data-pane-resizer][data-direction="vertical"]) { cursor: row-resize; }
  .prod :global([data-pane-resizer]::after) {
    content: "";
    position: absolute;
    left: 3px;
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 2px;
    background: var(--line);
  }
  .prod :global([data-pane-resizer][data-direction="vertical"]::after) {
    left: 10px;
    right: 10px;
    top: 3px;
    bottom: auto;
    width: auto;
    height: 2px;
  }
  .prod :global([data-pane-resizer]:hover::after),
  .prod :global([data-pane-resizer][data-active]::after) { background: var(--accent); }
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
  .source-row { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; border-top: 2px solid transparent; }
  .source-row[draggable="true"] { cursor: grab; }
  .source-row.dragging { opacity: 0.45; }
  .source-row.drop-before { border-top-color: var(--accent); }
  .source-row > button:first-child { flex: 1 1 8rem; display: flex; flex-direction: column; align-items: flex-start; padding: 4px 8px; min-height: 36px; }
  .source-row .kind { font-size: 11px; color: var(--muted); }
  .scene-name { display: flex; flex-direction: column; gap: 4px; padding: 6px; font-size: 11px; color: var(--muted); }
  .scene-name input { height: var(--control-h); border-radius: var(--radius-control); border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 8px; }
  .empty { margin: 8px; color: var(--muted); font-size: 12px; }
  .source-add { flex-wrap: wrap; position: relative; }
  .type-menu {
    position: absolute;
    left: 6px;
    bottom: calc(100% + 4px);
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(2, minmax(96px, 1fr));
    gap: 2px;
    padding: 4px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .type-menu button {
    text-align: left;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--ink);
    padding: 6px 8px;
  }
  .type-menu button:hover, .type-menu button:focus-visible { background: color-mix(in srgb, var(--ink) 8%, transparent); }
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
  .duration { display: flex; align-items: center; gap: 6px; padding: 8px; color: var(--muted); }
  .duration input { width: 72px; flex: none; }
  .controls { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px; overflow: auto; }
  .studio-mode { margin: 0; color: var(--muted); }
  .voice-row { display: flex; gap: 6px; }
  .voice-row .desk-btn { flex: 1; }
  .transition-select { display: flex; flex-direction: column; gap: 4px; padding: 4px 8px; color: var(--muted); }
  .control-actions { display: flex; flex-wrap: wrap; gap: 4px; }
  .control-actions .desk-btn { flex: 1 1 72px; }
  .prod :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 1440px) {
    .desk-title { display: none; }
  }
  @media (max-width: 1280px) {
    .prod-actions :global(.output-controls button:not(:first-child):not(:last-child)) { display: none; }
  }
</style>
