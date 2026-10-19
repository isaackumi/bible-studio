<script lang="ts">
  import { onMount } from "svelte";
  import { htmlToRich, RICH_FONTS, RICH_SIZES, richToHtml, type RichDoc } from "../domain/rich-text";
  import Icon from "./Icon.svelte";
  import { msg, t } from "../i18n/core";

  // The Formatted editor: words typed as in a word processor, with a toolbar for fonts, sizes,
  // colours, highlight, bold, italic, underline, strike, bullets, numbers, titles and alignment.
  // What it holds is read back into plain data (rich-text.ts); pasting brings words, not styling.
  // `variant`: "full" (titles, quotes, lists, alignment), "lines" (lyrics: line by line, no lists or
  // titles) or "line" (one line only, for overlays and lower thirds).
  let {
    doc,
    onchange,
    placeholder = msg("Type the words"),
    variant = "full",
  }: { doc: RichDoc; onchange: (doc: RichDoc) => void; placeholder?: string; variant?: "full" | "lines" | "line" } = $props();
  const full = $derived(variant === "full");

  let area = $state<HTMLDivElement | undefined>();
  /** The last document sent out, so the editor is only refilled when the words change elsewhere. */
  let sent = "";
  let saved: Range | null = null;
  let active = $state<Record<string, boolean>>({});
  let empty = $state(false);
  let block = $state("div");

  const TEXT_COLORS = ["#ffffff", "#000000", "#fa4f00", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2", "#ff375f", "#8e8e93"];
  const HIGHLIGHTS = ["#ffe066", "#a5f3a1", "#9ad7ff", "#ffb3c7", "#ffcf99", "#d8b4fe"];
  /** The colour palette open under its button, and the last colours used (shown on the buttons). */
  let palette = $state<"text" | "highlight" | null>(null);
  let lastText = $state("#fa4f00");
  let lastHighlight = $state("#ffe066");
  $effect(() => {
    if (!palette) return;
    const away = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest(".palette-wrap")) palette = null;
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });
  const BLOCKS: Array<[string, string]> = [
    ["div", msg("Paragraph")],
    ["h1", msg("Title")],
    ["h2", msg("Subtitle")],
    ["blockquote", msg("Quote")],
  ];

  function fill(next: RichDoc) {
    if (!area) return;
    area.innerHTML = richToHtml(next);
    sent = JSON.stringify(next);
    empty = area.textContent?.trim() === "";
  }

  onMount(() => fill(doc));
  $effect(() => {
    const incoming = JSON.stringify(doc);
    if (incoming !== sent) fill(doc);
  });

  function read() {
    if (!area) return;
    const next = htmlToRich(area);
    sent = JSON.stringify(next);
    empty = area.textContent?.trim() === "";
    onchange(next);
  }

  /** Keep the selection while a toolbar control (a menu, a colour) has the focus. */
  function remember() {
    const selection = document.getSelection();
    if (!area || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (area.contains(range.commonAncestorContainer)) saved = range.cloneRange();
    refresh();
  }

  function restore() {
    area?.focus();
    const selection = document.getSelection();
    if (saved && selection) {
      selection.removeAllRanges();
      selection.addRange(saved);
    }
  }

  function refresh() {
    try {
      active = {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
      };
      const value = String(document.queryCommandValue("formatBlock") || "div").toLowerCase().replace(/[<>]/g, "");
      block = BLOCKS.some(([tag]) => tag === value) ? value : "div";
    } catch {
      active = {};
    }
  }

  /** Run an editing command on the selection (kept while the toolbar was used). */
  function run(command: string, value?: string) {
    restore();
    // Colours of the highlight need CSS; everything else uses the editor's plain tags.
    document.execCommand("styleWithCSS", false, command === "hiliteColor" ? "true" : "false");
    document.execCommand(command, false, value);
    if (command === "hiliteColor" && !document.queryCommandSupported("hiliteColor")) document.execCommand("backColor", false, value);
    remember();
    read();
  }

  function onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const raw = event.clipboardData?.getData("text/plain") ?? "";
    const text = variant === "line" ? raw.replace(/\s*\n+\s*/g, " ") : raw;
    document.execCommand("insertText", false, text);
  }

  function onKey(event: KeyboardEvent) {
    if (variant === "line" && event.key === "Enter") {
      event.preventDefault();
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      run(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
    } else if (key === "x" && event.shiftKey) {
      event.preventDefault();
      run("strikeThrough");
    }
  }

  // Toolbar buttons keep the selection: they act on mouse down and never take the focus.
  const keep = (event: MouseEvent) => event.preventDefault();

  const TOGGLES: Array<{ command: string; icon?: string; text?: string; title: string; style?: string }> = [
    { command: "bold", text: "B", title: msg("Bold (⌘B)"), style: "font-weight: 800" },
    { command: "italic", text: "I", title: msg("Italic (⌘I)"), style: "font-style: italic; font-family: Georgia, serif" },
    { command: "underline", text: "U", title: msg("Underline (⌘U)"), style: "text-decoration: underline" },
    { command: "strikeThrough", text: "S", title: msg("Strikethrough (⌘⇧X)"), style: "text-decoration: line-through" },
  ];
  const LISTS: Array<{ command: string; text: string; title: string }> = [
    { command: "insertUnorderedList", text: "•≡", title: msg("Bullets") },
    { command: "insertOrderedList", text: "1.", title: msg("Numbered") },
  ];
  const ALIGN: Array<{ command: string; title: string; lines: number[] }> = [
    { command: "justifyLeft", title: msg("Align left"), lines: [0, 0, 0] },
    { command: "justifyCenter", title: msg("Centre"), lines: [1, 0, 1] },
    { command: "justifyRight", title: msg("Align right"), lines: [2, 0, 2] },
  ];
</script>

<svelte:document onselectionchange={remember} />

<div class="rte">
  <div class="bar" role="toolbar" aria-label={t("Formatting")}>
    {#if full}
    <select class="wide" aria-label={t("Kind of line")} title={t("Kind of line")} value={block} onchange={(event) => run("formatBlock", `<${event.currentTarget.value}>`)}>
      {#each BLOCKS as [tag, name] (tag)}<option value={tag}>{t(name)}</option>{/each}
    </select>
    {/if}
    <select class="wide" aria-label={t("Font")} title={t("Font")} onchange={(event) => { const value = event.currentTarget.value; event.currentTarget.value = ""; if (value) run("fontName", value); }}>
      <option value="">{t("Font…")}</option>
      {#each RICH_FONTS as font (font.family)}<option value={font.family} style:font-family={font.family}>{font.name}</option>{/each}
    </select>
    <select aria-label={t("Size")} title={t("Size")} onchange={(event) => { const value = event.currentTarget.value; event.currentTarget.value = ""; if (value) run("fontSize", value); }}>
      <option value="">{t("Size…")}</option>
      {#each RICH_SIZES as size (size.step)}<option value={String(size.step)}>{t(size.name)}</option>{/each}
    </select>
    <span class="sep"></span>
    {#each TOGGLES as toggle (toggle.command)}
      <button type="button" class="tb" class:on={active[toggle.command]} aria-pressed={!!active[toggle.command]} title={t(toggle.title)} aria-label={t(toggle.title)} onmousedown={keep} onclick={() => run(toggle.command)}><span style={toggle.style}>{toggle.text}</span></button>
    {/each}
    <span class="sep"></span>
    <span class="palette-wrap">
      <button type="button" class="tb color" class:on={palette === "text"} aria-expanded={palette === "text"} title={t("Text colour")} aria-label={t("Text colour")} onmousedown={keep} onclick={() => (palette = palette === "text" ? null : "text")}>
        <span class="glyph">A</span><i style:background={lastText}></i>
      </button>
      {#if palette === "text"}
        <span class="palette" role="group" aria-label={t("Text colour")}>
          {#each TEXT_COLORS as color (color)}
            <button type="button" class="sw" style:background={color} title={color} aria-label={t("Text colour {color}", { color })} onmousedown={keep} onclick={() => { lastText = color; palette = null; run("foreColor", color); }}></button>
          {/each}
          <label class="pick" title={t("Any colour")}>
            <input type="color" aria-label={t("Any text colour")} onchange={(event) => { lastText = event.currentTarget.value; palette = null; run("foreColor", event.currentTarget.value); }} />
            <Icon name="plus" size={10} />
          </label>
        </span>
      {/if}
    </span>
    <span class="palette-wrap">
      <button type="button" class="tb color" class:on={palette === "highlight"} aria-expanded={palette === "highlight"} title={t("Highlight")} aria-label={t("Highlight")} onmousedown={keep} onclick={() => (palette = palette === "highlight" ? null : "highlight")}>
        <span class="glyph hl" style:background={lastHighlight}>ab</span>
      </button>
      {#if palette === "highlight"}
        <span class="palette" role="group" aria-label={t("Highlight")}>
          {#each HIGHLIGHTS as color (color)}
            <button type="button" class="sw" style:background={color} title={color} aria-label={t("Highlight {color}", { color })} onmousedown={keep} onclick={() => { lastHighlight = color; palette = null; run("hiliteColor", color); }}></button>
          {/each}
          <button type="button" class="sw none" title={t("No highlight")} aria-label={t("No highlight")} onmousedown={keep} onclick={() => { palette = null; run("hiliteColor", "transparent"); }}></button>
        </span>
      {/if}
    </span>
    {#if full}
    <span class="sep"></span>
    {#each LISTS as list (list.command)}
      <button type="button" class="tb" class:on={active[list.command]} aria-pressed={!!active[list.command]} title={t(list.title)} aria-label={t(list.title)} onmousedown={keep} onclick={() => run(list.command)}>{list.text}</button>
    {/each}
    {#each ALIGN as align (align.command)}
      <button type="button" class="tb" class:on={active[align.command]} aria-pressed={!!active[align.command]} title={t(align.title)} aria-label={t(align.title)} onmousedown={keep} onclick={() => run(align.command)}>
        <svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
          {#each [0, 4, 8] as y, n (y)}<rect x={align.lines[n]} y={y} width={n === 1 ? 14 : 12} height="2" rx="1" fill="currentColor" />{/each}
        </svg>
      </button>
    {/each}
    {/if}
    <button type="button" class="tb" title={t("Clear formatting")} aria-label={t("Clear formatting")} onmousedown={keep} onclick={() => run("removeFormat")}><Icon name="reset" size={13} /></button>
  </div>
  <div
    class="area {variant}"
    class:empty
    bind:this={area}
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    aria-label={t(placeholder)}
    data-placeholder={t(placeholder)}
    spellcheck="true"
    oninput={read}
    onpaste={onPaste}
    onkeydown={onKey}
  ></div>
</div>

<style>
  .rte { display: grid; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 5px 6px; border-bottom: 1px solid var(--line); border-radius: 10px 10px 0 0; background: color-mix(in srgb, var(--ink) 4%, transparent); }
  .bar select { height: 28px; width: auto; max-width: 84px; padding: 0 4px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; }
  .bar select.wide { max-width: 98px; }
  .tb { display: grid; place-items: center; min-width: 26px; height: 28px; padding: 0 4px; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 13px; }
  .tb:hover { background: var(--panel); }
  .tb.on { border-color: color-mix(in srgb, var(--accent) 60%, transparent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .sep { width: 1px; height: 18px; margin: 0 1px; background: var(--line); }
  .palette-wrap { position: relative; display: inline-flex; }
  .color { display: grid; place-items: center; gap: 1px; padding: 2px 6px 3px; }
  .glyph { font-size: 13px; font-weight: 800; line-height: 1; }
  .glyph.hl { padding: 1px 3px; border-radius: 3px; color: #111; font-size: 11px; }
  .color i { width: 14px; height: 3px; border-radius: 2px; }
  .palette { position: absolute; z-index: 40; top: calc(100% + 4px); left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: max-content; max-width: 220px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); box-shadow: 0 10px 28px rgb(0 0 0 / 0.35); }
  .sw { width: 20px; height: 20px; padding: 0; border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); border-radius: 50%; }
  .sw:hover { transform: scale(1.18); }
  .sw.none { background: linear-gradient(135deg, transparent 45%, #e5484d 45% 55%, transparent 55%), var(--panel); }
  .pick { position: relative; display: grid; place-items: center; width: 18px; height: 18px; border: 1px dashed var(--line); border-radius: 50%; color: var(--muted); cursor: pointer; overflow: hidden; }
  .pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .area { min-height: 150px; max-height: 340px; overflow: auto; padding: 12px 14px; color: var(--ink); font-size: 15px; line-height: 1.45; outline: none; cursor: text; }
  .area.lines { min-height: 120px; }
  .area.line { min-height: 0; max-height: none; padding: 8px 12px; white-space: nowrap; overflow-x: auto; }
  .area:focus { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
  .area.empty::before { content: attr(data-placeholder); color: var(--muted); pointer-events: none; position: absolute; }
  .area :global(h1) { margin: 0 0 4px; font-size: 1.6em; line-height: 1.15; }
  .area :global(h2) { margin: 0 0 4px; font-size: 1.25em; }
  .area :global(blockquote) { margin: 0; padding-left: 10px; border-left: 3px solid var(--line); font-style: italic; }
  .area :global(ul), .area :global(ol) { margin: 0; padding-left: 22px; }
</style>
