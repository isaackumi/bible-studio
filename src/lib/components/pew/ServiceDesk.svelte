<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { parseReference, formatReference } from "../../bible/reference";
  import { sectionShort, sectionTone } from "../../domain/song";
  import { searchSongHits } from "../../domain/song-search";
  import { restoreComposition } from "../../domain/composition";
  import type { PresentationItem } from "../../domain/types";
  import { ANNOUNCEMENT_DESIGNS, type AnnouncementDesign } from "../../domain/announcement";
  import Icon from "../Icon.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import MonitorPair from "./MonitorPair.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import ItemThumb from "./ItemThumb.svelte";
  import ServiceTimeline from "./ServiceTimeline.svelte";
  import TemplatesDialog from "./TemplatesDialog.svelte";
  import OutlineDialog from "./OutlineDialog.svelte";
  import MacroBar from "../MacroBar.svelte";
  import SectionTime from "./SectionTime.svelte";
  import { planSchedule } from "../../domain/schedule";
  import { msg, t, tn } from "../../i18n/core";

  // The running order for a whole service: sections in order, any kind of item, and a way to
  // move through it item by item. Nothing here changes Program; LIVE still does.
  const SUGGESTED = ["Welcome", "Worship", "Word", "Offering", "Announcements", "Closing"];
  type Adding = "song" | "scripture" | "slides" | "media" | "announcement" | "look" | null;

  let newName = $state("");
  let sectionName = $state("");
  let adding = $state<Adding>(null);
  /** The templates window, opened on a template (or the first). */
  let templatesOpen = $state<{ id: string | null } | null>(null);
  /** A service whose delete button was pressed once (press again to delete). */
  let armedService = $state<string | null>(null);
  let outlineOpen = $state(false);

  // Drag and drop in the running order: a section by its handle, an item by its handle (into any
  // section). Alt+arrow keys on a handle move it without a mouse.
  let dragSection = $state<string | null>(null);
  let dragItem = $state<string | null>(null);
  let dropSection = $state<number | null>(null);
  let dropItem = $state<{ sectionId: string; index: number } | null>(null);

  function endDrag() {
    dragSection = null;
    dragItem = null;
    dropSection = null;
    dropItem = null;
  }

  /** Over an item: drop before it, or after it when past its middle. */
  function overItem(event: DragEvent, sectionId: string, index: number) {
    if (!dragItem) return;
    event.preventDefault();
    event.stopPropagation();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropItem = { sectionId, index: event.clientY > box.top + box.height / 2 ? index + 1 : index };
  }

  function dropHere(event: DragEvent) {
    event.preventDefault();
    if (dragItem && dropItem) session.moveItemTo(dragItem, dropItem.sectionId, dropItem.index);
    else if (dragSection && dropSection !== null) session.moveSectionTo(dragSection, dropSection);
    endDrag();
  }

  function gripKey(event: KeyboardEvent, move: (direction: 1 | -1) => void) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    move(event.key === "ArrowUp" ? -1 : 1);
    const target = event.currentTarget as HTMLElement;
    queueMicrotask(() => document.getElementById(target.id)?.focus());
  }
  let songQuery = $state("");
  let reference = $state("");
  let referenceNote = $state("");
  let heading = $state("");
  let body = $state("");
  let annLabel = $state(t("Announcement"));
  let annDesign = $state<AnnouncementDesign>("card");
  /** The item open in the editor. */
  let editing = $state<PresentationItem | null>(null);

  function edit(itemId: string) {
    editing = service?.sections.flatMap((section) => section.items).find((entry) => entry.id === itemId) ?? null;
  }

  /** A blank text slide, opened straight in the editor. */
  async function addText() {
    adding = null;
    const id = await session.addToService({ kind: "slide", title: "Text", slide: { heading: "Text", body: "", imageId: null } }, true);
    edit(id);
  }

  const service = $derived(session.service);
  const count = $derived(service?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0);
  const upNext = $derived(session.nextItem());
  const current = $derived(service && session.cursor.itemId ? service.sections.flatMap((section) => section.items).find((item) => item.id === session.cursor.itemId) : null);
  const songs = $derived(
    songQuery.trim()
      ? [...new Set(searchSongHits(session.songs, songQuery, 40).map((hit) => hit.songId))].map((id) => session.songs.find((song) => song.id === id)!).filter(Boolean)
      : session.songsByFavorite.slice(0, 40),
  );
  const looks = $derived(session.looksByFavorite);

  const KIND: Record<string, { icon: string; label: string }> = {
    lyric: { icon: "note", label: msg("Song") },
    bible: { icon: "bible", label: msg("Scripture") },
    deck: { icon: "stage", label: msg("Slides") },
    slide: { icon: "pencil", label: msg("Text") },
    image: { icon: "media", label: msg("Picture") },
    video: { icon: "play", label: msg("Video") },
    announcement: { icon: "alerts", label: msg("Announcement") },
    composition: { icon: "studio", label: msg("Look") },
  };

  function kindOf(item: PresentationItem) {
    const kind = KIND[item.kind];
    return kind ? { icon: kind.icon, label: t(kind.label) } : { icon: "list", label: item.kind };
  }

  const songOf = (item: PresentationItem) => (item.lyric ? session.songs.find((entry) => entry.id === item.lyric?.songId) : undefined);

  function detail(item: PresentationItem): string {
    if (item.kind === "lyric" && item.lyric) {
      const song = session.songs.find((entry) => entry.id === item.lyric?.songId);
      return song ? `${tn(song.sections.length, "{n} section", "{n} sections")}${song.author ? ` · ${song.author}` : ""}` : t("Song not found");
    }
    if (item.kind === "deck" && item.deck) {
      const deck = session.decks.find((entry) => entry.id === item.deck?.deckId);
      return deck ? tn(deck.pages.length, "{n} page", "{n} pages") : t("Deck not found");
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
      referenceNote = t("Type a reference like John 3:16 or Psalm 23.");
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
    session.addAnnouncementToService(heading, body, { design: annDesign, label: annLabel });
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

{#if editing}
  <ItemEditor item={editing} onclose={() => (editing = null)} />
{/if}

<section class="service-desk">
  <LibrarySidebar title={t("Services")} icon="list" count={session.services.length} storageKey="services">
    {#snippet actions()}
      <button type="button" class="desk-btn" title={t("Start a service from a template, or edit the templates")} onclick={() => (templatesOpen = { id: null })}><Icon name="list" size={14} /> {t("Templates")}</button>
      <button type="button" class="desk-btn" onclick={() => void session.createService(`${t("Service")} ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`)}><Icon name="plus" size={14} /> {t("New")}</button>
    {/snippet}
    <div class="list">
      {#if session.services.length === 0}<p class="empty">{t("No services yet. Start one to plan the order.")}</p>{/if}
      {#each session.services as entry (entry.id)}
        <div class="svc" class:on={service?.id === entry.id}>
          <button type="button" class="row" class:on={service?.id === entry.id} onclick={() => void session.openService(entry.id)}>
            <strong>{entry.name}</strong>
            <span>{new Date(entry.updatedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
          </button>
          <span class="svc-tools">
            <button type="button" class="row-tool" aria-label={t("Duplicate {name}", { name: entry.name })} title={t("Duplicate")} onclick={() => void session.duplicateService(entry.id)}><Icon name="copy" size={13} /></button>
            <button
              type="button"
              class="row-tool"
              class:armed={armedService === entry.id}
              aria-label={armedService === entry.id ? t("Confirm delete {name}", { name: entry.name }) : t("Delete {name}", { name: entry.name })}
              title={armedService === entry.id ? t("Click again to delete") : t("Delete")}
              onclick={() => {
                if (armedService !== entry.id) {
                  armedService = entry.id;
                  setTimeout(() => (armedService = armedService === entry.id ? null : armedService), 3000);
                  return;
                }
                armedService = null;
                void session.deleteService(entry.id);
              }}
            >{#if armedService === entry.id}{t("Delete?")}{:else}<Icon name="trash" size={13} />{/if}</button>
          </span>
        </div>
      {/each}
    </div>
  </LibrarySidebar>

  <div class="sheet">
    {#if service}
      <header class="head">
        <input class="name" aria-label={t("Service name")} value={service.name} onchange={(event) => session.renameService(event.currentTarget.value)} />
        <button type="button" class="desk-btn ghost save-tpl" title={t("The service on one page: print, save as PDF or copy")} onclick={() => (outlineOpen = true)}><Icon name="files" size={13} /> {t("Outline")}</button>
        <button type="button" class="desk-btn ghost save-tpl" title={t("Keep this service's parts and times to start the next one from")} onclick={() => { const made = session.saveServiceAsTemplate(service.name); if (made) templatesOpen = { id: made.id }; }}><Icon name="copy" size={13} /> {t("Save as template")}</button>
        <span class="muted">{count === 0 ? t("Nothing added yet") : `${tn(count, "{n} item", "{n} items")} · ${tn(service.sections.length, "{n} section", "{n} sections")}`}</span>
      </header>

      <div class="timeline-wrap"><ServiceTimeline {service} /></div>

      <div class="order">
        {#if count === 0 && service.sections.length === 0}
          <div class="start-guide">
            <Icon name="list" size={22} />
            <strong>{t("Build the running order")}</strong>
            <p>{t("Add songs, scripture, slides and announcements with the buttons below, in the order the service goes. On Sunday, Next item moves through them.")}</p>
            <p class="soft">{t("Sections like Welcome or Worship are optional; they group items under a heading.")}</p>
          </div>
        {/if}
        {#each service.sections as section, sectionIndex (section.id)}
          {@const plan = planSchedule(service)}
          {@const slot = plan.slots[sectionIndex]!}
          <section
            class="block"
            role="group"
            aria-label={section.name}
            class:target={session.cursor.sectionId === section.id}
            class:running={session.runningSectionId === section.id}
            class:dragging={dragSection === section.id}
            class:drop-before={dragSection !== null && dropSection === sectionIndex && dragSection !== section.id}
            style:--tone="var(--slot-{sectionIndex % 8})"
            ondragover={(event) => {
              if (dragSection) { event.preventDefault(); dropSection = sectionIndex; }
              else if (dragItem) { event.preventDefault(); dropItem = { sectionId: section.id, index: section.items.length }; }
            }}
            ondrop={dropHere}
          >
            <header class="block-head">
              <button
                type="button"
                id="grip-section-{section.id}"
                class="grip"
                draggable="true"
                aria-label={t("Move {name}: drag, or Alt+arrow keys", { name: section.name })}
                title={t("Drag to move this part")}
                ondragstart={(event) => { dragSection = section.id; event.dataTransfer?.setData("text/plain", section.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                ondragend={endDrag}
                onkeydown={(event) => gripKey(event, (direction) => session.moveSection(section.id, direction))}
              ><Icon name="grip" size={14} /></button>
              <span class="dot" aria-hidden="true"></span>
              <input class="section-name" aria-label={t("Section name")} value={section.name} onchange={(event) => session.renameSection(section.id, event.currentTarget.value)} onfocus={() => (session.cursor = { sectionId: section.id, itemId: session.cursor.itemId })} />
              {#if session.runningSectionId === section.id}<span class="now-tag">{t("Now")}</span>{/if}
              <SectionTime {section} {slot} {plan} tone="var(--slot-{sectionIndex % 8})" />
              <span class="tools">
                <button type="button" class="row-tool del" aria-label={t("Remove section")} title={t("Delete this part")} onclick={() => session.removeSection(section.id)}><Icon name="trash" size={14} /></button>
              </span>
            </header>
            {#if section.items.length === 0}
              <button type="button" class="drop-hint" class:drop-on={dropItem?.sectionId === section.id} onclick={() => (session.cursor = { sectionId: section.id, itemId: null })}>{dragItem ? t("Drop here") : t("Empty. Select this section, then add songs, scripture or slides below.")}</button>
            {/if}
            <ol class="items">
              {#each section.items as item, itemIndex (item.id)}
                {@const kind = kindOf(item)}
                <li
                  class="item"
                  class:on={session.cursor.itemId === item.id}
                  class:live={live(item)}
                  class:dragging={dragItem === item.id}
                  class:drop-before={dragItem !== null && dropItem?.sectionId === section.id && dropItem.index === itemIndex}
                  class:drop-after={dragItem !== null && dropItem?.sectionId === section.id && dropItem.index === itemIndex + 1 && itemIndex === section.items.length - 1}
                  ondragover={(event) => overItem(event, section.id, itemIndex)}
                  ondrop={dropHere}
                >
                  <button
                    type="button"
                    id="grip-item-{item.id}"
                    class="grip"
                    draggable="true"
                    aria-label={t("Move {title}: drag, or Alt+arrow keys", { title: item.title })}
                    title={t("Drag to move (into any part)")}
                    ondragstart={(event) => { dragItem = item.id; event.dataTransfer?.setData("text/plain", item.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                    ondragend={endDrag}
                    onkeydown={(event) => gripKey(event, (direction) => session.moveItem(item.id, direction))}
                  ><Icon name="grip" size={14} /></button>
                  <button type="button" class="item-main" onclick={(event) => open(item, event)} ondblclick={() => edit(item.id)} title={t("Click for Preview; double-click to edit")}>
                    <ItemThumb {item} icon={kind.icon} label={kind.label} />
                    <span class="item-copy">
                      <strong>{item.title}</strong>
                      {#if item.kind === "lyric" && songOf(item)}
                        <span class="mini-map" aria-label={t("Song map")}>
                          {#each songOf(item)!.sections as part (part.id)}<i style:--tone="var(--sec-{sectionTone(part)})" title={part.label}>{sectionShort(part)}</i>{/each}
                        </span>
                      {:else}
                        <em>{detail(item)}</em>
                      {/if}
                    </span>
                    {#if live(item)}<span class="badge live-badge">{t("Live")}</span>{:else if session.cursor.itemId === item.id}<span class="badge">{t("Preview")}</span>{/if}
                  </button>
                  <span class="tools">
                    {#if item.kind === "deck" && item.deck}
                      {@const looping = session.deckLoop?.deckId === item.deck.deckId}
                      <button type="button" class="loop" class:on={looping} title={looping ? t("Stop the loop") : t("Play on the screen by itself, a page every 8 seconds, round and round")} onclick={() => (looping ? session.stopDeckLoop() : void session.startDeckLoop(item.deck!.deckId, 8))}>
                        <Icon name="refresh" size={12} /> {looping ? t("Stop loop") : t("Loop")}
                      </button>
                    {/if}
                    <button type="button" class="row-tool" aria-label={t("Edit {title}", { title: item.title })} title={t("Edit")} onclick={() => edit(item.id)}><Icon name="pencil" size={13} /></button>
                    <button type="button" class="row-tool del" aria-label={t("Remove {title}", { title: item.title })} title={t("Delete")} onclick={() => session.removeItem(item.id)}><Icon name="trash" size={14} /></button>
                  </span>
                </li>
              {/each}
            </ol>
          </section>
        {/each}

        <form class="add-section" class:quiet={count === 0 && service.sections.length === 0} onsubmit={(event) => { event.preventDefault(); if (sectionName.trim()) session.addSection(sectionName.trim()); sectionName = ""; }}>
          <input aria-label={t("New section")} placeholder={t("Add a section")} bind:value={sectionName} />
          {#each SUGGESTED.filter((name) => !service.sections.some((section) => section.name === name)).slice(0, 4) as name (name)}
            <button type="button" class="chip" onclick={() => session.addSection(name)}>{name}</button>
          {/each}
        </form>
      </div>

      <footer class="add-bar">
        <span class="add-label">{t("Add to {part}", { part: service.sections.find((section) => section.id === session.cursor.sectionId)?.name ?? service.sections[0]?.name ?? t("the service") })}</span>
        <button type="button" class="add" onclick={() => void addText()}><Icon name="pencil" size={14} /> {t("Text")}</button>
        {#each [["song", msg("Song"), "note"], ["scripture", msg("Scripture"), "bible"], ["slides", msg("Slides"), "stage"], ["media", msg("Media"), "media"], ["announcement", msg("Announcement"), "alerts"], ["look", msg("Look"), "studio"]] as [id, label, icon] (id)}
          <button type="button" class="add" class:on={adding === id} aria-expanded={adding === id} onclick={() => (adding = adding === id ? null : (id as Adding))}><Icon name={icon} size={14} /> {t(label)}</button>
        {/each}
      </footer>

      {#if adding}
        <div class="picker" role="region" aria-label={t("Add to the service")}>
          {#if adding === "song"}
            <input aria-label={t("Find a song")} placeholder={t("Title, author or lyrics")} bind:value={songQuery} />
            <div class="pick-list">
              {#each songs as song (song.id)}
                <button type="button" onclick={() => session.addSongToService(song)}><Icon name="plus" size={13} /> <strong>{song.title || "Untitled song"}</strong><em>{song.author}</em></button>
              {:else}
                <p class="empty">{session.songs.length ? t("No songs match.") : t("No songs yet. Add them on the Songs page.")}</p>
              {/each}
            </div>
          {:else if adding === "scripture"}
            <form class="inline" onsubmit={(event) => { event.preventDefault(); addScripture(); }}>
              <input aria-label={t("Scripture reference")} placeholder={t("John 3:16-18, Psalm 23")} bind:value={reference} />
              <button type="submit" class="desk-btn">{t("Add")}</button>
            </form>
            {#if referenceNote}<p class="empty">{referenceNote}</p>{/if}
          {:else if adding === "slides"}
            <div class="pick-list">
              {#each session.decks as deck (deck.id)}
                <button type="button" onclick={() => void session.addDeckToService(deck.id)}><Icon name="plus" size={13} /> <strong>{deck.name}</strong><em>{tn(deck.pages.length, "{n} page", "{n} pages")}</em></button>
              {:else}
                <p class="empty">{t("No slide decks yet. Make or import one (PowerPoint too) on the Production Desk › Media › Slides.")}</p>
              {/each}
            </div>
          {:else if adding === "media"}
            <div class="pick-list">
              {#each session.mediaByFavorite as asset (asset.id)}
                <button type="button" onclick={() => session.addMediaToService(asset)}><Icon name="plus" size={13} /> <strong>{asset.name}</strong><em>{asset.kind}</em></button>
              {:else}
                <p class="empty">{t("No pictures or videos yet. Import them in Settings › Media.")}</p>
              {/each}
            </div>
          {:else if adding === "announcement"}
            <form class="stack" onsubmit={(event) => { event.preventDefault(); addAnnouncement(); }}>
              <input aria-label={t("Small line above the heading")} placeholder={t("Small line above (optional)")} bind:value={annLabel} />
              <input aria-label={t("Announcement heading")} placeholder={t("Youth camp")} bind:value={heading} />
              <textarea aria-label={t("Announcement text")} rows="2" placeholder={t("Saturday, 9am at the church hall")} bind:value={body}></textarea>
              <select aria-label={t("Announcement design")} bind:value={annDesign}>
                {#each ANNOUNCEMENT_DESIGNS as design (design.id)}<option value={design.id}>{design.name}: {design.hint.toLowerCase()}</option>{/each}
              </select>
              <button type="submit" class="desk-btn" disabled={!heading.trim()}>{t("Add announcement")}</button>
            </form>
          {:else if adding === "look"}
            <div class="pick-list">
              {#each looks as look (look.id)}
                <button type="button" onclick={() => void session.addLookToService(restoreComposition(look))}><Icon name="plus" size={13} /> <strong>{look.name}</strong><em>{t("Look")}</em></button>
              {:else}
                <p class="empty">{t("No saved looks yet. Design them on the Production Desk › Looks.")}</p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="blank">
        <Icon name="list" size={28} />
        <p>{t("Plan the whole service in order: welcome, songs, the reading, the sermon, announcements.")}</p>
        {#if session.workspace.serviceTemplates.length}
          <p class="from-label">{t("Start from a template, with its parts and times in place")}</p>
          <div class="from-templates">
            {#each session.workspace.serviceTemplates as template (template.id)}
              <button type="button" class="tpl-card" onclick={() => void session.createServiceFromTemplate(template.id)}>
                <strong>{template.name}</strong>
                <span>{template.parts.map((part) => part.name).slice(0, 4).join(" · ")}{template.parts.length > 4 ? " …" : ""}</span>
              </button>
            {/each}
            <button type="button" class="tpl-card edit" onclick={() => (templatesOpen = { id: null })}><strong>{t("Edit templates")}</strong><span>{t("Change the parts and times")}</span></button>
          </div>
          <p class="from-label">{t("Or a blank one")}</p>
        {/if}
        <form class="inline" onsubmit={(event) => { event.preventDefault(); void session.createService(newName.trim() || "Sunday Service"); newName = ""; }}>
          <input aria-label={t("Service name")} placeholder={t("Sunday Service")} bind:value={newName} />
          <button type="submit" class="desk-btn primary-soft">{t("Start a service")}</button>
        </form>
      </div>
    {/if}
  </div>

  <aside class="stage">
    <MonitorPair page="service" place={current?.title ?? ""} onstep={(direction) => void session.step(direction)} />
    <div class="next">
      <div class="next-copy">
        <span class="kicker">{t("Up next")}</span>
        <strong>{upNext?.title ?? (!service || count === 0 ? t("Nothing added yet") : t("End of the service"))}</strong>
      </div>
      <div class="item-steps">
        <button type="button" class="desk-btn" disabled={!service} onclick={() => void session.stepItem(-1)} title={t("Previous item (Page Up)")}><Icon name="chevron-left" size={15} /> {t("Previous")}</button>
        <button type="button" class="desk-btn primary-soft" disabled={!upNext} onclick={() => void session.stepItem(1)} title={t("Next item (Page Down)")}>{t("Next item")} <Icon name="chevron-right" size={15} /></button>
      </div>
      <p class="muted">{t("Arrows step inside an item (song sections, slide pages, verses); at the end they move on. Page Down jumps to the next item.")}</p>
    </div>
    <MacroBar />
  </aside>
</section>

{#if outlineOpen && session.service}
  <OutlineDialog service={session.service} onclose={() => (outlineOpen = false)} />
{/if}
{#if templatesOpen}
  <TemplatesDialog initialId={templatesOpen.id} onclose={() => (templatesOpen = null)} />
{/if}

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

  .timeline-wrap { flex: none; padding: 12px 14px 0; }
  .order { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .order > :global(*) { flex: none; }
  .block { border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 50%, var(--panel)); }
  .block.running { background: color-mix(in srgb, #30a46c 7%, var(--panel)); border-color: color-mix(in srgb, #30a46c 35%, var(--line)); }
  .block.running .section-name { color: var(--ink); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone, var(--muted)); flex: none; margin-left: 6px; }
  .now-tag { flex: none; height: 20px; padding: 0 8px; border-radius: 10px; background: #30a46c; color: #fff; font-size: 11px; font-weight: 750; display: inline-flex; align-items: center; letter-spacing: 0.02em; }
  /* The same colours as the timeline, by a section's place in the service. */
  .service-desk { --slot-0: #5aa0d6; --slot-1: #b07cc6; --slot-2: #e0884e; --slot-3: #58b3a4; --slot-4: #d9677a; --slot-5: #c9a35b; --slot-6: #7d8fe0; --slot-7: #7fa36b; }
  .block.target { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .block-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 6px; border-bottom: 1px solid var(--line); }
  .section-name { flex: 1; height: 28px; border-color: transparent; background: none; font-size: 12px; font-weight: 750; letter-spacing: 0; color: var(--muted); }
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
  .item-copy { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .item-copy strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-map { display: flex; gap: 2px; overflow: hidden; }
  .mini-map i { flex: none; padding: 0 4px; border-radius: 3px; background: color-mix(in srgb, var(--tone) 26%, var(--field)); color: var(--ink); font-style: normal; font-size: 10px; font-weight: 700; line-height: 15px; }
  .item-copy em { font-style: normal; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex: none; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: 10px; font-weight: 750; }
  .live-badge { background: var(--live); color: #fff; }
  .loop { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; margin-right: 4px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .loop:hover { color: var(--ink); border-color: var(--accent); }
  .loop.on { border-color: var(--live); color: var(--live); background: color-mix(in srgb, var(--live) 10%, transparent); }
  .start-guide { display: grid; justify-items: center; gap: 8px; max-width: 460px; margin: 48px auto 24px; text-align: center; color: var(--muted); }
  .start-guide strong { color: var(--ink); font-size: 16px; }
  .start-guide p { margin: 0; font-size: 13px; line-height: 1.5; }
  .start-guide .soft { font-size: 12px; opacity: 0.85; }
  .add-section.quiet { opacity: 0.75; }
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
  .kicker { font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .next-copy strong { font-size: 15px; }
  .item-steps { display: flex; gap: 6px; }
  .item-steps :global(.desk-btn) { flex: 1; justify-content: center; }

  @media (max-width: 1280px) {
    .service-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
  }
  .save-tpl { flex: none; height: 30px; font-size: 12px; }
  .from-label { margin: 6px 0 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .from-templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; width: min(640px, 100%); }
  .tpl-card { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; }
  .tpl-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .tpl-card strong { font-size: 14px; }
  .tpl-card span { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .tpl-card.edit { border-style: dashed; background: none; }
  .svc { position: relative; flex: none; }
  .svc .row { padding-right: 64px; }
  .svc-tools { position: absolute; top: 8px; right: 6px; display: none; gap: 2px; }
  .svc:hover .svc-tools, .svc:focus-within .svc-tools, .svc-tools:has(.armed) { display: inline-flex; }
  .svc-tools .armed { width: auto; padding: 0 8px; color: var(--danger, #e5484d); font-size: 12px; font-weight: 700; }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--field); }
  .grip:active { cursor: grabbing; }
  .block.dragging, .item.dragging { opacity: 0.4; }
  .block.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .item.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .item.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .drop-hint.drop-on { border-color: var(--accent); color: var(--accent); }
  .row-tool.del:hover { color: var(--danger, #e5484d); }
</style>
