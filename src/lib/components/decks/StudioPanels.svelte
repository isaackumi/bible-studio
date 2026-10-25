<script lang="ts" module>
  import type { LayerBounds } from "../../domain/composition";
  import type { Fill } from "../../domain/fill";
  import type { IconNode } from "../../domain/icon";
  import type { TextStyle } from "../../domain/types";

  export type StudioPanel = "templates" | "text" | "elements" | "pictures" | "background";

  /** What a panel asks the studio to do to the page being edited. */
  export type StudioActions = {
    addText: (pieces: Array<{ name: string; words: string; bounds: LayerBounds; style: TextStyle }>) => void;
    addShape: (kind: "rect" | "ellipse" | "line", fill: Fill, bounds: LayerBounds, extra?: Record<string, string>) => void;
    addIcon: (icon: { name: string; nodes: IconNode[] }) => void;
    openIcons: () => void;
    addQr: () => void;
    addImage: (asset: { id: string; name: string }) => void;
    setImageBackground: (asset: { id: string; name: string }) => void;
    setFill: (fill: Fill) => void;
    setClear: () => void;
  };
</script>

<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { fillCss, GRADIENT_PRESETS } from "../../domain/fill";
  import { SCREEN_FONTS } from "../../domain/fonts";
  import { TEMPLATE_ICONS } from "../../domain/template-icons";
  import { t } from "../../i18n/core";

  // The studio's left-hand panels other than Templates: ready-made text, shapes and icons,
  // the church's pictures, and backgrounds. Each click adds to (or changes) the page being edited.
  let { panel, actions }: { panel: Exclude<StudioPanel, "templates">; actions: StudioActions } = $props();

  const serif = SCREEN_FONTS[0].family;
  const sans = SCREEN_FONTS[3].family;
  const inter = SCREEN_FONTS[2].family;
  const instrument = SCREEN_FONTS[1].family;
  const white = "#ffffff";

  const TEXTS: Array<{ label: string; preview: string; css: string; pieces: Parameters<StudioActions["addText"]>[0] }> = [
    { label: "Add a heading", preview: "Heading", css: `font: 700 22px ${sans}`, pieces: [{ name: "Heading", words: t("Heading"), bounds: { x: 10, y: 34, w: 80, h: 22 }, style: { fontFamily: sans, size: 140, bold: true, color: white, align: "center", vertical: "middle" } }] },
    { label: "Add a subheading", preview: "Subheading", css: `font: 600 16px ${sans}`, pieces: [{ name: "Subheading", words: t("Subheading"), bounds: { x: 15, y: 44, w: 70, h: 12 }, style: { fontFamily: sans, size: 76, color: white, align: "center", vertical: "middle" } }] },
    { label: "Add body text", preview: "Body text", css: `font: 400 13px ${sans}`, pieces: [{ name: "Text", words: t("Type your words here"), bounds: { x: 15, y: 40, w: 70, h: 20 }, style: { fontFamily: sans, size: 54, color: white, align: "left", vertical: "top" } }] },
    { label: "Add a verse", preview: "“A verse”", css: `font: 400 20px ${serif}`, pieces: [
      { name: "Verse", words: "“The Lord is my shepherd; I shall not want.”", bounds: { x: 12, y: 28, w: 76, h: 34 }, style: { fontFamily: serif, size: 110, color: white, align: "center", vertical: "middle" } },
      { name: "Reference", words: "Psalm 23:1", bounds: { x: 25, y: 64, w: 50, h: 8 }, style: { fontFamily: sans, size: 46, color: "#d9d9e0", align: "center", vertical: "middle", uppercase: true } },
    ] },
    { label: "Add a small label", preview: "SMALL LABEL", css: `font: 700 11px ${inter}; letter-spacing: 0.08em`, pieces: [{ name: "Label", words: t("Label"), bounds: { x: 30, y: 26, w: 40, h: 6 }, style: { fontFamily: inter, size: 40, bold: true, uppercase: true, color: "#f2c46b", align: "center", vertical: "middle" } }] },
  ];

  const COMBOS: Array<{ title: string; sub: string; titleStyle: TextStyle; subStyle: TextStyle; css: [string, string] }> = [
    { title: "Welcome", sub: "We're glad you're here", titleStyle: { fontFamily: serif, size: 180 }, subStyle: { fontFamily: sans, size: 56 }, css: [`400 26px ${serif}`, `400 11px ${sans}`] },
    { title: "SUNDAY", sub: "Worship at 10:00 am", titleStyle: { fontFamily: inter, size: 150, bold: true, uppercase: true }, subStyle: { fontFamily: inter, size: 52 }, css: [`800 22px ${inter}`, `400 11px ${inter}`] },
    { title: "Grace Upon Grace", sub: "A new series", titleStyle: { fontFamily: sans, size: 130, bold: true }, subStyle: { fontFamily: serif, size: 64 }, css: [`700 18px ${sans}`, `400 13px ${serif}`] },
    { title: "Let us pray", sub: "A moment of quiet", titleStyle: { fontFamily: serif, size: 170 }, subStyle: { fontFamily: instrument, size: 52, uppercase: true }, css: [`400 24px ${serif}`, `500 10px ${instrument}`] },
    { title: "Youth Night", sub: "Fridays · 7 pm", titleStyle: { fontFamily: inter, size: 140, bold: true }, subStyle: { fontFamily: sans, size: 56, color: "#c6f432" }, css: [`800 20px ${inter}`, `400 11px ${sans}`] },
    { title: "Holy Communion", sub: "This do in remembrance of me", titleStyle: { fontFamily: serif, size: 140, uppercase: true }, subStyle: { fontFamily: serif, size: 60 }, css: [`400 18px ${serif}`, `400 12px ${serif}`] },
  ];
  function addCombo(combo: (typeof COMBOS)[number]) {
    actions.addText([
      { name: "Title", words: combo.title, bounds: { x: 10, y: 32, w: 80, h: 24 }, style: { color: white, align: "center", vertical: "middle", ...combo.titleStyle } },
      { name: "Subtitle", words: combo.sub, bounds: { x: 15, y: 58, w: 70, h: 10 }, style: { color: "#e6e6ee", align: "center", vertical: "middle", ...combo.subStyle } },
    ]);
  }

  const solidFill = (color: string): Fill => ({ kind: "solid", color });
  const SHAPES: Array<{ label: string; kind: "rect" | "ellipse" | "line"; fill: Fill; bounds: LayerBounds; extra?: Record<string, string>; css: string }> = [
    { label: "Square", kind: "rect", fill: solidFill(white), bounds: { x: 35, y: 30, w: 30, h: 40 }, css: "border-radius: 0" },
    { label: "Rounded", kind: "rect", fill: solidFill(white), bounds: { x: 35, y: 30, w: 30, h: 40 }, extra: { radius: "16" }, css: "border-radius: 8px" },
    { label: "Circle", kind: "ellipse", fill: solidFill(white), bounds: { x: 40, y: 32, w: 20, h: 36 }, css: "border-radius: 50%" },
    { label: "Pill", kind: "rect", fill: solidFill(white), bounds: { x: 30, y: 44, w: 40, h: 12 }, extra: { radius: "50" }, css: "border-radius: 999px; height: 40%; align-self: center" },
    { label: "Outline", kind: "rect", fill: solidFill("#00000000"), bounds: { x: 8, y: 10, w: 84, h: 80 }, extra: { stroke: white, strokeWidth: "3" }, css: "background: transparent; border: 2px solid var(--ink)" },
    { label: "Ring", kind: "ellipse", fill: solidFill("#00000000"), bounds: { x: 38, y: 28, w: 24, h: 44 }, extra: { stroke: white, strokeWidth: "3" }, css: "background: transparent; border: 2px solid var(--ink); border-radius: 50%" },
    { label: "Line", kind: "line", fill: solidFill(white), bounds: { x: 30, y: 49, w: 40, h: 0.6 }, css: "height: 3px; align-self: center" },
    { label: "Bar", kind: "rect", fill: solidFill(white), bounds: { x: 6, y: 20, w: 0.8, h: 60 }, extra: { radius: "50" }, css: "width: 6px; justify-self: center; border-radius: 3px" },
    { label: "Banner", kind: "rect", fill: solidFill(white), bounds: { x: 0, y: 36, w: 100, h: 28 }, css: "height: 40%; align-self: center" },
    { label: "Glass card", kind: "rect", fill: solidFill("#ffffff24"), bounds: { x: 12, y: 12, w: 76, h: 76 }, extra: { radius: "8", shadow: "soft" }, css: "background: color-mix(in srgb, var(--ink) 25%, transparent); border-radius: 6px" },
    { label: "Fade to dark", kind: "rect", fill: { kind: "linear", angle: 180, stops: [{ color: "#00000000", at: 0 }, { color: "#000000cc", at: 100 }] }, bounds: { x: 0, y: 50, w: 100, h: 50 }, css: "background: linear-gradient(transparent, #000)" },
    { label: "Lower-third bar", kind: "rect", fill: GRADIENT_PRESETS.find((entry) => entry.id === "bar")!.fill, bounds: { x: 4, y: 74, w: 46, h: 16 }, extra: { radius: "4" }, css: "background: linear-gradient(90deg, #1f3f8a, transparent); height: 40%; align-self: end" },
  ];

  const ICON_NAMES = Object.keys(TEMPLATE_ICONS) as Array<keyof typeof TEMPLATE_ICONS>;

  const SOLIDS = ["#000000", "#111827", "#1b1b1f", "#0f1b3d", "#1b0b3a", "#2a0409", "#08140f", "#3a1407", "#ffffff", "#f6f1e7", "#fdeee9", "#dff1ff"];
  const MORE_GRADIENTS: Fill[] = [
    { kind: "linear", angle: 160, stops: [{ color: "#050816", at: 0 }, { color: "#101b3a", at: 100 }] },
    { kind: "linear", angle: 160, stops: [{ color: "#08140f", at: 0 }, { color: "#1d3b2a", at: 100 }] },
    { kind: "linear", angle: 150, stops: [{ color: "#6b2a12", at: 0 }, { color: "#c66a3d", at: 100 }] },
    { kind: "linear", angle: 135, stops: [{ color: "#120428", at: 0 }, { color: "#3a0ca3", at: 60 }, { color: "#f72585", at: 100 }] },
    { kind: "linear", angle: 180, stops: [{ color: "#2a1b4a", at: 0 }, { color: "#c2547a", at: 60 }, { color: "#ffb36b", at: 100 }] },
    { kind: "linear", angle: 180, stops: [{ color: "#031b2e", at: 0 }, { color: "#0b5f8a", at: 100 }] },
    { kind: "radial", x: 50, y: 40, stops: [{ color: "#7a1020", at: 0 }, { color: "#2a0409", at: 100 }] },
    { kind: "linear", angle: 160, stops: [{ color: "#fdeee9", at: 0 }, { color: "#f6d5d8", at: 100 }] },
    { kind: "linear", angle: 180, stops: [{ color: "#dff1ff", at: 0 }, { color: "#9fd0f5", at: 100 }] },
    { kind: "linear", angle: 170, stops: [{ color: "#fffaf0", at: 0 }, { color: "#f3e6c8", at: 100 }] },
  ];

  const images = $derived(session.media.filter((asset) => asset.kind === "image"));
