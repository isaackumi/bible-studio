<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { cleanFolder, filterSongs, moveSongSection, parseLyrics, removeSongSection, songFolders } from "../../domain/song";
  import type { Song, SongSection, SongSectionKind } from "../../domain/types";
  import { buildSongIndex, chooseSung, type SungMatch } from "../../voice/song-detect";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";

  // Songs window: library in folders, the song's sections one click from Preview, and detection
  // that follows the room while it sings. Nothing here changes Program; LIVE does.

  type Draft = { id: string; title: string; author: string; folder: string; sections: SongSection[]; isNew: boolean };

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
  const unfiled = $derived(session.songs.filter((song) => !cleanFolder(song.folder)).length);
  const visible = $derived(
    folder === "" ? filterSongs(session.songs.filter((song) => !cleanFolder(song.folder)), null, query) : filterSongs(session.songs, folder, query),
  );
  const selected = $derived(session.songs.find((song) => song.id === selectedId) ?? null);
  const onPreview = $derived(session.songFocus);
  const index = $derived(buildSongIndex(session.songs));
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");

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

  async function importFiles(list: FileList | null, into: string) {
    const files = [...(list ?? [])].filter((file) => /\.(txt|cho|chordpro|chopro|crd|pro|md)$/i.test(file.name) || file.type === "text/plain");
    if (files.length === 0) {
      note = "No lyric files found. Use .txt or ChordPro files.";
      return;
    }
    const read = await Promise.all(files.filter((file) => file.size <= 512 * 1024).map(async (file) => ({ name: file.name, text: await file.text() })));
    const result = await session.importSongFiles(read, into);
    note = session.message;
    if (result.added && into) folder = into;
  }

  async function onFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await importFiles(input.files, folder ?? "");
    input.value = "";
  }

  async function onDirectory(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const first = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
    const dirName = first?.webkitRelativePath?.split("/")[0] ?? "Imported";
    await importFiles(input.files, folder || dirName);
    input.value = "";
  }

  // Editing

  function newSong() {
    draft = {
      id: crypto.randomUUID(),
      title: "",
      author: "",
      folder: folder ?? "",
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
      sections: song.sections.map((section) => ({ ...section, lines: [...section.lines] })),
      isNew: false,
    };
    pasteText = "";
  }

  function asSong(value: Draft): Song {
    return { id: value.id, title: value.title, author: value.author, folder: value.folder, sections: value.sections };
  }

  function applyPaste() {
    if (!draft) return;
    const parsed = parseLyrics(pasteText);
    if (parsed.sections.length === 0) {
      note = "No lyrics found. Paste lines of a song, with a blank line between sections.";
      return;
    }
    draft.sections = parsed.sections;
    if (!draft.title.trim() && parsed.title) draft.title = parsed.title;
    if (!draft.author.trim() && parsed.author) draft.author = parsed.author;
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
  <aside class="library" aria-label="Song library">
    <div class="lib-head">
      <h2>Songs</h2>
      <button type="button" class="desk-btn" onclick={newSong}><Icon name="plus" size={14} /> New song</button>
    </div>
    <input class="search" type="search" placeholder="Search title, author or lyrics" aria-label="Search songs" bind:value={query} />

    <nav class="folders" aria-label="Song folders">
      <button type="button" class="folder" class:on={folder === null} onclick={() => (folder = null)}>
        <Icon name="library" size={16} /><span>All songs</span><small>{session.songs.length}</small>
      </button>
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
          <div class="folder-row">
            <button type="button" class="folder" class:on={folder === entry.name} onclick={() => (folder = entry.name)} ondblclick={() => (renaming = entry.name)}>
              <Icon name={folder === entry.name ? "folder-open" : "folder"} size={16} /><span>{entry.name}</span><small>{entry.count}</small>
            </button>
            {#if folder === entry.name}
              <button type="button" class="desk-btn ghost icon mini" aria-label={`Rename ${entry.name}`} data-tip="Rename" onclick={() => (renaming = entry.name)}><Icon name="pencil" size={14} /></button>
              <button
                type="button"
                class="desk-btn ghost icon mini"
                class:armed={armed === `folder:${entry.name}`}
                aria-label={armed === `folder:${entry.name}` ? `Confirm remove ${entry.name}` : `Remove folder ${entry.name}`}
                data-tip={armed === `folder:${entry.name}` ? "Click again — songs stay, unfiled" : "Remove folder"}
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

    <div class="imports">
      <button type="button" class="desk-btn" data-tip="Lyric or ChordPro files, into the open folder" onclick={() => fileInput?.click()}>Import files</button>
      <button type="button" class="desk-btn" data-tip="Every lyric file in a folder on this computer" onclick={() => dirInput?.click()}>Import folder</button>
      <input bind:this={fileInput} type="file" multiple accept=".txt,.cho,.chordpro,.chopro,.crd,.pro,.md,text/plain" hidden onchange={onFiles} />
      <input bind:this={dirInput} type="file" multiple hidden webkitdirectory onchange={onDirectory} />
    </div>

    <ul class="songs" aria-label="Songs">
      {#if visible.length === 0}
        <li class="empty">{query.trim() ? "No songs match." : session.songs.length ? "This folder is empty." : "No songs yet. Create one or import lyric files."}</li>
      {/if}
      {#each visible as song (song.id)}
        <li>
          <button type="button" class="song" class:on={selectedId === song.id && !draft} class:live={onPreview?.songId === song.id} onclick={() => pick(song)}>
            <strong>{song.title || "Untitled song"}</strong>
            <span>{song.author || "—"} · {song.sections.length} section{song.sections.length === 1 ? "" : "s"}{folder === null && song.folder ? ` · ${song.folder}` : ""}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <!-- Song -->
  <div class="sheet">
    {#if note}<p class="note" role="status">{note}</p>{/if}
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
          <datalist id="song-folder-names">
            {#each folders as entry (entry.name)}<option value={entry.name}></option>{/each}
          </datalist>
        </div>
        <details class="paste" open={draft.isNew}>
          <summary>Paste the whole song</summary>
          <textarea
            aria-label="Paste lyrics"
            rows="6"
            placeholder="Blank lines split sections. “Verse 1”, “[Chorus]”, “Bridge:” name them. ChordPro works too."
            bind:value={pasteText}
          ></textarea>
          <button type="button" class="desk-btn" disabled={!pasteText.trim()} onclick={applyPaste}>Split into sections</button>
        </details>
        {#each draft.sections as section, i (section.id)}
          <div class="edit-section">
            <div class="edit-section-head">
              <input aria-label="Section label" bind:value={section.label} />
              <button type="button" class="desk-btn ghost icon" aria-label={`Move ${section.label} up`} disabled={i === 0} onclick={() => draft && (draft.sections = moveSongSection(asSong(draft), section.id, -1).sections)}><Icon name="chevron-left" size={14} /></button>
              <button type="button" class="desk-btn ghost icon" aria-label={`Move ${section.label} down`} disabled={i === draft.sections.length - 1} onclick={() => draft && (draft.sections = moveSongSection(asSong(draft), section.id, 1).sections)}><Icon name="chevron-right" size={14} /></button>
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
          <p class="muted">{selected.author || "Unknown author"}</p>
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
      <p class="hint">Click a section for Preview. Double-click sends it LIVE. Arrow keys step sections.</p>
      <div class="sections">
        {#each selected.sections as section (section.id)}
          <button
            type="button"
            class="section {section.kind}"
            class:on={onPreview?.songId === selected.id && onPreview.sectionId === section.id}
            class:heard={detected?.songId === selected.id && detected.sectionId === section.id}
            onclick={() => show(selected, section.id)}
            ondblclick={() => void showAndTake(selected, section.id)}
          >
            <span class="label">{section.label}{#if detected?.songId === selected.id && detected.sectionId === section.id}<em>heard</em>{/if}</span>
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
    <header>
      <span class="kicker">Preview{session.songPlace() ? ` · ${session.songPlace()}` : ""}</span>
      <span class="steps">
        <button type="button" class="desk-btn ghost icon" aria-label="Previous section" onclick={() => session.stepSong(-1)}><Icon name="chevron-left" size={14} /></button>
        <button type="button" class="desk-btn ghost icon" aria-label="Next section" onclick={() => session.stepSong(1)}><Icon name="chevron-right" size={14} /></button>
      </span>
    </header>
    <div class="monitor"><Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} /></div>
    <header><span class="kicker program">Program</span></header>
    <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>

    <section class="detect" aria-label="Song detection">
      <header>
        <span class="kicker">Song detection</span>
        <button type="button" class="desk-btn" class:on={listening} aria-pressed={listening} onclick={() => void session.toggleVoice()}>
          <Icon name={listening ? "mic-off" : "mic"} size={14} />{listening ? "Stop" : "Listen"}
        </button>
      </header>
      <label class="follow">
        <input type="checkbox" bind:checked={follow} />
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
      {#if heard}<p class="heard">“{heard}”</p>{/if}
    </section>
  </aside>
</section>

<style>
  .song-desk {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(280px, 380px);
    gap: var(--gap, 10px);
    padding: var(--gap, 10px) var(--panel-pad, 12px) var(--panel-pad, 12px);
  }
  .library, .sheet, .stage {
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
  .lib-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; }
  .search { margin: 0 12px 8px; }
  .folders { display: flex; flex-direction: column; gap: 2px; padding: 0 8px 8px; border-bottom: 1px solid var(--line); max-height: 40%; overflow: auto; flex: none; }
  .folder-row { display: flex; align-items: center; gap: 2px; }
  .folder {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-control, 8px);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .folder span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder small { color: var(--muted); font-size: 11px; }
  .folder:hover { background: var(--field); }
  .folder.on { background: color-mix(in srgb, var(--accent) 18%, var(--panel)); color: var(--ink); }
  .folder.on :global(svg) { color: var(--accent); }
  .folder.add { color: var(--muted); }
  .folder-input { margin: 2px 0; }
  .mini { width: 26px; min-width: 26px; height: 26px; min-height: 26px; }
  .armed { color: var(--live) !important; border-color: var(--live) !important; }
  .imports { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); flex: none; }
  .imports .desk-btn { flex: 1; }
  .songs { list-style: none; margin: 0; padding: 6px 8px 12px; overflow: auto; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
  .song {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--radius-control, 8px);
    background: none;
    color: var(--ink);
    text-align: left;
    font: inherit;
  }
  .song strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song:hover { background: var(--field); }
  .song.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
  .song.live strong::before { content: "● "; color: var(--accent); }
  .empty { padding: 12px 6px; color: var(--muted); font-size: 12px; }

  /* Song sheet */
  .sheet { overflow: auto; padding: 14px 16px 18px; gap: 10px; }
  .note { margin: 0; padding: 8px 10px; border-radius: var(--radius-control, 8px); background: var(--field); font-size: 12px; color: var(--muted); }
  .song-head, .editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .song-head h2 { font-size: 20px; }
  .row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .song-head select { width: auto; max-width: 180px; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
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
  .section.heard { outline: 2px dashed color-mix(in srgb, var(--presence, #3fb950) 80%, transparent); outline-offset: 2px; }
  .section .label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; display: flex; gap: 8px; }
  .section .label em { font-style: normal; color: var(--presence, #3fb950); }
  .section .line { font-size: 14px; line-height: 1.4; }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; }

  /* Editor */
  .editor { display: flex; flex-direction: column; gap: 10px; }
  .fields { display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 8px; }
  .paste { display: flex; flex-direction: column; gap: 8px; }
  .paste summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .paste textarea { width: 100%; margin: 8px 0; }
  .edit-section { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); }
  .edit-section-head { display: flex; gap: 4px; }
  .edit-section-head input { flex: 1; }

  /* Stage */
  .stage { padding: 10px; gap: 8px; overflow: auto; }
  .stage > header, .detect > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .kicker.program { color: var(--live); }
  .steps { display: flex; gap: 4px; }
  .monitor { container-type: inline-size; border-radius: var(--radius-control, 8px); overflow: hidden; flex: none; }
  .detect { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); }
  .follow { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .follow input { height: auto; margin-top: 3px; }
  .follow small { display: block; color: var(--muted); font-size: 11px; }
  .match { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--presence, #3fb950); border-radius: var(--radius-control, 8px); background: var(--panel); color: var(--ink); text-align: left; font: inherit; }
  .match small { font-size: 11px; color: var(--presence, #3fb950); text-transform: uppercase; letter-spacing: 0.08em; }
  .heard { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }

  @media (max-width: 1280px) {
    .song-desk { grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(240px, 300px); }
    .fields { grid-template-columns: 1fr 1fr; }
  }
</style>
