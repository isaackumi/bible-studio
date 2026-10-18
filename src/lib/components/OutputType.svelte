<script lang="ts">
  import { session } from "../app/session.svelte";
  import { DISPLAY_WASHES, backgroundFill, displayWash } from "../domain/backgrounds";
  import { SCREEN_FONTS, screenFont } from "../domain/fonts";
  import type { Theme } from "../domain/types";
  import { sanitizeTextStyle } from "../domain/text-style";
  import TextStyleEditor from "./TextStyleEditor.svelte";
  import { t } from "../i18n/core";

  const theme = $derived(session.theme());
  const fill = $derived(backgroundFill(theme.background));
  const solid = $derived(theme.background.type === "color" ? theme.background.color : displayWash(theme.background.type === "wash" ? theme.background.washId : "")?.swatch ?? "#050505");

  function save(next: Theme) {
    session.saveTheme(next);
  }

  let themeFile = $state<HTMLInputElement | undefined>();
  let themeNote = $state("");

  async function exportTheme() {
    try {
      const { fileName, json } = await session.exportTheme();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      themeNote = `${fileName} saved.`;
    } catch (error) {
      themeNote = error instanceof Error ? error.message : t("The theme was not exported.");
    }
  }

  async function importTheme(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(t("That theme file is too large."));
      await session.importTheme(await file.text());
      themeNote = session.message;
    } catch (error) {
      themeNote = error instanceof Error ? error.message : t("The theme was not imported.");
    }
  }
</script>

