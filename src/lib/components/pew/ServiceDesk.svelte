<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { parseReference, formatReference } from "../../bible/reference";
  import { searchSongHits } from "../../domain/song-search";
  import { restoreComposition } from "../../domain/composition";
  import type { PresentationItem } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import MonitorPair from "./MonitorPair.svelte";

  // The running order for a whole service: sections in order, any kind of item, and a way to
  // move through it item by item. Nothing here changes Program; LIVE still does.
  const SUGGESTED = ["Welcome", "Worship", "Word", "Offering", "Announcements", "Closing"];
  type Adding = "song" | "scripture" | "slides" | "media" | "announcement" | "look" | null;

  let newName = $state("");
  let sectionName = $state("");
  let adding = $state<Adding>(null);
  let songQuery = $state("");
  let reference = $state("");
  let referenceNote = $state("");
  let heading = $state("");
  let body = $state("");

  const service = $derived(session.service);
  const count = $derived(service?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0);
  const upNext = $derived(session.nextItem());
  const current = $derived(service && session.cursor.itemId ? service.sections.flatMap((section) => section.items).find((item) => item.id === session.cursor.itemId) : null);
  const songs = $derived(
    songQuery.trim()
      ? [...new Set(searchSongHits(session.songs, songQuery, 40).map((hit) => hit.songId))].map((id) => session.songs.find((song) => song.id === id)!).filter(Boolean)
      : session.songs.slice(0, 40),
  );
  const looks = $derived(session.workspace.compositions);

  const KIND: Record<string, { icon: string; label: string }> = {
    lyric: { icon: "note", label: "Song" },
    bible: { icon: "bible", label: "Scripture" },
    deck: { icon: "stage", label: "Slides" },
    slide: { icon: "stage", label: "Slide" },
    image: { icon: "media", label: "Picture" },
    video: { icon: "play", label: "Video" },
    announcement: { icon: "alerts", label: "Announcement" },
    composition: { icon: "studio", label: "Look" },
  };

  function kindOf(item: PresentationItem) {
    return KIND[item.kind] ?? { icon: "list", label: item.kind };
  }

  function detail(item: PresentationItem): string {
    if (item.kind === "lyric" && item.lyric) {
      const song = session.songs.find((entry) => entry.id === item.lyric?.songId);
      return song ? `${song.sections.length} section${song.sections.length === 1 ? "" : "s"}${song.author ? ` · ${song.author}` : ""}` : "Song not found";
    }
    if (item.kind === "deck" && item.deck) {
      const deck = session.decks.find((entry) => entry.id === item.deck?.deckId);
      return deck ? `${deck.pages.length} page${deck.pages.length === 1 ? "" : "s"}` : "Deck not found";
    }
    if (item.kind === "bible" && item.bible) return session.translations.find((entry) => entry.id === item.bible?.translationId)?.abbreviation ?? "";
    if (item.kind === "announcement") return item.announcement?.body.split("\n")[0] ?? "";
    return kindOf(item).label;
  }

  const live = (item: PresentationItem) =>
    session.live.program.sourceId === item.id || (item.kind === "composition" && session.live.program.sourceId?.includes(item.composition?.compositionId ?? "~"));

  function open(item: PresentationItem, event: MouseEvent) {
    (event.currentTarget as HTMLElement).blur();
    void session.selectItem(item.id);
  }

  function addScripture() {
    const parsed = parseReference(reference);
    const translation = session.translations[0];
    if (!parsed || !translation) {
      referenceNote = "Type a reference like John 3:16 or Psalm 23.";
      return;
    }
    const book = session.books.find((entry) => entry.ord === parsed.bookOrd);
    const start = parsed.startVerse ?? 1;
    const end = parsed.endVerse ?? (parsed.startVerse ? start : start);
    session.addPassageToService({
      translationId: translation.id,
      bookOrd: parsed.bookOrd,
      chapter: parsed.chapter,
      startVerse: start,
      endVerse: end,
      reference: formatReference(parsed.bookName, parsed.chapter, start, end, book?.chapters ?? 1),
    });
    reference = "";
    referenceNote = "";
  }

  function addAnnouncement() {
    session.addAnnouncementToService(heading, body);
    heading = "";
    body = "";
  }

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === "PageDown" || (event.key === "ArrowDown" && event.altKey)) {
      event.preventDefault();
      void session.stepItem(1);
    } else if (event.key === "PageUp" || (event.key === "ArrowUp" && event.altKey)) {
      event.preventDefault();
      void session.stepItem(-1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="service-desk">
  <LibrarySidebar title="Services" icon="list" count={session.services.length} storageKey="services">
    {#snippet actions()}
      <button type="button" class="desk-btn" onclick={() => void session.createService(`Service ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`)}><Icon name="plus" size={14} /> New</button>
    {/snippet}
    <div class="list">
      {#if session.services.length === 0}<p class="empty">No services yet. Start one to plan the order.</p>{/if}
      {#each session.services as entry (entry.id)}
        <button type="button" class="row" class:on={service?.id === entry.id} onclick={() => void session.openService(entry.id)}>
          <strong>{entry.name}</strong>
          <span>{new Date(entry.updatedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
        </button>
      {/each}
    </div>
  </LibrarySidebar>

  <div class="sheet">
    {#if service}
      <header class="head">
        <input class="name" aria-label="Service name" value={service.name} onchange={(event) => session.renameService(event.currentTarget.value)} />
        <span class="muted">{count} item{count === 1 ? "" : "s"} in {service.sections.length} section{service.sections.length === 1 ? "" : "s"}</span>
      </header>

      <div class="order">
        {#each service.sections as section, sectionIndex (section.id)}
          <section class="block" class:target={session.cursor.sectionId === section.id}>
            <header class="block-head">
              <input class="section-name" aria-label="Section name" value={section.name} onchange={(event) => session.renameSection(section.id, event.currentTarget.value)} onfocus={() => (session.cursor = { sectionId: section.id, itemId: session.cursor.itemId })} />
              <span class="tools">
                <button type="button" class="row-tool" aria-label="Move section up" disabled={sectionIndex === 0} onclick={() => session.moveSection(section.id, -1)}><Icon name="chevron-up" size={14} /></button>
                <button type="button" class="row-tool" aria-label="Move section down" disabled={sectionIndex === service.sections.length - 1} onclick={() => session.moveSection(section.id, 1)}><Icon name="chevron-down" size={14} /></button>
                <button type="button" class="row-tool" aria-label="Remove section" onclick={() => session.removeSection(section.id)}><Icon name="trash" size={13} /></button>
              </span>
            </header>
            {#if section.items.length === 0}
              <button type="button" class="drop-hint" onclick={() => (session.cursor = { sectionId: section.id, itemId: null })}>Empty. Select this section, then add songs, scripture or slides below.</button>
            {/if}
            <ol class="items">
              {#each section.items as item (item.id)}
                {@const kind = kindOf(item)}
                <li class="item" class:on={session.cursor.itemId === item.id} class:live={live(item)}>
                  <button type="button" class="item-main" onclick={(event) => open(item, event)}>
                    <span class="kind" title={kind.label}><Icon name={kind.icon} size={14} /></span>
                    <span class="item-copy"><strong>{item.title}</strong><em>{detail(item)}</em></span>
                    {#if live(item)}<span class="badge live-badge">Live</span>{:else if session.cursor.itemId === item.id}<span class="badge">Preview</span>{/if}
                  </button>
                  <span class="tools">
                    {#if item.kind === "deck" && item.deck}
                      {@const looping = session.deckLoop?.deckId === item.deck.deckId}
                      <button type="button" class="loop" class:on={looping} title={looping ? "Stop the loop" : "Play on the screen by itself, a page every 8 seconds, round and round"} onclick={() => (looping ? session.stopDeckLoop() : void session.startDeckLoop(item.deck!.deckId, 8))}>
                        <Icon name="refresh" size={12} /> {looping ? "Stop loop" : "Loop"}
                      </button>
                    {/if}
                    <button type="button" class="row-tool" aria-label="Move up" onclick={() => session.moveItem(item.id, -1)}><Icon name="chevron-up" size={14} /></button>
                    <button type="button" class="row-tool" aria-label="Move down" onclick={() => session.moveItem(item.id, 1)}><Icon name="chevron-down" size={14} /></button>
                    <button type="button" class="row-tool" aria-label={`Remove ${item.title}`} onclick={() => session.removeItem(item.id)}><Icon name="close" size={13} /></button>
                  </span>
                </li>
              {/each}
            </ol>
          </section>
        {/each}

        <form class="add-section" onsubmit={(event) => { event.preventDefault(); if (sectionName.trim()) session.addSection(sectionName.trim()); sectionName = ""; }}>
          <input aria-label="New section" placeholder="Add a section" bind:value={sectionName} />
          {#each SUGGESTED.filter((name) => !service.sections.some((section) => section.name === name)).slice(0, 4) as name (name)}
            <button type="button" class="chip" onclick={() => session.addSection(name)}>{name}</button>
          {/each}
        </form>
      </div>

      <footer class="add-bar">
        <span class="add-label">Add to {service.sections.find((section) => section.id === session.cursor.sectionId)?.name ?? service.sections[0]?.name ?? "the service"}</span>
        {#each [["song", "Song", "note"], ["scripture", "Scripture", "bible"], ["slides", "Slides", "stage"], ["media", "Media", "media"], ["announcement", "Announcement", "alerts"], ["look", "Look", "studio"]] as [id, label, icon] (id)}
          <button type="button" class="add" class:on={adding === id} aria-expanded={adding === id} onclick={() => (adding = adding === id ? null : (id as Adding))}><Icon name={icon} size={14} /> {label}</button>
        {/each}
      </footer>

      {#if adding}
        <div class="picker" role="region" aria-label="Add {adding}">
          {#if adding === "song"}
            <input aria-label="Find a song" placeholder="Title, author or lyrics" bind:value={songQuery} />
            <div class="pick-list">
              {#each songs as song (song.id)}
                <button type="button" onclick={() => session.addSongToService(song)}><Icon name="plus" size={13} /> <strong>{song.title || "Untitled song"}</strong><em>{song.author}</em></button>
              {:else}
                <p class="empty">{session.songs.length ? "No songs match." : "No songs yet. Add them on the Songs page."}</p>
              {/each}
            </div>
          {:else if adding === "scripture"}
            <form class="inline" onsubmit={(event) => { event.preventDefault(); addScripture(); }}>
              <input aria-label="Scripture reference" placeholder="John 3:16-18, Psalm 23" bind:value={reference} />
              <button type="submit" class="desk-btn">Add</button>
            </form>
            {#if referenceNote}<p class="empty">{referenceNote}</p>{/if}
          {:else if adding === "slides"}
            <div class="pick-list">
              {#each session.decks as deck (deck.id)}
                <button type="button" onclick={() => void session.addDeckToService(deck.id)}><Icon name="plus" size={13} /> <strong>{deck.name}</strong><em>{deck.pages.length} pages</em></button>
              {:else}
                <p class="empty">No slide decks yet. Make or import one (PowerPoint too) on the Production Desk › Media › Slides.</p>
              {/each}
            </div>
          {:else if adding === "media"}
            <div class="pick-list">
              {#each session.media as asset (asset.id)}
                <button type="button" onclick={() => session.addMediaToService(asset)}><Icon name="plus" size={13} /> <strong>{asset.name}</strong><em>{asset.kind}</em></button>
              {:else}
                <p class="empty">No pictures or videos yet. Import them in Settings › Media.</p>
              {/each}
            </div>
          {:else if adding === "announcement"}
            <form class="stack" onsubmit={(event) => { event.preventDefault(); addAnnouncement(); }}>
              <input aria-label="Announcement heading" placeholder="Youth camp" bind:value={heading} />
              <textarea aria-label="Announcement text" rows="2" placeholder="Saturday, 9am at the church hall" bind:value={body}></textarea>
              <button type="submit" class="desk-btn" disabled={!heading.trim()}>Add announcement</button>
            </form>
          {:else if adding === "look"}
            <div class="pick-list">
              {#each looks as look (look.id)}
                <button type="button" onclick={() => void session.addLookToService(restoreComposition(look))}><Icon name="plus" size={13} /> <strong>{look.name}</strong><em>Look</em></button>
              {:else}
                <p class="empty">No saved looks yet. Design them on the Production Desk › Looks.</p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="blank">
        <Icon name="list" size={28} />
        <p>Plan the whole service in order: welcome, songs, the reading, the sermon, announcements.</p>
        <form class="inline" onsubmit={(event) => { event.preventDefault(); void session.createService(newName.trim() || "Sunday Service"); newName = ""; }}>
          <input aria-label="Service name" placeholder="Sunday Service" bind:value={newName} />
          <button type="submit" class="desk-btn primary-soft">Start a service</button>
        </form>
      </div>
    {/if}
  </div>

  <aside class="stage">
    <MonitorPair page="service" place={current?.title ?? ""} onstep={(direction) => void session.step(direction)} />
    <div class="next">
      <div class="next-copy">
        <span class="kicker">Up next</span>
        <strong>{upNext?.title ?? (service ? "End of the service" : "Nothing planned")}</strong>
      </div>
      <div class="item-steps">
        <button type="button" class="desk-btn" disabled={!service} onclick={() => void session.stepItem(-1)} title="Previous item (Page Up)"><Icon name="chevron-left" size={15} /> Previous</button>
        <button type="button" class="desk-btn primary-soft" disabled={!upNext} onclick={() => void session.stepItem(1)} title="Next item (Page Down)">Next item <Icon name="chevron-right" size={15} /></button>
      </div>
      <p class="muted">Arrows step inside an item (song sections, slide pages, verses); at the end they move on. Page Down jumps to the next item.</p>
    </div>
  </aside>
</section>

<style>
  .service-desk {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(280px, 380px);
    gap: var(--gap, 10px);
    padding: var(--gap, 10px) var(--panel-pad, 12px) var(--panel-pad, 12px);
  }
  .sheet, .stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
    overflow: hidden;
  }
  input, textarea { border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; min-width: 0; }
  input { height: 32px; padding: 0 10px; }
  textarea { padding: 8px 10px; resize: vertical; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .empty { margin: 0; padding: 8px 6px; color: var(--muted); font-size: 12px; }

  .list { margin: 0; padding: 0 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .list > :global(*) { flex: none; }
  .row { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); background: none; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
  .row strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row span { font-size: 11px; color: var(--muted); }
  .row:hover { background: var(--field); }
  .row.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }

  .head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); flex: none; }
  .name { flex: 1; height: 38px; font-size: 17px; font-weight: 700; border-color: transparent; background: none; }
  .name:hover, .name:focus { border-color: var(--line); background: var(--field); }

  .order { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .order > :global(*) { flex: none; }
  .block { border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 50%, var(--panel)); overflow: hidden; }
  .block.target { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .block-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 6px; border-bottom: 1px solid var(--line); }
  .section-name { flex: 1; height: 28px; border-color: transparent; background: none; font-size: 12px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .section-name:focus { border-color: var(--line); background: var(--field); color: var(--ink); }
  .tools { display: flex; gap: 2px; flex: none; }
  .row-tool { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; }
  .row-tool:hover:not(:disabled) { background: var(--field); color: var(--ink); }
  .row-tool:disabled { opacity: 0.3; }
  .drop-hint { display: block; width: calc(100% - 12px); margin: 6px; padding: 10px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .items { list-style: none; margin: 0; padding: 4px; display: grid; gap: 2px; }
  .item { display: flex; align-items: center; gap: 4px; border: 1px solid transparent; border-radius: 8px; }
  .item:hover { background: var(--field); }
  .item.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--panel)); }
  .item.live { box-shadow: inset 3px 0 0 var(--live); }
  .item-main { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 7px 8px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .kind { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 7px; background: var(--panel); color: var(--accent); border: 1px solid var(--line); }
  .item-copy { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .item-copy strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-copy em { font-style: normal; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex: none; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 10px; font-weight: 750; }
  .live-badge { background: var(--live); color: #fff; }
  .loop { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; margin-right: 4px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .loop:hover { color: var(--ink); border-color: var(--accent); }
  .loop.on { border-color: var(--live); color: var(--live); background: color-mix(in srgb, var(--live) 10%, transparent); }
  .add-section { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .add-section input { width: 180px; }
  .chip { height: 28px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .chip:hover { color: var(--ink); border-color: var(--accent); }

  .add-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--line); flex: none; }
  .add-label { margin-right: 4px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .add { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .add.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .picker { display: flex; flex-direction: column; gap: 8px; padding: 0 14px 12px; max-height: 260px; flex: none; }
  .pick-list { overflow: auto; display: grid; gap: 2px; }
  .pick-list button { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .pick-list button:hover { background: var(--field); }
  .pick-list strong { font-weight: 600; }
  .pick-list em { margin-left: auto; font-style: normal; font-size: 11px; color: var(--muted); }
  .inline { display: flex; gap: 6px; }
  .inline input { flex: 1; }
  .stack { display: grid; gap: 6px; }

  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 12px; padding: 24px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; max-width: 40ch; }

  .stage { padding: 12px; gap: 12px; overflow: auto; }
  .next { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); flex: none; }
  .next-copy { display: grid; gap: 4px; }
  .kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .next-copy strong { font-size: 15px; }
  .item-steps { display: flex; gap: 6px; }
  .item-steps :global(.desk-btn) { flex: 1; justify-content: center; }

  @media (max-width: 1280px) {
    .service-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
  }
</style>
