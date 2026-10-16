import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { stepVerse } from "../bible/passage";
import { CANON, formatReference, parseReference, withChapterCounts, type CanonBook } from "../bible/reference";
import type { CommandId } from "../commands/registry";
import { api, mediaUrl } from "../db/api";
import { claimOwner, controlsOutput, publishLocal, publishStageLocal, publishStandbyLocal, readOwner, type StageSnapshot } from "../display/channel";
import {
  browserAudienceState,
  openBrowserAudience,
  pickAudienceScreen,
  pickStageDisplay,
  pickStageScreen,
  placementFeatures,
  type ScreenLike,
} from "../display/output";
import { deleteProfile, duplicateProfile, renameProfile } from "../display/profiles";
import {
  createScene,
  persistLook,
  presentComposition,
  presentSavedLook,
  previewComposition,
  queueLook,
  removeLayer,
  removeLook,
  restoreComposition,
  sanitizeComposition,
  setCompositionLocked,
  takeTransitionForPreview,
  type Composition,
  type SourceRef,
} from "../domain/composition";
import {
  addSharedLayer,
  createSharedSource,
  linkLayer,
  lockedLooksUsing,
  pruneSharedSources,
  sanitizeSharedSource,
  syncLinkedEdits,
  updateSharedSource,
  withMediaUrls,
  type SharedSource,
  type SourceFields,
} from "../domain/sources";
import { applyProgramAction, createLiveState, frame, programPacket, replaceProgramModel, setPreview } from "../domain/live";
import { presentImageOrEmpty, presentLyrics, presentScripture, presentText, presentVideo } from "../domain/present";
import {
  cameraDeviceId,
  camerasIn,
  camerasNeeded,
  cameraSourceId,
  cameraUnavailableMessage,
  planFeeds,
  type CameraFeeds,
  listVideoInputs,
  openCamera,
  presentCamera,
  previewCameraLive,
  stopCameraStream,
  type CameraDevice,
} from "../domain/camera";
import { importDocument as parseImportedDocument } from "../domain/import-content";
import {
  approvePending,
  createPairing,
  declinePending,
  framePayload,
  pairingUrl,
  readRemoteEnvelope,
  REMOTE_LIVE_COMMANDS,
  remoteEnvelope,
  revokeDevice,
  routeRemote,
  type RemoteDevice,
  type RemoteEnvelope,
  type RemoteGate,
  type RemotePairing,
  type RemotePending,
} from "../domain/remote";
import { serveRemote } from "../remote/channel";
import { randomCode, randomToken, sha256Hex } from "../remote/crypto";
import { findItem, moveInList, sectionIdForInsert, stepCursor } from "../domain/service";
import { deskNotes, sanitizeSermon, sermonAudienceItem, sermonError, stepSermonSection } from "../domain/sermon";
import { lyricsFor, sanitizeSong, sectionPlace, songError, stepSongSection } from "../domain/song";
import { recentSongHits, rememberSongRecent, searchSongHits, type SongHit, type SongRecent } from "../domain/song-search";
import { blackModel, defaultTheme, defaultWorkspace, emptyModel, logoModel, mergeFactoryThemes, sanitizeTheme } from "../domain/theme";
import { defaultPewDesk, normalizePew, samePew } from "../workspace/pew";
import { defaultProductionLayout, normalizeProductionLayout, sameProductionLayout } from "../workspace/production";
import type {
  AppearanceSettings,
  PewDeskState,
  ProductionLayout,
  BibleItem,
  Cursor,
  DisplayAssignment,
  FloatGeometry,
  LiveState,
  MediaAsset,
  OutputStatus,
  PanelId,
  PresentationItem,
  PresentationModel,
  RegionId,
  Sermon,
  Service,
  Song,
  Theme,
  TranslationInfo,
  Workspace,
  WorkspaceLayout,
  VoiceSettings,
} from "../domain/types";
import { canUse } from "../platform/capabilities";
import { styleModel } from "../domain/text-style";
import { dataUrlToBlob, exportThemePackage, readThemePackage, themePackageFileName } from "../domain/theme-package";
import { controlTimers, timersIn, type TimerAction } from "../domain/timer";
import {
  parseVoiceCommand,
  sanitizeVoiceSettings,
  voiceCommandLabel,
  type CustomVoiceCommand,
  type VoiceCommand,
} from "../voice/commands";
import {
  openPrivacySettings,
  prepareListening,
  startListening,
  startNativeListening,
  type ListenErrorKind,
} from "../voice/listen";
import { parseLibrarySnapshot } from "../platform/library";
import { isDesktop } from "../platform/runtime";
import { normalizeWorkspace, sanitizeAccent } from "../workspace/document";
import {
  activateTab,
  collapsePanel,
  deleteLayout,
  dockPanel,
  duplicateLayout,
  hidePanel,
  movePanel,
  placeFloating,
  renameLayout,
  resetLayout,
  resizeLayout,
  restoreBuiltinLayouts,
  showPanel,
} from "../workspace/layout";

function uid(): string {
  return crypto.randomUUID();
}

function stamp(service: Service): Service {
  return { ...service, updatedAt: new Date().toISOString() };
}

