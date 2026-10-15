<script lang="ts">
  import { session } from "../app/session.svelte";
  import { DISPLAY_WASHES, backgroundFill, displayWash } from "../domain/backgrounds";
  import { SCREEN_FONTS, screenFont } from "../domain/fonts";
  import type { Theme } from "../domain/types";

  const theme = $derived(session.theme());
  const fill = $derived(backgroundFill(theme.background));
  const solid = $derived(theme.background.type === "color" ? theme.background.color : displayWash(theme.background.type === "wash" ? theme.background.washId : "")?.swatch ?? "#050505");

  function save(next: Theme) {
    session.saveTheme(next);
  }
</script>

<div class="type">
  <p class="label">Display theme</p>
  <div class="themes" role="group" aria-label="Display theme">
    {#each session.themes as item (item.id)}
      <button
        type="button"
        class:on={item.id === theme.id}
        style:background={backgroundFill(item.background)}
        style:color={item.color}
        style:font-family={item.fontFamily}
        onclick={() => session.useTheme(item.id)}
      >
        <span>Aa</span>
        {item.name}
      </button>
    {/each}
  </div>

  <p class="sample" style:font-family={theme.fontFamily} style:color={theme.color} style:background={fill} style:text-align={theme.align}>
    In the beginning
  </p>

  <label>
    Theme name
    <input class="field" value={theme.name} aria-label="Theme name" onchange={(event) => save({ ...theme, name: event.currentTarget.value.trim() || theme.name })} />
  </label>

  <p class="label">Verse font</p>
  <div class="fonts" role="group" aria-label="Verse font">
    {#each SCREEN_FONTS as font (font.id)}
      <button type="button" class:on={screenFont(theme.fontFamily)?.id === font.id} style:font-family={font.family} onclick={() => save({ ...theme, fontFamily: font.family })}>
        <span>Aa</span>
        {font.name}
      </button>
    {/each}
  </div>

  <label>
    Size {theme.fontSize}
    <input class="field" type="range" min="28" max="120" value={theme.fontSize} aria-label="Font size" oninput={(event) => save({ ...theme, fontSize: Number(event.currentTarget.value) })} />
  </label>

  <div class="colors">
    <label>
      Text
      <input type="color" value={theme.color} aria-label="Text color" oninput={(event) => save({ ...theme, color: event.currentTarget.value })} />
    </label>
    <label>
      Background
      <input type="color" value={solid} aria-label="Background color" oninput={(event) => save({ ...theme, background: { type: "color", color: event.currentTarget.value } })} />
    </label>
    <label>
      Reference
      <input type="color" value={theme.reference.color} aria-label="Reference color" oninput={(event) => save({ ...theme, reference: { ...theme.reference, color: event.currentTarget.value } })} />
    </label>
  </div>

  <p class="label">Display background</p>
  <div class="washes" role="group" aria-label="Display background">
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

  <p class="label">Alignment</p>
  <div class="segment" role="group" aria-label="Text alignment">
    {#each ["left", "center", "right"] as align (align)}
      <button type="button" class:on={theme.align === align} onclick={() => save({ ...theme, align: align as Theme["align"] })}>{align}</button>
    {/each}
  </div>

  <p class="label">Position</p>
  <div class="segment" role="group" aria-label="Text position">
    {#each ["top", "middle", "bottom"] as vertical (vertical)}
      <button type="button" class:on={theme.vertical === vertical} onclick={() => save({ ...theme, vertical: vertical as Theme["vertical"] })}>{vertical}</button>
    {/each}
  </div>

  <p class="label">Layout</p>
  <div class="segment" role="group" aria-label="Verse layout">
    <button type="button" class:on={theme.layout !== "lower-third"} onclick={() => save({ ...theme, layout: "frame" })}>Full frame</button>
    <button type="button" class:on={theme.layout === "lower-third"} onclick={() => save({ ...theme, layout: "lower-third" })}>Lower third</button>
  </div>

  <label>
    Margin {theme.margin}
    <input class="field" type="range" min="24" max="240" value={theme.margin} aria-label="Margin" oninput={(event) => save({ ...theme, margin: Number(event.currentTarget.value) })} />
  </label>

  <label class="check">
    <input type="checkbox" checked={theme.reference.show} aria-label="Show reference" onchange={(event) => save({ ...theme, reference: { ...theme.reference, show: event.currentTarget.checked } })} />
    Show the reference
  </label>
  <label>
    Reference size {theme.reference.size}
    <input class="field" type="range" min="16" max="64" value={theme.reference.size} aria-label="Reference size" oninput={(event) => save({ ...theme, reference: { ...theme.reference, size: Number(event.currentTarget.value) } })} />
  </label>

  <p class="note">This changes Preview. LIVE sends it to the audience.</p>
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
</style>
