import { noteSongUse } from "../domain/song-usage";
import { invoke } from "@tauri-apps/api/core";
import { applyExtras, backupName, extrasFrom, type BackupExtras } from "../platform/backup";
import { importPlan, listPlans, listServiceTypes, pcoAuthorization, type PcoPlan } from "../integrations/pco";
import { videoPosition, type VideoControl } from "../domain/types";
import { attributionFor, configureOnlineBibles, type OnlineBibleChoice } from "../bible/online-bibles";
import { emptyTourProgress, type TourId } from "../tour/steps";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { shiftPassage, stepVerse } from "../bible/passage";
import { CANON, formatReference, parseReference, withChapterCounts, type CanonBook } from "../bible/reference";
import type { CommandId } from "../commands/registry";
import { api, mediaUrl } from "../db/api";
import { claimOwner, controlsOutput, publishLocal, publishStageLocal, publishStandbyLocal, readOwner, type StageLayout, type StageSnapshot } from "../display/channel";
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
  COMPOSITION_TEMPLATES,
  fillTemplate,
  persistLook,
  presentComposition,
  swapSides,
  scriptureLayerOf,
  compositionIdFromSource,
  compositionSourceId,
  withLiveScripture,
  layoutFromLook,
  presentSavedLook,
  previewComposition,
  queueLook,
  removeLayer,
  removeLook,
  restoreComposition,
  sanitizeComposition,
  setCompositionColor,
  setCompositionLocked,
  moveLook,
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
  discoverCameras,
  type CameraDiscoveryMedia,
  openCamera,
  presentCamera,
  previewCameraLive,
  stopCameraStream,
  type CameraDevice,
} from "../domain/camera";
import { broadcastRelayTransport, CameraRelaySender, relayEnabled, tauriRelayTransport } from "../display/camera-relay";
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
import { controllerDevice } from "../domain/remote";
import { findItem, moveInList, sectionIdForInsert, stepCursor } from "../domain/service";
import { deskNotes, sanitizeSermon, sermonAudienceItem, sermonError, stepSermonSection } from "../domain/sermon";
import { readZip } from "../domain/zip";
import { dropToFree, redeemCode, sanitizeProfile, validEmail, effectivePlan, planIncludes, startTrial, TRIAL_DAYS, trialDaysLeft, type PlanFeature, type PlanId } from "../domain/plans";
import { sanitizeSongPacks, type SongPack } from "../domain/song-packs";
import { cleanCcli, cleanFolder, creditFor, lyricsFor, sanitizeFolderNames, sanitizeSong, sectionPlace, songError, songFromFile, stepSongSection } from "../domain/song";
import { recentSongHits, rememberSongRecent, searchSongHits, type SongHit, type SongRecent } from "../domain/song-search";
import { blackModel, DEFAULT_THEME_ID, defaultTheme, defaultWorkspace, emptyModel, factoryThemes, logoModel, mergeFactoryThemes, sanitizeTheme } from "../domain/theme";
import { defaultPewDesk, normalizePew, samePew } from "../workspace/pew";
import { defaultProductionLayout, normalizeProductionLayout, sameProductionLayout } from "../workspace/production";
import type {
  AppearanceSettings,
  PewDeskState,
  PewMonitors,
  VerseText,
  LiveFrame,
  PewPage,
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
  ProgramAlert,
} from "../domain/types";
import { canUse } from "../platform/capabilities";
import { styleModel } from "../domain/text-style";
import { deckItem, sanitizeDeck, stepDeckPage, type SlideDeck } from "../domain/decks";
import { sanitizeAlert, withAlert } from "../domain/overlays";
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
import { aspectFor, cleanAspect, sanitizeScreenShape, type ScreenShape } from "../display/shape";
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
import { favoritesFirst, isFavorite, isFavoritePassage, toggleFavorite, toggleFavoritePassage, type FavoriteKind } from "../domain/favorites";

