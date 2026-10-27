<script lang="ts">
  import { saveFile, savedName } from "../../platform/save-file";
  import InlineWords from "../InlineWords.svelte";
  import { session } from "../../app/session.svelte";
  import { songFileName, songToOpenLyrics } from "../../domain/openlyrics";
  import { createZip, readZip } from "../../domain/zip";
  import { cleanFolder, filterSongs, moveSongSection, parseSongFile, removeSongSection, sectionShort, sectionTone, songCredit, songFolders } from "../../domain/song";
  import { chorusAfterVerses, hasOwnOrder, songOrder, songSlots } from "../../domain/song-order";
  import type { Song, SongSection, SongSectionKind } from "../../domain/types";
  import { buildSongIndex, chooseSung, screenForSung, type SungMatch } from "../../voice/song-detect";
  import { SONG_LINE_CHOICES } from "../../domain/song-screens";
  import { partForKey, SONG_PART_LETTERS } from "../../domain/song-keys";
  import { firstChord, prefersFlats, transposeChord } from "../../domain/chords";
  import { invoke } from "@tauri-apps/api/core";
  import { isDesktop } from "../../platform/runtime";
  import { readPro6, readPro7, type ImportedSong } from "../../import/propresenter";
  import { songFromEasyWorship, songFromImport, type EasyWorshipRow } from "../../import/songs";
  import { preferService, serviceSongIds } from "../../domain/service-first";
  import Icon from "../Icon.svelte";
  import FavoriteStar from "../FavoriteStar.svelte";
  import { favoritesFirst } from "../../domain/favorites";
  import MonitorPair from "./MonitorPair.svelte";
  import LibrarySidebar from "./LibrarySidebar.svelte";
  import SongFinder from "./SongFinder.svelte";
  import VoiceStatus from "../VoiceStatus.svelte";
  import { quickFilter, sortSongs, withLetters, type SongSort } from "../../domain/song-browse";
  import AddToService from "./AddToService.svelte";
  import ToolMenu from "../ToolMenu.svelte";
  import AiSongDialog from "./AiSongDialog.svelte";
  import { t, tn } from "../../i18n/core";

  // Songs window: library in folders, the song's sections one click from Preview, and detection
  // that follows the room while it sings. Nothing here changes Program; LIVE does.

  /** `order`: section ids as sung (repeats allowed); empty means the sections as written. */
  type Draft = { id: string; title: string; author: string; folder: string; ccli: string; copyright: string; sections: SongSection[]; order: string[]; secondLanguage: string; trackId: string; isNew: boolean };

  /** The song search window. */
  let finding = $state(false);
  /** null: All songs. "": Unfiled. Otherwise a folder name. */
  let folder = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let draft = $state<Draft | null>(null);
  /** The song as it was when editing began, to tell whether there is anything to lose. */
  let draftStart = "";
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
  /** Look up a song with AI. Settings › AI assistant can ask for it too. */
  let aiSongOpen = $state(false);
  let aiSongQuery = $state("");
  $effect(() => {
    const asked = session.aiSongLookup;
    if (asked === null) return;
    session.aiSongLookup = null;
    aiSongQuery = asked;
    aiSongOpen = true;
  });

  // Detection
  let follow = $state(false);
  let heard = $state("");
  let detected = $state<SungMatch | null>(null);

  const folders = $derived(songFolders(session.songs, session.workspace.songFolders));
  const packs = $derived(session.songPacks.filter((pack) => !session.workspace.installedPacks.includes(pack.id)));
  let installing = $state<string | null>(null);
  /** Sample songs offered straight away when the library is empty. */
  const starterPack = $derived(packs.find((pack) => pack.starter) ?? null);

  $effect(() => {
    void session.loadSongPacks();
  });

  async function install(pack: (typeof packs)[number]) {
    // Starter songs are for every church to try the app with; other packs come with Premium.
    if (!pack.starter && !session.requireFeature("song-packs")) return;
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
  // Browsing a long list: a filter, an order (kept on this computer), letter headings for A–Z,
  // and rows drawn a page at a time so hundreds of songs stay quick.
  const readPref = (key: string, fallback: string) => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const writePref = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private window: the choice lasts until reload */
    }
  };
  let listQuery = $state("");
  let sort = $state<SongSort>(readPref("songs.sort", "favorites") as SongSort);
  let foldersOpen = $state(readPref("songs.folders", "open") !== "closed");
  let limit = $state(150);
  let listEl = $state<HTMLUListElement | undefined>();
  const mostSung = $derived(lists.find((list) => list.id === "most")?.songs.map((song) => song.id) ?? []);
  const shown = $derived(
    sortSongs(quickFilter(visible, listQuery), sort, { starred: (song) => session.isFavorite("songs", song.id), mostSung }),
  );
  const lettered = $derived(sort === "az" && shown.length > 20);
  const rows = $derived(lettered ? withLetters(shown) : shown.map((song) => ({ kind: "song" as const, song })));
  const letters = $derived(lettered ? rows.flatMap((row) => (row.kind === "letter" ? [row.letter] : [])) : []);
  $effect(() => {
    void folder;
    void listQuery;
    void sort;
    limit = 150;
  });

  function setSort(next: SongSort) {
    sort = next;
    writePref("songs.sort", next);
  }

  function toggleFolders() {
    foldersOpen = !foldersOpen;
    writePref("songs.folders", foldersOpen ? "open" : "closed");
  }

  function jumpTo(letter: string) {
    const index = rows.findIndex((row) => row.kind === "letter" && row.letter === letter);
    if (index >= limit) limit = index + 150;
    requestAnimationFrame(() => listEl?.querySelector(`[data-letter="${letter}"]`)?.scrollIntoView({ block: "start" }));
  }

  /** Draw the next page of rows when the end of the list comes into view. */
  function more(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) limit += 150;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

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

  // Song-part hot keys (domain/song-keys.ts): 1–9 the numbered part, Shift+V/C/B/P/T/I/E by kind.
  // Caught before the desk's own keys, so Shift+B never blacks the screen; text fields and dialogs
  // keep their keys.
  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      const song = selected;
      if (!song || draft || event.metaKey || event.ctrlKey || event.altKey || session.settingsOpen) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || target.closest('[aria-modal="true"]'))) return;
      const digit = !event.shiftKey && /^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(5)) : undefined;
      const code = event.shiftKey && SONG_PART_LETTERS.includes(event.code) ? event.code : undefined;
      if (digit === undefined && !code) return;
      event.preventDefault();
      event.stopPropagation();
      const current = onPreview?.songId === song.id ? onPreview.sectionId : null;
      const part = partForKey(song.sections, { digit, code }, current);
      if (part) show(song, part.id);
      else note = t("This song has no such part.");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  const onPreview = $derived(session.songFocus);
  const index = $derived(buildSongIndex(session.songs));
  // The open service's songs are matched first; the whole library when the service lacks the song.
  const inService = $derived(serviceSongIds(session.service));
  const serviceIndex = $derived(buildSongIndex(session.songs.filter((song) => inService.has(song.id))));
  const listening = $derived(session.voice.status === "listening" || session.voice.status === "starting");
  const programSource = $derived(session.live.program.sourceId ?? "");
  const programLive = $derived(!session.programHeld && session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  /** A part is on the screen: whole, or (line by line) any of its screens ("song:id:part#2"). */
  const partLive = (songId: string, sectionId: string) => {
    const base = `song:${songId}:${sectionId}`;
    return programLive && (programSource === base || programSource.startsWith(`${base}#`));
  };
  const screenLive = (songId: string, sectionId: string, screen: number) => programLive && programSource === `song:${songId}:${sectionId}#${screen}`;
  const screenOnPreview = (songId: string, sectionId: string, screen: number) =>
    onPreview?.songId === songId && onPreview.sectionId === sectionId && (onPreview.screen ?? 0) === screen;
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
  const previewKey = (focus: typeof onPreview) => (focus ? `${focus.songId}:${focus.sectionId}:${focus.slot ?? ""}:${focus.screen ?? 0}` : null);
  /**
   * The one Preview that must stay on Preview (Alt-click, Start, follow singing), by its key: a
   * Program change running this effect first cannot use it up, and a click that changed nothing
   * cannot leave it waiting to hold back the next part meant for the screen.
   */
  let quietKey: string | null = null;
  function previewOnly(song: Song, sectionId: string, slot?: number, screen?: number) {
    session.previewSongSection(song, sectionId, slot, screen);
    quietKey = previewKey(session.songFocus);
  }
  $effect(() => {
    const now = previewKey(onPreview);
    const was = lastPreview;
    lastPreview = now;
    if (now === was) return;
    const quiet = now !== null && now === quietKey;
    quietKey = null;
    // Never while editing: the editor's Preview button is for checking, not for the room.
    if (quiet || draft || !now || was === undefined) return;
    if (programSource === `song:${now}`) return;
    // The song on the screen follows the operator: once it is live, choosing another of its
    // parts changes the screen in either mode. A different song waits on Preview (Preview mode).
    const sameSongLive = programLive && programSource.startsWith(`song:${onPreview?.songId}:`);
    if (!clickLive && !sameSongLive) return;
    void session.take();
  });

  const listTitle = $derived(folder === null ? t("All songs") : openList ? openList.label : folder === "" ? t("Unfiled") : folder);

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
      const phrases = alternatives.length ? alternatives : [text];
      const current = session.songFocus?.songId ?? null;
      const own = serviceIndex.entries.length ? chooseSung(phrases, serviceIndex, current) : null;
      const match = preferService(own, chooseSung(phrases, index, current));
      if (!match) return;
      detected = match;
      if (!follow) return;
      const focus = session.songFocus;
      const song = session.songs.find((entry) => entry.id === match.songId);
      const section = song?.sections.find((entry) => entry.id === match.sectionId);
      if (!song || !section) return;
      // Line by line, follow the screen holding the words just sung.
      const sameScreenOf = focus?.songId === match.songId && focus.sectionId === match.sectionId ? (focus.screen ?? 0) : 0;
      const screen = screenForSung(text, section.lines, session.songScreens(section), sameScreenOf);
      if (focus?.songId === match.songId && focus.sectionId === match.sectionId && (focus.screen ?? 0) === screen) return;
      // Following the singing fills Preview only ("LIVE still sends Program"), even when the song is live.
      previewOnly(song, match.sectionId, undefined, screen);
      session.voice.message = t("{title} on Preview. LIVE still sends Program.", { title: match.label });
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
    if (!leaveDraft()) return;
    selectedId = song.id;
  }

  /** Option-click (Alt-click) puts a part on Preview only, even when its song is on the screen. */
  function show(song: Song, sectionId: string, event?: MouseEvent, slot?: number, screen?: number) {
    if (event?.altKey) previewOnly(song, sectionId, slot, screen);
    else session.previewSongSection(song, sectionId, slot, screen);
  }

  async function showAndTake(song: Song, sectionId: string, slot?: number, screen?: number) {
    session.previewSongSection(song, sectionId, slot, screen);
    if (!clickLive) await session.take();
  }

  function showDetected() {
    const match = detected;
    const song = match ? session.songs.find((entry) => entry.id === match.songId) : null;
    if (!match || !song) return;
    previewOnly(song, match.sectionId);
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

  const LYRIC_FILE = /\.(txt|cho|chordpro|chopro|crd|pro|md|usr|xml|pro6|pro5)$/i;
  /** ProPresenter: .pro6/.pro5 are XML, .pro is ProPresenter 7 (binary) unless it reads as ChordPro text. */
  const PROPRESENTER_FILE = /\.(pro|pro6|pro5)$/i;

  /** A ProPresenter song from a file's bytes, or null (then it is read as a lyric file). */
  function readProPresenter(name: string, bytes: Uint8Array): ImportedSong | null {
    if (!PROPRESENTER_FILE.test(name)) return null;
    const title = name.replace(/\.[^.]+$/, "");
    if (/\.pro$/i.test(name)) return bytes.subarray(0, 512).includes(0) || bytes[0] === 0x0a ? readPro7(bytes, title) : null;
    return readPro6(new TextDecoder().decode(bytes), title);
  }

  /** Lyric files from a pick: plain files as they are, and the lyric files inside any .zip. */
  async function readLyricFiles(list: File[]): Promise<{ files: { name: string; text: string; dir: string }[]; pro: { name: string; song: ImportedSong; dir: string }[]; zipName: string | null }> {
    const files: { name: string; text: string; dir: string }[] = [];
    const pro: { name: string; song: ImportedSong; dir: string }[] = [];
    let zipName: string | null = null;
    const decoder = new TextDecoder();
    for (const file of list) {
      if (/\.(zip|probundle)$/i.test(file.name)) {
        zipName ??= file.name.replace(/\.(zip|probundle)$/i, "");
        try {
          for (const entry of await readZip(new Uint8Array(await file.arrayBuffer()))) {
            const parts = entry.name.split("/").filter(Boolean);
            const name = parts.pop() ?? entry.name;
            // A song in a sub-folder of the zip (Hymns/…) goes to that library folder.
            const dir = parts.length && !parts[0]!.startsWith("__") ? parts[parts.length - 1]! : "";
            if (name.startsWith(".") || entry.data.length > 4 * 1024 * 1024) continue;
            const song = readProPresenter(name, entry.data);
            if (song) pro.push({ name, song, dir });
            else if (LYRIC_FILE.test(name) && entry.data.length <= 512 * 1024) files.push({ name, text: decoder.decode(entry.data), dir });
          }
        } catch (error) {
          note = error instanceof Error ? `${file.name}: ${error.message}` : t("{name} could not be opened.", { name: file.name });
        }
      } else if (PROPRESENTER_FILE.test(file.name) && file.size <= 4 * 1024 * 1024) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const song = readProPresenter(file.name, bytes);
        if (song) pro.push({ name: file.name, song, dir: "" });
        else if (file.size <= 512 * 1024) files.push({ name: file.name, text: decoder.decode(bytes), dir: "" });
      } else if ((LYRIC_FILE.test(file.name) || file.type === "text/plain") && file.size <= 512 * 1024) {
        files.push({ name: file.name, text: await file.text(), dir: "" });
      }
    }
    return { files, pro, zipName };
  }

  async function importFiles(list: FileList | null, into: string) {
    const { files, pro, zipName } = await readLyricFiles([...(list ?? [])]);
    if (files.length === 0 && pro.length === 0) {
      note ||= t("No lyric files found. Use .txt, ChordPro, SongSelect (.usr), OpenLyrics (.xml / .zip) or ProPresenter (.pro, .pro6, .proBundle) files.");
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
    // ProPresenter songs are read already; they go in as songs.
    const proGroups = new Map<string, Song[]>();
    for (const entry of pro) {
      const target = into || entry.dir || fallback;
      const song = songFromImport(entry.song, target);
      if (song) proGroups.set(target, [...(proGroups.get(target) ?? []), song]);
      else skipped.push(entry.name);
    }
    for (const [target, songs] of proGroups) {
      added += await session.importSongs(songs, target);
      if (!groups.has(target)) groups.set(target, []);
    }
    for (const [target, group] of groups) {
      if (!group.length) continue;
      const result = await session.importSongFiles(group, target);
      added += result.added;
      skipped.push(...result.skipped);
    }
    const only = groups.size === 1 ? [...groups.keys()][0]! : "";
    note = `${added} song${added === 1 ? "" : "s"} imported${only ? ` to ${only}` : groups.size > 1 ? ` into ${groups.size} folders` : ""}.${skipped.length ? ` ${skipped.length} file${skipped.length === 1 ? "" : "s"} had no lyrics.` : ""}`;
    if (added && only) folder = only;
  }

  // Export: OpenLyrics, one .xml per song; several songs go out as one .zip.

  async function save(name: string, data: string | Uint8Array | ArrayBuffer | Blob, type: string) {
    try {
      const saved = await saveFile(name, data, type);
      if (saved) note = t("Saved as {name}.", { name: savedName(saved) });
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
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

  /** EasyWorship 6/7: pick its Data folder; the desktop core reads the two databases. */
  async function importEasyWorship() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folderPath = await open({ directory: true, multiple: false, title: t("Choose EasyWorship's Data folder") });
    if (typeof folderPath !== "string") return;
    note = t("Reading EasyWorship songs…");
    try {
      const rows = await invoke<EasyWorshipRow[]>("easyworship_songs", { folder: folderPath });
      const target = targetFolder || "EasyWorship";
      const songs = rows.map((row) => songFromEasyWorship(row, target)).filter((song): song is Song => !!song);
      const added = await session.importSongs(songs, target);
      note = tn(added, "{n} song imported from EasyWorship.", "{n} songs imported from EasyWorship.") + (rows.length > added ? ` ${tn(rows.length - added, "{n} had no words.", "{n} had no words.")}` : "");
      if (added) folder = target;
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
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
      sections: [{ id: crypto.randomUUID(), kind: "verse", label: t("Verse 1"), lines: [""] }],
      order: [],
      secondLanguage: "",
      trackId: "",
      isNew: true,
    };
    draftStart = JSON.stringify(asSong(draft));
    pasteText = "";
  }

  /** A hymn the AI wrote out: a new song in the editor, saved only when the operator says so. */
  function editWritten(song: Song) {
    if (!leaveDraft()) return;
    edit(song);
    if (draft) draft.isNew = true;
    draftStart = "";
    note = t("The AI wrote these words. Check every line before they go on screen, then Save.");
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
      order: [...(song.order ?? [])],
      secondLanguage: song.secondLanguage ?? "",
      trackId: song.trackId ?? "",
      isNew: false,
    };
    draftStart = JSON.stringify(asSong(draft));
    pasteText = "";
  }

  /** Leave the editor. With unsaved changes, the first try only warns; the second discards them. */
  function leaveDraft(): boolean {
    if (!draft) return true;
    if (JSON.stringify(asSong(draft)) !== draftStart && !arm("discard-draft")) {
      note = t("This song has unsaved changes. Click again to discard them, or press Save.");
      return false;
    }
    draft = null;
    return true;
  }

  function asSong(value: Draft): Song {
    return {
      id: value.id,
      title: value.title,
      author: value.author,
      folder: value.folder,
      ccli: value.ccli,
      copyright: value.copyright,
      sections: value.sections,
      ...(value.order.length ? { order: value.order } : {}),
      ...(value.secondLanguage.trim() ? { secondLanguage: value.secondLanguage.trim() } : {}),
      ...(value.trackId ? { trackId: value.trackId } : {}),
    };
  }

  function applyPaste() {
    if (!draft) return;
    const parsed = parseSongFile("pasted.txt", pasteText);
    if (parsed.sections.length === 0) {
      note = t("No lyrics found. Paste lines of a song, with a blank line between sections.");
      return;
    }
    draft.sections = parsed.sections;
    draft.order = parsed.order ? [...parsed.order] : [];
    if (!draft.title.trim() && parsed.title) draft.title = parsed.title;
    if (!draft.author.trim() && parsed.author) draft.author = parsed.author;
    if (!draft.ccli.trim() && parsed.ccli) draft.ccli = parsed.ccli;
    if (!draft.copyright.trim() && parsed.copyright) draft.copyright = parsed.copyright;
    pasteText = "";
    note = `${parsed.sections.length} section${parsed.sections.length === 1 ? "" : "s"} ready. Check the labels, then Save.`;
  }

  // The order the song is sung in. Editing starts from the order shown (the sections as written
  // until the song has its own).
  let dragFrom = $state<number | null>(null);
  // Dragging the song's sections in the editor.
  let sectionDrag = $state<number | null>(null);
  let sectionDrop = $state<number | null>(null);
  function dropSection(to: number) {
    if (sectionDrag === null || !draft) return;
    const from = sectionDrag;
    sectionDrag = null;
    sectionDrop = null;
    if (from === to) return;
    const sections = [...draft.sections];
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved!);
    draft.sections = sections;
  }
  const draftOrder = $derived(draft ? songOrder(asSong(draft)) : []);
  const draftById = $derived(new Map((draft?.sections ?? []).map((section) => [section.id, section])));
  function setOrder(next: string[]) {
    if (draft) draft.order = next;
  }
  function addToOrder(id: string) {
    setOrder([...draftOrder, id]);
  }
  function removeFromOrder(index: number) {
    const next = draftOrder.filter((_, n) => n !== index);
    setOrder(next.length ? next : []);
  }
  function moveInOrder(from: number, to: number) {
    if (from === to || to < 0 || to >= draftOrder.length) return;
    const next = [...draftOrder];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id!);
    setOrder(next);
  }
  function orderKey(event: KeyboardEvent, index: number) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeFromOrder(index);
    } else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const to = index + (event.key === "ArrowRight" ? 1 : -1);
      moveInOrder(index, to);
      queueMicrotask(() => document.getElementById(`order-${to}`)?.focus());
    }
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

