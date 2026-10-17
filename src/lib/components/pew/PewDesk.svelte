<script lang="ts">
  import AlertsDialog from "../AlertsDialog.svelte";
  import TimerControls from "../TimerControls.svelte";
  import { findItem } from "../../domain/service";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import { session } from "../../app/session.svelte";
  import { stepVerse } from "../../bible/passage";
  import { formatReference, parseReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import { attachSermonItem, deskNotes, moveSermonSection, removeSermonSection, sanitizeSermon, searchSermonHits } from "../../domain/sermon";
  import { moveSongSection, parseLyrics, removeSongSection } from "../../domain/song";
  import type { BibleItem, PresentationItem, SearchHit, Sermon, SermonSection, Song, SongSection, SongSectionKind, TextStyle, VerseText } from "../../domain/types";
  import { untrack } from "svelte";
  import { canUse } from "../../platform/capabilities";
  import { bundledQuoteCatalog } from "../../bible/texts";
  import { buildQuoteIndex, chooseHeard, detectVerse, type QuoteIndex } from "../../voice/detect";
  import DeskSwitcher from "../DeskSwitcher.svelte";
  import Icon from "../Icon.svelte";
  import OutputControls from "../OutputControls.svelte";
  import OutputType from "../OutputType.svelte";
  import Screen from "../Screen.svelte";
  import { Pane, PaneGroup, PaneResizer } from "paneforge";
  import { LIBRARY_PANEL, QUEUE_PANEL, mergeColumns, mergeSplit, panelOpen } from "../../workspace/pew";

  type Mode = "scriptures" | "songs" | "sermon";
  type DraftSermonSection = {
    id: string;
    name: string;
    notes: string;
    heading: string;
    body: string;
    attached: PresentationItem | null;
    scripture: string;
    imageId: string;
  };

  let mode = $state<Mode>("scriptures");
  let translationId = $state("kjv");
  let bookOrd = $state(1);
  let chapter = $state(1);
  let verses = $state<VerseText[]>([]);
  let start = $state<number | null>(1);
  let end = $state<number | null>(1);
  let anchor = $state<number | null>(1);
  let query = $state("Genesis 1");
  let detections = $state<SearchHit[]>([]);
  let note = $state("Loading scripture…");
  let sheet = $state<"help" | "lexicon" | "type" | null>(null);
  let songTitle = $state("");
  let songAuthor = $state("");
  let songSections = $state<SongSection[]>([{ id: crypto.randomUUID(), kind: "verse", label: "Verse 1", lines: [""] }]);
  let songQuery = $state("");
  let sermonId = $state("");
  let sermonTitle = $state("");
  let sermonSpeaker = $state("");
  let sermonNotes = $state("");
  let sermonSections = $state<DraftSermonSection[]>([
    { id: crypto.randomUUID(), name: "Opening", notes: "", heading: "", body: "", attached: null, scripture: "", imageId: "" },
  ]);
  let sermonQuery = $state("");
  let wrapVerses = $state(false);
  let chapterToken = 0;
  let seededChapterPreview = false;
  let takeAfterPreview = false;
  let quoteIndex: QuoteIndex | null = null;
  let lastSpokenRef = "";

  const book = $derived(session.books.find((entry) => entry.ord === bookOrd) ?? session.books[0]);
  const themeName = $derived(session.theme().name.toUpperCase());
  const displayLive = $derived(
    session.output.online && session.live.program.model.layout !== "black" && session.live.program.model.layout !== "empty",
  );
  const activeLayout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const libraryVisible = $derived(panelOpen(activeLayout, LIBRARY_PANEL));
  const queueVisible = $derived(panelOpen(activeLayout, QUEUE_PANEL));
  const focus = $derived(session.workspace.pew.focus);
  const showLibrary = $derived(libraryVisible && !focus);
  const showReading = $derived(!focus);
  const showQueue = $derived(queueVisible && !focus);
  let epoch = $state(0);
  let frozen = $state(session.workspace.pew);
  let applying = false;
  let chromeReady = false;
  const chrome = $derived(
    `${Number(focus)}:${Number(showLibrary)}:${Number(showQueue)}:${session.workspace.activeLayoutId}`,
  );

  function retarget() {
    applying = true;
    frozen = untrack(() => session.workspace.pew);
    epoch += 1;
  }

  function onColumns(reported: number[]) {
    if (applying || focus) return;
    session.savePew({ columns: mergeColumns(session.workspace.pew.columns, reported, showLibrary) });
  }

  function onLibrarySplit(reported: number[]) {
    if (applying || focus) return;
    session.savePew({ librarySplit: mergeSplit(session.workspace.pew.librarySplit, reported) });
  }

  function onStageSplit(reported: number[]) {
    if (applying || focus) return;
    session.savePew({ stageSplit: mergeSplit(session.workspace.pew.stageSplit, reported) });
  }

  function onProgramSplit(reported: number[]) {
    if (applying || focus) return;
    session.savePew({ programSplit: mergeSplit(session.workspace.pew.programSplit, reported) });
  }

  function share(part: number, other: number): number {
    const sum = part + other;
    return sum > 0 ? (part / sum) * 100 : 50;
  }

  $effect(() => {
    chrome;
    if (!chromeReady) {
      chromeReady = true;
      frozen = untrack(() => session.workspace.pew);
      return;
    }
    retarget();
  });

  $effect(() => {
    epoch;
    queueMicrotask(() => {
      applying = false;
    });
  });
  const queue = $derived(session.service?.sections.flatMap((section) => section.items) ?? []);
  const reading = $derived(
    verses.filter((verse) => start !== null && verse.verse >= start && verse.verse <= (end ?? start)),
  );
  const visibleSongs = $derived(
    session.songs.filter((song) =>
      `${song.title} ${song.author}`.toLowerCase().includes(songQuery.trim().toLowerCase()),
    ),
  );
  const sermonHits = $derived(
    sermonQuery.trim()
      ? searchSermonHits(session.sermons, sermonQuery)
      : session.sermons.flatMap((sermon) =>
          sermon.sections.map((section) => ({
            sermonId: sermon.id,
            sectionId: section.id,
            title: sermon.title || "Untitled sermon",
            speaker: sermon.speaker,
            label: section.name,
            snippet: "",
          })),
        ),
  );
  const operatorNotes = $derived(
    deskNotes(draftSermon(), session.sermonFocus?.sectionId) || session.sermonDeskNotes(),
  );

  $effect(() => {
    const first = session.translations[0];
    if (first && !session.translations.some((entry) => entry.id === translationId)) translationId = first.id;
  });

  $effect(() => {
    const id = translationId;
    void bundledQuoteCatalog(id).then((rows) => {
      if (id === translationId) quoteIndex = buildQuoteIndex(rows);
    });
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
        if (rows.some((row) => row.verse === from)) {
          const layout = session.live.preview.model.layout;
          const skipSeed = !seededChapterPreview && layout !== "black" && layout !== "empty";
          seededChapterPreview = true;
          if (!skipSeed) void showPassage(from, Math.max(from, to));
        }
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
    if (mode === "sermon") {
      await session.stepSermon(direction);
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

  // Presenter Desk is the words desk. Slides, media and Looks live on the Production Desk.
  const modes = $derived<{ id: Mode; label: string }[]>([
    { id: "scriptures", label: "Scriptures" },
    { id: "songs", label: "Songs" },
    ...(canUse("sermon") ? [{ id: "sermon" as const, label: "Sermon" }] : []),
  ]);

  function pickMode(next: Mode) {
    mode = next;
    if (next !== "scriptures") return;
    const item = passage();
    if (item) void session.previewPassage(item);
  }

  function onModeKey(event: KeyboardEvent) {
    if (!event.altKey || event.metaKey || event.ctrlKey || session.settingsOpen) return;
    const index = ["Digit1", "Digit2", "Digit3"].indexOf(event.code);
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (index < 0 || !modes[index] || target?.closest('[aria-modal="true"]')) return;
    event.preventDefault();
    pickMode(modes[index]!.id);
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

  let pasteText = $state("");

  /** Replace the draft with sections parsed from pasted text or a ChordPro/text file. */
  function applyLyrics(text: string) {
    const parsed = parseLyrics(text);
    if (!parsed.sections.length) {
      note = "No lyrics found. Paste lines of a song, with a blank line between sections.";
      return;
    }
    songSections = parsed.sections;
    if (!songTitle.trim() && parsed.title) songTitle = parsed.title;
    if (!songAuthor.trim() && parsed.author) songAuthor = parsed.author;
    pasteText = "";
    note = `${parsed.sections.length} section${parsed.sections.length === 1 ? "" : "s"} ready. Check the labels, then Save song.`;
  }

  async function importLyricFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 512 * 1024) {
      note = `${file.name} is too large for a lyric file.`;
      return;
    }
    applyLyrics(await file.text());
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
    const areas = [...form.querySelectorAll<HTMLTextAreaElement>("textarea:not([aria-label='Paste lyrics'])")];
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

  // Voice runs in the session (both desks). This desk turns heard words into verses on Preview.
  function detectSpokenVerse(text: string, _final: boolean, alternatives: string[]) {
    if (!text) return;
    const quoted = quoteIndex ? chooseHeard(alternatives.length ? alternatives : [text], quoteIndex, translationId) : null;
    const openChapter = !quoted && book ? detectVerse(text, verses, book, chapter, translationId) : null;
    const match = quoted ?? (openChapter ? { item: openChapter, text } : null);
    if (!match) {
      if (!lastSpokenRef) session.voice.message = quoteIndex ? "Hearing you. Keep reading the verse." : "Loading the Bible so a verse can be found…";
      return;
    }
    const hit = match.item;
    if (hit.reference === lastSpokenRef) return;
    lastSpokenRef = hit.reference;
    const named = session.books.find((entry) => entry.ord === hit.bookOrd)?.name ?? hit.reference;
    if (hit.bookOrd !== bookOrd || hit.chapter !== chapter) {
      bookOrd = hit.bookOrd;
      chapter = hit.chapter;
    }
    anchor = hit.startVerse;
    session.voice.message = `${hit.reference} is on Preview. LIVE still sends Program.`;
    detections = [
      { bookOrd: hit.bookOrd, bookName: named, chapter: hit.chapter, verse: hit.startVerse, text: match.text },
      ...detections,
    ].slice(0, 12);
    // A pending arrow-key Take must never carry a spoken verse to Program.
    takeAfterPreview = false;
    void showPassage(hit.startVerse, hit.endVerse);
  }

  const voiceActive = $derived(session.voice.status === "listening" || session.voice.status === "starting");

  $effect(() => {
    const stopHeard = session.onVoiceHeard(detectSpokenVerse);
    const stopDesk = session.attachVoiceDesk(async (request) => {
      if (request.kind === "library") {
        mode = request.tab === "songs" ? "songs" : "scriptures";
        return true;
      }
      if (request.kind === "translation") {
        if (!session.translations.some((entry) => entry.id === request.id)) return false;
        translationId = request.id;
        // Re-read the verse on Preview in the new translation; Program waits for LIVE.
        const item = passage();
        if (item) await session.previewPassage(item);
        return true;
      }
      mode = "scriptures";
      query = request.query;
      takeAfterPreview = false;
      await findInScripture();
      return true;
    });
    return () => {
      stopHeard();
      stopDesk();
    };
  });

  function toggleVoice() {
    if (!voiceActive) lastSpokenRef = "";
    void session.toggleVoice();
  }

  async function queueSong(song: Song, section: SongSection) {
    await ensureService("Songs");
    session.addLyric(song.id, section.id, `${song.title} — ${section.label}`);
    note = `${song.title} added to the queue.`;
  }

  function emptyDraftSection(name = "Section"): DraftSermonSection {
    return { id: crypto.randomUUID(), name, notes: "", heading: "", body: "", attached: null, scripture: "", imageId: "" };
  }

  function draftSermon(): Sermon {
    return sanitizeSermon({
      id: sermonId || crypto.randomUUID(),
      title: sermonTitle,
      speaker: sermonSpeaker,
      notes: sermonNotes,
      sections: sermonSections.map((section) => {
        const heading = section.heading.trim() || section.name.trim() || "Sermon";
        const slide: PresentationItem = {
          id: `${section.id}-slide`,
          kind: "slide",
          title: heading,
          slide: { heading, body: section.body, imageId: null },
        };
        return {
          id: section.id,
          name: section.name,
          notes: section.notes,
          items: section.attached ? [section.attached, slide] : [slide],
        };
      }),
      updatedAt: new Date().toISOString(),
    });
  }

  function hydrateSermon(doc: Sermon) {
    sermonId = doc.id;
    sermonTitle = doc.title;
    sermonSpeaker = doc.speaker;
    sermonNotes = doc.notes;
    sermonSections = doc.sections.map((section) => {
      const attached = section.items.find((item) => item.kind === "bible" || item.kind === "image") ?? null;
      const slide = section.items.find((item) => item.kind === "slide");
      return {
        id: section.id,
        name: section.name,
        notes: section.notes,
        heading: slide?.slide?.heading ?? "",
        body: slide?.slide?.body ?? "",
        attached,
        scripture: attached?.bible?.reference ?? "",
        imageId: attached?.image?.assetId ?? "",
      };
    });
  }

  function applySermonDraft(doc: Sermon, sectionId: string, message: string) {
    hydrateSermon(doc);
    previewSermonDraft(sectionId);
    note = message;
  }

  function attachScripture(sectionId: string, raw: string) {
    const parsed = parseReference(raw);
    if (!parsed) {
      note = "Could not read that reference.";
      return;
    }
    const start = parsed.startVerse ?? 1;
    const end = parsed.endVerse ?? start;
    const chapters = session.books.find((entry) => entry.ord === parsed.bookOrd)?.chapters ?? 150;
    const reference = formatReference(parsed.bookName, parsed.chapter, start, end, chapters);
    const item: PresentationItem = {
      id: crypto.randomUUID(),
      kind: "bible",
      title: reference,
      bible: {
        translationId,
        bookOrd: parsed.bookOrd,
        chapter: parsed.chapter,
        startVerse: start,
        endVerse: end,
        reference,
      },
    };
    applySermonDraft(attachSermonItem(draftSermon(), sectionId, item), sectionId, `${reference} on Preview. LIVE still sends Program.`);
  }

  function attachImage(sectionId: string, assetId: string) {
    const asset = session.media.find((entry) => entry.id === assetId);
    if (!asset) {
      note = "Import an image in Settings first.";
      return;
    }
    const item: PresentationItem = { id: crypto.randomUUID(), kind: "image", title: asset.name, image: { assetId: asset.id } };
    applySermonDraft(attachSermonItem(draftSermon(), sectionId, item), sectionId, `${asset.name} on Preview. LIVE still sends Program.`);
  }

  function detachSection(sectionId: string) {
    sermonSections = sermonSections.map((section) =>
      section.id === sectionId ? { ...section, attached: null, scripture: "", imageId: "" } : section,
    );
    previewSermonDraft(sectionId);
    note = "Attachment removed. Heading goes to Preview.";
  }

  async function saveSermonForm(event?: Event) {
    event?.preventDefault();
    try {
      const doc = draftSermon();
      sermonId = doc.id;
      const saved = await session.saveSermon(doc);
      if (!saved) {
        note = session.message;
        return;
      }
      note = `${doc.title} saved. Notes stay on this desk.`;
    } catch (error) {
      note = error instanceof Error ? error.message : "Could not save the sermon.";
    }
  }

  function previewSermonDraft(sectionId: string) {
    const doc = draftSermon();
    sermonId = doc.id;
    void session.previewSermonSection(doc, sectionId);
  }

  async function queueSermonSection(doc: Sermon, section: SermonSection) {
    await ensureService("Sermon");
    session.addSermonSection(section, `${doc.title} — ${section.name}`);
    note = `${section.name} added to the queue. Notes were not queued.`;
  }
  let alertsOpen = $state(false);
</script>

<svelte:window onkeydown={onModeKey} />

<div class="pb" class:focus>
  <header class="pb-bar">
    <nav class="pb-modes" aria-label="Library">
      {#each modes as entry, index (entry.id)}
        <button
          type="button"
          class:on={mode === entry.id}
          aria-pressed={mode === entry.id}
          aria-keyshortcuts={`Alt+${index + 1}`}
          data-tip={`${entry.label} (Alt+${index + 1})`}
          onclick={() => pickMode(entry.id)}
        >{entry.label}</button>
      {/each}
    </nav>
    <div class="pb-actions">
      <OutputControls compact />
      {#if !session.controlsAudience}
        <button type="button" class="desk-btn" data-tip="Send from this window after you Take" onclick={() => session.claimAudience()}>Take control</button>
      {/if}
      <button type="button" class="desk-btn primary live" class:on-air={displayLive} data-tip={displayLive ? "Audience display is live" : "Send preview to program"} onclick={() => session.take()}><span class="pip"></span>LIVE</button>
      <button type="button" class="desk-btn danger" data-tip="Black program" onclick={() => session.black()}>BLACK</button>
      <button type="button" class="desk-btn ghost" data-tip="Clear program" onclick={() => session.clear()}>CLEAR</button>
    </div>
    <nav class="pb-tools" aria-label="Tools">
      <button type="button" class="desk-btn icon" class:on={libraryVisible} aria-pressed={libraryVisible} aria-label={libraryVisible ? "Hide library" : "Show library"} data-tip={libraryVisible ? "Hide library" : "Show library"} onclick={() => session.togglePanel(LIBRARY_PANEL)}>
        <Icon name="library" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={queueVisible} aria-pressed={queueVisible} aria-label={queueVisible ? "Hide queue" : "Show queue"} data-tip={queueVisible ? "Hide queue" : "Show queue"} onclick={() => session.togglePanel(QUEUE_PANEL)}>
        <Icon name="queue" size={16} />
      </button>
      <button type="button" class="desk-btn icon" class:on={focus} aria-pressed={focus} aria-label={focus ? "Leave focus" : "Focus preview and program"} data-tip={focus ? "Leave focus" : "Focus preview and program"} onclick={() => session.savePew({ focus: !focus })}>
        <Icon name="focus" size={16} />
      </button>
      <button type="button" class="desk-btn icon" aria-label="Reset workspace" data-tip="Reset workspace" onclick={() => session.resetActiveLayout()}>
        <Icon name="reset" size={16} />
      </button>
      <DeskSwitcher />
      <button type="button" class="desk-btn icon secondary" data-tip="Displays" aria-label="Displays" onclick={() => session.openSettings("displays")}>
        {@render icon("outputs")}
      </button>
      <button type="button" class="desk-btn icon secondary" data-tip="Look" aria-label="Look" onclick={() => session.openSettings("appearance")}>
        {@render icon("themes")}
      </button>
      <button
        type="button"
        class="desk-btn icon secondary alerts-btn"
        class:on={!!session.alert}
        aria-pressed={!!session.alert}
        data-tip={session.alert ? `Alert on Program: ${session.alert.text}` : "Alert on Program (nursery, car lights…)"}
        aria-label="Alerts"
        onclick={() => (alertsOpen = true)}
      >
        {@render icon("alerts")}
      </button>
      <button type="button" class="desk-btn icon secondary" data-tip="Help" aria-label="Help" onclick={() => (sheet = sheet === "help" ? null : "help")}>
        {@render icon("help")}
      </button>
      <button type="button" class="desk-btn icon" data-tip="Settings" aria-label="Settings" onclick={() => session.openSettings("appearance")}>
        {@render icon("settings")}
      </button>
    </nav>
  </header>

  {#if mode === "sermon"}
    <section class="pb-songs">
      <div class="song-desk">
        <form class="song-editor" onsubmit={saveSermonForm}>
          <span class="note-icon">{@render icon("book")}</span>
          <h1>Sermon</h1>
          <p>Notes stay on this desk. Attach scripture or an image for Preview. LIVE still sends Program.</p>
          {#if note}<p>{note}</p>{/if}
          <input aria-label="Sermon title" placeholder="Sermon title" bind:value={sermonTitle} />
          <input aria-label="Speaker" placeholder="Speaker" bind:value={sermonSpeaker} />
          <textarea aria-label="Operator notes" rows="4" placeholder="Operator notes — not sent to the audience" bind:value={sermonNotes}></textarea>
          {#each sermonSections as section (section.id)}
            <input aria-label="Section name" placeholder="Section name" bind:value={section.name} />
            <input aria-label="Audience heading" placeholder="Audience heading" bind:value={section.heading} />
            <textarea
              aria-label="Audience body"
              rows="3"
              placeholder="Audience body"
              bind:value={section.body}
            ></textarea>
            <textarea
              aria-label="Section notes"
              rows="2"
              placeholder="Section notes — desk only"
              bind:value={section.notes}
            ></textarea>
            <input
              aria-label="Attach scripture"
              placeholder="John 1:1"
              bind:value={section.scripture}
            />
            <div class="song-actions">
              <button type="button" onclick={() => attachScripture(section.id, section.scripture)}>Attach scripture</button>
              {#if session.media.some((asset) => asset.kind === "image")}
                <select aria-label="Attach image" bind:value={section.imageId}>
                  <option value="">Image</option>
                  {#each session.media.filter((asset) => asset.kind === "image") as asset (asset.id)}
                    <option value={asset.id}>{asset.name}</option>
                  {/each}
                </select>
                <button type="button" onclick={() => attachImage(section.id, section.imageId)}>Attach image</button>
              {/if}
              {#if section.attached}
                <button type="button" onclick={() => detachSection(section.id)}>Detach {section.attached.title}</button>
              {/if}
            </div>
            <div class="song-actions">
              <button type="button" onclick={() => previewSermonDraft(section.id)}>Preview</button>
              <button type="button" onclick={() => hydrateSermon(moveSermonSection(draftSermon(), section.id, -1))}>Up</button>
              <button type="button" onclick={() => hydrateSermon(moveSermonSection(draftSermon(), section.id, 1))}>Down</button>
              <button type="button" onclick={() => hydrateSermon(removeSermonSection(draftSermon(), section.id))}>Remove</button>
            </div>
          {/each}
          <div class="song-actions">
            <button
              type="button"
              onclick={() => {
                sermonSections = [...sermonSections, emptyDraftSection(`Section ${sermonSections.length + 1}`)];
              }}
            >Add section</button>
            <button type="button" onclick={() => void saveSermonForm()}>Save sermon</button>
          </div>
        </form>
        <div class="song-library">
          <input aria-label="Search sermons" placeholder="Title, speaker, notes, or scripture" bind:value={sermonQuery} />
          {#if sermonHits.length === 0}
            <p class="song-empty">{sermonQuery.trim() ? "No sermons match." : "No sermons yet."}</p>
          {/if}
          <ul class="song-list">
            {#each sermonHits as hit (`${hit.sermonId}:${hit.sectionId}`)}
              <li>
                <button type="button" onclick={() => {
                  const doc = session.sermons.find((entry) => entry.id === hit.sermonId);
                  if (!doc) return;
                  hydrateSermon(doc);
                  void session.previewSermonSection(doc, hit.sectionId);
                }}>
                  <strong>{hit.title}</strong>
                  <span>{hit.label}{hit.speaker ? ` · ${hit.speaker}` : ""}</span>
                  {#if hit.snippet}<span>{hit.snippet}</span>{/if}
                </button>
                <button type="button" onclick={() => {
                  const doc = session.sermons.find((entry) => entry.id === hit.sermonId);
                  const queued = doc?.sections.find((entry) => entry.id === hit.sectionId);
                  if (doc && queued) void queueSermonSection(doc, queued);
                }}>Queue</button>
              </li>
            {/each}
          </ul>
        </div>
        <aside class="song-stage">
          <header>
            <span class="kicker">Operator notes</span>
            <span class="song-step">
              <button type="button" aria-label="Previous section" onclick={() => session.stepSermon(-1)}>Previous</button>
              <button type="button" aria-label="Next section" onclick={() => session.stepSermon(1)}>Next</button>
            </span>
          </header>
          <article class="sermon-notes">
            <p>{operatorNotes || "Notes for this section stay here. They are not on Preview or Program."}</p>
          </article>
          <header><span class="kicker">Preview</span></header>
          <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
          <header><span class="kicker program">{#if displayLive}<span class="pip on"></span>{/if}Program</span></header>
          <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
        </aside>
      </div>
    </section>
  {:else if mode === "songs"}
    <section class="pb-songs">
      <div class="song-desk">
        <form class="song-editor" onsubmit={saveSong}>
          <span class="note-icon">{@render icon("note")}</span>
          <h1>Songs</h1>
          <p>Write a lyric, preview it, then add it to the queue. LIVE sends the preview to program.</p>
          {#if note}<p>{note}</p>{/if}
          <input aria-label="Song title" placeholder="Song title" bind:value={songTitle} />
          <input aria-label="Song author" placeholder="Author" bind:value={songAuthor} />
          <details class="paste-lyrics">
            <summary>Paste lyrics or import a file</summary>
            <textarea
              aria-label="Paste lyrics"
              rows="6"
              placeholder="Paste a whole song. Blank lines split sections; “Verse 1”, “[Chorus]”, “Bridge:” name them. ChordPro works too."
              bind:value={pasteText}
            ></textarea>
            <div class="song-actions">
              <button type="button" onclick={() => applyLyrics(pasteText)}>Split into sections</button>
              <label class="file-pick">
                Import .txt / ChordPro
                <input type="file" accept=".txt,.cho,.chordpro,.chopro,.crd,text/plain" onchange={importLyricFile} />
              </label>
            </div>
          </details>
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
            <span class="kicker">Preview{session.songPlace() ? ` · ${session.songPlace()}` : ""}</span>
            <span class="song-step">
              <button type="button" aria-label="Previous section" onclick={() => session.stepSong(-1)}>Previous</button>
              <button type="button" aria-label="Next section" onclick={() => session.stepSong(1)}>Next</button>
            </span>
          </header>
          <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
          <header><span class="kicker program">{#if displayLive}<span class="pip on"></span>{/if}Program</span></header>
          <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
        </aside>
      </div>
    </section>
  {:else}
    {#key epoch}
    <div class="pb-grid">
      <PaneGroup direction="horizontal" onLayoutChange={onColumns}>
        {#if showLibrary}
          <Pane defaultSize={frozen.columns[0]} minSize={18} order={1}>
            <div class="fill">
              <PaneGroup direction="vertical" onLayoutChange={onLibrarySplit}>
                <Pane defaultSize={frozen.librarySplit} minSize={20} order={1}>
                  <div class="pb-split">
          <section class="pb-panel">
            <header class="pb-head"><span>Live transcript</span></header>
            <div class="pb-body transcript">
              {#if session.voice.status !== "idle"}<VoiceStatus />{/if}
              {#if reading.length === 0}
                <p>{note || "Search a reference, or listen for a verse."}</p>
              {:else}
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              {/if}
            </div>
            <footer class="pb-foot">
              <button type="button" class="go" class:on={voiceActive} aria-pressed={voiceActive} onclick={toggleVoice}>
                {@render icon(voiceActive ? "mic-off" : "mic")}
                {session.voice.status === "starting" ? "Starting…" : voiceActive ? "Stop listening" : "Listen"}
              </button>
              <button type="button" class="go" onclick={() => void findInScripture()}>{@render icon("wave")} Find</button>
            </footer>
          </section>
          <section class="pb-panel">
            <header class="pb-head">
              <span>Recent detections</span>
              <button type="button" class="quiet" onclick={() => (detections = [])}><Icon name="close" size={14} /> Clear all</button>
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
                </Pane>
                <PaneResizer />
                <Pane defaultSize={100 - frozen.librarySplit} minSize={24} order={2}>
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
        {/if}
                </Pane>
              </PaneGroup>
            </div>
          </Pane>
          <PaneResizer />
        {/if}
        <Pane defaultSize={showLibrary ? frozen.columns[1] : share(frozen.columns[1], frozen.columns[2])} minSize={showLibrary ? 24 : 32} order={2}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onStageSplit}>
              {#if showReading}
                <Pane defaultSize={frozen.stageSplit} minSize={20} order={1}>
                  <section class="pb-panel">
                    <header class="pb-head"><span class="kicker">Scripture reading</span></header>
          <div class="pb-body display">
            {#if mode === "scriptures"}
              <article class="reading">
                <p class="reading-ref">{passage()?.reference ?? query}</p>
                {#each reading as verse (verse.verse)}
                  <p><sup>{verse.verse}</sup> {verse.text}</p>
                {/each}
              </article>
            {/if}
          </div>
        </section>
                </Pane>
                <PaneResizer />
              {/if}
              <Pane defaultSize={showReading ? 100 - frozen.stageSplit : 100} minSize={showReading ? 24 : 20} order={2}>
                <section class="pb-panel preview">
                  <header class="pb-head"><span class="kicker">Preview</span></header>
                  <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
                </section>
              </Pane>
            </PaneGroup>
          </div>
        </Pane>
        <PaneResizer />
        <Pane defaultSize={showLibrary ? frozen.columns[2] : share(frozen.columns[2], frozen.columns[1])} minSize={showLibrary ? 22 : 32} order={3}>
          <div class="fill">
            <PaneGroup direction="vertical" onLayoutChange={onProgramSplit}>
              <Pane defaultSize={showQueue ? frozen.programSplit : 100} minSize={showQueue ? 28 : 20} order={1}>
                <section class="pb-panel output" class:on-air={displayLive}>
                  <header class="pb-head">
                    <span class="kicker program">{#if displayLive}<span class="pip on"></span>{/if}Program</span>
                    <button
                      type="button"
                      class="style-name"
                      data-tip="Font, color, and layout. Preview only until you press LIVE."
                      onclick={() => (sheet = sheet === "type" ? null : "type")}
                    >
                      {themeName} · {session.theme().layout === "lower-third" ? "Lower third" : "Frame"}
                    </button>
                  </header>
                  <div class="monitor main"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
                  <TimerControls compact />
                  <footer class="output-tools">
                    <button type="button" class="lex" onclick={() => (sheet = sheet === "lexicon" ? null : "lexicon")}>{@render icon("book")} Lexicon</button>
                    <span class="steppers">
                      <button type="button" aria-label="Previous" onclick={() => void stepOutput(-1)}>{@render icon("chevron-left")}</button>
                      <button type="button" aria-label="Next" onclick={() => void stepOutput(1)}>{@render icon("chevron-right")}</button>
                    </span>
                  </footer>
                </section>
              </Pane>
              {#if showQueue}
                <PaneResizer />
                <Pane defaultSize={100 - frozen.programSplit} minSize={18} order={2}>
                  <section class="pb-panel">
                    <header class="pb-head">
                      <span>Queue</span>
                      <span class="queue-actions">
                        <button type="button" class="quiet" onclick={() => void queuePassage()}><Icon name="plus" size={14} /> Add</button>
                        <button type="button" class="quiet" onclick={() => session.clearQueue()}><Icon name="close" size={14} /> Clear all</button>
                      </span>
                    </header>
                    <div class="pb-body queue">
                      {#each queue as item (item.id)}
                        <button type="button" class:on={session.cursor.itemId === item.id} onclick={(event) => { event.currentTarget.blur(); open(item); }}>{item.title}</button>
                      {/each}
                    </div>
                  </section>
                </Pane>
              {/if}
            </PaneGroup>
          </div>
        </Pane>
      </PaneGroup>
    </div>
    {/key}
  {/if}
  {#if sheet}
    <div class="sheet" role="dialog" aria-label={sheet}>
      <header>
        <strong>{sheet === "help" ? "How this desk works" : sheet === "type" ? "Theme" : "Lexicon"}</strong>
        <button type="button" aria-label="Close" onclick={() => (sheet = null)}><Icon name="close" size={16} /></button>
      </header>
      {#if sheet === "help"}
        <p>Click a verse to put it on Preview. Shift-click a second verse to select a range.</p>
        <p>LIVE copies Preview onto Program. BLACK and CLEAR change Program only.</p>
        <p>Search a reference such as John 3:16, or a phrase such as “in the beginning”.</p>
        <p>Listen matches spoken scripture on Preview. It never takes Program by itself.</p>
        <p>F focuses Preview and Program. [ hides the library. ] hides the queue. / searches. None of these change Program.</p>
      {:else if sheet === "type"}
        <OutputType />
      {:else}
        {#each reading as verse (verse.verse)}
          <p><sup>{verse.verse}</sup> {verse.text}</p>
        {/each}
        <p class="sheet-ref">{passage()?.reference ?? ""} · {translationId.toUpperCase()}</p>
      {/if}
    </div>
  {/if}
</div>

{#snippet icon(name: string)}
  <Icon {name} size={16} />
{/snippet}

{#if alertsOpen}
  <AlertsDialog onclose={() => (alertsOpen = false)} />
{/if}


<style>
  .alerts-btn.on { background: #c8102e; border-color: #c8102e; color: #fff; }
  .pb {
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--desk);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 13px;
  }
  .pb-bar {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px 10px;
    padding: 6px calc(var(--panel-pad) + 2px);
    min-height: var(--chrome-h);
    flex: none;
    overflow: hidden;
  }
  /* Segmented switch: never shrinks, so every mode stays visible; the tools give way instead. */
  .pb-modes {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-control) + 3px);
    background: var(--field);
  }
  .pb-modes button {
    border: 0;
    background: transparent;
    color: var(--muted);
    border-radius: var(--radius-control);
    padding: 5px 14px;
    font-weight: 560;
    font-size: 14px;
    flex: none;
  }
  .pb-modes button:hover:not(.on) { background: var(--desk); color: var(--ink); }
  .pb-modes button.on { background: var(--accent); color: white; }
  .pb-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    flex: none;
    min-width: 0;
    position: relative;
    z-index: 2;
    background: var(--desk);
  }
  .pb-actions :global(.output-controls) { min-width: 0; }
  .live { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 78px; }
  .live.on-air { animation: live-glow 1.6s ease-in-out infinite; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: white; position: relative; display: inline-block; flex: none; }
  .pip.on::after, .live.on-air .pip::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    animation: live-ring 1.6s ease-out infinite;
  }
  .pip.on::after { animation-name: live-ring-red; }
  .kicker .pip, .song-stage header .pip { background: var(--live); margin-right: 6px; vertical-align: 1px; }
  @keyframes live-ring {
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(255, 255, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  }
  @keyframes live-ring-red {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--live) 75%, transparent); }
    70% { box-shadow: 0 0 0 8px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  @keyframes live-glow {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--live) 45%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .live.on-air, .pip.on::after, .live.on-air .pip::after { animation: none; }
  }
  .pb-tools { display: flex; align-items: center; gap: 6px; margin-left: 4px; flex: 0 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .pb-tools > button {
    width: var(--tool-size);
    height: var(--tool-size);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--field);
    color: var(--ink);
    display: grid;
    place-items: center;
    padding: 0;
  }
  .pb-tools > :global(*) { flex: none; }
  .pb-tools > button:hover { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .pb-tools > button.on { color: var(--accent); border-color: var(--accent); }
  @media (max-width: 1440px) {
    .pb-tools > button.secondary { display: none; }
  }
  @media (max-width: 1280px) {
    .pb-actions :global(.output-controls .desk-btn) { display: none; }
  }
  .pb button:active { opacity: 0.84; }
  .pb-grid {
    flex: 1;
    min-height: 0;
    min-width: 0;
    padding: 0 var(--panel-pad) var(--panel-pad);
  }
  .fill { height: 100%; min-width: 0; min-height: 0; }
  .pb-grid :global([data-pane-group]) { width: 100%; height: 100%; }
  .pb-grid :global([data-pane]) { min-width: 0; min-height: 0; overflow: hidden; }
  .pb-grid :global([data-pane-resizer]) {
    flex: 0 0 8px;
    position: relative;
    background: transparent;
  }
  .pb-grid :global([data-pane-resizer][data-direction="horizontal"]) { cursor: col-resize; }
  .pb-grid :global([data-pane-resizer][data-direction="vertical"]) { cursor: row-resize; }
  .pb-grid :global([data-pane-resizer]::after) {
    content: "";
    position: absolute;
    background: var(--line);
    border-radius: 2px;
  }
  .pb-grid :global([data-pane-resizer][data-direction="horizontal"]::after) {
    top: 10px;
    bottom: 10px;
    left: 3px;
    width: 2px;
  }
  .pb-grid :global([data-pane-resizer][data-direction="vertical"]::after) {
    left: 10px;
    right: 10px;
    top: 3px;
    height: 2px;
  }
  .pb-grid :global([data-pane-resizer]:hover::after),
  .pb-grid :global([data-pane-resizer][data-active]::after) { background: var(--accent); }
  .pb-split { height: 100%; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 4px; }
  .pb-panel {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  .pb-head, .pb-foot, .script-bar, .output-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-h);
    padding: 0 var(--panel-pad);
    color: var(--muted);
    font-size: 13px;
  }
  .pb-head { justify-content: space-between; }
  .pb-body { flex: 1; min-height: 0; }
  .quiet, .mini, .go, .lex {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
  }
  .quiet { display: inline-flex; align-items: center; gap: 4px; }
  .go { color: var(--presence); display: inline-flex; align-items: center; gap: 6px; font-weight: 560; }
  .go.on { color: var(--accent); }
  .pb-foot { justify-content: space-between; border-top: 1px solid var(--line); }
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
  .mini:hover, .lex:hover, .steppers button:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .mini.on { color: var(--accent); border-color: var(--accent); }
  .script-bar { padding: 8px; }
  select, .script-bar input {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
  }
  select { width: 88px; }
  .script-bar input { flex: 1; min-width: 0; }
  .verse-list, .queue { overflow: auto; padding: 4px 8px 8px; display: flex; flex-direction: column; gap: 6px; }
  .verse, .queue button {
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
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .script-note { margin: 0; padding: 0 12px 4px; color: var(--muted); font-size: 12px; }
  .transcript, .reading, .detections { overflow: auto; padding: var(--panel-pad); }
  .transcript p, .reading p { margin: 0 0 8px; line-height: 1.45; color: var(--ink); }
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
  .verse:hover:not(.picked), .queue button:hover:not(.on), .detections button:hover { border-color: color-mix(in srgb, var(--ink) 28%, var(--line)); }
  .verse.picked { border-color: var(--accent); }
  .display { padding: 12px; }
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
  .kicker { font-size: 11px; font-weight: 650; letter-spacing: 0.14em; text-transform: uppercase; }
  .kicker.program { color: var(--live); }
  .pb-panel.preview { border-style: dashed; }
  .pb-panel.output { border-color: color-mix(in srgb, var(--live) 40%, var(--line)); }
  .pb-panel.output.on-air { border-color: var(--live); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--live) 35%, transparent); }
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
  .focus .song-editor, .focus .song-library { display: none; }
  .focus .song-desk { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); width: min(1100px, 100%); }
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
  .note-icon :global(svg) { width: 20px; height: 20px; }
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
  .sermon-notes {
    border: 1px dashed var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--field) 80%, transparent);
    min-height: 72px;
  }
  .sermon-notes p { margin: 0; color: var(--muted); line-height: 1.45; white-space: pre-wrap; }
  .song-stage header { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .song-step { display: flex; gap: 6px; }
  .song-step button { width: auto; padding: 4px 8px; }
  .song-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .paste-lyrics { border: 1px solid var(--line); border-radius: var(--radius-control); padding: 6px 10px; }
  .paste-lyrics summary { cursor: pointer; color: var(--muted); }
  .paste-lyrics[open] { display: flex; flex-direction: column; gap: 8px; }
  .paste-lyrics textarea { width: 100%; }
  .file-pick { position: relative; cursor: pointer; color: var(--accent); }
  .file-pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .song-actions select {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 8px;
  }
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
    width: min(380px, calc(100% - 32px));
    max-height: calc(100% - 80px);
    overflow: auto;
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
