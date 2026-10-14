import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { KJV, kjvBooks, kjvChapter, kjvPassage, kjvSearch } from "../bible/kjv";
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
  serviceList: async () => {
    if (desktop()) return invoke<Array<{ id: string; name: string; updatedAt: string }>>("service_list");
    const services = await browserLibrary.services();
    return services.map((service) => ({ id: service.id, name: service.name, updatedAt: service.updatedAt }));
  },
  serviceGet: (id: string) => (desktop() ? invoke<Service | null>("service_get", { id }) : browserLibrary.getService(id)),
  serviceSave: (document: Service) => (desktop() ? invoke<void>("service_save", { document }) : browserLibrary.saveService(document)),
  importSnapshot: (snapshot: LibrarySnapshot) =>
    desktop() ? invoke<void>("import_library", { snapshot }) : browserLibrary.importSnapshot(snapshot),
  mediaList: () => invoke<MediaAsset[]>("media_list"),
  importMedia: (path: string) => invoke<MediaAsset>("import_media", { path }),
  translations: () => (desktop() ? invoke<TranslationInfo[]>("bible_translations") : Promise.resolve([KJV])),
  books: (translationId: string) =>
    desktop() ? invoke<BookInfo[]>("bible_books", { translationId }) : Promise.resolve(translationId === "kjv" ? kjvBooks() : []),
  verses: (translationId: string, bookOrd: number, chapter: number) =>
    desktop()
      ? invoke<VerseText[]>("bible_verses", { translationId, bookOrd, chapter })
      : translationId === "kjv"
        ? kjvChapter(bookOrd, chapter)
        : Promise.resolve([]),
  passage: (translationId: string, bookOrd: number, chapter: number, startVerse: number, endVerse: number) =>
    desktop()
      ? invoke<VerseText[]>("bible_passage", { translationId, bookOrd, chapter, startVerse, endVerse })
      : translationId === "kjv"
        ? kjvPassage(bookOrd, chapter, startVerse, endVerse)
        : Promise.resolve([]),
  search: (translationId: string, query: string) =>
    desktop() ? invoke<SearchHit[]>("bible_search", { translationId, query }) : translationId === "kjv" ? kjvSearch(query) : Promise.resolve([]),
};

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return convertFileSrc(path);
}
