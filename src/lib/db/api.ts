import type { ImportedBible } from "../bible/import";
import { fitImage, isSvg } from "../platform/fit-image";
import { isOnlineTranslation, onlineChapter, onlinePassage, onlineTranslations, WORDS_TRANSLATION } from "../bible/online-bibles";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cleanVerse } from "../bible/clean";
import { BUNDLED_TRANSLATIONS, bundledBooks, bundledChapter, bundledPassage, bundledSearch, browserInstalledBibles, browserInstallBible, browserRemoveBible } from "../bible/texts";
import { browserMedia } from "../platform/browser-media";
import { browserLibrary } from "../platform/browser-store";
import { serviceSummary, type ServiceSummary } from "../domain/service";
import type { LibrarySnapshot } from "../platform/library";
import { isDesktop } from "../platform/runtime";
import { webDevice, webEntitlement } from "../platform/web-entitlement";
import type { EntitlementStatus } from "../domain/billing";
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

/**
 * A picture chosen by path on the desktop is copied in as it is; when it is larger than a screen
 * needs, it is replaced by a right-sized copy (fit-image.ts), so the screens never decode the original.
 */
async function shrinkImported(asset: MediaAsset): Promise<MediaAsset> {
  if (asset.kind !== "image") return asset;
  try {
    const url = mediaUrl(asset);
    if (!url) return asset;
    const original = await (await fetch(url)).blob();
    const fit = await fitImage(original, asset.name);
    if (!fit.resized) return asset;
    const smaller = await api.importMediaBytes(asset.name, fit.blob);
    await api.mediaDelete(asset.id).catch(() => {});
    return smaller;
  } catch {
    // Kept as it came: it still shows, only heavier.
    return asset;
  }
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
  // The plan, decided by the native core from server-signed leases (src-tauri/src/entitlement.rs).
  entitlementStatus: (): Promise<EntitlementStatus> => (isDesktop() ? invoke<EntitlementStatus>("entitlement_status") : webEntitlement.status()),
  entitlementSet: (token: string): Promise<EntitlementStatus> => (isDesktop() ? invoke<EntitlementStatus>("entitlement_set", { token }) : webEntitlement.set(token)),
  entitlementNoteTime: (at: number): Promise<EntitlementStatus> => (isDesktop() ? invoke<EntitlementStatus>("entitlement_note_time", { at }) : webEntitlement.noteTime(at)),
  entitlementClear: (): Promise<EntitlementStatus> => (isDesktop() ? invoke<EntitlementStatus>("entitlement_clear") : webEntitlement.clear()),
  entitlementDevice: async (): Promise<string> => (isDesktop() ? (await invoke<{ device: string }>("entitlement_device")).device : webDevice()),
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
    if (desktop()) return invoke<ServiceSummary[]>("service_list");
    const services = await browserLibrary.services();
    return services.map(serviceSummary);
  },
  serviceGet: (id: string) => (desktop() ? invoke<Service | null>("service_get", { id }) : browserLibrary.getService(id)),
  serviceSave: (document: Service) => (desktop() ? invoke<void>("service_save", { document }) : browserLibrary.saveService(document)),
  serviceDelete: (id: string) => (desktop() ? invoke<void>("service_delete", { id }) : browserLibrary.deleteService(id)),
  importSnapshot: (snapshot: LibrarySnapshot) =>
    desktop() ? invoke<void>("import_library", { snapshot }) : browserLibrary.importSnapshot(snapshot),
  mediaList: () => (desktop() ? invoke<MediaAsset[]>("media_list") : browserMedia.list()),
  mediaDelete: (id: string) => (desktop() ? invoke<void>("media_delete", { id }) : browserMedia.remove(id)),
  /** In-memory image (for example a rendered PDF page). Desktop sends raw bytes to Rust. */
  importMediaBytes: async (name: string, blob: Blob): Promise<MediaAsset> => {
    // Pictures come in at a size a screen can use (fit-image.ts); an SVG becomes a sharp PNG.
    const fit = await fitImage(blob, name).catch(() => ({ blob, name, resized: false }));
    if (desktop()) {
      const bytes = new Uint8Array(await fit.blob.arrayBuffer());
      return invoke<MediaAsset>("import_media_bytes", bytes, { headers: { "x-media-name": encodeURIComponent(fit.name) } });
    }
    return browserMedia.importFile(new File([fit.blob], fit.name, { type: fit.blob.type || "image/png" }));
  },
  importMedia: (source: string | File) => {
    if (desktop()) {
      // A picture handed over as a file (a browser file input, a drop) goes in as bytes; videos
      // are too large for that and come by path from the system picker.
      if (typeof source !== "string") {
        if (source.type.startsWith("image/") || isSvg(source, source.name)) return api.importMediaBytes(source.name, source);
        return Promise.reject(new Error("Use Import… to choose the file from this computer."));
      }
      // A file already in Media comes back as it is: never shrunk again, so it is never replaced.
      return invoke<MediaAsset>("import_media", { path: source }).then((asset) => (asset.existing ? asset : shrinkImported(asset)));
    }
    if (typeof source === "string") return Promise.reject(new Error("This browser import needs the image file, not a path."));
    if (source.type.startsWith("image/") || isSvg(source, source.name)) return api.importMediaBytes(source.name, source);
    return browserMedia.importFile(source);
  },
  translations: () =>
    (desktop()
      ? invoke<TranslationInfo[]>("bible_translations")
      : Promise.resolve(BUNDLED_TRANSLATIONS.filter((entry) => browserInstalledBibles().includes(entry.id)))
    ).then((bundled) => [...bundled, ...onlineTranslations()]),
  bibleInstall: (id: string) => (desktop() ? invoke<void>("bible_install", { id }) : browserInstallBible(id)),
  bibleRemove: (id: string) => (desktop() ? invoke<void>("bible_remove", { id }) : Promise.resolve(browserRemoveBible(id))),
  /** Install a Bible read from a church's own file (desktop). Returns its id. */
  bibleImport: (bible: ImportedBible) => invoke<string>("bible_import", { bible }),
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
  /**
   * The church's own AI service. On the desktop the request goes out through Rust (no browser
   * limits on which services answer); in a browser it is sent from the page.
   */
  aiPost: async (request: { url: string; headers: Record<string, string>; body: string }): Promise<unknown> => {
    const text = desktop()
      ? await invoke<string>("ai_post", { url: request.url, headers: request.headers, body: request.body })
      : await fetch(request.url, { method: "POST", headers: request.headers, body: request.body }).then((response) => response.text());
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(text.trim().slice(0, 200) || "The AI service sent an empty reply.");
    }
  },
  /** The models the church's AI key can use (same route as aiPost). */
  aiGet: async (request: { url: string; headers: Record<string, string> }): Promise<unknown> => {
    const text = desktop()
      ? await invoke<string>("ai_get", { url: request.url, headers: request.headers })
      : await fetch(request.url, { headers: request.headers }).then((response) => response.text());
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(text.trim().slice(0, 200) || "The AI service sent an empty reply.");
    }
  },
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