{#if aiSongOpen}
  <AiSongDialog query={aiSongQuery} folder={targetFolder} onclose={() => { aiSongOpen = false; aiSongQuery = ""; }} onwords={editWritten} onopen={(song) => { if (leaveDraft()) selectedId = song.id; }} onimport={() => fileInput?.click()} />
{/if}

<section class="song-desk">
  <!-- Library -->
  <LibrarySidebar title={t("Songs")} icon="note" count={session.songs.length} storageKey="songs">
    {#snippet actions()}
      <ToolMenu label={t("Import songs")} tip={t("Add songs from files")} className="desk-btn" align="left">
        {#snippet trigger()}<Icon name="download" size={14} /> {t("Import")}{/snippet}
        {#snippet children(close)}
          {#if session.aiOn("songLookup")}
            <button type="button" role="menuitem" onclick={() => { aiSongOpen = true; close(); }}><Icon name="sparkles" size={16} /> {t("Look up a song with AI…")}</button>
            <p class="menu-note">{t("Songs you don't have yet: words for old hymns, SongSelect for the rest.")}</p>
            <div class="menu-sep"></div>
          {/if}
          <button type="button" role="menuitem" onclick={() => { fileInput?.click(); close(); }}><Icon name="files" size={16} /> {t("Lyric files…")}</button>
          <p class="menu-note">{t("Plain text, ChordPro, SongSelect, OpenLyrics (.xml, .zip) from OpenLP and FreeShow, or ProPresenter (.pro, .pro6, .proBundle).")}</p>
          <button type="button" role="menuitem" onclick={() => { dirInput?.click(); close(); }}><Icon name="folder" size={16} /> {t("A whole folder…")}</button>
          {#if isDesktop()}
            <button type="button" role="menuitem" onclick={() => { close(); void importEasyWorship(); }}><Icon name="library" size={16} /> {t("From EasyWorship…")}</button>
            <p class="menu-note">{t("Choose EasyWorship's Data folder (with Songs.db and SongWords.db). EasyWorship 6 and 7.")}</p>
          {/if}
          {#if packs.length > 0}
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" onclick={() => { showPacks = true; close(); }}><Icon name="library" size={16} /> {t("Song packs ({length})", { length: packs.length })}</button>
          {/if}
        {/snippet}
      </ToolMenu>
      <button type="button" class="desk-btn primary-soft" onclick={newSong}><Icon name="plus" size={14} /> {t("New song")}</button>
    {/snippet}
    <button type="button" class="find-song" onclick={() => (finding = true)}>
      <Icon name="search" size={15} /><span>{t("Find a song")}</span><kbd>/</kbd>
    </button>

    <button type="button" class="fold-head" aria-expanded={foldersOpen} onclick={toggleFolders}>
      <Icon name={foldersOpen ? "chevron-down" : "chevron-right"} size={13} /><span>{t("Lists and folders")}</span>
      {#if !foldersOpen}<em>{listTitle}</em>{/if}
    </button>
    {#if foldersOpen}
    <nav class="folders lists" aria-label={t("Song lists")}>
      <button type="button" class="folder" class:on={folder === null} onclick={() => (folder = null)}>
        <Icon name="library" size={16} /><span>{t("All songs")}</span><small>{session.songs.length}</small>
      </button>
      {#each shownLists as list (list.id)}
        <button type="button" class="folder" class:on={folder === `${LIST}${list.id}`} onclick={() => (folder = `${LIST}${list.id}`)}>
          <Icon name={list.icon} size={16} /><span>{list.label}</span><small>{list.songs.length}</small>
        </button>
      {/each}
    </nav>
    <p class="group sub-group">{t("Folders")}</p>
    <nav class="folders" aria-label={t("Song folders")}>
      {#if unfiled > 0 && folders.length > 0}
        <button type="button" class="folder" class:on={folder === ""} onclick={() => (folder = "")}>
          <Icon name="folder" size={16} /><span>{t("Unfiled")}</span><small>{unfiled}</small>
        </button>
      {/if}
      {#each folders as entry (entry.name)}
        {#if renaming === entry.name}
          <input
            class="folder-input"
            aria-label={t("Rename {name}", { name: entry.name })}
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
              <button type="button" class="row-tool" aria-label={t("Rename {name}", { name: entry.name })} title={t("Rename")} onclick={() => (renaming = entry.name)}><Icon name="pencil" size={14} /></button>
              <button
                type="button"
                class="row-tool"
                class:armed={armed === `folder:${entry.name}`}
                aria-label={armed === `folder:${entry.name}` ? t("Confirm remove {name}", { name: entry.name }) : t("Remove folder {name}", { name: entry.name })}
                title={armed === `folder:${entry.name}` ? t("Click again — songs stay, unfiled") : t("Remove folder")}
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
          aria-label={t("New folder name")}
          placeholder={t("Folder name")}
          autofocus
          bind:value={newFolder}
          onkeydown={(event) => {
            if (event.key === "Enter") commitFolder();
            if (event.key === "Escape") newFolder = null;
          }}
          onblur={commitFolder}
        />
      {:else}
        <button type="button" class="folder add" onclick={startFolder}><Icon name="plus" size={16} /><span>{t("New folder")}</span></button>
      {/if}
    </nav>
    {/if}

    {#if showPacks && packs.length > 0}
      <div class="packs" aria-label={t("Song packs")}>
        <p class="group">{t("Song packs")} <button type="button" class="packs-close" aria-label={t("Hide song packs")} onclick={() => (showPacks = false)}><Icon name="close" size={12} /></button></p>
        {#each packs as pack (pack.id)}
          <div class="pack">
            <div>
              <strong>{pack.name}</strong>
              {#if pack.description}<span>{pack.description}</span>{/if}
              {#if pack.license}<small>{pack.license}</small>{/if}
            </div>
            <button type="button" class="import" disabled={installing !== null} onclick={() => void install(pack)}>{installing === pack.id ? t("Adding…") : t("Add")}</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="list-head">
      <p class="group">{listTitle} <span>{visible.length}</span></p>
      <button type="button" class="export-list" disabled={visible.length === 0} data-tip={tn(visible.length, "Save this song as an OpenLyrics file (.zip), for backup or another computer", "Save these {n} songs as one OpenLyrics file (.zip), for backup or another computer")} onclick={exportList}>
        <Icon name="files" size={13} /> {t("Save these")}
      </button>
      <input bind:this={fileInput} type="file" multiple accept=".txt,.cho,.chordpro,.chopro,.crd,.pro,.pro6,.pro5,.probundle,.md,.usr,.xml,.zip,text/plain" hidden onchange={onFiles} />
      <input bind:this={dirInput} type="file" multiple hidden webkitdirectory onchange={onDirectory} />
    </div>

    {#if visible.length > 8}
      <div class="list-tools">
        <label class="list-filter focus-box">
          <Icon name="search" size={13} />
          <input type="search" aria-label={t("Filter this list")} placeholder={t("Filter")} bind:value={listQuery} />
        </label>
        <select class="list-sort" aria-label={t("Order")} value={sort} onchange={(event) => setSort(event.currentTarget.value as SongSort)}>
          <option value="favorites">{t("Favorites first")}</option>
          <option value="az">{t("A–Z")}</option>
          <option value="most">{t("Most sung")}</option>
        </select>
      </div>
    {/if}

    <div class="song-scroll">
    <ul class="songs" aria-label={t("Songs")} bind:this={listEl}>
      {#if visible.length === 0}
        <li class="empty">
          {openList ? openList.empty : session.songs.length ? t("This folder is empty.") : t("No songs yet. Press New song to type or paste one, or Import to bring in files.")}
          {#if !session.songs.length && starterPack}
            <span class="starter">
              <strong>{starterPack.name}</strong>
              <span>{starterPack.description}</span>
              <button type="button" class="import" disabled={installing !== null} onclick={() => void install(starterPack)}>{installing === starterPack.id ? t("Adding…") : t("Add them")}</button>
            </span>
          {/if}
        </li>
      {:else if shown.length === 0}
        <li class="empty">{t("No song in this list has “{query}”.", { query: listQuery.trim() })}</li>
      {/if}
      {#each rows.slice(0, limit) as row (row.kind === "letter" ? `letter:${row.letter}` : row.song.id)}
        {#if row.kind === "letter"}
          <li class="letter" data-letter={row.letter}>{row.letter}</li>
        {:else}
        {@const song = row.song}
        <li class="song-item">
          <span class="song-star"><FavoriteStar on={session.isFavorite("songs", song.id)} label={song.title || t("this song")} onclick={() => session.toggleFavorite("songs", song.id)} /></span>
          <button type="button" class="song" class:on={selectedId === song.id && !draft} onclick={() => pick(song)}>
            <strong>
              {song.title || t("Untitled song")}
              {#if programSource.startsWith(`song:${song.id}:`) && programLive}<em class="badge live">{t("Live")}</em>
              {:else if onPreview?.songId === song.id}<em class="badge">{t("Preview")}</em>{/if}
            </strong>
            <span class="sub">{snippet(song) || song.author}<em>{song.sections.length}</em></span>
          </button>
        </li>
        {/if}
      {/each}
      {#if rows.length > limit}<li class="more" use:more>{t("Loading more…")}</li>{/if}
    </ul>
    {#if letters.length > 3}
      <nav class="letters" aria-label={t("Jump to a letter")}>
        {#each letters as letter (letter)}<button type="button" onclick={() => jumpTo(letter)}>{letter}</button>{/each}
      </nav>
    {/if}
    </div>
  </LibrarySidebar>

  <!-- Song -->
  <div class="sheet">
    {#if note}
      <p class="note" role="status"><span>{note}</span><button type="button" aria-label={t("Dismiss")} onclick={() => (note = "")}><Icon name="close" size={14} /></button></p>
    {/if}
    {#if draft}
      <form class="editor" onsubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <div class="editor-head">
          <h2>{draft.isNew ? t("New song") : t("Edit song")}</h2>
          <div class="row-actions">
            <button type="button" class="desk-btn" onclick={() => draft && session.previewSongSection(asSong(draft), draft.sections[0]?.id ?? null)}>{t("Preview")}</button>
            <button type="button" class="desk-btn ghost" onclick={() => leaveDraft()}>{armed === "discard-draft" ? t("Discard changes") : t("Cancel")}</button>
            <button type="submit" class="desk-btn primary">{t("Save")}</button>
          </div>
        </div>
        <div class="fields">
          <input aria-label={t("Song title")} placeholder={t("Title")} bind:value={draft.title} />
          <input aria-label={t("Song author")} placeholder={t("Author")} bind:value={draft.author} />
          <input aria-label={t("Song folder")} placeholder={t("Folder (optional)")} list="song-folder-names" bind:value={draft.folder} />
          <input aria-label={t("CCLI song number")} placeholder={t("CCLI song # (optional)")} inputmode="numeric" bind:value={draft.ccli} />
          <input class="wide" aria-label={t("Copyright")} placeholder={t("Copyright, e.g. 2015 Publisher (blank for public domain)")} bind:value={draft.copyright} />
          <input aria-label={t("Second language")} placeholder={t("Second language, e.g. Twi (optional)")} maxlength="40" bind:value={draft.secondLanguage} />
          <select aria-label={t("Backing track")} title={t("Plays when this song goes live (audio files from Audio)")} bind:value={draft.trackId}>
            <option value="">{t("No backing track")}</option>
            {#each session.audioTracks as track (track.id)}<option value={track.id}>{t("Backing track: {name}", { name: track.name.replace(/\.[a-z0-9]+$/i, "") })}</option>{/each}
          </select>
          <datalist id="song-folder-names">
            {#each folders as entry (entry.name)}<option value={entry.name}></option>{/each}
          </datalist>
        </div>
        <details class="paste" open={draft.isNew}>
          <summary>{t("Paste the whole song")}</summary>
          <textarea
            aria-label={t("Paste lyrics")}
            rows="6"
            placeholder={t("Blank lines split sections. “Verse 1”, “[Chorus]”, “Bridge:” name them. ChordPro and SongSelect lyrics (with their CCLI footer) work too.")}
            bind:value={pasteText}
          ></textarea>
          <button type="button" class="desk-btn" disabled={!pasteText.trim()} onclick={applyPaste}>{t("Split into sections")}</button>
        </details>
        <div class="order-edit" aria-label={t("Order the song is sung in")}>
          <div class="order-head">
            <strong>{t("Order")}</strong>
            <span class="muted">{hasOwnOrder(asSong(draft)) ? t("Arrows and the song map follow this order.") : t("As written. Click a part below to add it again, e.g. the chorus after each verse.")}</span>
            <span class="order-tools">
              {#if draft.sections.some((section) => section.kind === "chorus") && draft.sections.some((section) => section.kind === "verse")}
                <button type="button" class="desk-btn ghost" onclick={() => draft && setOrder(chorusAfterVerses(asSong(draft)))}>{t("Chorus after each verse")}</button>
              {/if}
              {#if hasOwnOrder(asSong(draft))}<button type="button" class="desk-btn ghost" onclick={() => setOrder([])}>{t("As written")}</button>{/if}
            </span>
          </div>
          <div class="order-chips" role="list">
            {#each draftOrder as id, n (`${n}:${id}`)}
              {@const section = draftById.get(id)}
              {#if section}
                <span
                  class="order-chip"
                  class:dragging={dragFrom === n}
                  role="listitem"
                  draggable="true"
                  style:--tone="var(--sec-{sectionTone(section)})"
                  ondragstart={() => (dragFrom = n)}
                  ondragend={() => (dragFrom = null)}
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => { event.preventDefault(); if (dragFrom !== null) moveInOrder(dragFrom, n); dragFrom = null; }}
                >
                  <button type="button" id="order-{n}" class="order-name" title={t("{label}. Drag to move, or Alt+← →; Delete removes", { label: section.label })} onkeydown={(event) => orderKey(event, n)}>{sectionShort(section)}</button>
                  <button type="button" class="order-x" aria-label={t("Remove {label} at place {n}", { label: section.label, n: n + 1 })} onclick={() => removeFromOrder(n)}><Icon name="close" size={11} /></button>
                </span>
              {/if}
            {/each}
          </div>
          <div class="order-add">
            <span class="muted">{t("Add")}</span>
            {#each draft.sections as section (section.id)}
              <button type="button" class="order-add-btn" style:--tone="var(--sec-{sectionTone(section)})" title={t("Add {label} to the end", { label: section.label })} onclick={() => addToOrder(section.id)}>+ {sectionShort(section)}</button>
            {/each}
          </div>
        </div>
        {#each draft.sections as section, i (section.id)}
          <div
            class="edit-section"
            role="group"
            aria-label={section.label}
            class:dragging={sectionDrag === i}
            class:drop-before={sectionDrag !== null && sectionDrop === i && sectionDrag !== i}
            style:--tone="var(--sec-{sectionTone(section)})"
            ondragover={(event) => { if (sectionDrag !== null) { event.preventDefault(); sectionDrop = i; } }}
            ondrop={(event) => { event.preventDefault(); dropSection(i); }}
          >
            <div class="edit-section-head">
              <button
                type="button"
                id="song-grip-{i}"
                class="grip"
                draggable="true"
                aria-label={t("Move {label}: drag, or Alt+arrow keys", { label: section.label })}
                title={t("Drag to move this section")}
                ondragstart={(event) => { sectionDrag = i; event.dataTransfer?.setData("text/plain", String(i)); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                ondragend={() => { sectionDrag = null; sectionDrop = null; }}
                onkeydown={(event) => {
                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown") || !draft) return;
                  event.preventDefault();
                  const step = event.key === "ArrowUp" ? -1 : 1;
                  draft.sections = moveSongSection(asSong(draft), section.id, step).sections;
                  queueMicrotask(() => document.getElementById(`song-grip-${i + step}`)?.focus());
                }}
              ><Icon name="grip" size={14} /></button>
              <input aria-label={t("Section label")} bind:value={section.label} />
              <button type="button" class="desk-btn ghost icon del" aria-label={t("Delete {label}", { label: section.label })} title={t("Delete this section")} onclick={() => draft && (draft.sections = removeSongSection(asSong(draft), section.id).sections)}><Icon name="trash" size={14} /></button>
            </div>
            <div class="langs" class:two={!!draft.secondLanguage.trim()}>
              <InlineWords
                text={section.lines.join("\n")}
                rich={section.rich ?? null}
                multiline
                rows={Math.max(3, section.lines.length, section.second?.length ?? 0)}
                label={t("{label} lines", { label: section.label })}
                placeholder={t("One lyric line per row")}
                onchange={(words) => {
                  section.lines = words.text.split("\n");
                  if (words.rich) section.rich = words.rich;
                  else delete section.rich;
                }}
              />
              {#if draft.secondLanguage.trim()}
                <label class="second">
                  <span>{t("In {language}", { language: draft.secondLanguage.trim() })}</span>
                  <textarea
                    aria-label={t("{label} in {language}", { label: section.label, language: draft.secondLanguage.trim() })}
                    rows={Math.max(3, section.lines.length, section.second?.length ?? 0)}
                    placeholder={t("The same lines in {language}, one per row, in the same order", { language: draft.secondLanguage.trim() })}
                    value={(section.second ?? []).join("\n")}
                    oninput={(event) => (section.second = event.currentTarget.value.split("\n"))}
                  ></textarea>
                </label>
              {/if}
            </div>
          </div>
        {/each}
        <div class="row-actions">
          <span class="muted">{t("Add")}</span>
          <button type="button" class="desk-btn" onclick={() => addSection("verse")}>{t("Verse")}</button>
          <button type="button" class="desk-btn" onclick={() => addSection("chorus")}>{t("Chorus")}</button>
          <button type="button" class="desk-btn" onclick={() => addSection("bridge")}>{t("Bridge")}</button>
          <button type="button" class="desk-btn" onclick={() => addSection("tag")}>{t("Tag")}</button>
        </div>
      </form>
    {:else if selected}
      <header class="song-head">
        <div>
          <h2>{selected.title}</h2>
          <p class="meta">
            {#if selected.author}<span>{selected.author}</span>{/if}
            <span>{tn(selected.sections.length, "{n} part", "{n} parts")}</span>
            {#if selected.folder}<span class="chip"><Icon name="folder" size={12} />{selected.folder}</span>{/if}
            {#if songCredit(selected, session.workspace.ccliLicense)}<span class="credit">{songCredit(selected, session.workspace.ccliLicense)}</span>{/if}
          </p>
        </div>
        <div class="row-actions">
          <button type="button" class="desk-btn primary-soft" data-tip={t("Put the first part on Preview")} onclick={() => { if (!selected.sections[0]) return; previewOnly(selected, selected.sections[0].id); }}><Icon name="play" size={14} /> {t("Start")}</button>
          <AddToService item={selected.title} onadd={(sectionId) => session.addSongToService(selected, sectionId)} />
          <button type="button" class="desk-btn" onclick={() => edit(selected)}><Icon name="pencil" size={14} /> {t("Edit")}</button>
          <ToolMenu label={t("More for this song")} tip={t("Folder, save as a file, delete")}>
            {#snippet trigger()}<Icon name="more" size={16} />{/snippet}
            {#snippet children(close)}
              <p class="menu-label">{t("Folder")}</p>
              <button type="button" role="menuitemcheckbox" aria-checked={!cleanFolder(selected.folder)} onclick={() => { void session.moveSongToFolder(selected, ""); close(); }}><Icon name="folder" size={16} /> {t("No folder")}</button>
              {#each folders as entry (entry.name)}
                <button type="button" role="menuitemcheckbox" aria-checked={cleanFolder(selected.folder) === entry.name} onclick={() => { void session.moveSongToFolder(selected, entry.name); close(); }}><Icon name="folder" size={16} /> {entry.name}</button>
              {/each}
              <div class="menu-sep"></div>
              <button type="button" role="menuitem" onclick={() => { exportSong(selected); close(); }}><Icon name="files" size={16} /> {t("Save as OpenLyrics file")}</button>
              <div class="menu-sep"></div>
              <button type="button" role="menuitem" class="danger-item" onclick={() => void deleteSelected(selected)}>
                <Icon name="close" size={16} /> {armed === `song:${selected.id}` ? t("Click again to delete") : t("Delete song")}
              </button>
            {/snippet}
          </ToolMenu>
        </div>
      </header>
      <div class="song-bar">
      <nav class="song-map" aria-label={t("Song map")}>
        {#each songSlots(selected) as section, slot (slot)}
          {@const here = onPreview?.songId === selected.id && onPreview.sectionId === section.id && (onPreview.slot === undefined || onPreview.slot === slot)}
          <button
            type="button"
            style:--tone="var(--sec-{sectionTone(section)})"
            class:on={here}
            class:live={here && partLive(selected.id, section.id)}
            title={t("{label} · {n} of {total}", { label: section.label, n: slot + 1, total: songOrder(selected).length })}
            aria-label={t("{label}, part {n}", { label: section.label, n: slot + 1 })}
            onclick={(event) => show(selected, section.id, event, slot)}
            ondblclick={() => void showAndTake(selected, section.id, slot)}
          >{sectionShort(section)}</button>
        {/each}
      </nav>
      {#if selected.secondLanguage && selected.sections.some((section) => section.second?.some((line) => line.trim()))}
        <div class="click-mode" role="radiogroup" aria-label={t("Language on the screen")}>
          <span>{t("Show")}</span>
          {#each [["first", t("Main")], ["second", selected.secondLanguage], ["both", t("Both")]] as [value, label] (value)}
            <button type="button" role="radio" aria-checked={session.workspace.songLanguage === value} class:on={session.workspace.songLanguage === value} onclick={() => session.setSongLanguage(value as "first" | "second" | "both")}>{label}</button>
          {/each}
        </div>
      {/if}
      {#if selected.sections.some((section) => section.chords)}
        {@const allChords = selected.sections.flatMap((section) => section.chords ?? [])}
        {@const key = firstChord(allChords)}
        {@const shift = selected.transpose ?? 0}
        <!-- Chords for the band: only the stage screen shows them; this moves them up or down. -->
        <div class="click-mode transpose" role="group" aria-label={t("Chords for the stage screen")}>
          <span>{t("Key")}</span>
          <button type="button" aria-label={t("Chords down a semitone")} onclick={() => void session.setSongTranspose(selected.id, shift - 1)}>−</button>
          <strong class="key">{key ? (shift ? `${key} → ${transposeChord(key, shift, prefersFlats(key, shift))}` : key) : "—"}{shift ? ` (${shift > 0 ? "+" : ""}${shift})` : ""}</strong>
          <button type="button" aria-label={t("Chords up a semitone")} onclick={() => void session.setSongTranspose(selected.id, shift + 1)}>+</button>
        </div>
      {/if}
      <div class="click-mode" role="radiogroup" aria-label={t("Lines on the screen")}>
        <span>{t("Lines")}</span>
        {#each SONG_LINE_CHOICES as lines (lines)}
          <button
            type="button"
            role="radio"
            aria-checked={session.workspace.songLines === lines}
            class:on={session.workspace.songLines === lines}
            data-tip={lines === 0 ? t("The whole part on the screen at once") : tn(lines, "{n} line on the screen at a time; the arrows step line by line", "{n} lines on the screen at a time; the arrows step through them")}
            onclick={() => session.setSongLines(lines)}
          >{lines === 0 ? t("All") : lines}</button>
        {/each}
      </div>
      <div class="click-mode" role="radiogroup" aria-label={t("When you click a part")}>
        <span>{t("Click")}</span>
        <button type="button" role="radio" aria-checked={!clickLive} class:on={!clickLive} data-tip={t("Click puts a part on Preview; double-click or LIVE shows it")} onclick={() => setClickLive(false)}>{t("Preview")}</button>
        <button type="button" role="radio" aria-checked={clickLive} class:on={clickLive} class:live-on={clickLive} data-tip={t("Click shows a part on the screen at once; arrows too")} onclick={() => setClickLive(true)}>{t("Live")}</button>
      </div>
      </div>
      <p class="hint" class:on-screen={!clickLive && programLive && programSource.startsWith(`song:${selected.id}:`)}>
        {#if clickLive}<b>{t("Live:")}</b> {t("a part you click, or reach with the arrow keys, shows on the screen at once.")}
        {:else if programLive && programSource.startsWith(`song:${selected.id}:`)}<span class="dot"></span><b>{t("On the screen.")}</b> {t("Click a part, or use the arrow keys, to change it. Option-click to preview only.")}
        {:else}{t("Click a part for Preview, double-click to show it. Once it is on the screen, the next click changes the screen.")}{/if}
        <span class="keys-hint">{t("Keys: 1–9 a part · Shift+V verse · Shift+C chorus · Shift+B bridge")}</span>
      </p>
      <div class="sections">
        {#each selected.sections as section, n (section.id)}
          {@const isLive = partLive(selected.id, section.id)}
          {@const screens = session.songScreens(section)}
          {@const onThis = onPreview?.songId === selected.id && onPreview.sectionId === section.id}
          {@const heardHere = detected?.songId === selected.id && detected.sectionId === section.id}
          {#snippet partLabel()}
            <span class="label">
              <i>{n + 1}</i>{section.label}
              <span class="tags">
                {#if heardHere}<em class="badge heard">{t("Heard")}</em>{/if}
                {#if isLive}<em class="badge live">{t("Live")}</em>{/if}
                {#if onThis}<em class="badge">{t("Preview")}</em>{/if}
              </span>
            </span>
          {/snippet}
          {#if screens.length > 1}
            <!-- Line by line: the part's screens, each one clickable. -->
            <div class="section split" style:--tone="var(--sec-{sectionTone(section)})" class:live={isLive} class:on={onThis} class:heard={heardHere}>
              {@render partLabel()}
              {#each screens as screen, k (k)}
                <button
                  type="button"
                  class="screen"
                  class:on={screenOnPreview(selected.id, section.id, k)}
                  class:live={screenLive(selected.id, section.id, k)}
                  aria-label={t("{label}, lines {n} of {total}", { label: section.label, n: k + 1, total: screens.length })}
                  onclick={(event) => show(selected, section.id, event, undefined, k)}
                  ondblclick={() => void showAndTake(selected, section.id, undefined, k)}
                >
                  {#each section.lines.slice(screen.from, screen.to).filter((line) => line.trim()) as line, l (l)}<span class="line">{line}</span>{/each}
                </button>
              {/each}
            </div>
          {:else}
            <button
              type="button"
              class="section"
              style:--tone="var(--sec-{sectionTone(section)})"
              class:live={isLive}
              class:on={onThis}
              class:heard={heardHere}
              onclick={(event) => show(selected, section.id, event)}
              ondblclick={() => void showAndTake(selected, section.id)}
            >
              {@render partLabel()}
              {#each section.lines.filter((line) => line.trim()) as line, l (l)}<span class="line">{line}</span>{/each}
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="blank">
        <Icon name="note" size={28} />
        <p>{t("Pick a song from the library, or create one.")}</p>
        <button type="button" class="desk-btn" onclick={newSong}><Icon name="plus" size={14} /> {t("New song")}</button>
      </div>
    {/if}
  </div>

  <!-- Monitors and detection -->
  {#if finding}
    <SongFinder {clickLive} onclose={() => (finding = false)} onopen={(id) => { if (leaveDraft()) selectedId = id; }} />
  {/if}

  <aside class="stage">
    <MonitorPair page="songs" place={session.songPlace()} onstep={(direction) => session.stepSong(direction)} />

    <section class="listen-card" class:on={listening} aria-label={t("Listen for songs")}>
      <header>
        <span class="lc-title"><Icon name="mic" size={15} /> {t("Listen for songs")}</span>
        <span class="lc-state" class:on={listening}>{session.voice.status === "starting" ? t("Starting…") : listening ? t("Listening") : t("Off")}</span>
      </header>
      {#if !listening}
        <p class="lc-lede">{t("Church Studio listens to the singing and finds the song and part in your library. Nothing reaches the screen unless you choose.")}</p>
        <button type="button" class="desk-btn primary-soft lc-start" onclick={() => void session.toggleVoice()}><Icon name="mic" size={15} /> {t("Start listening")}</button>
      {:else}
        <div class="lc-level" aria-hidden="true">
          {#each Array.from({ length: 18 }) as _, bar (bar)}<i class:lit={bar < Math.round(session.voice.level * 18)}></i>{/each}
        </div>
        <p class="lc-heard">{heard ? `“${heard}”` : t("Sing or say a line from a song…")}</p>
        {#if detected}
          {@const song = session.songs.find((entry) => entry.id === detected?.songId)}
          {@const part = song?.sections.find((section) => section.id === detected?.sectionId)}
          {#if song && part}
            <div class="lc-match" style:--tone="var(--sec-{sectionTone(part)})">
              <small>{t("Sounds like")}</small>
              <strong>{song.title}</strong>
              <span class="lc-part"><b>{sectionShort(part)}</b>{part.label}</span>
              <div class="lc-actions">
                <button type="button" class="desk-btn" onclick={() => { selectedId = song.id; }}>{t("Open")}</button>
                <button type="button" class="desk-btn {clickLive ? 'live' : 'primary-soft'}" onclick={showDetected}>{clickLive ? t("Show it") : t("Preview")}</button>
              </div>
            </div>
          {/if}
        {/if}
        <button type="button" class="desk-btn ghost lc-stop" onclick={() => void session.toggleVoice()}><Icon name="mic-off" size={14} /> {t("Stop listening")}</button>
      {/if}
      <label class="lc-follow">
        <span>
          {t("Follow the singing")}
          <small>{follow && clickLive ? t("Each part heard goes straight to the screen (Live mode).") : t("Each part heard goes to Preview by itself.")}</small>
        </span>
        <input type="checkbox" class="switch" role="switch" checked={follow} onchange={(event) => { if (event.currentTarget.checked && !session.requireFeature("song-detection")) { event.currentTarget.checked = false; return; } follow = event.currentTarget.checked; }} />
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
  input:not(.switch), textarea {
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    font: inherit;
  }
  input:not(.switch) { height: 32px; padding: 0 10px; min-width: 0; }
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
  .folders { display: flex; flex-direction: column; gap: 4px; padding: 0 10px 14px; max-height: 30%; overflow: auto; flex: none; }
  /* The ready-made lists never scroll away; only the folders below them scroll. */
  .folders.lists { max-height: none; overflow: visible; padding-bottom: 4px; }
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
  .folder.on :global(svg) { color: var(--accent-text); }
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
  .armed { color: var(--live-text) !important; background: color-mix(in srgb, var(--live) 15%, transparent) !important; }
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
  :global(.menu .danger-item) { color: var(--live-text) !important; }
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
  .song-scroll { position: relative; flex: 1; min-height: 0; display: flex; }
  .songs { flex: 1; list-style: none; margin: 0; padding: 4px 10px 14px; overflow: auto; display: flex; flex-direction: column; gap: 2px; min-height: 0; scroll-padding-top: 4px; }
  .letter { position: sticky; top: -4px; z-index: 2; margin-top: 6px; padding: 4px 6px; font-size: 11px; font-weight: 800; color: var(--muted); background: var(--panel); }
  .more { padding: 10px; font-size: 12px; color: var(--muted); text-align: center; }
  .letters { flex: none; display: flex; flex-direction: column; justify-content: center; gap: 0; padding: 4px 4px 14px 0; overflow: auto; }
  .letters button { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--muted); font: inherit; font-size: 10px; font-weight: 700; line-height: 1; }
  .letters button:hover { color: var(--accent-text); background: var(--field); }
  .list-tools { display: flex; gap: 6px; padding: 0 10px 6px; flex: none; }
  .list-filter { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--muted); }
  .list-filter:focus-within { border-color: var(--accent); }
  .list-filter input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; outline: none; }
  .list-sort { flex: none; max-width: 120px; height: 30px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .fold-head { display: flex; align-items: center; gap: 6px; margin: 0 10px 6px; padding: 4px 6px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 700; text-align: left; flex: none; }
  .fold-head:hover { color: var(--ink); background: var(--field); }
  .fold-head em { margin-left: auto; font-style: normal; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 7px 10px;
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
  .empty .starter { display: grid; gap: 4px; justify-items: start; margin-top: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .empty .starter strong { color: var(--ink); font-size: 13px; }
  .empty .starter span { line-height: 1.45; }
  .empty .starter .import { margin-top: 4px; }
  .badge {
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent-text);
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .badge.live { background: color-mix(in srgb, var(--live) 22%, transparent); color: var(--live-text); }
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
  .keys-hint { display: block; margin-top: 2px; font-size: 11px; opacity: 0.8; }
  .transpose .key { padding: 0 6px; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hint.on-screen { color: var(--ink); }
  .hint.on-screen b { color: var(--live-text); }
  .hint .dot { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--live); vertical-align: 1px; }
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
  /* Line by line: a part's screens, stacked inside it. */
  .section.split { gap: 6px; }
  .section.split .screen { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .section.split .screen:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .section.split .screen.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .section.split .screen.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
  .section.split .screen .line { font-size: 13px; }
  .blank { flex: 1; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; }
  .blank p { margin: 0; }

  /* Editor */
  .editor { display: flex; flex-direction: column; gap: 10px; }
  .fields { display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 8px; }
  .fields .wide { grid-column: span 2; }
  .fields select { min-width: 0; height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  .credit { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
  .paste { display: flex; flex-direction: column; gap: 8px; }
  .paste summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .paste textarea { width: 100%; margin: 8px 0; }
  .edit-section { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); }
  .edit-section-head::before { content: ""; align-self: center; flex: none; width: 8px; height: 8px; margin: 0 2px 0 4px; border-radius: 50%; background: var(--tone, var(--muted)); order: 1; }
  .edit-section-head > :global(.grip) { order: 0; }
  .edit-section-head > :global(input) { order: 2; }
  .edit-section-head > :global(.del) { order: 3; }
  .langs { display: grid; gap: 8px; }
  .langs.two { grid-template-columns: 1fr 1fr; }
  .langs .second { display: grid; gap: 4px; }
  .langs .second span { font-size: 11px; font-weight: 650; color: var(--muted); }
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
  .lc-follow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 55%, transparent); font-size: 13px; font-weight: 650; cursor: pointer; }
  .lc-follow:has(input:checked) { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .lc-follow small { display: block; margin-top: 3px; font-size: 11px; font-weight: 500; line-height: 1.35; color: var(--muted); }

  /* Find a song */
  .find-song { display: flex; align-items: center; gap: 8px; height: 36px; margin: 0 14px 10px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; flex: none; }
  .find-song:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 28%, var(--line)); }
  .find-song span { flex: 1; text-align: left; }
  .find-song kbd { padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; }
  .sub-group { margin: 6px 0 0; padding-bottom: 4px; }
  @media (max-width: 1280px) {
    .song-desk { grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px); }
    .fields { grid-template-columns: 1fr 1fr; }
  }
  .order-edit { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--field) 60%, transparent); }
  .order-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .order-head .muted { font-size: 12px; flex: 1; min-width: 160px; }
  .order-tools { display: inline-flex; gap: 6px; }
  .order-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .order-chip { display: inline-flex; align-items: center; height: 28px; border-radius: 7px; border: 1px solid color-mix(in srgb, var(--tone) 55%, var(--line)); background: color-mix(in srgb, var(--tone) 18%, var(--field)); cursor: grab; }
  .order-chip.dragging { opacity: 0.4; }
  .order-name { height: 100%; padding: 0 4px 0 9px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: inherit; }
  .order-x { height: 100%; width: 22px; border: 0; background: none; color: var(--muted); display: grid; place-items: center; border-radius: 0 7px 7px 0; }
  .order-x:hover { color: var(--ink); }
  .order-add { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .order-add .muted { font-size: 12px; }
  .order-add-btn { height: 24px; padding: 0 8px; border-radius: 6px; border: 1px dashed color-mix(in srgb, var(--tone) 60%, var(--line)); background: none; color: var(--ink); font: inherit; font-size: 12px; }
  .order-add-btn:hover { background: color-mix(in srgb, var(--tone) 14%, transparent); }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--field); }
  .edit-section.dragging { opacity: 0.4; }
  .edit-section.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .desk-btn.del:hover { color: var(--danger, #e5484d); }
</style>