const fixedShape = (shape: unknown) => sanitizeScreenShape(shape) !== "auto";

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
  #cameraFeeds = $state.raw<CameraFeeds<MediaStream>>({});
  get cameraFeeds() {
    return this.#cameraFeeds;
  }
  set cameraFeeds(next: CameraFeeds<MediaStream>) {
    this.#cameraFeeds = next;
    this.cameraRelay?.sync(next);
  }
  /** Streams this window's cameras to the audience window (WebKit lets one window capture a camera). */
  private cameraRelay: CameraRelaySender | null = null;
  private openingFeeds = new Map<string, Promise<boolean>>();
  private standbySent = "";
  cameraNote = $state("");
  /** Last look put on Preview (saved or draft). Used so TAKE can read its transition before Save. */
  lookOnPreview = $state<Composition | null>(null);
  /** The look on Program as it was taken (with any verse stepped since), so it can move on live. */
  lookOnProgram = $state<Composition | null>(null);
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
    // An active alert rides on every Program frame until it is cleared or expires.
    const model = withAlert(next.program.model, this.alert);
    this.#live = model === next.program.model ? next : { ...next, program: { ...next.program, model } };
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
  private unlistenAudienceCamera: UnlistenFn | undefined;
  /** Cameras the audience window reported it could not open, by camera source id. */
  audienceCameraErrors = $state<Record<string, string>>({});
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
    void this.startCameraRelay();
    if (typeof window !== "undefined") setInterval(() => (this.planClock = Date.now()), 60_000);
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
      this.booted = true;
      this.listenRemote();
      if (this.desktop()) void this.attachLanRemote();
      // Automatic backups to the chosen folder, every half hour while the app is open.
      if (this.desktop()) setInterval(() => void (this.workspace.backup.folder && this.backupNow()), 30 * 60 * 1000);
      if (this.message === "Opening workspace") {
        this.message = this.desktop() ? this.output.message : "Browser session. Audience output opens in its own window.";
      }
      if (!keepLive && this.cursor.itemId && this.service) await this.selectItem(this.cursor.itemId);
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      this.ready = true;
      this.booted = true;
      this.listenRemote();
      if (this.desktop()) void this.attachLanRemote();
      console.error(error);
    }
  };

  private loadBibleCatalog = async () => {
    configureOnlineBibles(this.workspace.onlineBibles.key, this.workspace.onlineBibles.bibles);
    this.translations = await api.translations();
    const translationId = this.translations[0]?.id;
    if (translationId) this.books = withChapterCounts(await api.books(translationId));
  };

  private loadLibraries = async () => {
    this.output = await api.outputStatus();
    this.unlisten = await listen<OutputStatus>("output-status", (event) => {
      this.output = event.payload;
    });
    this.unlistenAudienceCamera = await listen<{ id?: unknown; error?: unknown }>("audience-camera", (event) => {
      const id = typeof event.payload?.id === "string" ? event.payload.id : "";
      const error = typeof event.payload?.error === "string" ? event.payload.error.slice(0, 200) : "";
      if (!id) return;
      const label = this.cameraLabel(id);
      this.audienceCameraErrors = error
        ? { ...this.audienceCameraErrors, [id]: error }
        : Object.fromEntries(Object.entries(this.audienceCameraErrors).filter(([key]) => key !== id));
      if (error) this.message = `The audience screen cannot show ${label}: ${error} It keeps trying.`;
      else if (this.message.startsWith(`The audience screen cannot show ${label}`)) this.message = `${label} is showing on the audience screen.`;
    });
    configureOnlineBibles(this.workspace.onlineBibles.key, this.workspace.onlineBibles.bibles);
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
    this.unlistenAudienceCamera?.();
    this.unlistenRemote?.();
    this.unlistenLan?.();
    this.releaseCameras();
    this.cameraRelay?.destroy();
    this.cameraRelay = null;
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
      this.message = "This window can send to the audience. Go live when you are ready.";
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
      calm: this.workspace.appearance.calm === true,
      ...(fixedShape(this.workspace.appearance.screenShape) ? { aspect: aspectFor(sanitizeScreenShape(this.workspace.appearance.screenShape), null) } : {}),
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

  /** Back up to the chosen folder now (desktop). Returns an error to show, or null. */
  backupNow = async (): Promise<string | null> => {
    const folder = this.workspace.backup.folder;
    if (!folder || !this.desktop()) return "Choose a backup folder first.";
    try {
      const library = await this.exportLibrary();
      const snapshot = { ...library, extras: extrasFrom(this.workspace, await api.sermonList()) };
      await invoke("backup_write", { dir: folder, name: backupName(), contents: JSON.stringify(snapshot) });
      this.workspace = { ...this.workspace, backup: { ...this.workspace.backup, lastAt: new Date().toISOString() } };
      this.persistSoon();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  setBackupFolder = (folder: string) => {
    this.workspace = { ...this.workspace, backup: { ...this.workspace.backup, folder } };
    this.persistSoon();
  };

  /** Bring in the newest backup from the folder: songs, services, sermons, decks, looks and layouts. */
  restoreLatestBackup = async (): Promise<string> => {
    const folder = this.workspace.backup.folder;
    if (!folder || !this.desktop()) return "Choose the backup folder first.";
    const latest = await invoke<[string, string] | null>("backup_latest", { dir: folder });
    if (!latest) return "There is no Church Studio backup in that folder yet.";
    const payload = JSON.parse(latest[1]) as { extras?: Partial<BackupExtras> };
    await this.importLibrary(payload);
    const extras = payload.extras ?? {};
    for (const sermon of Array.isArray(extras.sermons) ? extras.sermons : []) await api.sermonSave(sermon);
    this.sermons = await api.sermonList();
    this.workspace = applyExtras(this.workspace, extras);
    this.persistSoon();
    return `Restored ${latest[0].replace(/\.json$/, "")}.`;
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

  /** A PowerPoint file becomes an editable slide deck; its pictures go into the media library. */
  importPowerPoint = async (file: File): Promise<string | null> => {
    const name = file.name.replace(/\.pptx$/i, "") || "Presentation";
    if (/\.(ppt|key)$/i.test(file.name)) {
      this.message = "Save it as a .pptx (PowerPoint) or a PDF, then import it. Older .ppt and Keynote files cannot be read directly.";
      return null;
    }
    try {
      const { parsePptx, pptxMediaFiles, pptxToDeck } = await import("../domain/pptx");
      this.message = `Reading ${file.name}…`;
      const presentation = await parsePptx(new Uint8Array(await file.arrayBuffer()));
      const imported = new Map<string, { id: string; name: string; url: string }>();
      const pictures = pptxMediaFiles(presentation);
      for (const [index, picture] of pictures.entries()) {
        this.message = `Importing ${file.name}: picture ${index + 1} of ${pictures.length}…`;
        const asset = await api.importMediaBytes(`${name} ${picture.name}`, new Blob([picture.data as BlobPart], { type: picture.mime }));
        this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
        const url = mediaUrl(asset);
        if (url) imported.set(picture.path, { id: asset.id, name: asset.name, url });
      }
      const deck = pptxToDeck(presentation, name, (path) => imported.get(path) ?? null);
      if (deck.pages.length === 0) {
        this.message = `${file.name} has no slides to import.`;
        return null;
      }
      this.saveDeck(deck);
      const skipped = presentation.slides.length > deck.pages.length ? ` (first ${deck.pages.length})` : "";
      this.message = `Imported ${deck.pages.length} slide${deck.pages.length === 1 ? "" : "s"} from ${file.name}${skipped} as the deck “${deck.name}”. Tables, charts and SmartArt are not brought over.`;
      return deck.id;
    } catch (error) {
      this.message = error instanceof Error ? error.message : `${file.name} could not be imported.`;
      return null;
    }
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
    if (!this.requireFeature("phone-remote")) return;
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
    this.message = `${device?.name ?? "Phone"} can control this desk. Go live on the phone changes what the audience sees.`;
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

  /**
   * A key for Stream Deck (Bitfocus Companion), scripts or other controllers. Only its hash is
   * stored; the key itself is returned once to show the operator. Starts the network server.
   */
  createControllerKey = async (name: string): Promise<string | null> => {
    if (!this.requireFeature("phone-remote")) return null;
    const token = randomToken(24);
    const device = controllerDevice(crypto.randomUUID(), name.trim() || "Stream Deck", await sha256Hex(token), Date.now());
    const gate = this.remoteGate();
    this.applyRemoteGate({ ...gate, devices: [...gate.devices, device] }, true);
    if (this.desktop() && !this.remoteLanUrl) await this.attachLanRemote(true);
    this.message = `${device.name} can now control this desk. Copy its links now; the key is shown only once.`;
    return token;
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
  private runFromRemote = async (command: CommandId | "next-item" | "previous-item") => {
    if (command === "next-item" || command === "previous-item") {
      await this.stepItem(command === "next-item" ? 1 : -1);
      return;
    }
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
  /** What an item looks like on screen (the item editor's live preview). */
  renderItem = (item: PresentationItem): Promise<PresentationModel> => this.modelFor(item);

  private async modelFor(item: PresentationItem): Promise<PresentationModel> {
    const model = await this.baseModelFor(item);
    return this.withBackdrop(item.style ? styleModel(model, item.style) : model);
  }

  /** A theme's video background travels in the frame as a playable URL (the audience window has no library). */
  private withBackdrop = (model: PresentationModel): PresentationModel => {
    const background = model.theme.background;
    if (background.type !== "video") return model;
    return { ...model, backgroundVideoUrl: this.mediaSrc(background.assetId) };
  };

  /** The same verses in the side-by-side translation, if one is chosen and it is not this one. */
  private async parallelVerses(bible: BibleItem): Promise<{ attribution: string | null; verses: VerseText[] } | null> {
    const id = this.workspace.parallelTranslationId;
    if (!id || id === bible.translationId) return null;
    const translation = this.translations.find((entry) => entry.id === id);
    if (!translation) return null;
    try {
      const verses = await api.passage(id, bible.bookOrd, bible.chapter, bible.startVerse, bible.endVerse);
      return { attribution: attributionFor(translation), verses };
    } catch {
      // An online translation that cannot be reached leaves the slide in one translation.
      return null;
    }
  }

  /** Choose the side-by-side translation (null for one translation), and refresh Preview. */
  setParallelTranslation = async (id: string | null) => {
    this.workspace = { ...this.workspace, parallelTranslationId: id };
    this.persistSoon();
    if (this.previewBible) await this.previewPassage(this.previewBible);
  };

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
      const second = await this.parallelVerses(item.bible);
      return presentScripture({
        theme,
        backgroundImageUrl,
        reference: item.bible.reference,
        attribution: attributionFor(translation),
        verses,
        second,
      });
    }
    if (item.kind === "lyric" && item.lyric) {
      const song = this.songs.find((entry) => entry.id === item.lyric?.songId);
      const lyrics = lyricsFor(song, item.lyric.sectionId, item.title);
      const credit = song ? creditFor(song, item.lyric.sectionId, this.workspace.ccliLicense) : null;
      return presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines, credit });
    }
    if (item.kind === "image" && item.image) {
      return presentImageOrEmpty(theme, this.mediaSrc(item.image.assetId));
    }
    if (item.kind === "video" && item.video) {
      return presentVideo({ theme, videoUrl: this.mediaSrc(item.video.assetId), loop: item.video.loop, muted: item.video.muted });
    }
    if (item.kind === "deck" && item.deck) {
      const deck = this.decks.find((entry) => entry.id === item.deck?.deckId);
      const page = deck?.pages[0];
      if (!page) return emptyModel(theme);
      return presentComposition(withMediaUrls(page, this.mediaSrc), { theme, now: Date.now() });
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
    if (found.item.kind === "deck" && found.item.deck) {
      const deckId = found.item.deck.deckId;
      if (this.decks.some((entry) => entry.id === deckId)) this.previewDeckPage(deckId, 0);
      else this.previewModel(emptyModel(this.theme()), itemId);
      this.persistSoon();
      return;
    }
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
      if (this.stepSong(direction)) return;
      // Past the last (or first) section of a song in the service: on to the next item.
      const cursorItem = this.service && this.cursor.itemId ? findItem(this.service, this.cursor.itemId)?.item : null;
      if (cursorItem?.kind !== "lyric" || cursorItem.lyric?.songId !== this.songFocus.songId) return;
      await this.stepItem(direction);
      return;
    }
    // A deck on Preview steps by page, then on through the rundown at either end.
    const focus = this.deckFocus;
    if (focus && this.live.preview.sourceId === `deck:${focus.deckId}:${focus.index}`) {
      const deck = this.decks.find((entry) => entry.id === focus.deckId);
      const next = deck ? stepDeckPage(deck, focus.index, direction) : null;
      if (deck && next !== null) {
        this.previewDeckPage(deck.id, next);
        return;
      }
    }
    // A verse searched or spoken onto Preview (not the selected service item) steps by verse.
    const cursorItem = this.service && this.cursor.itemId ? findItem(this.service, this.cursor.itemId)?.item : null;
    const freeVerse =
      this.live.preview.model.layout === "scripture" &&
      this.previewBible !== null &&
      cursorItem?.bible?.reference !== this.previewBible.reference;
    if (freeVerse && (await this.stepPreviewScripture(direction))) return;
    // A look with a scripture region on Preview steps its verse.
    if (this.lookVerse("preview") && (await this.stepLookVerse("preview", direction))) return;
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

  /**
   * The look showing on Preview or Program. Program keeps the copy that was taken (and stepped);
   * otherwise the saved look with that id.
   */
  lookAt = (target: "preview" | "program"): Composition | null => {
    const frameNow = target === "preview" ? this.live.preview : this.live.program;
    const id = compositionIdFromSource(frameNow.sourceId);
    if (!id || frameNow.model.layout !== "composition") return null;
    const held = target === "preview" ? this.lookOnPreview : this.lookOnProgram;
    if (held?.id === id) return held;
    if (target === "program" && this.lookOnPreview?.id === id) return this.lookOnPreview;
    const saved = this.workspace.compositions.find((entry) => entry.id === id);
    return saved ? restoreComposition(saved) : null;
  };

  /** The verse in the scripture region of the look on Preview or Program. */
  lookVerse = (target: "preview" | "program"): { reference: string; translationId: string } | null => {
    const look = this.lookAt(target);
    const layer = look ? scriptureLayerOf(look) : undefined;
    if (!layer) return null;
    return { reference: layer.source.payload.reference ?? "", translationId: this.translationForLayer(layer.source.payload) };
  };

  /** The translation a region's verse came from: saved with it, or matched by its attribution. */
  private translationForLayer = (payload: Record<string, string>): string => {
    if (payload.translationId && this.translations.some((entry) => entry.id === payload.translationId)) return payload.translationId;
    const named = this.translations.find((entry) => entry.abbreviation === payload.attribution || attributionFor(entry) === payload.attribution);
    return named?.id ?? this.translations[0]?.id ?? "";
  };

  /**
   * Put a verse in the look on Preview or Program. Program changes at once (that is the point of
   * the Live row); Preview waits for GO LIVE as always.
   */
  setLookVerse = async (target: "preview" | "program", reference: string, translationId?: string): Promise<boolean> => {
    const look = this.lookAt(target);
    const layer = look ? scriptureLayerOf(look) : undefined;
    if (!look || !layer) {
      this.message = target === "program" ? "The look on Program has no scripture region." : "Put a look with a scripture region on Preview first.";
      return false;
    }
    const translation = translationId ?? this.translationForLayer(layer.source.payload);
    const fields = await this.scriptureFields(reference, translation);
    if (!fields || fields.type !== "scripture") {
      this.message = `Nothing found for “${reference.trim()}”. Try John 3:16 or Psalm 23:1-3.`;
      return false;
    }
    const next = withLiveScripture(look, layer.id, { reference: fields.reference, body: fields.body, attribution: fields.attribution, verse: fields.verse, translationId: translation });
    const model = presentComposition(withMediaUrls(next, this.mediaSrc), { theme: this.theme(), now: Date.now() });
    if (target === "preview") {
      this.lookOnPreview = next;
      this.live = setPreview(this.live, frame(model, compositionSourceId(next.id), "cut"));
      this.message = `${fields.reference} is on Preview. GO LIVE sends it.`;
      return true;
    }
    if (!this.desktop() && !this.controlsAudience) {
      this.message = "This window is not sending to the audience.";
      return false;
    }
    this.lookOnProgram = next;
    this.live = replaceProgramModel(this.live, model, "fade");
    await this.pushProgram();
    this.message = `${fields.reference} is live.`;
    return true;
  };

  /** Next or previous verse in a look's scripture region (a range moves by its own length, on into the next chapter). */
  stepLookVerse = async (target: "preview" | "program", direction: 1 | -1): Promise<boolean> => {
    const current = this.lookVerse(target);
    const parsed = current ? parseReference(current.reference, this.books) : null;
    if (!current || !parsed?.startVerse) return false;
    const book = this.books.find((entry) => entry.ord === parsed.bookOrd);
    if (!book) return false;
    const passage: BibleItem = {
      translationId: current.translationId,
      bookOrd: parsed.bookOrd,
      chapter: parsed.chapter,
      startVerse: parsed.startVerse,
      endVerse: parsed.endVerse ?? parsed.startVerse,
      reference: current.reference,
    };
    const verses = await api.verses(current.translationId, parsed.bookOrd, parsed.chapter);
    let next = shiftPassage(passage, direction, book, verses.length);
    if (!next) {
      const chapter = parsed.chapter + direction;
      if (chapter < 1 || chapter > book.chapters) {
        this.message = direction > 0 ? `That is the end of ${book.name}.` : `That is the start of ${book.name}.`;
        return false;
      }
      const count = direction > 0 ? 1 : (await api.verses(current.translationId, parsed.bookOrd, chapter)).length;
      if (count < 1) return false;
      next = { ...passage, chapter, startVerse: count, endVerse: count, reference: formatReference(book.name, chapter, count, count, book.chapters) };
    }
    return this.setLookVerse(target, next.reference, current.translationId);
  };

  /** Swap sides of the look on Preview (mirror left to right). Program is untouched. */
  canSwapPreview = () => !!this.lookOnPreview && !this.lookOnPreview.locked && this.live.preview.model.layout === "composition";
  swapPreviewSides = () => {
    if (!this.canSwapPreview()) return;
    this.previewLook(swapSides(this.lookOnPreview!));
    this.message = "Sides swapped on Preview.";
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

  /** Save a look's arrangement as a layout to start from again (content is filled from the desk). */
  saveLookLayout = (composition: Composition) => {
    const layout = layoutFromLook(composition, composition.name);
    if (layout.slots.length === 0) {
      this.message = "Add a visible layer before saving a layout.";
      return;
    }
    this.workspace = { ...this.workspace, customLayouts: [layout, ...this.workspace.customLayouts].slice(0, 60) };
    this.persistSoon();
    this.message = `${layout.name} saved under Your layouts.`;
  };

  deleteLookLayout = (id: string) => {
    this.workspace = { ...this.workspace, customLayouts: this.workspace.customLayouts.filter((layout) => layout.id !== id) };
    this.persistSoon();
  };

  /** Create an empty scene (look), persist it, and stage Preview only. */
  createSceneLook = (name = "Scene") => {
    const scene = createScene(name);
    this.saveLook(scene);
    this.previewLook(scene);
    this.message = `${scene.name} is on Preview. LIVE still sends Program.`;
    return scene;
  };

  /**
   * A new scene, empty or started from a layout and filled from the desk: its cameras, the
   * verse or song on Preview, the first picture, the church name. Goes to Preview only.
   */
  createSceneFromLayout = async (name: string, color: string | null, templateId: string | null) => {
    const template = templateId ? COMPOSITION_TEMPLATES.find((entry) => entry.id === templateId) : undefined;
    let scene: Composition;
    if (!template) scene = createScene(name);
    else {
      if (template.slots.some((slot) => slot.role === "camera")) await this.loadCameras();
      const preview = this.live.preview.model;
      const verse = preview.layout === "scripture" ? preview : null;
      const words = preview.layout === "lyrics" ? preview : null;
      const picture = this.media.find((asset) => asset.kind !== "video");
      scene = fillTemplate(template, {
        scripture: verse
          ? { reference: verse.reference ?? "", body: verse.lines.map((line) => line.text).join(" "), attribution: verse.attribution ?? "", verse: Number(verse.lines[0]?.marker) || 1 }
          : { reference: "John 3:16", body: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", attribution: "KJV", verse: 16 },
        lyrics: words ? { label: words.reference ?? "Lyrics", lines: words.lines.map((line) => line.text) } : { label: "Verse 1", lines: ["Add the words in the Properties"] },
        cameras: this.cameras.map((camera) => ({ id: camera.deviceId, label: camera.label })),
        image: { imageUrl: (picture && this.mediaSrc(picture.id)) || "", title: picture?.name ?? "Picture" },
        announcement: { heading: this.workspace.churchName || "Welcome", body: "" },
        timer: { durationMs: 5 * 60_000, label: "Service starts in" },
        lowerThird: { title: this.workspace.churchName || "Speaker", subtitle: "" },
      });
      scene = { ...scene, name };
    }
    if (color) scene = { ...scene, color };
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

  /** Folder color for a scene. Organizing only, so it works on locked scenes too. */
  setSceneColor = (id: string, color: string | null) => {
    const saved = this.workspace.compositions.find((entry) => entry.id === id);
    if (!saved) return;
    const next = setCompositionColor(restoreComposition(saved), color);
    this.workspace = { ...this.workspace, compositions: this.workspace.compositions.map((entry) => (entry.id === id ? next : entry)) };
    if (this.lookOnPreview?.id === id) this.lookOnPreview = next;
    this.persistSoon();
  };

  /** Reorder the Scenes list: drop `id` before the scene now at `toIndex` (or at the end). */
  moveScene = (id: string, toIndex: number) => {
    const next = moveLook(this.workspace.compositions, id, toIndex);
    if (next === this.workspace.compositions) return;
    this.workspace = { ...this.workspace, compositions: next };
    this.persistSoon();
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
    this.message = `${name} saved. Program updates when you go live.`;
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
    if (!this.requireFeature("voice")) return;
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
      const options = { wake: settings?.wake === true, custom: settings?.custom as CustomVoiceCommand[] | undefined, translations: this.translations };
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

  /** Resolve a typed reference to scripture fields (a chosen translation, else the first). */
  scriptureFields = async (reference: string, translationId?: string): Promise<SourceFields | null> => {
    const parsed = parseReference(reference, this.books);
    const translation = this.translations.find((entry) => entry.id === translationId) ?? this.translations[0];
    if (!parsed?.startVerse || !translation) return null;
    const book = this.books.find((entry) => entry.ord === parsed.bookOrd);
    const end = parsed.endVerse ?? parsed.startVerse;
    const verses = await api.passage(translation.id, parsed.bookOrd, parsed.chapter, parsed.startVerse, end);
    if (!verses.length) return null;
    return {
      type: "scripture",
      reference: formatReference(book?.name ?? "", parsed.chapter, parsed.startVerse, end, book?.chapters ?? 1),
      body: verses.map((verse) => verse.text).join(" "),
      attribution: attributionFor(translation) ?? translation.abbreviation,
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

  /** The next or previous item in the running order, whatever is inside the current one. */
  stepItem = async (direction: 1 | -1) => {
    if (!this.service) return;
    const next = stepCursor(this.service, this.cursor, direction);
    if (next.itemId && next.itemId !== this.cursor.itemId) await this.selectItem(next.itemId);
  };

  /** The item after the selected one, for "Up next". */
  nextItem = (): PresentationItem | null => {
    if (!this.service) return null;
    const next = stepCursor(this.service, this.cursor, 1);
    return next.itemId && next.itemId !== this.cursor.itemId ? (findItem(this.service, next.itemId)?.item ?? null) : null;
  };

  /**
   * Add anything to the running order: into the selected section, or a first "Service" section
   * (creating today's service when there is none). Preview changes only when asked.
   */
  addToService = async (item: Omit<PresentationItem, "id">, preview = false): Promise<string> => {
    if (!this.service) await this.createService(`Service ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
    if (!this.service!.sections.length) this.addSection("Service");
    const target = sectionIdForInsert(this.service!, this.cursor)!;
    const full = { ...item, id: uid() } as PresentationItem;
    this.insertItem(target, full);
    this.persistSoon();
    if (preview) await this.selectItem(full.id);
    this.message = `${full.title} added to ${this.service!.name}.`;
    return full.id;
  };

  addSongToService = (song: Song) => {
    const first = song.sections[0];
    if (!first) {
      this.message = `${song.title || "That song"} has no sections yet.`;
      return;
    }
    void this.addToService({ kind: "lyric", title: song.title || "Untitled song", lyric: { songId: song.id, sectionId: first.id } });
  };

  addMediaToService = (asset: MediaAsset) => {
    const video = asset.kind === "video";
    void this.addToService(
      video
        ? { kind: "video", title: asset.name, video: { assetId: asset.id, loop: false, muted: false } }
        : { kind: "image", title: asset.name, image: { assetId: asset.id } },
    );
  };

  addAnnouncementToService = (heading: string, body: string) => {
    const title = heading.trim() || "Announcement";
    void this.addToService({ kind: "announcement", title, announcement: { heading: title, body: body.trim() } });
  };

  addPassageToService = (passage: BibleItem) => {
    this.remember(passage);
    void this.addToService({ kind: "bible", title: passage.reference, bible: passage });
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

  /** Slide decks (Slides tab). */
  get decks(): SlideDeck[] {
    return (this.workspace.decks ?? []).map(sanitizeDeck).filter((deck): deck is SlideDeck => deck !== null);
  }

  /** Which deck page is on Preview, so Next/Previous step pages. */
  deckFocus = $state<{ deckId: string; index: number } | null>(null);

  saveDeck = (deck: SlideDeck) => {
    const exists = this.decks.some((entry) => entry.id === deck.id);
    const decks = exists ? this.decks.map((entry) => (entry.id === deck.id ? deck : entry)) : [deck, ...this.decks];
    this.workspace = { ...this.workspace, decks };
    this.persistSoon();
    this.message = `${deck.name} saved.`;
    // Keep Preview in step with an edited page that is showing.
    const focus = this.deckFocus;
    if (focus?.deckId === deck.id && this.live.preview.sourceId === `deck:${deck.id}:${focus.index}`) {
      this.previewDeckPage(deck.id, Math.min(focus.index, deck.pages.length - 1));
    }
  };

  deleteDeck = (id: string) => {
    const deck = this.decks.find((entry) => entry.id === id);
    this.workspace = { ...this.workspace, decks: this.decks.filter((entry) => entry.id !== id) };
    this.persistSoon();
    if (this.deckFocus?.deckId === id) this.deckFocus = null;
    this.message = `${deck?.name ?? "Deck"} deleted. Program was not changed.`;
  };

  /** Put one deck page on Preview. Program waits for LIVE. */
  previewDeckPage = (deckId: string, index: number) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    const page = deck?.pages[index];
    if (!deck || !page) return;
    this.songFocus = null;
    this.sermonFocus = null;
    this.lookOnPreview = null;
    this.previewBible = null;
    this.deckFocus = { deckId, index };
    const model = presentComposition(withMediaUrls(page, this.mediaSrc), { theme: this.theme(), now: Date.now() });
    this.live = setPreview(this.live, frame(model, `deck:${deckId}:${index}`, page.transition.type === "cut" ? "cut" : "fade"));
    this.message = `${deck.name}: page ${index + 1} of ${deck.pages.length} on Preview. LIVE sends Program.`;
  };

  /** Play, pause, jump or change the volume of the video on Program, on every screen at once. */
  controlVideo = async (change: { kind: "play" | "pause" | "restart" } | { kind: "seek"; at: number } | { kind: "volume"; volume: number }) => {
    const model = this.live.program.model;
    if (model.layout !== "video" || !model.video) return;
    const now = Date.now();
    const current = model.video.control ?? { playing: true, at: 0, stamp: now, volume: 1 };
    const at = videoPosition(current, now);
    let control: VideoControl;
    switch (change.kind) {
      case "play":
        control = { ...current, playing: true, at, stamp: now };
        break;
      case "pause":
        control = { ...current, playing: false, at, stamp: now };
        break;
      case "restart":
        control = { ...current, playing: true, at: 0, stamp: now };
        break;
      case "seek":
        control = { ...current, at: Math.max(0, change.at), stamp: now };
        break;
      default:
        control = { ...current, at, stamp: now, volume: Math.min(1, Math.max(0, change.volume)) };
    }
    this.live = { ...this.live, program: { ...this.live.program, model: { ...model, video: { ...model.video, control } } } };
    await this.pushProgram();
  };

  /** Bring the sound down over a few seconds, then pause; the picture stays. */
  fadeOutVideo = async (seconds = 3) => {
    const start = this.live.program.model.video?.control?.volume ?? 1;
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      if (this.live.program.model.layout !== "video") return;
      await new Promise((resolve) => setTimeout(resolve, (seconds * 1000) / steps));
      await this.controlVideo({ kind: "volume", volume: start * (1 - step / steps) });
    }
    await this.controlVideo({ kind: "pause" });
    await this.controlVideo({ kind: "volume", volume: start });
  };

  // Planning Center Services import.
  setPcoToken = (appId: string, secret: string) => {
    this.workspace = { ...this.workspace, pco: { appId: appId.trim(), secret: secret.trim() } };
    this.persistSoon();
  };

  private pcoGet = (url: string) => api.pcoGet(url, pcoAuthorization(this.workspace.pco.appId, this.workspace.pco.secret));

  pcoServiceTypes = () => listServiceTypes(this.pcoGet);
  pcoPlans = (serviceTypeId: string) => listPlans(this.pcoGet, serviceTypeId);

  /** Bring a plan in as a service (and its new songs into the library), then open it. */
  importPcoPlan = async (plan: PcoPlan) => {
    const result = await importPlan(this.pcoGet, plan, ({ title, ccli }) =>
      this.songs.find((song) => (ccli && song.ccli === ccli) || song.title.trim().toLowerCase() === title.trim().toLowerCase()),
    );
    for (const song of result.songs) await this.saveSong(song);
    await api.serviceSave(result.service);
    this.services = await api.serviceList();
    await this.openService(result.service.id);
    const count = result.service.sections.reduce((total, section) => total + section.items.length, 0);
    this.message = `${result.service.name} imported: ${count} item${count === 1 ? "" : "s"}, ${result.songs.length} new song${result.songs.length === 1 ? "" : "s"}. Open the Service page to run it.`;
    return result;
  };

  /** A slide deck playing on Program by itself (announcements before the service), looping. */
  deckLoop = $state<{ deckId: string; seconds: number; index: number } | null>(null);
  private loopTimer: ReturnType<typeof setInterval> | undefined;

  /** Put a deck on Program and advance it every few seconds, round and round, until stopped. */
  startDeckLoop = async (deckId: string, seconds = 8) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    if (!deck || deck.pages.length === 0) return;
    if (!this.desktop() && !this.controlsAudience) {
      this.message = "This window is not sending to the audience.";
      return;
    }
    this.stopDeckLoop();
    const every = Math.min(600, Math.max(3, Math.round(seconds)));
    this.deckLoop = { deckId, seconds: every, index: 0 };
    await this.showLoopPage();
    this.loopTimer = setInterval(() => {
      const loop = this.deckLoop;
      const current = loop && this.decks.find((entry) => entry.id === loop.deckId);
      if (!loop || !current?.pages.length) return this.stopDeckLoop();
      this.deckLoop = { ...loop, index: (loop.index + 1) % current.pages.length };
      void this.showLoopPage();
    }, every * 1000);
    this.message = `${deck.name} is looping on Program, a page every ${every} seconds. Preview is free for what comes next.`;
  };

  stopDeckLoop = () => {
    clearInterval(this.loopTimer);
    this.loopTimer = undefined;
    if (this.deckLoop) this.message = "Loop stopped. Program stays on the page it was showing.";
    this.deckLoop = null;
  };

  /** The loop writes Program directly, so the operator can keep staging on Preview. */
  private showLoopPage = async () => {
    const loop = this.deckLoop;
    const deck = loop && this.decks.find((entry) => entry.id === loop.deckId);
    const page = deck?.pages[loop!.index];
    if (!loop || !deck || !page) return;
    const model = presentComposition(withMediaUrls(page, this.mediaSrc), { theme: this.theme(), now: Date.now() });
    this.live = { ...this.live, program: frame(model, `deck:${deck.id}:${loop.index}`, page.transition.type === "cut" ? "cut" : "fade"), revision: this.live.revision + 1 };
    await this.pushProgram();
  };

  addDeckToService = async (deckId: string) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    if (!deck) return;
    const target = await this.sectionForMedia();
    if (!target) return;
    const item = deckItem(deck);
    this.insertItem(target, item);
    await this.selectItem(item.id);
    this.message = `${deck.name} queued. Preview only until LIVE.`;
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
      this.withBackdrop(presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines, credit: creditFor(clean, section.id, this.workspace.ccliLicense) })),
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
    // At the first or last section there is nowhere further inside the song.
    if (!next || next.id === focus.sectionId) return false;
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

  songPacks = $state<SongPack[]>([]);

  /** The library and workspace have loaded (the loading screen can go). */
  booted = $state(false);

  /** What each Presenter Desk page last staged on Preview, so every page keeps its own. */
  private pageStage: Partial<Record<PewPage, { preview: LiveFrame; songFocus: Session["songFocus"]; sermonFocus: Session["sermonFocus"]; previewBible: BibleItem | null; lookOnPreview: Composition | null }>> = {};

  /**
   * Leaving one page for another: put away this page's Preview and bring back the other's
   * (empty if it has staged nothing). Program never changes. Returns whether one came back.
   */
  switchPage = (from: PewPage, to: PewPage): boolean => {
    if (from === to) return true;
    this.pageStage[from] = {
      preview: this.live.preview,
      songFocus: this.songFocus,
      sermonFocus: this.sermonFocus,
      previewBible: this.previewBible,
      lookOnPreview: this.lookOnPreview,
    };
    const saved = this.pageStage[to];
    this.live = { ...this.live, preview: saved?.preview ?? { transition: "cut", sourceId: null, model: emptyModel(this.theme()) } };
    this.songFocus = saved?.songFocus ?? null;
    this.sermonFocus = saved?.sermonFocus ?? null;
    this.previewBible = saved?.previewBible ?? null;
    this.lookOnPreview = saved?.lookOnPreview ?? null;
    return !!saved;
  };

  /** The screen tour running now, if any, and the step (in the full list) it starts from. */
  tour = $state<TourId | null>(null);
  tourFrom = $state(0);
  tourHubOpen = $state(false);
  /** A Presenter Desk page the tour needs open (PewDesk switches to it). */
  pageRequest = $state<PewPage | null>(null);

  /** Start a tour, on its own page or desk, from any step. */
  startTour = (id: TourId, from = 0) => {
    this.settingsOpen = false;
    this.tourHubOpen = false;
    if (id === "production") {
      if (!this.requireFeature("production")) return;
      if (this.workspace.appearance.desk !== "obs") this.setAppearance({ desk: "obs" });
    } else {
      if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
      this.pageRequest = id;
    }
    this.tour = null;
    this.tourFrom = Math.max(0, from);
    // Let the page or desk switch paint before the spotlight looks for its targets.
    setTimeout(() => (this.tour = id), 180);
  };

  endTour = () => {
    this.tour = null;
  };

  /** Remember the furthest step seen; `done` when the tour was finished. */
  noteTourStep = (id: TourId, index: number, done = false) => {
    const current = this.workspace.tours[id];
    const seen = Math.max(current.seen, index);
    if (seen === current.seen && (current.done || !done)) return;
    this.workspace = { ...this.workspace, tours: { ...this.workspace.tours, [id]: { seen, done: current.done || done } } };
    this.persistSoon();
  };

  resetTours = () => {
    this.workspace = { ...this.workspace, tours: emptyTourProgress() };
    this.persistSoon();
  };

  /** First-run setup is done (or skipped). Settings > Updates can run it again. */
  finishOnboarding = () => {
    this.workspace = { ...this.workspace, onboarded: true };
    this.persistSoon();
  };

  restartOnboarding = () => {
    this.settingsOpen = false;
    this.workspace = { ...this.workspace, onboarded: false };
  };

  /** Translation ids being downloaded (installed) right now. */
  bibleBusy = $state<string[]>([]);

  /** The church's API.Bible key and chosen licensed translations. */
  setOnlineBibles = async (key: string, bibles: OnlineBibleChoice[]) => {
    this.workspace = { ...this.workspace, onlineBibles: { key: key.trim(), bibles } };
    configureOnlineBibles(key, bibles);
    this.persistSoon();
    this.translations = await api.translations();
  };

  installBible = async (id: string) => {
    if (this.bibleBusy.includes(id)) return;
    this.bibleBusy = [...this.bibleBusy, id];
    try {
      await api.bibleInstall(id);
      this.translations = await api.translations();
      this.message = `${this.translations.find((entry) => entry.id === id)?.name ?? id} is ready.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "That translation could not be downloaded.";
    } finally {
      this.bibleBusy = this.bibleBusy.filter((entry) => entry !== id);
    }
  };

  removeBible = async (id: string) => {
    try {
      await api.bibleRemove(id);
      this.translations = await api.translations();
      this.message = "Translation removed. Download it again any time.";
    } catch (error) {
      this.message = error instanceof Error ? error.message : "That translation could not be removed.";
    }
  };

  // Plans. `now` ticks once a minute so a trial ends on time without a restart.
  planClock = $state(Date.now());
  /** The feature an upgrade prompt is explaining, or null when no prompt is open. */
  upgradeFor = $state<PlanFeature | null>(null);

  get plan(): PlanId {
    return effectivePlan(this.workspace.entitlement, this.planClock);
  }

  get trialDays(): number {
    return trialDaysLeft(this.workspace.entitlement, this.planClock);
  }

  entitled = (feature: PlanFeature): boolean => planIncludes(this.plan, feature);

  /** True when the plan includes the feature; otherwise opens the upgrade prompt and returns false. */
  requireFeature = (feature: PlanFeature): boolean => {
    if (this.entitled(feature)) return true;
    this.upgradeFor = feature;
    return false;
  };

  /** Local sign-in: name and email on this computer until accounts are online. */
  signIn = (name: string, email: string): string | null => {
    if (!validEmail(email)) return "Type a valid email address.";
    this.workspace = { ...this.workspace, profile: sanitizeProfile({ name, email }) };
    this.persistSoon();
    this.message = `Signed in as ${this.workspace.profile?.name}.`;
    return null;
  };

  signOut = () => {
    this.workspace = { ...this.workspace, profile: null };
    this.persistSoon();
    this.message = "Signed out. Your library stays on this computer.";
  };

  /** Add a license key (or a test code in development). Returns an error to show, or null on success. */
  redeemCode = (code: string): string | null => {
    const result = redeemCode(this.workspace.entitlement, code, { now: Date.now() });
    if (!result.ok) return result.error;
    this.workspace = { ...this.workspace, entitlement: result.entitlement };
    this.planClock = Date.now();
    this.persistSoon();
    this.message = `License added: ${result.note}.`;
    return null;
  };

  /** Return to Free: removes a license key or test code from this computer. */
  useFreePlan = () => {
    this.workspace = { ...this.workspace, entitlement: dropToFree(this.workspace.entitlement) };
    this.persistSoon();
    this.message = "Now on Free.";
  };

  startTrial = () => {
    const next = startTrial(this.workspace.entitlement);
    if (next === this.workspace.entitlement) return false;
    this.workspace = { ...this.workspace, entitlement: next };
    this.planClock = Date.now();
    this.persistSoon();
    this.message = `Premium trial started: ${TRIAL_DAYS} days on this computer.`;
    return true;
  };

  /** Packs shipped with the app (static/song-packs/index.json). Missing or broken index: none. */
  loadSongPacks = async () => {
    try {
      const response = await fetch("/song-packs/index.json", { cache: "no-store" });
      this.songPacks = response.ok ? sanitizeSongPacks(await response.json()) : [];
    } catch {
      this.songPacks = [];
    }
  };

  /** Install a pack into its folder. Its songs are copies the church can edit. */
  installSongPack = async (pack: SongPack): Promise<boolean> => {
    try {
      const response = await fetch(`/song-packs/${pack.file}`);
      if (!response.ok) throw new Error(`${pack.name} is not available.`);
      const decoder = new TextDecoder();
      const files = (await readZip(new Uint8Array(await response.arrayBuffer())))
        .filter((entry) => /\.(xml|txt|cho|chordpro|usr)$/i.test(entry.name))
        .map((entry) => ({ name: entry.name.split("/").pop() ?? entry.name, text: decoder.decode(entry.data) }));
      const result = await this.importSongFiles(files, pack.folder);
      this.workspace = { ...this.workspace, installedPacks: [...new Set([...this.workspace.installedPacks, pack.id])] };
      this.persistSoon();
      this.message = `${pack.name}: ${result.added} song${result.added === 1 ? "" : "s"} added to ${pack.folder}.`;
      return true;
    } catch (error) {
      this.message = error instanceof Error ? error.message : `${pack.name} could not be installed.`;
      return false;
    }
  };

  /** Add an empty song folder. Returns the folder name, or null when the name is empty. */
  createSongFolder = (name: string): string | null => {
    const clean = cleanFolder(name);
    if (!clean) return null;
    const existing = this.workspace.songFolders.find((entry) => entry.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    this.workspace = { ...this.workspace, songFolders: sanitizeFolderNames([...this.workspace.songFolders, clean]) };
    this.persistSoon();
    return clean;
  };

  /** Rename a folder and move its songs with it. */
  renameSongFolder = async (from: string, to: string): Promise<string | null> => {
    const clean = cleanFolder(to);
    if (!clean) return null;
    const same = (name: string | undefined) => cleanFolder(name).toLowerCase() === from.toLowerCase();
    for (const song of this.songs.filter((entry) => same(entry.folder))) await api.songSave(sanitizeSong({ ...song, folder: clean }));
    this.workspace = {
      ...this.workspace,
      songFolders: sanitizeFolderNames([...this.workspace.songFolders.filter((entry) => !same(entry)), clean]),
    };
    this.persistSoon();
    this.songs = await api.songList();
    return clean;
  };

  /** Remove a folder. Its songs stay in the library, unfiled. */
  deleteSongFolder = async (name: string) => {
    const same = (entry: string | undefined) => cleanFolder(entry).toLowerCase() === name.toLowerCase();
    for (const song of this.songs.filter((entry) => same(entry.folder))) await api.songSave(sanitizeSong({ ...song, folder: "" }));
    this.workspace = { ...this.workspace, songFolders: this.workspace.songFolders.filter((entry) => !same(entry)) };
    this.persistSoon();
    this.songs = await api.songList();
  };

  moveSongToFolder = async (song: Song, folder: string) => {
    const clean = cleanFolder(folder);
    if (clean) this.createSongFolder(clean);
    await api.songSave(sanitizeSong({ ...song, folder: clean }));
    this.songs = await api.songList();
    this.message = clean ? `${song.title} moved to ${clean}.` : `${song.title} removed from its folder.`;
  };

  /** Import lyric / ChordPro files as songs in a folder. Files with no lyrics are skipped. */
  importSongFiles = async (files: { name: string; text: string }[], folder: string): Promise<{ added: number; skipped: string[] }> => {
    const clean = cleanFolder(folder);
    if (clean) this.createSongFolder(clean);
    let added = 0;
    const skipped: string[] = [];
    for (const file of files) {
      const song = songFromFile(file.name, file.text, clean);
      if (!song || songError(song)) {
        skipped.push(file.name);
        continue;
      }
      await api.songSave(song);
      added += 1;
    }
    this.songs = await api.songList();
    this.message = `${added} song${added === 1 ? "" : "s"} imported${clean ? ` to ${clean}` : ""}.${skipped.length ? ` ${skipped.length} file${skipped.length === 1 ? "" : "s"} had no lyrics.` : ""}`;
    return { added, skipped };
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

  deleteSermon = async (id: string) => {
    await api.sermonDelete(id);
    this.sermons = await api.sermonList();
    if (this.sermonFocus?.sermonId === id) {
      this.sermonFocus = null;
      this.previewModel(emptyModel(this.theme()), null);
    }
    this.message = "Sermon deleted.";
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
    if (!this.watchingDevices && media.addEventListener) {
      this.watchingDevices = true;
      // Phone cameras (Iriun, Camo) often connect after the app opens.
      media.addEventListener("devicechange", () => void this.loadCameras());
    }
    this.discovering ??= discoverCameras(media as unknown as CameraDiscoveryMedia).finally(() => (this.discovering = null));
    const { cameras, note } = await this.discovering;
    this.cameras = cameras;
    this.cameraNote = note;
  };
  private discovering: Promise<{ cameras: CameraDevice[]; note: string }> | null = null;
  private watchingDevices = false;

  private cameraLabel = (id: string) => {
    const deviceId = cameraDeviceId(id);
    return this.cameras.find((camera) => camera.deviceId === deviceId)?.label ?? "the camera";
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

  private startCameraRelay = async () => {
    if (this.cameraRelay || typeof window === "undefined" || typeof RTCPeerConnection === "undefined") return;
    if (!relayEnabled(this.desktop(), typeof localStorage === "undefined" ? null : localStorage)) return;
    try {
      const transport = this.desktop() ? await tauriRelayTransport("operator") : broadcastRelayTransport("operator");
      this.cameraRelay = new CameraRelaySender(transport);
      this.cameraRelay.sync(this.cameraFeeds);
    } catch (error) {
      console.error("Camera relay unavailable", error);
    }
  };

  private releaseCameras = () => {
    for (const stream of Object.values(this.cameraFeeds)) stopCameraStream(stream);
    this.cameraFeeds = {};
  };

  /** Stage (confidence) display: Program now, Preview as next. Separate from the audience packet. */
  private publishStage = () => {
    if (typeof window === "undefined" || !this.stageOpen) return;
    const sermon = this.sermonFocus && this.sermons.find((entry) => entry.id === this.sermonFocus?.sermonId);
    const notes = sermon ? (sermon.sections.find((section) => section.id === this.sermonFocus?.sectionId)?.notes ?? "") : "";
    const snapshot: StageSnapshot = {
      program: this.live.program.model,
      next: this.live.preview.model,
      live: this.output.online,
      desk: this.workspace.churchName,
      at: Date.now(),
      message: this.stageMessage,
      notes,
      layout: this.workspace.stageLayout,
    };
    try {
      publishStageLocal(snapshot);
    } catch {
      // Storage full or blocked: the stage keeps its last frame.
    }
    if (isDesktop()) void emit("stage-frame", JSON.stringify(snapshot)).catch(() => {});
  };

  stageOpen = $state(false);
  /** A message on the stage screen until cleared. Never reaches the audience. */
  stageMessage = $state("");

  sendStageMessage = (text: string) => {
    this.stageMessage = text.trim().slice(0, 140);
    this.publishStage();
    this.message = this.stageMessage ? `Stage now reads “${this.stageMessage}”.` : "Stage message cleared.";
  };

  setStageLayout = (patch: Partial<StageLayout>) => {
    this.workspace = { ...this.workspace, stageLayout: { ...this.workspace.stageLayout, ...patch } };
    this.persistSoon();
    this.publishStage();
  };

  /** The alert on Program (nursery call, car lights…). Never on Preview. */
  alert = $state<ProgramAlert | null>(null);
  recentAlerts = $state<string[]>([]);
  private alertTimer: ReturnType<typeof setTimeout> | undefined;

  showAlert = async (input: { text: string; style: ProgramAlert["style"]; position: ProgramAlert["position"]; seconds: number | null }) => {
    const now = Date.now();
    const alert = sanitizeAlert({ text: input.text, style: input.style, position: input.position, until: input.seconds ? now + input.seconds * 1000 : null, id: `alert:${now}` }, now);
    if (!alert) {
      this.message = "Type the alert first.";
      return;
    }
    this.alert = alert;
    this.recentAlerts = [alert.text, ...this.recentAlerts.filter((text) => text !== alert.text)].slice(0, 6);
    clearTimeout(this.alertTimer);
    if (alert.until) this.alertTimer = setTimeout(() => void this.clearAlert(), alert.until - now);
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
    this.message = alert.until ? `Alert on Program for ${input.seconds} s.` : "Alert on Program until you clear it.";
  };

  clearAlert = async () => {
    clearTimeout(this.alertTimer);
    if (!this.alert) return;
    this.alert = null;
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
    this.message = "Alert cleared.";
  };
  /** Where the browser audience popup was placed, so the stage avoids it. */
  private audienceScreen: ScreenLike | null = null;

  /** Open the stage display: a popup in the browser, a separate window on desktop. Never Program. */
  openStage = async () => {
    if (!this.requireFeature("stage-display")) return;
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

  setCcliLicense = (value: string) => {
    this.workspace = { ...this.workspace, ccliLicense: cleanCcli(value) };
    this.persistSoon();
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

  /** A copy to customise (Premium). Built-in themes are left as they are. */
  duplicateTheme = (id: string): Theme | null => {
    if (!this.requireFeature("theme-library")) return null;
    const source = this.themes.find((theme) => theme.id === id) ?? this.theme();
    const copy = sanitizeTheme({ ...structuredClone($state.snapshot(source)), id: `theme-${uid()}`, name: `${source.name} copy`, premium: undefined });
    this.saveTheme(copy);
    return copy;
  };

  /** Delete a theme you made. Built-in themes stay. */
  deleteTheme = async (id: string) => {
    if (factoryThemes().some((theme) => theme.id === id)) return;
    await api.themeDelete(id);
    this.themes = this.themes.filter((theme) => theme.id !== id);
    if (this.workspace.themeId === id) this.useTheme(this.themes[0]?.id ?? DEFAULT_THEME_ID);
    this.message = "Theme deleted.";
  };

  useTheme = (id: string) => {
    const next = this.themes.find((theme) => theme.id === id);
    if (!next || next.id === this.workspace.themeId) return;
    if (next.premium && !this.requireFeature("theme-library")) return;
    this.workspace = { ...this.workspace, themeId: next.id };
    this.persistSoon();
    this.showThemeOnPreview(next);
  };

  private showThemeOnPreview(next: Theme) {
    if (this.cursor.itemId) void this.selectItem(this.cursor.itemId);
    else this.live = setPreview(this.live, frame(this.withBackdrop({ ...this.live.preview.model, theme: next }), this.live.preview.sourceId, "cut"));
  }

  private act = async (action: "take" | "cut" | "clear" | "black" | "logo") => {
    if (!this.desktop() && !this.controlsAudience) {
      this.message = "This window is not sending to the audience.";
      return;
    }
    // An empty Preview (a page with nothing staged yet) never clears the screen by accident.
    if ((action === "take" || action === "cut") && this.live.preview.model.layout === "empty") {
      this.message = "Nothing on Preview yet. Program did not change.";
      return;
    }
    // The operator taking over Program ends a running loop.
    if (this.deckLoop) this.stopDeckLoop();
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
    // A video going live starts on a shared clock, so every screen plays it in step.
    if ((action === "take" || action === "cut") && this.live.program.model.layout === "video" && this.live.program.model.video) {
      const model = this.live.program.model;
      this.live = { ...this.live, program: { ...this.live.program, model: { ...model, video: { ...model.video!, control: { playing: true, at: 0, stamp: Date.now(), volume: 1 } } } } };
    }
    // A song the congregation now sees counts for CCLI reporting (once per day).
    if ((action === "take" || action === "cut") && this.live.program.model.layout === "lyrics" && this.songFocus) {
      const song = this.songs.find((entry) => entry.id === this.songFocus?.songId);
      if (song) {
        const songUses = noteSongUse(this.workspace.songUses, song);
        if (songUses !== this.workspace.songUses) {
          this.workspace = { ...this.workspace, songUses };
          this.persistSoon();
        }
      }
    }
    // Remember the look that went live, so its verse can step on Program.
    this.lookOnProgram = action === "take" || action === "cut" ? this.lookAt("program") : null;
    await this.pushProgram();
    this.message =
      action === "take"
        ? takeTransition?.type === "cut"
          ? "Cut to program."
          : "Live."
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

  /** A window's own library search (Songs, Sermon) takes "/" while it is open; otherwise Find. */
  localSearch: (() => void) | null = null;

  focusSearch = () => {
    if (this.localSearch) this.localSearch();
    else this.openFind();
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

  /** Show or hide Preview / Program on one Presenter Desk page. */
  setMonitors = (page: PewPage, patch: Partial<PewMonitors>) => {
    const monitors = this.workspace.pew.monitors;
    this.savePew({ monitors: { ...monitors, [page]: { ...monitors[page], ...patch } } });
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

  /** Star or unstar a song, theme, layout, look or picture; stars sit at the top of their list. */
  toggleFavorite = (kind: Exclude<FavoriteKind, "passages">, id: string, name = "") => {
    const was = isFavorite(this.workspace.favorites, kind, id);
    this.workspace = { ...this.workspace, favorites: toggleFavorite(this.workspace.favorites, kind, id) };
    this.persistSoon();
    if (name) this.message = was ? `${name} removed from favorites.` : `${name} added to favorites.`;
  };

  isFavorite = (kind: Exclude<FavoriteKind, "passages">, id: string) => isFavorite(this.workspace.favorites, kind, id);

  /** Pictures and videos with starred ones first, for every media list and picker. */
  get mediaByFavorite() {
    return favoritesFirst(this.media, (asset) => isFavorite(this.workspace.favorites, "media", asset.id));
  }

  /** Themes with starred ones first, for quick theme pickers. */
  get themesByFavorite() {
    return favoritesFirst(this.themes, (theme) => isFavorite(this.workspace.favorites, "themes", theme.id));
  }

  /** Saved looks with starred ones first. */
  get looksByFavorite() {
    return favoritesFirst(this.workspace.compositions, (look) => isFavorite(this.workspace.favorites, "looks", look.id));
  }

  /** Songs with starred ones first, for pickers outside the Songs page. */
  get songsByFavorite() {
    return favoritesFirst(this.songs, (song) => isFavorite(this.workspace.favorites, "songs", song.id));
  }

  /** Star a verse or passage (any translation) to keep it one click away. */
  toggleFavoritePassage = (item: BibleItem) => {
    const was = isFavoritePassage(this.workspace.favorites, item);
    this.workspace = { ...this.workspace, favorites: toggleFavoritePassage(this.workspace.favorites, item) };
    this.persistSoon();
    this.message = was ? `${item.reference} removed from favorites.` : `${item.reference} added to favorites.`;
  };

  isFavoritePassage = (item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">) => isFavoritePassage(this.workspace.favorites, item);

  /** The audience screen's shape. "auto" fills whatever screen the output is on. */
  setScreenShape = (shape: ScreenShape) => {
    this.setAppearance({ screenShape: sanitizeScreenShape(shape) });
    if (this.live.program.model.layout !== "empty") void this.pushProgram();
  };

  /** The audience window measured its screen; the desk's monitors follow it. */
  noteAudienceAspect = (value: unknown) => {
    const aspect = cleanAspect(value);
    if (Math.abs((this.workspace.appearance.measuredAspect ?? 0) - aspect) < 0.005) return;
    this.setAppearance({ measuredAspect: aspect });
  };

  /** Calm backgrounds: hold animated backgrounds still here and on the audience screen. */
  setCalmBackgrounds = (calm: boolean) => {
    this.setAppearance({ calm });
    if (this.live.program.model.layout !== "empty") void this.pushProgram();
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
