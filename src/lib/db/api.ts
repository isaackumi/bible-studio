import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { BUNDLED_TRANSLATIONS, bundledBooks, bundledChapter, bundledPassage, bundledSearch } from "../bible/texts";
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
  importMedia: (source: string | File) => {
    if (desktop()) {
      if (typeof source !== "string") return Promise.reject(new Error("Use the file picker to import an image."));
      return invoke<MediaAsset>("import_media", { path: source });
    }
    if (typeof source === "string") return Promise.reject(new Error("This browser import needs the image file, not a path."));
    return browserMedia.importFile(source);
  },
  translations: () => (desktop() ? invoke<TranslationInfo[]>("bible_translations") : Promise.resolve(BUNDLED_TRANSLATIONS)),
  books: (translationId: string) =>
    desktop()
      ? invoke<BookInfo[]>("bible_books", { translationId })
      : Promise.resolve(BUNDLED_TRANSLATIONS.some((entry) => entry.id === translationId) ? bundledBooks() : []),
  verses: (translationId: string, bookOrd: number, chapter: number) =>
    desktop() ? invoke<VerseText[]>("bible_verses", { translationId, bookOrd, chapter }) : bundledChapter(translationId, bookOrd, chapter),
  passage: (translationId: string, bookOrd: number, chapter: number, startVerse: number, endVerse: number) =>
    desktop()
      ? invoke<VerseText[]>("bible_passage", { translationId, bookOrd, chapter, startVerse, endVerse })
      : bundledPassage(translationId, bookOrd, chapter, startVerse, endVerse),
  search: (translationId: string, query: string) =>
    desktop() ? invoke<SearchHit[]>("bible_search", { translationId, query }) : bundledSearch(translationId, query),
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
