<script lang="ts">
  import VideoControls from "../VideoControls.svelte";
  import LookScripture from "./LookScripture.svelte";
  import AlertsDialog from "../AlertsDialog.svelte";
  import OverlaysDialog from "../OverlaysDialog.svelte";
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
    SCENE_COLORS,
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
  import OutputMenu from "../OutputMenu.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import Screen from "../Screen.svelte";
  import { Pane, PaneGroup, PaneResizer } from "paneforge";
  import { dockShare, mergeProductionDocks, mergeProductionRows, mergeProductionStage } from "../../workspace/production";
  import MediaDock from "./MediaDock.svelte";
  import SourcePicker from "./SourcePicker.svelte";
  import NewSceneDialog from "./NewSceneDialog.svelte";
  import { sourceMeta } from "./source-meta";

  let query = $state("");
  let kind = $state<"cut" | "fade">("fade");
  let duration = $state(300);
  let synced = false;
  let looksOpen = $state(false);
  let selectedLayerId = $state<string | null>(null);
  let renameDraft = $state("");
  let typeMenu = $state(false);
  let newSceneOpen = $state(false);
  /** The scene being renamed in place (double-click its name). */
  let renamingId = $state<string | null>(null);
  let addSourceButton = $state<HTMLButtonElement | undefined>();
  /** Scenes list: drag-to-reorder (insertion index) and the folder color menu. */
  let sceneDragId = $state<string | null>(null);
  let sceneDrop = $state<number | null>(null);
  let colorFor = $state<string | null>(null);
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
  const mediaOpen = $derived(session.workspace.production.mediaOpen);
  const docksVisible = $derived<[boolean, boolean, boolean, boolean]>([scenesOpen, true, mediaOpen, controlsOpen]);
  const chrome = $derived(
    `${Number(session.ready)}:${Number(focus)}:${Number(scenesOpen)}:${Number(mediaOpen)}:${Number(controlsOpen)}:${session.workspace.activeLayoutId}`,
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
      docks: mergeProductionDocks(session.workspace.production.docks, reported, docksVisible),
    });
  }

  function dockSize(index: 0 | 1 | 2 | 3): number {
    return dockShare(frozen.docks, docksVisible, index);
  }

  function toggleMedia() {
    session.saveProductionLayout({ ...session.workspace.production, mediaOpen: !mediaOpen });
  }

  function addMediaSource(name: string, fields: SourceFields) {
    if (sceneLocked) return;
    selectedLayerId = session.createSourceInScene(ensureScene(), name, buildSource(fields)) ?? selectedLayerId;
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
    newSceneOpen = true;
  }

  async function createScene(name: string, color: string | null, templateId: string | null) {
    newSceneOpen = false;
    const scene = await session.createSceneFromLayout(name, color, templateId);
    selectedLayerId = scene.layers[0]?.id ?? null;
    renameDraft = scene.name;
  }

  function renameScene(entry: Composition, name: string) {
    renamingId = null;
    if (entry.locked || !name.trim() || name.trim() === entry.name) return;
    session.editSceneLook(renameComposition(entry, name.trim()));
  }

  /** A line under each source saying what it shows. */
  function sourceDetail(layer: Composition["layers"][number]): string {
    const payload = layer.source.payload;
    const candidates = [payload.reference, payload.heading, payload.label, payload.title, payload.mode, layer.source.title, payload.body?.replace(/\s+/g, " ").slice(0, 60)];
    const text = candidates.find((entry) => entry && entry.trim() && entry.trim() !== layer.name);
    return text ?? (sourceMeta(layer.source.type).blurb || layer.source.type);
  }

  /** Removing is two clicks: the first arms the button for three seconds, the second removes. */
  let armed = $state<"scene" | "source" | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  function arm(what: "scene" | "source"): boolean {
    if (armed === what) {
      armed = null;
      clearTimeout(armTimer);
      return true;
    }
    armed = what;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => (armed = null), 3000);
    return false;
  }

  function removeActiveScene() {
    if (!activeScene || activeScene.locked || !arm("scene")) return;
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
    if (!activeScene || sceneLocked || !selectedLayer || !arm("source")) return;
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
  let alertsOpen = $state(false);
  let overlaysOpen = $state(false);
</script>

<div class="prod" class:focus class:looks={looksOpen}>
  <header class="prod-bar">
    <div class="prod-left">
      <DeskSwitcher compact />
      <nav class="prod-modes" aria-label="Production view">
        <button type="button" class:on={!looksOpen} aria-pressed={!looksOpen} data-tip="Scenes, sources and media — select stays on Preview" onclick={() => (looksOpen = false)}>Studio</button>
        <button type="button" class:on={looksOpen} aria-pressed={looksOpen} data-tip="Looks: compositions wait on Preview until you go live" onclick={() => (looksOpen = true)}>Looks</button>
      </nav>
    </div>
    <div class="prod-actions">
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip="Send to the audience from this window" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
      <OutputMenu />
      {#if looksOpen}
        <button type="button" class="desk-btn live" data-tip="Show Preview to the audience, with the chosen transition" onclick={() => void transition()}>
          <Icon name="play" size={16} /> GO LIVE
        </button>
        <button type="button" class="desk-btn" data-tip="Switch instantly, no transition" onclick={() => session.cut()}>
          <Icon name="scissors" size={16} /> CUT
        </button>
      {/if}
    </div>
    <nav class="prod-tools" aria-label="Workspace">
      <ToolMenu label="View" tip="Panels and focus" tour="view">
        {#snippet trigger()}<Icon name="view" size={16} />{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitemcheckbox" aria-checked={scenesOpen} onclick={() => toggleDock("service")}><Icon name="studio" size={16} /> Scenes</button>
          <button type="button" role="menuitemcheckbox" aria-checked={mediaOpen} onclick={toggleMedia}><Icon name="media" size={16} /> Media</button>
          <button type="button" role="menuitemcheckbox" aria-checked={controlsOpen} onclick={() => toggleDock("controls")}><Icon name="list" size={16} /> Controls</button>
          <button type="button" role="menuitemcheckbox" aria-checked={focus} onclick={() => { session.savePew({ focus: !focus }); close(); }}><Icon name="focus" size={16} /> Focus Preview and Program</button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" onclick={() => { resetWorkspace(); close(); }}><Icon name="reset" size={16} /> Reset workspace</button>
        {/snippet}
      </ToolMenu>
      <button
        type="button"
        class="desk-btn icon alerts-btn"
        class:on={!!session.alert}
        aria-pressed={!!session.alert}
        aria-label="Alerts"
        data-tip={session.alert ? `Alert on Program: ${session.alert.text}` : "Alert on Program (nursery, car lights…)"}
        onclick={() => (alertsOpen = true)}
      ><Icon name="alerts" size={16} /></button>
      <button
        type="button"
        class="desk-btn icon"
        class:on={session.workspace.overlays.some((overlay) => overlay.on)}
        aria-label="Overlays"
        data-tip={session.workspace.overlays.some((overlay) => overlay.on) ? "Overlays on the screen" : "Overlays: logo, ticker, clock, lower third"}
        onclick={() => (overlaysOpen = true)}
      ><Icon name="layers" size={16} /></button>
      <button type="button" class="desk-btn icon" data-tour="tours" aria-label="Show me around" data-tip="Lost? Guided tours of every page" onclick={() => (session.tourHubOpen = true)}><Icon name="help" size={16} /></button>
      <ToolMenu label="More" tip="Displays, look and settings">
        {#snippet trigger()}<Icon name="more" size={16} />{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitem" onclick={() => { session.openSettings("displays"); close(); }}><Icon name="outputs" size={16} /> Displays…</button>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("themes"); close(); }}><Icon name="themes" size={16} /> Themes…</button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" onclick={() => { session.openSettings("appearance"); close(); }}><Icon name="settings" size={16} /> Settings… <span class="menu-key">⌘,</span></button>
        {/snippet}
      </ToolMenu>
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
      <div class="well"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint="Nothing on Preview yet. Click a scene to put it here." /></div>
      <footer>
        <span>{previewLabel}</span>
        {#if session.canSwapPreview()}
          <button type="button" class="desk-btn" data-tip="Mirror the layout left to right" onclick={() => session.swapPreviewSides()}><Icon name="transition" size={14} /> Swap sides</button>
        {/if}
        <button type="button" class="desk-btn" data-tip="Theme" onclick={() => (session.settingsOpen = true)}>Properties</button>
      </footer>
    </section>
    </Pane>
    <PaneResizer />
    <Pane defaultSize={frozen.stage[1]} minSize={12} maxSize={28} order={2}>
    <aside class="bridge" aria-label="Transition">
      <p class="flow">Preview <Icon name="transition" size={16} /> Program</p>
      <button type="button" class="desk-btn live" data-tip="Show Preview to the audience, with the chosen transition" onclick={() => void transition()}>
        <Icon name="play" size={16} /> GO LIVE
      </button>
      <button type="button" class="desk-btn" data-tip="Switch instantly, no transition" onclick={() => session.cut()}>
        <Icon name="scissors" size={16} /> CUT
      </button>
      <button type="button" class="desk-btn" data-tip="Fade Preview in over the set duration" onclick={() => void fade(duration)}>
        FADE
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
      <LookScripture />
      <TimerControls />
      <VideoControls />
    </aside>
    </Pane>
    <PaneResizer />
    <Pane defaultSize={frozen.stage[2]} minSize={20} order={3}>
    <section class="pane program" class:on-air={displayLive}>
      <header>
        <span class="kicker program">{#if displayLive}<span class="pip"></span>{/if}Program</span>
        <span class="meta">{programLabel}</span>
      </header>
      <div class="well"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint="The audience sees nothing yet. GO LIVE sends Preview here." /></div>
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
        <section class="dock" data-tour="scenes">
          <header>
            <Icon name="studio" size={16} /> Scenes <span class="count">{scenes.length}</span>
            <button type="button" class="dock-add" onclick={newScene} aria-label="New scene"><Icon name="plus" size={14} /> New</button>
          </header>
          <div
            class="list"
            role="list"
            ondragover={(event) => {
              if (!sceneDragId || event.target !== event.currentTarget) return;
              event.preventDefault();
              sceneDrop = scenes.length;
            }}
            ondrop={(event) => {
              if (!sceneDragId || event.target !== event.currentTarget) return;
              event.preventDefault();
              session.moveScene(sceneDragId, scenes.length);
              sceneDragId = null;
              sceneDrop = null;
            }}
          >
            {#if scenes.length === 0}
              <button type="button" class="empty-cta" onclick={newScene}>
                <Icon name="plus" size={18} />
                <span><strong>Make your first scene</strong><em>A saved screen: a camera, a verse, a countdown.</em></span>
              </button>
            {/if}
            {#each scenes as entry, index (entry.id)}
              <div
                class="scene-row"
                class:dragging={sceneDragId === entry.id}
                class:drop-before={sceneDrop === index && sceneDragId !== entry.id}
                class:drop-after={sceneDrop === scenes.length && index === scenes.length - 1 && sceneDragId !== entry.id}
                role="listitem"
                draggable="true"
                ondragstart={(event) => {
                  sceneDragId = entry.id;
                  colorFor = null;
                  event.dataTransfer?.setData("text/plain", entry.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                }}
                ondragover={(event) => {
                  if (!sceneDragId) return;
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  sceneDrop = event.clientY > box.top + box.height / 2 ? index + 1 : index;
                }}
                ondrop={(event) => {
                  event.preventDefault();
                  if (sceneDragId && sceneDrop !== null) session.moveScene(sceneDragId, sceneDrop);
                  sceneDragId = null;
                  sceneDrop = null;
                }}
                ondragend={() => {
                  sceneDragId = null;
                  sceneDrop = null;
                }}
              >
                <button
                  type="button"
                  class="grip"
                  aria-label={`Reorder ${entry.name}. Drag, or press arrow up or down`}
                  data-tip="Drag to reorder"
                  onkeydown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    session.moveScene(entry.id, event.key === "ArrowUp" ? index - 1 : index + 2);
                    const target = event.currentTarget;
                    requestAnimationFrame(() => target.focus());
                  }}
                ><Icon name="grip" size={16} /></button>
                <button type="button" class="pick scene-pick" class:on={activeScene?.id === entry.id} style:--scene={entry.color ?? "var(--line)"} onclick={() => pickScene(entry.id)} ondblclick={() => !entry.locked && (renamingId = entry.id)}>
                  <span class="scene-thumb" aria-hidden="true">
                    {#each entry.layers.filter((layer) => layer.visible) as layer (layer.id)}
                      <i style:left="{layer.bounds.x}%" style:top="{layer.bounds.y}%" style:width="{layer.bounds.w}%" style:height="{layer.bounds.h}%" style:--tint={sourceMeta(layer.source.type).color}></i>
                    {/each}
                    {#if session.live.program.sourceId?.includes(entry.id)}<b class="badge live">Live</b>{:else if activeScene?.id === entry.id}<b class="badge">Preview</b>{/if}
                  </span>
                  <span class="scene-text">
                    {#if renamingId === entry.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <input class="scene-rename" aria-label="Scene name" value={entry.name} autofocus onclick={(event) => event.stopPropagation()} onkeydown={(event) => { if (event.key === "Enter") renameScene(entry, event.currentTarget.value); if (event.key === "Escape") renamingId = null; }} onblur={(event) => renameScene(entry, event.currentTarget.value)} />
                    {:else}
                      <span class="scene-label">{#if entry.locked}<Icon name="lock" size={11} />{/if}{entry.name}</span>
                    {/if}
                    <span class="scene-sub">{entry.layers.length} source{entry.layers.length === 1 ? "" : "s"}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="desk-btn ghost icon toggle"
                  aria-label={`Color for ${entry.name}`}
                  aria-haspopup="menu"
                  aria-expanded={colorFor === entry.id}
                  data-tip="Folder color"
                  onclick={() => (colorFor = colorFor === entry.id ? null : entry.id)}
                ><span class="swatch" class:none={!entry.color} style:background={entry.color ?? "transparent"}></span></button>
                <button
                  type="button"
                  class="desk-btn ghost icon toggle"
                  class:on={entry.locked}
                  aria-label={entry.locked ? `Unlock ${entry.name}` : `Lock ${entry.name}`}
                  aria-pressed={entry.locked}
                  data-tip={entry.locked ? "Locked — click to unlock" : "Unlocked — click to lock"}
                  onclick={() => session.setSceneLocked(entry.id, !entry.locked)}
                ><Icon name={entry.locked ? "lock" : "lock-open"} size={16} /></button>
                {#if activeScene?.id === entry.id && !entry.locked}
                  <button
                    type="button"
                    class="desk-btn ghost icon toggle"
                    class:armed={armed === "scene"}
                    aria-label={armed === "scene" ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`}
                    data-tip={armed === "scene" ? "Click again to delete" : "Delete scene"}
                    onclick={removeActiveScene}
                  ><Icon name="trash" size={14} /></button>
                {/if}
                {#if colorFor === entry.id}
                  <div
                    class="swatches"
                    role="menu"
                    tabindex="-1"
                    aria-label={`Folder color for ${entry.name}`}
                    onkeydown={(event) => event.key === "Escape" && (colorFor = null)}
                  >
                    {#each SCENE_COLORS as color (color)}
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={entry.color === color}
                        aria-label={`Color ${color}`}
                        class="swatch-pick"
                        class:on={entry.color === color}
                        style:background={color}
                        onclick={() => {
                          session.setSceneColor(entry.id, color);
                          colorFor = null;
                        }}
                      ></button>
                    {/each}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={!entry.color}
                      class="swatch-pick none"
                      aria-label="No color"
                      onclick={() => {
                        session.setSceneColor(entry.id, null);
                        colorFor = null;
                      }}
                    ></button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
        </Pane>
        <PaneResizer />
      {/if}

      <Pane defaultSize={dockSize(1)} minSize={20} order={2}>
      <section class="dock" data-tour="sources">
        <header>
          <Icon name="layers" size={16} /> Sources {#if activeScene}<span class="count">{activeScene.name}</span>{/if}
          <button type="button" class="dock-add" disabled={sceneLocked} onclick={() => (typeMenu = true)} aria-label="Add source"><Icon name="plus" size={14} /> Add</button>
        </header>
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
              {#if activeScene && !sceneLocked}
                <button
                  type="button"
                  class="grip"
                  aria-label={`Reorder ${layer.name}. Drag, or press arrow up or down`}
                  data-tip="Drag to reorder"
                  onkeydown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    mutate(reorderLayers(activeScene, layer.id, event.key === "ArrowUp" ? 1 : -1));
                    const target = event.currentTarget;
                    requestAnimationFrame(() => target.focus());
                  }}
                ><Icon name="grip" size={16} /></button>
              {/if}
              <button
                type="button"
                class="pick source-pick"
                class:on={selectedLayer?.id === layer.id}
                class:hidden-layer={!layer.visible}
                data-tip="Double-click for properties"
                style:--tint={sourceMeta(layer.source.type).color}
                onclick={() => (selectedLayerId = layer.id)}
                ondblclick={() => openProperties(layer)}
              >
                <span class="source-icon"><Icon name={sourceMeta(layer.source.type).icon} size={15} /></span>
                <span class="source-text">
                  <span class="source-name">{layer.name}</span>
                  <span class="kind">{sourceDetail(layer)}{layer.sourceKey ? " · shared" : ""}{layer.visible ? "" : " · hidden"}</span>
                </span>
              </button>
              {#if fieldsFromSource(layer.source)}
                <button type="button" class="desk-btn ghost icon" aria-label="Source properties" data-tip="Properties" onclick={() => openProperties(layer)}>
                  <Icon name="settings" size={14} />
                </button>
              {/if}
              {#if activeScene && !sceneLocked}
<button
                  type="button"
                  class="desk-btn ghost icon toggle eye"
                  class:off={!layer.visible}
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  aria-pressed={!layer.visible}
                  data-tip={layer.visible ? "Hide" : "Show"}
                  onclick={() => mutate(layer.visible ? hideLayer(activeScene, layer.id) : showLayer(activeScene, layer.id))}
                ><Icon name={layer.visible ? "eye" : "eye-off"} size={16} /></button>
                <button
                  type="button"
                  class="desk-btn ghost icon toggle"
                  class:on={layer.locked}
                  aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  aria-pressed={layer.locked}
                  data-tip={layer.locked ? "Locked — click to unlock" : "Unlocked — click to lock"}
                  onclick={() => mutate(setLayerLocked(activeScene, layer.id, !layer.locked))}
                ><Icon name={layer.locked ? "lock" : "lock-open"} size={16} /></button>
                {#if selectedLayer?.id === layer.id}
                  <button
                    type="button"
                    class="desk-btn ghost icon toggle"
                    class:armed={armed === "source"}
                    aria-label={armed === "source" ? `Confirm remove ${layer.name}` : `Remove ${layer.name}`}
                    data-tip={armed === "source" ? "Click again to remove" : "Remove from this scene"}
                    onclick={removeSelectedSource}
                  ><Icon name="trash" size={14} /></button>
                {/if}
              {/if}
            </div>
          {/each}
          {#if !activeScene}
            <p class="empty">Select or create a scene.</p>
          {:else if sourceLayers.length === 0}
            <button type="button" class="empty-cta" disabled={sceneLocked} onclick={() => (typeMenu = true)}>
              <Icon name="plus" size={18} />
              <span><strong>Add the first source</strong><em>A camera, a verse, lyrics, a timer or a picture.</em></span>
            </button>
          {/if}
        </div>
      </section>
      </Pane>

      {#if mediaOpen}
        <PaneResizer />
        <Pane defaultSize={dockSize(2)} minSize={15} order={3}>
        <section class="dock" data-tour="media">
          <header><Icon name="media" size={16} /> Media</header>
          <MediaDock locked={sceneLocked} onadd={addMediaSource} />
        </section>
        </Pane>
      {/if}

      {#if controlsOpen}
        <PaneResizer />
        <Pane defaultSize={dockSize(3)} minSize={15} order={4}>
        <section class="dock" data-tour="controls">
          <header><Icon name="settings" size={16} /> Controls</header>
          <div class="controls">
            <div class="ctl-card">
              <span class="ctl-label">Transition for GO LIVE</span>
              <div class="seg" role="radiogroup" aria-label="Transition type">
                {#each [["fade", "Fade"], ["cut", "Cut"]] as [id, label] (id)}
                  <button type="button" role="radio" aria-checked={kind === id} class:on={kind === id} onclick={() => { kind = id === "cut" ? "cut" : "fade"; rememberTransition(); }}>{label}</button>
                {/each}
              </div>
              {#if kind === "fade"}
                <div class="seg small" role="radiogroup" aria-label="Fade length">
                  {#each [[250, "Quick"], [450, "Smooth"], [900, "Slow"]] as [ms, label] (ms)}
                    <button type="button" role="radio" aria-checked={duration === ms} class:on={duration === ms} onclick={() => { duration = Number(ms); rememberTransition(); }}>{label}</button>
                  {/each}
                  <label class="ms">
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
                    />ms
                  </label>
                </div>
              {/if}
            </div>
            <div class="ctl-card">
              <span class="ctl-label">Voice</span>
              <button
                type="button"
                class="desk-btn listen"
                class:on={session.voice.status === "listening" || session.voice.status === "starting"}
                aria-pressed={session.voice.status === "listening" || session.voice.status === "starting"}
                data-tip="Say “next verse”, “go live” (with Live voice commands on), or a reference like “John three sixteen”."
                onclick={() => void session.toggleVoice()}
              >
                <Icon name={session.voice.status === "listening" ? "mic-off" : "mic"} size={16} />
                {session.voice.status === "starting" ? "Starting…" : session.voice.status === "listening" ? "Stop listening" : "Listen"}
              </button>
              {#if session.voice.status !== "idle"}<VoiceStatus compact />{/if}
            </div>
            <p class="ctl-hint">Click a scene to put it on Preview. GO LIVE shows it to the audience.</p>
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
    if (colorFor && !(event.target as Element | null)?.closest?.(".swatches, .scene-row [aria-haspopup]")) colorFor = null;
  }}
  onkeydown={(event) => {
    if (colorFor && event.key === "Escape") colorFor = null;
  }}
/>

{#if typeMenu}
  <SourcePicker
    scene={activeScene?.name ?? "a new scene"}
    onpick={(type) => pickType(type)}
    onscripture={(reference) => { typeMenu = false; query = reference; void addScriptureLayer(); }}
    onclose={() => (typeMenu = false)}
  />
{/if}
{#if newSceneOpen}
  <NewSceneDialog suggested={`Scene ${scenes.length + 1}`} colors={SCENE_COLORS} oncreate={(name, color, template) => void createScene(name, color, template)} onclose={() => (newSceneOpen = false)} />
{/if}

{#if adding}
  <AddSourceDialog
    type={adding}
    sources={session.sharedSources}
    oncreate={createNamed}
    onpick={pickExisting}
    onclose={() => (adding = null)}
    returnTo={() => addSourceButton}
  />
{/if}
{#if editing}
  <SourceProperties
    name={editing.name}
    fields={editing.fields}
    readonly={editing.readonly}
    notice={editing.notice}
    onsave={saveProperties}
    onclose={() => (editing = null)}
    returnTo={() => addSourceButton}
  />
{/if}

{#if overlaysOpen}
  <OverlaysDialog onclose={() => (overlaysOpen = false)} />
{/if}
{#if alertsOpen}
  <AlertsDialog onclose={() => (alertsOpen = false)} />
{/if}

<style>
  .alerts-btn.on { background: #c8102e; border-color: #c8102e; color: #fff; }
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
    padding: var(--gap, 10px) 12px 12px;
  }
  .prod-bar {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    min-height: var(--chrome-h);
    padding: 6px var(--panel-pad);
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    position: relative;
    z-index: 5;
  }
  /* Same three groups as the Presenter Desk: where you are, what goes out, tools. */
  .prod-left { display: flex; align-items: center; gap: 10px; flex: none; }
  .prod-modes { display: flex; align-items: center; gap: 2px; flex: none; padding: 3px; border: 1px solid var(--line); border-radius: calc(var(--radius-control) + 3px); background: var(--field); }
  .prod-modes button { border: 0; background: transparent; color: var(--muted); border-radius: var(--radius-control); padding: 5px 14px; font-weight: 560; font-size: 14px; }
  .prod-modes button:hover:not(.on) { background: var(--desk); color: var(--ink); }
  .prod-modes button.on { background: var(--accent); color: white; }
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
  .prod-tools { display: flex; align-items: center; gap: 6px; margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--line); flex: none; }
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
    width: min(100cqw, calc(100cqh * var(--aspect, 1.7778)));
    height: min(100cqh, calc(100cqw / var(--aspect, 1.7778)));
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
    letter-spacing: 0;
    font-size: 12px;
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
  .dock header { justify-content: flex-start; gap: 6px; font-weight: 600; letter-spacing: 0; font-size: 12px; }
  .dock header .count { margin-left: 2px; padding: 1px 7px; border-radius: 999px; background: var(--field); color: var(--muted); font-weight: 600; letter-spacing: 0; text-transform: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dock-add { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; height: 26px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: inherit; font-size: 11px; font-weight: 700; letter-spacing: 0; text-transform: none; cursor: pointer; }
  .dock-add:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
  .dock-add:disabled { opacity: 0.4; cursor: default; }
  .list .empty-cta { display: flex !important; flex-direction: row !important; align-items: center; gap: 12px; margin: 6px; padding: 14px !important; border: 1px dashed var(--line) !important; border-radius: 12px; background: none; color: var(--muted); text-align: left; }
  .list .empty-cta:hover:not(:disabled) { border-color: var(--accent) !important; color: var(--ink); }
  .empty-cta span { display: grid; gap: 2px; }
  .empty-cta strong { color: var(--ink); font-size: 13px; }
  .empty-cta em { font-style: normal; font-size: 11px; }
  .scene-thumb { position: relative; flex: none; width: 54px; aspect-ratio: 16 / 9; border-radius: 5px; background: #0b0b0d; box-shadow: inset 0 0 0 2px var(--scene); overflow: hidden; }
  .scene-thumb i { position: absolute; border-radius: 2px; background: color-mix(in srgb, var(--tint) 60%, #111); outline: 1px solid rgba(0, 0, 0, 0.45); }
  .scene-text { flex: 1; display: grid; gap: 2px; min-width: 0; text-align: left; }
  .scene-label { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
  .scene-sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scene-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { position: absolute; left: 2px; bottom: 2px; z-index: 1; padding: 0 4px; border-radius: 4px; background: var(--accent); color: var(--on-accent); font-size: 8px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; line-height: 13px; }
  .badge.live { background: var(--live); color: #fff; }
  .scene-rename { height: 24px; padding: 0 6px; border: 1px solid var(--accent); border-radius: 6px; background: var(--field); color: var(--ink); font: inherit; font-weight: 600; min-width: 0; }
  /* Row tools appear on hover, focus or selection; what is switched on always shows. */
  .scene-row:not(:hover):not(:focus-within) > .desk-btn:not(.on):not(.armed) { display: none; }
  .scene-row:has(.scene-pick.on) > .desk-btn { display: inline-grid !important; }
  .source-row:not(:hover):not(:focus-within) > .desk-btn:not(.eye):not(.on):not(.armed) { display: none; }
  .source-row:has(.source-pick.on) > .desk-btn { display: inline-grid !important; }
  .scene-row > .desk-btn, .source-row > .desk-btn { width: 26px; min-width: 26px; height: 26px; padding: 0; }
  .source-pick { flex-direction: row !important; align-items: center !important; gap: 10px; }
  .source-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 8px; background: color-mix(in srgb, var(--tint) 18%, transparent); color: var(--tint); }
  .source-text { display: grid; gap: 1px; min-width: 0; }
  .source-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .armed { color: var(--live) !important; background: color-mix(in srgb, var(--live) 14%, transparent) !important; }
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
  .source-row .grip { display: grid; place-items: center; width: 22px; min-height: 36px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: grab; flex: none; }
  .source-row .grip:hover { color: var(--ink); background: var(--field); }
  .source-row .grip:active { cursor: grabbing; }
  .scene-row { position: relative; display: flex; gap: 2px; align-items: center; border-top: 2px solid transparent; border-bottom: 2px solid transparent; }
  .scene-row.dragging { opacity: 0.45; }
  .scene-row.drop-before { border-top-color: var(--accent); }
  .scene-row.drop-after { border-bottom-color: var(--accent); }
  .scene-row .grip { display: grid; place-items: center; width: 22px; min-height: 36px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: grab; flex: none; }
  .scene-row .grip:hover { color: var(--ink); background: var(--field); }
  .scene-row > .scene-pick { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: row; align-items: center; gap: 8px; min-height: 36px; padding: 4px 8px; }
  .scene-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-row .toggle { color: var(--muted); }
  .scene-row .toggle:hover { color: var(--ink); }
  .scene-row .toggle.on { color: var(--accent); }
  .swatch { width: 14px; height: 14px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent); }
  .swatch.none { background: linear-gradient(135deg, transparent 45%, var(--muted) 45% 55%, transparent 55%) !important; }
  .swatches { position: absolute; right: 4px; top: calc(100% + 2px); z-index: 4; display: grid; grid-template-columns: repeat(5, 26px); gap: 6px; padding: 8px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
  .swatches .swatch-pick { width: 26px; height: 26px; min-height: 0; padding: 0; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
  .swatches .swatch-pick.on { border-color: var(--ink); }
  .swatches .swatch-pick.none { background: linear-gradient(135deg, var(--field) 45%, var(--muted) 45% 55%, var(--field) 55%); border-color: var(--line); }
  .source-row .hidden-layer > span:first-child { opacity: 0.5; }
  .source-row .toggle { color: var(--muted); }
  .source-row .toggle:hover { color: var(--ink); }
  .source-row .toggle.on { color: var(--accent); }
  .source-row .toggle.off { color: color-mix(in srgb, var(--muted) 60%, transparent); }
  .desk-btn.armed { background: var(--live, #d92d20); border-color: var(--live, #d92d20); color: #fff; }
  .source-row.dragging { opacity: 0.45; }
  .source-row.drop-before { border-top-color: var(--accent); }
  .source-row > .pick { flex: 1 1 8rem; display: flex; flex-direction: column; align-items: flex-start; padding: 4px 8px; min-height: 36px; }
  .source-row .kind { font-size: 11px; color: var(--muted); }
  .empty { margin: 8px; color: var(--muted); font-size: 12px; }
  .controls { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: auto; }
  .ctl-card { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .ctl-label { font-size: 11px; font-weight: 700; color: var(--muted); }
  .seg { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .seg button { flex: 1; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; letter-spacing: normal; text-transform: none; cursor: pointer; }
  .seg button.on { background: var(--accent); color: var(--on-accent); }
  .seg.small button { height: 24px; font-size: 11px; }
  .ms { display: inline-flex; align-items: center; gap: 4px; padding: 0 4px; font-size: 11px; color: var(--muted); }
  .ms input { width: 56px; height: 24px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--ink); font: inherit; font-size: 11px; }
  .listen { justify-content: center; }
  .ctl-hint { margin: 0; padding: 0 2px; font-size: 11px; color: var(--muted); line-height: 1.45; }
  .prod :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
</style>
