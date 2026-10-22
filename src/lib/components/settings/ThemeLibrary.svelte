<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { DEFAULT_BACKDROP, DISPLAY_WASHES, MOTIONS, gradientCss } from "../../domain/backgrounds";
  import { SCREEN_FONTS } from "../../domain/fonts";
  import { presentScripture } from "../../domain/present";
  import { factoryThemes } from "../../domain/theme";
  import type { BackdropLook, PresentationModel, Theme, ThemeBackground, ThemePanelStyle } from "../../domain/types";
  import { isDesktop } from "../../platform/runtime";
  import Icon from "../Icon.svelte";
  import FavoriteStar from "../FavoriteStar.svelte";
  import { favoritesFirst } from "../../domain/favorites";
  import Screen from "../Screen.svelte";
  import { outputShape } from "../../display/output-shape.svelte";
  import { msg, t } from "../../i18n/core";

  // Theme library: browse every look for the audience screen, preview it live, and (Premium)
  // edit or create one with color, gradient, animated, photo or video backgrounds.
  type Filter = "all" | "favorites" | "broadcast" | "still" | "animated" | "media" | "mine";
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
  const starred = (theme: Theme) => session.isFavorite("themes", theme.id);
  const shown = $derived(
    favoritesFirst(
      session.themes.filter((theme) =>
        filter === "all" || (filter === "favorites" ? starred(theme) : filter === "mine" ? isMine(theme) : filter === "broadcast" ? !!theme.panel || theme.layout === "lower-third" : kind(theme) === filter),
      ),
      starred,
    ),
  );
  const images = $derived(session.mediaByFavorite.filter((asset) => asset.kind === "image"));
  const videos = $derived(session.mediaByFavorite.filter((asset) => asset.kind === "video"));

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
    if (type === "motion") return t("Animated");
    if (type === "video") return t("Video");
    if (type === "image") return t("Photo");
    if (type === "gradient") return t("Gradient");
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

  function setLook(change: Partial<BackdropLook>) {
    patch({ backdrop: { ...DEFAULT_BACKDROP, ...selected?.backdrop, ...change } });
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
      else chooseMedia(type);
    } else if (type === "video") {
      if (videos[0]) setBackground({ type: "video", assetId: videos[0].id });
      else chooseMedia(type);
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

  /**
   * Pick a photo or video for the background. The desktop app imports by file path from the
   * system picker; the browser takes the file itself.
   */
  function chooseMedia(type: "image" | "video" = "image") {
    if (!session.requireFeature("theme-library")) return;
    if (isDesktop()) void pickMediaDesktop(type);
    else mediaInput?.click();
  }

  async function useImported(added: Awaited<ReturnType<typeof session.importImage>>) {
    if (!added) {
      note = session.message || t("That file was not added.");
      return;
    }
    setBackground({ type: added.kind === "video" ? "video" : "image", assetId: added.id });
    note = `${added.name} is the background now.`;
  }

  async function importMedia(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await useImported(await session.importImage(file));
  }

  async function pickMediaDesktop(type: "image" | "video") {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const filters =
      type === "video"
        ? [{ name: "Video", extensions: ["mp4", "m4v", "mov", "webm"] }, { name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }]
        : [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }, { name: "Video", extensions: ["mp4", "m4v", "mov", "webm"] }];
    const picked = await open({ multiple: false, filters });
    if (typeof picked !== "string") return;
    await useImported(await session.importImage(picked));
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
      note = error instanceof Error ? error.message : t("The theme was not exported.");
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
      note = t("Theme imported.");
    } catch (error) {
      note = error instanceof Error ? error.message : t("The theme was not imported.");
    }
  }

  const BG_TYPES: { id: ThemeBackground["type"]; label: string }[] = [
    { id: "color", label: msg("Color") },
    { id: "gradient", label: msg("Gradient") },
    { id: "wash", label: msg("Wash") },
    { id: "motion", label: msg("Animated") },
    { id: "image", label: msg("Photo") },
    { id: "video", label: msg("Video") },
  ];