</script>

<div class="panel-body">
  {#if panel === "text"}
    <h3>{t("Text")}</h3>
    <div class="list">
      {#each TEXTS as entry (entry.label)}
        <button type="button" class="text-btn" onclick={() => actions.addText(entry.pieces)}><span style={entry.css}>{t(entry.preview)}</span><small>{t(entry.label)}</small></button>
      {/each}
    </div>
    <h3>{t("Font pairs")}</h3>
    <div class="combos">
      {#each COMBOS as combo (combo.title)}
        <button type="button" class="combo" onclick={() => addCombo(combo)}>
          <span style:font={combo.css[0]} style:text-transform={combo.titleStyle.uppercase ? "uppercase" : null}>{combo.title}</span>
          <span style:font={combo.css[1]} style:text-transform={combo.subStyle.uppercase ? "uppercase" : null}>{combo.sub}</span>
        </button>
      {/each}
    </div>
  {:else if panel === "elements"}
    <h3>{t("Shapes")}</h3>
    <div class="shapes">
      {#each SHAPES as shape (shape.label)}
        <button type="button" class="shape" title={t(shape.label)} aria-label={t(shape.label)} onclick={() => actions.addShape(shape.kind, shape.fill, shape.bounds, shape.extra)}>
          <span class="mark" style={shape.css}></span>
          <small>{t(shape.label)}</small>
        </button>
      {/each}
    </div>
    <header class="row"><h3>{t("Icons")}</h3><button type="button" class="link" onclick={actions.openIcons}>{t("All icons…")}</button></header>
    <div class="icons">
      {#each ICON_NAMES as name (name)}
        <button type="button" class="icon" title={name} aria-label={name} onclick={() => actions.addIcon({ name, nodes: TEMPLATE_ICONS[name] })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#each TEMPLATE_ICONS[name] as [tag, attrs], index (index)}
              <svelte:element this={tag} {...attrs} />
            {/each}
          </svg>
        </button>
      {/each}
    </div>
    <h3>{t("More")}</h3>
    <div class="list"><button type="button" class="text-btn" onclick={actions.addQr}><span>▦</span><small>{t("QR code")}</small></button></div>
  {:else if panel === "pictures"}
    <h3>{t("Pictures")}</h3>
    {#if images.length === 0}
      <p class="note">{t("Import pictures in Media first. They show here to put on a page or behind it.")}</p>
    {/if}
    <div class="pictures">
      {#each images as asset (asset.id)}
        <div class="picture">
          <button type="button" class="pic" title={asset.name} onclick={() => actions.addImage(asset)}>
            <img src={mediaUrl(asset) ?? ""} alt={asset.name} loading="lazy" />
          </button>
          <button type="button" class="pic-bg" onclick={() => actions.setImageBackground(asset)}>{t("Background")}</button>
        </div>
      {/each}
    </div>
  {:else if panel === "background"}
    <h3>{t("Gradients")}</h3>
    <div class="swatches">
      {#each [...GRADIENT_PRESETS.filter((entry) => entry.id !== "bar").map((entry) => entry.fill), ...MORE_GRADIENTS] as fill, index (index)}
        <button type="button" class="swatch" aria-label={t("Gradient {n}", { n: index + 1 })} style:background={fillCss(fill)} onclick={() => actions.setFill(fill)}></button>
      {/each}
    </div>
    <h3>{t("Colours")}</h3>
    <div class="swatches">
      {#each SOLIDS as color (color)}
        <button type="button" class="swatch" aria-label={color} style:background={color} onclick={() => actions.setFill({ kind: "solid", color })}></button>
      {/each}
    </div>
    <h3>{t("Over a camera")}</h3>
    <button type="button" class="text-btn wide" onclick={actions.setClear}><span class="clear-mark"></span><small>{t("Clear: shows what is behind the page")}</small></button>
    <p class="note">{t("For a picture behind the page, open Pictures and press Background under one. Fine-tune any background in the panel on the right.")}</p>
  {/if}
</div>

<style>
  .panel-body { padding: 12px 14px 18px; display: grid; gap: 10px; align-content: start; }
  h3 { margin: 6px 0 0; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .row { display: flex; align-items: baseline; justify-content: space-between; }
  .link { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
  .list { display: grid; gap: 6px; }
  .text-btn { display: grid; gap: 2px; justify-items: start; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; text-align: left; font: inherit; }
  .text-btn:hover, .combo:hover, .shape:hover, .icon:hover { border-color: var(--accent); }
  .text-btn small { color: var(--muted); font-size: 11px; }
  .combos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .combo { display: grid; gap: 4px; align-content: center; justify-items: center; min-height: 78px; padding: 8px; border-radius: 10px; border: 1px solid var(--line); background: #1b1b22; color: #fff; cursor: pointer; text-align: center; overflow: hidden; }
  .combo span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .combo span + span { opacity: 0.75; }
  .shapes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .shape { display: grid; grid-template-rows: 46px auto; gap: 4px; padding: 8px 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; font: inherit; }
  .shape small { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mark { display: block; width: 60%; height: 100%; justify-self: center; background: var(--ink); }
  .icons { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .icon { aspect-ratio: 1; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; padding: 0; }
  .icon svg { width: 60%; height: 60%; }
  .pictures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .picture { display: grid; gap: 4px; }
  .pic { padding: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; aspect-ratio: 16 / 10; background: var(--field); cursor: pointer; }
  .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pic:hover { border-color: var(--accent); }
  .pic-bg { height: 24px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; }
  .swatches { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .swatch { aspect-ratio: 1; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--ink) 20%, transparent); cursor: pointer; padding: 0; }
  .swatch:hover { outline: 2px solid var(--accent); outline-offset: 1px; }
  .wide { grid-template-columns: auto 1fr; align-items: center; gap: 10px; }
  .clear-mark { width: 28px; height: 18px; border-radius: 4px; background: repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0 / 8px 8px; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  button:focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
</style>
