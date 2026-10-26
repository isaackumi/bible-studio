<script lang="ts" module>
  export type AddKind = "song" | "scripture" | "text" | "announcement" | "slides" | "media" | "video-link" | "look";
</script>

<script lang="ts">
  import { webTarget } from "../../domain/web";
  import TextWords from "../TextWords.svelte";
  import { richIsEmpty, richLines, type RichDoc } from "../../domain/rich-text";
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { parseReference, formatReference } from "../../bible/reference";
  import { api, mediaUrl } from "../../db/api";
  import { ANNOUNCEMENT_DESIGNS, type AnnouncementDesign } from "../../domain/announcement";
  import { restoreComposition } from "../../domain/composition";
  import { quickFilter } from "../../domain/song-browse";
  import type { BibleItem, VerseText } from "../../domain/types";
  import { msg, t, tn } from "../../i18n/core";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import AiSlidesDialog from "../decks/AiSlidesDialog.svelte";
  import DeckEditor from "../decks/DeckEditor.svelte";
  import DeckThumb from "../decks/DeckThumb.svelte";
  import { createDeck } from "../../domain/decks";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { isDesktop } from "../../platform/runtime";
  import Icon from "../Icon.svelte";

  // One window to fill a part of the service: pick what to add on the left, add as many as you
  // like on the right. Everything goes into the chosen part, in order; Program never changes here.
  let { sectionId, kind = "song", onclose }: { sectionId: string | null; kind?: AddKind; onclose: () => void } = $props();

  const KINDS: Array<{ id: AddKind; label: string; icon: string; hint: string }> = [
    { id: "song", label: msg("Song"), icon: "note", hint: msg("From your song library") },
    { id: "scripture", label: msg("Scripture"), icon: "bible", hint: msg("A reading or a verse") },
    { id: "text", label: msg("Text"), icon: "pencil", hint: msg("A heading and a few lines") },
    { id: "announcement", label: msg("Announcement"), icon: "alerts", hint: msg("News with a design") },
    { id: "slides", label: msg("Slides"), icon: "stage", hint: msg("A deck, PowerPoint too") },
    { id: "media", label: msg("Media"), icon: "media", hint: msg("A picture or a video") },
    { id: "video-link", label: msg("YouTube"), icon: "video", hint: msg("A YouTube or Vimeo video") },
    { id: "look", label: msg("Look"), icon: "studio", hint: msg("A saved composition") },
  ];

  let tab = $state<AddKind>(untrack(() => kind));
  let target = $state<string | null>(untrack(() => sectionId ?? session.cursor.sectionId ?? session.service?.sections[0]?.id ?? null));
  /** What was added while the window is open, newest first, so nothing is added twice by mistake. */
  let added = $state<Array<{ key: string; title: string }>>([]);

  const service = $derived(session.service);
  const part = $derived(service?.sections.find((section) => section.id === target) ?? null);

  function note(key: string, title: string) {
    added = [{ key, title }, ...added.filter((entry) => entry.key !== key)].slice(0, 30);
  }
  const wasAdded = (key: string) => added.some((entry) => entry.key === key);

  // Song
  let songQuery = $state("");
  const songs = $derived(quickFilter(session.songsByFavorite, songQuery).slice(0, 80));
  function addSong(id: string) {
    const song = session.songs.find((entry) => entry.id === id);
    if (!song || !target) return;
    session.addSongToService(song, target);
    note(`song:${id}`, song.title);
  }

  // Scripture
  let reference = $state("");
  let translationId = $state(untrack(() => session.workspace.deskTranslationId ?? session.translations[0]?.id ?? "kjv"));
  /** The translation beside it on the screen: an id, "" for none (starts as the desk's setting). */
  let secondId = $state(untrack(() => session.workspace.parallelTranslationId ?? ""));
  const parsed = $derived(reference.trim() ? parseReference(reference) : null);
  const book = $derived(parsed ? session.books.find((entry) => entry.ord === parsed.bookOrd) : undefined);

  // The verses as they will show, read as the reference is typed, so a wrong chapter or verse is seen
  // before it is added. A reference without verses ("Psalm 23") is the whole chapter.
  type Found = { key: string; count: number; start: number; end: number; first: VerseText[]; second: VerseText[] | null; problem: string };
  let found = $state<Found | null>(null);
  let finding = $state(false);
  const wanted = $derived(parsed ? `${translationId}|${secondId}|${parsed.bookOrd}|${parsed.chapter}|${parsed.startVerse ?? ""}|${parsed.endVerse ?? ""}` : "");
  $effect(() => {
    const key = wanted;
    const ref = parsed;
    if (!key || !ref) {
      found = null;
      return;
    }
    finding = true;
    const timer = setTimeout(async () => {
      const chapters = book?.chapters ?? 0;
      if (chapters && ref.chapter > chapters) {
        if (wanted === key) {
          found = { key, count: 0, start: 0, end: 0, first: [], second: null, problem: t("{book} has {n} chapters.", { book: ref.bookName, n: chapters }) };
          finding = false;
        }
        return;
      }
      try {
        const chapter = await api.verses(translationId, ref.bookOrd, ref.chapter);
        const count = chapter.length ? Math.max(...chapter.map((verse) => verse.verse)) : 0;
        const start = ref.startVerse ?? 1;
        const end = Math.min(count || start, ref.endVerse ?? (ref.startVerse ? start : count || 1));
        let problem = "";
        if (!count) problem = t("Nothing found for {reference} in this translation.", { reference: `${ref.bookName} ${ref.chapter}` });
        else if (start > count) problem = t("{book} {chapter} has {n} verses.", { book: ref.bookName, chapter: ref.chapter, n: count });
        const first = chapter.filter((verse) => verse.verse >= start && verse.verse <= end);
        let second: VerseText[] | null = null;
        if (!problem && secondId && secondId !== translationId) {
          try {
            second = await api.passage(secondId, ref.bookOrd, ref.chapter, start, end);
          } catch {
            second = [];
          }
        }
        if (wanted === key) found = { key, count, start, end, first, second, problem };
      } catch {
        if (wanted === key) found = { key, count: 0, start: 0, end: 0, first: [], second: null, problem: t("This translation could not be read. Check the connection or pick another.") };
      } finally {
        if (wanted === key) finding = false;
      }
    }, 180);
    return () => clearTimeout(timer);
  });
  const ready = $derived(!!parsed && !!found && found.key === wanted && !found.problem && found.first.length > 0);
  const preview = $derived(parsed && found && ready ? formatReference(parsed.bookName, parsed.chapter, found.start, found.end, book?.chapters ?? 1) : "");
  const nameOf = (id: string) => session.translations.find((entry) => entry.id === id)?.abbreviation ?? id;
  const quick = $derived(
    [...session.workspace.favorites.passages.slice(0, 6), ...session.workspace.recent.slice(0, 8)].filter(
      (item, index, all) => all.findIndex((other) => other.reference === item.reference) === index,
    ),
  );
  function addReference(event?: SubmitEvent) {
    event?.preventDefault();
    if (!parsed || !target || !found || !ready) return;
    const passage: BibleItem = {
      translationId,
      bookOrd: parsed.bookOrd,
      chapter: parsed.chapter,
      startVerse: found.start,
      endVerse: found.end,
      reference: preview,
      secondTranslationId: secondId && secondId !== translationId ? secondId : null,
    };
    session.addPassageToService(passage, target);
    note(`bible:${preview}`, preview);
    reference = "";
  }
  function addPassage(passage: BibleItem) {
    if (!target) return;
    session.addPassageToService(passage, target);
    note(`bible:${passage.reference}`, passage.reference);
  }

  // Text and announcement
  let heading = $state("");
  let body = $state("");
  /** Formatted words (the Formatted tab); null while Simple is in use. */
  let rich = $state<RichDoc | null>(null);
  let annLabel = $state(untrack(() => t("Announcement")));
  let annDesign = $state<AnnouncementDesign>("card");
  // A YouTube or Vimeo video from its link: it plays in its own player, looping if asked.
  let videoLink = $state("");
  let videoLoop = $state(false);
  let videoSound = $state(true);
  const videoTarget = $derived(videoLink.trim() ? webTarget(videoLink) : null);

  async function addVideoLink(event: SubmitEvent) {
    event.preventDefault();
    if (!videoTarget) return;
    await session.addWebVideo(videoLink, { mute: !videoSound, loop: videoLoop, sectionId: target ?? undefined });
    note(`web:${videoLink}`, videoTarget.kind === "youtube" ? t("YouTube video") : videoTarget.kind === "vimeo" ? t("Vimeo video") : videoTarget.label);
    videoLink = "";
  }

  function addText(event: SubmitEvent) {
    event.preventDefault();
    if (!target || (!heading.trim() && richIsEmpty(rich))) return;
    void session.addTextToService(heading, body, target, rich);
    const name = heading.trim() || (rich ? richLines(rich).find((line) => line.trim()) ?? "" : "") || t("Text");
    note(`text:${name}:${added.length}`, name);
    heading = "";
    body = "";
    rich = null;
  }
  function addAnnouncement(event: SubmitEvent) {
    event.preventDefault();
    if (!target || !heading.trim()) return;
    session.addAnnouncementToService(heading, body, { design: annDesign, label: annLabel, sectionId: target, rich });
    note(`ann:${heading}:${added.length}`, heading.trim());
    heading = "";
    body = "";
    rich = null;
  }

  function addPart(event: SubmitEvent) {
    event.preventDefault();
    const name = newPart.trim();
    if (!name) return;
    session.addSection(name);
    target = session.service?.sections.at(-1)?.id ?? target;
    newPart = "";
  }
  let newPart = $state("");
  let aiOpen = $state(false);

  // Bring in or make what is not in the library yet, and add it to the part in one go.
  let mediaInput = $state<HTMLInputElement | undefined>();
  let deckInput = $state<HTMLInputElement | undefined>();
  let busy = $state("");
  /** A deck open in the deck editor (made here), over this window. */
  let editingDeckId = $state<string | null>(null);
  const editingDeck = $derived(session.decks.find((deck) => deck.id === editingDeckId) ?? null);

  async function importMediaFiles(sources: Array<string | File>) {
    if (!target || sources.length === 0) return;
    busy = t("Importing…");
    try {
      for (const source of sources) {
        const asset = await session.importImage(source);
        if (asset) {
          session.addMediaToService(asset, target);
          note(`media:${asset.id}`, asset.name);
        }
      }
    } finally {
      busy = "";
    }
  }

  async function chooseMedia() {
    if (!isDesktop()) {
      mediaInput?.click();
      return;
    }
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: t("Pictures and videos"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "mp4", "m4v", "mov", "webm"] }],
    });
    await importMediaFiles(Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : []);
  }

  async function importDeckFile(file: File) {
    if (!target) return;
    busy = t("Importing…");
    try {
      const pdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const id = pdf ? await session.importPdf(file, undefined, false) : await session.importPowerPoint(file);
      const deck = id ? session.decks.find((entry) => entry.id === id) : null;
      if (deck) {
        await session.addDeckToService(deck.id, target);
        note(`deck:${deck.id}`, deck.name);
      }
    } finally {
      busy = "";
    }
  }

  async function newDeck() {
    if (!target) return;
    const deck = createDeck(t("New slides"));
    session.saveDeck(deck);
    await session.addDeckToService(deck.id, target);
    note(`deck:${deck.id}`, deck.name);
    editingDeckId = deck.id;
  }

  async function newLook() {
    if (!target) return;
    const look = session.createSceneLook(t("New look"));
    await session.addLookToService(restoreComposition(look), target);
    note(`look:${look.id}`, look.name);
  }
