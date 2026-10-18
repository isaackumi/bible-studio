<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { songFileName, songToOpenLyrics } from "../../domain/openlyrics";
  import { createZip, readZip } from "../../domain/zip";
  import { cleanFolder, filterSongs, moveSongSection, parseSongFile, removeSongSection, sectionShort, sectionTone, songCredit, songFolders } from "../../domain/song";
  import type { Song, SongSection, SongSectionKind } from "../../domain/types";
  import { buildSongIndex, chooseSung, type SungMatch } from "../../voice/song-detect";
  import Icon from "../Icon.svelte";
  import FavoriteStar from "../FavoriteStar.svelte";
  import { favoritesFirst } from "../../domain/favorites";
  import MonitorPair from "./MonitorPair.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import SongFinder from "./SongFinder.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import ToolMenu from "../ToolMenu.svelte";

  // Songs window: library in folders, the song's sections one click from Preview, and detection
  // that follows the room while it sings. Nothing here changes Program; LIVE does.

  type Draft = { id: string; title: string; author: string; folder: string; ccli: string; copyright: string; sections: SongSection[]; isNew: boolean };

  /** The song search window. */
  let finding = $state(false);
  /** null: All songs. "": Unfiled. Otherwise a folder name. */
  let folder = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let draft = $state<Draft | null>(null);
  let pasteText = $state("");
  let note = $state("");
  let newFolder = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let armed = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let fileInput = $state<HTMLInputElement | null>(null);
  let dirInput = $state<HTMLInputElement | null>(null);
  /** Song packs show only when asked for, from the Import menu. */
  let showPacks = $state(false);

  // Detection
  let follow = $state(false);
  let heard = $state("");
  let detected = $state<SungMatch | null>(null);

  const folders = $derived(songFolders(session.songs, session.workspace.songFolders));
  const packs = $derived(session.songPacks.filter((pack) => !session.workspace.installedPacks.includes(pack.id)));
  let installing = $state<string | null>(null);

  $effect(() => {
    void session.loadSongPacks();
  });

  async function install(pack: (typeof packs)[number]) {
    if (!session.requireFeature("song-packs")) return;
    installing = pack.id;
    const ok = await session.installSongPack(pack);
    installing = null;
    note = session.message;
    if (ok) folder = pack.folder;
  }
  const unfiled = $derived(session.songs.filter((song) => !cleanFolder(song.folder)).length);
  /** Ready-made lists (favorites, recently used, most sung, in this service) are "\u0000list:<id>". */
  const LIST = "\u0000list:";
  const lists = $derived(session.songLists);
  /** Favorites and Recently used always show; the others once they have songs. */
  const shownLists = $derived(lists.filter((list) => list.id !== "all" && (list.id === "favorites" || list.id === "recent" || list.songs.length > 0)));
  const openList = $derived(folder?.startsWith(LIST) ? lists.find((list) => `${LIST}${list.id}` === folder) ?? null : null);
  const visible = $derived(
    openList
      ? openList.id === "recent" || openList.id === "most" || openList.id === "service"
        ? openList.songs
        : favoritesFirst(openList.songs, (song) => session.isFavorite("songs", song.id))
      : favoritesFirst(
          folder === "" ? session.songs.filter((song) => !cleanFolder(song.folder)) : filterSongs(session.songs, folder, ""),
          (song) => session.isFavorite("songs", song.id),
        ),
  );
  /** Where new songs and imports go: the open folder, or none. */
  const targetFolder = $derived(folder && !folder.startsWith(LIST) ? folder : "");

  /** First lyric line. */
  function snippet(song: Song): string {
    return song.sections.flatMap((section) => section.lines).map((line) => line.trim()).find(Boolean) ?? "";
  }

  // While Songs is open, the desk's Find key ("/") opens the song search.
  $effect(() => {
    const open = () => (finding = true);
    session.localSearch = open;
    return () => {
      if (session.localSearch === open) session.localSearch = null;
    };
  });
  const selected = $derived(session.songs.find((song) => song.id === selectedId) ?? null);
  const onPreview = $derived(session.songFocus);
  const index = $derived(buildSongIndex(session.songs));
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");
  const programSource = $derived(session.live.program.sourceId ?? "");
  const programLive = $derived(session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  /** Live mode: a part goes straight to the screen when chosen (click, chips, arrows, follow singing). */
  const CLICK_KEY = "church-studio:songs-click-live";
  let clickLive = $state(readClickLive());
  function readClickLive(): boolean {
    try {
      return localStorage.getItem(CLICK_KEY) === "1";
    } catch {
      return false;
    }
  }
  function setClickLive(on: boolean) {
    clickLive = on;
    try {
      localStorage.setItem(CLICK_KEY, on ? "1" : "0");
    } catch {
      // Private windows can refuse storage; the choice lasts for this session.
    }
  }
  // In Live mode the screen follows Preview: whatever part lands there (by click, chip, arrow key
  // or follow singing) is sent at once. The first look after opening the page never sends.
  /** undefined until the page has looked once, so opening Songs never sends anything. */
  let lastPreview: string | null | undefined = undefined;
  /** Set for a Preview that must stay on Preview (opening a song from search). */
  let previewOnly = false;
  $effect(() => {
    const now = onPreview ? `${onPreview.songId}:${onPreview.sectionId}` : null;
    const was = lastPreview;
    lastPreview = now;
    const quiet = previewOnly;
    previewOnly = false;
    // Never while editing: the editor's Preview button is for checking, not for the room.
    if (quiet || draft || !clickLive || !now || was === undefined || now === was) return;
    if (programSource === `song:${now}`) return;
    void session.take();
  });

  const listTitle = $derived(folder === null ? "All songs" : openList ? openList.label : folder === "" ? "Unfiled" : folder);

  // Messages fade after a few seconds so they never crowd the song.
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!note) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ""), 6000);
    return () => clearTimeout(noteTimer);
  });

  // Follow the song on Preview (picked here, from the queue or by voice).
  $effect(() => {
    const focus = session.songFocus;
    if (focus && !draft) selectedId = focus.songId;
  });

  $effect(() => {
    return session.onVoiceHeard((text, _final, alternatives) => {
      if (!text) return;
      heard = text;
      const match = chooseSung(alternatives.length ? alternatives : [text], index, session.songFocus?.songId ?? null);
      if (!match) return;
      detected = match;
      if (!follow) return;
      const focus = session.songFocus;
      if (focus?.songId === match.songId && focus.sectionId === match.sectionId) return;
      const song = session.songs.find((entry) => entry.id === match.songId);
      if (!song) return;
      session.previewSongSection(song, match.sectionId);
      session.voice.message = `${match.label} on Preview. LIVE still sends Program.`;
    });
  });

  function arm(key: string): boolean {
    clearTimeout(armTimer);
    if (armed === key) {
      armed = null;
      return true;
    }
    armed = key;
    armTimer = setTimeout(() => (armed = null), 3000);
    return false;
  }

  function pick(song: Song) {
    draft = null;
    selectedId = song.id;
  }

  function show(song: Song, sectionId: string) {
    session.previewSongSection(song, sectionId);
  }

  async function showAndTake(song: Song, sectionId: string) {
    session.previewSongSection(song, sectionId);
    if (!clickLive) await session.take();
  }

  function showDetected() {
    const match = detected;
    const song = match ? session.songs.find((entry) => entry.id === match.songId) : null;
    if (match && song) show(song, match.sectionId);
  }

  async function queueSong(song: Song) {
    const first = song.sections[0];
    if (!first) return;
    if (!session.service) await session.createService("Sunday Service");
    if (!session.service?.sections.length) session.addSection("Songs");
    session.addLyric(song.id, first.id, song.title);
    note = `${song.title} added to the queue.`;
  }

  // Folders

  function startFolder() {
    newFolder = "";
  }

  function commitFolder() {
    const name = newFolder === null ? null : session.createSongFolder(newFolder);
    newFolder = null;
    if (name) folder = name;
  }

  async function commitRename(from: string, to: string) {
    renaming = null;
    const name = await session.renameSongFolder(from, to);
    if (name) folder = name;
  }

  async function removeFolder(name: string) {
    if (!arm(`folder:${name}`)) return;
    await session.deleteSongFolder(name);
    folder = null;
  }

  // Import

  const LYRIC_FILE = /\.(txt|cho|chordpro|chopro|crd|pro|md|usr|xml)$/i;

  /** Lyric files from a pick: plain files as they are, and the lyric files inside any .zip. */
  async function readLyricFiles(list: File[]): Promise<{ files: { name: string; text: string; dir: string }[]; zipName: string | null }> {
    const files: { name: string; text: string; dir: string }[] = [];
    let zipName: string | null = null;
    const decoder = new TextDecoder();
    for (const file of list) {
      if (/\.zip$/i.test(file.name)) {
        zipName ??= file.name.replace(/\.zip$/i, "");
        try {
          for (const entry of await readZip(new Uint8Array(await file.arrayBuffer()))) {
            const parts = entry.name.split("/").filter(Boolean);
            const name = parts.pop() ?? entry.name;
            // A song in a sub-folder of the zip (Hymns/…) goes to that library folder.
            const dir = parts.length && !parts[0]!.startsWith("__") ? parts[parts.length - 1]! : "";
            if (LYRIC_FILE.test(name) && !name.startsWith(".") && entry.data.length <= 512 * 1024) files.push({ name, text: decoder.decode(entry.data), dir });
          }
        } catch (error) {
          note = error instanceof Error ? `${file.name}: ${error.message}` : `${file.name} could not be opened.`;
        }
      } else if ((LYRIC_FILE.test(file.name) || file.type === "text/plain") && file.size <= 512 * 1024) {
        files.push({ name: file.name, text: await file.text(), dir: "" });
      }
    }
    return { files, zipName };
  }

  async function importFiles(list: FileList | null, into: string) {
    const { files, zipName } = await readLyricFiles([...(list ?? [])]);
    if (files.length === 0) {
      note ||= "No lyric files found. Use .txt, ChordPro, SongSelect (.usr) or OpenLyrics (.xml / .zip) files.";
      return;
    }
    // The open folder wins; otherwise a zip's own sub-folders, then the zip's name (a "Songs" export has none).
    const fallback = zipName && !/^(songs|all songs|recent|unfiled)$/i.test(zipName) ? zipName : "";
    const groups = new Map<string, { name: string; text: string }[]>();
    for (const file of files) {
      const target = into || file.dir || fallback;
      groups.set(target, [...(groups.get(target) ?? []), { name: file.name, text: file.text }]);
    }
    let added = 0;
    const skipped: string[] = [];
    for (const [target, group] of groups) {
      const result = await session.importSongFiles(group, target);
      added += result.added;
      skipped.push(...result.skipped);
    }
    const only = groups.size === 1 ? [...groups.keys()][0]! : "";
    note = `${added} song${added === 1 ? "" : "s"} imported${only ? ` to ${only}` : groups.size > 1 ? ` into ${groups.size} folders` : ""}.${skipped.length ? ` ${skipped.length} file${skipped.length === 1 ? "" : "s"} had no lyrics.` : ""}`;
    if (added && only) folder = only;
  }

  // Export: OpenLyrics, one .xml per song; several songs go out as one .zip.

  function save(name: string, data: BlobPart, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSong(song: Song) {
    save(songFileName(song), songToOpenLyrics(song), "application/xml");
    note = `${song.title} exported as OpenLyrics.`;
  }

  function exportList() {
    if (visible.length === 0) return;
    const encoder = new TextEncoder();
    const used = new Set<string>();
    // Exporting more than one folder keeps each song in a sub-folder named after its library folder.
    const nested = folder === null || !!openList;
    const safe = (text: string) => text.replace(/[^\w\s-]+/g, "").replace(/\s+/g, " ").trim();
    const entries = visible.map((song) => {
      const dir = nested && cleanFolder(song.folder) ? `${safe(cleanFolder(song.folder))}/` : "";
      let name = `${dir}${songFileName(song)}`;
      for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${dir}${songFileName({ title: `${song.title} ${n}` })}`;
      used.add(name.toLowerCase());
      return { name, data: encoder.encode(songToOpenLyrics(song)) };
    });
    const zip = createZip(entries);
    save(`${nested ? "Songs" : safe(listTitle) || "Songs"}.zip`, zip.slice().buffer, "application/zip");
    note = `${entries.length} song${entries.length === 1 ? "" : "s"} exported as OpenLyrics (.zip).`;
  }

  async function onFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await importFiles(input.files, targetFolder);
    input.value = "";
  }

  async function onDirectory(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const first = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
    const dirName = first?.webkitRelativePath?.split("/")[0] ?? "Imported";
    await importFiles(input.files, targetFolder || dirName);
    input.value = "";
  }

  // Editing

  function newSong() {
    draft = {
      id: crypto.randomUUID(),
      title: "",
      author: "",
      folder: targetFolder,
      ccli: "",
      copyright: "",
      sections: [{ id: crypto.randomUUID(), kind: "verse", label: "Verse 1", lines: [""] }],
      isNew: true,
    };
    pasteText = "";
  }

  function edit(song: Song) {
    draft = {
      id: song.id,
      title: song.title,
      author: song.author,
      folder: cleanFolder(song.folder),
      ccli: song.ccli ?? "",
      copyright: song.copyright ?? "",
      sections: song.sections.map((section) => ({ ...section, lines: [...section.lines] })),
      isNew: false,
    };
    pasteText = "";
  }

  function asSong(value: Draft): Song {
    return { id: value.id, title: value.title, author: value.author, folder: value.folder, ccli: value.ccli, copyright: value.copyright, sections: value.sections };
  }

  function applyPaste() {
    if (!draft) return;
    const parsed = parseSongFile("pasted.txt", pasteText);
    if (parsed.sections.length === 0) {
      note = "No lyrics found. Paste lines of a song, with a blank line between sections.";
      return;
    }
    draft.sections = parsed.sections;
    if (!draft.title.trim() && parsed.title) draft.title = parsed.title;
    if (!draft.author.trim() && parsed.author) draft.author = parsed.author;
    if (!draft.ccli.trim() && parsed.ccli) draft.ccli = parsed.ccli;
    if (!draft.copyright.trim() && parsed.copyright) draft.copyright = parsed.copyright;
    pasteText = "";
    note = `${parsed.sections.length} section${parsed.sections.length === 1 ? "" : "s"} ready. Check the labels, then Save.`;
  }

  function addSection(kind: SongSectionKind) {
    if (!draft) return;
    const count = draft.sections.filter((section) => section.kind === kind).length + 1;
    const label = kind === "verse" ? `Verse ${count}` : kind === "chorus" ? "Chorus" : kind === "bridge" ? "Bridge" : "Tag";
    draft.sections = [...draft.sections, { id: crypto.randomUUID(), kind, label, lines: [""] }];
  }

  async function saveDraft() {
    if (!draft) return;
    const song = asSong({ ...draft, sections: draft.sections.map((section) => ({ ...section, lines: section.lines.filter((line, i, all) => line.trim() || i < all.length - 1) })) });
    if (!(await session.saveSong(song))) {
      note = session.message;
      return;
    }
    if (cleanFolder(song.folder)) session.createSongFolder(song.folder ?? "");
    note = `${song.title.trim()} saved.`;
    selectedId = song.id;
    draft = null;
  }

  async function deleteSelected(song: Song) {
    if (!arm(`song:${song.id}`)) return;
    await session.deleteSong(song.id);
    selectedId = null;
    note = `${song.title} deleted.`;
  }
</script>

<section class="song-desk">
  <!-- Library -->
  <LibrarySidebar title="Songs" icon="note" count={session.songs.length} storageKey="songs">
    {#snippet actions()}
      <ToolMenu label="Import songs" tip="Add songs from files" className="desk-btn" align="left">
        {#snippet trigger()}<Icon name="download" size={14} /> Import{/snippet}
        {#snippet children(close)}
          <button type="button" role="menuitem" onclick={() => { fileInput?.click(); close(); }}><Icon name="files" size={16} /> Lyric files…</button>
          <p class="menu-note">Plain text, ChordPro, SongSelect, or OpenLyrics (.xml, .zip) from OpenLP, FreeShow and others.</p>
          <button type="button" role="menuitem" onclick={() => { dirInput?.click(); close(); }}><Icon name="folder" size={16} /> A whole folder…</button>
          {#if packs.length > 0}
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" onclick={() => { showPacks = true; close(); }}><Icon name="library" size={16} /> Song packs ({packs.length})</button>
          {/if}
        {/snippet}
      </ToolMenu>
      <button type="button" class="desk-btn primary-soft" onclick={newSong}><Icon name="plus" size={14} /> New song</button>
    {/snippet}
    <button type="button" class="find-song" onclick={() => (finding = true)}>
      <Icon name="search" size={15} /><span>Find a song</span><kbd>/</kbd>
    </button>

    <nav class="folders" aria-label="Song lists and folders">
      <button type="button" class="folder" class:on={folder === null} onclick={() => (folder = null)}>
        <Icon name="library" size={16} /><span>All songs</span><small>{session.songs.length}</small>
      </button>
      {#each shownLists as list (list.id)}
        <button type="button" class="folder" class:on={folder === `${LIST}${list.id}`} onclick={() => (folder = `${LIST}${list.id}`)}>
          <Icon name={list.icon} size={16} /><span>{list.label}</span><small>{list.songs.length}</small>
        </button>
      {/each}
      <p class="group sub-group">Folders</p>
      {#if unfiled > 0 && folders.length > 0}
        <button type="button" class="folder" class:on={folder === ""} onclick={() => (folder = "")}>
          <Icon name="folder" size={16} /><span>Unfiled</span><small>{unfiled}</small>
        </button>
      {/if}
      {#each folders as entry (entry.name)}
        {#if renaming === entry.name}
          <input
            class="folder-input"
            aria-label={`Rename ${entry.name}`}
            value={entry.name}
            onkeydown={(event) => {
              if (event.key === "Enter") void commitRename(entry.name, event.currentTarget.value);
              if (event.key === "Escape") renaming = null;
            }}
            onblur={(event) => void commitRename(entry.name, event.currentTarget.value)}
          />
        {:else}
          <div class="folder-row" class:on={folder === entry.name}>
            <button type="button" class="folder" class:on={folder === entry.name} onclick={() => (folder = entry.name)} ondblclick={() => (renaming = entry.name)}>
              <Icon name={folder === entry.name ? "folder-open" : "folder"} size={16} /><span>{entry.name}</span><small>{entry.count}</small>
            </button>
            {#if folder === entry.name}
              <button type="button" class="row-tool" aria-label={`Rename ${entry.name}`} title="Rename" onclick={() => (renaming = entry.name)}><Icon name="pencil" size={14} /></button>
              <button
                type="button"
                class="row-tool"
                class:armed={armed === `folder:${entry.name}`}
                aria-label={armed === `folder:${entry.name}` ? `Confirm remove ${entry.name}` : `Remove folder ${entry.name}`}
                title={armed === `folder:${entry.name}` ? "Click again — songs stay, unfiled" : "Remove folder"}
                onclick={() => void removeFolder(entry.name)}
              ><Icon name="close" size={14} /></button>
            {/if}
          </div>
        {/if}
      {/each}
      {#if newFolder !== null}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="folder-input"
          aria-label="New folder name"
          placeholder="Folder name"
          autofocus
          bind:value={newFolder}
          onkeydown={(event) => {
            if (event.key === "Enter") commitFolder();
            if (event.key === "Escape") newFolder = null;
          }}
          onblur={commitFolder}
        />
      {:else}
        <button type="button" class="folder add" onclick={startFolder}><Icon name="plus" size={16} /><span>New folder</span></button>
      {/if}
    </nav>

    {#if showPacks && packs.length > 0}
      <div class="packs" aria-label="Song packs">
        <p class="group">Song packs <button type="button" class="packs-close" aria-label="Hide song packs" onclick={() => (showPacks = false)}><Icon name="close" size={12} /></button></p>
        {#each packs as pack (pack.id)}
          <div class="pack">
            <div>
              <strong>{pack.name}</strong>
              {#if pack.description}<span>{pack.description}</span>{/if}
              {#if pack.license}<small>{pack.license}</small>{/if}
            </div>
            <button type="button" class="import" disabled={installing !== null} onclick={() => void install(pack)}>{installing === pack.id ? "Adding…" : "Add"}</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="list-head">
      <p class="group">{listTitle} <span>{visible.length}</span></p>
      <button type="button" class="export-list" disabled={visible.length === 0} data-tip={`Save these ${visible.length} songs as one OpenLyrics file (.zip), for backup or another computer`} onclick={exportList}>
        <Icon name="files" size={13} /> Save these
      </button>
      <input bind:this={fileInput} type="file" multiple accept=".txt,.cho,.chordpro,.chopro,.crd,.pro,.md,.usr,.xml,.zip,text/plain" hidden onchange={onFiles} />
      <input bind:this={dirInput} type="file" multiple hidden webkitdirectory onchange={onDirectory} />
    </div>

    <ul class="songs" aria-label="Songs">
      {#if visible.length === 0}
        <li class="empty">{openList ? openList.empty : session.songs.length ? "This folder is empty." : "No songs yet. Press New song to type or paste one, or Import to bring in files."}</li>
      {/if}
      {#each visible as song (song.id)}
        <li class="song-item">
          <span class="song-star"><FavoriteStar on={session.isFavorite("songs", song.id)} label={song.title || "this song"} onclick={() => session.toggleFavorite("songs", song.id)} /></span>
          <button type="button" class="song" class:on={selectedId === song.id && !draft} onclick={() => pick(song)}>
            <strong>
              {song.title || "Untitled song"}
              {#if programSource.startsWith(`song:${song.id}:`) && programLive}<em class="badge live">Live</em>
              {:else if onPreview?.songId === song.id}<em class="badge">Preview</em>{/if}
            </strong>
            <span class="sub">{snippet(song) || song.author}<em>{song.sections.length}</em></span>
          </button>
        </li>
      {/each}
    </ul>
  </LibrarySidebar>

  <!-- Song -->
  <div class="sheet">
    {#if note}
      <p class="note" role="status"><span>{note}</span><button type="button" aria-label="Dismiss" onclick={() => (note = "")}><Icon name="close" size={14} /></button></p>
    {/if}
    {#if draft}
      <form class="editor" onsubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <div class="editor-head">
          <h2>{draft.isNew ? "New song" : "Edit song"}</h2>
          <div class="row-actions">
            <button type="button" class="desk-btn" onclick={() => draft && session.previewSongSection(asSong(draft), draft.sections[0]?.id ?? null)}>Preview</button>
            <button type="button" class="desk-btn ghost" onclick={() => (draft = null)}>Cancel</button>
            <button type="submit" class="desk-btn primary">Save</button>
          </div>
        </div>
        <div class="fields">
          <input aria-label="Song title" placeholder="Title" bind:value={draft.title} />
          <input aria-label="Song author" placeholder="Author" bind:value={draft.author} />
          <input aria-label="Song folder" placeholder="Folder (optional)" list="song-folder-names" bind:value={draft.folder} />
          <input aria-label="CCLI song number" placeholder="CCLI song # (optional)" inputmode="numeric" bind:value={draft.ccli} />
          <input class="wide" aria-label="Copyright" placeholder="Copyright, e.g. 2015 Publisher (blank for public domain)" bind:value={draft.copyright} />
          <datalist id="song-folder-names">
            {#each folders as entry (entry.name)}<option value={entry.name}></option>{/each}
          </datalist>
        </div>
        <details class="paste" open={draft.isNew}>
          <summary>Paste the whole song</summary>
          <textarea
            aria-label="Paste lyrics"
            rows="6"
            placeholder="Blank lines split sections. “Verse 1”, “[Chorus]”, “Bridge:” name them. ChordPro and SongSelect lyrics (with their CCLI footer) work too."
            bind:value={pasteText}
          ></textarea>
          <button type="button" class="desk-btn" disabled={!pasteText.trim()} onclick={applyPaste}>Split into sections</button>
        </details>
        {#each draft.sections as section, i (section.id)}
          <div class="edit-section" style:--tone="var(--sec-{sectionTone(section)})">
            <div class="edit-section-head">
              <input aria-label="Section label" bind:value={section.label} />
              <button type="button" class="desk-btn ghost icon" aria-label={`Move ${section.label} up`} disabled={i === 0} onclick={() => draft && (draft.sections = moveSongSection(asSong(draft), section.id, -1).sections)}><Icon name="chevron-up" size={14} /></button>
              <button type="button" class="desk-btn ghost icon" aria-label={`Move ${section.label} down`} disabled={i === draft.sections.length - 1} onclick={() => draft && (draft.sections = moveSongSection(asSong(draft), section.id, 1).sections)}><Icon name="chevron-down" size={14} /></button>
              <button type="button" class="desk-btn ghost icon" aria-label={`Remove ${section.label}`} onclick={() => draft && (draft.sections = removeSongSection(asSong(draft), section.id).sections)}><Icon name="close" size={14} /></button>
            </div>
            <textarea
              aria-label="{section.label} lines"
              rows={Math.max(3, section.lines.length)}
              placeholder="One lyric line per row"
              value={section.lines.join("\n")}
              oninput={(event) => (section.lines = event.currentTarget.value.split("\n"))}
            ></textarea>
          </div>
        {/each}
        <div class="row-actions">
          <span class="muted">Add</span>
          <button type="button" class="desk-btn" onclick={() => addSection("verse")}>Verse</button>
          <button type="button" class="desk-btn" onclick={() => addSection("chorus")}>Chorus</button>
          <button type="button" class="desk-btn" onclick={() => addSection("bridge")}>Bridge</button>
          <button type="button" class="desk-btn" onclick={() => addSection("tag")}>Tag</button>
        </div>
      </form>
    {:else if selected}
      <header class="song-head">
        <div>
          <h2>{selected.title}</h2>
          <p class="meta">
            {#if selected.author}<span>{selected.author}</span>{/if}
            <span>{selected.sections.length} part{selected.sections.length === 1 ? "" : "s"}</span>
            {#if selected.folder}<span class="chip"><Icon name="folder" size={12} />{selected.folder}</span>{/if}
            {#if songCredit(selected, session.workspace.ccliLicense)}<span class="credit">{songCredit(selected, session.workspace.ccliLicense)}</span>{/if}
          </p>
        </div>
        <div class="row-actions">
          <button type="button" class="desk-btn primary-soft" data-tip="Put the first part on Preview" onclick={() => selected.sections[0] && show(selected, selected.sections[0].id)}><Icon name="play" size={14} /> Start</button>
          <button type="button" class="desk-btn" data-tip="Add to the queue for this service" onclick={() => void queueSong(selected)}><Icon name="queue" size={14} /> Add to service</button>
          <button type="button" class="desk-btn" onclick={() => edit(selected)}><Icon name="pencil" size={14} /> Edit</button>
          <ToolMenu label="More for this song" tip="Folder, save as a file, delete">
            {#snippet trigger()}<Icon name="more" size={16} />{/snippet}
            {#snippet children(close)}
              <p class="menu-label">Folder</p>
              <button type="button" role="menuitemcheckbox" aria-checked={!cleanFolder(selected.folder)} onclick={() => { void session.moveSongToFolder(selected, ""); close(); }}><Icon name="folder" size={16} /> No folder</button>
              {#each folders as entry (entry.name)}
                <button type="button" role="menuitemcheckbox" aria-checked={cleanFolder(selected.folder) === entry.name} onclick={() => { void session.moveSongToFolder(selected, entry.name); close(); }}><Icon name="folder" size={16} /> {entry.name}</button>
              {/each}
              <div class="menu-sep"></div>
              <button type="button" role="menuitem" onclick={() => { exportSong(selected); close(); }}><Icon name="files" size={16} /> Save as OpenLyrics file</button>
              <div class="menu-sep"></div>
              <button type="button" role="menuitem" class="danger-item" onclick={() => void deleteSelected(selected)}>
                <Icon name="close" size={16} /> {armed === `song:${selected.id}` ? "Click again to delete" : "Delete song"}
              </button>
            {/snippet}
          </ToolMenu>
        </div>
      </header>
      <div class="song-bar">
      <nav class="song-map" aria-label="Song map">
        {#each selected.sections as section (section.id)}
          <button
            type="button"
            style:--tone="var(--sec-{sectionTone(section)})"
            class:on={onPreview?.songId === selected.id && onPreview.sectionId === section.id}
            class:live={programLive && programSource === `song:${selected.id}:${section.id}`}
            title={section.label}
            aria-label={section.label}
            onclick={() => show(selected, section.id)}
            ondblclick={() => void showAndTake(selected, section.id)}
          >{sectionShort(section)}</button>
        {/each}
      </nav>
      <div class="click-mode" role="radiogroup" aria-label="When you click a part">
        <span>Click</span>
        <button type="button" role="radio" aria-checked={!clickLive} class:on={!clickLive} data-tip="Click puts a part on Preview; double-click or LIVE shows it" onclick={() => setClickLive(false)}>Preview</button>
        <button type="button" role="radio" aria-checked={clickLive} class:on={clickLive} class:live-on={clickLive} data-tip="Click shows a part on the screen at once; arrows too" onclick={() => setClickLive(true)}>Live</button>
      </div>
      </div>
      <p class="hint">
        {#if clickLive}<b>Live:</b> a part you click, or reach with <kbd>←</kbd> <kbd>→</kbd>, shows on the screen at once.
        {:else}<b>Click</b> a part for Preview, <b>double-click</b> to show it. <kbd>←</kbd> <kbd>→</kbd> move between parts.{/if}
      </p>
      <div class="sections">
        {#each selected.sections as section, n (section.id)}
          {@const isLive = programLive && programSource === `song:${selected.id}:${section.id}`}
          <button
            type="button"
            class="section"
            style:--tone="var(--sec-{sectionTone(section)})"
            class:live={isLive}
            class:on={onPreview?.songId === selected.id && onPreview.sectionId === section.id}
            class:heard={detected?.songId === selected.id && detected.sectionId === section.id}
            onclick={() => show(selected, section.id)}
            ondblclick={() => void showAndTake(selected, section.id)}
          >
            <span class="label">
              <i>{n + 1}</i>{section.label}
              <span class="tags">
                {#if detected?.songId === selected.id && detected.sectionId === section.id}<em class="badge heard">Heard</em>{/if}
                {#if isLive}<em class="badge live">Live</em>{/if}
                {#if onPreview?.songId === selected.id && onPreview.sectionId === section.id}<em class="badge">Preview</em>{/if}
              </span>
            </span>
            {#each section.lines.filter((line) => line.trim()) as line, l (l)}<span class="line">{line}</span>{/each}
          </button>
        {/each}
      </div>
    {:else}
      <div class="blank">
        <Icon name="note" size={28} />
        <p>Pick a song from the library, or create one.</p>
        <button type="button" class="desk-btn" onclick={newSong}><Icon name="plus" size={14} /> New song</button>
      </div>
    {/if}
  </div>

  <!-- Monitors and detection -->
  {#if finding}
    <SongFinder {clickLive} onclose={() => (finding = false)} onopen={(id) => { draft = null; selectedId = id; }} />
  {/if}

  <aside class="stage">
    <MonitorPair page="songs" place={session.songPlace()} onstep={(direction) => session.stepSong(direction)} />

    <section class="listen-card" class:on={listening} aria-label="Listen for songs">
      <header>
        <span class="lc-title"><Icon name="mic" size={15} /> Listen for songs</span>
        <span class="lc-state" class:on={listening}>{session.voice.status === "starting" ? "Starting…" : listening ? "Listening" : "Off"}</span>
      </header>
      {#if !listening}
        <p class="lc-lede">Church Studio listens to the singing and finds the song and part in your library. Nothing reaches the screen unless you choose.</p>
        <button type="button" class="desk-btn primary-soft lc-start" onclick={() => void session.toggleVoice()}><Icon name="mic" size={15} /> Start listening</button>
      {:else}
        <div class="lc-level" aria-hidden="true">
          {#each Array.from({ length: 18 }) as _, bar (bar)}<i class:lit={bar < Math.round(session.voice.level * 18)}></i>{/each}
        </div>
        <p class="lc-heard">{heard ? `“${heard}”` : "Sing or say a line from a song…"}</p>
        {#if detected}
          {@const song = session.songs.find((entry) => entry.id === detected?.songId)}
          {@const part = song?.sections.find((section) => section.id === detected?.sectionId)}
          {#if song && part}
            <div class="lc-match" style:--tone="var(--sec-{sectionTone(part)})">
              <small>Sounds like</small>
              <strong>{song.title}</strong>
              <span class="lc-part"><b>{sectionShort(part)}</b>{part.label}</span>
              <div class="lc-actions">
                <button type="button" class="desk-btn" onclick={() => { selectedId = song.id; }}>Open</button>
                <button type="button" class="desk-btn {clickLive ? 'live' : 'primary-soft'}" onclick={showDetected}>{clickLive ? "Show it" : "Preview"}</button>
              </div>
            </div>
          {/if}
        {/if}
        <button type="button" class="desk-btn ghost lc-stop" onclick={() => void session.toggleVoice()}><Icon name="mic-off" size={14} /> Stop listening</button>
      {/if}
      <label class="lc-follow">
        <input type="checkbox" class="switch" role="switch" checked={follow} onchange={(event) => { if (event.currentTarget.checked && !session.requireFeature("song-detection")) { event.currentTarget.checked = false; return; } follow = event.currentTarget.checked; }} />
        <span>
          Follow the singing
          <small>{follow && clickLive ? "Each part heard goes straight to the screen (Live mode)." : "Each part heard goes to Preview by itself."}</small>
        </span>
      </label>
      {#if session.voice.status !== "idle" && session.voice.error}<VoiceStatus compact />{/if}
    </section>
  </aside>
</section>

<style>
  .song-desk {
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
  h2 { margin: 0; font-size: 16px; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  input, textarea {
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    font: inherit;
  }
  input { height: 32px; padding: 0 10px; min-width: 0; }
  textarea { padding: 8px 10px; resize: vertical; line-height: 1.45; }

  /* Library */
  .group {
    margin: 0;
    padding: 0 16px 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--muted);
  }
  .group span { margin-left: 4px; font-weight: 600; opacity: 0.8; }
  .folders { display: flex; flex-direction: column; gap: 4px; padding: 0 10px 14px; max-height: 42%; overflow: auto; flex: none; }
  /* Rows keep their height; the list scrolls instead of squeezing them. */
  .folders > :global(*), .songs > li { flex: none; }
  .folder-row { display: flex; align-items: center; gap: 2px; border-radius: var(--radius-control, 8px); }
  .folder-row.on { background: color-mix(in srgb, var(--accent) 16%, var(--panel)); }
  .folder {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-control, 8px);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .folder-row .folder { flex: 1; }
  .folder span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder small {
    min-width: 22px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--field);
    color: var(--muted);
    font-size: 11px;
    text-align: center;
  }
  .folder:hover { background: var(--field); }
  .folder.on, .folder-row.on .folder:hover { background: none; }
  .folder.on :global(svg) { color: var(--accent); }
  .folder.on small { background: color-mix(in srgb, var(--accent) 30%, var(--panel)); color: var(--ink); }
  .folder.add { color: var(--muted); border: 1px dashed var(--line); margin-top: 4px; }
  .folder.add:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .folder-input { margin: 2px 0; height: 36px; }
  .row-tool {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
  }
  .row-tool:hover { background: var(--field); color: var(--ink); }
  .folder-row .row-tool:last-child { margin-right: 4px; }
  .armed { color: var(--live) !important; background: color-mix(in srgb, var(--live) 15%, transparent) !important; }
  .packs { display: flex; flex-direction: column; gap: 6px; padding: 12px 12px 12px 10px; border-top: 1px solid var(--line); flex: none; }
  .packs .group { padding: 0 6px 2px; }
  .pack { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px dashed var(--line); border-radius: var(--radius-control, 8px); }
  .pack > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .pack strong { font-size: 13px; }
  .pack span, .pack small { font-size: 11px; color: var(--muted); }
  .pack .import { flex: none; padding: 0 12px; }
  .list-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 10px 8px 0; border-top: 1px solid var(--line); flex: none; }
  .list-head .group { padding-bottom: 0; }
  .export-list { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .export-list:hover:not(:disabled) { color: var(--ink); background: var(--field); }
  .export-list:disabled { opacity: 0.4; cursor: default; }
  .packs-close { margin-left: 6px; padding: 2px; border: 0; background: none; color: var(--muted); cursor: pointer; vertical-align: middle; }
  :global(.menu .danger-item) { color: var(--live) !important; }
  .import {
    flex: 1 1 auto;
    height: 30px;
    padding: 0 8px;
    white-space: nowrap;
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }
  .import:hover:not(:disabled) { color: var(--ink); background: var(--field); }
  .import:disabled { opacity: 0.4; }
  .songs { list-style: none; margin: 0; padding: 4px 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .song {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-control, 8px);
    background: none;
    color: var(--ink);
    text-align: left;
    font: inherit;
  }
  .song-item { position: relative; }
  .song-item .song { padding-right: 32px; }
  .song-star { position: absolute; top: 6px; right: 6px; z-index: 1; opacity: 0; transition: opacity 120ms; }
  .song-item:hover .song-star, .song-star:focus-within, .song-star:has(:global(.fav-star.on)) { opacity: 1; }
  .song strong { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; overflow: hidden; white-space: nowrap; }
  .song span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song .sub { display: flex; gap: 8px; font-size: 12px; }
  .song .sub em { margin-left: auto; flex: none; font-style: normal; font-size: 11px; opacity: 0.8; }
  .song:hover { background: var(--field); }
  .song.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .empty { padding: 12px 6px; color: var(--muted); font-size: 12px; }
  .badge {
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .badge.live { background: color-mix(in srgb, var(--live) 22%, transparent); color: var(--live); }
  .badge.heard { background: color-mix(in srgb, var(--presence, #3fb950) 22%, transparent); color: var(--presence, #3fb950); }

  /* Song sheet */
  .sheet { overflow: auto; padding: 14px 16px 18px; gap: 10px; }
  .note { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 8px 8px 12px; border-radius: var(--radius-control, 8px); background: var(--field); font-size: 12px; color: var(--muted); }
  .note span { flex: 1; }
  .note button { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .note button:hover { color: var(--ink); background: var(--panel); }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; background: var(--field); }
  .song-head, .editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .song-head h2 { font-size: 20px; }
  .row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .hint b { color: var(--ink); font-weight: 600; }
  kbd { padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; font: inherit; font-size: 11px; }
  .sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .section {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px 14px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--muted);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    text-align: left;
    font: inherit;
    min-height: 96px;
  }
  .section { border-left-color: var(--tone, var(--muted)); }
  .song-bar { position: sticky; top: -14px; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 -16px; padding: 10px 16px; background: color-mix(in srgb, var(--panel) 94%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
  .song-map { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
  .click-mode { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); flex: none; }
  .click-mode > span { padding: 0 6px 0 8px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .click-mode button { height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .click-mode button.on { background: var(--accent); color: var(--on-accent); }
  .click-mode button.live-on { background: var(--live); color: #fff; }
  .song-map button {
    min-width: 34px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, var(--tone) 45%, var(--line));
    border-radius: 6px;
    background: color-mix(in srgb, var(--tone) 18%, var(--field));
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .song-map button:hover { background: color-mix(in srgb, var(--tone) 30%, var(--field)); }
  .song-map button.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .song-map button.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
  .section:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .section.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .section.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
  .section.heard { outline: 2px dashed color-mix(in srgb, var(--presence, #3fb950) 80%, transparent); outline-offset: 2px; }
  .section .label { font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .section .label i { font-style: normal; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: color-mix(in srgb, var(--tone, var(--muted)) 26%, var(--panel)); color: var(--ink); letter-spacing: 0; }
  .section .tags { margin-left: auto; display: flex; gap: 4px; }
  .section .line { font-size: 14px; line-height: 1.4; }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; }

  /* Editor */
  .editor { display: flex; flex-direction: column; gap: 10px; }
  .fields { display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 8px; }
  .fields .wide { grid-column: span 2; }
  .credit { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
  .paste { display: flex; flex-direction: column; gap: 8px; }
  .paste summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .paste textarea { width: 100%; margin: 8px 0; }
  .edit-section { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--line); border-left: 4px solid var(--tone, var(--line)); border-radius: var(--radius-control, 8px); }
  .edit-section-head { display: flex; gap: 4px; }
  .edit-section-head input { flex: 1; }

  /* Stage */
  .stage { padding: 12px; gap: 12px; overflow: auto; }

  /* Listening */
  .listen-card { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .listen-card.on { border-color: color-mix(in srgb, var(--presence, #3fb950) 55%, var(--line)); }
  .listen-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .lc-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  .lc-state { padding: 2px 8px; border-radius: 999px; background: var(--panel); color: var(--muted); font-size: 11px; font-weight: 700; }
  .lc-state.on { background: color-mix(in srgb, var(--presence, #3fb950) 20%, transparent); color: var(--presence, #3fb950); }
  .lc-lede { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
  .lc-start { justify-content: center; height: 38px; }
  .lc-level { display: flex; align-items: flex-end; gap: 3px; height: 22px; }
  .lc-level i { flex: 1; height: 100%; border-radius: 2px; background: var(--line); }
  .lc-level i.lit { background: var(--presence, #3fb950); }
  .lc-heard { margin: 0; min-height: 2.8em; font-size: 13px; line-height: 1.4; color: var(--muted); font-style: italic; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .lc-match { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-left: 4px solid var(--tone); border-radius: 10px; background: var(--panel); }
  .lc-match small { font-size: 11px; font-weight: 650; color: var(--presence, #3fb950); }
  .lc-match strong { font-size: 14px; }
  .lc-part { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .lc-part b { padding: 1px 6px; border-radius: 5px; background: color-mix(in srgb, var(--tone) 26%, var(--field)); color: var(--ink); font-size: 11px; }
  .lc-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px; }
  .lc-stop { align-self: flex-start; }
  .lc-follow { display: flex; align-items: flex-start; gap: 10px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 13px; font-weight: 600; cursor: pointer; }
  .lc-follow small { display: block; margin-top: 2px; font-size: 11px; font-weight: 500; color: var(--muted); }
  .lc-follow input { flex: none; margin-top: 2px; }

  /* Find a song */
  .find-song { display: flex; align-items: center; gap: 8px; height: 36px; margin: 0 14px 10px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; flex: none; }
  .find-song:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 28%, var(--line)); }
  .find-song span { flex: 1; text-align: left; }
  .find-song kbd { padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; }
  .sub-group { margin: 8px 0 2px; padding: 0 4px; }
  @media (max-width: 1280px) {
    .song-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
    .fields { grid-template-columns: 1fr 1fr; }
  }
</style>
