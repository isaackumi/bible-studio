<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { stepVerse } from "../../bible/passage";
  import { formatReference, parseReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import { moveSongSection, removeSongSection } from "../../domain/song";
  import type { BibleItem, PresentationItem, SearchHit, Song, SongSection, SongSectionKind, VerseText } from "../../domain/types";
  import { onDestroy } from "svelte";
  import { canUse } from "../../platform/capabilities";
  import { detectVerse } from "../../voice/detect";
  import { openPrivacySettings, prepareListening, speechAvailable, startListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import OutputControls from "../OutputControls.svelte";
  import Screen from "../Screen.svelte";

  type Mode = "scriptures" | "slides" | "songs";

  let mode = $state<Mode>("scriptures");
  let translationId = $state("kjv");
  let bookOrd = $state(1);
  let chapter = $state(1);
  let verses = $state<VerseText[]>([]);
  let start = $state<number | null>(1);
  let end = $state<number | null>(1);
  let anchor = $state<number | null>(1);
  let query = $state("Genesis 1");
  let slideQuery = $state("");
  let detections = $state<SearchHit[]>([]);
  let note = $state("Loading scripture…");
  let sheet = $state<"help" | "alerts" | "lexicon" | null>(null);
  let songTitle = $state("");
  let songAuthor = $state("");
  let songSections = $state<SongSection[]>([{ id: crypto.randomUUID(), kind: "verse", label: "Verse 1", lines: [""] }]);
  let songQuery = $state("");
  let wrapVerses = $state(false);
  let expanded = $state<"transcript" | "display" | "preview" | null>(null);
  let chapterToken = 0;
  let takeAfterPreview = false;
  let listening = $state(false);
  let heard = $state("");
  let listenNote = $state("");
  let micLevel = $state(0);
  let stopListen: (() => void) | null = null;

  const book = $derived(session.books.find((entry) => entry.ord === bookOrd) ?? session.books[0]);
  const themeName = $derived(session.theme().name.toUpperCase());
  const queue = $derived(session.service?.sections.flatMap((section) => section.items) ?? []);
  const slides = $derived(queue.filter((item) => item.kind === "slide" || item.kind === "announcement"));
  const visibleSlides = $derived(
    slides.filter((item) => item.title.toLowerCase().includes(slideQuery.trim().toLowerCase())),
  );
  const reading = $derived(
    verses.filter((verse) => start !== null && verse.verse >= start && verse.verse <= (end ?? start)),
  );
  const visibleSongs = $derived(
    session.songs.filter((song) =>
      `${song.title} ${song.author}`.toLowerCase().includes(songQuery.trim().toLowerCase()),
    ),
  );

  $effect(() => {
    const first = session.translations[0];
    if (first && !session.translations.some((entry) => entry.id === translationId)) translationId = first.id;
  });

  $effect(() => {
    const id = translationId;
    const ord = bookOrd;
    const ch = chapter;
    const token = ++chapterToken;
    note = "Loading scripture…";
    void api
      .verses(id, ord, ch)
      .then((rows) => {
        if (token !== chapterToken) return;
        verses = rows;
        const from = start ?? 1;
        const to = end ?? from;
        note = rows.length ? "" : "This chapter has no verses.";
        if (rows.some((row) => row.verse === from)) void showPassage(from, Math.max(from, to));
        void session.refreshProgramTranslation(id);
      })
      .catch(() => {
        if (token !== chapterToken) return;
        verses = [];
        note = "Scripture could not be loaded.";
      });
  });

  function passage(): BibleItem | null {
    if (!book || start === null) return null;
    const last = end ?? start;
    return {
      translationId,
      bookOrd,
      chapter,
      startVerse: start,
      endVerse: last,
      reference: formatReference(book.name, chapter, start, last, book.chapters),
    };
  }

  async function showPassage(from: number, to: number) {
    start = from;
    end = to;
    const item = passage();
    if (!item) {
      takeAfterPreview = false;
      return;
    }
    query = item.reference;
    await session.previewPassage(item);
    if (takeAfterPreview) {
      takeAfterPreview = false;
      await session.take();
    }
  }

  function pick(verse: number, shift = false) {
    if (shift && anchor !== null) {
      void showPassage(Math.min(anchor, verse), Math.max(anchor, verse));
      return;
    }
    anchor = verse;
    void showPassage(verse, verse);
  }

  async function lookup(event: Event) {
    event.preventDefault();
    const parsed = parseReference(query, session.books);
    if (parsed?.startVerse) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = parsed.startVerse;
      await showPassage(parsed.startVerse, parsed.endVerse ?? parsed.startVerse);
      detections = [];
      return;
    }
    if (parsed) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = 1;
      await showPassage(1, 1);
      return;
    }
    await findPhrase(query);
  }

  async function findInScripture() {
    const parsed = parseReference(query, session.books);
    if (parsed?.startVerse) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      anchor = parsed.startVerse;
      await showPassage(parsed.startVerse, parsed.endVerse ?? parsed.startVerse);
      return;
    }
    await findPhrase(query);
  }

  async function findPhrase(text: string) {
    const hits = await api.search(translationId, text);
    detections = hits;
    note = hits.length ? `${hits.length} matches for “${text.trim()}”.` : `No matches for “${text.trim()}”.`;
    const first = hits[0];
    if (first) openHit(first);
  }

  function openHit(hit: SearchHit) {
    bookOrd = hit.bookOrd;
    chapter = hit.chapter;
    anchor = hit.verse;
    void showPassage(hit.verse, hit.verse);
  }

  function moveChapter(direction: 1 | -1) {
    if (!book) return;
    const next = chapter + direction;
    if (next < 1 || next > book.chapters) return;
    chapter = next;
    start = 1;
    end = 1;
    anchor = 1;
    query = `${book.name} ${next}`;
  }

  async function stepOutput(direction: 1 | -1) {
    if (mode === "songs") {
      session.stepSong(direction);
      await session.take();
      return;
    }
    const current = mode === "scriptures" ? passage() : null;
    if (current && book) {
      const next = stepVerse(current, direction, book, verses.length);
      if (next) {
        anchor = next.startVerse;
        await showPassage(next.startVerse, next.endVerse);
        await session.take();
        return;
      }
      const nextChapter = chapter + direction;
      if (nextChapter < 1 || nextChapter > book.chapters) return;
      takeAfterPreview = true;
      moveChapter(direction);
      return;
    }
    await session.step(direction);
    await session.take();
  }

  async function ensureService(sectionName: string) {
    if (!session.service) await session.createService("Sunday Service");
    if (!session.service?.sections.length) session.addSection(sectionName);
  }

  async function queuePassage() {
    const item = passage();
    if (!item) return;
    await ensureService("Scripture");
    if (queue.some((entry) => entry.bible?.reference === item.reference && entry.bible.translationId === item.translationId)) {
      note = `${item.reference} is already in the queue.`;
      return;
    }
    await session.addPassage(item);
    note = `${item.reference} added to the queue.`;
  }

  async function createSlide() {
    await ensureService("Service");
    session.addSlide("slide");
    mode = "slides";
  }

  function open(item: PresentationItem) {
    void session.selectItem(item.id);
  }

  function previewLyrics(title: string, label: string, lines: string[]) {
    session.songFocus = null;
    void session.previewModel(
      {
        layout: "lyrics",
        theme: session.theme(),
        reference: label || title,
        attribution: null,
        lines: lines.filter((line) => line.trim()).map((text) => ({ text })),
        imageUrl: null,
        backgroundImageUrl: null,
      },
      null,
    );
    mode = "songs";
  }

  function addSongSection(kind: SongSectionKind) {
    const count = songSections.filter((section) => section.kind === kind).length + 1;
    const label = kind === "verse" ? `Verse ${count}` : kind === "chorus" ? "Chorus" : kind === "bridge" ? "Bridge" : "Tag";
    songSections = [...songSections, { id: crypto.randomUUID(), kind, label, lines: [""] }];
  }

  function previewDraft() {
    const first = songSections[0];
    if (!first) return;
    previewLyrics(songTitle || "Untitled song", first.label, first.lines);
  }

  async function saveSong(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const title = (form.querySelector<HTMLInputElement>("[aria-label='Song title']")?.value ?? songTitle).trim();
    const author = (form.querySelector<HTMLInputElement>("[aria-label='Song author']")?.value ?? songAuthor).trim();
    const labels = [...form.querySelectorAll<HTMLInputElement>("[aria-label='Section label']")];
    const areas = [...form.querySelectorAll<HTMLTextAreaElement>("textarea")];
    const sections = songSections.map((section, index) => ({
      ...section,
      label: labels[index]?.value.trim() || section.label,
      lines: (areas[index]?.value ?? section.lines.join("\n")).split("\n"),
    }));
    const song: Song = {
      id: crypto.randomUUID(),
      title,
      author,
      sections,
    };
    const saved = await session.saveSong(song);
    if (!saved) {
      note = session.message;
      return;
    }
    songTitle = "";
    songAuthor = "";
    songSections = [{ id: crypto.randomUUID(), kind: "verse", label: "Verse 1", lines: [""] }];
    note = `${song.title} saved. Preview only until you press LIVE.`;
    session.previewSongSection(song, song.sections[0]?.id ?? null);
  }

  function stopVoice() {
    stopListen?.();
    stopListen = null;
    listening = false;
    micLevel = 0;
  }

  async function toggleVoice() {
    if (listening) {
      stopVoice();
      listenNote = "Listening stopped. Preview and Program were left as they were.";
      return;
    }
    if (!canUse("voice-detect") || !speechAvailable()) {
      listenNote = "Voice detection needs a microphone in this window. Type a reference if listening is unavailable.";
      return;
    }
    listenNote = "macOS may ask for the microphone…";
    const blocked = await prepareListening();
    if (blocked) {
      listenNote = blocked;
      void openPrivacySettings();
      return;
    }
    listening = true;
    heard = "";
    micLevel = 0;
    listenNote = "Listening. Speak a verse. A match appears on Preview. LIVE still sends Program.";
    stopListen = startListening({
      onHeard: (text, final) => {
        heard = text;
        if (!text) return;
        listenNote = "Hearing you. Matching stays on Preview.";
        if (!final || !book) return;
        const hit = detectVerse(text, verses, book, chapter, translationId);
        if (!hit) return;
        const named = session.books.find((entry) => entry.ord === hit.bookOrd)?.name ?? book.name;
        if (hit.bookOrd !== bookOrd || hit.chapter !== chapter) {
          bookOrd = hit.bookOrd;
          chapter = hit.chapter;
          anchor = hit.startVerse;
        }
        detections = [
          {
            bookOrd: hit.bookOrd,
            bookName: named,
            chapter: hit.chapter,
            verse: hit.startVerse,
            text,
          },
          ...detections,
        ].slice(0, 12);
        void showPassage(hit.startVerse, hit.endVerse);
      },
      onLevel: (level) => {
        micLevel = level;
      },
      onError: (message) => {
        listenNote = message;
      },
      onEnd: () => {
        listening = false;
        stopListen = null;
        micLevel = 0;
      },
    });
  }

  onDestroy(stopVoice);

  async function queueSong(song: Song, section: SongSection) {
    await ensureService("Songs");
    session.addLyric(song.id, section.id, `${song.title} — ${section.label}`);
    note = `${song.title} added to the queue.`;
  }
