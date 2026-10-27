<script lang="ts">
  import { session } from "../app/session.svelte";
  import { formatReference, parseReference } from "../bible/reference";
  import type { BibleItem, PewPage } from "../domain/types";
  import Icon from "./Icon.svelte";
  import { msg, t, tn } from "../i18n/core";
  import { keys } from "../platform/os";
  import { audienceRoom } from "../app/rooms.svelte";
  import { pictures } from "../app/pictures.svelte";
  import { defaultShortcuts, shortcutLabel } from "../keyboard/manager";
  import { SETTINGS_GROUPS } from "./settings/sections";
  import { findPlaces } from "../tour/where";

  // Go to anything (⌘K / Ctrl+K), from any page: an action (LIVE, Clear, Listen, Captions…), a
  // page, a part or item of the service, a song, a verse ("John 3:16" goes on Preview), any
  // Settings page by what it is about, or help. What was chosen lately comes first when the box
  // is empty, and the row of kinds under the box narrows the list to one kind.
  let query = $state("");
  let active = $state(0);
  let kind = $state<string | null>(null);
  let input = $state<HTMLInputElement | undefined>();
  let list = $state<HTMLDivElement | undefined>();

  type Entry = { id: string; group: string; label: string; detail?: string; icon: string; run: () => unknown; words?: string; keys?: string };

  const RECENT_KEY = "cs-palette-recent";
  const RECENT_MAX = 6;
  let recentIds = $state<string[]>(readRecent());
  function readRecent(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }
  function remember(id: string) {
    recentIds = [id, ...recentIds.filter((entry) => entry !== id)].slice(0, RECENT_MAX);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
    } catch {
      // Storage blocked: nothing remembered between opens.
    }
  }

  /** The kinds in the row under the box, in order; a search spans them all until one is chosen. */
  const KINDS: Array<{ id: string; label: string }> = [
    { id: "Actions", label: msg("Actions") },
    { id: "Pages", label: msg("Pages") },
    { id: "Audience", label: msg("Audience") },
    { id: "Design", label: msg("Design") },
    { id: "Media", label: msg("Media") },
    { id: "Settings", label: msg("Settings") },
    { id: "Help", label: msg("Help") },
    { id: "Where", label: msg("Where is") },
  ];

  const go = (page: PewPage) => () => {
    if (session.workspace.appearance.desk !== "pewbeam") session.setAppearance({ desk: "pewbeam" });
    session.pageRequest = page;
  };
  const keyOf = (action: "take" | "black" | "clear") => shortcutLabel(session.workspace.shortcuts ?? defaultShortcuts, action);
  const say = (message: string | null | undefined) => {
    if (message) session.notify(message);
  };

  /** Fixed entries: actions, pages, design, media, audience, settings and help. */
  const fixed = $derived.by((): Entry[] => {
    const listening = session.voice.status === "listening" || session.voice.status === "starting";
    const production = session.workspace.appearance.desk === "obs";
    const entries: Entry[] = [
      { id: "a-live", group: "Actions", label: msg("Go LIVE"), detail: msg("Send Preview to the screen"), icon: "play", run: () => session.take(), words: "take show send program", keys: keyOf("take") },
      { id: "a-clear", group: "Actions", label: msg("Clear the screen"), detail: msg("Back to the theme"), icon: "close", run: () => session.clear(), words: "clear empty", keys: keyOf("clear") },
      { id: "a-black", group: "Actions", label: msg("Black screen"), icon: "moon", run: () => session.black(), words: "black dark blackout", keys: keyOf("black") },
      { id: "a-logo", group: "Actions", label: msg("Show the logo"), icon: "logo", run: () => session.logo(), words: "logo church name" },
      { id: "a-audience", group: "Actions", label: msg("Open the audience screen"), detail: msg("The projector or TV"), icon: "cast", run: () => session.openAudience(), words: "projector output window tv display" },
      listening
        ? { id: "a-listen", group: "Actions", label: msg("Stop listening"), icon: "mic-off", run: () => session.stopVoice(), words: "listen voice microphone stop mute" }
        : { id: "a-listen", group: "Actions", label: msg("Listen"), detail: msg("Hear verses and voice commands"), icon: "mic", run: () => session.toggleVoice(), words: "listen voice microphone detect verse speech start" },
      session.captionsOn
        ? { id: "a-captions", group: "Actions", label: msg("Turn captions off"), icon: "captions", run: () => session.setCaptions(false), words: "captions subtitles off" }
        : { id: "a-captions", group: "Actions", label: msg("Turn captions on"), detail: msg("Live captions on the screen and on phones"), icon: "captions", run: () => session.setCaptions(true), words: "captions subtitles live words deaf translate on" },
      { id: "a-stage", group: "Actions", label: msg("Stage display"), detail: msg("The confidence screen for the platform"), icon: "stage", run: () => (session.stageOpen = true), words: "stage confidence monitor platform next" },
      production
        ? { id: "a-desk", group: "Actions", label: msg("Switch to the Presenter Desk"), icon: "pew", run: () => session.setAppearance({ desk: "pewbeam" }), words: "desk presenter simple switch" }
        : { id: "a-desk", group: "Actions", label: msg("Switch to the Production Desk"), detail: msg("Scenes, cameras and video"), icon: "obs", run: () => { if (session.requireFeature("production")) session.setAppearance({ desk: "obs" }); }, words: "desk production scenes cameras switch obs" },
      { id: "a-backup", group: "Actions", label: msg("Back up now"), detail: session.workspace.backup.folder ? msg("To the backup folder") : msg("Choose a backup folder first"), icon: "files", run: async () => say((await session.backupNow()) ?? t("Backed up.")), words: "backup save copy export" },
      { id: "a-update", group: "Actions", label: msg("Check for updates"), icon: "refresh", run: async () => say(await session.checkForUpdate()), words: "update version new release upgrade" },
    ];
    if (session.service) {
      entries.push(
        session.serviceRunning
          ? { id: "a-end", group: "Actions", label: msg("End service"), detail: session.service.name, icon: "square", run: () => session.endService(), words: "stop finish" }
          : { id: "a-start", group: "Actions", label: msg("Start service"), detail: session.service.name, icon: "play", run: () => session.startService(), words: "begin run" },
      );
    }
    entries.push(
      { id: "p-scriptures", group: "Pages", label: msg("Scriptures"), icon: "bible", run: go("scriptures"), words: "bible verses presenter" },
      { id: "p-songs", group: "Pages", label: msg("Songs"), icon: "lyrics", run: go("songs"), words: "lyrics hymns worship" },
      { id: "p-sermon", group: "Pages", label: msg("Sermon"), icon: "book", run: go("sermon"), words: "notes preaching outline" },
      { id: "p-service", group: "Pages", label: msg("Service"), icon: "list", run: go("service"), words: "running order plan sunday" },
      // The congregation's phones.
      { id: "aud-qa", group: "Audience", label: msg("Live Q&A"), detail: msg("People ask and vote from their phones"), icon: "users", run: () => audienceRoom.showTab("questions"), words: "q&a questions ask audience congregation phone qr room moderate vote" },
      { id: "aud-prayer", group: "Audience", label: msg("Prayer requests"), detail: msg("Sent from phones, seen only on this desk"), icon: "users", run: () => audienceRoom.showTab("prayer"), words: "prayer requests pray private anonymous audience phone room" },
      { id: "aud-games", group: "Audience", label: msg("Quizzes and polls"), detail: msg("Played and answered on people's phones"), icon: "sparkles", run: () => audienceRoom.showTab("games"), words: "quiz quizzes game games bible trivia kahoot play youth children leaderboard poll vote voting survey word cloud rating" },
      { id: "aud-pick", group: "Audience", label: msg("Pick someone"), detail: msg("A name at random, or random groups"), icon: "users", run: () => audienceRoom.showTab("pick"), words: "pick random choose winner volunteer draw groups teams spin wheel" },
      { id: "aud-join", group: "Audience", label: msg("Show the join code"), detail: msg("The QR code on the screen"), icon: "qr", run: () => audienceRoom.show(), words: "join qr code room phones scan" },
      // The design studio: slides, templates, lower thirds, gradients, icons and pictures.
      { id: "d-studio", group: "Design", label: msg("Design studio"), detail: msg("Slides, gradients, shapes, icons and pictures"), icon: "stage", run: () => session.openStudio(), words: "design studio slides editor deck page graphics gradient shape icon picture image svg logo rotate group" },
      { id: "d-template", group: "Design", label: msg("New page from a template"), detail: msg("Welcome, event, verse, sermon, giving"), icon: "plus", run: () => session.openStudio(undefined, "templates"), words: "template templates layout welcome event announcement notices verse scripture sermon series giving prayer design" },
      { id: "d-lower", group: "Design", label: msg("Lower thirds"), detail: msg("Name bars that go over a camera"), icon: "captions", run: () => session.openStudio(undefined, "templates"), words: "lower third thirds name bar caption speaker overlay camera" },
      // Pictures from a folder, and slideshows.
      { id: "pic-folder", group: "Media", label: msg("Pictures from a folder"), detail: msg("Show pictures straight from any folder"), icon: "media", run: () => pictures.show(), words: "pictures photos images folder album jpg png gif bmp browse" },
      { id: "pic-slideshow", group: "Media", label: msg("Slideshow"), detail: msg("A folder of pictures on the screen, one after another"), icon: "media", run: () => pictures.show(), words: "slideshow slide show photos loop walk-in announcements auto advance" },
      { id: "m-music", group: "Media", label: msg("Music and sound pad"), detail: msg("Background music and sounds"), icon: "audio", run: () => session.openAudio(), words: "music audio sound pad play track playlist background" },
    );
    for (const group of SETTINGS_GROUPS) {
      for (const entry of group.items) entries.push({ id: `s-${entry.id}`, group: "Settings", label: entry.title, detail: entry.about, icon: entry.icon, run: () => session.openSettings(entry.id), words: `settings ${entry.keywords} ${t(group.label)}` });
    }
    entries.push(
      { id: "h-tours", group: "Help", label: msg("Guided tours"), detail: msg("A short walk through each part of the desk"), icon: "help", run: () => (session.tourHubOpen = true), words: "tour tours guide help learn show me around walkthrough" },
      { id: "h-keys", group: "Help", label: msg("Keyboard shortcuts"), detail: msg("Every key, and change any of them"), icon: "keys", run: () => session.openSettings("keyboard"), words: "keyboard shortcuts keys hotkeys" },
      { id: "h-new", group: "Help", label: msg("What's new"), detail: msg("What changed in this version"), icon: "sparkles", run: () => session.showWhatsNew(), words: "new changes release notes version changelog updates" },
      { id: "h-support", group: "Help", label: msg("Support file"), detail: msg("What support needs when something goes wrong"), icon: "speed", run: () => session.openSettings("health"), words: "support help problem report diagnostics log bug slow freeze" },
      { id: "setup-again", group: "Help", label: msg("Run setup again"), detail: msg("Church name, look, scripture and voice, from the start"), icon: "church", run: () => session.restartOnboarding(), words: "setup onboarding welcome first run start again wizard church name" },
    );
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
    return { id: `v-${reference}`, group: "Scripture", label: t("Show {reference} on Preview", { reference }), icon: "bible", run: () => session.previewPassage(passage) };
  });

  const words = (text: string) => text.toLowerCase();
  /** How well an entry matches: 0 no match, higher is better (start of a word beats inside one). */
  function score(entry: Entry, q: string): number {
    if (!q) return 1;
    const label = words(t(entry.label));
    const hay = `${label} ${words(entry.detail ? t(entry.detail) : "")} ${words(entry.words ?? "")} ${words(t(entry.group))}`;
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
      if (kind && entry.group !== kind) return;
      const rank = score(entry, q);
      if (rank) found.push({ ...entry, rank: rank + bonus });
    };
    if (verse && !kind) found.push({ ...verse, rank: 10 });
    // The service: its parts and items, when there is a query.
    const service = session.service;
    if (service && q && !kind) {
      for (const section of service.sections) {
        add({ id: `sec-${section.id}`, group: "Service", label: section.name, detail: t("Part of {service}", { service: service.name }), icon: "list", run: () => { const first = section.items[0]; go("service")(); if (first) void session.selectItem(first.id); } });
        for (const item of section.items) add({ id: `item-${item.id}`, group: "Service", label: item.title, detail: section.name, icon: item.kind === "bible" ? "bible" : item.kind === "lyric" ? "lyrics" : "files", run: () => { go("service")(); void session.selectItem(item.id); } });
      }
    }
    if (q) {
      for (const deck of session.decks) add({ id: `deck-${deck.id}`, group: "Design", label: t("Edit slides: {name}", { name: deck.name }), detail: tn(deck.pages.length, "{n} page", "{n} pages"), icon: "stage", run: () => session.openStudio(deck.id) });
      if (!kind) for (const song of session.songs) add({ id: `song-${song.id}`, group: "Songs", label: song.title || t("Untitled song"), detail: song.author || undefined, icon: "lyrics", run: () => { go("songs")(); session.previewSongSection(song, song.sections[0]?.id ?? null); } });
    }
    // "Where is…?": the parts of the screen the question names, pointed at on their page.
    if (q && (!kind || kind === "Where")) {
      findPlaces(q, 4).forEach((place, at) => {
        found.push({ id: `where-${place.tour}-${place.at}`, group: "Where", label: t("Show me: {title}", { title: t(place.step.title) }), detail: t(place.step.body), icon: "help", run: () => session.showWhere(place.tour, place.at), rank: 3 - at * 0.1 });
      });
    }
    // Empty box: what was chosen lately first, then the rest.
    if (!q && !kind) {
      for (const id of recentIds) {
        const entry = fixed.find((candidate) => candidate.id === id);
        if (entry) found.push({ ...entry, group: "Recent", rank: 20 });
      }
    }
    for (const entry of fixed) add(entry, entry.group === "Actions" ? 0.5 : 0);
    // Best first, at most a handful from each group so one big library does not crowd the rest.
    found.sort((a, b) => b.rank - a.rank);
    // Then together by group, the group with the best match first.
    const groups = new Map<string, Entry[]>();
    const most = kind ? 60 : q ? 6 : 8;
    for (const entry of found) {
      const members = groups.get(entry.group) ?? [];
      if (members.length < most) members.push(entry);
      groups.set(entry.group, members);
    }
    return [...groups.values()].flat().slice(0, kind ? 80 : 36);
  });

  $effect(() => {
    void results;
    active = 0;
  });

  // Opened from the key or a button: start empty, with the cursor in the field.
  $effect(() => {
    if (!session.commandOpen) return;
    query = session.commandSeed;
    session.commandSeed = "";
    kind = null;
    recentIds = readRecent();
    requestAnimationFrame(() => input?.focus());
  });
  const close = () => (session.commandOpen = false);
  async function choose(entry: Entry | undefined) {
    if (!entry) return;
    if (fixed.some((candidate) => candidate.id === entry.id)) remember(entry.id);
    close();
    await entry.run();
  }
  function pickKind(next: string | null) {
    kind = kind === next ? null : next;
    input?.focus();
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
      if (kind) kind = null;
      else close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
      requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Tab" && !event.shiftKey && !event.altKey) {
      // Tab steps through the kinds; Shift+Tab goes back.
      event.preventDefault();
      event.stopPropagation();
      const at = KINDS.findIndex((entry) => entry.id === kind);
      kind = at + 1 >= KINDS.length ? null : KINDS[at + 1]!.id;
    } else if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const at = KINDS.findIndex((entry) => entry.id === kind);
      kind = at === -1 ? KINDS[KINDS.length - 1]!.id : at === 0 ? null : KINDS[at - 1]!.id;
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void choose(results[active]);
    }
  }

  const GROUP_LABELS: Record<string, string> = { Recent: msg("Recent"), Actions: msg("Actions"), Pages: msg("Pages"), Audience: msg("Audience"), Design: msg("Design"), Media: msg("Media"), Settings: msg("Settings"), Help: msg("Help"), Where: msg("Where is"), Scripture: msg("Scripture"), Service: msg("Service"), Songs: msg("Songs") };
  const groupLabel = (group: string) => t(GROUP_LABELS[group] ?? group);
