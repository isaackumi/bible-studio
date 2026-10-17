<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { songFileName, songToOpenLyrics } from "../../domain/openlyrics";
  import { createZip, readZip } from "../../domain/zip";
  import { cleanFolder, filterSongs, moveSongSection, parseSongFile, removeSongSection, songCredit, songFolders } from "../../domain/song";
  import type { Song, SongSection, SongSectionKind } from "../../domain/types";
  import { buildSongIndex, chooseSung, type SungMatch } from "../../voice/song-detect";
  import Icon from "../Icon.svelte";
  import MonitorPair from "./MonitorPair.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import SearchField from "./SearchField.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";

  // Songs window: library in folders, the song's sections one click from Preview, and detection
  // that follows the room while it sings. Nothing here changes Program; LIVE does.

  type Draft = { id: string; title: string; author: string; folder: string; ccli: string; copyright: string; sections: SongSection[]; isNew: boolean };

  let query = $state("");
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
  /** The "Recent" view: songs put on Preview this session, newest first. */
  const RECENT = "\u0000recent";
  const recent = $derived(
    [...new Set(session.recentSongs.map((entry) => entry.songId))]
      .map((id) => session.songs.find((song) => song.id === id))
      .filter((song): song is Song => !!song),
  );
  const visible = $derived(
    folder === RECENT
      ? recent.filter((song) => filterSongs([song], null, query).length > 0)
      : folder === ""
        ? filterSongs(session.songs.filter((song) => !cleanFolder(song.folder)), null, query)
        : filterSongs(session.songs, folder, query),
  );
  /** Where new songs and imports go: the open folder, or none. */
  const targetFolder = $derived(folder && folder !== RECENT ? folder : "");

  /** First lyric line, or the line that matches the search. */
  function snippet(song: Song): string {
    const needle = query.trim().toLowerCase();
    const lines = song.sections.flatMap((section) => section.lines).map((line) => line.trim()).filter(Boolean);
    return (needle ? lines.find((line) => line.toLowerCase().includes(needle)) : null) ?? lines[0] ?? "";
  }

  function navigate(key: "up" | "down" | "enter") {
    if (visible.length === 0) return;
    const at = visible.findIndex((song) => song.id === selectedId);
    if (key === "enter") {
      const song = at >= 0 ? visible[at]! : visible[0]!;
      pick(song);
      if (song.sections[0]) show(song, song.sections[0].id);
      return;
    }
    const next = at < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, at + (key === "down" ? 1 : -1)));
    pick(visible[next]!);
    requestAnimationFrame(() => document.querySelector(".songs .song.on")?.scrollIntoView({ block: "nearest" }));
  }
  const selected = $derived(session.songs.find((song) => song.id === selectedId) ?? null);
  const onPreview = $derived(session.songFocus);
  const index = $derived(buildSongIndex(session.songs));
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");
  const programSource = $derived(session.live.program.sourceId ?? "");
  const programLive = $derived(session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  const listTitle = $derived(folder === null ? "All songs" : folder === RECENT ? "Recent" : folder === "" ? "Unfiled" : folder);

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
    await session.take();
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
    const nested = folder === null || folder === RECENT;
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
      <button type="button" class="desk-btn" onclick={newSong}><Icon name="plus" size={14} /> New</button>
    {/snippet}
    <SearchField bind:value={query} label="Search songs" placeholder="Title, author or lyrics" onnavigate={navigate} />

    <p class="group">Folders</p>
    <nav class="folders" aria-label="Song folders">
      <button type="button" class="folder" class:on={folder === null} onclick={() => (folder = null)}>
        <Icon name="library" size={16} /><span>All songs</span><small>{session.songs.length}</small>
      </button>
      {#if recent.length > 0}
        <button type="button" class="folder" class:on={folder === RECENT} onclick={() => (folder = RECENT)}>
          <Icon name="reset" size={16} /><span>Recent</span><small>{recent.length}</small>
        </button>
      {/if}
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

    {#if packs.length > 0}
      <div class="packs" aria-label="Song packs">
        <p class="group">Song packs</p>
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
      <div class="imports">
        <button type="button" class="import" title="Lyrics, ChordPro, SongSelect (.usr/.txt) or OpenLyrics (.xml/.zip), into the open folder" onclick={() => fileInput?.click()}>Import files</button>
        <button type="button" class="import" title="Every lyric file in a folder on this computer" onclick={() => dirInput?.click()}>Import folder</button>
        <button type="button" class="import" disabled={visible.length === 0} title={`Save these ${visible.length} songs as OpenLyrics (.zip) — opens in OpenLP, FreeShow and others`} onclick={exportList}>Export</button>
      </div>
      <input bind:this={fileInput} type="file" multiple accept=".txt,.cho,.chordpro,.chopro,.crd,.pro,.md,.usr,.xml,.zip,text/plain" hidden onchange={onFiles} />
      <input bind:this={dirInput} type="file" multiple hidden webkitdirectory onchange={onDirectory} />
    </div>

    <ul class="songs" aria-label="Songs">
      {#if visible.length === 0}
        <li class="empty">{query.trim() ? "No songs match." : session.songs.length ? "This folder is empty." : "No songs yet. Create one or import lyric files."}</li>
      {/if}
      {#each visible as song (song.id)}
        <li>
          <button type="button" class="song" class:on={selectedId === song.id && !draft} onclick={() => pick(song)}>
            <strong>
              {song.title || "Untitled song"}
              {#if programSource.startsWith(`song:${song.id}:`) && programLive}<em class="badge live">Live</em>
              {:else if onPreview?.songId === song.id}<em class="badge">Preview</em>{/if}
            </strong>
            {#if snippet(song)}<span class="first-line">{snippet(song)}</span>{/if}
            <span>{[song.author, `${song.sections.length} section${song.sections.length === 1 ? "" : "s"}`, folder === null ? song.folder : ""].filter(Boolean).join(" · ")}</span>
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
          <div class="edit-section">
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
            <span>{selected.author || "Unknown author"}</span>
            <span>{selected.sections.length} section{selected.sections.length === 1 ? "" : "s"}</span>
            {#if selected.folder}<span class="chip"><Icon name="folder" size={12} />{selected.folder}</span>{/if}
          </p>
          {#if songCredit(selected, session.workspace.ccliLicense)}
            <p class="credit">{songCredit(selected, session.workspace.ccliLicense)}</p>
          {:else}
            <p class="credit none">No copyright details — fine for public-domain hymns and your own songs.</p>
          {/if}
        </div>
        <div class="row-actions">
          <select
            aria-label="Folder"
            value={cleanFolder(selected.folder)}
            onchange={(event) => void session.moveSongToFolder(selected, event.currentTarget.value)}
          >
            <option value="">No folder</option>
            {#each folders as entry (entry.name)}<option value={entry.name}>{entry.name}</option>{/each}
          </select>
          <button type="button" class="desk-btn" onclick={() => void queueSong(selected)}><Icon name="queue" size={14} /> Queue</button>
          <button type="button" class="desk-btn" onclick={() => edit(selected)}><Icon name="pencil" size={14} /> Edit</button>
          <button type="button" class="desk-btn ghost" data-tip="Save as OpenLyrics (.xml)" onclick={() => exportSong(selected)}>Export</button>
          <button
            type="button"
            class="desk-btn ghost icon"
            class:armed={armed === `song:${selected.id}`}
            aria-label={armed === `song:${selected.id}` ? "Confirm delete song" : "Delete song"}
            data-tip={armed === `song:${selected.id}` ? "Click again to delete" : "Delete song"}
            onclick={() => void deleteSelected(selected)}
          ><Icon name="close" size={14} /></button>
        </div>
      </header>
      <p class="hint">Click a section for <b>Preview</b> · double-click sends it <b>LIVE</b> · <kbd>←</kbd> <kbd>→</kbd> step sections</p>
      <div class="sections">
        {#each selected.sections as section, n (section.id)}
          {@const isLive = programLive && programSource === `song:${selected.id}:${section.id}`}
          <button
            type="button"
            class="section {section.kind}"
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
  <aside class="stage">
    <MonitorPair place={session.songPlace()} onstep={(direction) => session.stepSong(direction)} />

    <section class="detect" aria-label="Song detection">
      <header>
        <span class="kicker">{#if listening}<span class="dot listen"></span>{/if}Song detection</span>
        <button type="button" class="desk-btn" class:on={listening} aria-pressed={listening} onclick={() => void session.toggleVoice()}>
          <Icon name={listening ? "mic-off" : "mic"} size={14} />{listening ? "Stop" : "Listen"}
        </button>
      </header>
      <label class="follow">
        <input type="checkbox" checked={follow} onchange={(event) => { if (event.currentTarget.checked && !session.requireFeature("song-detection")) { event.currentTarget.checked = false; return; } follow = event.currentTarget.checked; }} />
        <span>Follow singing <small>Put the section being sung on Preview</small></span>
      </label>
      {#if session.voice.status !== "idle"}<VoiceStatus compact />{/if}
      {#if detected}
        <button type="button" class="match" onclick={showDetected}>
          <small>Heard</small><strong>{detected.label}</strong>
        </button>
      {:else}
        <p class="muted">{listening ? "Listening for a song you have saved…" : "Listen to match singing to your saved songs."}</p>
      {/if}
      {#if heard}<p class="heard-text">“{heard}”</p>{/if}
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
  input, select, textarea {
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    font: inherit;
  }
  input, select { height: 32px; padding: 0 10px; min-width: 0; }
  textarea { padding: 8px 10px; resize: vertical; line-height: 1.45; }

  /* Library */
  .group {
    margin: 0;
    padding: 0 16px 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
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
  .list-head { display: flex; flex-direction: column; gap: 8px; padding: 14px 0 8px; border-top: 1px solid var(--line); flex: none; }
  .list-head .group { padding-bottom: 0; }
  .imports { display: flex; gap: 6px; padding: 0 14px; }
  .import {
    flex: 1;
    height: 30px;
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
  .song strong { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; overflow: hidden; white-space: nowrap; }
  .song span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song .first-line { font-size: 12px; color: color-mix(in srgb, var(--ink) 70%, var(--muted)); font-style: italic; }
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
  .song-head select { width: auto; max-width: 180px; }
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
  .section.chorus { border-left-color: var(--accent); }
  .section.bridge { border-left-color: #8b6cff; }
  .section.tag { border-left-color: #2fb8a6; }
  .section:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .section.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .section.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
  .section.heard { outline: 2px dashed color-mix(in srgb, var(--presence, #3fb950) 80%, transparent); outline-offset: 2px; }
  .section .label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .section .label i { font-style: normal; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: var(--panel); color: var(--ink); letter-spacing: 0; }
  .section .tags { margin-left: auto; display: flex; gap: 4px; }
  .section .line { font-size: 14px; line-height: 1.4; }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; }

  /* Editor */
  .editor { display: flex; flex-direction: column; gap: 10px; }
  .fields { display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 8px; }
  .fields .wide { grid-column: span 2; }
  .credit { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
  .credit.none { font-style: italic; opacity: 0.8; }
  .paste { display: flex; flex-direction: column; gap: 8px; }
  .paste summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .paste textarea { width: 100%; margin: 8px 0; }
  .edit-section { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); }
  .edit-section-head { display: flex; gap: 4px; }
  .edit-section-head input { flex: 1; }

  /* Stage */
  .stage { padding: 12px; gap: 12px; overflow: auto; }
  .detect > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .dot.listen { width: 7px; height: 7px; border-radius: 50%; background: var(--presence, #3fb950); box-shadow: 0 0 6px var(--presence, #3fb950); }
  .detect { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); }
  .follow { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .follow input { height: auto; margin-top: 3px; }
  .follow small { display: block; color: var(--muted); font-size: 11px; }
  .match { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--presence, #3fb950); border-radius: var(--radius-control, 8px); background: var(--panel); color: var(--ink); text-align: left; font: inherit; }
  .match small { font-size: 11px; color: var(--presence, #3fb950); text-transform: uppercase; letter-spacing: 0.08em; }
  .heard-text { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }

  @media (max-width: 1280px) {
    .song-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
    .fields { grid-template-columns: 1fr 1fr; }
  }
</style>
