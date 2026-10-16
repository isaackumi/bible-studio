<script lang="ts">
  import { SCREEN_FONTS } from "../domain/fonts";
  import { positionOf, TEXT_POSITIONS, TEXT_SIZE_MAX, TEXT_SIZE_MIN, withPosition } from "../domain/text-style";
  import type { TextStyle } from "../domain/types";

  // One text-style control for every place text is typed: slides, sources, themes.
  // Empty fields mean "use the theme".
  let {
    style,
    onchange,
    disabled = false,
    effectsOnly = false,
    label = "Text style",
  }: {
    style: TextStyle;
    onchange: (style: TextStyle) => void;
    disabled?: boolean;
    /** Theme mode: fonts/size/color are edited elsewhere, only effects and position here. */
    effectsOnly?: boolean;
    label?: string;
  } = $props();

  const position = $derived(positionOf(style));
  const toggles: Array<{ key: "bold" | "italic" | "underline" | "uppercase" | "shadow"; text: string; title: string }> = [
    { key: "bold", text: "B", title: "Bold" },
    { key: "italic", text: "I", title: "Italic" },
    { key: "underline", text: "U", title: "Underline" },
    { key: "uppercase", text: "AA", title: "All capitals" },
    { key: "shadow", text: "S", title: "Text shadow" },
  ];

  function set(patch: Partial<TextStyle>) {
    const next: TextStyle = { ...style, ...patch };
    for (const key of Object.keys(next) as Array<keyof TextStyle>) {
      if (next[key] === undefined || next[key] === "") delete next[key];
    }
    onchange(next);
  }

  function setSize(raw: string) {
    const value = Number(raw);
    set({ size: raw === "" || !Number.isFinite(value) ? undefined : Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(value))) });
  }
</script>

<fieldset class="text-style" {disabled}>
  <legend>{label}</legend>
  {#if !effectsOnly}
    <div class="row">
      <select aria-label="Font" value={style.fontFamily ?? ""} onchange={(event) => set({ fontFamily: event.currentTarget.value || undefined })}>
        <option value="">Theme font</option>
        {#each SCREEN_FONTS as font (font.id)}
          <option value={font.family} style:font-family={font.family}>{font.name}</option>
        {/each}
      </select>
      <input
        class="size"
        type="number"
        min={TEXT_SIZE_MIN}
        max={TEXT_SIZE_MAX}
        step="2"
        placeholder="Size"
        aria-label="Font size"
        value={style.size ?? ""}
        onchange={(event) => setSize(event.currentTarget.value)}
      />
      <label class="color" title="Text color">
        <input type="color" aria-label="Text color" value={style.color ?? "#ffffff"} oninput={(event) => set({ color: event.currentTarget.value })} />
      </label>
      {#if style.color}
        <button type="button" class="link" onclick={() => set({ color: undefined })}>Theme color</button>
      {/if}
    </div>
  {/if}
  <div class="row" role="group" aria-label="Text effects">
    {#each toggles as toggle (toggle.key)}
      <button
        type="button"
        class="toggle {toggle.key}"
        aria-pressed={style[toggle.key] === true}
        title={toggle.title}
        aria-label={toggle.title}
        onclick={() => set({ [toggle.key]: style[toggle.key] ? undefined : true })}
      >{toggle.text}</button>
    {/each}
  </div>
  <div class="position">
    <span>Position</span>
    <div class="grid" role="radiogroup" aria-label="Position">
      {#each TEXT_POSITIONS as entry (entry.id)}
        <button
          type="button"
          role="radio"
          aria-checked={position === entry.id}
          aria-label={entry.label}
          title={entry.label}
          onclick={() => onchange(withPosition(style, entry.id))}
        ><i></i></button>
      {/each}
    </div>
    {#if !effectsOnly && Object.keys(style).length}
      <button type="button" class="link" onclick={() => onchange({})}>Reset to theme</button>
    {/if}
  </div>
</fieldset>

<style>
  .text-style { border: 1px solid var(--line); border-radius: var(--radius-control, 8px); padding: 8px 10px 10px; margin: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  legend { padding: 0 4px; color: var(--muted); font-size: 12px; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select, .size { height: var(--control-h, 32px); border-radius: var(--radius-control, 8px); border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 8px; font: inherit; }
  select { flex: 1 1 140px; min-width: 0; }
  .size { width: 76px; }
  .color input { width: 36px; height: var(--control-h, 32px); padding: 0; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: none; cursor: pointer; }
  .toggle { min-width: 34px; height: 30px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: 600 13px/1 var(--font-ui); cursor: pointer; }
  .toggle[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .toggle.italic { font-style: italic; font-family: Georgia, serif; }
  .toggle.underline { text-decoration: underline; }
  .toggle.shadow { text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9); }
  .position { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 22px); gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 6px; background: #000; }
  .grid button { width: 22px; height: 14px; border: 0; border-radius: 3px; background: color-mix(in srgb, #fff 10%, transparent); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .grid button i { width: 8px; height: 4px; border-radius: 2px; background: color-mix(in srgb, #fff 35%, transparent); }
  .grid button[aria-checked="true"] { background: var(--accent); }
  .grid button[aria-checked="true"] i { background: #fff; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; padding: 2px; }
  fieldset:disabled { opacity: 0.55; }
</style>
