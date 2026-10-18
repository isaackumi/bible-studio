<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { quickLabel, quickRead, type QuickRef } from "../../bible/quick";
  import { formatReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import type { BibleItem, PresentationModel, SearchHit, VerseText } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Screen from "../Screen.svelte";
  import Icon from "../Icon.svelte";

  // Find a verse, fast. Short typing goes a long way: "jn316", "1co13", "ps23", "3:16" or "16" in
  // the chapter that is open, "c5" for a chapter, "jo" for the books it could be, or a few words.
  // Beside the box: the translation, and the scriptures used today, starred and recent. On the left
  // the books to browse; on the right the words with their neighbours.
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
    searchWords: (text: string, translationId: string) => Promise<SearchHit[]>;
    onopen: (item: BibleItem, live: boolean) => void;
    onclose: () => void;
  } = $props();

  type Row =
    | { kind: "ref"; ref: QuickRef }
    | { kind: "book"; ord: number; name: string; chapters: number }
    | { kind: "verse"; bookOrd: number; chapter: number; verse: number; text: string }
    | { kind: "hit"; hit: SearchHit }
    | { kind: "saved"; item: BibleItem; tag: string };

  const SMALL_WORDS = new Set(["the", "and", "that", "this", "with", "for", "unto", "was", "his", "her", "him", "they", "them", "are", "but", "not", "shall", "thy", "thee", "thou", "have", "from", "which", "who", "all", "you", "our", "ye"]);

  // Opened with what was already typed in the search box, if anything.
  let query = $state(untrack(() => initial));
  let tid = $state(untrack(() => translationId));
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
  let testament = $state<"old" | "new">(untrack(() => (here.bookOrd >= 40 ? "new" : "old")));
  let browseOrd = $state<number | null>(null);
  let note = $state("");

  const read = $derived(quickRead(query, here, session.books));

  /** The sections of the Bible, so the book list can be scanned by kind. */
  const SECTIONS: Array<{ name: string; from: number; to: number; tone: string }> = [
    { name: "Law", from: 1, to: 5, tone: "#c9a35b" },
    { name: "History", from: 6, to: 17, tone: "#7fa36b" },
    { name: "Poetry & Wisdom", from: 18, to: 22, tone: "#b07cc6" },
    { name: "Major Prophets", from: 23, to: 27, tone: "#d07a5a" },
    { name: "Minor Prophets", from: 28, to: 39, tone: "#c98a4b" },
    { name: "Gospels", from: 40, to: 43, tone: "#5aa0d6" },
    { name: "Acts", from: 44, to: 44, tone: "#58b3a4" },
    { name: "Paul's Letters", from: 45, to: 57, tone: "#7d8fe0" },
    { name: "General Letters", from: 58, to: 65, tone: "#9a8fd0" },
    { name: "Revelation", from: 66, to: 66, tone: "#d9677a" },
  ];
  const sectionFor = (ord: number) => SECTIONS.find((section) => ord >= section.from && ord <= section.to) ?? SECTIONS[0]!;

  /** What Enter would open, shown faintly in the box ("jn316" → John 3:16). */
  const understood = $derived.by(() => {
    const ref = read.refs[0];
    if (!ref || !query.trim()) return "";
    const label = quickLabel(ref, session.books);
    return label.toLowerCase().replace(/\s+/g, "") === query.trim().toLowerCase().replace(/\s+/g, "") ? "" : label;
  });
  const bookOf = (ord: number) => session.books.find((book) => book.ord === ord);
  const bookName = (ord: number) => bookOf(ord)?.name ?? "";
  const chapters = (ord: number) => bookOf(ord)?.chapters ?? 1;
  const translations = $derived(session.translations.length ? session.translations : [{ id: "kjv", abbreviation: "KJV", name: "King James Version" }]);
  const tAbbr = (id: string) => translations.find((entry) => entry.id === id)?.abbreviation ?? id.toUpperCase();
  const books = $derived(session.books.filter((book) => (testament === "new" ? book.ord >= 40 : book.ord < 40)));
  /** The book the browser shows chapters for: the one picked, else the one being typed. */
  const browsing = $derived(browseOrd ?? read.chapter?.bookOrd ?? (read.books.length === 1 ? read.books[0]!.ord : null));

  // The chapter the typing points at, verse by verse.
  $effect(() => {
    const target = read.chapter;
    const key = target ? `${tid}:${target.bookOrd}:${target.chapter}` : "";
    if (key === chapterKey) return;
    chapterKey = key;
    chapterVerses = [];
    if (!target) return;
    void api.verses(tid, target.bookOrd, target.chapter).then((rows) => {
      if (chapterKey === key) chapterVerses = rows;
    }).catch(() => {});
  });

  // Words: searched after a short pause in typing.
  $effect(() => {
    const phrase = read.phrase;
    const translation = tid;
    hits = [];
    if (!phrase) return;
    searching = true;
    const timer = setTimeout(() => {
      void searchWords(phrase, translation).then((found) => {
        if (read.phrase === phrase && tid === translation) hits = found.slice(0, 40);
      }).catch(() => {}).finally(() => (searching = false));
    }, 160);
    return () => clearTimeout(timer);
  });

  const keyOf = (item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">) => `${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`;
  const today = new Date().toDateString();
  const goneToday = $derived(
    [...session.workspace.goneLive].filter((entry) => !entry.removed && new Date(entry.lastAt).toDateString() === today).reverse().map((entry) => entry.passage).slice(0, 10),
  );
  const favorites = $derived(session.workspace.favorites.passages.slice(0, 10));
  const recent = $derived(session.workspace.recent.slice(0, 10));

  /** Before typing: what went live today, favorites and recent passages, once each. */
  const saved = $derived.by((): Row[] => {
    const seen = new Set<string>();
    const rows: Row[] = [];
    const add = (item: BibleItem, tag: string) => {
      if (seen.has(keyOf(item)) || rows.length >= 16) return;
      seen.add(keyOf(item));
      rows.push({ kind: "saved", item, tag });
    };
    goneToday.forEach((item) => add(item, "Gone live today"));
    favorites.forEach((item) => add(item, "Favorites"));
    recent.forEach((item) => add(item, "Recent"));
    return rows;
  });

  const rows = $derived.by((): Row[] => {
    if (!query.trim()) return saved;
    const out: Row[] = read.refs.map((ref) => ({ kind: "ref" as const, ref }));
    // Book suggestions only while the book is still being typed.
    if (!read.chapter) {
      for (const book of read.books) out.push({ kind: "book", ord: book.ord, name: book.name, chapters: book.chapters });
    }
    const target = read.chapter;
    if (target) {
      for (const verse of chapterVerses) {
        if (target.prefix && !String(verse.verse).startsWith(target.prefix)) continue;
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
    note = "";
  });

  const selected = $derived(rows[cursor] ?? null);

  /** The passage a row stands for (a whole chapter has none: it opens its verses). */
  function itemOf(row: Row | null): BibleItem | null {
    if (!row) return null;
    const make = (bookOrd: number, chapter: number, start: number, end: number): BibleItem => ({
      translationId: tid,
      bookOrd,
      chapter,
      startVerse: start,
      endVerse: end,
      reference: formatReference(bookName(bookOrd), chapter, start, end, chapters(bookOrd)),
    });
    if (row.kind === "saved") return make(row.item.bookOrd, row.item.chapter, row.item.startVerse, row.item.endVerse);
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

  const selectedItem = $derived(itemOf(selected));

  // The picked passage as the audience would see it, in the theme in use.
  let screenModel = $state<PresentationModel | null>(null);
  $effect(() => {
    const item = selectedItem;
    if (!item) {
      screenModel = null;
      return;
    }
    const snapshot = { ...item };
    const timer = setTimeout(() => {
      void session.renderItem({ id: "find", kind: "bible", title: snapshot.reference, bible: snapshot }).then((model) => {
        if (selectedItem && keyOf(selectedItem) === keyOf(snapshot) && selectedItem.translationId === snapshot.translationId) screenModel = model;
      }).catch(() => {});
    }, 90);
    return () => clearTimeout(timer);
  });

  // The words of what is picked, with the verse before and after for context.
  let previewKey = "";
  $effect(() => {
    const item = selectedItem;
    const key = item ? `${item.translationId}:${keyOf(item)}` : "";
    if (key === previewKey) return;
    previewKey = key;
    if (!item) {
      previewText = [];
      return;
    }
    void api.passage(item.translationId, item.bookOrd, item.chapter, Math.max(1, item.startVerse - 1), item.endVerse + 1).then((found) => {
      if (previewKey === key) previewText = found;
    }).catch(() => (previewText = []));
  });

  /** Tab, or Enter on a book or chapter: finish the typing instead of opening. */
  function complete(row: Row | null): boolean {
    if (!row) return false;
    if (row.kind === "book") {
      query = `${row.name} `;
      browseOrd = row.ord;
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
    // Alt+1…9: translation.
    if (event.altKey && /^Digit[1-9]$/.test(event.code)) {
      const pick = translations[Number(event.code.slice(5)) - 1];
      if (pick) {
        event.preventDefault();
        tid = pick.id;
      }
      return;
    }
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

  /** A chip: click looks at it, Shift-click shows it now, double-click puts it on Preview. */
  function chip(item: BibleItem, event: MouseEvent) {
    const passage = { ...item, translationId: tid };
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onopen(passage, true);
      return;
    }
    if (event.detail >= 2) {
      onopen(passage, false);
      return;
    }
    query = passage.reference;
    input?.focus();
  }

  function pickBook(ord: number) {
    browseOrd = ord;
    const book = bookOf(ord);
    if (!book) return;
    query = book.chapters === 1 ? `${book.name} 1:` : `${book.name} `;
    input?.focus();
  }

  function pickChapter(ord: number, chapter: number) {
    query = `${bookName(ord)} ${chapter}:`;
    input?.focus();
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

  const sectionOf = (row: Row) =>
    row.kind === "ref" ? "Go to" : row.kind === "book" ? "Books" : row.kind === "verse" ? `${bookName(row.bookOrd)} ${row.chapter}` : row.kind === "hit" ? `Words · ${hits.length} found` : row.tag;

  function addToService() {
    if (!selectedItem) return;
    session.addPassageToService(selectedItem);
    note = `${selectedItem.reference} added to the service.`;
  }
</script>

{#snippet chips(label: string, icon: string, items: BibleItem[], removable = false)}
  {#if items.length}
    <div class="chip-row" aria-label={label}>
      <span class="chip-label"><Icon name={icon} size={12} />{label}</span>
      <div class="chip-scroll">
        {#each items as item (keyOf(item))}
          {#if removable}
            <span class="chip-pair" class:on={selectedItem && keyOf(selectedItem) === keyOf(item)}>
              <button type="button" class="chip in-pair" title="Click to look · double-click for Preview · Shift-click to show now" onclick={(event) => chip(item, event)}>{item.reference}</button>
              <button type="button" class="chip-x" aria-label="Remove {item.reference} from Recent" title="Remove from Recent" onclick={() => session.removeRecent(item)}><Icon name="close" size={11} /></button>
            </span>
          {:else}
            <button type="button" class="chip" class:on={selectedItem && keyOf(selectedItem) === keyOf(item)} title="Click to look · double-click for Preview · Shift-click to show now" onclick={(event) => chip(item, event)}>{item.reference}</button>
          {/if}
        {/each}
        {#if removable && items.length > 1}
          <button type="button" class="chip-clear" title="Empty the Recent list" onclick={() => session.clearRecent()}>Clear</button>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<DeskDialog title="Find a verse" huge {onclose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -- keyboard control for the list inside -->
  <div class="finder" onkeydown={keys}>
    <div class="top">
      <label class="box">
        <Icon name="search" size={20} />
        <input
          bind:this={input}
          type="search"
          aria-label="Find a verse"
          placeholder="jn316 · 1co13 · ps23 · 3:16 · 16 · c5 · or a few words"
          autocomplete="off"
          spellcheck="false"
          bind:value={query}
        />
        {#if understood}<span class="understood" aria-live="polite"><span>→</span>{understood}</span>{/if}
        {#if searching}<span class="busy">Searching…</span>{/if}
      </label>
      <div class="translations" role="radiogroup" aria-label="Translation">
        {#each translations as translation, index (translation.id)}
          <button type="button" role="radio" aria-checked={tid === translation.id} title="{translation.name}{index < 9 ? ` (Alt+${index + 1})` : ''}" onclick={() => { tid = translation.id; input?.focus(); }}>{translation.abbreviation}</button>
        {/each}
        <button type="button" class="more" title="Add translations" aria-label="Add translations" onclick={() => { onclose(); session.openSettings("bible"); }}><Icon name="plus" size={13} /></button>
      </div>
    </div>

    <div class="shortcuts">
      {@render chips("Gone live today", "check", goneToday)}
      {@render chips("Favorites", "star", favorites)}
      {@render chips("Recent", "reset", recent, true)}
      <p class="patterns">
        <span><b>jn316</b> John 3:16</span>
        <span><b>rom828-30</b> range</span>
        <span><b>16</b> verse here</span>
        <span><b>c5</b> chapter here</span>
        <span><b>jo</b> Tab: book</span>
        <span><b>words</b> search</span>
      </p>
    </div>

    <div class="panes">
      <nav class="browse" aria-label="Books">
        <div class="testaments" role="tablist" aria-label="Testament">
          <button type="button" role="tab" aria-selected={testament === "old"} onclick={() => { testament = "old"; browseOrd = null; input?.focus(); }}>Old Testament</button>
          <button type="button" role="tab" aria-selected={testament === "new"} onclick={() => { testament = "new"; browseOrd = null; input?.focus(); }}>New Testament</button>
        </div>
        {#if browsing !== null && bookOf(browsing)}
          {@const book = bookOf(browsing)!}
          <div class="chapters-head" style:--tone={sectionFor(book.ord).tone}>
            <button type="button" class="back" aria-label="All books" onclick={() => { browseOrd = null; testament = book.ord >= 40 ? "new" : "old"; query = ""; input?.focus(); }}><Icon name="chevron-left" size={14} /></button>
            <span class="tone-dot" aria-hidden="true"></span>
            <span class="book-title">
              <strong>{book.name}</strong>
              <span>{sectionFor(book.ord).name} · {book.chapters} chapter{book.chapters === 1 ? "" : "s"}</span>
            </span>
          </div>
          <div class="chapter-grid">
            {#each Array.from({ length: book.chapters }, (_, n) => n + 1) as number (number)}
              <button type="button" class:on={read.chapter?.bookOrd === book.ord && read.chapter.chapter === number} onclick={() => pickChapter(book.ord, number)}>{number}</button>
            {/each}
          </div>
        {:else}
          <div class="book-grid">
            {#each books as book, index (book.ord)}
              {@const group = sectionFor(book.ord)}
              {#if index === 0 || sectionFor(books[index - 1]!.ord) !== group}
                <p class="book-group" style:--tone={group.tone}>{group.name}</p>
              {/if}
              <button type="button" class:here={book.ord === here.bookOrd} style:--tone={group.tone} title={book.name} onclick={() => pickBook(book.ord)}>{book.name}</button>
            {/each}
          </div>
        {/if}
      </nav>

      <div class="results" bind:this={listEl} role="listbox" aria-label="Results">
        {#each rows as row, index (index)}
          {@const section = sectionOf(row)}
          {#if index === 0 || sectionOf(rows[index - 1]!) !== section}
            <p class="section"><span>{section}</span>{#if row.kind === "verse"}<em>{rows.filter((entry) => entry.kind === "verse").length}</em>{/if}</p>
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
            {#if row.kind === "verse"}<span class="vnum">{row.verse}</span>{:else}<strong>{rowLabel(row)}</strong>{/if}
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
          <div class="empty">
            {#if query.trim()}
              <p>{searching ? "Searching the words…" : `Nothing for “${query.trim()}”.`}</p>
              {#if !searching}<p class="muted">Try jn316, ps23, or a few words from the verse. Or pick a book on the left.</p>{/if}
            {:else}
              <p>Type a reference the short way, or a few words.</p>
              <p class="muted">Or pick a book on the left, then a chapter. Scriptures you use show above.</p>
            {/if}
          </div>
        {/each}
      </div>

      <aside class="preview" aria-live="polite">
        {#if selectedItem}
          <div class="preview-head">
            <div>
              <p class="ref">{selectedItem.reference}</p>
              <p class="tr">{translations.find((entry) => entry.id === tid)?.name ?? tAbbr(tid)}</p>
            </div>
            <button
              type="button"
              class="star"
              class:on={session.isFavoritePassage(selectedItem)}
              aria-label={session.isFavoritePassage(selectedItem) ? `Remove ${selectedItem.reference} from favorites` : `Add ${selectedItem.reference} to favorites`}
              onclick={() => selectedItem && session.toggleFavoritePassage(selectedItem)}
            ><Icon name="star" size={16} /></button>
          </div>
          {#if screenModel}
            <div class="screen-preview" aria-label="How it looks on the screen"><Screen model={screenModel} still /></div>
          {/if}
          <div class="words">
            {#each previewText as verse (verse.verse)}
              {@const inside = verse.verse >= selectedItem.startVerse && verse.verse <= selectedItem.endVerse}
              <p class:context={!inside}><sup>{verse.verse}</sup>{verse.text}</p>
            {/each}
          </div>
          {#if note}<p class="note" role="status">{note}</p>{/if}
          <div class="go">
            <button type="button" class="btn" onclick={() => choose(selected, false)}>Preview <kbd>Enter</kbd></button>
            <button type="button" class="btn live" onclick={() => choose(selected, true)}>Show now <kbd>⇧ Enter</kbd></button>
            <button type="button" class="btn ghost" title="Add to the service running order" onclick={addToService}><Icon name="queue" size={14} /> Add to service</button>
          </div>
        {:else if selected?.kind === "book"}
          <p class="ref">{selected.name}</p>
          <p class="hint">{selected.chapters} chapters. Press Tab, then type the chapter and verse, or pick a chapter on the left.</p>
        {:else if selected?.kind === "ref"}
          <p class="ref">{quickLabel(selected.ref, session.books)}</p>
          <p class="hint">Press Enter to list its verses, then pick one. Shift+↓ selects several.</p>
        {:else}
          <p class="ref muted">Nothing picked</p>
          <p class="hint">The words of what you pick show here, with the verse before and after.</p>
        {/if}
      </aside>
    </div>

    <p class="keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>⇧↓</kbd> several verses · <kbd>Enter</kbd> Preview · <kbd>⇧ Enter</kbd> show now · <kbd>Tab</kbd> finish a book · <kbd>Alt 1–9</kbd> translation · <kbd>Esc</kbd> close</p>
  </div>
</DeskDialog>

<style>
  .finder { display: flex; flex-direction: column; gap: 10px; height: min(80vh, 760px); }
  .top { display: flex; gap: 10px; align-items: stretch; flex: none; }
  .box { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--muted); }
  .box:focus-within { border-color: var(--accent); }
  .box input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 21px; font-weight: 650; outline: none; }
  .busy { font-size: 12px; }
  .understood { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 15px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: 14px; font-weight: 700; white-space: nowrap; }
  .understood span { opacity: 0.7; }
  .translations { display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); max-width: 46%; overflow-x: auto; scrollbar-width: none; }
  .translations button { flex: none; height: 44px; min-width: 50px; padding: 0 12px; border: 0; border-radius: 9px; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
  .translations button[aria-checked="true"] { background: var(--accent); color: #fff; }
  .translations button:hover:not([aria-checked="true"]) { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .translations .more { min-width: 36px; padding: 0; display: grid; place-items: center; }

  .shortcuts { display: flex; flex-direction: column; gap: 6px; flex: none; }
  .chip-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .chip-label { flex: none; width: 128px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .chip-scroll { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
  .chip { flex: none; height: 28px; padding: 0 11px; border: 1px solid var(--line); border-radius: 14px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .chip:hover { background: var(--field); }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .chip-pair { flex: none; display: inline-flex; align-items: center; height: 28px; border: 1px solid var(--line); border-radius: 14px; }
  .chip-pair.on { border-color: var(--accent); }
  .chip-pair.on .chip { color: var(--accent); }
  .chip.in-pair { border: 0; height: 26px; padding-right: 4px; border-radius: 14px 0 0 14px; }
  .chip-x { width: 24px; height: 26px; border: 0; border-radius: 0 14px 14px 0; background: none; color: var(--muted); display: grid; place-items: center; }
  .chip-x:hover { color: var(--ink); background: var(--field); }
  .chip-clear { flex: none; height: 28px; padding: 0 10px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
  .chip-clear:hover { color: var(--ink); }
  .patterns { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 0; padding-left: 138px; font-size: 12px; color: var(--muted); }
  .patterns b { color: var(--ink); font-weight: 650; margin-right: 4px; font-variant-numeric: tabular-nums; }

  .panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 250px minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; }
  .browse { display: flex; flex-direction: column; gap: 8px; min-height: 0; padding-right: 12px; border-right: 1px solid var(--line); }
  .testaments { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 3px; border-radius: 9px; background: var(--field); flex: none; }
  .testaments button { height: 28px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; }
  .testaments button[aria-selected="true"] { background: var(--panel); color: var(--ink); }
  .book-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 4px; overflow: auto; min-height: 0; align-content: start; padding-right: 2px; }
  .book-group { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; margin: 8px 2px 2px; font-size: 11px; font-weight: 700; color: var(--muted); }
  .book-group:first-child { margin-top: 0; }
  .book-group::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: var(--tone); }
  .book-grid button { position: relative; height: 28px; padding: 0 8px 0 12px; border: 0; border-radius: 6px; background: none; color: var(--ink); font: inherit; font-size: 12px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .book-grid button::before { content: ""; position: absolute; left: 4px; top: 8px; bottom: 8px; width: 2px; border-radius: 1px; background: color-mix(in srgb, var(--tone) 55%, transparent); }
  .book-grid button:hover { background: color-mix(in srgb, var(--tone) 12%, var(--field)); }
  .book-grid button.here { color: var(--accent); font-weight: 700; }
  .chapters-head { display: flex; align-items: center; gap: 8px; flex: none; }
  .tone-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--tone); flex: none; }
  .book-title { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.2; }
  .book-title strong { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .book-title span { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .back { width: 28px; height: 28px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--ink); display: grid; place-items: center; }
  .chapter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 4px; overflow: auto; min-height: 0; align-content: start; }
  .chapter-grid button { height: 34px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .chapter-grid button:hover { background: var(--field); }
  .chapter-grid button.on { background: var(--accent); border-color: var(--accent); color: #fff; }

  .results { overflow: auto; display: flex; flex-direction: column; gap: 3px; padding-right: 4px; min-height: 0; }
  .section { display: flex; align-items: center; gap: 8px; margin: 10px 4px 3px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .section em { font-style: normal; font-size: 11px; min-width: 20px; padding: 1px 6px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 9%, transparent); text-align: center; }
  .section:first-child { margin-top: 0; }
  .row { position: relative; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 7px 10px 7px 12px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: inherit; text-align: left; flex: none; }
  .row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .vnum { flex: none; min-width: 30px; height: 22px; padding: 0 7px; border-radius: 11px; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; display: inline-grid; place-items: center; }
  .row.on .vnum { background: var(--accent); color: #fff; }
  .row strong { flex: none; font-size: 14px; font-variant-numeric: tabular-nums; }
  .row.verse strong { width: 46px; color: var(--muted); font-weight: 650; }
  .row .text { min-width: 0; color: color-mix(in srgb, var(--ink) 78%, transparent); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.on { background: var(--field); box-shadow: inset 3px 0 0 var(--accent); }
  .row.range { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .row.ref strong { font-size: 15px; }
  mark { background: color-mix(in srgb, var(--accent) 30%, transparent); color: inherit; border-radius: 3px; }
  .empty { margin: 8px 4px; font-size: 14px; line-height: 1.5; }
  .empty p { margin: 0 0 4px; }
  .muted { color: var(--muted); }
  .empty .muted { font-size: 13px; }

  .preview { display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 55%, transparent); }
  .preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .preview .ref { margin: 0; font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
  .screen-preview { flex: none; width: min(100%, 300px); border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: #000; box-shadow: 0 8px 24px rgb(0 0 0 / 0.35); }
  .preview .tr { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .star { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--muted); display: grid; place-items: center; flex: none; }
  .star.on { color: #f5b301; border-color: color-mix(in srgb, #f5b301 50%, var(--line)); }
  .words { flex: 1; min-height: 0; overflow: auto; }
  .words p { margin: 0 0 10px; font-size: 16px; line-height: 1.55; }
  .words p.context { color: var(--muted); font-size: 14px; }
  .words sup { color: var(--accent); margin-right: 4px; font-size: 0.72em; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  .go { display: flex; gap: 8px; flex-wrap: wrap; flex: none; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.live { background: var(--live, #e5484d); border-color: var(--live, #e5484d); color: #fff; }
  .btn.ghost { background: none; }
  kbd { font: inherit; font-size: 11px; opacity: 0.75; }
  .keys { margin: 0; flex: none; font-size: 12px; color: var(--muted); }
  .keys kbd { display: inline-block; min-width: 18px; padding: 0 4px; margin-right: 2px; border: 1px solid var(--line); border-radius: 4px; font-size: 11px; text-align: center; opacity: 1; }

  @media (max-width: 1100px) {
    .panes { grid-template-columns: 210px minmax(0, 1fr) minmax(0, 0.9fr); }
  }
  @media (max-width: 860px) {
    .panes { grid-template-columns: minmax(0, 1fr); }
    .browse, .preview { display: none; }
    .top { flex-direction: column; }
    .translations { max-width: none; }
    .patterns { padding-left: 0; }
  }
</style>