function browserSessionId(): string {
  const key = "church-studio.session-id";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export type VoiceStatus = "idle" | "starting" | "listening" | "error" | "stopped";

export type VoiceState = {
  status: VoiceStatus;
  error: ListenErrorKind | null;
  message: string;
  /** Latest words heard (interim or final). */
  heard: string;
  /** True while the latest words are an interim guess. */
  hearing: boolean;
  level: number;
  command: { label: string; phrase: string; outcome: "executed" | "blocked" | "failed"; at: number } | null;
  /** Program-changing voice commands (take, cut, clear, black, logo). Off on every launch. */
  allowLive: boolean;
};

/** A desk can take voice library/scripture requests so its own panes stay in sync. */
export type VoiceDeskRequest =
  | { kind: "library"; tab: "bible" | "songs" }
  | { kind: "scripture"; query: string }
  | { kind: "translation"; id: string };

const IDLE_VOICE: VoiceState = {
  status: "idle",
  error: null,
  message: "",
  heard: "",
  hearing: false,
  level: 0,
  command: null,
  allowLive: false,
};

class Session {
  ready = $state(false);
  message = $state("Opening workspace");
  liveMode = $state(false);
  library: "bible" | "songs" | "slides" | "media" | "theme" | "sermon" = $state("bible");
  workspace = $state<Workspace>(defaultWorkspace());
  themes = $state<Theme[]>([defaultTheme()]);
  songs = $state<Song[]>([]);
  songFocus = $state<{ songId: string; sectionId: string } | null>(null);
  findOpen = $state(false);
  findQuery = $state("");
  findHits = $state<SongHit[]>([]);
  recentSongs = $state<SongRecent[]>([]);
  sermons = $state<Sermon[]>([]);
  sermonFocus = $state<{ sermonId: string; sectionId: string } | null>(null);
  media = $state<MediaAsset[]>([]);
  cameras = $state<CameraDevice[]>([]);
  voice = $state<VoiceState>({ ...IDLE_VOICE });
  private stopVoiceEngine: (() => void) | null = null;
  private voiceListeners = new Set<(text: string, final: boolean, alternatives: string[]) => void>();
  private voiceDesk: ((request: VoiceDeskRequest) => Promise<boolean> | boolean) | null = null;
  private lastVoiceCommand = { phrase: "", at: 0 };

  /** Open feeds by camera source id: one per camera Preview or Program paints. */
  cameraFeeds = $state.raw<CameraFeeds<MediaStream>>({});
  private openingFeeds = new Map<string, Promise<boolean>>();
  private standbySent = "";
  cameraNote = $state("");
  /** Last look put on Preview (saved or draft). Used so TAKE can read its transition before Save. */
  lookOnPreview = $state<Composition | null>(null);
  previewBible = $state<BibleItem | null>(null);
  services = $state<Array<{ id: string; name: string; updatedAt: string }>>([]);
  service = $state<Service | null>(null);
  cursor = $state<Cursor>({ sectionId: null, itemId: null });
  #live = $state<LiveState>(createLiveState(defaultTheme()));
  get live(): LiveState {
    return this.#live;
  }
  /** Every Preview/Program write keeps camera feeds and the audience standby list in step. */
  set live(next: LiveState) {
    this.#live = next;
    void this.syncCameraFeeds();
    this.publishStandby();
    this.publishStage();
  }
  output = $state<OutputStatus>({
    desired: false,
    online: false,
    displayName: "",
    message: "Audience output is closed.",
    audienceKey: null,
    operatorKey: null,
    displays: [],
    mode: "window",
  });
  settingsOpen = $state(false);
  settingsSection = $state("appearance");
  remotePairing = $state<RemotePairing | null>(null);
  /** Phones waiting for the operator to allow or decline them. */
  remotePending = $state<RemotePending[]>([]);
  remoteLanUrl = $state("");
  remoteLanError = $state("");
  private remoteDevicesSaved = 0;
  translations = $state<TranslationInfo[]>([]);
  books = $state<CanonBook[]>(CANON);
  private selectToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private audienceWindow: { closed: boolean; close(): void; focus(): void; postMessage(message: unknown, targetOrigin: string): void } | null = null;
  private browserWatch: ReturnType<typeof setInterval> | undefined;
  private unlisten: UnlistenFn | undefined;
  private unlistenRemote: (() => void) | undefined;
  private unlistenLan: UnlistenFn | undefined;

  theme = (): Theme => this.themes.find((theme) => theme.id === this.workspace.themeId) ?? this.themes[0] ?? defaultTheme();

  logoTitle = (): string => this.workspace.churchName.trim() || this.workspace.logoText.trim() || "Church Studio";

  private desktop = () => isDesktop();
  private sessionId = "";
  private outputHeldClosed = false;
  controlsAudience = $state(true);
  audienceGeneration = 0;

  audienceLabel = (): string =>
    this.desktop()
      ? "This app sends to the audience."
      : this.controlsAudience
        ? "This window sends to the audience."
        : "Another window has the audience.";

  init = async () => {
    this.ready = true;
    const keepLive = this.live.revision > 0;
    const keepOutput = this.output.desired;
    try {
      if (this.desktop()) await this.loadLibraries();
      else {
        await this.loadBibleCatalog();
        await this.loadThemes();
        this.songs = await api.songList();
        this.sermons = await api.sermonList();
        this.media = await api.mediaList();
        this.services = await api.serviceList();
      }
      this.workspace = await this.loadWorkspace();
      if (keepOutput) this.rememberOutput({ outputEnabled: true });
      if (this.workspace.lastServiceId) {
        try {
          this.service = await api.serviceGet(this.workspace.lastServiceId);
        } catch (error) {
          console.error(error);
        }
      }
      if (this.desktop()) {
        try {
          await this.saveWorkspaceDocument(this.workspace);
        } catch (error) {
          console.error(error);
        }
        try {
          await this.applyDisplays();
        } catch (error) {
          console.error(error);
        }
      }
      if (!keepLive) {
        this.live = createLiveState(this.theme());
        this.cursor = this.workspace.cursor;
      }
      this.adoptAudienceOwner();
      // A restart restores the operator workspace and the preview cursor.
      // The owning session publishes an empty Program so a stored frame is not shown again.
      if (!keepLive && (this.desktop() || this.controlsAudience)) {
        try {
          await this.pushProgram();
        } catch (error) {
          console.error(error);
        }
      }
      if (!this.desktop() && !this.browserWatch) {
        this.browserWatch = setInterval(() => this.noteBrowserAudience(), 1000);
      }
      this.ready = true;
      this.listenRemote();
      if (this.desktop()) void this.attachLanRemote();
      if (this.message === "Opening workspace") {
        this.message = this.desktop() ? this.output.message : "Browser session. Audience output opens in its own window.";
      }
      if (!keepLive && this.cursor.itemId && this.service) await this.selectItem(this.cursor.itemId);
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      this.ready = true;
      this.listenRemote();
      if (this.desktop()) void this.attachLanRemote();
      console.error(error);
    }
  };

  private loadBibleCatalog = async () => {
    this.translations = await api.translations();
    const translationId = this.translations[0]?.id;
    if (translationId) this.books = withChapterCounts(await api.books(translationId));
  };

  private loadLibraries = async () => {
    this.output = await api.outputStatus();
    this.unlisten = await listen<OutputStatus>("output-status", (event) => {
      this.output = event.payload;
    });
    this.translations = await api.translations();
    const translationId = this.translations[0]?.id;
    if (translationId) {
      const rows = await api.books(translationId);
      this.books = withChapterCounts(rows);
    }
    await this.loadThemes();
    this.songs = await api.songList();
    this.sermons = await api.sermonList();
    this.media = await api.mediaList();
    this.services = await api.serviceList();
  };

  private loadThemes = async () => {
    const stored = (await api.themeList()).map(sanitizeTheme);
    const themes = mergeFactoryThemes(stored);
    this.themes = themes;
    await Promise.all(
      themes.filter((theme) => !stored.some((entry) => entry.id === theme.id)).map((theme) => api.themeSave(theme)),
    );
  };

  private loadWorkspace = async (): Promise<Workspace> => {
    if (!this.desktop()) {
      try {
        const raw = localStorage.getItem("church-studio.workspace");
        return normalizeWorkspace(raw ? JSON.parse(raw) : null);
      } catch {
        return defaultWorkspace();
      }
    }
    try {
      return normalizeWorkspace(await api.workspaceLoad());
    } catch (error) {
      console.error(error);
      this.message = "Workspace settings were unreadable. Defaults were restored.";
      return defaultWorkspace();
    }
  };

  private saveWorkspaceDocument = async (workspace: Workspace) => {
    if (!this.desktop()) {
      localStorage.setItem("church-studio.workspace", JSON.stringify(workspace));
      return;
    }
    await api.workspaceSave(workspace);
  };

  private applyDisplays = async () => {
    if (!this.desktop()) return;
    const profile = this.currentProfile();
    await api.assignOperator(profile.assignments.operator);
    await api.assignAudience(profile.assignments.audience);
    const mode = profile.outputMode;
    this.output = await api.setOutput(profile.outputEnabled || this.output.desired, mode);
    const external = this.output.displays.some((display) => !display.primary);
    if (!this.output.desired && external && !this.outputHeldClosed) {
      this.rememberOutput({ outputEnabled: true });
      this.output = await api.setOutput(true, mode);
    }
    if (this.output.desired && !this.output.online && external) {
      await api.assignAudience(null);
      this.output = await api.setOutput(true, mode);
    }
  };

  destroy = () => {
    this.unlisten?.();
    this.unlistenRemote?.();
    this.unlistenLan?.();
    this.releaseCameras();
    this.stopVoiceEngine?.();
    if (this.browserWatch) clearInterval(this.browserWatch);
  };

  private adoptAudienceOwner = () => {
    if (this.desktop()) {
      this.controlsAudience = true;
      return;
    }
    this.sessionId = browserSessionId();
    try {
      const owner = readOwner(localStorage) ?? claimOwner(localStorage, this.sessionId);
      this.audienceGeneration = owner.generation;
      this.controlsAudience = controlsOutput(owner, this.sessionId);
      if (!this.controlsAudience) this.message = "Another window has the audience. Take control before sending.";
    } catch (error) {
      this.controlsAudience = false;
      this.message = error instanceof Error ? error.message : "Audience control could not be read.";
    }
  };

  claimAudience = () => {
    if (this.desktop()) {
      this.controlsAudience = true;
      return;
    }
    try {
      const owner = claimOwner(localStorage, this.sessionId || browserSessionId());
      this.sessionId = owner.sessionId;
      this.audienceGeneration = owner.generation;
      this.controlsAudience = true;
      this.message = "This window can send to the audience. Take when you are ready.";
    } catch (error) {
      this.controlsAudience = false;
      this.message = error instanceof Error ? error.message : "Audience control could not be saved. Nothing was sent.";
    }
  };

  private looksForTake = () => {
    const draft = this.lookOnPreview;
    if (!draft) return this.workspace.compositions;
    return [draft, ...this.workspace.compositions.filter((entry) => entry.id !== draft.id)];
  };

  private pushProgram = async () => {
    const themeTransition = this.theme().transition;
    const lookTransition = takeTransitionForPreview(
      this.live.program.sourceId,
      this.looksForTake(),
      themeTransition,
    );
    const packet = {
      ...programPacket(this.live, lookTransition.ms),
      sessionId: this.sessionId,
      generation: this.audienceGeneration,
    };
    if (!this.desktop()) {
      if (!this.controlsAudience) {
        this.message = "This window is not sending to the audience.";
        return;
      }
      try {
        if (!publishLocal(packet)) this.message = "A newer audience update was kept.";
      } catch (error) {
        this.message = error instanceof Error ? error.message : "The audience could not be updated. Nothing new was sent.";
      }
      return;
    }
    try {
      await api.publishProgram(packet);
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The audience could not be updated.";
    }
  };

  private persistSoon = () => {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.persist();
    }, 250);
  };

  private persist = async () => {
    this.workspace = { ...this.workspace, cursor: this.cursor, lastServiceId: this.service?.id ?? null };
    try {
      await this.saveWorkspaceDocument(this.workspace);
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    }
    if (this.service) {
      this.service = stamp(this.service);
      try {
        await api.serviceSave(this.service);
        this.services = await api.serviceList();
      } catch (error) {
        this.message = error instanceof Error ? error.message : String(error);
      }
    }
  };

  /** One theme as a shareable file (with its background picture when it has one). */
  exportTheme = async (): Promise<{ fileName: string; json: string }> => {
    const theme = this.theme();
    let background: { name: string; dataUrl: string } | null = null;
    if (theme.background.type === "image") {
      const assetId = theme.background.assetId;
      const asset = this.media.find((entry) => entry.id === assetId);
      const url = mediaUrl(asset ?? null);
      if (asset && url) {
        const blob = await (await fetch(url)).blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error ?? new Error("The background picture could not be read."));
          reader.readAsDataURL(blob);
        });
        background = { name: asset.name, dataUrl };
      }
    }
    return { fileName: themePackageFileName(theme), json: JSON.stringify(exportThemePackage(theme, background), null, 2) };
  };

  /** Import a theme file as a new theme (never overwrites) and use it. */
  importTheme = async (text: string) => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("That file is not a Church Studio theme.");
    }
    const { theme, background } = readThemePackage(raw);
    let next = theme;
    if (background) {
      const asset = await api.importMediaBytes(background.name, dataUrlToBlob(background.dataUrl));
      this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
      next = { ...theme, background: { type: "image", assetId: asset.id } };
    }
    this.saveTheme(next);
    this.message = `${next.name} imported and in use. Program updates on the next LIVE.`;
  };

  exportLibrary = async () => {
    const songs = await api.songList();
    const summaries = await api.serviceList();
    const services: Service[] = [];
    for (const summary of summaries) {
      const service = await api.serviceGet(summary.id);
      if (service) services.push(service);
    }
    return {
      schemaVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      songs,
      services,
      themes: this.themes,
    };
  };

  importLibrary = async (payload: unknown) => {
    const snapshot = parseLibrarySnapshot(payload);
    await api.importSnapshot(snapshot);
    this.songs = await api.songList();
    this.services = await api.serviceList();
    if (snapshot.themes.length > 0) this.themes = await api.themeList();
    if (this.service) {
      const fresh = await api.serviceGet(this.service.id);
      if (fresh) this.service = fresh;
    }
    this.message = `Imported ${snapshot.songs.length} songs, ${snapshot.services.length} services, and ${snapshot.themes.length} themes. Program was not in the file.`;
  };

  importDocument = async (filename: string, text: string) => {
    const items = parseImportedDocument(filename, text);
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Imported");
    const target = this.cursor.sectionId ?? this.service?.sections[0]?.id;
    if (!target || !this.service) {
      this.message = "Add a section, then import.";
      return;
    }
    for (const item of items) this.insertItem(target, item);
    this.persistSoon();
    const first = items[0];
    if (first) await this.selectItem(first.id);
    this.message = `Imported ${items.length} slide${items.length === 1 ? "" : "s"} to Preview. LIVE still sends Program.`;
  };

  /** Each PDF page becomes an image slide in the service. Preview only; Program is untouched. */
  importPdf = async (file: File, onProgress?: (done: number, total: number) => void) => {
    const { renderPdfPages } = await import("../import/pdf");
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Slides");
    const target = this.cursor.sectionId ?? this.service?.sections[0]?.id;
    if (!target || !this.service) {
      this.message = "Add a section, then import.";
      return 0;
    }
    const items: PresentationItem[] = [];
    let total = 0;
    try {
      for await (const page of renderPdfPages(file)) {
        total = page.count;
        this.message = `Importing ${file.name}: page ${page.index + 1} of ${page.count}…`;
        onProgress?.(page.index, page.count);
        const asset = await api.importMediaBytes(page.name, page.blob);
        this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
        const title = page.count === 1 ? file.name.replace(/\.pdf$/i, "") : `${file.name.replace(/\.pdf$/i, "")} · ${page.index + 1}`;
        const item: PresentationItem = { id: uid(), kind: "image", title, image: { assetId: asset.id } };
        this.insertItem(target, item);
        items.push(item);
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : `${file.name} could not be imported.`;
      if (!items.length) return 0;
    }
    this.persistSoon();
    const first = items[0];
    if (first) await this.selectItem(first.id);
    const capped = total > items.length ? ` (first ${items.length} pages)` : "";
    this.message = `Imported ${items.length} slide${items.length === 1 ? "" : "s"} from ${file.name}${capped}. Preview only; LIVE sends Program.`;
    return items.length;
  };

  remotePageUrl = () => {
    if (this.remoteLanUrl) return this.remoteLanUrl;
    if (typeof location === "undefined") return "/?remote=1";
    const url = new URL(location.href);
    url.search = "?remote=1";
    url.hash = "";
    return url.toString();
  };

  get remoteDevices(): RemoteDevice[] {
    return this.workspace.remoteDevices ?? [];
  }

  /** The QR payload: LAN page + one-time pairing token. Empty until the LAN server is up. */
  remotePairingUrl = () => {
    const pairing = this.remotePairing;
    if (!pairing?.token || !this.remoteLanUrl) return "";
    const host = new URL(this.remoteLanUrl).hostname;
    return pairingUrl(host, pairing.token);
  };

  openRemotePairing = async () => {
    this.remotePairing = createPairing(Date.now(), randomCode(), randomToken(24));
    this.message = `Scan the QR code on the phone, or type code ${this.remotePairing.code}. You approve each phone here.`;
    if (this.desktop()) await this.attachLanRemote(true);
  };

  closeRemotePairing = () => {
    this.remotePairing = null;
    this.remotePending = [];
    this.message = "Pairing closed. Paired phones still work until you remove them.";
  };

  approveRemote = async (requestId: string) => {
    const token = randomToken();
    const gate = approvePending(this.remoteGate(), requestId, token, await sha256Hex(token), Date.now());
    this.applyRemoteGate(gate, true);
    const device = gate.devices.find((entry) => entry.id === requestId);
    this.message = `${device?.name ?? "Phone"} can control this desk. Take on the phone changes Program.`;
  };

  declineRemote = (requestId: string) => {
    this.applyRemoteGate(declinePending(this.remoteGate(), requestId), false);
    this.message = "Phone declined. It cannot control this desk.";
  };

  revokeRemote = (deviceId: string) => {
    const name = this.remoteDevices.find((device) => device.id === deviceId)?.name ?? "Phone";
    this.applyRemoteGate(revokeDevice(this.remoteGate(), deviceId), true);
    this.message = `${name} removed. It can no longer control this desk.`;
  };

  stopRemoteLan = async () => {
    this.closeRemotePairing();
    try {
      await api.stopRemoteLan();
    } catch (error) {
      console.error(error);
    }
    this.remoteLanUrl = "";
    this.message = "Phone remote server stopped.";
  };

  private remoteGate = (): RemoteGate => ({
    pairing: this.remotePairing,
    pending: this.remotePending,
    devices: this.remoteDevices,
  });

  /** Persist device changes; lastSeen alone is saved at most every five minutes. */
  private applyRemoteGate = (gate: RemoteGate, devicesChanged: boolean) => {
    this.remotePairing = gate.pairing;
    this.remotePending = gate.pending;
    const now = Date.now();
    const membership = (devices: RemoteDevice[]) => devices.map((device) => device.id + device.tokenHash).join("|");
    const changed = devicesChanged || membership(gate.devices) !== membership(this.remoteDevices);
    if (!changed && now - this.remoteDevicesSaved < 5 * 60 * 1000) {
      this.workspace.remoteDevices = gate.devices;
      return;
    }
    this.remoteDevicesSaved = now;
    this.workspace = { ...this.workspace, remoteDevices: gate.devices };
    this.persistSoon();
  };

  private listenRemote = () => {
    this.unlistenRemote?.();
    if (!canUse("remote-control")) return;
    this.unlistenRemote = serveRemote((envelope) => this.dispatchRemote(envelope));
  };

  private attachLanRemote = async (start = false) => {
    this.unlistenLan?.();
    try {
      this.unlistenLan = await listen<{ id: string; envelope: unknown }>("remote-in", (event) => {
        void (async () => {
          const parsed = readRemoteEnvelope(event.payload.envelope);
          const reply = parsed
            ? await this.dispatchRemote(parsed)
            : remoteEnvelope("denied", { reason: "This page is out of date. Reload it." });
          void api.remoteReply(event.payload.id, reply);
        })();
      });
      // Paired phones must reach the desk again after a restart.
      if (start || this.remotePairing || this.remoteDevices.length || this.remoteLanUrl) {
        let status = await api.startRemoteLan();
        for (let i = 0; i < 8 && !status.listening; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          status = await api.remoteLanStatus();
        }
        this.remoteLanUrl = status.listening ? status.url : "";
        this.remoteLanError = status.listening ? "" : status.error || "The phone remote server could not start.";
      }
    } catch (error) {
      console.error(error);
      this.remoteLanError = error instanceof Error ? error.message : String(error);
    }
  };

  private dispatchRemote = async (envelope: RemoteEnvelope): Promise<RemoteEnvelope> => {
    const token = envelope.payload.token;
    const routed = routeRemote(this.remoteGate(), envelope, {
      now: Date.now(),
      tokenHash: token ? await sha256Hex(token) : null,
      newId: () => crypto.randomUUID(),
      newSecret: () => randomToken(18),
    });
    const before = this.remoteDevices;
    this.applyRemoteGate(routed.gate, routed.gate.devices.length !== before.length);
    if (routed.reply.type === "pending" && envelope.type === "pair") {
      const request = routed.gate.pending.find((entry) => entry.id === routed.reply.payload.request);
      this.message = `${request?.name ?? "A phone"} wants to control this desk. Allow or decline it.`;
    }
    const action = routed.action;
    if (!action) return routed.reply;
    try {
      if (action.kind === "command") await this.runFromRemote(action.id);
      else if (action.kind === "preview-item") await this.selectItem(action.itemId);
      else if (action.kind === "preview-scene") {
        const saved = this.workspace.compositions.find((entry) => entry.id === action.sceneId);
        if (saved) this.previewLook(restoreComposition(saved));
      }
    } catch (error) {
      return remoteEnvelope("denied", { reason: error instanceof Error ? error.message : "The desk could not do that." });
    }
    return remoteEnvelope(action.kind === "command" ? "ack" : "state", this.remoteState(action.kind === "command" ? action.id : ""));
  };

  /** What a paired phone sees. Lists are JSON strings because envelope payloads are strings. */
  private remoteState = (done: string): Record<string, string> => {
    const service = this.service;
    const items = service
      ? service.sections.flatMap((section) =>
          section.items.map((item) => ({ id: item.id, title: item.title, kind: item.kind, section: section.name })),
        )
      : [];
    const scenes = this.workspace.compositions.map((entry) => ({ id: entry.id, name: entry.name }));
    return {
      ...framePayload("program", this.live.program.model),
      ...framePayload("preview", this.live.preview.model),
      done,
      desk: this.workspace.churchName || "Church Studio",
      output: this.output.online ? "on" : "off",
      cursor: this.cursor.itemId ?? "",
      scene: this.lookOnPreview?.id ?? "",
      items: JSON.stringify(items.slice(0, 200)),
      scenes: JSON.stringify(scenes.slice(0, 100)),
      live: REMOTE_LIVE_COMMANDS.join(","),
      timer: this.programTimerState,
    };
  };

  /** Next/Previous move Preview only (songs, sermon sections, verses, then the rundown). */
  private runFromRemote = async (command: CommandId) => {
    if (command === "next" || command === "previous") {
      const direction = command === "next" ? 1 : -1;
      if (this.sermonFocus && (await this.stepSermon(direction))) return;
      await this.step(direction);
      return;
    }
    await this.run(command);
  };

  private stepPreviewScripture = async (direction: 1 | -1): Promise<boolean> => {
    const current = this.previewBible;
    if (!current) return false;
    const book = this.books.find((entry) => entry.ord === current.bookOrd);
    if (!book) return false;
    const verses = await api.verses(current.translationId, current.bookOrd, current.chapter);
    const next = stepVerse(current, direction, book, verses.length);
    if (next) {
      await this.previewPassage(next);
      return true;
    }
    const nextChapter = current.chapter + direction;
    if (nextChapter < 1 || nextChapter > book.chapters) return false;
    const chapterVerses = await api.verses(current.translationId, current.bookOrd, nextChapter);
    const verse = direction > 0 ? 1 : chapterVerses.length;
    if (verse < 1) return false;
    await this.previewPassage({
      ...current,
      chapter: nextChapter,
      startVerse: verse,
      endVerse: verse,
      reference: formatReference(book.name, nextChapter, verse, verse, book.chapters),
    });
    return true;
  };

  private mediaSrc = (id: string | null | undefined) => mediaUrl(this.media.find((asset) => asset.id === id) ?? null);

  /** An item's own text style (slides, announcements) applies on top of the theme. */
  private async modelFor(item: PresentationItem): Promise<PresentationModel> {
    const model = await this.baseModelFor(item);
    return item.style ? styleModel(model, item.style) : model;
  }

  private async baseModelFor(item: PresentationItem): Promise<PresentationModel> {
    const theme = this.theme();
    const backgroundImageUrl = theme.background.type === "image" ? this.mediaSrc(theme.background.assetId) : null;
    if (item.kind === "bible" && item.bible) {
      const verses = await api.passage(
        item.bible.translationId,
        item.bible.bookOrd,
        item.bible.chapter,
        item.bible.startVerse,
        item.bible.endVerse,
      );
      const translation = this.translations.find((entry) => entry.id === item.bible?.translationId);
      return presentScripture({
        theme,
        backgroundImageUrl,
        reference: item.bible.reference,
        attribution: translation ? `${translation.name}` : null,
        verses,
      });
    }
    if (item.kind === "lyric" && item.lyric) {
      const song = this.songs.find((entry) => entry.id === item.lyric?.songId);
      const lyrics = lyricsFor(song, item.lyric.sectionId, item.title);
      return presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines });
    }
    if (item.kind === "image" && item.image) {
      return presentImageOrEmpty(theme, this.mediaSrc(item.image.assetId));
    }
    if (item.kind === "video" && item.video) {
      return presentVideo({ theme, videoUrl: this.mediaSrc(item.video.assetId), loop: item.video.loop, muted: item.video.muted });
    }
    if (item.kind === "composition" && item.composition) {
      const saved = this.workspace.compositions.find((entry) => entry.id === item.composition?.compositionId);
      if (!saved) return presentSavedLook(this.workspace.compositions, item.composition.compositionId, { theme, now: Date.now() });
      return presentComposition(withMediaUrls(restoreComposition(saved), this.mediaSrc), { theme, now: Date.now() });
    }
    const heading = item.slide?.heading ?? item.announcement?.heading ?? item.title;
    const body = item.slide?.body ?? item.announcement?.body ?? "";
    const slideImage = this.mediaSrc(item.slide?.imageId);
    return presentText({
      theme,
      layout: "title",
      heading,
      body,
      backgroundImageUrl: slideImage ?? backgroundImageUrl,
    });
  }

  selectItem = async (itemId: string) => {
    if (!this.service) return;
    const found = findItem(this.service, itemId);
    if (!found) return;
    const token = ++this.selectToken;
    this.songFocus = found.item.kind === "lyric" && found.item.lyric
      ? { songId: found.item.lyric.songId, sectionId: found.item.lyric.sectionId }
      : null;
    this.previewBible = found.item.bible ?? null;
    this.cursor = { sectionId: found.section.id, itemId };
    this.library = found.item.kind === "lyric" ? "songs" : found.item.kind === "bible" ? "bible" : found.item.kind === "image" ? "media" : "slides";
    if (found.item.kind === "composition") {
      const saved = this.workspace.compositions.find((entry) => entry.id === found.item.composition?.compositionId);
      if (saved) this.previewLook(restoreComposition(saved));
      else {
        this.lookOnPreview = null;
        this.previewModel(emptyModel(this.theme()), itemId);
      }
      this.persistSoon();
      return;
    }
    const model = await this.modelFor(found.item);
    if (token !== this.selectToken) return;
    this.lookOnPreview = null;
    this.live = setPreview(this.live, frame(model, itemId, "cut"));
    this.persistSoon();
  };

  step = async (direction: 1 | -1) => {
    if (this.songFocus) {
      this.stepSong(direction);
      return;
    }
    // A verse searched or spoken onto Preview (not the selected service item) steps by verse.
    const cursorItem = this.service && this.cursor.itemId ? findItem(this.service, this.cursor.itemId)?.item : null;
    const freeVerse =
      this.live.preview.model.layout === "scripture" &&
      this.previewBible !== null &&
      cursorItem?.bible?.reference !== this.previewBible.reference;
    if (freeVerse && (await this.stepPreviewScripture(direction))) return;
    if (!this.service) return;
    const next = stepCursor(this.service, this.cursor, direction);
    if (next.itemId && next.itemId !== this.cursor.itemId) await this.selectItem(next.itemId);
  };

  previewModel = (model: PresentationModel, sourceId: string | null) => {
    this.lookOnPreview = null;
    this.live = setPreview(this.live, frame(model, sourceId, "cut"));
  };

  previewLook = (composition: Composition) => {
    this.songFocus = null;
    this.sermonFocus = null;
    const clean = sanitizeComposition(composition);
    this.lookOnPreview = clean;
    const model = presentComposition(withMediaUrls(clean, this.mediaSrc), { theme: this.theme(), now: Date.now() });
    this.live = previewComposition(this.live, model, clean.id);
    this.message = `${clean.name} is on Preview. LIVE still sends Program.`;
  };

  saveLook = (composition: Composition) => {
    const clean = sanitizeComposition(composition);
    const synced = syncLinkedEdits(this.sharedSources, this.workspace.compositions, clean);
    this.workspace = {
      ...this.workspace,
      sources: synced.sources,
      compositions: persistLook(synced.looks, synced.look),
    };
    if (this.lookOnPreview?.id === clean.id) this.lookOnPreview = synced.look;
    this.persistSoon();
    this.message = synced.unlinked.length
      ? `${synced.unlinked.join(", ")} unlinked: a locked scene uses the shared source. LIVE still sends Program.`
      : `${clean.name} saved. LIVE still sends Program.`;
  };

  /** Create an empty scene (look), persist it, and stage Preview only. */
  createSceneLook = (name = "Scene") => {
    const scene = createScene(name);
    this.saveLook(scene);
    this.previewLook(scene);
    this.message = `${scene.name} is on Preview. LIVE still sends Program.`;
    return scene;
  };

  /** Apply a look mutation, persist, and refresh Preview. No-ops when scene-locked. */
  editSceneLook = (next: Composition) => {
    const clean = sanitizeComposition(next);
    const prior = this.workspace.compositions.find((entry) => entry.id === clean.id);
    if (prior?.locked && clean.locked) {
      this.message = `${clean.name} is locked.`;
      return;
    }
    this.saveLook(clean);
    this.previewLook(clean);
  };

  setSceneLocked = (id: string, locked: boolean) => {
    const saved = this.workspace.compositions.find((entry) => entry.id === id);
    if (!saved) return;
    const next = setCompositionLocked(restoreComposition(saved), locked);
    this.saveLook(next);
    if (this.lookOnPreview?.id === id) this.previewLook(next);
    this.message = locked ? `${next.name} locked.` : `${next.name} unlocked.`;
  };

  get sharedSources(): SharedSource[] {
    return (this.workspace.sources ?? []).map(sanitizeSharedSource).filter((entry): entry is SharedSource => entry !== null);
  }

  lockedScenesUsing = (id: string) => lockedLooksUsing(this.workspace.compositions, id);

  private stageScene = (next: Composition) => {
    this.saveLook(next);
    this.previewLook(next);
  };

  /** Create a shared source and add it as a new layer on the scene. Preview only. */
  createSourceInScene = (scene: Composition, name: string, source: SourceRef): string | null => {
    if (scene.locked) return null;
    const shared = createSharedSource(name, source);
    this.workspace = { ...this.workspace, sources: [...this.sharedSources, shared] };
    const next = addSharedLayer(scene, shared);
    this.stageScene(next);
    return next.layers[next.layers.length - 1]?.id ?? null;
  };

  addExistingSourceToScene = (scene: Composition, id: string): string | null => {
    const shared = this.sharedSources.find((entry) => entry.id === id);
    if (!shared || scene.locked) return null;
    const next = addSharedLayer(scene, shared);
    this.stageScene(next);
    return next.layers[next.layers.length - 1]?.id ?? null;
  };

  /** Edit a shared source everywhere. Returns locked scene names when refused. Never Program. */
  saveSharedSource = (id: string, name: string, source: SourceRef): string[] => {
    const result = updateSharedSource(this.sharedSources, this.workspace.compositions, id, { name, source });
    if (!result.ok) {
      this.message = `Used in locked scene "${result.blocked[0]}". Unlock to edit.`;
      return result.blocked;
    }
    this.workspace = { ...this.workspace, sources: result.sources, compositions: result.looks };
    this.persistSoon();
    const open = this.lookOnPreview && result.looks.find((entry) => entry.id === this.lookOnPreview?.id);
    if (open) this.previewLook(restoreComposition(open));
    this.message = `${name} saved. Program updates on TAKE.`;
    return [];
  };

  /** Turn an unlinked layer into a new shared source. Preview only. */
  linkLayerToNewSource = (scene: Composition, layerId: string, name: string, source: SourceRef) => {
    if (scene.locked) return;
    const shared = createSharedSource(name, source);
    this.workspace = { ...this.workspace, sources: [...this.sharedSources, shared] };
    this.stageScene(linkLayer(scene, layerId, shared));
  };

  removeSceneLayer = (scene: Composition, layerId: string) => {
    if (scene.locked) return;
    this.stageScene(removeLayer(scene, layerId));
    this.workspace = { ...this.workspace, sources: pruneSharedSources(this.sharedSources, this.workspace.compositions) };
    this.persistSoon();
  };

  /** Verse detection (Presenter Desk) subscribes here; commands are handled first. */
  onVoiceHeard = (listener: (text: string, final: boolean, alternatives: string[]) => void) => {
    this.voiceListeners.add(listener);
    return () => this.voiceListeners.delete(listener);
  };

  attachVoiceDesk = (handler: (request: VoiceDeskRequest) => Promise<boolean> | boolean) => {
    this.voiceDesk = handler;
    return () => {
      if (this.voiceDesk === handler) this.voiceDesk = null;
    };
  };

  setVoiceAllowLive = (allow: boolean) => {
    this.voice = { ...this.voice, allowLive: allow };
  };

  toggleVoice = async () => {
    if (this.voice.status === "listening" || this.voice.status === "starting") {
      this.stopVoice("Listening stopped. Preview and Program were left as they were.");
      return;
    }
    await this.startVoice();
  };

  startVoice = async () => {
    if (this.voice.status === "starting" || this.voice.status === "listening") return;
    if (!canUse("voice-detect")) {
      this.voice = { ...this.voice, status: "error", error: "unsupported", message: "Voice is not available in this build." };
      return;
    }
    this.voice = { ...this.voice, status: "starting", error: null, heard: "", hearing: false, level: 0, message: "Starting the microphone…" };
    const blocked = await prepareListening();
    if (this.voice.status !== "starting") return;
    if (blocked) {
      this.voice = { ...this.voice, status: "error", error: "denied", message: blocked };
      return;
    }
    const handlers = {
      onHeard: (text: string, final: boolean, alternatives: string[], latest: string) =>
        this.handleVoiceHeard(text, final, alternatives, latest),
      onLevel: (level: number) => {
        this.voice.level = level;
      },
      onError: (message: string, kind: ListenErrorKind) => {
        this.voice = { ...this.voice, status: "error", error: kind, message, level: 0 };
      },
      onEnd: () => {
        this.stopVoiceEngine = null;
        if (this.voice.status === "error") return;
        this.voice = { ...this.voice, status: "stopped", level: 0, hearing: false, message: this.voice.message || "Listening stopped." };
      },
      onStatus: (message: string) => {
        this.voice.message = message;
      },
    };
    this.voice = {
      ...this.voice,
      status: "listening",
      message: "Listening. Read a verse to put it on Preview, or say “Studio next”, “Studio open songs”.",
    };
    this.stopVoiceEngine = isDesktop() ? startNativeListening(handlers) : startListening(handlers);
  };

  stopVoice = (message = "Listening stopped.") => {
    const stop = this.stopVoiceEngine;
    this.stopVoiceEngine = null;
    this.voice = { ...this.voice, status: "stopped", error: null, level: 0, hearing: false, message };
    stop?.();
  };

  openVoicePrivacy = () => void openPrivacySettings();

  private handleVoiceHeard = (text: string, final: boolean, alternatives: string[], latest: string) => {
    if (this.voice.status !== "listening") return;
    this.voice.heard = text;
    this.voice.hearing = !final;
    const settings = this.workspace.voice;
    if (final && settings?.commands !== false) {
      const options = { wake: settings?.wake !== false, custom: settings?.custom as CustomVoiceCommand[] | undefined, translations: this.translations };
      const command = parseVoiceCommand(latest, options) ?? alternatives.map((option) => parseVoiceCommand(option, options)).find(Boolean) ?? null;
      if (command) {
        void this.runVoiceCommand(command);
        return;
      }
    }
    for (const listener of this.voiceListeners) listener(text, final, alternatives);
  };

  /** Execute a parsed voice command. Program-changing commands need allowLive. */
  runVoiceCommand = async (command: VoiceCommand) => {
    // One phrase can arrive twice (alternatives, a repeated final); run it once. Blocked or
    // failed attempts do not count, so the operator can retry at once after allowing live commands.
    const now = Date.now();
    if (command.phrase === this.lastVoiceCommand.phrase && now - this.lastVoiceCommand.at < 2000) return;
    this.lastVoiceCommand = { phrase: command.phrase, at: now };
    const label = voiceCommandLabel(command);
    const record = (outcome: "executed" | "blocked" | "failed", message: string) => {
      if (outcome !== "executed") this.lastVoiceCommand = { phrase: "", at: 0 };
      this.voice = { ...this.voice, command: { label, phrase: command.phrase, outcome, at: Date.now() }, message };
    };
    if (command.live && !this.voice.allowLive) {
      record("blocked", `Heard “${label}”. Live voice commands are off, so Program was not changed.`);
      return;
    }
    try {
      if (command.kind === "command") {
        await this.run(command.id);
        record("executed", command.live ? `${label} sent Program.` : `${label}. Preview only.`);
        return;
      }
      if (command.kind === "library") {
        const handled = (await this.voiceDesk?.({ kind: "library", tab: command.tab })) ?? false;
        if (!handled && command.tab === "songs") this.openFind();
        record("executed", `${label}.`);
        return;
      }
      if (command.kind === "translation") {
        this.voiceTranslationId = command.id;
        await this.voiceDesk?.({ kind: "translation", id: command.id });
        record("executed", `${label}. Scripture now reads from it.`);
        return;
      }
      if (command.kind === "search" && command.scope === "songs") {
        this.openFind();
        await this.searchFind(command.query);
        record("executed", `${this.findHits.length} song matches for “${command.query}”. Pick one for Preview.`);
        return;
      }
      const query = command.query;
      const handled = (await this.voiceDesk?.({ kind: "scripture", query })) ?? false;
      if (handled || (await this.previewScriptureQuery(query))) {
        record("executed", `${label}. Preview only.`);
      } else {
        record("failed", `No scripture found for “${query}”.`);
      }
    } catch (error) {
      record("failed", error instanceof Error ? error.message : `${label} failed.`);
    }
  };

  /** Translation chosen by voice; scripture previews from the session use it. */
  voiceTranslationId = $state("");

  saveVoiceSettings = (patch: Partial<VoiceSettings>) => {
    this.workspace = { ...this.workspace, voice: sanitizeVoiceSettings({ ...this.workspace.voice, ...patch }) };
    this.persistSoon();
  };

  /** Reference or phrase → Preview. Used when no desk handles the request. Never Program. */
  private previewScriptureQuery = async (query: string): Promise<boolean> => {
    const translation = this.translations.find((entry) => entry.id === this.voiceTranslationId) ?? this.translations[0];
    if (!translation) return false;
    const parsed = parseReference(query, this.books);
    if (parsed?.startVerse) {
      const book = this.books.find((entry) => entry.ord === parsed.bookOrd);
      const end = parsed.endVerse ?? parsed.startVerse;
      await this.previewPassage({
        translationId: translation.id,
        bookOrd: parsed.bookOrd,
        chapter: parsed.chapter,
        startVerse: parsed.startVerse,
        endVerse: end,
        reference: formatReference(book?.name ?? "", parsed.chapter, parsed.startVerse, end, book?.chapters ?? 1),
      });
      return true;
    }
    const hit = (await api.search(translation.id, query))[0];
    if (!hit) return false;
    const book = this.books.find((entry) => entry.ord === hit.bookOrd);
    await this.previewPassage({
      translationId: translation.id,
      bookOrd: hit.bookOrd,
      chapter: hit.chapter,
      startVerse: hit.verse,
      endVerse: hit.verse,
      reference: formatReference(hit.bookName, hit.chapter, hit.verse, hit.verse, book?.chapters ?? 1),
    });
    return true;
  };

  /** Resolve a typed reference to scripture fields (first translation). */
  scriptureFields = async (reference: string): Promise<SourceFields | null> => {
    const parsed = parseReference(reference, this.books);
    const translation = this.translations[0];
    if (!parsed?.startVerse || !translation) return null;
    const book = this.books.find((entry) => entry.ord === parsed.bookOrd);
    const end = parsed.endVerse ?? parsed.startVerse;
    const verses = await api.passage(translation.id, parsed.bookOrd, parsed.chapter, parsed.startVerse, end);
    if (!verses.length) return null;
    return {
      type: "scripture",
      reference: formatReference(book?.name ?? "", parsed.chapter, parsed.startVerse, end, book?.chapters ?? 1),
      body: verses.map((verse) => verse.text).join(" "),
      attribution: translation.abbreviation || translation.name,
      verse: parsed.startVerse,
      style: {},
    };
  };

  deleteLook = (id: string) => {
    const saved = this.workspace.compositions.find((entry) => entry.id === id);
    if (saved?.locked) {
      this.message = `${saved.name} is locked. Unlock to remove.`;
      return;
    }
    const compositions = removeLook(this.workspace.compositions, id);
    this.workspace = { ...this.workspace, compositions, sources: pruneSharedSources(this.sharedSources, compositions) };
    if (this.lookOnPreview?.id === id) this.lookOnPreview = null;
    this.persistSoon();
    this.message = "Look removed. Program was not changed.";
  };

  addLookToService = async (composition: Composition) => {
    const queued = queueLook(this.workspace.compositions, composition);
    this.workspace = { ...this.workspace, compositions: queued.looks };
    this.persistSoon();
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Looks");
    const target = this.service ? sectionIdForInsert(this.service, this.cursor) : null;
    if (!this.service || !target) {
      this.message = `${queued.item.title} saved. Add a section first.`;
      return;
    }
    this.insertItem(target, queued.item);
    await this.selectItem(queued.item.id);
    this.message = `${queued.item.title} queued. Preview only until LIVE.`;
  };

  previewPassage = async (passage: BibleItem) => {
    this.songFocus = null;
    this.sermonFocus = null;
    this.previewBible = passage;
    const item: PresentationItem = { id: "preview", kind: "bible", title: passage.reference, bible: passage };
    const model = await this.modelFor(item);
    this.previewModel(model, null);
    this.remember(passage);
  };

  /** Keep Program on the same verse, in the newly chosen translation. Preview is updated separately. */
  refreshProgramTranslation = async (translationId: string) => {
    const current = this.live.program.model;
    if (current.layout !== "scripture" || !current.reference) return;
    const parsed = parseReference(current.reference);
    if (!parsed?.startVerse) return;
    const translation = this.translations.find((entry) => entry.id === translationId);
    const model = await this.modelFor({
      id: this.live.program.sourceId ?? "program",
      kind: "bible",
      title: current.reference,
      bible: {
        translationId,
        bookOrd: parsed.bookOrd,
        chapter: parsed.chapter,
        startVerse: parsed.startVerse,
        endVerse: parsed.endVerse ?? parsed.startVerse,
        reference: current.reference,
      },
    });
    if (model.lines.length === 0) return;
    if (translation) model.attribution = this.theme().attribution.show ? translation.name : null;
    this.live = replaceProgramModel(this.live, model);
    await this.pushProgram();
  };

  addPassage = async (passage: BibleItem) => {
    if (!this.service) {
      this.message = "Create a service before adding a passage.";
      return;
    }
    const sectionId = this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!sectionId) {
      this.message = "Add a section, then add the passage.";
      return;
    }
    const item: PresentationItem = { id: uid(), kind: "bible", title: passage.reference, bible: passage };
    this.insertItem(sectionId, item);
    this.remember(passage);
    await this.selectItem(item.id);
    this.message = `${passage.reference} added to the service. Preview only.`;
  };

  private remember(passage: BibleItem) {
    const recent = [passage, ...this.workspace.recent.filter((entry) => entry.reference !== passage.reference || entry.translationId !== passage.translationId)].slice(0, 8);
    this.workspace = { ...this.workspace, recent };
    this.persistSoon();
  }

  renameService = (name: string) => {
    if (!this.service) return;
    this.service = { ...this.service, name };
    this.persistSoon();
  };

  createService = async (name: string) => {
    const service: Service = { id: uid(), name: name.trim() || "Untitled service", sections: [], updatedAt: new Date().toISOString() };
    this.service = service;
    this.cursor = { sectionId: null, itemId: null };
    await this.persist();
    this.message = `${service.name} created.`;
  };

  openService = async (id: string) => {
    this.service = await api.serviceGet(id);
    this.cursor = { sectionId: null, itemId: null };
    this.workspace = { ...this.workspace, lastServiceId: id };
    await this.saveWorkspaceDocument(this.workspace);
  };

  addSection = (name: string) => {
    if (!this.service) return;
    const section = { id: uid(), name: name.trim() || "Section", items: [] };
    this.service = { ...this.service, sections: [...this.service.sections, section] };
    this.cursor = { sectionId: section.id, itemId: null };
    this.persistSoon();
  };

  renameSection = (id: string, name: string) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => (section.id === id ? { ...section, name } : section)),
    };
    this.persistSoon();
  };

  moveSection = (id: string, direction: 1 | -1) => {
    if (!this.service) return;
    const index = this.service.sections.findIndex((section) => section.id === id);
    this.service = { ...this.service, sections: moveInList(this.service.sections, index, direction) };
    this.persistSoon();
  };

  removeSection = (id: string) => {
    if (!this.service) return;
    this.service = { ...this.service, sections: this.service.sections.filter((section) => section.id !== id) };
    if (this.cursor.sectionId === id) this.cursor = { sectionId: null, itemId: null };
    this.persistSoon();
  };

  private insertItem(sectionId: string, item: PresentationItem) {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) =>
        section.id === sectionId ? { ...section, items: [...section.items, item] } : section,
      ),
    };
  };

  addSlide = (kind: "slide" | "announcement") => {
    if (!this.service) return;
    const sectionId = this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!sectionId) {
      this.message = "Add a section first.";
      return;
    }
    const item: PresentationItem =
      kind === "announcement"
        ? { id: uid(), kind, title: "Announcement", announcement: { heading: "Announcement", body: "" } }
        : { id: uid(), kind, title: "Slide", slide: { heading: "Slide", body: "", imageId: null } };
    this.insertItem(sectionId, item);
    void this.selectItem(item.id);
  };

  addLyric = (songId: string, sectionId: string, title: string) => {
    if (!this.service) return;
    const target = this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!target) {
      this.message = "Add a section first.";
      return;
    }
    const item: PresentationItem = { id: uid(), kind: "lyric", title, lyric: { songId, sectionId } };
    this.insertItem(target, item);
    void this.selectItem(item.id);
  };

  /** Add a video to the current section. Preview plays it muted; LIVE plays it on the audience. */
  addVideo = async (assetId: string, title: string, options: { loop?: boolean; muted?: boolean } = {}) => {
    const target = await this.sectionForMedia();
    if (!target) {
      this.message = "Add a section first.";
      return;
    }
    const item: PresentationItem = {
      id: uid(),
      kind: "video",
      title,
      video: { assetId, loop: options.loop ?? false, muted: options.muted ?? false },
    };
    this.insertItem(target, item);
    void this.selectItem(item.id);
  };

  /** The section media is added to; opens a service and a section when there is none yet. */
  private sectionForMedia = async (): Promise<string | null> => {
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Media");
    return this.cursor.sectionId ?? this.service?.sections[0]?.id ?? null;
  };

  addImage = async (assetId: string, title: string) => {
    const target = await this.sectionForMedia();
    if (!target) {
      this.message = "Add a section first.";
      return;
    }
    const item: PresentationItem = { id: uid(), kind: "image", title, image: { assetId } };
    this.insertItem(target, item);
    void this.selectItem(item.id);
  };

  updateItem = (item: PresentationItem) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => ({
        ...section,
        items: section.items.map((entry) => (entry.id === item.id ? item : entry)),
      })),
    };
    this.persistSoon();
    if (this.cursor.itemId === item.id) void this.selectItem(item.id);
  };

  moveItem = (itemId: string, direction: 1 | -1) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        const index = section.items.findIndex((item) => item.id === itemId);
        return index === -1 ? section : { ...section, items: moveInList(section.items, index, direction) };
      }),
    };
    this.persistSoon();
  };

  clearQueue = () => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => ({ ...section, items: [] })),
    };
    this.cursor = { sectionId: this.service.sections[0]?.id ?? null, itemId: null };
    this.persistSoon();
    this.message = "Queue cleared.";
  };

  removeItem = (itemId: string) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== itemId),
      })),
    };
    if (this.cursor.itemId === itemId) this.cursor = { ...this.cursor, itemId: null };
    this.persistSoon();
  };

  openFind = () => {
    this.findOpen = true;
    this.findQuery = "";
    this.findHits = recentSongHits(this.songs, this.recentSongs);
    this.message = "Search songs. A match is Preview only. LIVE still sends Program.";
  };

  closeFind = () => {
    this.findOpen = false;
    this.findQuery = "";
  };

  searchFind = async (query: string) => {
    this.findQuery = query;
    const needle = query.trim();
    if (!needle) {
      this.findHits = recentSongHits(this.songs, this.recentSongs);
      return;
    }
    const songs = await api.songSearch(needle);
    this.findHits = searchSongHits(songs, needle);
  };

  previewSongHit = (hit: SongHit) => {
    const song = this.songs.find((entry) => entry.id === hit.songId);
    if (!song) {
      this.message = "That song is no longer available.";
      return;
    }
    this.previewSongSection(song, hit.sectionId);
    this.message = `${hit.title} on Preview. LIVE still sends Program.`;
  };

  queueSongHit = async (hit: SongHit) => {
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Songs");
    this.addLyric(hit.songId, hit.sectionId, `${hit.title} — ${hit.label}`);
    this.message = `${hit.title} queued. Preview it, then LIVE.`;
  };

  previewSongSection = (song: Song, sectionId: string | null) => {
    const clean = sanitizeSong(song);
    const section = clean.sections.find((entry) => entry.id === sectionId) ?? clean.sections[0];
    if (!section) {
      this.message = "This song has no sections.";
      return;
    }
    this.songFocus = { songId: clean.id, sectionId: section.id };
    this.previewBible = null;
    this.recentSongs = rememberSongRecent(this.recentSongs, { songId: clean.id, sectionId: section.id });
    this.library = "songs";
    const theme = this.theme();
    const backgroundImageUrl = theme.background.type === "image" ? this.mediaSrc(theme.background.assetId) : null;
    const lyrics = lyricsFor(clean, section.id, clean.title);
    this.previewModel(
      presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines }),
      `song:${clean.id}:${section.id}`,
    );
  };

  stepSong = (direction: 1 | -1): boolean => {
    const focus = this.songFocus;
    if (!focus) return false;
    const song = this.songs.find((entry) => entry.id === focus.songId);
    if (!song) {
      this.songFocus = null;
      this.message = "That song is no longer available.";
      this.previewModel(emptyModel(this.theme()), null);
      return false;
    }
    const next = stepSongSection(song, focus.sectionId, direction);
    if (!next) return false;
    this.previewSongSection(song, next.id);
    return true;
  };

  songPlace = (): string => {
    const focus = this.songFocus;
    if (!focus) return "";
    const song = this.songs.find((entry) => entry.id === focus.songId);
    const place = song ? sectionPlace(song, focus.sectionId) : null;
    return place ? `${place.label} · ${place.index + 1} of ${place.count}` : "";
  };

  saveSong = async (song: Song): Promise<boolean> => {
    const clean = sanitizeSong(song);
    const error = songError(clean);
    if (error) {
      this.message = error;
      return false;
    }
    await api.songSave(clean);
    this.songs = await api.songList();
    if (this.songFocus?.songId === clean.id) this.previewSongSection(clean, this.songFocus.sectionId);
    return true;
  };

  deleteSong = async (id: string) => {
    await api.songDelete(id);
    this.songs = await api.songList();
    if (this.songFocus?.songId === id) {
      this.songFocus = null;
      this.message = "That song is no longer available.";
      this.previewModel(emptyModel(this.theme()), null);
    }
  };

  searchSongs = async (query: string) => {
    this.songs = query.trim() ? await api.songSearch(query) : await api.songList();
  };

  previewSermonSection = async (sermon: Sermon, sectionId: string | null) => {
    const clean = sanitizeSermon(sermon);
    const section = clean.sections.find((entry) => entry.id === sectionId) ?? clean.sections[0];
    if (!section) {
      this.message = "This sermon has no sections.";
      return;
    }
    this.sermonFocus = { sermonId: clean.id, sectionId: section.id };
    this.previewBible = null;
    this.library = "sermon";
    const item = sermonAudienceItem(section);
    const model = await this.modelFor(item);
    this.previewModel(model, `sermon:${clean.id}:${section.id}`);
    this.message = deskNotes(clean, section.id)
      ? "Notes are on the desk. LIVE still sends Program."
      : "Preview the section, then LIVE.";
  };

  stepSermon = async (direction: 1 | -1): Promise<boolean> => {
    const focus = this.sermonFocus;
    if (!focus) return false;
    const sermon = this.sermons.find((entry) => entry.id === focus.sermonId);
    if (!sermon) {
      this.sermonFocus = null;
      this.message = "That sermon is no longer available.";
      this.previewModel(emptyModel(this.theme()), null);
      return false;
    }
    const next = stepSermonSection(sermon, focus.sectionId, direction);
    if (!next) return false;
    await this.previewSermonSection(sermon, next.id);
    return true;
  };

  saveSermon = async (sermon: Sermon): Promise<boolean> => {
    const clean = sanitizeSermon({ ...sermon, updatedAt: new Date().toISOString() });
    const error = sermonError(clean);
    if (error) {
      this.message = error;
      return false;
    }
    await api.sermonSave(clean);
    this.sermons = await api.sermonList();
    if (this.sermonFocus?.sermonId === clean.id) void this.previewSermonSection(clean, this.sermonFocus.sectionId);
    this.message = `${clean.title} saved. Notes stay on the desk.`;
    return true;
  };

  addSermonSection = (section: Sermon["sections"][number], title: string) => {
    if (!this.service) return;
    const target = this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!target) {
      this.message = "Add a section first.";
      return;
    }
    const source = sermonAudienceItem(section);
    const item: PresentationItem = { ...source, id: uid(), title };
    this.insertItem(target, item);
    void this.selectItem(item.id);
  };

  sermonDeskNotes = (): string => {
    const focus = this.sermonFocus;
    if (!focus) return "";
    const sermon = this.sermons.find((entry) => entry.id === focus.sermonId);
    return sermon ? deskNotes(sermon, focus.sectionId) : "";
  };

  loadCameras = async () => {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.enumerateDevices) {
      this.cameras = [];
      this.cameraNote = cameraUnavailableMessage();
      return;
    }
    const devices = await media.enumerateDevices();
    this.cameras = listVideoInputs(devices as Array<{ deviceId: string; kind: string; label: string }>);
    if (!this.cameras.length) this.cameraNote = cameraUnavailableMessage();
  };

  previewCamera = async (deviceId: string) => {
    const ok = await this.openFeed(cameraSourceId(deviceId));
    if (!ok) return;
    const label = this.cameras.find((camera) => camera.deviceId === deviceId)?.label ?? "Camera";
    this.live = previewCameraLive(this.live, presentCamera({ theme: this.theme(), label }), cameraSourceId(deviceId));
    this.message = `${label} is on Preview. LIVE still sends Program.`;
  };

  /** Open a feed for a camera source id. Errors become the desk camera note; Program is never touched. */
  private openFeed = (id: string): Promise<boolean> => {
    if (this.cameraFeeds[id]) return Promise.resolve(true);
    const pending = this.openingFeeds.get(id);
    if (pending) return pending;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      this.cameraNote = cameraUnavailableMessage();
      this.message = this.cameraNote;
      return Promise.resolve(false);
    }
    const opening = (async () => {
      try {
        const stream = (await openCamera(media, cameraDeviceId(id))) as MediaStream;
        this.cameraFeeds = { ...this.cameraFeeds, [id]: stream };
        this.cameraNote = "";
        if (!this.cameras.length) await this.loadCameras();
        return true;
      } catch (error) {
        this.cameraNote = error instanceof Error ? error.message : cameraUnavailableMessage();
        this.message = this.cameraNote;
        return false;
      } finally {
        this.openingFeeds.delete(id);
      }
    })();
    this.openingFeeds.set(id, opening);
    return opening;
  };

  /** Keep exactly the feeds Preview or Program paint. Closing a feed stops its tracks. */
  private syncCameraFeeds = async () => {
    const needed = camerasNeeded(this.live);
    const plan = planFeeds(Object.keys(this.cameraFeeds), needed);
    if (plan.close.length) {
      const next = { ...this.cameraFeeds };
      for (const id of plan.close) {
        stopCameraStream(next[id]);
        delete next[id];
      }
      this.cameraFeeds = next;
    }
    await Promise.all(plan.open.map((id) => this.openFeed(id)));
    // A feed that finished opening after its frame left Preview and Program is closed again.
    const stale = Object.keys(this.cameraFeeds).filter((id) => !camerasNeeded(this.live).includes(id));
    if (stale.length) {
      const next = { ...this.cameraFeeds };
      for (const id of stale) {
        stopCameraStream(next[id]);
        delete next[id];
      }
      this.cameraFeeds = next;
    }
  };

  private releaseCameras = () => {
    for (const stream of Object.values(this.cameraFeeds)) stopCameraStream(stream);
    this.cameraFeeds = {};
  };

  /** Stage (confidence) display: Program now, Preview as next. Separate from the audience packet. */
  private publishStage = () => {
    if (typeof window === "undefined" || !this.stageOpen) return;
    const snapshot: StageSnapshot = {
      program: this.live.program.model,
      next: this.live.preview.model,
      live: this.output.online,
      desk: this.workspace.churchName,
      at: Date.now(),
    };
    try {
      publishStageLocal(snapshot);
    } catch {
      // Storage full or blocked: the stage keeps its last frame.
    }
    if (isDesktop()) void emit("stage-frame", JSON.stringify(snapshot)).catch(() => {});
  };

  stageOpen = $state(false);
  /** Where the browser audience popup was placed, so the stage avoids it. */
  private audienceScreen: ScreenLike | null = null;

  /** Open the stage display: a popup in the browser, a separate window on desktop. Never Program. */
  openStage = async () => {
    this.stageOpen = true;
    this.publishStage();
    if (isDesktop()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("stage");
        if (existing) {
          await existing.setFocus();
          return;
        }
        // A third display if there is one; otherwise a window the operator drags.
        const target = pickStageDisplay(this.output.displays);
        const stage = new WebviewWindow(
          "stage",
          target
            ? { url: "/?stage=1", title: "Stage display", x: target.x, y: target.y, width: target.width, height: target.height, decorations: false }
            : { url: "/?stage=1", title: "Stage display", width: 1280, height: 720 },
        );
        stage.once("tauri://error", (event) => {
          this.message = `The stage display could not open: ${String(event.payload)}`;
        });
        this.message = target
          ? `Stage display is on ${target.name}. It shows Program and what is on Preview next.`
          : "Stage display opened. Drag it to the platform screen. It shows Program and what is on Preview next.";
      } catch (error) {
        this.message = error instanceof Error ? error.message : "The stage display could not open.";
      }
      return;
    }
    const placed = await this.stagePlacement();
    const opened = window.open("/?stage=1", "church-studio-stage", placed?.features ?? "popup=yes,width=1280,height=720");
    this.message = !opened
      ? "The browser blocked the stage window. Allow pop-ups for this site, then try again."
      : placed
        ? `Stage display is on ${placed.label}. It shows Program and what is on Preview next.`
        : "Stage display opened. Drag it to the platform screen. It shows Program and what is on Preview next.";
  };

  /** Chromium: a screen that is neither the desk's nor the audience's. Null = plain popup. */
  private stagePlacement = async (): Promise<{ features: string; label: string } | null> => {
    const page = window as Window & { getScreenDetails?: () => Promise<{ screens: ScreenLike[]; currentScreen: ScreenLike }> };
    if (typeof page.getScreenDetails !== "function") return null;
    try {
      const details = await page.getScreenDetails();
      const target = pickStageScreen(details.screens, details.currentScreen, this.audienceScreen);
      return target ? { features: placementFeatures(target), label: target.label?.trim() || "the stage screen" } : null;
    } catch {
      return null;
    }
  };

  /** Tell the audience window which Preview cameras to warm up. It never paints them before TAKE. */
  private publishStandby = () => {
    if (typeof window === "undefined") return;
    const ids = camerasIn(this.live.preview.model, this.live.preview.sourceId);
    const key = JSON.stringify(ids);
    if (key === this.standbySent) return;
    this.standbySent = key;
    if (isDesktop()) void emit("camera-standby", ids).catch(() => {});
    else {
      try {
        publishStandbyLocal(ids);
      } catch {
        // Storage can be unavailable (private mode); standby is only a warm-up.
      }
    }
  };

  importImage = async (source: string | File) => {
    try {
      const asset = await api.importMedia(source);
      this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
      this.message = `${asset.name} saved. Preview it, then LIVE.`;
      return asset;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The image was not saved.";
      return null;
    }
  };

  setLogo = (assetId: string | null) => {
    this.workspace = { ...this.workspace, logoAssetId: assetId };
    this.persistSoon();
    this.message = "Logo updated. Press Logo to send it to program.";
  };

  setChurchName = (churchName: string) => {
    this.workspace = { ...this.workspace, churchName };
    this.persistSoon();
  };

  saveTheme = (theme: Theme) => {
    const next = sanitizeTheme(theme);
    this.themes = this.themes.map((entry) => (entry.id === next.id ? next : entry));
    if (!this.themes.some((entry) => entry.id === next.id)) this.themes = [...this.themes, next];
    this.workspace = { ...this.workspace, themeId: next.id };
    void api.themeSave(next).catch((error) => {
      this.message = error instanceof Error ? error.message : String(error);
    });
    this.persistSoon();
    this.showThemeOnPreview(next);
  };

  useTheme = (id: string) => {
    const next = this.themes.find((theme) => theme.id === id);
    if (!next || next.id === this.workspace.themeId) return;
    this.workspace = { ...this.workspace, themeId: next.id };
    this.persistSoon();
    this.showThemeOnPreview(next);
  };

  private showThemeOnPreview(next: Theme) {
    if (this.cursor.itemId) void this.selectItem(this.cursor.itemId);
    else this.live = setPreview(this.live, frame({ ...this.live.preview.model, theme: next }, this.live.preview.sourceId, "cut"));
  }

  private act = async (action: "take" | "cut" | "clear" | "black" | "logo") => {
    if (!this.desktop() && !this.controlsAudience) {
      this.message = "This window is not sending to the audience.";
      return;
    }
    const imageUrl = this.mediaSrc(this.workspace.logoAssetId);
    const themeTransition = this.theme().transition;
    const takeTransition =
      action === "take"
        ? takeTransitionForPreview(this.live.preview.sourceId, this.looksForTake(), themeTransition)
        : null;
    this.live = applyProgramAction(
      this.live,
      action,
      this.theme(),
      { title: this.logoTitle(), imageUrl },
      takeTransition ? { transition: takeTransition.type } : undefined,
    );
    await this.pushProgram();
    this.message =
      action === "take"
        ? takeTransition?.type === "cut"
          ? "Cut to program."
          : "Taken to program."
        : action === "cut"
          ? "Cut to program."
          : action === "black"
            ? "Program is black."
            : action === "logo"
              ? "Logo is on program."
              : "Program cleared.";
  };

  take = () => this.act("take");
  cut = () => this.act("cut");
  clear = () => this.act("clear");
  black = () => this.act("black");
  logo = () => this.act("logo");

  openSettings = (section = "appearance") => {
    this.settingsSection = section;
    this.settingsOpen = true;
  };

  private rememberOutput = (patch: { outputEnabled?: boolean; outputMode?: "window" | "fullscreen" }) => {
    const id = this.workspace.activeDisplayProfileId;
    this.workspace = {
      ...this.workspace,
      displayProfiles: this.workspace.displayProfiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)),
    };
    this.persistSoon();
  };

  refreshDisplays = async () => {
    if (!this.desktop()) {
      this.noteBrowserAudience();
      this.message = "This browser cannot list monitors. Open the audience window and drag it to the other display.";
      return;
    }
    try {
      this.output = await api.refreshDisplays();
      this.message = this.output.message;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "Displays could not be listed.";
    }
  };

  setOutputMode = async (mode: "window" | "fullscreen") => {
    this.rememberOutput({ outputMode: mode });
    if (!this.desktop()) {
      this.output = { ...this.output, mode };
      this.message =
        mode === "fullscreen"
          ? "On the audience window, choose Fill this screen. This browser cannot fullscreen another monitor from here."
          : "The audience window stays in a normal window.";
      return;
    }
    try {
      this.output = await api.setOutput(this.currentProfile()?.outputEnabled ?? false, mode);
      this.message = this.output.message;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The audience window could not change mode.";
    }
  };

  testOutput = async () => {
    if (!this.desktop()) {
      this.noteBrowserAudience();
      if (!this.output.online || !this.audienceWindow) {
        this.message = "Open the audience window before sending a test. Program was not changed.";
        return;
      }
      this.audienceWindow.postMessage({ type: "output-test" }, window.location.origin);
      this.message = "Test pattern sent. Program was not changed.";
      return;
    }
    try {
      await api.testOutput();
      this.message = "Test pattern sent. Program was not changed.";
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The test pattern could not be sent. Program was not changed.";
    }
  };

  private noteBrowserAudience = () => {
    if (this.desktop()) return;
    const state = browserAudienceState(this.output.desired, this.audienceWindow);
    if (state.online === this.output.online && state.desired === this.output.desired) return;
    this.output = {
      ...this.output,
      desired: state.desired,
      online: state.online,
      displayName: state.online ? "Audience window" : "",
      message: state.message,
      mode: this.currentProfile()?.outputMode ?? "window",
      displays: [],
    };
  };

  /**
   * Chromium Window Management: put the popup on a screen other than the operator's.
   * The first call asks for permission. Any failure falls back to a plain popup the operator drags.
   */
  private audiencePlacement = async (): Promise<{ features: string; label: string } | null> => {
    const page = window as Window & {
      getScreenDetails?: () => Promise<{ screens: ScreenLike[]; currentScreen: ScreenLike }>;
    };
    if (typeof page.getScreenDetails !== "function") return null;
    try {
      const details = await page.getScreenDetails();
      const target = pickAudienceScreen(details.screens, details.currentScreen);
      this.audienceScreen = target;
      return target ? { features: placementFeatures(target), label: target.label?.trim() || "the second screen" } : null;
    } catch {
      return null;
    }
  };

  openAudience = async () => {
    this.outputHeldClosed = false;
    this.rememberOutput({ outputEnabled: true });
    await this.persist();
    if (!this.desktop()) {
      await this.pushProgram();
      const placement = this.audienceWindow && !this.audienceWindow.closed ? null : await this.audiencePlacement();
      const opened = openBrowserAudience((url, name, features) => window.open(url, name, features), placement);
      this.audienceWindow = opened.window;
      this.output = {
        ...this.output,
        ...opened.state,
        displayName: opened.state.online ? "Audience window" : "",
        mode: this.currentProfile()?.outputMode ?? "window",
        displays: [],
        audienceKey: null,
        operatorKey: null,
      };
      this.message = this.output.message;
      return;
    }
    try {
      this.output = await api.setOutput(true, this.currentProfile()?.outputMode ?? "window");
      this.message = this.output.message;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The audience window could not be opened.";
    }
  };

  closeAudience = async () => {
    this.outputHeldClosed = true;
    this.rememberOutput({ outputEnabled: false });
    await this.persist();
    if (!this.desktop()) {
      this.audienceWindow?.close();
      this.audienceWindow = null;
      this.output = { ...this.output, desired: false, online: false, displayName: "", message: "Audience output is closed." };
      this.message = this.output.message;
      return;
    }
    try {
      this.output = await api.setOutput(false, this.currentProfile()?.outputMode ?? "window");
      this.message = this.output.message;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "The audience window could not be closed.";
    }
  };

  activeLayout = (): WorkspaceLayout =>
    this.workspace.layouts.find((layout) => layout.id === this.workspace.activeLayoutId) ?? this.workspace.layouts[0];

  currentProfile = () =>
    this.workspace.displayProfiles.find((profile) => profile.id === this.workspace.activeDisplayProfileId) ??
    this.workspace.displayProfiles[0];

  private commitLayout = (layout: WorkspaceLayout) => {
    this.workspace = {
      ...this.workspace,
      activeLayoutId: layout.id,
      layouts: this.workspace.layouts.map((item) => (item.id === layout.id ? layout : item)),
    };
    this.persistSoon();
  };

  useLayout = (id: string) => {
    if (!this.workspace.layouts.some((layout) => layout.id === id)) return;
    this.workspace = { ...this.workspace, activeLayoutId: id };
    this.persistSoon();
  };

  movePanelTo = (panelId: PanelId, region: RegionId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(movePanel(layout, panelId, region));
  };

  hidePanelById = (panelId: PanelId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(hidePanel(layout, panelId));
  };

  showPanelById = (panelId: PanelId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(showPanel(layout, panelId));
  };

  togglePanel = (panelId: PanelId) => {
    const layout = this.activeLayout();
    const panel = layout?.panels.find((item) => item.panelId === panelId);
    if (!layout || !panel) return;
    this.commitLayout(panel.visible ? hidePanel(layout, panelId) : showPanel(layout, panelId));
  };

  collapsePanelById = (panelId: PanelId, collapsed: boolean) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(collapsePanel(layout, panelId, collapsed));
  };

  floatPanelById = (panelId: PanelId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(placeFloating(layout, panelId));
  };

  dockPanelById = (panelId: PanelId, region?: RegionId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(dockPanel(layout, panelId, region));
  };

  placePanel = (panelId: PanelId, geometry: Partial<FloatGeometry>) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(placeFloating(layout, panelId, geometry));
  };

  resizeRegions = (patch: Partial<WorkspaceLayout["regions"]>) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(resizeLayout(layout, patch));
  };

  activateTab = (region: RegionId, panelId: PanelId) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(activateTab(layout, region, panelId));
  };

  renameActiveLayout = (name: string) => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(renameLayout(layout, name));
  };

  duplicateActiveLayout = () => {
    const layout = this.activeLayout();
    if (!layout) return;
    const copy = duplicateLayout(layout, `layout-${crypto.randomUUID()}`, `${layout.name} copy`);
    this.workspace = { ...this.workspace, layouts: [...this.workspace.layouts, copy], activeLayoutId: copy.id };
    this.persistSoon();
    this.message = `${copy.name} saved.`;
  };

  saveLayoutAs = (name: string) => {
    const layout = this.activeLayout();
    if (!layout || !name.trim()) return;
    const copy = duplicateLayout(layout, `layout-${crypto.randomUUID()}`, name);
    this.workspace = { ...this.workspace, layouts: [...this.workspace.layouts, copy], activeLayoutId: copy.id };
    this.persistSoon();
    this.message = `${copy.name} saved.`;
  };

  deleteLayoutById = (id: string) => {
    const next = deleteLayout(this.workspace.layouts, id);
    if (!next) {
      this.message = "Built-in workspaces stay in the list. Reset one to restore it.";
      return;
    }
    const activeLayoutId = next.some((layout) => layout.id === this.workspace.activeLayoutId) ? this.workspace.activeLayoutId : next[0].id;
    this.workspace = { ...this.workspace, layouts: next, activeLayoutId };
    this.persistSoon();
  };

  resetActiveLayout = () => {
    const layout = this.activeLayout();
    if (!layout) return;
    this.commitLayout(resetLayout(layout));
    this.workspace = {
      ...this.workspace,
      pew: defaultPewDesk(),
      production: defaultProductionLayout(),
    };
    this.persistSoon();
    this.message = `${layout.name} restored. Program was not changed.`;
  };

  focusSearch = () => {
    this.openFind();
  };

  restoreBuiltinWorkspaces = () => {
    const layouts = restoreBuiltinLayouts(this.workspace.layouts);
    const activeLayoutId = layouts.some((layout) => layout.id === this.workspace.activeLayoutId)
      ? this.workspace.activeLayoutId
      : layouts[0].id;
    this.workspace = { ...this.workspace, layouts, activeLayoutId };
    this.persistSoon();
    this.message = "Built-in workspaces restored.";
  };

  saveLayout = async () => {
    clearTimeout(this.saveTimer);
    await this.persist();
    this.message = "Workspace saved.";
  };

  savePew = (patch: Partial<PewDeskState>) => {
    const pew = normalizePew({ ...this.workspace.pew, ...patch });
    if (samePew(pew, this.workspace.pew)) return;
    this.workspace = { ...this.workspace, pew };
    this.persistSoon();
  };

  saveProductionLayout = (production: ProductionLayout) => {
    const next = normalizeProductionLayout(production);
    if (sameProductionLayout(next, this.workspace.production)) return;
    this.workspace = { ...this.workspace, production: next };
    this.persistSoon();
  };

  setAppearance = (patch: Partial<AppearanceSettings>) => {
    const appearance = { ...this.workspace.appearance, ...patch };
    if (patch.accent) appearance.accent = sanitizeAccent(patch.accent);
    this.workspace = { ...this.workspace, appearance };
    this.persistSoon();
  };

  setLogoText = (logoText: string) => {
    this.workspace = { ...this.workspace, logoText };
    this.persistSoon();
  };

  setAssignments = async (assignments: DisplayAssignment) => {
    const id = this.workspace.activeDisplayProfileId;
    this.workspace = {
      ...this.workspace,
      displayProfiles: this.workspace.displayProfiles.map((profile) => (profile.id === id ? { ...profile, assignments } : profile)),
    };
    this.persistSoon();
    try {
      await this.applyDisplays();
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    }
  };

  useDisplayProfile = async (id: string) => {
    if (!this.workspace.displayProfiles.some((profile) => profile.id === id)) return;
    this.workspace = { ...this.workspace, activeDisplayProfileId: id };
    this.persistSoon();
    try {
      await this.applyDisplays();
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    }
  };

  renameDisplayProfile = (name: string) => {
    const id = this.workspace.activeDisplayProfileId;
    this.workspace = {
      ...this.workspace,
      displayProfiles: this.workspace.displayProfiles.map((profile) => (profile.id === id ? renameProfile(profile, name) : profile)),
    };
    this.persistSoon();
  };

  saveDisplayProfileAs = (name: string) => {
    const profile = this.currentProfile();
    if (!profile || !name.trim()) return;
    const copy = duplicateProfile(profile, `profile-${crypto.randomUUID()}`, name);
    this.workspace = {
      ...this.workspace,
      displayProfiles: [...this.workspace.displayProfiles, copy],
      activeDisplayProfileId: copy.id,
    };
    this.persistSoon();
    this.message = `${copy.name} saved.`;
  };

  deleteDisplayProfile = (id: string) => {
    const next = deleteProfile(this.workspace.displayProfiles, id);
    if (!next) {
      this.message = "The built-in display profile stays on this computer.";
      return;
    }
    const activeDisplayProfileId = next.some((profile) => profile.id === this.workspace.activeDisplayProfileId)
      ? this.workspace.activeDisplayProfileId
      : next[0].id;
    this.workspace = { ...this.workspace, displayProfiles: next, activeDisplayProfileId };
    this.persistSoon();
    void this.applyDisplays();
  };

  run = (command: CommandId) => {
    switch (command) {
      case "take":
        return this.take();
      case "cut":
        return this.cut();
      case "clear":
        return this.clear();
      case "black":
        return this.black();
      case "logo":
        return this.logo();
      case "previous":
        return this.step(-1);
      case "next":
        return this.step(1);
      case "escape":
        this.escape();
        return;
      case "focus":
        this.savePew({ focus: !this.workspace.pew.focus });
        return;
      case "library":
        this.togglePanel("bible");
        return;
      case "queue":
        this.togglePanel("service");
        return;
      case "find":
        this.focusSearch();
        return;
      case "open-settings":
        this.openSettings("appearance");
        return;
      case "save-workspace":
        return this.saveLayout();
      case "toggle-audience":
        return this.output.desired ? this.closeAudience() : this.openAudience();
      case "toggle-live":
        this.liveMode = !this.liveMode;
        return;
      case "timer-pause":
        return this.controlTimer("pause");
      case "timer-resume":
        return this.controlTimer("resume");
      case "timer-reset":
        return this.controlTimer("reset");
    }
  };

  /** Pause, start or reset the timer(s) on Program, in place (no fade), and on the audience. */
  controlTimer = async (action: TimerAction) => {
    const model = controlTimers(this.live.program.model, action, Date.now());
    if (!model) {
      this.message = "There is no timer on Program.";
      return;
    }
    this.live = replaceProgramModel(this.live, model, "cut");
    await this.pushProgram();
    this.message = action === "pause" ? "Timer paused." : action === "resume" ? "Timer running." : "Timer reset. Start it when ready.";
  };

  /** "running", "paused" or "" (no controllable timer on Program). */
  get programTimerState(): "running" | "paused" | "" {
    const timers = timersIn(this.live.program.model);
    if (!timers.length) return "";
    return timers.some((timer) => timer.running) ? "running" : "paused";
  }

  escape = () => {
    if (this.findOpen) {
      this.closeFind();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  };

  matchesProgram = (): boolean => JSON.stringify(this.live.preview.model) === JSON.stringify(this.live.program.model);

  idleModel = (): PresentationModel => emptyModel(this.theme());
  blackPreview = (): PresentationModel => blackModel(this.theme());
  logoPreview = (): PresentationModel => logoModel(this.theme(), this.logoTitle(), this.mediaSrc(this.workspace.logoAssetId));
}

export const session = new Session();

export function passageFromHit(hit: { bookOrd: number; bookName: string; chapter: number; verse: number }, translationId: string): BibleItem {
  const book = CANON.find((entry) => entry.ord === hit.bookOrd);
  const reference = formatReference(hit.bookName, hit.chapter, hit.verse, hit.verse, book?.chapters ?? 99);
  return {
    translationId,
    bookOrd: hit.bookOrd,
    chapter: hit.chapter,
    startVerse: hit.verse,
    endVerse: hit.verse,
    reference,
  };
}
