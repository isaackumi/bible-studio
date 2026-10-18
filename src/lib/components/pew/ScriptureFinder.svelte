<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { quickLabel, quickRead, type QuickRef } from "../../bible/quick";
  import { formatReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import type { BibleItem, SearchHit, VerseText } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";

  // Find a verse, fast. Short typing goes a long way: "jn316", "1co13", "ps23", "3:16" or "16" in
  // the chapter that is open, "c5" for a chapter, "jo" for the books it could be, or a few words.
  // Enter puts it on Preview; Shift+Enter (or ⌘Enter) sends it straight to the screen.
  let {
    translationId,
    here,
    initial = "",
    searchWords,
    onopen,
    onclose,
  }: {
    translationId: string;
    here: { bookOrd: number; chapter: number };
    initial?: string;
    searchWords: (text: string) => Promise<SearchHit[]>;
    onopen: (item: BibleItem, live: boolean) => void;
    onclose: () => void;
  } = $props();

  type Row =
    | { kind: "ref"; ref: QuickRef }
    | { kind: "book"; ord: number; name: string; chapters: number }
    | { kind: "verse"; bookOrd: number; chapter: number; verse: number; text: string }
    | { kind: "hit"; hit: SearchHit }
    | { kind: "saved"; item: BibleItem; tag: string };

  // Opened with what was already typed in the search box, if anything.
  let query = $state(untrack(() => initial));
  let cursor = $state(0);
  /** Shift+arrows in a chapter's verses: the other end of a range. */
  let rangeFrom = $state<number | null>(null);
  let chapterVerses = $state<VerseText[]>([]);
  let chapterKey = $state("");
  let hits = $state<SearchHit[]>([]);
  let searching = $state(false);
  let previewText = $state<VerseText[]>([]);
  let input = $state<HTMLInputElement | undefined>();
  let listEl = $state<HTMLDivElement | undefined>();

  const read = $derived(quickRead(query, here, session.books));
  const bookName = (ord: number) => session.books.find((book) => book.ord === ord)?.name ?? "";
  const chapters = (ord: number) => session.books.find((book) => book.ord === ord)?.chapters ?? 1;

  // The chapter the typing points at, verse by verse.
  $effect(() => {
    const target = read.chapter;
    const key = target ? `${translationId}:${target.bookOrd}:${target.chapter}` : "";
    if (key === chapterKey) return;
    chapterKey = key;
    chapterVerses = [];
    if (!target) return;
    void api.verses(translationId, target.bookOrd, target.chapter).then((rows) => {
      if (chapterKey === key) chapterVerses = rows;
    }).catch(() => {});
  });

  // Words: searched after a short pause in typing.
  $effect(() => {
    const phrase = read.phrase;
    hits = [];
    if (!phrase) return;
    searching = true;
    const timer = setTimeout(() => {
      void searchWords(phrase).then((found) => {
        if (read.phrase === phrase) hits = found.slice(0, 30);
      }).catch(() => {}).finally(() => (searching = false));
    }, 160);
    return () => clearTimeout(timer);
  });

  /** Before typing: what went live today, favorites and recent passages. */
  const saved = $derived.by((): Row[] => {
    const seen = new Set<string>();
    const rows: Row[] = [];
    const add = (item: BibleItem, tag: string) => {
      const key = `${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`;
      if (seen.has(key) || rows.length >= 12) return;
      seen.add(key);
      rows.push({ kind: "saved", item, tag });
    };
    const today = new Date().toDateString();
    [...session.workspace.goneLive].filter((entry) => !entry.removed && new Date(entry.lastAt).toDateString() === today).reverse().forEach((entry) => add(entry.passage, "Gone live"));
    session.workspace.favorites.passages.slice(0, 6).forEach((item) => add(item, "Favorite"));
    session.workspace.recent.slice(0, 6).forEach((item) => add(item, "Recent"));
    return rows;
  });

  const rows = $derived.by((): Row[] => {
    if (!query.trim()) return saved;
    const out: Row[] = read.refs.map((ref) => ({ kind: "ref" as const, ref }));
    // Book suggestions only while the book is still being typed; once a chapter is known they would
    // push its verses down.
    if (!read.chapter) {
      for (const book of read.books) out.push({ kind: "book", ord: book.ord, name: book.name, chapters: book.chapters });
    }
    const target = read.chapter;
    if (target) {
      const prefix = target.prefix;
      for (const verse of chapterVerses) {
        if (prefix && !String(verse.verse).startsWith(prefix)) continue;
        out.push({ kind: "verse", bookOrd: target.bookOrd, chapter: target.chapter, verse: verse.verse, text: verse.text });
      }
    }
    for (const hit of hits) out.push({ kind: "hit", hit });
    return out;
  });

  $effect(() => {
    void rows.length;
    if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
  });
  // A new search starts at the top.
  $effect(() => {
    void query;
    cursor = 0;
    rangeFrom = null;
  });

  const selected = $derived(rows[cursor] ?? null);

  /** The passage a row stands for (a whole chapter has none: it opens its verses). */
  function itemOf(row: Row | null): BibleItem | null {
    if (!row) return null;
    const make = (bookOrd: number, chapter: number, start: number, end: number): BibleItem => ({
      translationId,
      bookOrd,
      chapter,
      startVerse: start,
      endVerse: end,
      reference: formatReference(bookName(bookOrd), chapter, start, end, chapters(bookOrd)),
    });
    if (row.kind === "saved") return { ...row.item, translationId: row.item.translationId || translationId };
    if (row.kind === "hit") return make(row.hit.bookOrd, row.hit.chapter, row.hit.verse, row.hit.verse);
    if (row.kind === "verse") {
      const other = rangeFrom !== null ? rows[rangeFrom] : null;
      if (other && other.kind === "verse" && other.chapter === row.chapter && other.bookOrd === row.bookOrd) {
        return make(row.bookOrd, row.chapter, Math.min(other.verse, row.verse), Math.max(other.verse, row.verse));
      }
      return make(row.bookOrd, row.chapter, row.verse, row.verse);
    }
    if (row.kind === "ref" && row.ref.startVerse !== null) return make(row.ref.bookOrd, row.ref.chapter, row.ref.startVerse, row.ref.endVerse ?? row.ref.startVerse);
    return null;
  }

  // The words of what is picked, for the preview pane.
  let previewKey = "";
  $effect(() => {
    const item = itemOf(selected);
    const key = item ? `${item.translationId}:${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}` : "";
    if (key === previewKey) return;
    previewKey = key;
    if (!item) {
      previewText = [];
      return;
    }
    const known = selected?.kind === "verse" && item.startVerse === item.endVerse ? [{ verse: selected.verse, text: selected.text }] : selected?.kind === "hit" ? [{ verse: selected.hit.verse, text: selected.hit.text }] : null;
    if (known) {
      previewText = known;
      return;
    }
    void api.passage(item.translationId, item.bookOrd, item.chapter, item.startVerse, item.endVerse).then((found) => {
      if (previewKey === key) previewText = found;
    }).catch(() => (previewText = []));
  });

  /** Tab, or Enter on a book or chapter: finish the typing instead of opening. */
  function complete(row: Row | null): boolean {
    if (!row) return false;
    if (row.kind === "book") {
      query = `${row.name} `;
      return true;
    }
    if (row.kind === "ref" && row.ref.startVerse === null) {
      query = chapters(row.ref.bookOrd) === 1 ? `${row.ref.bookName} ` : `${row.ref.bookName} ${row.ref.chapter}:`;
      return true;
    }
    return false;
  }

  function choose(row: Row | null, live: boolean) {
    const item = itemOf(row);
    if (!item) {
      if (complete(row)) input?.focus();
      return;
    }
    onopen(item, live);
  }

  function move(step: number, extend: boolean) {
    if (!rows.length) return;
    if (extend && rows[cursor]?.kind === "verse") {
      if (rangeFrom === null) rangeFrom = cursor;
    } else if (!extend) rangeFrom = null;
    cursor = Math.max(0, Math.min(rows.length - 1, cursor + step));
    requestAnimationFrame(() => listEl?.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  function keys(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
    } else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      move(event.key === "PageDown" ? 8 : -8, false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(selected, event.shiftKey || event.metaKey || event.ctrlKey);
    } else if (event.key === "Tab" && !event.shiftKey && selected && (selected.kind === "book" || (selected.kind === "ref" && selected.ref.startVerse === null))) {
      event.preventDefault();
      complete(selected);
    }
  }

  function rowLabel(row: Row): string {
    if (row.kind === "ref") return quickLabel(row.ref, session.books);
    if (row.kind === "book") return row.name;
    if (row.kind === "verse") return `${row.chapter}:${row.verse}`;
    if (row.kind === "hit") return `${row.hit.bookName} ${row.hit.chapter}:${row.hit.verse}`;
    return row.item.reference;
  }

  function inRange(index: number): boolean {
    if (rangeFrom === null) return false;
    return index >= Math.min(rangeFrom, cursor) && index <= Math.max(rangeFrom, cursor);
  }

  const SMALL_WORDS = new Set(["the", "and", "that", "this", "with", "for", "unto", "was", "his", "her", "him", "they", "them", "are", "but", "not", "shall", "thy", "thee", "thou", "have", "from", "which", "who", "all", "you", "our", "ye"]);

  /** Mark the typed words in a verse. */
  function marked(text: string, phrase: string | null): Array<{ text: string; hit: boolean }> {
    if (!phrase) return [{ text, hit: false }];
    const words = phrase
      .split(" ")
      .map((word) => word.replace(/[^a-z]/g, ""))
      .filter((word) => word.length > 2 && !SMALL_WORDS.has(word));
    if (!words.length) return [{ text, hit: false }];
    // Longer words also match their endings ("love" → "loved"); short ones only whole.
    const pattern = new RegExp(`\\b(${words.map((word) => (word.length >= 4 ? `${word}[a-z]*` : word)).join("|")})\\b`, "gi");
    const parts: Array<{ text: string; hit: boolean }> = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index! > last) parts.push({ text: text.slice(last, match.index), hit: false });
      parts.push({ text: match[0], hit: true });
      last = match.index! + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), hit: false });
    return parts;
  }

  // Focus the box once the dialog has placed its own focus.
  $effect(() => {
    const timer = setTimeout(() => {
      input?.focus();
      input?.select();
    }, 0);
    return () => clearTimeout(timer);
  });

  const selectedItem = $derived(itemOf(selected));
  const sectionOf = (row: Row) =>
    row.kind === "ref" ? "Go to" : row.kind === "book" ? "Books" : row.kind === "verse" ? `${bookName(row.bookOrd)} ${row.chapter}` : row.kind === "hit" ? "Words" : row.tag;
