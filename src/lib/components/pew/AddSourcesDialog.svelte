<script lang="ts" module>
  export type AddKind = "song" | "scripture" | "text" | "announcement" | "slides" | "media" | "look";
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { parseReference, formatReference } from "../../bible/reference";
  import { mediaUrl } from "../../db/api";
  import { ANNOUNCEMENT_DESIGNS, type AnnouncementDesign } from "../../domain/announcement";
  import { restoreComposition } from "../../domain/composition";
  import { quickFilter } from "../../domain/song-browse";
  import type { BibleItem } from "../../domain/types";
  import { msg, t, tn } from "../../i18n/core";
  import DeskDialog from "../sources/DeskDialog.svelte";
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
  const parsed = $derived(reference.trim() ? parseReference(reference) : null);
  const preview = $derived.by(() => {
    if (!parsed) return "";
    const book = session.books.find((entry) => entry.ord === parsed.bookOrd);
    const start = parsed.startVerse ?? 1;
    return formatReference(parsed.bookName, parsed.chapter, start, parsed.endVerse ?? start, book?.chapters ?? 1);
  });
  const quick = $derived(
    [...session.workspace.favorites.passages.slice(0, 6), ...session.workspace.recent.slice(0, 8)].filter(
      (item, index, all) => all.findIndex((other) => other.reference === item.reference) === index,
    ),
  );
  function addReference(event?: SubmitEvent) {
    event?.preventDefault();
    if (!parsed || !target) return;
    const start = parsed.startVerse ?? 1;
    const passage: BibleItem = { translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: start, endVerse: parsed.endVerse ?? start, reference: preview };
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
  let annLabel = $state(untrack(() => t("Announcement")));
  let annDesign = $state<AnnouncementDesign>("card");
  function addText(event: SubmitEvent) {
    event.preventDefault();
    if (!target || !heading.trim()) return;
    void session.addTextToService(heading, body, target);
    note(`text:${heading}:${added.length}`, heading.trim());
    heading = "";
    body = "";
  }
  function addAnnouncement(event: SubmitEvent) {
    event.preventDefault();
    if (!target || !heading.trim()) return;
    session.addAnnouncementToService(heading, body, { design: annDesign, label: annLabel, sectionId: target });
    note(`ann:${heading}:${added.length}`, heading.trim());
    heading = "";
    body = "";
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
        <label class="search">
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
          <label class="search grow">
            <Icon name="bible" size={15} />
            <!-- svelte-ignore a11y_autofocus -->
            <input autofocus aria-label={t("Scripture reference")} placeholder={t("John 3:16-18, Psalm 23")} bind:value={reference} />
          </label>
          <select aria-label={t("Translation")} bind:value={translationId}>
            {#each session.translations as entry (entry.id)}<option value={entry.id}>{entry.abbreviation}</option>{/each}
          </select>
          <button type="submit" class="primary" disabled={!parsed}><Icon name="plus" size={14} /> {t("Add")}</button>
        </form>
        <p class="hint">{reference.trim() ? (parsed ? t("Adds {reference}", { reference: preview }) : t("Type a reference like John 3:16 or Psalm 23.")) : t("Type the short way: jn 3 16, ps 23, rom 8:28-30.")}</p>
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
          <label><span>{t("Heading")}</span><!-- svelte-ignore a11y_autofocus --><input autofocus aria-label={t("Heading")} placeholder={tab === "text" ? t("Welcome") : t("Youth camp")} bind:value={heading} /></label>
          <label><span>{t("Text")}</span><textarea aria-label={t("Text")} rows="5" placeholder={tab === "text" ? t("A few lines for the screen") : t("Saturday, 9am at the church hall")} bind:value={body}></textarea></label>
          {#if tab === "announcement"}
            <div class="designs" role="radiogroup" aria-label={t("Announcement design")}>
              {#each ANNOUNCEMENT_DESIGNS as design (design.id)}
                <button type="button" role="radio" aria-checked={annDesign === design.id} onclick={() => (annDesign = design.id)}><strong>{design.name}</strong><small>{design.hint}</small></button>
              {/each}
            </div>
          {/if}
          <button type="submit" class="primary wide" disabled={!heading.trim()}><Icon name="plus" size={14} /> {tab === "text" ? t("Add text") : t("Add announcement")}</button>
        </form>
      {:else if tab === "slides"}
        <div class="grid">
          {#each session.decks as deck (deck.id)}
            <button type="button" class="card" class:done={wasAdded(`deck:${deck.id}`)} onclick={() => { void session.addDeckToService(deck.id, target ?? undefined); note(`deck:${deck.id}`, deck.name); }}>
              <strong>{deck.name}</strong><span>{tn(deck.pages.length, "{n} page", "{n} pages")}</span><em>{wasAdded(`deck:${deck.id}`) ? t("Added") : ""}</em>
              <Icon name={wasAdded(`deck:${deck.id}`) ? "check" : "plus"} size={15} />
            </button>
          {:else}
            <p class="empty">{t("No slide decks yet. Make or import one (PowerPoint too) on the Production Desk › Media › Slides.")}</p>
          {/each}
        </div>
      {:else if tab === "media"}
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
            <p class="empty">{t("No pictures or videos yet. Import them in Settings › Media.")}</p>
          {/each}
        </div>
      {:else if tab === "look"}
        <div class="grid">
          {#each session.looksByFavorite as look (look.id)}
            <button type="button" class="card" class:done={wasAdded(`look:${look.id}`)} onclick={() => { void session.addLookToService(restoreComposition(look), target ?? undefined); note(`look:${look.id}`, look.name); }}>
              <strong>{look.name}</strong><span>{tn(look.layers.length, "{n} layer", "{n} layers")}</span><em>{wasAdded(`look:${look.id}`) ? t("Added") : ""}</em>
              <Icon name={wasAdded(`look:${look.id}`) ? "check" : "plus"} size={15} />
            </button>
          {:else}
            <p class="empty">{t("No saved looks yet. Design them on the Production Desk › Looks.")}</p>
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

<style>
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
  .card strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card em { font-size: 11px; font-style: normal; color: var(--muted); }
  .card :global(svg) { position: absolute; top: 10px; right: 10px; color: var(--muted); }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .card:hover :global(svg) { color: var(--accent); }
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
  .compose input, .compose textarea { padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 14px; resize: vertical; }
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
