<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { DISPLAY_WASHES, MOTIONS, gradientCss } from "../../domain/backgrounds";
  import { SCREEN_FONTS } from "../../domain/fonts";
  import { presentScripture } from "../../domain/present";
  import { factoryThemes } from "../../domain/theme";
  import type { PresentationModel, Theme, ThemeBackground } from "../../domain/types";
  import { isDesktop } from "../../platform/runtime";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";

  // Theme library: browse every look for the audience screen, preview it live, and (Premium)
  // edit or create one with color, gradient, animated, photo or video backgrounds.
  type Filter = "all" | "still" | "animated" | "media" | "mine";
  type Tab = "background" | "text" | "details";

  let filter = $state<Filter>("all");
  let tab = $state<Tab>("background");
  let selectedId = $state(session.workspace.themeId);
  let note = $state("");
  let importInput = $state<HTMLInputElement | undefined>();
  let mediaInput = $state<HTMLInputElement | undefined>();

  const factoryIds = new Set(factoryThemes().map((theme) => theme.id));
  const SAMPLE = [{ verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." }];

  const selected = $derived(session.themes.find((theme) => theme.id === selectedId) ?? session.theme());
  const canEdit = $derived(session.entitled("theme-library"));
  const isMine = (theme: Theme) => !factoryIds.has(theme.id);
  const kind = (theme: Theme) =>
    theme.background.type === "motion" ? "animated" : theme.background.type === "image" || theme.background.type === "video" ? "media" : "still";
  const shown = $derived(
    session.themes.filter((theme) => filter === "all" || (filter === "mine" ? isMine(theme) : kind(theme) === filter)),
  );
  const images = $derived(session.media.filter((asset) => asset.kind === "image"));
  const videos = $derived(session.media.filter((asset) => asset.kind === "video"));

  /** A sample verse through the real renderer, with photo and video backgrounds resolved. */
  function sample(theme: Theme): PresentationModel {
    const bg = theme.background;
    const asset = bg.type === "image" || bg.type === "video" ? session.media.find((entry) => entry.id === bg.assetId) ?? null : null;
    const url = asset ? mediaUrl(asset) : null;
    return {
      ...presentScripture({ theme, reference: "John 3:16", attribution: "King James Version", verses: SAMPLE, backgroundImageUrl: bg.type === "image" ? url : null }),
      backgroundVideoUrl: bg.type === "video" ? url : null,
    };
  }

  function badge(theme: Theme): string {
    const type = theme.background.type;
    if (type === "motion") return "Animated";
    if (type === "video") return "Video";
    if (type === "image") return "Photo";
    if (type === "gradient") return "Gradient";
    return "";
  }

  function apply(theme: Theme) {
    selectedId = theme.id;
    if (theme.premium && !canEdit) {
      session.requireFeature("theme-library");
      return;
    }
    session.useTheme(theme.id);
    note = `${theme.name} is on Preview. LIVE sends it to the screen.`;
  }

  /** Every edit goes through here (Premium). Saving also makes it the theme in use. */
  function patch(change: Partial<Theme>) {
    if (!session.requireFeature("theme-library")) return;
    session.saveTheme({ ...$state.snapshot(selected), ...change } as Theme);
  }

  function setBackground(background: ThemeBackground) {
    patch({ background });
  }

  function switchType(type: ThemeBackground["type"]) {
    const current = selected.background;
    if (current.type === type) return;
    if (type === "color") setBackground({ type: "color", color: "#0b1020" });
    else if (type === "gradient") setBackground({ type: "gradient", from: "#0b1020", to: "#3b2a6b", angle: 160 });
    else if (type === "wash") setBackground({ type: "wash", washId: DISPLAY_WASHES[1]!.id });
    else if (type === "motion") setBackground({ type: "motion", motionId: MOTIONS[0]!.id, tint: MOTIONS[0]!.tint, base: MOTIONS[0]!.base });
    else if (type === "image") {
      if (images[0]) setBackground({ type: "image", assetId: images[0].id });
      else mediaInput?.click();
    } else if (type === "video") {
      if (videos[0]) setBackground({ type: "video", assetId: videos[0].id });
      else mediaInput?.click();
    }
  }

  function newTheme() {
    const copy = session.duplicateTheme(selected.id);
    if (copy) {
      selectedId = copy.id;
      tab = "background";
      note = `${copy.name} created. Change anything; it saves as you go.`;
    }
  }

  async function remove(theme: Theme) {
    await session.deleteTheme(theme.id);
    selectedId = session.workspace.themeId;
  }

  async function importMedia(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await session.importImage(file);
    const added = session.media[session.media.length - 1];
    if (added) setBackground({ type: added.kind === "video" ? "video" : "image", assetId: added.id });
  }

  async function pickMediaDesktop() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: [{ name: "Image or video", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4v", "mov", "webm"] }] });
    if (typeof picked !== "string") return;
    await session.importImage(picked);
    const added = session.media[session.media.length - 1];
    if (added) setBackground({ type: added.kind === "video" ? "video" : "image", assetId: added.id });
  }

  async function exportTheme() {
    try {
      const { fileName, json } = await session.exportTheme();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      note = `${fileName} saved.`;
    } catch (error) {
      note = error instanceof Error ? error.message : "The theme was not exported.";
    }
  }

  async function importTheme(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await session.importTheme(await file.text());
      selectedId = session.workspace.themeId;
      note = "Theme imported.";
    } catch (error) {
      note = error instanceof Error ? error.message : "The theme was not imported.";
    }
  }

  const BG_TYPES: { id: ThemeBackground["type"]; label: string }[] = [
    { id: "color", label: "Color" },
    { id: "gradient", label: "Gradient" },
    { id: "wash", label: "Wash" },
    { id: "motion", label: "Animated" },
    { id: "image", label: "Photo" },
    { id: "video", label: "Video" },
  ];
</script>

<section class="lib">
  <!-- Selected theme, large and live -->
  <div class="hero">
    <div class="hero-screen"><Screen model={sample(selected)} /></div>
    <div class="hero-side">
      <input
        class="theme-name"
        aria-label="Theme name"
        value={selected.name}
        disabled={!canEdit}
        onchange={(event) => patch({ name: event.currentTarget.value.trim() || selected.name })}
      />
      <p class="note">
        {#if session.workspace.themeId === selected.id}In use on the audience screen.{:else}Not in use.{/if}
        {#if badge(selected)} {badge(selected)} background.{/if}
      </p>
      <div class="hero-actions">
        {#if session.workspace.themeId !== selected.id}
          <button type="button" class="btn primary" onclick={() => apply(selected)}>Use this theme</button>
        {/if}
        <button type="button" class="btn" onclick={newTheme}><Icon name="copy" size={14} /> Duplicate</button>
        {#if isMine(selected)}
          <button type="button" class="btn danger" onclick={() => void remove(selected)}><Icon name="trash" size={14} /> Delete</button>
        {/if}
      </div>
      {#if !canEdit}
        <button type="button" class="unlock" onclick={() => session.requireFeature("theme-library")}>
          <Icon name="key" size={14} /> Edit colors, add photos, video and animation with Premium
        </button>
      {/if}
      {#if note}<p class="note" role="status">{note}</p>{/if}
    </div>
  </div>

  <!-- Gallery -->
  <div class="gallery-head">
    <p class="section-label">Library <span>{shown.length}</span></p>
    <div class="filters" role="radiogroup" aria-label="Show">
      {#each [["all", "All"], ["still", "Still"], ["animated", "Animated"], ["media", "Photo & video"], ["mine", "My themes"]] as [id, label] (id)}
        <button type="button" role="radio" aria-checked={filter === id} class:on={filter === id} onclick={() => (filter = id as Filter)}>{label}</button>
      {/each}
    </div>
  </div>
  <div class="gallery">
    {#each shown as theme (theme.id)}
      <button type="button" class="card" class:on={selectedId === theme.id} class:current={session.workspace.themeId === theme.id} onclick={() => (selectedId = theme.id)} ondblclick={() => apply(theme)}>
        <span class="thumb"><Screen model={sample(theme)} still /></span>
        <span class="card-meta">
          <strong>{theme.name}</strong>
          {#if session.workspace.themeId === theme.id}<em class="pill ok">In use</em>
          {:else if theme.premium && !canEdit}<em class="pill muted"><Icon name="key" size={10} /> Premium</em>
          {:else if badge(theme)}<em class="pill muted">{badge(theme)}</em>{/if}
        </span>
      </button>
    {:else}
      <p class="note">{filter === "mine" ? "No themes of your own yet. Duplicate one to start." : "Nothing here yet."}</p>
    {/each}
  </div>

  <!-- Editor -->
  <div class="editor" class:locked={!canEdit}>
    <p class="section-label">Customize {selected.name}</p>
    <div class="tabs" role="tablist" aria-label="Theme settings">
      {#each [["background", "Background"], ["text", "Text"], ["details", "Details"]] as [id, label] (id)}
        <button type="button" role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id as Tab)}>{label}</button>
      {/each}
    </div>

    {#if tab === "background"}
      <section class="rows">
        <div class="row stack">
          <div class="row-copy"><strong>Background</strong><span>Behind every verse, song and slide that uses this theme.</span></div>
          <div class="seg" role="radiogroup" aria-label="Background type">
            {#each BG_TYPES as entry (entry.id)}
              <button type="button" role="radio" aria-checked={selected.background.type === entry.id} class:on={selected.background.type === entry.id} onclick={() => switchType(entry.id)}>{entry.label}</button>
            {/each}
          </div>
        </div>
        {#if selected.background.type === "color"}
          {@const bg = selected.background}
          <div class="row">
            <div class="row-copy"><strong>Color</strong></div>
            <input type="color" class="swatch-input" aria-label="Background color" value={bg.color} onchange={(event) => setBackground({ type: "color", color: event.currentTarget.value })} />
          </div>
        {:else if selected.background.type === "gradient"}
          {@const bg = selected.background}
          <div class="row">
            <div class="row-copy"><strong>Colors</strong><span>From one color to another.</span></div>
            <div class="row-end">
              <span class="gradient-chip" style:background={gradientCss(bg.from, bg.to, bg.angle)}></span>
              <input type="color" class="swatch-input" aria-label="Gradient start" value={bg.from} onchange={(event) => setBackground({ ...bg, from: event.currentTarget.value })} />
              <input type="color" class="swatch-input" aria-label="Gradient end" value={bg.to} onchange={(event) => setBackground({ ...bg, to: event.currentTarget.value })} />
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Direction</strong><span>{bg.angle}°</span></div>
            <input type="range" min="0" max="359" step="5" aria-label="Gradient angle" value={bg.angle} onchange={(event) => setBackground({ ...bg, angle: Number(event.currentTarget.value) })} />
          </div>
        {:else if selected.background.type === "wash"}
          {@const bg = selected.background}
          <div class="row stack">
            <div class="row-copy"><strong>Wash</strong><span>Soft, ready-made fills. Some drift slowly.</span></div>
            <div class="chips">
              {#each DISPLAY_WASHES as wash (wash.id)}
                <button type="button" class="chip-btn" class:on={bg.washId === wash.id} onclick={() => setBackground({ type: "wash", washId: wash.id })}>
                  <span class="dot-swatch" style:background={wash.background}></span>{wash.name}
                </button>
              {/each}
            </div>
          </div>
        {:else if selected.background.type === "motion"}
          {@const bg = selected.background}
          <div class="row stack">
            <div class="row-copy"><strong>Animation</strong><span>Drawn live on the screen; nothing to download.</span></div>
            <div class="chips">
              {#each MOTIONS as motion (motion.id)}
                <button type="button" class="chip-btn" class:on={bg.motionId === motion.id} onclick={() => setBackground({ type: "motion", motionId: motion.id, tint: motion.tint, base: motion.base })}>
                  <span class="dot-swatch" style:background={`radial-gradient(circle at 35% 35%, ${motion.tint}, ${motion.base})`}></span>{motion.name}
                </button>
              {/each}
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Colors</strong><span>Light color, and the sky behind it.</span></div>
            <div class="row-end">
              <input type="color" class="swatch-input" aria-label="Animation color" value={bg.tint} onchange={(event) => setBackground({ ...bg, tint: event.currentTarget.value })} />
              <input type="color" class="swatch-input" aria-label="Animation base color" value={bg.base} onchange={(event) => setBackground({ ...bg, base: event.currentTarget.value })} />
            </div>
          </div>
        {:else}
          {@const bg = selected.background}
          {@const list = bg.type === "video" ? videos : images}
          <div class="row stack">
            <div class="row-copy"><strong>{bg.type === "video" ? "Video" : "Photo"}</strong><span>{bg.type === "video" ? "Plays silently on a loop behind the words." : "Fills the screen behind the words."}</span></div>
            <div class="chips">
              {#each list as asset (asset.id)}
                <button type="button" class="chip-btn" class:on={"assetId" in bg && bg.assetId === asset.id} onclick={() => setBackground({ type: bg.type === "video" ? "video" : "image", assetId: asset.id })}>{asset.name}</button>
              {/each}
              <button type="button" class="chip-btn add" onclick={() => (isDesktop() ? void pickMediaDesktop() : mediaInput?.click())}><Icon name="plus" size={12} /> Import</button>
            </div>
          </div>
        {/if}
        <div class="row">
          <div class="row-copy"><strong>Darken</strong><span>{Math.round((selected.dim ?? 0) * 100)}%: helps words read over photos, video and animation.</span></div>
          <input type="range" min="0" max="80" step="5" aria-label="Darken background" value={Math.round((selected.dim ?? 0) * 100)} onchange={(event) => patch({ dim: Number(event.currentTarget.value) / 100 })} />
        </div>
      </section>
    {:else if tab === "text"}
      <section class="rows">
        <div class="row">
          <div class="row-copy"><strong>Font</strong></div>
          <select class="field" aria-label="Font" value={selected.fontFamily} onchange={(event) => patch({ fontFamily: event.currentTarget.value })}>
            {#each SCREEN_FONTS as font (font.id)}<option value={font.family}>{font.name}</option>{/each}
          </select>
        </div>
        <div class="row">
          <div class="row-copy"><strong>Size</strong><span>{selected.fontSize} px on a 1080p screen</span></div>
          <input type="range" min="32" max="120" step="2" aria-label="Text size" value={selected.fontSize} onchange={(event) => patch({ fontSize: Number(event.currentTarget.value) })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>Color</strong></div>
          <input type="color" class="swatch-input" aria-label="Text color" value={selected.color} onchange={(event) => patch({ color: event.currentTarget.value })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>Alignment</strong></div>
          <div class="row-end">
            <div class="seg small" role="radiogroup" aria-label="Horizontal alignment">
              {#each [["left", "Left"], ["center", "Center"], ["right", "Right"]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={selected.align === id} class:on={selected.align === id} onclick={() => patch({ align: id as Theme["align"] })}>{label}</button>
              {/each}
            </div>
            <div class="seg small" role="radiogroup" aria-label="Vertical position">
              {#each [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={selected.vertical === id} class:on={selected.vertical === id} onclick={() => patch({ vertical: id as Theme["vertical"] })}>{label}</button>
              {/each}
            </div>
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>Margin</strong><span>{selected.margin} px from the screen edges</span></div>
          <input type="range" min="24" max="240" step="4" aria-label="Margin" value={selected.margin} onchange={(event) => patch({ margin: Number(event.currentTarget.value) })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>Shadow</strong><span>A soft shadow behind the words.</span></div>
          <input type="checkbox" class="switch" role="switch" aria-label="Text shadow" checked={!!selected.effects?.shadow} onchange={(event) => patch({ effects: { ...selected.effects, shadow: event.currentTarget.checked } })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>Capitals</strong><span>Show words in capitals.</span></div>
          <input type="checkbox" class="switch" role="switch" aria-label="Capitals" checked={!!selected.effects?.uppercase} onchange={(event) => patch({ effects: { ...selected.effects, uppercase: event.currentTarget.checked } })} />
        </div>
      </section>
    {:else}
      <section class="rows">
        <div class="row">
          <div class="row-copy"><strong>Reference</strong><span>“John 3:16” above the verse.</span></div>
          <div class="row-end">
            <input type="color" class="swatch-input" aria-label="Reference color" value={selected.reference.color} onchange={(event) => patch({ reference: { ...selected.reference, color: event.currentTarget.value } })} />
            <input type="checkbox" class="switch" role="switch" aria-label="Show reference" checked={selected.reference.show} onchange={(event) => patch({ reference: { ...selected.reference, show: event.currentTarget.checked } })} />
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>Reference size</strong><span>{selected.reference.size} px</span></div>
          <input type="range" min="14" max="60" step="2" aria-label="Reference size" value={selected.reference.size} onchange={(event) => patch({ reference: { ...selected.reference, size: Number(event.currentTarget.value) } })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>Translation name</strong><span>“King James Version” under the verse.</span></div>
          <div class="row-end">
            <input type="color" class="swatch-input" aria-label="Translation name color" value={selected.attribution.color} onchange={(event) => patch({ attribution: { ...selected.attribution, color: event.currentTarget.value } })} />
            <input type="checkbox" class="switch" role="switch" aria-label="Show translation name" checked={selected.attribution.show} onchange={(event) => patch({ attribution: { ...selected.attribution, show: event.currentTarget.checked } })} />
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>Change between slides</strong><span>{selected.transition.type === "cut" ? "Instant" : `Fade, ${selected.transition.ms} ms`}</span></div>
          <div class="row-end">
            <div class="seg small" role="radiogroup" aria-label="Transition">
              <button type="button" role="radio" aria-checked={selected.transition.type === "fade"} class:on={selected.transition.type === "fade"} onclick={() => patch({ transition: { ...selected.transition, type: "fade" } })}>Fade</button>
              <button type="button" role="radio" aria-checked={selected.transition.type === "cut"} class:on={selected.transition.type === "cut"} onclick={() => patch({ transition: { ...selected.transition, type: "cut" } })}>Cut</button>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>Share a theme</strong><span>Save this theme to a file, or add one from a file.</span></div>
          <div class="row-end">
            <button type="button" class="btn" onclick={() => void exportTheme()}>Export</button>
            <button type="button" class="btn" onclick={() => importInput?.click()}>Import…</button>
          </div>
        </div>
      </section>
    {/if}
  </div>

  <input bind:this={importInput} type="file" accept=".json,application/json" hidden onchange={(event) => void importTheme(event)} />
  <input bind:this={mediaInput} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mov,.m4v" hidden onchange={(event) => void importMedia(event)} />
</section>

<style>
  .lib { display: flex; flex-direction: column; gap: 14px; }
  .hero { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .hero-screen { border-radius: 10px; overflow: hidden; border: 1px solid var(--line); background: #000; container-type: inline-size; }
  .hero-side { display: flex; flex-direction: column; gap: 10px; }
  .theme-name { height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 17px; font-weight: 700; }
  .theme-name:disabled { opacity: 1; border-color: transparent; background: none; padding: 0; }
  .hero-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .unlock { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px dashed color-mix(in srgb, var(--accent) 60%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; text-align: left; cursor: pointer; }
  .unlock :global(svg) { color: var(--accent); flex: none; }

  .editor { display: flex; flex-direction: column; gap: 8px; }
  .editor.locked :global(.rows) { opacity: 0.6; }
  .tabs { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
  .tabs button, .seg button, .filters button { text-transform: none; letter-spacing: normal; height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .tabs button.on, .seg button.on { background: var(--accent); color: #fff; }
  .seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .seg.small button { height: 26px; padding: 0 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
  .chip-btn.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .chip-btn.add { padding: 0 10px; color: var(--muted); border-style: dashed; }
  .dot-swatch { width: 18px; height: 18px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15); }
  .gradient-chip { width: 60px; height: 26px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
  .swatch-input { width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: none; cursor: pointer; }
  input[type="range"] { width: min(240px, 40%); accent-color: var(--accent); }

  .gallery-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
  .editor { margin-top: 8px; }
  .gallery-head .section-label span { margin-left: 4px; opacity: 0.7; }
  .filters { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--field); }
  .filters button { border-radius: 999px; }
  .filters button.on { background: var(--ink); color: var(--panel); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .card:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .thumb { display: block; border-radius: 7px; overflow: hidden; background: #000; container-type: inline-size; pointer-events: none; }
  .card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 2px 2px; }
  .card-meta strong { font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-meta em { font-style: normal; display: inline-flex; align-items: center; gap: 3px; font-size: 10px !important; padding: 1px 7px !important; }

  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; }
  }
</style>
