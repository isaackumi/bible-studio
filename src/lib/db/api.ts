import { isOnlineTranslation, onlineChapter, onlinePassage, onlineTranslations, WORDS_TRANSLATION } from "../bible/online-bibles";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cleanVerse } from "../bible/clean";
import { BUNDLED_TRANSLATIONS, bundledBooks, bundledChapter, bundledPassage, bundledSearch, browserInstalledBibles, browserInstallBible, browserRemoveBible } from "../bible/texts";
import { browserMedia } from "../platform/browser-media";
import { browserLibrary } from "../platform/browser-store";
import type { LibrarySnapshot } from "../platform/library";
import { isDesktop } from "../platform/runtime";
import type {
  BookInfo,
  MediaAsset,
  OutputStatus,
  ProgramPacket,
  SearchHit,
  Service,
  Sermon,
  Song,
  Theme,
  TranslationInfo,
  VerseText,
  Workspace,
} from "../domain/types";

function desktop(): boolean {
  return isDesktop();
}

const cleanRows = (rows: VerseText[]) => rows.map((row) => ({ ...row, text: cleanVerse(row.text) }));

export const api = {
  outputStatus: () => invoke<OutputStatus>("output_status"),
  openAudience: () => invoke<OutputStatus>("open_audience"),
  closeAudience: () => invoke<OutputStatus>("close_audience"),
  setOutput: (enabled: boolean, mode: "window" | "fullscreen") => invoke<OutputStatus>("set_output", { enabled, mode }),
  refreshDisplays: () => invoke<OutputStatus>("refresh_displays"),
  testOutput: () => invoke<void>("test_output"),
  assignAudience: (displayKey: string | null) => invoke<OutputStatus>("assign_audience", { displayKey }),
  assignOperator: (displayKey: string | null) => invoke<OutputStatus>("assign_operator", { displayKey }),
  publishProgram: (frame: ProgramPacket) => (desktop() ? invoke<void>("publish_program", { frame }) : Promise.resolve()),
  getProgram: () => invoke<ProgramPacket>("get_program"),
  workspaceLoad: () => invoke<Workspace | null>("workspace_load"),
  workspaceSave: (document: Workspace) => invoke<void>("workspace_save", { document }),
  themeList: () => (desktop() ? invoke<Theme[]>("theme_list") : browserLibrary.themes()),
  themeSave: (document: Theme) => (desktop() ? invoke<void>("theme_save", { document }) : browserLibrary.saveTheme(document)),
  themeDelete: (id: string) => (desktop() ? invoke<void>("theme_delete", { id }) : browserLibrary.deleteTheme(id)),
  songList: () => (desktop() ? invoke<Song[]>("song_list") : browserLibrary.songs()),
  songSearch: async (query: string) => {
    if (desktop()) return invoke<Song[]>("song_search", { query });
    const needle = query.trim().toLowerCase();
    const songs = await browserLibrary.songs();
    return songs.filter((song) =>
      `${song.title} ${song.author} ${song.sections.map((section) => section.lines.join(" ")).join(" ")}`.toLowerCase().includes(needle),
    );
  },
  songSave: (document: Song) => (desktop() ? invoke<void>("song_save", { document }) : browserLibrary.saveSong(document)),
  songDelete: (id: string) => (desktop() ? invoke<void>("song_delete", { id }) : browserLibrary.deleteSong(id)),
  sermonList: () => (desktop() ? invoke<Sermon[]>("sermon_list") : browserLibrary.sermons()),
  sermonSave: (document: Sermon) =>
    desktop() ? invoke<void>("sermon_save", { document }) : browserLibrary.saveSermon(document),
  sermonDelete: (id: string) => (desktop() ? invoke<void>("sermon_delete", { id }) : browserLibrary.deleteSermon(id)),
  serviceList: async () => {
    if (desktop()) return invoke<Array<{ id: string; name: string; updatedAt: string }>>("service_list");
    const services = await browserLibrary.services();
    return services.map((service) => ({ id: service.id, name: service.name, updatedAt: service.updatedAt }));
  },
  serviceGet: (id: string) => (desktop() ? invoke<Service | null>("service_get", { id }) : browserLibrary.getService(id)),
  serviceSave: (document: Service) => (desktop() ? invoke<void>("service_save", { document }) : browserLibrary.saveService(document)),
  importSnapshot: (snapshot: LibrarySnapshot) =>
    desktop() ? invoke<void>("import_library", { snapshot }) : browserLibrary.importSnapshot(snapshot),
  mediaList: () => (desktop() ? invoke<MediaAsset[]>("media_list") : browserMedia.list()),
  /** In-memory image (for example a rendered PDF page). Desktop sends raw bytes to Rust. */
  importMediaBytes: async (name: string, blob: Blob): Promise<MediaAsset> => {
    if (desktop()) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return invoke<MediaAsset>("import_media_bytes", bytes, { headers: { "x-media-name": encodeURIComponent(name) } });
    }
    return api.importMedia(new File([blob], name, { type: blob.type || "image/png" }));
  },
  importMedia: (source: string | File) => {
    if (desktop()) {
      if (typeof source !== "string") return Promise.reject(new Error("Use the file picker to import an image."));
      return invoke<MediaAsset>("import_media", { path: source });
    }
    if (typeof source === "string") return Promise.reject(new Error("This browser import needs the image file, not a path."));
    return browserMedia.importFile(source);
  },
  translations: () =>
    (desktop()
      ? invoke<TranslationInfo[]>("bible_translations")
      : Promise.resolve(BUNDLED_TRANSLATIONS.filter((entry) => browserInstalledBibles().includes(entry.id)))
    ).then((bundled) => [...bundled, ...onlineTranslations()]),
  bibleInstall: (id: string) => (desktop() ? invoke<void>("bible_install", { id }) : browserInstallBible(id)),
  bibleRemove: (id: string) => (desktop() ? invoke<void>("bible_remove", { id }) : Promise.resolve(browserRemoveBible(id))),
  books: (translationId: string): Promise<BookInfo[]> =>
    isOnlineTranslation(translationId)
      ? api.books(WORDS_TRANSLATION)
      : desktop()
      ? invoke<BookInfo[]>("bible_books", { translationId })
      : Promise.resolve(BUNDLED_TRANSLATIONS.some((entry) => entry.id === translationId) ? bundledBooks() : []),
  // Desktop databases seeded before the text cleanup still hold the old text; tidy it as it is read.
  verses: (translationId: string, bookOrd: number, chapter: number): Promise<VerseText[]> =>
    isOnlineTranslation(translationId)
      ? onlineChapter(translationId, bookOrd, chapter)
      : desktop()
      ? invoke<VerseText[]>("bible_verses", { translationId, bookOrd, chapter }).then(cleanRows)
      : bundledChapter(translationId, bookOrd, chapter),
  passage: (translationId: string, bookOrd: number, chapter: number, startVerse: number, endVerse: number): Promise<VerseText[]> =>
    isOnlineTranslation(translationId)
      ? onlinePassage(translationId, bookOrd, chapter, startVerse, endVerse)
      : desktop()
      ? invoke<VerseText[]>("bible_passage", { translationId, bookOrd, chapter, startVerse, endVerse }).then(cleanRows)
      : bundledPassage(translationId, bookOrd, chapter, startVerse, endVerse),
  // Licensed text is not stored, so search reads the bundled words; the hit opens in the chosen translation.
  search: (translationId: string, query: string): Promise<SearchHit[]> =>
    isOnlineTranslation(translationId)
      ? api.search(WORDS_TRANSLATION, query)
      : desktop()
      ? invoke<SearchHit[]>("bible_search", { translationId, query }).then((hits) => hits.map((hit) => ({ ...hit, text: cleanVerse(hit.text) })))
      : bundledSearch(translationId, query),
  /** Planning Center requests: through the desktop app (the API refuses web pages). */
  pcoGet: async (url: string, authorization: string): Promise<unknown> => {
    if (!desktop()) throw new Error("Planning Center import works in the desktop app.");
    return JSON.parse(await invoke<string>("pco_get", { url, authorization }));
  },
  startRemoteLan: () =>
    desktop()
      ? invoke<RemoteLanStatus>("start_remote_lan")
      : Promise.resolve<RemoteLanStatus>({ listening: false, url: "", port: 17891, error: "" }),
  remoteLanStatus: () =>
    desktop()
      ? invoke<RemoteLanStatus>("remote_lan_status")
      : Promise.resolve<RemoteLanStatus>({ listening: false, url: "", port: 17891, error: "" }),
  stopRemoteLan: () => (desktop() ? invoke<void>("stop_remote_lan") : Promise.resolve()),
  remoteReply: (id: string, envelope: unknown) =>
    desktop() ? invoke<void>("remote_reply", { id, envelope }) : Promise.resolve(),
};

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return convertFileSrc(path);
}

export function mediaUrl(asset: MediaAsset | null | undefined): string | null {
  if (!asset) return null;
  if (isDesktop()) return assetUrl(asset.path);
  return browserMedia.url(asset.id);
}

export type RemoteLanStatus = { listening: boolean; url: string; port: number; error?: string };