</script>

<svelte:window onkeydowncapture={onKey} />

{#if session.commandOpen}
  <div class="layer">
    <button type="button" class="backdrop" aria-label={t("Close")} tabindex="-1" onclick={close}></button>
    <div class="palette" role="dialog" aria-modal="true" aria-label={t("Go to anything")}>
      <label class="find focus-box">
        <Icon name="search" size={16} />
        <input bind:this={input} bind:value={query} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[active] ? `palette-${results[active]!.id}` : undefined} placeholder={kind ? t("Search {kind}…", { kind: groupLabel(kind) }) : t("Go to a page, song, verse, setting or action…")} />
        <kbd>esc</kbd>
      </label>
      <div class="kinds" role="tablist" aria-label={t("Kind")}>
        <button type="button" role="tab" aria-selected={kind === null} class:on={kind === null} onclick={() => pickKind(null)}>{t("All")}</button>
        {#each KINDS as entry (entry.id)}
          <button type="button" role="tab" aria-selected={kind === entry.id} class:on={kind === entry.id} onclick={() => pickKind(entry.id)}>{t(entry.label)}</button>
        {/each}
      </div>
      <div class="list" id="palette-list" role="listbox" bind:this={list}>
        {#each results as entry, index (`${entry.group}:${entry.id}`)}
          {#if index === 0 || results[index - 1]!.group !== entry.group}<p class="group">{groupLabel(entry.group)}</p>{/if}
          <button type="button" id="palette-{entry.id}" role="option" class="entry" aria-selected={index === active} onmouseenter={() => (active = index)} onclick={() => void choose(entry)}>
            <span class="icon"><Icon name={entry.icon} size={14} /></span>
            <span class="label">{t(entry.label)}</span>
            {#if entry.detail}<span class="detail">{t(entry.detail)}</span>{/if}
            {#if entry.keys}<kbd class="keys">{keys(entry.keys)}</kbd>{/if}
            {#if index === active}<kbd class="enter">↵</kbd>{/if}
          </button>
        {:else}
          <p class="none">{t("Nothing found. Try a song title, a part of the service, a setting, or a verse like John 3:16.")}</p>
        {/each}
      </div>
      <p class="foot"><kbd>↑</kbd><kbd>↓</kbd> {t("to move")} · <kbd>↵</kbd> {t("to open")} · <kbd>tab</kbd> {t("next kind")} · <kbd>{keys("⌘K")}</kbd> {t("any time")}</p>
    </div>
  </div>
{/if}

<style>
  .layer { position: fixed; inset: 0; z-index: 1200; display: grid; justify-items: center; align-items: start; padding-top: 10vh; }
  .backdrop { position: absolute; inset: 0; border: 0; background: rgb(0 0 0 / 0.45); backdrop-filter: blur(2px); cursor: default; }
  .palette { position: relative; width: min(680px, calc(100vw - 32px)); display: grid; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); color: var(--ink); box-shadow: 0 30px 80px rgb(0 0 0 / 0.5); overflow: hidden; animation: pop 0.14s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(0.99); } }
  @media (prefers-reduced-motion: reduce) { .palette { animation: none; } }
  .find { display: flex; align-items: center; gap: 10px; height: 56px; padding: 0 16px; color: var(--muted); }
  .find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
  /* Keyboard users see where they are. */
  .find:focus-within { box-shadow: inset 0 -2px 0 var(--accent); color: var(--ink); }
  kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; font: inherit; font-size: 10.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .kinds { display: flex; gap: 4px; padding: 0 12px 10px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .kinds button { flex: none; height: 26px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .kinds button:hover { color: var(--ink); background: var(--field); }
  .kinds button.on { border-color: transparent; background: var(--ink); color: var(--panel); }
  .list { max-height: min(58vh, 500px); overflow: auto; padding: 6px; }
  .group { margin: 8px 10px 4px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .entry { width: 100%; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 10px; border: 0; border-radius: 9px; background: none; color: var(--ink); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
  .entry[aria-selected="true"] { background: color-mix(in srgb, var(--accent) 16%, var(--field)); }
  .icon { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 7px; background: var(--field); color: var(--muted); }
  .entry[aria-selected="true"] .icon { color: var(--accent-text); }
  .label { flex: none; max-width: 52%; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .keys { margin-left: auto; }
  .enter { margin-left: 6px; }
  .keys + .enter { margin-left: 6px; }
  .entry .enter:only-of-type { margin-left: auto; }
  .none { margin: 18px 12px; font-size: 13px; color: var(--muted); }
  .foot { margin: 0; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
</style>