</script>

<div class="pb" class:expand-transcript={expanded === "transcript"} class:expand-display={expanded === "display"} class:expand-preview={expanded === "preview"}>
  <header class="pb-bar">
    <nav class="pb-modes" aria-label="Library">
      <button type="button" class:on={mode === "scriptures"} onclick={() => { mode = "scriptures"; const item = passage(); if (item) void session.previewPassage(item); }}>Scriptures</button>
      <button type="button" class:on={mode === "slides"} onclick={() => (mode = "slides")}>Slides</button>
      <button type="button" class:on={mode === "songs"} onclick={() => (mode = "songs")}>Songs</button>
    </nav>
    <div class="pb-actions">
      <OutputControls compact />
      <p class="audience-owner">{session.audienceLabel()}</p>
      {#if !session.controlsAudience}
        <button type="button" data-tip="Send from this window after you Take" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
      <button type="button" class="live" data-tip="Send preview to program" onclick={() => session.take()}><span class="pip"></span>LIVE</button>
      <button type="button" class="black" data-tip="Black program" onclick={() => session.black()}>BLACK</button>
      <button type="button" class="clear" data-tip="Clear program" onclick={() => session.clear()}>CLEAR</button>
    </div>
    <nav class="pb-tools" aria-label="Tools">
      <button type="button" data-tip="PewBeam" aria-label="PewBeam" class:on={session.workspace.appearance.desk === "pewbeam"} onclick={() => session.setAppearance({ desk: "pewbeam" })}>
        {@render icon("pew")}
      </button>
      <button type="button" data-tip="OBS" aria-label="OBS" class:on={session.workspace.appearance.desk === "obs"} onclick={() => session.setAppearance({ desk: "obs" })}>
        {@render icon("obs")}
      </button>
      <button type="button" data-tip="Displays" aria-label="Displays" onclick={() => session.openSettings("displays")}>
        {@render icon("outputs")}
      </button>
      <button type="button" data-tip="Look" aria-label="Look" onclick={() => session.openSettings("appearance")}>
        {@render icon("themes")}
      </button>
      <button type="button" data-tip="Alerts" aria-label="Alerts" onclick={() => (sheet = sheet === "alerts" ? null : "alerts")}>
        {@render icon("alerts")}
      </button>
      <button type="button" data-tip="Help" aria-label="Help" onclick={() => (sheet = sheet === "help" ? null : "help")}>
        {@render icon("help")}
      </button>
      <button type="button" data-tip="Settings" aria-label="Settings" onclick={() => session.openSettings("appearance")}>
        {@render icon("settings")}
      </button>
    </nav>
  </header>

  {#if mode === "songs"}
    <section class="pb-songs">
      <div class="song-desk">
        <form class="song-editor" onsubmit={saveSong}>
          <span class="note-icon">{@render icon("note")}</span>
          <h1>Songs</h1>
          <p>Write a lyric, preview it, then add it to the queue. LIVE sends the preview to program.</p>
          {#if note}<p>{note}</p>{/if}
          <input aria-label="Song title" placeholder="Song title" bind:value={songTitle} />
          <input aria-label="Song author" placeholder="Author" bind:value={songAuthor} />
          {#each songSections as section, index (section.id)}
            <input aria-label="Section label" bind:value={section.label} />
            <textarea
              aria-label="{section.label} lines"
              rows="4"
              placeholder="One lyric line per row"
              value={section.lines.join("\n")}
              oninput={(event) => {
                songSections[index] = { ...section, lines: event.currentTarget.value.split("\n") };
                songSections = songSections;
              }}
            ></textarea>
            <div class="song-actions">
              <button type="button" onclick={() => (songSections = moveSongSection({ id: "", title: "", author: "", sections: songSections }, section.id, -1).sections)}>Up</button>
              <button type="button" onclick={() => (songSections = moveSongSection({ id: "", title: "", author: "", sections: songSections }, section.id, 1).sections)}>Down</button>
              <button type="button" onclick={() => (songSections = removeSongSection({ id: "", title: "", author: "", sections: songSections }, section.id).sections)}>Remove</button>
            </div>
          {/each}
          <div class="song-actions">
            <button type="button" onclick={() => addSongSection("verse")}>Verse</button>
            <button type="button" onclick={() => addSongSection("chorus")}>Chorus</button>
            <button type="button" onclick={() => addSongSection("bridge")}>Bridge</button>
            <button type="button" onclick={() => addSongSection("tag")}>Tag</button>
            <button type="button" onclick={previewDraft}>Preview</button>
            <button type="submit">Save song</button>
          </div>
        </form>
        <div class="song-library">
          <input aria-label="Search songs" placeholder="Search songs" bind:value={songQuery} />
          {#if visibleSongs.length === 0}
            <p class="song-empty">No songs yet.</p>
          {/if}
          <ul class="song-list">
            {#each visibleSongs as song (song.id)}
              {#each song.sections as section (section.id)}
                <li>
                  <button type="button" onclick={() => session.previewSongSection(song, section.id)}>
                    <strong>{song.title || "Untitled song"}</strong>
                    <span>{section.label}{song.author ? ` · ${song.author}` : ""}</span>
                  </button>
                  <button type="button" onclick={() => void queueSong(song, section)}>Queue</button>
                </li>
              {/each}
            {/each}
          </ul>
        </div>
        <aside class="song-stage">
          <header>
            <span>Preview{session.songPlace() ? ` · ${session.songPlace()}` : ""}</span>
            <span class="song-step">
              <button type="button" aria-label="Previous section" onclick={() => session.stepSong(-1)}>Previous</button>
              <button type="button" aria-label="Next section" onclick={() => session.stepSong(1)}>Next</button>
            </span>
          </header>
          <div class="monitor"><Screen model={session.live.preview.model} /></div>
          <header>Main Output</header>
          <div class="monitor"><Screen model={session.live.program.model} /></div>
        </aside>
      </div>
    </section>
  {:else}
    <div class="pb-grid">
      <div class="pb-col left">
        <div class="pb-split">
          <section class="pb-panel">
            <header class="pb-head"><span>Live transcript</span>{@render expand("transcript")}</header>
            <div class="pb-body transcript">
              {#if listening || heard}
                <p class="heard">{heard || "Speak a verse."}</p>
                {#if listening}
                  <div class="meter" aria-hidden="true"><span style="width: {Math.max(4, Math.round(micLevel * 100))}%"></span></div>
                {/if}
              {/if}
              {#if listenNote}<p class="listen-note">{listenNote}</p>{/if}
              {#if reading.length === 0}
                <p>{note || "Search a reference, or listen for a verse."}</p>
              {:else}
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              {/if}
            </div>
            <footer class="pb-foot">
              <button type="button" class="go" class:on={listening} onclick={toggleVoice}>
                {@render icon(listening ? "mic-off" : "mic")}
                {listening ? "Stop listening" : "Listen"}
              </button>
              <button type="button" class="go" onclick={() => void findInScripture()}>{@render icon("wave")} Find</button>
            </footer>
          </section>
          <section class="pb-panel">
            <header class="pb-head">
              <span>Recent detections</span>
              <button type="button" class="quiet" onclick={() => (detections = [])}>× Clear all</button>
            </header>
            <div class="pb-body detections">
              {#each detections as hit (`${hit.bookOrd}-${hit.chapter}-${hit.verse}`)}
                <button type="button" onclick={() => openHit(hit)}>
                  <strong>{hit.bookName} {hit.chapter}:{hit.verse}</strong>
                  <span>{hit.text}</span>
                </button>
              {/each}
            </div>
          </section>
        </div>

        {#if mode === "scriptures"}
          <section class="pb-panel scriptures">
            <form class="script-bar" onsubmit={lookup}>
              <select bind:value={translationId} aria-label="Translation">
                {#if session.translations.length === 0}
                  <option value="kjv">KJV</option>
                {:else}
                  {#each session.translations as translation (translation.id)}
                    <option value={translation.id}>{translation.abbreviation}</option>
                  {/each}
                {/if}
              </select>
              <button type="button" class="mini" aria-label="Edit reference" onclick={() => document.querySelector<HTMLInputElement>('[aria-label="Bible search"]')?.select()}>{@render icon("book")}</button>
              <button type="button" class="mini" class:on={wrapVerses} aria-label="Verse layout" onclick={() => (wrapVerses = !wrapVerses)}>{@render icon("columns")}</button>
              <input aria-label="Bible search" bind:value={query} />
              <button type="button" class="mini" aria-label="Previous chapter" onclick={() => moveChapter(-1)}>{@render icon("chevron-left")}</button>
              <button type="button" class="mini" aria-label="Next chapter" onclick={() => moveChapter(1)}>{@render icon("chevron-right")}</button>
            </form>
            {#if note}<p class="script-note">{note}</p>{/if}
            <div class="verse-list" class:wrap={wrapVerses}>
              {#each verses as verse (verse.verse)}
                <button
                  type="button"
                  class="verse"
                  class:picked={start !== null && verse.verse >= start && verse.verse <= (end ?? start)}
                  onclick={(event) => pick(verse.verse, event.shiftKey)}
                >
                  <span>{verse.verse}</span>
                  <span>{verse.text}</span>
                </button>
              {/each}
            </div>
          </section>
        {:else}
          <section class="pb-panel slides">
            <div class="slide-bar">
              <button type="button" class="create" onclick={() => void createSlide()}>+ Create new</button>
              <input placeholder="Search for slide title or content" aria-label="Search slides" bind:value={slideQuery} />
            </div>
            <div class="slide-row">
              {#each visibleSlides as item, index (item.id)}
                <button type="button" class="card" class:hot={index % 3 !== 2} class:cool={index % 3 === 2} onclick={() => open(item)}>
                  <strong>{item.title}</strong>
                  <span>{item.kind === "announcement" ? "Announcement" : "Slide"}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      </div>

      <div class="pb-col mid">
        <section class="pb-panel">
          <header class="pb-head"><span>Live display</span>{@render expand("display")}</header>
          <div class="pb-body display">
            {#if mode === "scriptures"}
              <article class="reading">
                <p class="reading-ref">{passage()?.reference ?? query}</p>
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              </article>
            {:else if visibleSlides.length > 0}
              <div class="display-grid">
                {#each visibleSlides.slice(0, 4) as item, index (item.id)}
                  <button type="button" class="tile" class:cool={index % 2 === 0} class:hot={index % 2 === 1} onclick={() => open(item)}>
                    {item.title}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </section>
        <section class="pb-panel">
          <header class="pb-head"><span>Preview</span>{@render expand("preview")}</header>
          <div class="monitor"><Screen model={session.live.preview.model} /></div>
        </section>
      </div>

      <div class="pb-col right">
        <section class="pb-panel output">
          <header class="pb-head">
            <span class="output-name">Main Output</span>
            <button
              type="button"
              class="style-name"
              data-tip="Frame or lower third. Preview only until you Take."
              onclick={() => session.saveTheme({ ...session.theme(), layout: session.theme().layout === "lower-third" ? "frame" : "lower-third" })}
            >
              {themeName} · {session.theme().layout === "lower-third" ? "Lower third" : "Frame"}
            </button>
          </header>
          <div class="monitor main"><Screen model={session.live.program.model} /></div>
          <footer class="output-tools">
            <button type="button" class="lex" onclick={() => (sheet = sheet === "lexicon" ? null : "lexicon")}>{@render icon("book")} Lexicon</button>
            <span class="steppers">
              <button type="button" aria-label="Previous" onclick={() => void stepOutput(-1)}>{@render icon("chevron-left")}</button>
              <button type="button" aria-label="Next" onclick={() => void stepOutput(1)}>{@render icon("chevron-right")}</button>
            </span>
          </footer>
        </section>
        <section class="pb-panel">
          <header class="pb-head">
            <span>Queue</span>
            <span class="queue-actions">
              <button type="button" class="quiet" onclick={() => void queuePassage()}>+ Add</button>
              <button type="button" class="quiet" onclick={() => session.clearQueue()}>× Clear all</button>
            </span>
          </header>
          <div class="pb-body queue">
            {#each queue as item (item.id)}
              <button type="button" class:on={session.cursor.itemId === item.id} onclick={() => open(item)}>{item.title}</button>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
  {#if sheet}
    <div class="sheet" role="dialog" aria-label={sheet}>
      <header>
        <strong>{sheet === "help" ? "How this desk works" : sheet === "alerts" ? "Alerts" : "Lexicon"}</strong>
        <button type="button" onclick={() => (sheet = null)}>Close</button>
      </header>
      {#if sheet === "help"}
        <p>Click a verse to put it on Preview. Shift-click a second verse to select a range.</p>
        <p>LIVE copies Preview onto Program. BLACK and CLEAR change Program only.</p>
        <p>Search a reference such as John 3:16, or a phrase such as “in the beginning”.</p>
        <p>Listen matches spoken scripture on Preview. It never takes Program by itself.</p>
        <p>+ Add puts the current passage in the queue without changing Program.</p>
      {:else if sheet === "alerts"}
        <p>{note || "No alerts."}</p>
        <p>{session.message}</p>
      {:else}
        {#each reading as verse (verse.verse)}
          <p><sup>{verse.verse}</sup> {verse.text}</p>
        {/each}
        <p class="sheet-ref">{passage()?.reference ?? ""} · {translationId.toUpperCase()}</p>
      {/if}
    </div>
  {/if}
</div>

{#snippet expand(panel: "transcript" | "display" | "preview")}
  <button type="button" class="mini ghost" aria-label="Expand" onclick={() => (expanded = expanded === panel ? null : panel)}>{@render icon("expand")}</button>
{/snippet}

{#snippet icon(name: string)}
  <Icon {name} size={16} />
{/snippet}

<style>
  .pb {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 13px;
  }
  .pb-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
    padding: 10px 14px 12px;
    flex: none;
  }
  .pb-modes { display: flex; align-items: center; gap: 4px; }
  .pb-modes button {
    border: 0;
    background: transparent;
    color: var(--muted);
    border-radius: 999px;
    padding: 7px 14px;
    font-weight: 560;
    font-size: 14px;
  }
  .pb-modes button.on { background: var(--accent); color: white; }
  .pb-actions { margin-left: auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .audience-owner { margin: 0; color: var(--muted); font-size: 12px; }
  .pb-actions > button {
    border: 1px solid transparent;
    border-radius: 999px;
    min-width: 78px;
    height: 34px;
    padding: 0 14px;
    font-weight: 650;
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .live { background: var(--live); color: white; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: white; }
  .black { background: var(--line); color: var(--ink); }
  .clear { background: transparent; color: var(--accent); border-color: var(--accent); }
  .pb-tools { display: flex; align-items: center; gap: 6px; margin-left: 4px; flex: none; }
  .pb-tools button {
    width: 36px;
    height: 36px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
    display: grid;
    place-items: center;
    padding: 0;
  }
  .pb-tools button.on { color: var(--accent); border-color: var(--accent); }
  .pb-tools :global(svg), .mini :global(svg), .lex :global(svg), .go :global(svg), .steppers :global(svg) {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pb-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(220px, 0.9fr) minmax(220px, 0.78fr);
    gap: 10px;
    padding: 0 12px 12px;
  }
  .pb-col { min-width: 0; min-height: 0; display: grid; gap: 10px; }
  .left { grid-template-rows: minmax(120px, 0.82fr) minmax(180px, 1.15fr); }
  .mid, .right { grid-template-rows: minmax(0, 0.85fr) minmax(160px, 1fr); }
  .expand-preview .mid { grid-template-rows: minmax(0, 0.25fr) minmax(0, 1fr); }
  .expand-display .mid { grid-template-rows: minmax(0, 1fr) minmax(120px, 0.35fr); }
  .expand-transcript .left { grid-template-rows: minmax(180px, 1.1fr) minmax(140px, 0.7fr); }
  @media (max-width: 1080px) {
    .pb-grid { grid-template-columns: minmax(0, 1fr); overflow: auto; }
    .pb-col { min-height: 280px; }
  }
  .pb-split { min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pb-panel {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .pb-head, .pb-foot, .script-bar, .slide-bar, .output-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 10px;
    color: var(--muted);
    font-size: 13px;
  }
  .pb-head { justify-content: space-between; }
  .pb-body { flex: 1; min-height: 0; }
  .quiet, .mini, .round, .go, .lex, .create {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
  }
  .go { color: var(--presence); display: inline-flex; align-items: center; gap: 6px; font-weight: 560; }
  .go.on { color: var(--accent); }
  .pb-foot { justify-content: space-between; border-top: 1px solid var(--line); }
  .round { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--line); }
  .mini {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--muted);
    display: grid;
    place-items: center;
    flex: none;
  }
  .mini.on { color: var(--accent); border-color: var(--accent); }
  .script-bar, .slide-bar { padding: 8px; }
  select, .script-bar input, .slide-bar input {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
  }
  select { width: 88px; }
  .script-bar input, .slide-bar input { flex: 1; min-width: 0; }
  .verse-list, .queue { overflow: auto; padding: 4px 8px 8px; display: flex; flex-direction: column; gap: 6px; }
  .verse, .queue button, .card, .tile {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 8px;
    text-align: left;
  }
  .verse {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
    padding: 8px 10px;
  }
  .verse span:first-child { color: var(--accent); font-weight: 650; }
  .verse span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verse-list.wrap .verse span:last-child {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .script-note { margin: 0; padding: 0 12px 4px; color: var(--muted); font-size: 12px; }
  .transcript, .reading, .detections { overflow: auto; padding: 8px 12px 12px; }
  .transcript p, .reading p { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
  .heard { color: var(--accent); font-style: italic; }
  .listen-note { color: var(--muted); font-size: 12px; }
  .meter {
    height: 4px;
    border-radius: 999px;
    background: var(--line);
    overflow: hidden;
    margin: 0 0 10px;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 80ms linear;
  }
  .transcript sup, .reading sup, .sheet sup { color: var(--accent); font-size: 0.75em; margin-right: 4px; }
  .reading-ref, .sheet-ref { color: var(--mustard); font-size: 12px; letter-spacing: 0.04em; }
  .detections { display: flex; flex-direction: column; gap: 6px; }
  .detections button {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 8px;
    text-align: left;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .detections span { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .queue-actions { display: flex; gap: 8px; }
  .verse.picked { border-color: var(--accent); }
  .display { padding: 12px; }
  .display-grid { height: 100%; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
  .tile, .card {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 12px;
    min-height: 72px;
    color: white;
    font-weight: 600;
  }
  .hot { background: linear-gradient(160deg, #ff8a3d, #ff5a1f); border-color: transparent; }
  .cool { background: linear-gradient(160deg, #1aa8a0, #0e6e74); border-color: transparent; }
  .slide-row { display: flex; gap: 10px; overflow: auto; padding: 4px 10px 12px; }
  .card { width: 180px; flex: none; min-height: 108px; }
  .card span, .tile { font-weight: 500; }
  .card span { font-size: 12px; opacity: 0.85; }
  .create { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); }
  .monitor {
    flex: 1;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
    padding: 8px 12px 12px;
  }
  .monitor :global(.ratio) {
    width: min(100cqw, calc(100cqh * 16 / 9));
    max-height: 100cqh;
    border-radius: 10px;
    overflow: hidden;
    background: #050505;
  }
  .output-name::after { content: " ▾"; font-size: 10px; }
  .style-name {
    margin-left: auto;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 10px;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  .output-tools { justify-content: space-between; padding-bottom: 10px; flex: none; position: relative; z-index: 1; }
  .lex, .steppers button {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
  }
  .steppers { display: flex; gap: 6px; }
  .steppers button { width: 32px; padding: 0; justify-content: center; }
  .queue button { padding: 8px 10px; }
  .queue button.on { border-color: var(--accent); }
  .pb-songs {
    flex: 1;
    min-height: 0;
    margin: 0 12px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background-color: var(--desk);
    background-image: radial-gradient(var(--line) 1.1px, transparent 1.2px);
    background-size: 18px 18px;
    overflow: auto;
  }
  .song-desk {
    width: min(920px, 100%);
    margin: 28px auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(220px, 0.8fr);
    gap: 18px;
    padding: 0 18px 24px;
  }
  .song-editor, .song-library {
    background: rgba(20, 20, 20, 0.92);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .note-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: var(--accent);
    border: 1.5px solid var(--accent);
    border-radius: 10px;
  }
  .note-icon :global(svg) { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; }
  .song-editor h1 { margin: 4px 0 0; font-size: 20px; font-weight: 650; }
  .song-editor p, .song-empty { margin: 0; color: var(--muted); line-height: 1.45; }
  .song-editor input, .song-editor textarea, .song-library input {
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 8px 10px;
  }
  .song-stage { display: flex; flex-direction: column; gap: 8px; min-height: 420px; }
  .song-stage header { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .song-step { display: flex; gap: 6px; }
  .song-step button { width: auto; padding: 4px 8px; }
  .song-actions { display: flex; gap: 8px; }
  .song-actions button, .song-list li button:last-child {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    padding: 0 12px;
  }
  .song-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .song-list li { display: flex; gap: 8px; }
  .song-list li button:first-child {
    flex: 1;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--field);
    color: white;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .song-list span { color: var(--muted); font-size: 12px; }
  .sheet {
    position: absolute;
    right: 16px;
    top: 64px;
    width: min(360px, calc(100% - 32px));
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 14px;
    z-index: 5;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  }
  .sheet header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .sheet header button { border: 0; background: transparent; color: var(--accent); }
  .sheet p { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
  .pb { position: relative; }
  @media (max-width: 980px) {
    .song-desk { grid-template-columns: 1fr; }
  }
</style>