</script>

<DeskDialog title="Find a verse" wide {onclose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -- keyboard control for the list inside -->
  <div class="finder" onkeydown={keys}>
    <label class="box">
      <Icon name="search" size={18} />
      <input
        bind:this={input}
        type="search"
        aria-label="Find a verse"
        placeholder="jn316 · 1co13 · ps23 · 3:16 · 16 · c5 · or a few words"
        autocomplete="off"
        spellcheck="false"
        bind:value={query}
      />
      {#if searching}<span class="busy">Searching…</span>{/if}
    </label>
    <p class="patterns">
      <span><b>jn316</b> John 3:16</span>
      <span><b>rom828-30</b> a range</span>
      <span><b>16</b> verse here</span>
      <span><b>c5</b> chapter here</span>
      <span><b>jo</b> + Tab book</span>
      <span><b>words</b> search</span>
    </p>

    <div class="panes">
      <div class="results" bind:this={listEl} role="listbox" aria-label="Results">
        {#each rows as row, index (index)}
          {@const section = sectionOf(row)}
          {#if index === 0 || sectionOf(rows[index - 1]!) !== section}
            <p class="section">{section}</p>
          {/if}
          <button
            type="button"
            role="option"
            data-row={index}
            aria-selected={index === cursor}
            class="row {row.kind}"
            class:on={index === cursor}
            class:range={inRange(index)}
            onmouseenter={() => (cursor = index)}
            onclick={(event) => {
              if (event.shiftKey && row.kind === "verse" && rows[cursor]?.kind === "verse") {
                rangeFrom = rangeFrom ?? cursor;
                cursor = index;
                return;
              }
              cursor = index;
              choose(row, event.metaKey || event.ctrlKey);
            }}
          >
            <strong>{rowLabel(row)}</strong>
            {#if row.kind === "verse"}
              <span class="text">{row.text}</span>
            {:else if row.kind === "hit"}
              <span class="text">{#each marked(row.hit.text, read.phrase) as part, n (n)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span>
            {:else if row.kind === "book"}
              <span class="text">{row.chapters} chapter{row.chapters === 1 ? "" : "s"} · Tab to choose a chapter</span>
            {:else if row.kind === "ref" && row.ref.startVerse === null}
              <span class="text">Whole chapter · Enter to pick a verse</span>
            {/if}
          </button>
        {:else}
          <p class="empty">
            {#if query.trim()}
              {searching ? "Searching the words…" : `Nothing for “${query.trim()}”. Try jn316, ps23, or a few words from the verse.`}
            {:else}
              Type a reference the short way, or a few words. Scriptures you use show here.
            {/if}
          </p>
        {/each}
      </div>

      <aside class="preview" aria-live="polite">
        {#if selectedItem}
          <p class="ref">{selectedItem.reference}</p>
          <div class="words">
            {#each previewText as verse (verse.verse)}
              <p><sup>{verse.verse}</sup>{verse.text}</p>
            {/each}
          </div>
          <div class="go">
            <button type="button" class="btn" onclick={() => choose(selected, false)}>Preview <kbd>Enter</kbd></button>
            <button type="button" class="btn live" onclick={() => choose(selected, true)}>Show now <kbd>⇧ Enter</kbd></button>
          </div>
        {:else if selected?.kind === "book"}
          <p class="ref">{selected.name}</p>
          <p class="hint">{selected.chapters} chapters. Press Tab, then type the chapter and verse: {selected.name.split(" ")[0]} 3 16.</p>
        {:else if selected?.kind === "ref"}
          <p class="ref">{quickLabel(selected.ref, session.books)}</p>
          <p class="hint">Press Enter to list its verses, then pick one. Shift+↓ selects several.</p>
        {:else}
          <p class="hint">↑ ↓ to move · Enter for Preview · Shift+Enter to show it now · Tab finishes a book · Shift+↓ in a chapter selects several verses.</p>
        {/if}
      </aside>
    </div>
  </div>
</DeskDialog>

<style>
  .finder { display: flex; flex-direction: column; gap: 10px; height: min(72vh, 680px); }
  .box { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--muted); flex: none; }
  .box:focus-within { border-color: var(--accent); }
  .box input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 20px; font-weight: 600; outline: none; }
  .busy { font-size: 12px; }
  .patterns { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; font-size: 12px; color: var(--muted); flex: none; }
  .patterns b { color: var(--ink); font-weight: 650; margin-right: 4px; font-variant-numeric: tabular-nums; }
  .panes { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; }
  .results { overflow: auto; display: flex; flex-direction: column; gap: 3px; padding-right: 4px; }
  .section { margin: 8px 4px 2px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .section:first-child { margin-top: 0; }
  .row { display: flex; align-items: baseline; gap: 10px; min-height: 36px; padding: 7px 10px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ink); font: inherit; text-align: left; flex: none; }
  .row strong { flex: none; font-size: 14px; font-variant-numeric: tabular-nums; }
  .row.verse strong { width: 46px; color: var(--muted); font-weight: 650; }
  .row .text { min-width: 0; color: color-mix(in srgb, var(--ink) 78%, transparent); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.on { background: var(--field); border-color: var(--accent); }
  .row.range { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .row.ref strong { font-size: 15px; }
  mark { background: color-mix(in srgb, var(--accent) 30%, transparent); color: inherit; border-radius: 3px; }
  .empty { margin: 8px 4px; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .preview { display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 55%, transparent); }
  .preview .ref { margin: 0; font-size: 18px; font-weight: 700; }
  .words { flex: 1; min-height: 0; overflow: auto; }
  .words p { margin: 0 0 8px; font-size: 15px; line-height: 1.5; }
  .words sup { color: var(--accent); margin-right: 4px; font-size: 0.72em; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .go { display: flex; gap: 8px; flex: none; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.live { background: var(--live, #e5484d); border-color: var(--live, #e5484d); color: #fff; }
  kbd { font: inherit; font-size: 11px; opacity: 0.75; }
  @media (max-width: 760px) {
    .panes { grid-template-columns: 1fr; }
    .preview { display: none; }
  }
</style>