<div class="type">
  <p class="label">{t("Display theme")}</p>
  <div class="themes" role="group" aria-label={t("Display theme")}>
    {#each session.themesByFavorite as item (item.id)}
      <button
        type="button"
        class:on={item.id === theme.id}
        style:background={backgroundFill(item.background)}
        style:color={item.color}
        style:font-family={item.fontFamily}
        onclick={() => session.useTheme(item.id)}
      >
        <span>{t("Aa")}</span>
        {item.name}
      </button>
    {/each}
  </div>

  <p class="sample" style:font-family={theme.fontFamily} style:color={theme.color} style:background={fill} style:text-align={theme.align}>
    {t("In the beginning")}
  </p>

  <div class="theme-files">
    <button type="button" onclick={() => void exportTheme()}>{t("Export theme")}</button>
    <button type="button" onclick={() => themeFile?.click()}>{t("Import theme")}</button>
    <input bind:this={themeFile} type="file" accept=".json,application/json" hidden onchange={(event) => void importTheme(event)} />
    {#if themeNote}<span class="theme-note" role="status">{themeNote}</span>{/if}
  </div>

  <label>
    {t("Theme name")}
    <input class="field" value={theme.name} aria-label={t("Theme name")} onchange={(event) => save({ ...theme, name: event.currentTarget.value.trim() || theme.name })} />
  </label>

  <p class="label">{t("Verse font")}</p>
  <div class="fonts" role="group" aria-label={t("Verse font")}>
    {#each SCREEN_FONTS as font (font.id)}
      <button type="button" class:on={screenFont(theme.fontFamily)?.id === font.id} style:font-family={font.family} onclick={() => save({ ...theme, fontFamily: font.family })}>
        <span>{t("Aa")}</span>
        {font.name}
      </button>
    {/each}
  </div>

  <label>
    {t("Size {fontSize}", { fontSize: theme.fontSize })}
    <input class="field" type="range" min="28" max="120" value={theme.fontSize} aria-label={t("Font size")} oninput={(event) => save({ ...theme, fontSize: Number(event.currentTarget.value) })} />
  </label>

  <TextStyleEditor
    label={t("Effects and position")}
    effectsOnly
    style={{ ...(theme.effects ?? {}), align: theme.align, vertical: theme.vertical }}
    onchange={(style) => {
      const { align, vertical, ...effects } = style;
      save({ ...theme, effects: sanitizeTextStyle(effects), align: align ?? theme.align, vertical: vertical ?? theme.vertical });
    }}
  />

  <div class="colors">
    <label>
      {t("Text")}
      <input type="color" value={theme.color} aria-label={t("Text color")} oninput={(event) => save({ ...theme, color: event.currentTarget.value })} />
    </label>
    <label>
      {t("Background")}
      <input type="color" value={solid} aria-label={t("Background color")} oninput={(event) => save({ ...theme, background: { type: "color", color: event.currentTarget.value } })} />
    </label>
    <label>
      {t("Reference")}
      <input type="color" value={theme.reference.color} aria-label={t("Reference color")} oninput={(event) => save({ ...theme, reference: { ...theme.reference, color: event.currentTarget.value } })} />
    </label>
  </div>

  <p class="label">{t("Display background")}</p>
  <div class="washes" role="group" aria-label={t("Display background")}>
    {#each DISPLAY_WASHES as wash (wash.id)}
      <button
        type="button"
        class:on={theme.background.type === "wash" && theme.background.washId === wash.id}
        style:background={wash.background}
        style:color={wash.light ? "#24180f" : "#f5f5f5"}
        onclick={() => save({ ...theme, background: { type: "wash", washId: wash.id } })}
      >
        {wash.name}
      </button>
    {/each}
  </div>

  <p class="label">{t("Alignment")}</p>
  <div class="segment" role="group" aria-label={t("Text alignment")}>
    {#each ["left", "center", "right"] as align (align)}
      <button type="button" class:on={theme.align === align} onclick={() => save({ ...theme, align: align as Theme["align"] })}>{align}</button>
    {/each}
  </div>

  <p class="label">{t("Position")}</p>
  <div class="segment" role="group" aria-label={t("Text position")}>
    {#each ["top", "middle", "bottom"] as vertical (vertical)}
      <button type="button" class:on={theme.vertical === vertical} onclick={() => save({ ...theme, vertical: vertical as Theme["vertical"] })}>{vertical}</button>
    {/each}
  </div>

  <p class="label">{t("Layout")}</p>
  <div class="segment" role="group" aria-label={t("Verse layout")}>
    <button type="button" class:on={theme.layout !== "lower-third"} onclick={() => save({ ...theme, layout: "frame" })}>{t("Full frame")}</button>
    <button type="button" class:on={theme.layout === "lower-third"} onclick={() => save({ ...theme, layout: "lower-third" })}>{t("Lower third")}</button>
  </div>

  <label>
    {t("Margin {margin}", { margin: theme.margin })}
    <input class="field" type="range" min="24" max="240" value={theme.margin} aria-label={t("Margin")} oninput={(event) => save({ ...theme, margin: Number(event.currentTarget.value) })} />
  </label>

  <label class="check">
    <input type="checkbox" checked={theme.reference.show} aria-label={t("Show reference")} onchange={(event) => save({ ...theme, reference: { ...theme.reference, show: event.currentTarget.checked } })} />
    {t("Show the reference")}
  </label>
  <label>
    {t("Reference size {size}", { size: theme.reference.size })}
    <input class="field" type="range" min="16" max="64" value={theme.reference.size} aria-label={t("Reference size")} oninput={(event) => save({ ...theme, reference: { ...theme.reference, size: Number(event.currentTarget.value) } })} />
  </label>

  <p class="note">{t("This changes Preview. LIVE sends it to the audience.")}</p>
</div>

<style>
  .type { display: flex; flex-direction: column; gap: 10px; }
  .themes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .themes button {
    min-height: 58px;
    border: 1px solid var(--line);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    font-size: 12px;
    text-align: left;
  }
  .themes button span { font-size: 20px; line-height: 1; }
  .themes button.on { outline: 2px solid var(--accent); outline-offset: 1px; }
  .sample {
    margin: 0;
    border-radius: 10px;
    padding: 18px 14px;
    font-size: 32px;
    line-height: 1.2;
  }
  label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
  .label { margin: 0; color: var(--muted); font-size: 12px; }
  .field { width: 100%; }
  .fonts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fonts button, .segment button {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 8px;
  }
  .fonts button {
    min-height: 64px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    font-size: 12px;
    text-align: left;
  }
  .fonts button span { font-size: 22px; line-height: 1; }
  .fonts button.on, .segment button.on { border-color: var(--accent); color: var(--ink); }
  .washes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .washes button {
    height: 36px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 12px;
    text-align: left;
    padding: 0 10px;
  }
  .washes button.on { outline: 2px solid var(--accent); outline-offset: 1px; }
  .colors { display: flex; gap: 12px; }
  .colors input { width: 42px; height: 28px; padding: 0; border: 0; background: transparent; }
  .segment { display: flex; gap: 6px; }
  .segment button { height: 32px; padding: 0 10px; text-transform: capitalize; }
  .check { flex-direction: row; align-items: center; color: var(--ink); }
  .note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .theme-files { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .theme-files button { min-height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .theme-note { color: var(--muted); font-size: 12px; }
</style>