</script>

<DeskDialog title={part ? t("Add to {part}", { part: part.name }) : t("Add to the service")} huge {onclose}>
  <div class="adder">
    <aside class="rail">
      <label class="part-pick">
        <span>{t("Into part")}</span>
        <select aria-label={t("Into part")} bind:value={target}>
          {#each service?.sections ?? [] as section (section.id)}<option value={section.id}>{section.name} · {tn(section.items.length, "{n} item", "{n} items")}</option>{/each}
        </select>
      </label>
      <form class="new-part" onsubmit={addPart}>
        <input aria-label={t("New part name")} placeholder={t("Or a new part…")} bind:value={newPart} />
        <button type="submit" aria-label={t("Add part")} disabled={!newPart.trim()}><Icon name="plus" size={13} /></button>
      </form>
      <nav class="kinds" aria-label={t("What to add")}>
        {#each KINDS as entry (entry.id)}
          <button type="button" class:on={tab === entry.id} aria-pressed={tab === entry.id} onclick={() => (tab = entry.id)}>
            <span class="ic"><Icon name={entry.icon} size={16} /></span>
            <span class="txt"><strong>{t(entry.label)}</strong><small>{t(entry.hint)}</small></span>
          </button>
        {/each}
      </nav>
      {#if part}
        <div class="in-part">
          <p>{t("In {part}", { part: part.name })}</p>
          {#each part.items.slice(-8) as item (item.id)}<span>{item.title}</span>{:else}<span class="muted">{t("Nothing yet")}</span>{/each}
        </div>
      {/if}
    </aside>

    <section class="body">
      {#if !target}
        <p class="empty">{t("Add a part first, then fill it.")}</p>
      {:else if tab === "song"}
        <label class="search focus-box">
          <Icon name="search" size={15} />
          <!-- svelte-ignore a11y_autofocus -->
          <input type="search" autofocus aria-label={t("Find a song")} placeholder={t("Title, author or first line")} bind:value={songQuery} onkeydown={(event) => { if (event.key === "Enter" && songs[0]) addSong(songs[0].id); }} />
        </label>
        <div class="grid">
          {#each songs as song (song.id)}
            <button type="button" class="card" class:done={wasAdded(`song:${song.id}`)} onclick={() => addSong(song.id)}>
              <strong>{song.title || t("Untitled song")}</strong>
              <span>{song.sections[0]?.lines[0] || song.author}</span>
              <em>{wasAdded(`song:${song.id}`) ? t("Added") : tn(song.sections.length, "{n} part", "{n} parts")}</em>
              <Icon name={wasAdded(`song:${song.id}`) ? "check" : "plus"} size={15} />
            </button>
          {:else}
            <p class="empty">{session.songs.length ? t("No songs match.") : t("No songs yet. Add them on the Songs page.")}</p>
          {/each}
        </div>
      {:else if tab === "scripture"}
        <form class="ref" onsubmit={addReference}>
          <label class="search grow focus-box">
            <Icon name="bible" size={15} />
            <!-- svelte-ignore a11y_autofocus -->
            <input autofocus aria-label={t("Scripture reference")} placeholder={t("John 3:16-18, Psalm 23")} bind:value={reference} />
          </label>
          <select aria-label={t("Translation")} title={t("Translation")} bind:value={translationId}>
            {#each session.translations as entry (entry.id)}<option value={entry.id}>{entry.abbreviation}</option>{/each}
          </select>
          <select aria-label={t("Side by side with")} title={t("Show a second translation beside it on the screen")} bind:value={secondId}>
            <option value="">{t("One translation")}</option>
            {#each session.translations.filter((entry) => entry.id !== translationId) as entry (entry.id)}<option value={entry.id}>{t("+ {name} side by side", { name: entry.abbreviation })}</option>{/each}
          </select>
          <button type="submit" class="primary" disabled={!ready}><Icon name="plus" size={14} /> {t("Add")}</button>
        </form>
        {#if !reference.trim()}
          <p class="hint">{t("Type the short way: jn 3 16, ps 23, rom 8:28-30. The verses show here before you add them.")}</p>
        {:else if !parsed}
          <p class="hint warn">{t("That is not a reference yet. Try John 3:16 or Psalm 23.")}</p>
        {:else}
          <div class="verse-check" class:loading={finding} aria-live="polite">
            <header>
              <strong>{preview || `${parsed.bookName} ${parsed.chapter}${parsed.startVerse ? `:${parsed.startVerse}` : ""}`}</strong>
              {#if found && !found.problem}
                <span class="muted">{t("{book} {chapter} has {n} verses", { book: parsed.bookName, chapter: parsed.chapter, n: found.count })}{parsed.startVerse ? "" : ` · ${t("the whole chapter")}`}</span>
              {/if}
            </header>
            {#if found?.problem}
              <p class="problem"><Icon name="alerts" size={13} /> {found.problem}</p>
            {:else if found && found.first.length}
              <div class="columns" class:two={found.second !== null}>
                <div class="col">
                  <span class="tr">{nameOf(translationId)}</span>
                  {#each found.first.slice(0, 12) as verse (verse.verse)}<p><sup>{verse.verse}</sup>{verse.text}</p>{/each}
                  {#if found.first.length > 12}<p class="muted">{t("+{n} more verses", { n: found.first.length - 12 })}</p>{/if}
                </div>
                {#if found.second !== null}
                  <div class="col">
                    <span class="tr">{nameOf(secondId)}</span>
                    {#each found.second.slice(0, 12) as verse (verse.verse)}<p><sup>{verse.verse}</sup>{verse.text}</p>{:else}<p class="muted">{t("Not available in this translation; the screen shows one translation.")}</p>{/each}
                  </div>
                {/if}
              </div>
            {:else}
              <p class="muted">{t("Finding the verses…")}</p>
            {/if}
          </div>
        {/if}
        {#if quick.length}
          <p class="sub">{t("Favorites and recent")}</p>
          <div class="chips">
            {#each quick as passage (passage.reference + passage.translationId)}
              <button type="button" class="chip" class:done={wasAdded(`bible:${passage.reference}`)} onclick={() => addPassage(passage)}><Icon name={wasAdded(`bible:${passage.reference}`) ? "check" : "plus"} size={12} /> {passage.reference}</button>
            {/each}
          </div>
        {/if}
      {:else if tab === "text" || tab === "announcement"}
        <form class="compose" onsubmit={tab === "text" ? addText : addAnnouncement}>
          {#if tab === "announcement"}
            <label><span>{t("Small line above")}</span><input aria-label={t("Small line above the heading")} bind:value={annLabel} /></label>
          {/if}
          <TextWords
            {heading}
            {body}
            {rich}
            headingMode={tab === "announcement" ? "separate" : "inline"}
            bodyLabel={msg("Text")}
            headingPlaceholder={tab === "text" ? t("Welcome") : t("Youth camp")}
            bodyPlaceholder={tab === "text" ? t("A few lines for the screen") : t("Saturday, 9am at the church hall")}
            onchange={(words) => { heading = words.heading; body = words.body; rich = words.rich; }}
          />
          {#if tab === "announcement"}
            <div class="designs" role="radiogroup" aria-label={t("Announcement design")}>
              {#each ANNOUNCEMENT_DESIGNS as design (design.id)}
                <button type="button" role="radio" aria-checked={annDesign === design.id} onclick={() => (annDesign = design.id)}><strong>{design.name}</strong><small>{design.hint}</small></button>
              {/each}
            </div>
          {/if}
          <button type="submit" class="primary wide" disabled={tab === "text" ? !heading.trim() && richIsEmpty(rich) : !heading.trim()}><Icon name="plus" size={14} /> {tab === "text" ? t("Add text") : t("Add announcement")}</button>
        </form>
      {:else if tab === "slides"}
        <div class="makers">
          <button type="button" class="make primary" onclick={() => void newDeck()}><Icon name="plus" size={14} /> {t("New slides")}</button>
          <button type="button" class="make" disabled={!!busy} onclick={() => deckInput?.click()}><Icon name="download" size={14} /> {t("Import PowerPoint or PDF")}</button>
          {#if session.aiOn("slides")}<button type="button" class="make ai" onclick={() => (aiOpen = true)}><Icon name="sparkles" size={14} /> {t("Make with AI")}</button>{/if}
          {#if busy}<span class="busy" role="status">{busy}</span>{/if}
          <input bind:this={deckInput} type="file" hidden accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" aria-label={t("Import PowerPoint or PDF")} onchange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ""; if (file) void importDeckFile(file); }} />
        </div>
        <div class="grid">
          {#each session.recentDecks as deck (deck.id)}
            <button type="button" class="card deck-card" class:done={wasAdded(`deck:${deck.id}`)} onclick={() => { void session.addDeckToService(deck.id, target ?? undefined); note(`deck:${deck.id}`, deck.name); }}>
              {#if deck.pages[0]}<span class="deck-thumb"><DeckThumb page={deck.pages[0]} /></span>{/if}
              <strong>{deck.name}</strong><span>{tn(deck.pages.length, "{n} page", "{n} pages")}</span><em>{wasAdded(`deck:${deck.id}`) ? t("Added") : ""}</em>
              <Icon name={wasAdded(`deck:${deck.id}`) ? "check" : "plus"} size={15} />
            </button>
          {:else}
            <p class="empty">{t("No slide decks yet. Start new slides, import a PowerPoint or PDF, or make them with AI above.")}</p>
          {/each}
        </div>
      {:else if tab === "media"}
        <div class="makers">
          <button type="button" class="make primary" disabled={!!busy} onclick={() => void chooseMedia()}><Icon name="plus" size={14} /> {t("Import pictures or videos")}</button>
          <span class="busy" role="status">{busy || t("They are saved to the media library and added to this part.")}</span>
          <input bind:this={mediaInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v" aria-label={t("Import pictures or videos")} onchange={(event) => { const input = event.currentTarget; const files = [...(input.files ?? [])]; input.value = ""; void importMediaFiles(files); }} />
        </div>
        <div class="thumbs">
          {#each session.mediaByFavorite as asset (asset.id)}
            {@const url = mediaUrl(asset)}
            <button type="button" class="thumb" class:done={wasAdded(`media:${asset.id}`)} onclick={() => { session.addMediaToService(asset, target ?? undefined); note(`media:${asset.id}`, asset.name); }}>
              <span class="pic">
                {#if url && asset.kind === "image"}<img src={url} alt="" loading="lazy" />{:else}<Icon name={asset.kind === "video" ? "video" : "media"} size={22} />{/if}
                {#if wasAdded(`media:${asset.id}`)}<span class="tick"><Icon name="check" size={13} /></span>{/if}
              </span>
              <strong>{asset.name}</strong>
            </button>
          {:else}
            <p class="empty">{t("No pictures or videos yet. Import them with the button above.")}</p>
          {/each}
        </div>
      {:else if tab === "video-link"}
        <form class="compose" onsubmit={addVideoLink}>
          <label>
            <span>{t("Link")}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={videoLink} autofocus placeholder={t("Paste a YouTube or Vimeo link")} aria-label={t("YouTube or Vimeo link")} />
          </label>
          <p class="hint">
            {#if !videoLink.trim()}{t("Copy the link from YouTube (Share › Copy) and paste it here. It plays in YouTube's own player, so the computer needs the internet.")}
            {:else if !videoTarget}{t("That does not look like a web address.")}
            {:else if videoTarget.kind === "youtube"}{t("A YouTube video.")}
            {:else if videoTarget.kind === "vimeo"}{t("A Vimeo video.")}
            {:else}{t("Not a YouTube or Vimeo video: it will show the page {label}.", { label: videoTarget.label })}{/if}
          </p>
          <label class="switch-row"><input type="checkbox" class="switch" bind:checked={videoLoop} /> <span><b>{t("Loop")}</b>{t("Play again from the start each time it ends.")}</span></label>
          <label class="switch-row"><input type="checkbox" class="switch" bind:checked={videoSound} /> <span><b>{t("Sound")}</b>{t("On the audience screen; the desk always plays it silent.")}</span></label>
          <button type="submit" class="primary wide" disabled={!videoTarget}><Icon name="plus" size={14} /> {t("Add video")}</button>
        </form>
      {:else if tab === "look"}
        <div class="makers">
          <button type="button" class="make primary" onclick={() => void newLook()}><Icon name="plus" size={14} /> {t("New look")}</button>
          <span class="busy">{t("Design it on the Production Desk › Looks; it is in this part already.")}</span>
        </div>
        <div class="grid">
          {#each session.looksByFavorite as look (look.id)}
            <button type="button" class="card" class:done={wasAdded(`look:${look.id}`)} onclick={() => { void session.addLookToService(restoreComposition(look), target ?? undefined); note(`look:${look.id}`, look.name); }}>
              <strong>{look.name}</strong><span>{tn(look.layers.length, "{n} layer", "{n} layers")}</span><em>{wasAdded(`look:${look.id}`) ? t("Added") : ""}</em>
              <Icon name={wasAdded(`look:${look.id}`) ? "check" : "plus"} size={15} />
            </button>
          {:else}
            <p class="empty">{t("No saved looks yet. Start one with New look above.")}</p>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <span class="foot-note">{added.length ? tn(added.length, "{n} added this time", "{n} added this time") : t("Click anything to add it. The window stays open for more.")}</span>
    <button type="button" class="done-btn" onclick={onclose}>{t("Done")}</button>
  {/snippet}
</DeskDialog>

{#if editingDeck}
  {#key editingDeck.id}<DeckEditor deck={editingDeck} onclose={() => (editingDeckId = null)} />{/key}
{/if}
{#if aiOpen}<AiSlidesDialog sectionId={target ?? undefined} onclose={() => (aiOpen = false)} onmade={(deck) => note(`deck:${deck.id}`, deck.name)} />{/if}

<style>
  .verse-check { display: grid; gap: 8px; min-height: 0; max-height: 300px; overflow: auto; margin-top: 4px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 60%, transparent); transition: opacity 0.15s; }
  .verse-check.loading { opacity: 0.6; }
  .verse-check header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
  .verse-check header strong { font-size: 15px; }
  .verse-check header .muted { font-size: 12px; }
  .verse-check .columns { display: grid; gap: 16px; }
  .verse-check .columns.two { grid-template-columns: 1fr 1fr; }
  .verse-check .col { display: grid; gap: 6px; align-content: start; min-width: 0; }
  .verse-check .tr { justify-self: start; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 16%, transparent); font-size: 11px; font-weight: 750; }
  .verse-check p { margin: 0; font-size: 13px; line-height: 1.5; }
  .verse-check sup { margin-right: 4px; font-size: 10px; font-weight: 750; color: var(--muted); }
  .verse-check .problem { display: flex; align-items: center; gap: 6px; color: var(--danger, #e5484d); font-weight: 650; }
  .hint.warn { color: var(--danger, #e5484d); }
  .adder { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 18px; height: min(70vh, 660px); }
  .rail { display: flex; flex-direction: column; gap: 10px; min-height: 0; padding-right: 14px; border-right: 1px solid var(--line); }
  .part-pick { display: grid; gap: 4px; }
  .part-pick span, .sub, .in-part p { margin: 0; font-size: 11px; font-weight: 700; color: var(--muted); }
  .part-pick select { height: 36px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .new-part { display: flex; gap: 4px; }
  .new-part input { flex: 1; min-width: 0; height: 30px; padding: 0 8px; border: 1px dashed var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; }
  .new-part button { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); display: grid; place-items: center; }
  .new-part button:disabled { opacity: 0.4; }
  .kinds { display: grid; gap: 3px; }
  .kinds button { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border: 1px solid transparent; border-radius: 9px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .kinds button:hover { background: var(--field); }
  .kinds button.on { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, var(--field)); }
  .ic { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--field); color: var(--muted); }
  .kinds button.on .ic { background: var(--accent); color: var(--on-accent, #fff); }
  .txt { display: grid; gap: 1px; min-width: 0; }
  .txt strong { font-size: 13px; }
  .txt small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .in-part { margin-top: auto; display: grid; gap: 3px; padding-top: 10px; border-top: 1px solid var(--line); overflow: hidden; }
  .in-part span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .in-part .muted { color: var(--muted); }
  .body { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; overflow: auto; padding-right: 2px; }
  .search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--muted); flex: none; }
  .search:focus-within { border-color: var(--accent); }
  .search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; outline: none; }
  .grow { flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; align-content: start; }
  .card { position: relative; display: grid; gap: 3px; padding: 10px 34px 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 55%, transparent); color: var(--ink); font: inherit; text-align: left; }
  .deck-thumb { display: block; margin-bottom: 4px; border-radius: 6px; overflow: hidden; background: #000; }
  .card strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card em { font-size: 11px; font-style: normal; color: var(--muted); }
  .card :global(svg) { position: absolute; top: 10px; right: 10px; color: var(--muted); }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .card:hover :global(svg) { color: var(--accent-text); }
  .card.done { border-color: color-mix(in srgb, #30a46c 55%, var(--line)); }
  .card.done em, .card.done :global(svg) { color: #3dd68c; }
  .ref { display: flex; gap: 8px; align-items: center; }
  .ref select { height: 42px; padding: 0 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; }
  .primary { display: inline-flex; align-items: center; gap: 6px; height: 42px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 13px; font-weight: 700; }
  .primary:disabled { opacity: 0.45; }
  .primary.wide { justify-self: start; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 15px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .chip:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .chip.done { border-color: color-mix(in srgb, #30a46c 55%, var(--line)); color: #3dd68c; }
  .compose { display: grid; gap: 10px; max-width: 640px; }
  .compose label { display: grid; gap: 4px; }
  .compose label span { font-size: 11px; font-weight: 700; color: var(--muted); }
  .compose .hint { margin: -4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .switch-row { display: grid !important; grid-template-columns: 40px 1fr; gap: 12px !important; align-items: start; cursor: pointer; }
  .switch-row span { display: grid; gap: 2px; font-size: 12px !important; font-weight: 500 !important; color: var(--muted); }
  .switch-row b { color: var(--ink); font-size: 13px; font-weight: 650; }
  .compose input:not(.switch) { padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; resize: vertical; }
  .designs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .designs button { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .designs button small { font-size: 11px; color: var(--muted); }
  .designs button[aria-checked="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; align-content: start; }
  .thumb { display: grid; gap: 6px; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; }
  .pic { position: relative; aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; display: grid; place-items: center; background: #000; color: var(--muted); }
  .pic img { width: 100%; height: 100%; object-fit: cover; }
  .thumb:hover .pic { border-color: var(--accent); }
  .thumb.done .pic { border-color: #30a46c; }
  .tick { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #30a46c; color: #fff; }
  .thumb strong { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .makers { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .make { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .make:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .make.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
  .make.ai { border-style: dashed; border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .make:disabled { opacity: 0.6; cursor: default; }
  .busy { font-size: 12px; color: var(--muted); }
  .empty { margin: 0; padding: 18px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 13px; }
  .foot-note { flex: 1; font-size: 12px; color: var(--muted); }
  .done-btn { height: 34px; padding: 0 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; }
  @media (max-width: 820px) {
    .adder { grid-template-columns: 1fr; height: auto; }
    .rail { border-right: 0; padding-right: 0; }
    .kinds { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
    .in-part { display: none; }
  }
</style>
