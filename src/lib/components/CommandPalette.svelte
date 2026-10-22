<script lang="ts">
  import { session } from "../app/session.svelte";
  import { formatReference, parseReference } from "../bible/reference";
  import type { BibleItem, PewPage } from "../domain/types";
  import Icon from "./Icon.svelte";
  import { msg, t, tn } from "../i18n/core";
  import { audienceRoom } from "../app/rooms.svelte";
  import { pictures } from "../app/pictures.svelte";

  // Go to anything (⌘K / Ctrl+K), from any page: a page, a part or item of the service, a song, a
  // verse ("John 3:16" goes on Preview), a setting, or an action (LIVE, Clear, Start service…).
  let query = $state("");
  let active = $state(0);
  let input = $state<HTMLInputElement | undefined>();
  let list = $state<HTMLDivElement | undefined>();

  type Entry = { id: string; group: string; label: string; detail?: string; icon: string; run: () => void | Promise<void>; words?: string };

  const SETTINGS: Array<[string, string, string, string]> = [
    ["general", msg("Church"), "church", "name logo ccli"],
    ["appearance", msg("Appearance"), "look", "theme dark light accent size borders"],
    ["keyboard", msg("Keyboard"), "keys", "shortcuts keys"],
    ["audience", msg("Audience output"), "cast", "projector screen window"],
    ["displays", msg("Displays"), "screens", "monitor screen"],
    ["themes", msg("Themes"), "themes", "background font look"],
    ["stage", msg("Stage display"), "stage", "confidence"],
    ["captions", msg("Captions"), "captions", "subtitles translate"],
    ["bible", msg("Bible"), "bible", "translation"],
    ["lyrics", msg("Songs"), "lyrics", "lyrics import ccli"],
    ["media", msg("Media"), "media", "pictures video"],
    ["audio", msg("Sound & voice"), "audio", "microphone listen"],
    ["remote", msg("Phone remote"), "phone", "phone pair"],
    ["storage", msg("Backup"), "files", "export import"],
  ];

  const go = (page: PewPage) => () => {
    if (session.workspace.appearance.desk !== "pewbeam") session.setAppearance({ desk: "pewbeam" });
    session.pageRequest = page;
  };

  /** Fixed entries: actions, pages and settings. */
  const fixed = $derived.by((): Entry[] => {
    const entries: Entry[] = [
      { id: "a-live", group: msg("Actions"), label: msg("Go LIVE"), detail: msg("Send Preview to the screen"), icon: "play", run: () => session.take(), words: "take show send" },
      { id: "a-clear", group: msg("Actions"), label: msg("Clear the screen"), icon: "close", run: () => session.clear(), words: "clear empty" },
      { id: "a-black", group: msg("Actions"), label: msg("Black screen"), icon: "moon", run: () => session.black(), words: "black dark" },
      { id: "a-logo", group: msg("Actions"), label: msg("Show the logo"), icon: "logo", run: () => session.logo(), words: "logo" },
      { id: "a-audience", group: msg("Actions"), label: msg("Open the audience screen"), icon: "cast", run: () => session.openAudience(), words: "projector output window" },
    ];
    if (session.service) {
      entries.push(
        session.serviceRunning
          ? { id: "a-end", group: msg("Actions"), label: msg("End service"), detail: session.service.name, icon: "square", run: () => session.endService(), words: "stop finish" }
          : { id: "a-start", group: msg("Actions"), label: msg("Start service"), detail: session.service.name, icon: "play", run: () => session.startService(), words: "begin" },
      );
    }
    entries.push(
      { id: "p-scriptures", group: msg("Pages"), label: msg("Scriptures"), icon: "bible", run: go("scriptures"), words: "bible verses presenter" },
      { id: "p-songs", group: msg("Pages"), label: msg("Songs"), icon: "lyrics", run: go("songs"), words: "lyrics hymns" },
      { id: "p-sermon", group: msg("Pages"), label: msg("Sermon"), icon: "book", run: go("sermon"), words: "notes preaching" },
      { id: "p-service", group: msg("Pages"), label: msg("Service"), icon: "list", run: go("service"), words: "running order plan" },
      // The design studio: slides, templates, lower thirds, gradients, icons and pictures.
      { id: "d-studio", group: msg("Design"), label: msg("Design studio"), detail: msg("Slides, gradients, shapes, icons and pictures"), icon: "stage", run: () => session.openStudio(), words: "design studio slides editor deck page graphics gradient shape icon picture image svg logo rotate group" },
      { id: "d-template", group: msg("Design"), label: msg("New page from a template"), detail: msg("Welcome, event, verse, sermon, giving"), icon: "plus", run: () => session.openStudio(undefined, "templates"), words: "template templates layout welcome event announcement notices verse scripture sermon series giving prayer design" },
      { id: "setup-again", group: msg("Help"), label: msg("Run setup again"), detail: msg("Walk through church name, look, scripture and voice again."), icon: "help", run: () => session.restartOnboarding(), words: "setup onboarding welcome first run start again wizard church name" },
      // Pictures from a folder, and slideshows.
      { id: "pic-folder", group: msg("Media"), label: msg("Pictures from a folder"), detail: msg("Show pictures straight from any folder"), icon: "media", run: () => pictures.show(), words: "pictures photos images folder album jpg png gif bmp browse" },
      { id: "pic-slideshow", group: msg("Media"), label: msg("Slideshow"), detail: msg("A folder of pictures on the screen, one after another"), icon: "media", run: () => pictures.show(), words: "slideshow slide show photos loop walk-in announcements auto advance" },
      // The congregation's phones.
      { id: "aud-qa", group: msg("Audience"), label: msg("Live Q&A"), detail: msg("People ask and vote from their phones"), icon: "users", run: () => audienceRoom.show(), words: "q&a questions ask audience congregation phone qr room moderate vote" },
      { id: "aud-games", group: msg("Audience"), label: msg("Quizzes and Bible games"), detail: msg("Played on people's phones"), icon: "users", run: () => audienceRoom.show(), words: "quiz quizzes game games bible trivia kahoot play youth children leaderboard" },
      { id: "aud-poll", group: msg("Audience"), label: msg("Poll"), detail: msg("Let the congregation vote"), icon: "users", run: () => audienceRoom.show(), words: "poll vote voting choose survey" },
      { id: "d-lower", group: msg("Design"), label: msg("Lower thirds"), detail: msg("Name bars that go over a camera"), icon: "captions", run: () => session.openStudio(undefined, "templates"), words: "lower third thirds name bar caption speaker overlay camera" },
    );
    for (const [id, label, icon, words] of SETTINGS) entries.push({ id: `s-${id}`, group: msg("Settings"), label, icon, run: () => session.openSettings(id), words: `settings ${words}` });
    return entries;
  });

  /** A verse typed ("John 3:16", "ps 23"), shown on Preview. */
  const verse = $derived.by((): Entry | null => {
    const ref = query.trim() ? parseReference(query) : null;
    if (!ref) return null;
    const book = session.books.find((entry) => entry.ord === ref.bookOrd);
    const start = ref.startVerse ?? 1;
    const end = ref.endVerse ?? start;
    const reference = formatReference(ref.bookName, ref.chapter, start, end, book?.chapters ?? 1);
    const passage: BibleItem = { translationId: session.workspace.deskTranslationId ?? session.translations[0]?.id ?? "kjv", bookOrd: ref.bookOrd, chapter: ref.chapter, startVerse: start, endVerse: end, reference };
    return { id: `v-${reference}`, group: msg("Scripture"), label: t("Show {reference} on Preview", { reference }), icon: "bible", run: () => session.previewPassage(passage) };
  });

  const words = (text: string) => text.toLowerCase();
  /** How well an entry matches: 0 no match, higher is better (start of a word beats inside one). */
  function score(entry: Entry, q: string): number {
    if (!q) return 1;
    const label = words(t(entry.label));
    const hay = `${label} ${words(entry.detail ?? "")} ${words(entry.words ?? "")} ${words(t(entry.group))}`;
    if (label.startsWith(q)) return 4;
    if (label.split(/\s+/).some((word) => word.startsWith(q))) return 3;
    if (hay.includes(q)) return 2;
    const parts = q.split(/\s+/).filter(Boolean);
    return parts.length > 1 && parts.every((part) => hay.includes(part)) ? 1 : 0;
  }

  const results = $derived.by((): Entry[] => {
    const q = query.trim().toLowerCase();
    const found: Array<Entry & { rank: number }> = [];
    const add = (entry: Entry, bonus = 0) => {
      const rank = score(entry, q);
      if (rank) found.push({ ...entry, rank: rank + bonus });
    };
    if (verse) found.push({ ...verse, rank: 10 });
    // The service: its parts and items, when there is a query (or the running order when empty).
    const service = session.service;
    if (service && q) {
      for (const section of service.sections) {
        add({ id: `sec-${section.id}`, group: msg("Service"), label: section.name, detail: t("Part of {service}", { service: service.name }), icon: "list", run: () => { const first = section.items[0]; go("service")(); if (first) void session.selectItem(first.id); } });
        for (const item of section.items) add({ id: `item-${item.id}`, group: msg("Service"), label: item.title, detail: section.name, icon: item.kind === "bible" ? "bible" : item.kind === "lyric" ? "lyrics" : "files", run: () => { go("service")(); void session.selectItem(item.id); } });
      }
    }
    if (q) {
      for (const deck of session.decks) add({ id: `deck-${deck.id}`, group: msg("Design"), label: t("Edit slides: {name}", { name: deck.name }), detail: tn(deck.pages.length, "{n} page", "{n} pages"), icon: "stage", run: () => session.openStudio(deck.id) });
      for (const song of session.songs) add({ id: `song-${song.id}`, group: msg("Songs"), label: song.title || t("Untitled song"), detail: song.author || undefined, icon: "lyrics", run: () => { go("songs")(); session.previewSongSection(song, song.sections[0]?.id ?? null); } });
    }
    for (const entry of fixed) add(entry, entry.group === "Actions" ? 0.5 : 0);
    // Best first, at most a handful from each group so one big library does not crowd the rest.
    found.sort((a, b) => b.rank - a.rank);
    // Then together by group, the group with the best match first.
    const groups = new Map<string, Entry[]>();
    for (const entry of found) {
      const members = groups.get(entry.group) ?? [];
      if (members.length < (q ? 6 : 8)) members.push(entry);
      groups.set(entry.group, members);
    }
    return [...groups.values()].flat().slice(0, 30);
  });

  $effect(() => {
    void results;
    active = 0;
  });

  // Opened from the key or a button: start empty, with the cursor in the field.
  $effect(() => {
    if (!session.commandOpen) return;
    query = "";
    requestAnimationFrame(() => input?.focus());
  });
  const close = () => (session.commandOpen = false);
  async function choose(entry: Entry | undefined) {
    if (!entry) return;
    close();
    await entry.run();
  }
  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      session.commandOpen = !session.commandOpen;
      return;
    }
    if (!session.commandOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
      requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void choose(results[active]);
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if session.commandOpen}
  <div class="layer">
    <button type="button" class="backdrop" aria-label={t("Close")} tabindex="-1" onclick={close}></button>
    <div class="palette" role="dialog" aria-modal="true" aria-label={t("Go to anything")}>
      <label class="find">
        <Icon name="search" size={16} />
        <input bind:this={input} bind:value={query} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[active] ? `palette-${results[active]!.id}` : undefined} placeholder={t("Go to a page, song, verse, part or setting…")} />
        <kbd>esc</kbd>
      </label>
      <div class="list" id="palette-list" role="listbox" bind:this={list}>
        {#each results as entry, index (entry.id)}
          {#if index === 0 || results[index - 1]!.group !== entry.group}<p class="group">{t(entry.group)}</p>{/if}
          <button type="button" id="palette-{entry.id}" role="option" class="entry" aria-selected={index === active} onmouseenter={() => (active = index)} onclick={() => void choose(entry)}>
            <span class="icon"><Icon name={entry.icon} size={14} /></span>
            <span class="label">{t(entry.label)}</span>
            {#if entry.detail}<span class="detail">{entry.detail}</span>{/if}
            {#if index === active}<kbd class="enter">↵</kbd>{/if}
          </button>
        {:else}
          <p class="none">{t("Nothing found. Try a song title, a part of the service, or a verse like John 3:16.")}</p>
        {/each}
      </div>
      <p class="foot"><kbd>↑</kbd><kbd>↓</kbd> {t("to move")} · <kbd>↵</kbd> {t("to open")} · <kbd>⌘K</kbd> {t("any time")}</p>
    </div>
  </div>
{/if}

<style>
  .layer { position: fixed; inset: 0; z-index: 1200; display: grid; justify-items: center; align-items: start; padding-top: 12vh; }
  .backdrop { position: absolute; inset: 0; border: 0; background: rgb(0 0 0 / 0.45); backdrop-filter: blur(2px); cursor: default; }
  .palette { position: relative; width: min(620px, calc(100vw - 32px)); display: grid; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); color: var(--ink); box-shadow: 0 30px 80px rgb(0 0 0 / 0.5); overflow: hidden; animation: pop 0.14s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(0.99); } }
  @media (prefers-reduced-motion: reduce) { .palette { animation: none; } }
  .find { display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--muted); }
  .find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
  kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; font: inherit; font-size: 10.5px; font-weight: 700; color: var(--muted); }
  .list { max-height: min(56vh, 460px); overflow: auto; padding: 6px; }
  .group { margin: 8px 10px 4px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .entry { width: 100%; display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 10px; border: 0; border-radius: 9px; background: none; color: var(--ink); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
  .entry[aria-selected="true"] { background: color-mix(in srgb, var(--accent) 16%, var(--field)); }
  .icon { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 7px; background: var(--field); color: var(--muted); }
  .entry[aria-selected="true"] .icon { color: var(--accent); }
  .label { flex: none; max-width: 60%; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .enter { margin-left: auto; }
  .none { margin: 18px 12px; font-size: 13px; color: var(--muted); }
  .foot { margin: 0; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 4px; }
</style>