</script>

<section class="lib">
  <!-- Selected theme, large and live -->
  <div class="hero">
    <div class="hero-screen"><Screen model={sample(selected)} aspect={outputShape.aspect} /></div>
    <div class="hero-side">
      <input
        class="theme-name"
        aria-label={t("Theme name")}
        value={selected.name}
        disabled={!canEdit}
        onchange={(event) => patch({ name: event.currentTarget.value.trim() || selected.name })}
      />
      <p class="note">
        {#if session.workspace.themeId === selected.id}{t("In use on the audience screen.")}{:else}{t("Not in use.")}{/if}
        {#if badge(selected)} {t("{kind} background.", { kind: badge(selected) })}{/if}
      </p>
      <div class="hero-actions">
        {#if session.workspace.themeId !== selected.id}
          <button type="button" class="btn primary" onclick={() => apply(selected)}>{t("Use this theme")}</button>
        {/if}
        <button type="button" class="btn" onclick={newTheme}><Icon name="copy" size={14} /> {t("Duplicate")}</button>
        {#if isMine(selected)}
          <button type="button" class="btn danger" onclick={() => void remove(selected)}><Icon name="trash" size={14} /> {t("Delete")}</button>
        {/if}
      </div>
      {#if !canEdit}
        <button type="button" class="unlock" onclick={() => session.requireFeature("theme-library")}>
          <Icon name="key" size={14} /> {t("Edit colors, add photos, video and animation with Premium")}
        </button>
      {/if}
      {#if note}<p class="note" role="status">{note}</p>{/if}
    </div>
  </div>

  <!-- Gallery -->
  <div class="gallery-head">
    <p class="section-label">{t("Library")} <span>{shown.length}</span></p>
    <div class="filters" role="radiogroup" aria-label={t("Show")}>
      {#each [["all", "All"], ["favorites", "Favorites"], ["broadcast", "Broadcast"], ["still", "Still"], ["animated", "Animated"], ["media", "Photo & video"], ["mine", "My themes"]] as [id, label] (id)}
        <button type="button" role="radio" aria-checked={filter === id} class:on={filter === id} onclick={() => (filter = id as Filter)}>{label}</button>
      {/each}
    </div>
  </div>
  <div class="gallery">
    {#each shown as theme (theme.id)}
      <div class="card-wrap">
      <span class="card-star"><FavoriteStar on={starred(theme)} label={theme.name} onclick={() => session.toggleFavorite("themes", theme.id)} /></span>
      <button type="button" class="theme-card" class:on={selectedId === theme.id} class:current={session.workspace.themeId === theme.id} onclick={() => (selectedId = theme.id)} ondblclick={() => apply(theme)}>
        <span class="thumb"><Screen model={sample(theme)} still aspect={outputShape.aspect} /></span>
        <span class="card-meta">
          <strong>{theme.name}</strong>
          {#if session.workspace.themeId === theme.id}<em class="pill ok">{t("In use")}</em>
          {:else if theme.premium && !canEdit}<em class="pill muted"><Icon name="key" size={10} /> {t("Premium")}</em>
          {:else if badge(theme)}<em class="pill muted">{badge(theme)}</em>{/if}
        </span>
      </button>
      </div>
    {:else}
      <p class="note">{filter === "mine" ? t("No themes of your own yet. Duplicate one to start.") : filter === "favorites" ? t("No favorite themes yet. Star a theme to keep it here.") : t("Nothing here yet.")}</p>
    {/each}
  </div>

  <section class="rows">
    <div class="row">
      <div class="row-copy"><strong>{t("Calm backgrounds")}</strong><span>{t("Hold animated backgrounds still on this computer and its audience screen. Turn on if motion stutters on an older projector computer.")}</span></div>
      <input type="checkbox" class="switch" role="switch" aria-label={t("Calm backgrounds")} checked={session.workspace.appearance.calm === true} onchange={(event) => session.setCalmBackgrounds(event.currentTarget.checked)} />
    </div>
  </section>

  <!-- Editor -->
  <div class="editor" class:locked={!canEdit}>
    <p class="section-label">{t("Customize {name}", { name: selected.name })}</p>
    <div class="tabs" role="tablist" aria-label={t("Theme settings")}>
      {#each [["background", "Background"], ["text", "Text"], ["details", "Details"]] as [id, label] (id)}
        <button type="button" role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id as Tab)}>{label}</button>
      {/each}
    </div>

    {#if tab === "background"}
      <section class="rows">
        <div class="row stack">
          <div class="row-copy"><strong>{t("Background")}</strong><span>{t("Behind every verse, song and slide that uses this theme.")}</span></div>
          <div class="seg" role="radiogroup" aria-label={t("Background type")}>
            {#each BG_TYPES as entry (entry.id)}
              <button type="button" role="radio" aria-checked={selected.background.type === entry.id} class:on={selected.background.type === entry.id} onclick={() => switchType(entry.id)}>{t(entry.label)}</button>
            {/each}
          </div>
        </div>
        {#if selected.background.type === "color"}
          {@const bg = selected.background}
          <div class="row">
            <div class="row-copy"><strong>{t("Color")}</strong></div>
            <input type="color" class="swatch-input" aria-label={t("Background color")} value={bg.color} onchange={(event) => setBackground({ type: "color", color: event.currentTarget.value })} />
          </div>
        {:else if selected.background.type === "gradient"}
          {@const bg = selected.background}
          <div class="row">
            <div class="row-copy"><strong>{t("Colors")}</strong><span>{t("From one color to another.")}</span></div>
            <div class="row-end">
              <span class="gradient-chip" style:background={gradientCss(bg.from, bg.to, bg.angle)}></span>
              <input type="color" class="swatch-input" aria-label={t("Gradient start")} value={bg.from} onchange={(event) => setBackground({ ...bg, from: event.currentTarget.value })} />
              <input type="color" class="swatch-input" aria-label={t("Gradient end")} value={bg.to} onchange={(event) => setBackground({ ...bg, to: event.currentTarget.value })} />
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Direction")}</strong><span>{bg.angle}°</span></div>
            <input type="range" min="0" max="359" step="5" aria-label={t("Gradient angle")} value={bg.angle} onchange={(event) => setBackground({ ...bg, angle: Number(event.currentTarget.value) })} />
          </div>
        {:else if selected.background.type === "wash"}
          {@const bg = selected.background}
          <div class="row stack">
            <div class="row-copy"><strong>{t("Wash")}</strong><span>{t("Soft, ready-made fills. Some drift slowly.")}</span></div>
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
            <div class="row-copy"><strong>{t("Animation")}</strong><span>{t("Drawn live on the screen; nothing to download.")}</span></div>
            <div class="chips">
              {#each MOTIONS as motion (motion.id)}
                <button type="button" class="chip-btn" class:on={bg.motionId === motion.id} onclick={() => setBackground({ type: "motion", motionId: motion.id, tint: motion.tint, base: motion.base })}>
                  <span class="dot-swatch" style:background={`radial-gradient(circle at 35% 35%, ${motion.tint}, ${motion.base})`}></span>{motion.name}
                </button>
              {/each}
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Colors")}</strong><span>{t("Light color, and the sky behind it.")}</span></div>
            <div class="row-end">
              <input type="color" class="swatch-input" aria-label={t("Animation color")} value={bg.tint} onchange={(event) => setBackground({ ...bg, tint: event.currentTarget.value })} />
              <input type="color" class="swatch-input" aria-label={t("Animation base color")} value={bg.base} onchange={(event) => setBackground({ ...bg, base: event.currentTarget.value })} />
            </div>
          </div>
        {:else}
          {@const bg = selected.background}
          {@const list = bg.type === "video" ? videos : images}
          <div class="row stack">
            <div class="row-copy"><strong>{bg.type === "video" ? t("Video") : t("Photo")}</strong><span>{bg.type === "video" ? t("Plays silently on a loop behind the words.") : t("Fills the screen behind the words.")}</span></div>
            <div class="chips">
              {#each list as asset (asset.id)}
                <button type="button" class="chip-btn" class:on={"assetId" in bg && bg.assetId === asset.id} onclick={() => setBackground({ type: bg.type === "video" ? "video" : "image", assetId: asset.id })}>{asset.name}</button>
              {/each}
              <button type="button" class="chip-btn add" onclick={() => chooseMedia(bg.type === "video" ? "video" : "image")}><Icon name="plus" size={12} /> {t("Import")}</button>
            </div>
          </div>
        {/if}
        <div class="row">
          <div class="row-copy"><strong>{t("Darken")}</strong><span>{t("{percent}%: helps words read over photos, video and animation.", { percent: Math.round((selected.dim ?? 0) * 100) })}</span></div>
          <input type="range" min="0" max="80" step="5" aria-label={t("Darken background")} value={Math.round((selected.dim ?? 0) * 100)} onchange={(event) => patch({ dim: Number(event.currentTarget.value) / 100 })} />
        </div>
        {#if selected.background.type === "image" || selected.background.type === "video"}
          {@const look = { ...DEFAULT_BACKDROP, ...selected.backdrop }}
          <div class="row">
            <div class="row-copy"><strong>{t("Fit")}</strong><span>{look.fit === "contain" ? t("The whole picture shows; the edges may stay dark.") : look.fit === "stretch" ? t("Fills the screen without cropping; the picture may look stretched.") : t("Fills the screen; the edges may be cropped.")}</span></div>
            <div class="seg" role="radiogroup" aria-label={t("Fit")}>
              {#each [["cover", t("Fill")], ["contain", t("Whole")], ["stretch", t("Stretch")]] as [fit, label] (fit)}
                <button type="button" role="radio" aria-checked={look.fit === fit} class:on={look.fit === fit} onclick={() => setLook({ fit: fit as typeof look.fit })}>{label}</button>
              {/each}
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Zoom")}</strong><span>{Math.round(look.scale * 100)}%</span></div>
            <input type="range" min="100" max="250" step="5" aria-label={t("Background zoom")} value={Math.round(look.scale * 100)} oninput={(event) => setLook({ scale: Number(event.currentTarget.value) / 100 })} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Blur")}</strong><span>{look.blur ? t("{px} px: a soft picture keeps the words clear.", { px: Math.round(look.blur) }) : t("Sharp")}</span></div>
            <input type="range" min="0" max="40" step="1" aria-label={t("Background blur")} value={look.blur} oninput={(event) => setLook({ blur: Number(event.currentTarget.value) })} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Colour over it")}</strong><span>{look.tintOpacity ? t("{percent}% of the colour over the picture.", { percent: Math.round(look.tintOpacity * 100) }) : t("A wash of your church colour over the picture. Off at 0.")}</span></div>
            <div class="row-end">
              <input type="color" class="swatch-input" aria-label={t("Overlay colour")} value={look.tint} onchange={(event) => setLook({ tint: event.currentTarget.value })} />
              <input type="range" min="0" max="80" step="5" aria-label={t("Overlay strength")} value={Math.round(look.tintOpacity * 100)} oninput={(event) => setLook({ tintOpacity: Number(event.currentTarget.value) / 100 })} />
            </div>
          </div>
          {#if selected.backdrop}
            <div class="row"><div class="row-copy"><span>{t("Back to the picture as it is.")}</span></div><button type="button" class="btn" onclick={() => patch({ backdrop: undefined })}>{t("Reset picture")}</button></div>
          {/if}
        {/if}
      </section>
    {:else if tab === "text"}
      <section class="rows">
        <div class="row">
          <div class="row-copy"><strong>{t("Font")}</strong></div>
          <select class="field" aria-label={t("Font")} value={selected.fontFamily} onchange={(event) => patch({ fontFamily: event.currentTarget.value })}>
            {#each SCREEN_FONTS as font (font.id)}<option value={font.family}>{font.name}</option>{/each}
          </select>
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Size")}</strong><span>{t("{fontSize} px on a 1080p screen", { fontSize: selected.fontSize })}</span></div>
          <input type="range" min="32" max="120" step="2" aria-label={t("Text size")} value={selected.fontSize} onchange={(event) => patch({ fontSize: Number(event.currentTarget.value) })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Color")}</strong></div>
          <input type="color" class="swatch-input" aria-label={t("Text color")} value={selected.color} onchange={(event) => patch({ color: event.currentTarget.value })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Alignment")}</strong></div>
          <div class="row-end">
            <div class="seg small" role="radiogroup" aria-label={t("Horizontal alignment")}>
              {#each [["left", "Left"], ["center", "Center"], ["right", "Right"]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={selected.align === id} class:on={selected.align === id} onclick={() => patch({ align: id as Theme["align"] })}>{label}</button>
              {/each}
            </div>
            <div class="seg small" role="radiogroup" aria-label={t("Vertical position")}>
              {#each [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={selected.vertical === id} class:on={selected.vertical === id} onclick={() => patch({ vertical: id as Theme["vertical"] })}>{label}</button>
              {/each}
            </div>
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Margin")}</strong><span>{t("{margin} px from the screen edges", { margin: selected.margin })}</span></div>
          <input type="range" min="24" max="240" step="4" aria-label={t("Margin")} value={selected.margin} onchange={(event) => patch({ margin: Number(event.currentTarget.value) })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Shadow")}</strong><span>{t("A soft shadow behind the words.")}</span></div>
          <input type="checkbox" class="switch" role="switch" aria-label={t("Text shadow")} checked={!!selected.effects?.shadow} onchange={(event) => patch({ effects: { ...selected.effects, shadow: event.currentTarget.checked } })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Capitals")}</strong><span>{t("Show words in capitals.")}</span></div>
          <input type="checkbox" class="switch" role="switch" aria-label={t("Capitals")} checked={!!selected.effects?.uppercase} onchange={(event) => patch({ effects: { ...selected.effects, uppercase: event.currentTarget.checked } })} />
        </div>
      </section>
      <p class="section-label">{t("Text panel")}</p>
      <section class="rows">
        <div class="row">
          <div class="row-copy"><strong>{t("Panel")}</strong><span>{t("A shape behind the words, like TV graphics. Bar suits lower thirds.")}</span></div>
          <div class="seg small" role="radiogroup" aria-label={t("Text panel")}>
            {#each [["none", "None"], ["box", "Box"], ["glass", "Glass"], ["band", "Band"], ["bar", "Bar"]] as [id, label] (id)}
              <button
                type="button"
                role="radio"
                aria-checked={(selected.panel?.style ?? "none") === id}
                class:on={(selected.panel?.style ?? "none") === id}
                onclick={() => patch({ panel: id === "none" ? undefined : { color: "#050505", opacity: 0.7, accent: session.workspace.appearance.accent, tag: false, ...selected.panel, style: id as ThemePanelStyle } })}
              >{label}</button>
            {/each}
          </div>
        </div>
        {#if selected.panel}
          {@const panel = selected.panel}
          <div class="row">
            <div class="row-copy"><strong>{t("Panel colors")}</strong><span>{t("Fill, then the stripe and tag color.")}</span></div>
            <div class="row-end">
              <input type="color" class="swatch-input" aria-label={t("Panel color")} value={panel.color} onchange={(event) => patch({ panel: { ...panel, color: event.currentTarget.value } })} />
              <input type="color" class="swatch-input" aria-label={t("Panel accent")} value={panel.accent} onchange={(event) => patch({ panel: { ...panel, accent: event.currentTarget.value } })} />
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Panel strength")}</strong><span>{Math.round(panel.opacity * 100)}%</span></div>
            <input type="range" min="0" max="100" step="5" aria-label={t("Panel strength")} value={Math.round(panel.opacity * 100)} onchange={(event) => patch({ panel: { ...panel, opacity: Number(event.currentTarget.value) / 100 } })} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Reference tag")}</strong><span>{t("Show the reference on a colored tag.")}</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Reference tag")} checked={panel.tag} onchange={(event) => patch({ panel: { ...panel, tag: event.currentTarget.checked } })} />
          </div>
        {/if}
      </section>
    {:else}
      <section class="rows">
        <div class="row">
          <div class="row-copy"><strong>{t("Reference")}</strong><span>{t("“John 3:16” above the verse.")}</span></div>
          <div class="row-end">
            <input type="color" class="swatch-input" aria-label={t("Reference color")} value={selected.reference.color} onchange={(event) => patch({ reference: { ...selected.reference, color: event.currentTarget.value } })} />
            <input type="checkbox" class="switch" role="switch" aria-label={t("Show reference")} checked={selected.reference.show} onchange={(event) => patch({ reference: { ...selected.reference, show: event.currentTarget.checked } })} />
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Reference size")}</strong><span>{t("{size} px", { size: selected.reference.size })}</span></div>
          <input type="range" min="14" max="60" step="2" aria-label={t("Reference size")} value={selected.reference.size} onchange={(event) => patch({ reference: { ...selected.reference, size: Number(event.currentTarget.value) } })} />
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Translation name")}</strong><span>{t("“King James Version” under the verse.")}</span></div>
          <div class="row-end">
            <input type="color" class="swatch-input" aria-label={t("Translation name color")} value={selected.attribution.color} onchange={(event) => patch({ attribution: { ...selected.attribution, color: event.currentTarget.value } })} />
            <input type="checkbox" class="switch" role="switch" aria-label={t("Show translation name")} checked={selected.attribution.show} onchange={(event) => patch({ attribution: { ...selected.attribution, show: event.currentTarget.checked } })} />
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Change between slides")}</strong><span>{selected.transition.type === "cut" ? t("Instant") : t("Fade, {ms} ms", { ms: selected.transition.ms })}</span></div>
          <div class="row-end">
            <div class="seg small" role="radiogroup" aria-label={t("Transition")}>
              <button type="button" role="radio" aria-checked={selected.transition.type === "fade"} class:on={selected.transition.type === "fade"} onclick={() => patch({ transition: { ...selected.transition, type: "fade" } })}>{t("Fade")}</button>
              <button type="button" role="radio" aria-checked={selected.transition.type === "cut"} class:on={selected.transition.type === "cut"} onclick={() => patch({ transition: { ...selected.transition, type: "cut" } })}>{t("Cut")}</button>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="row-copy"><strong>{t("Share a theme")}</strong><span>{t("Save this theme to a file, or add one from a file.")}</span></div>
          <div class="row-end">
            <button type="button" class="btn" onclick={() => void exportTheme()}>{t("Export")}</button>
            <button type="button" class="btn" onclick={() => importInput?.click()}>{t("Import…")}</button>
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
  .tabs button.on, .seg button.on { background: var(--accent); color: var(--on-accent); }
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
  .card-wrap { position: relative; display: grid; min-width: 0; }
  .card-star { position: absolute; top: 10px; right: 10px; z-index: 2; border-radius: 7px; background: rgba(0, 0, 0, 0.55); opacity: 0; transition: opacity 120ms; }
  .card-star :global(.fav-star) { color: #fff; }
  .card-star :global(.fav-star.on) { color: #f5b301; }
  .card-wrap:hover .card-star, .card-star:focus-within, .card-star:has(:global(.fav-star.on)) { opacity: 1; }
  .theme-card { display: flex; flex-direction: column; min-width: 0; gap: 6px; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .theme-card:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .theme-card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .thumb { display: block; border-radius: 7px; overflow: hidden; background: #000; container-type: inline-size; pointer-events: none; }
  .card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 2px 2px; }
  .card-meta strong { font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-meta em { font-style: normal; display: inline-flex; align-items: center; gap: 3px; font-size: 10px !important; padding: 1px 7px !important; }

  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; }
  }
</style>
