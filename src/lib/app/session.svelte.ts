import type { CloudSync } from "./cloud.svelte";
import { noteSongUse } from "../domain/song-usage";
import { guessUiLanguage, t, tn } from "../i18n/core";
import { cuesBetween, sanitizeTimerSounds, type TimerCue, type TimerSounds } from "../domain/timer-cues";
import { playCue } from "../audio/beeper";
import { cleanTrim, endPoint, videoEnd, type VideoEnd } from "../domain/video-play";
import { buildSlideIndex, matchSlide, type SlideIndex, type SlideMatch, type SlideText } from "../voice/slide-follow";
import { activationFrom, idleActivation, RENEW_EARLY_DAYS, type ActivatedDevice, type ActivationState } from "../domain/activation";
import { CHECKOUT_WAIT_MS, freeStatus, serverCall, type AccountStatus, type CheckoutPoll, type CheckoutStart, type EntitlementStatus, type Interval, type PromoResult, type SignedInComputer, type SigninPoll, type SigninStart, type SigninToken, pkcePair } from "../domain/billing";
import { readLicense } from "../domain/license";
import { QUALITIES, recordingStamp, sanitizeBroadcast, streamTarget, type BroadcastSettings } from "../domain/broadcast";
import { recordingMinutes } from "../domain/readiness";
import { idleSwitcher, ObsSwitcher, sanitizeSwitcher, VmixSwitcher, type Switcher, type SwitcherSettings, type SwitcherState } from "../integrations/switcher";
import { invoke } from "@tauri-apps/api/core";
import { applyExtras, backupName, extrasFrom, type BackupExtras } from "../platform/backup";
import { importPlan, listPlans, listServiceTypes, pcoAuthorization, type PcoPlan } from "../integrations/pco";
import { videoPosition, type VideoControl } from "../domain/types";
import { attributionFor, configureOnlineBibles, type OnlineBibleChoice } from "../bible/online-bibles";
import { emptyTourProgress, TOUR_FEATURES, type TourId } from "../tour/steps";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { screenful, screenStarts, shiftPassage, stepScreenful, stepVerse, versesPerScreen } from "../bible/passage";
import { CANON, formatReference, parseReference, withChapterCounts, type CanonBook } from "../bible/reference";
import type { CommandId } from "../commands/registry";
import { api, mediaUrl } from "../db/api";
import { claimOwner, controlsOutput, publishLocal, publishStageLocal, publishStandbyLocal, readOwner, type StageLayout, type StageSnapshot, publishSecondLocal, publishCaptionsLocal } from "../display/channel";
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
  setSlideResolver,
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
  presentLowerThird,
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
import { applyProgramAction, createLiveState, frame, programPacket, replaceProgramModel, restoreProgram, setPreview, withoutWords } from "../domain/live";

/** The Undo key as this computer writes it. */
function shortcutLabelForUndo(): string {
  return shortcutKeys("⌘Z");
}

/** What went wrong, in the system's words when it gave some, else our own line. */
function errorText(error: unknown, fallback = String(error)): string {
  return error instanceof Error ? error.message : fallback;
}
import { presentImageOrEmpty, presentLyrics, presentScripture, presentText, presentVideo, presentWeb } from "../domain/present";
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
import { captionsDevice, controllerDevice, stageDevice } from "../domain/remote";
import { keyWords } from "../domain/ndi";
import { presentAnnouncement, type AnnouncementDesign } from "../domain/announcement";
import { slotFor, songOrder, songSlots, stepSlot } from "../domain/song-order";
import { clampScreen, sanitizeSongLines, screensOf, type SongLines, type SongScreen } from "../domain/song-screens";
import { addTracks, MAX_CROSSFADE, moveTrack, removeTrackAt, type AudioSettings, type Playlist } from "../domain/playlists";
import { AudioDeck, SoundPad, canChooseOutput } from "../audio/deck.svelte";
import { changedByHand, outputsKey, planOutput, sanitizeTransport, type AudioOutputDevice, type OutputDecision } from "../audio/outputs";
import { evenGain, measureUrl } from "../audio/loudness";
import { readBibleFile, verseCount } from "../bible/import";
import { stageChords, type ChordLine } from "../domain/chords";
import { assignShortcut, defaultShortcuts } from "../keyboard/manager";
import { describeStep, type Macro, type MacroStep } from "../domain/macros";
import type { ScreenTransition, ShortcutAction, TransitionKind } from "../domain/types";
import { secondOutputModel, type SecondOutputSettings } from "../domain/second-output";
import { clockLabel, DEFAULT_START, minutesOfDay, parseClock, planSchedule, readSavedStarts, sectionDeadline, sectionTiming, shiftSchedule } from "../domain/schedule";
import { serviceFromTemplate, serviceNameFor, templateFromService, type ServiceTemplate } from "../domain/service-templates";
import { addHeard, captionRows, emptyCaptions, linesFor, withTranslation, CAPTION_LANGUAGES, type CaptionSettings } from "../domain/captions";
import { parseTranslations, translateRequest } from "../ai/translate";
import { clearGoneLive, goneLiveKey, pinGoneLive, recordGoneLive, removeGoneLive } from "../domain/gone-live";
import { findItem, moveInList, nextPart, partDesks, partKey, partRun, sectionIdForInsert, stepCursor, moveTo, moveItemTo, type PartDesk, type PartRun, type PresenterPage, type ServiceSummary } from "../domain/service";
import { deskNotes, deskNotesRich, sanitizeSermon, sermonAudienceItem, sermonError, stepSermonSection } from "../domain/sermon";
import { readZip } from "../domain/zip";
import { dropToFree, redeemCode, sanitizeProfile, validEmail, FREE_LISTEN_MINUTES, listenAllowance, planIncludes, TRIAL_DAYS, type PlanFeature, type PlanId } from "../domain/plans";
import { sanitizeSongPacks, type SongPack } from "../domain/song-packs";
import { cleanCcli, cleanFolder, creditFor, lyricsFor, sanitizeFolderNames, sanitizeSong, songError, songFromFile } from "../domain/song";
import type { SongMatch } from "../ai/songs";
import { AiAssistant, sermonText } from "./ai-assistant";
import { ServiceChecks } from "./service-checks.svelte";
import { webTarget } from "../domain/web";
import { documentAssets, pageAt, pageStart, scrollLength, stepScroll } from "../domain/document-scroll";
import { LiveNotes } from "./live-notes.svelte";
import { CLOUD_SPEECH, KeyRefused, startCloudListening, testSpeechKey, type CloudSpeech } from "../voice/cloud-listen";
import { recentSongHits, rememberSongRecent, searchSongHits, type SongHit, type SongRecent } from "../domain/song-search";
import { serviceFirst, serviceSongIds } from "../domain/service-first";
import { activeRun, endRun, markPart } from "../domain/service-run";
import { cleanSettings, pickSettings, withoutSettings, type ServiceSettingsValues } from "../domain/service-settings";
import { plainFromRich, richIsEmpty, richLines, type RichDoc } from "../domain/rich-text";
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
  NoiseFilter,
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
  ScreenDest,
  ServiceSection,
  Song,
  Theme,
  TranslationInfo,
  Workspace,
  WorkspaceLayout,
  VoiceEngine,
  VoiceSettings,
  ProgramAlert,
} from "../domain/types";
import { canUse } from "../platform/capabilities";
import { styleModel } from "../domain/text-style";
import type { Game } from "../domain/games";
import { MOST_REPORTS, type GameReport } from "../domain/game-report";
import { createDeck, deckFromPageImages, deckItem, deckPageText, deckSource, sanitizeDeck, stepDeckPage, type SlideDeck } from "../domain/decks";
import { sanitizeAlert, withAlert } from "../domain/overlays";
import { dataUrlToBlob, exportThemePackage, readThemePackage, themePackageFileName } from "../domain/theme-package";
import { controlTimers, createTimer, presentTimer, timerDisplay, timerFromPaint, timersIn, type TimerAction } from "../domain/timer";
import {
  parseVoiceCommand,
  sanitizeVoiceSettings,
  voiceCommandLabel,
  type CustomVoiceCommand,
  type VoiceCommand,
} from "../voice/commands";
import { computerOs, keys as shortcutKeys, revealLabel } from "../platform/os";
import {
  onWindows,
  openPrivacySettings,
  prepareListening,
  startListening,
  startNativeListening,
  type ListenErrorKind,
  accurateModel,
  cancelAccurateModel,
  deleteAccurateModel,
  downloadAccurateModel,
  type AccurateModel,
} from "../voice/listen";
import { spokenReference } from "../voice/detect";
import { MAX_SCREENS, newScreen, placeScreens, screenLetter, screensNow, switchRole, writeScreensLocal, type ScreenOutput, type ScreenRole } from "../display/screens";
import { expectedWords, fixHeard, learnFix, nearMisses, type Applied, type NearMiss } from "../voice/words";
import { parseLibrarySnapshot } from "../platform/library";
import { APP_VERSION, isDesktop, openExternal } from "../platform/runtime";
import { reportCrashLog, setReportsAllowed, startReports } from "./telemetry";
import { countUse, usageCounts, usageSent } from "./usage-counts";
import type { MessageTone } from "./status-line";
import { CHANGELOG, whatsNewFor, type Release } from "../domain/changelog";
import { internetRemote } from "./remote-relay.svelte";
import { normalizeWorkspace, sanitizeAccent } from "../workspace/document";
import { DEFAULT_LOGO_URL } from "../brand/logo";
import { aspectFor, canvasFor, cleanAspect, sanitizeScreenShape, type ScreenShape } from "../display/shape";
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
import { songLists } from "../domain/song-lists";
import { newOverlay, OVERLAY_KINDS, paintOverlays, sanitizeOverlays, slideOverlays, type OverlayKind, type ScreenOverlay } from "../domain/screen-overlays";
import { aiFeatureOn, aiReady, parseSummary, replyText, sanitizeAiSettings, summaryRequest, type AiFeature, type AiSettings } from "../ai/summarize";

const fixedShape = (shape: unknown) => sanitizeScreenShape(shape) !== "auto";

/** Where today's section starts are kept between restarts. */
const STARTS_KEY = "church-studio.section-starts";
/** Service settings that new services start with. */
const DEFAULTS_KEY = "church-studio.service-defaults";
/** The name lower third that shows who leads the part now (set in Overlays like any other). */
const LEADER_OVERLAY = "service-leader";
/** A trial setup should have started (it was offline then). */
const AUTO_TRIAL_KEY = "cs-auto-trial";
/** Below this the microphone gives digital silence: blocked, muted or unplugged, not a quiet room. */
const SILENT_LEVEL = 0.005;
const SILENCE_HINT_MS = 10_000;
/** The last sign-in reminder given during the trial ("halfway", "ending"). */
const TRIAL_NUDGE_KEY = "cs-trial-nudge";
function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the flag lasts until the app closes.
  }
}

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

const REMOTE_VIA_KEY = "church-studio:remote-via";

function readRemoteVia(): "lan" | "internet" {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return "internet";
  try {
    return localStorage.getItem(REMOTE_VIA_KEY) === "internet" ? "internet" : "lan";
  } catch {
    return "lan";
  }
}

class Session {
  ready = $state(false);
  // What the desk last said. Setting `message` leaves the tone to the status line's guess;
  // warn() marks a problem and quiet() a confirmation the monitors already show, in any language.
  #message = $state("Opening workspace");
  messageTone = $state<MessageTone | null>(null);

  get message(): string {
    return this.#message;
  }

  set message(text: string) {
    this.#message = text;
    this.messageTone = null;
  }

  warn = (text: string) => {
    this.message = text;
    this.messageTone = "warn";
  };

  quiet = (text: string) => {
    this.message = text;
    this.messageTone = "quiet";
  };
  liveMode = $state(false);
  library: "bible" | "songs" | "slides" | "media" | "theme" | "sermon" = $state("bible");
  workspace = $state<Workspace>(defaultWorkspace());
  themes = $state<Theme[]>([defaultTheme()]);
  songs = $state<Song[]>([]);
  /** The song part on Preview; `slot` is its place in the song's order (a chorus is sung several times). */
  /** The song part on Preview: its place in the song's order, and (line by line) which screen of it. */
  songFocus = $state<{ songId: string; sectionId: string; slot?: number; screen?: number } | null>(null);
  findOpen = $state(false);
  findQuery = $state("");
  findHits = $state<SongHit[]>([]);
  /** Song parts used lately: kept with the workspace so Recently used survives a restart. */
  get recentSongs(): SongRecent[] {
    return this.workspace.recentSongs;
  }
  set recentSongs(list: SongRecent[]) {
    this.workspace = { ...this.workspace, recentSongs: list.slice(0, 30) };
    this.persistSoon();
  }
  sermons = $state<Sermon[]>([]);
  sermonFocus = $state<{ sermonId: string; sectionId: string } | null>(null);
  /** Every stored file: pictures, videos and audio. */
  #allMedia = $state<MediaAsset[]>([]);
  #visualMedia = $derived(this.#allMedia.filter((asset) => asset.kind !== "audio"));
  #audioMedia = $derived(this.#allMedia.filter((asset) => asset.kind === "audio"));
  /** Pictures and videos (what screens show). Assigning keeps the audio files. */
  get media(): MediaAsset[] {
    return this.#visualMedia;
  }
  set media(list: MediaAsset[]) {
    const ids = new Set(list.map((asset) => asset.id));
    this.#allMedia = [...list, ...this.#allMedia.filter((asset) => asset.kind === "audio" && !ids.has(asset.id))];
  }
  /** Music and backing tracks. */
  get audioTracks(): MediaAsset[] {
    return this.#audioMedia;
  }
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
  /**
   * At startup Program shows the logo slide on the desk only: the audience screen stays empty until
   * the operator puts something on Program (take, cut, logo, black, clear, a verse or a loop).
   */
  programHeld = $state(false);
  /**
   * The audience window waits, closed, from startup until Program first gets something: a start,
   * a restart or setup never puts an empty window on the big screen. Opening it by hand ends the wait.
   */
  private outputWaiting = false;

  /** The operator put something on Program: the hold ends and a waiting audience window opens. */
  private releaseHold() {
    this.programHeld = false;
    if (!this.outputWaiting) return;
    this.outputWaiting = false;
    void this.applyDisplays().catch((error) => console.error(error));
  }
  previewBible = $state<BibleItem | null>(null);
  services = $state<ServiceSummary[]>([]);
  service = $state<Service | null>(null);
  cursor = $state<Cursor>({ sectionId: null, itemId: null });
  #live = $state<LiveState>(createLiveState(defaultTheme()));
  get live(): LiveState {
    return this.#live;
  }
  /** Every Preview/Program write keeps camera feeds and the audience standby list in step. */
  set live(next: LiveState) {
    // An active alert, and the overlays that are on, ride on every Program frame.
    const model = this.withScreenOverlays(withAlert(next.program.model, this.alert));
    this.#live = model === next.program.model ? next : { ...next, program: { ...next.program, model } };
    this.noteGoneLive(next.program.model);
    this.noteSongLive(next.program.sourceId);
    void this.syncCameraFeeds();
    this.publishStandby();
    this.publishStage();
    this.publishSecond(false);
    this.pushKeyWords();
  }
  output = $state<OutputStatus>({
    desired: false,
    online: false,
    displayName: "",
    message: t("Audience output is closed."),
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
  /**
   * How phones reach the desk: this Wi-Fi (the desktop app's own server, nothing leaves the network)
   * or the internet (a relay through Church Studio's server, for a phone on mobile data or another
   * network). A browser tab cannot run a server, so there it is always the internet.
   */
  remoteVia = $state<"lan" | "internet">(readRemoteVia());
  private remoteDevicesSaved = 0;
  translations = $state<TranslationInfo[]>([]);
  books = $state<CanonBook[]>(CANON);
  private selectToken = 0;
  /** The repeating checks init starts (plan clock, auto-advance, backups, updates), stopped by destroy. */
  private timers: ReturnType<typeof setInterval>[] = [];
  private every = (ms: number, run: () => void) => void this.timers.push(setInterval(run, ms));
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
      ? t("This app sends to the audience.")
      : this.controlsAudience
        ? t("This window sends to the audience.")
        : t("Another window has the audience.");

  /** Name the startup step (the loading screen shows it if starting takes too long), and finish it. */
  /** The desk's own startup steps and how long each took (ms), sent to the core when it is ready. */
  private bootSteps: Array<[string, number]> = [];
  private bootStepAt = typeof performance !== "undefined" ? performance.now() : 0;
  private bootStepName = "";

  private bootStep(step: string) {
    if (typeof window !== "undefined") (window as unknown as { __csBootStep?: string }).__csBootStep = step;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (this.bootStepName) this.bootSteps.push([`desk: ${this.bootStepName}`, Math.round(now - this.bootStepAt)]);
    this.bootStepName = step;
    this.bootStepAt = now;
    if (step === "ready" && this.desktop()) void invoke("desk_ready", { steps: this.bootSteps }).catch(() => {});
  }

  /** A startup step that must never hold the desk: after `ms` it carries on without it. */
  private async atMost<T>(step: string, work: Promise<T>, ms = 8000): Promise<T | undefined> {
    this.bootStep(step);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`Startup step "${step}" took over ${ms / 1000} s; carrying on without it.`);
        resolve(undefined);
      }, ms);
    });
    try {
      return await Promise.race([work, late]);
    } finally {
      clearTimeout(timer);
    }
  }

  init = async () => {
    // Slide-page layers in looks find their page here, so a design edited in the studio changes every look using it.
    setSlideResolver((deckId, page) => {
      const found = this.decks.find((deck) => deck.id === deckId)?.pages[page];
      return found ? withMediaUrls(found, this.mediaSrc) : null;
    });
    this.ready = true;
    this.bootStep("starting");
    void this.startCameraRelay();
    // Started again by a remount (init after destroy): never twice side by side.
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (typeof window !== "undefined")
      this.every(60_000, () => {
        this.planClock = Date.now();
        void this.refreshEntitlement();
      });
    // A part whose time is up moves on (Service settings); checked every few seconds.
    if (typeof window !== "undefined") this.every(5_000, () => void this.checkAdvance());
    const keepLive = this.live.revision > 0;
    const keepOutput = this.output.desired;
    try {
      this.bootStep("reading the library");
      if (this.desktop()) await this.loadLibraries();
      else {
        await this.loadBibleCatalog();
        await this.loadThemes();
        this.songs = await api.songList();
        this.sermons = await api.sermonList();
        this.media = await api.mediaList();
        this.services = await api.serviceList();
      }
      this.bootStep("reading your settings");
      this.workspace = await this.loadWorkspace();
      this.workspaceLoaded = true;
      this.applyAudioSettings();
      this.startRoomOutput();
      // Screens from last time come back on their monitors (after the display list is in).
      setTimeout(() => {
        this.broadcastScreens();
        void this.placeScreenWindows();
      }, 1500);
      if (keepOutput) this.rememberOutput({ outputEnabled: true });
      if (this.workspace.lastServiceId) {
        try {
          const last = await this.atMost("opening the last service", api.serviceGet(this.workspace.lastServiceId));
          if (last) {
            this.service = last;
            this.savedService = this.service;
          }
          if (typeof window !== "undefined") this.loadSectionStarts(this.workspace.lastServiceId);
        } catch (error) {
          console.error(error);
        }
      }
      if (this.desktop()) {
        try {
          await this.atMost("saving your settings", this.saveWorkspaceDocument(this.workspace));
        } catch (error) {
          console.error(error);
        }
        try {
          // A restart that kept Program live (keepOutput) carries on; otherwise the window waits.
          this.outputWaiting = !keepOutput;
          await this.atMost("finding the screens", this.applyDisplays());
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
      // The desk's Program starts on the logo slide in the screen theme, but nothing goes to the
      // audience screen until the operator puts something on Program.
      if (!keepLive && (this.desktop() || this.controlsAudience)) {
        try {
          this.live = applyProgramAction(this.live, "logo", this.theme(), { title: this.logoTitle(), imageUrl: this.logoImage() });
          this.programHeld = true;
          await this.atMost("preparing the audience screen", this.pushProgram());
        } catch (error) {
          console.error(error);
        }
      }
      if (!this.desktop() && !this.browserWatch) {
        this.browserWatch = setInterval(() => this.noteBrowserAudience(), 1000);
      }
      // A first run speaks the computer's language when the desk has it.
      if (!this.workspace.onboarded && !this.workspace.appearance.language && typeof navigator !== "undefined") {
        const guess = guessUiLanguage(navigator.languages ?? [navigator.language]);
        if (guess !== "en") this.workspace = { ...this.workspace, appearance: { ...this.workspace.appearance, language: guess } };
      }
      this.ready = true;
      this.booted = true;
      this.bootStep("ready");
      if (this.workspace.switcher.kind !== "none" && this.workspace.switcher.autoConnect) void this.connectSwitcher();
      void this.bootEntitlement();
      this.noteVersion();
      this.watchUpdates();
      this.listenRemote();
      if (this.desktop()) void this.attachLanRemote();
      // Phones paired over the internet reach the desk again after a restart.
      if (this.remoteVia === "internet" && internetRemote.room && this.remoteDevices.length) this.startInternetRemote();
      // Automatic backups to the chosen folder, every half hour while the app is open.
      if (this.desktop()) this.every(30 * 60 * 1000, () => void (this.workspace.backup.folder && this.backupNow()));
      if (this.message === "Opening workspace") {
        this.message = this.desktop()
          ? this.outputWaiting
            ? t("The audience screen opens when you put something on Program.")
            : this.output.message
          : t("Browser session. Audience output opens in its own window.");
      }
      // The library could not be opened, so the app started a new one: say so before anything else.
      const setAside = this.desktop() ? await invoke<string | null>("startup_notice").catch(() => null) : null;
      if (setAside) this.warn(t("The library could not be opened, so a new one was started. The old one is kept as {file}. Restore your latest backup in Settings › Storage & backup.", { file: setAside }));
      if (!keepLive && this.cursor.itemId && this.service) await this.selectItem(this.cursor.itemId);
    } catch (error) {
      this.warn(errorText(error));
      this.ready = true;
      this.booted = true;
      this.bootStep("ready");
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
      // A monitor came or went: screens follow their own monitors.
      void this.placeScreenWindows();
    });
    this.unlistenAudienceCamera = await listen<{ id?: unknown; error?: unknown }>("audience-camera", (event) => {
      const id = typeof event.payload?.id === "string" ? event.payload.id : "";
      const error = typeof event.payload?.error === "string" ? event.payload.error.slice(0, 200) : "";
      if (!id) return;
      const label = this.cameraLabel(id);
      this.audienceCameraErrors = error
        ? { ...this.audienceCameraErrors, [id]: error }
        : Object.fromEntries(Object.entries(this.audienceCameraErrors).filter(([key]) => key !== id));
      if (error) this.warn(t("The audience screen cannot show {label}: {error} It keeps trying.", { label, error }));
      else if (this.message.startsWith(t("The audience screen cannot show {label}: {error} It keeps trying.", { label, error: "" }).split(":")[0])) this.message = t("{label} is showing on the audience screen.", { label });
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
      this.warn(t("Workspace settings were unreadable. Defaults were restored."));
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
    // Until Program first gets something, the audience window stays closed (the choice to use it is kept).
    if (this.outputWaiting) {
      this.output = await api.setOutput(false, mode);
      return;
    }
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
    this.browserWatch = undefined;
    this.timers.forEach(clearInterval);
    this.timers = [];
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
      if (!this.controlsAudience) this.message = t("Another window has the audience. Take control before sending.");
    } catch (error) {
      this.controlsAudience = false;
      this.warn(errorText(error, t("Audience control could not be read.")));
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
      this.message = t("This window can send to the audience. Go live when you are ready.");
    } catch (error) {
      this.controlsAudience = false;
      this.warn(errorText(error, t("Audience control could not be saved. Nothing was sent.")));
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
    // While held, the audience gets an empty frame (same revision, so later updates still apply).
    const sent = this.programHeld ? { ...this.live, program: createLiveState(this.theme()).program } : this.live;
    const packet = {
      ...programPacket(sent, this.takeMs ?? lookTransition.ms),
      sessionId: this.sessionId,
      generation: this.audienceGeneration,
      calm: this.workspace.appearance.calm === true,
      ...(fixedShape(this.workspace.appearance.screenShape) ? { aspect: aspectFor(sanitizeScreenShape(this.workspace.appearance.screenShape), null) } : {}),
    };
    if (!this.desktop()) {
      if (!this.controlsAudience) {
        this.warn(t("This window is not sending to the audience."));
        return;
      }
      try {
        if (!publishLocal(packet)) this.message = t("A newer audience update was kept.");
      } catch (error) {
        this.warn(errorText(error, t("The audience could not be updated. Nothing new was sent.")));
      }
      return;
    }
    try {
      await api.publishProgram(packet);
    } catch (error) {
      this.warn(errorText(error, t("The audience could not be updated.")));
    }
  };

  /** Songs in two languages: first, second or both on the screen. Re-shows the part on Preview. */
  /** Song lines on the screen at once (0: the whole part). The part on Preview starts again at its first screen. */
  setSongLines = (lines: SongLines) => {
    this.workspace = { ...this.workspace, songLines: sanitizeSongLines(lines) };
    this.persistSoon();
    const focus = this.songFocus;
    const song = focus ? this.songs.find((entry) => entry.id === focus.songId) : undefined;
    if (focus && song) this.previewSongSection(song, focus.sectionId, focus.slot, 0);
  };

  /** The screens a part is shown in, with the current lines setting. */
  songScreens = (section: { lines: string[] }): SongScreen[] => screensOf(section.lines, this.workspace.songLines);

  setSongLanguage = (language: "first" | "second" | "both") => {
    this.workspace = { ...this.workspace, songLanguage: language };
    this.persistSoon();
    const focus = this.songFocus;
    const song = focus ? this.songs.find((entry) => entry.id === focus.songId) : undefined;
    if (focus && song) this.previewSongSection(song, focus.sectionId, focus.slot, focus.screen);
  };

  // Macros: one button, several steps in order.
  macrosOpen = $state(false);
  /** Go to anything (⌘K): pages, the service, songs, verses, settings and actions. */
  commandOpen = $state(false);
  /** The macro running now and the step it is on (for the button's progress). */
  runningMacro = $state<{ id: string; step: number } | null>(null);

  saveMacros = (macros: Macro[]) => {
    this.workspace = { ...this.workspace, macros };
    this.persistSoon();
  };

  runMacro = async (id: string) => {
    const macro = this.workspace.macros.find((entry) => entry.id === id);
    if (!macro || this.runningMacro) return;
    try {
      for (let index = 0; index < macro.steps.length; index += 1) {
        this.runningMacro = { id, step: index };
        await this.runMacroStep(macro.steps[index]!);
      }
      this.message = t("{name}: done.", { name: macro.name });
    } catch (error) {
      const step = macro.steps[this.runningMacro?.step ?? 0];
      this.warn(t("{name} stopped at “{step}”: {reason}", { name: macro.name, step: step ? describeStep(step, { playlist: (playlistId) => this.workspace.playlists.find((list) => list.id === playlistId)?.name ?? t("a playlist") }) : t("a step"), reason: error instanceof Error ? error.message : t("it did not work") }));
    } finally {
      this.runningMacro = null;
    }
  };

  private runMacroStep = async (step: MacroStep) => {
    const service = this.service;
    switch (step.kind) {
      case "fade-music":
        this.audio.fadeOut(step.seconds);
        return;
      case "play-playlist":
        await this.playPlaylist(step.playlistId);
        return;
      case "stop-music":
        this.audio.stop();
        return;
      case "program":
        if (step.action === "take") await this.take();
        else if (step.action === "clear") await this.clear();
        else if (step.action === "clear-words") await this.clearWords();
        else if (step.action === "black") await this.black();
        else await this.logo();
        return;
      case "start-part": {
        if (!service?.sections.length) throw new Error(t("this service has no parts"));
        const running = this.runningSectionId && service.sections.some((section) => section.id === this.runningSectionId) ? this.runningSectionId : null;
        const target = (step.which === "first" || !running ? nextPart(service, null) : (nextPart(service, running) ?? service.sections.find((section) => section.id === running))) ?? service.sections[0]!;
        this.startSection(target.id);
        this.cursor = { sectionId: target.id, itemId: this.cursor.itemId };
        return;
      }
      case "show-item": {
        if (step.which === "next") await this.stepItem(1);
        else {
          const part = service?.sections.find((section) => section.id === (this.runningSectionId ?? this.cursor.sectionId)) ?? service?.sections[0];
          const first = part?.items[0];
          if (!first) throw new Error(t("{name} has nothing in it yet", { name: part?.name ?? t("the part") }));
          await this.selectItem(first.id);
        }
        if (step.live) await this.take();
        return;
      }
      case "countdown":
        if (step.mode === "full") this.showCountdown();
        else if (step.mode === "overlay-on" ? !this.countdownOverlayOn : this.countdownOverlayOn) this.toggleCountdownOverlay();
        return;
      case "captions":
        await this.setCaptions(step.on);
        return;
      case "stage-message":
        this.sendStageMessage(step.text);
        return;
      case "broadcast": {
        if (step.action === "stop") {
          await this.stopBroadcast();
          return;
        }
        const ok = await this.startBroadcast({ stream: step.action !== "record", record: step.action !== "live" });
        if (!ok) throw new Error(this.broadcastState.message);
        return;
      }
      case "switcher": {
        const done =
          step.action === "scene"
            ? await this.switchScene(step.scene)
            : step.action.startsWith("stream")
              ? await this.setSwitcherStreaming(step.action === "stream-start")
              : await this.setSwitcherRecording(step.action === "record-start");
        if (!done) throw new Error(this.message);
        return;
      }
      case "wait":
        await new Promise((resolve) => setTimeout(resolve, step.seconds * 1000));
        return;
    }
  };

  /** Give a desk action a new key; a key another action had moves here. Returns that action, if any. */
  setShortcut = (action: ShortcutAction, code: string): ShortcutAction | null => {
    const { map, taken } = assignShortcut(this.workspace.shortcuts ?? defaultShortcuts, action, code);
    this.workspace = { ...this.workspace, shortcuts: map };
    this.persistSoon();
    return taken;
  };

  resetShortcuts = () => {
    this.workspace = { ...this.workspace, shortcuts: null };
    this.persistSoon();
    this.message = t("Keyboard shortcuts are back to the usual keys.");
  };

  /** The translation the Scriptures page is on, kept for next time. */
  setDeskTranslation = (id: string) => {
    if (this.workspace.deskTranslationId === id) return;
    this.workspace = { ...this.workspace, deskTranslationId: id };
    this.persistSoon();
  };

  /** Save now (the window is closing or hidden): nothing waits on the short delay. */
  /** Read the Media list again (after files were removed from Settings › Storage). */
  reloadMedia = async () => {
    this.media = await api.mediaList();
  };

  flushSave = async () => {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    await this.persist();
  };

  private persistSoon = () => {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.persist();
    }, 250);
  };

  /**
   * Settings are read from disk while the libraries load. A save asked for before that (the audience
   * window reporting its shape, a guessed language) would write the defaults over the saved settings,
   * so it waits until they are in.
   */
  private workspaceLoaded = false;

  /**
   * The service as last read or written. The service is only ever replaced, never changed in place,
   * so while it is this same object there is nothing new to write: moving the cursor (every click
   * on the running order) saves the workspace only, and does not re-date the service.
   */
  private savedService: Service | null = null;
  /** Saves run one after another, so an older save can never land after a newer one. */
  private saving: Promise<void> = Promise.resolve();

  private persist = async () => {
    if (!this.workspaceLoaded) {
      this.persistSoon();
      return;
    }
    const run = this.saving.then(this.writeNow);
    this.saving = run.catch(() => {});
    await run;
  };

  private writeNow = async () => {
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.workspace = { ...this.workspace, cursor: this.cursor, lastServiceId: this.service?.id ?? null };
    try {
      await this.saveWorkspaceDocument(this.workspace);
    } catch (error) {
      this.warn(errorText(error));
    }
    if (this.service && this.service !== this.savedService) {
      this.service = stamp(this.service);
      const saved = this.service;
      try {
        await api.serviceSave(saved);
        this.savedService = saved;
        this.services = await api.serviceList();
      } catch (error) {
        this.warn(errorText(error));
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
          reader.onerror = () => reject(reader.error ?? new Error(t("The background picture could not be read.")));
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
      throw new Error(t("That file is not a Church Studio theme."));
    }
    const { theme, background } = readThemePackage(raw);
    let next = theme;
    if (background) {
      const asset = await api.importMediaBytes(background.name, dataUrlToBlob(background.dataUrl));
      this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
      next = { ...theme, background: { type: "image", assetId: asset.id } };
    }
    this.saveTheme(next);
    this.message = t("{name} imported and in use. Program updates on the next LIVE.", { name: next.name });
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

  /** A move file being saved or opened: how far it is, for the bar on screen. */
  moveProgress = $state<{ done: number; total: number } | null>(null);

  private withMoveProgress = async <T>(task: () => Promise<T>): Promise<T> => {
    this.moveProgress = { done: 0, total: 1 };
    const unlisten = await listen<{ done: number; total: number }>("move-progress", (event) => (this.moveProgress = event.payload));
    try {
      return await task();
    } finally {
      unlisten();
      this.moveProgress = null;
    }
  };

  /** Save everything to a .churchstudio file at `dest`. Returns what to show. */
  saveMoveFile = (dest: string): Promise<string> =>
    this.withMoveProgress(async () => {
      await this.flushSave();
      const { buildMoveLibrary, formatBytes } = await import("./move");
      const library = buildMoveLibrary(await this.exportLibrary(), extrasFrom(this.workspace, await api.sermonList()));
      const summary = await invoke<{ files: number; missing: number; bytes: number }>("move_export", { dest, library, computer: this.deviceName() });
      const saved = t("Saved: {songs} songs, {services} services and {files} media files ({size}).", { songs: this.songs.length, services: this.services.length, files: summary.files, size: formatBytes(summary.bytes) });
      return summary.missing ? `${saved} · ${tn(summary.missing, "{n} file could not be found", "{n} files could not be found")}` : saved;
    });

  /** What a .churchstudio file holds, before bringing it in. */
  peekMoveFile = (path: string) => invoke<{ createdAt: string; computer: string; media: number; bytes: number }>("move_peek", { path });

  /** Bring a .churchstudio file in. Nothing here is deleted; the same item from the file wins. */
  openMoveFile = (path: string): Promise<string> =>
    this.withMoveProgress(async () => {
      const { restoreMoveLibrary } = await import("./move");
      const result = await invoke<{ library: string; mediaAdded: number }>("move_import", { path });
      this.media = await api.mediaList();
      const byId = new Map(this.#allMedia.map((asset) => [asset.id, asset]));
      const extras = await restoreMoveLibrary(result.library, (id) => mediaUrl(byId.get(id) ?? null), (payload) => this.importLibrary(payload));
      for (const sermon of Array.isArray(extras.sermons) ? extras.sermons : []) await api.sermonSave(sermon);
      this.sermons = await api.sermonList();
      this.workspace = applyExtras(this.workspace, extras);
      this.persistSoon();
      return t("Everything is here: {songs} songs, {services} services and {files} new media files.", { songs: this.songs.length, services: this.services.length, files: result.mediaAdded });
    });

  importLibrary = async (payload: unknown) => {
    const snapshot = parseLibrarySnapshot(payload);
    await api.importSnapshot(snapshot);
    this.songs = await api.songList();
    this.services = await api.serviceList();
    if (snapshot.themes.length > 0) this.themes = await api.themeList();
    if (this.service) {
      const fresh = await api.serviceGet(this.service.id);
      if (fresh) {
        this.service = fresh;
        this.savedService = this.service;
      }
    }
    this.message = t("Imported {songs} songs, {services} services, and {themes} themes. Program was not in the file.", { songs: snapshot.songs.length, services: snapshot.services.length, themes: snapshot.themes.length });
  };

  importDocument = async (filename: string, text: string) => {
    const items = parseImportedDocument(filename, text);
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Imported");
    const target = this.cursor.sectionId ?? this.service?.sections[0]?.id;
    if (!target || !this.service) {
      this.message = t("Add a section, then import.");
      return;
    }
    for (const item of items) this.insertItem(target, item);
    this.persistSoon();
    const first = items[0];
    if (first) await this.selectItem(first.id);
    this.message = tn(items.length, "Imported {n} slide to Preview. LIVE still sends Program.", "Imported {n} slides to Preview. LIVE still sends Program.");
  };

  /**
   * A PDF becomes a slide deck: one page per PDF page, stepped with the arrows like any deck,
   * usable on both desks. With `toService` (the default) it also joins the service being built.
   * Preview only; Program is untouched. Returns the deck id, or null.
   */
  importPdf = async (file: File, onProgress?: (done: number, total: number) => void, toService = true): Promise<string | null> => {
    const { renderPdfPages } = await import("../import/pdf");
    const name = file.name.replace(/\.pdf$/i, "") || "Document";
    const pages: Array<{ id: string; name: string; url: string }> = [];
    let total = 0;
    try {
      for await (const page of renderPdfPages(file)) {
        total = page.count;
        this.message = t("Importing {name}: page {index} of {count}…", { name: file.name, index: page.index + 1, count: page.count });
        onProgress?.(page.index, page.count);
        const asset = await api.importMediaBytes(page.name, page.blob);
        this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
        const url = mediaUrl(asset);
        if (url) pages.push({ id: asset.id, name: asset.name, url });
      }
    } catch (error) {
      this.warn(errorText(error, t("{name} could not be imported.", { name: file.name })));
      if (!pages.length) return null;
    }
    if (!pages.length) {
      this.message = t("{name} has no pages to show.", { name: file.name });
      return null;
    }
    const deck = deckFromPageImages(name, pages);
    this.saveDeck(deck);
    if (toService) await this.addDeckToService(deck.id);
    const capped = total > pages.length ? ` (first ${pages.length} pages)` : "";
    const said = t("{file} is the slide deck “{deck}”, {pages}{capped}.", { file: file.name, deck: deck.name, pages: tn(pages.length, "{n} page", "{n} pages"), capped });
    this.message = toService ? `${said} ${t("It is in the service; arrows turn the pages.")}` : said;
    return deck.id;
  };

  /** A PowerPoint file becomes an editable slide deck; its pictures go into the media library. */
  importPowerPoint = async (file: File): Promise<string | null> => {
    const name = file.name.replace(/\.pptx$/i, "") || "Presentation";
    if (/\.(ppt|key)$/i.test(file.name)) {
      this.warn(t("Save it as a .pptx (PowerPoint) or a PDF, then import it. Older .ppt and Keynote files cannot be read directly."));
      return null;
    }
    try {
      const { parsePptx, pptxMediaFiles, pptxToDeck } = await import("../domain/pptx");
      this.message = t("Reading {name}…", { name: file.name });
      const presentation = await parsePptx(new Uint8Array(await file.arrayBuffer()));
      const imported = new Map<string, { id: string; name: string; url: string }>();
      const pictures = pptxMediaFiles(presentation);
      for (const [index, picture] of pictures.entries()) {
        this.message = t("Importing {name}: picture {index} of {length}…", { name: file.name, index: index + 1, length: pictures.length });
        const asset = await api.importMediaBytes(`${name} ${picture.name}`, new Blob([picture.data as BlobPart], { type: picture.mime }));
        this.media = [asset, ...this.media.filter((entry) => entry.id !== asset.id)];
        const url = mediaUrl(asset);
        if (url) imported.set(picture.path, { id: asset.id, name: asset.name, url });
      }
      const deck = pptxToDeck(presentation, name, (path) => imported.get(path) ?? null);
      if (deck.pages.length === 0) {
        this.message = t("{name} has no slides to import.", { name: file.name });
        return null;
      }
      this.saveDeck(deck);
      const skipped = presentation.slides.length > deck.pages.length ? ` (first ${deck.pages.length})` : "";
      this.message = t("Imported {slides} from {file}{skipped} as the deck “{deck}”. Tables, charts and SmartArt are not brought over.", { slides: tn(deck.pages.length, "{n} slide", "{n} slides"), file: file.name, skipped, deck: deck.name });
      return deck.id;
    } catch (error) {
      this.warn(errorText(error, t("{name} could not be imported.", { name: file.name })));
      return null;
    }
  };

  remotePageUrl = () => {
    if (this.remoteVia === "internet" && internetRemote.code) return internetRemote.pageUrl();
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
    if (!pairing?.token) return "";
    if (this.remoteVia === "internet") return internetRemote.code ? internetRemote.pageUrl(pairing.token) : "";
    if (!this.remoteLanUrl) return "";
    const host = new URL(this.remoteLanUrl).hostname;
    return pairingUrl(host, pairing.token);
  };

  openRemotePairing = async () => {
    if (!this.requireFeature("phone-remote")) return;
    this.remotePairing = createPairing(Date.now(), randomCode(), randomToken(24));
    this.message = t("Scan the QR code on the phone, or type code {code}. You approve each phone here.", { code: this.remotePairing.code });
    if (this.remoteVia === "internet") this.startInternetRemote();
    else if (this.desktop()) await this.attachLanRemote(true);
  };

  /** Switch between Wi-Fi and the internet. Paired phones stay paired; they open the other address. */
  setRemoteVia = async (via: "lan" | "internet") => {
    if (via === this.remoteVia || (via === "lan" && !this.desktop())) return;
    this.remoteVia = via;
    try {
      localStorage.setItem(REMOTE_VIA_KEY, via);
    } catch {
      // Not remembered; fine.
    }
    if (via === "internet") {
      this.startInternetRemote();
    } else {
      internetRemote.stop();
      if (this.remotePairing) await this.attachLanRemote(true);
    }
  };

  /** Relay phone messages from the internet (remote-relay.svelte.ts) into the same dispatch as Wi-Fi. */
  private startInternetRemote = () => {
    if (!canUse("remote-control")) return;
    void internetRemote.start(this.logoTitle(), (envelope) => this.dispatchRemote(envelope));
  };

  closeRemotePairing = () => {
    this.remotePairing = null;
    this.remotePending = [];
    this.message = t("Pairing closed. Paired phones still work until you remove them.");
  };

  approveRemote = async (requestId: string) => {
    const token = randomToken();
    const gate = approvePending(this.remoteGate(), requestId, token, await sha256Hex(token), Date.now());
    this.applyRemoteGate(gate, true);
    const device = gate.devices.find((entry) => entry.id === requestId);
    this.message = t("{name} can control this desk. Go live on the phone changes what the audience sees.", { name: device?.name ?? t("Phone") });
  };

  declineRemote = (requestId: string) => {
    this.applyRemoteGate(declinePending(this.remoteGate(), requestId), false);
    this.message = t("Phone declined. It cannot control this desk.");
  };

  revokeRemote = (deviceId: string) => {
    const name = this.remoteDevices.find((device) => device.id === deviceId)?.name ?? "Phone";
    this.applyRemoteGate(revokeDevice(this.remoteGate(), deviceId), true);
    this.message = t("{name} removed. It can no longer control this desk.", { name });
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
    this.message = t("{name} can now control this desk. Copy its links now; the key is shown only once.", { name: device.name });
    return token;
  };

  // Audio: walk-in music, backing tracks and playlists, played on this computer.
  audio = new AudioDeck();
  audioOpen = $state(false);
  /** The music player and sound pad (Premium). */
  openAudio = () => {
    if (this.requireFeature("music")) this.audioOpen = true;
  };

  private savePlaylists(playlists: Playlist[]) {
    this.workspace = { ...this.workspace, playlists };
    this.persistSoon();
  }

  private updatePlaylist(id: string, change: (list: Playlist) => Playlist) {
    this.savePlaylists(this.workspace.playlists.map((list) => (list.id === id ? change(list) : list)));
  }

  createPlaylist = (name: string): Playlist => {
    const list: Playlist = { id: uid(), name: name.trim().slice(0, 60) || "New playlist", trackIds: [], loop: false };
    this.savePlaylists([...this.workspace.playlists, list]);
    return list;
  };

  renamePlaylist = (id: string, name: string) => this.updatePlaylist(id, (list) => ({ ...list, name: name.trim().slice(0, 60) || list.name }));
  setPlaylistLoop = (id: string, loop: boolean) => {
    this.updatePlaylist(id, (list) => ({ ...list, loop }));
    if (this.audio.playlistId === id) this.audio.setLoop(loop);
  };
  removePlaylist = (id: string) => this.savePlaylists(this.workspace.playlists.filter((list) => list.id !== id));
  addToPlaylist = (id: string, trackIds: string[]) => this.updatePlaylist(id, (list) => addTracks(list, trackIds));
  /** A playlist's songs, replaced all at once (in the order given). */
  setPlaylistTracks = (id: string, trackIds: string[]) => this.updatePlaylist(id, (list) => ({ ...list, trackIds: [...new Set(trackIds)] }));
  removeFromPlaylist = (id: string, index: number) => this.updatePlaylist(id, (list) => removeTrackAt(list, index));
  moveInPlaylist = (id: string, from: number, to: number) => this.updatePlaylist(id, (list) => moveTrack(list, from, to));

  /** The audio files of a playlist, in order (missing files are skipped). */
  playlistTracks = (id: string): MediaAsset[] => {
    const list = this.workspace.playlists.find((entry) => entry.id === id);
    if (!list) return [];
    const byId = new Map(this.audioTracks.map((track) => [track.id, track]));
    return list.trackIds.map((trackId) => byId.get(trackId)).filter((track): track is MediaAsset => !!track);
  };

  playPlaylist = async (id: string, index = 0, options: { loop?: boolean } = {}) => {
    const list = this.workspace.playlists.find((entry) => entry.id === id);
    const tracks = this.playlistTracks(id);
    if (!list || !tracks.length) {
      this.warn(t("Add music to this playlist first."));
      return;
    }
    void this.measureTracks(tracks);
    this.backingSongId = null;
    await this.audio.play(tracks, index, { playlistId: id, loop: options.loop ?? list.loop });
  };

  /** Add audio files (paths from the desktop picker, or browser files), optionally to a playlist. */
  importAudio = async (sources: Array<string | File>, playlistId: string | null): Promise<string[]> => {
    const added: string[] = [];
    for (const source of sources) {
      const asset = await this.importImage(source);
      if (asset?.kind === "audio") added.push(asset.id);
      else if (asset) this.warn(t("{name} is not an audio file; it went to the media library.", { name: asset.name }));
    }
    if (playlistId && added.length) this.addToPlaylist(playlistId, added);
    if (added.length) this.message = tn(added.length, "{n} track added.", "{n} tracks added.");
    void this.measureTracks(this.audioTracks.filter((track) => added.includes(track.id)));
    return added;
  };

  setAudioVolume = (volume: number) => {
    this.audio.setVolume(volume);
    this.workspace = { ...this.workspace, audio: { ...this.workspace.audio, volume: this.audio.volume } };
    this.persistSoon();
  };

  setFadeOnLive = (fadeOnLive: boolean) => {
    this.workspace = { ...this.workspace, audio: { ...this.workspace.audio, fadeOnLive } };
    this.persistSoon();
  };

  private setAudio(patch: Partial<AudioSettings>) {
    this.workspace = { ...this.workspace, audio: { ...this.workspace.audio, ...patch } };
    this.persistSoon();
  }

  /** The saved music settings onto the deck and the pad (at start, and after a change). */
  private applyAudioSettings() {
    const audio = this.workspace.audio;
    this.audio.gainFor = (track) => (this.workspace.audio.even ? evenGain(this.workspace.audio.levels[track.id]) : 1);
    this.audio.setVolume(audio.volume);
    this.audio.setCrossfade(audio.crossfade);
    this.audio.setShuffle(audio.shuffle);
    if (audio.outputId) {
      void this.audio.setOutput(audio.outputId);
      this.soundPad.setOutput(audio.outputId);
    }
    // Tracks not measured yet are measured quietly, one at a time, a little after start.
    if (typeof window !== "undefined") setTimeout(() => void this.measureTracks(this.audioTracks), 20_000);
  }

  // Even volume: each track's loudness, measured once and kept with the workspace.

  private measuring = false;
  private measureQueue: MediaAsset[] = [];

  private measureTracks = async (tracks: MediaAsset[]) => {
    const known = this.workspace.audio.levels;
    this.measureQueue.push(...tracks.filter((track) => track.kind === "audio" && known[track.id] === undefined && !this.measureQueue.includes(track)));
    if (this.measuring) return;
    this.measuring = true;
    try {
      for (let track = this.measureQueue.shift(); track; track = this.measureQueue.shift()) {
        if (this.workspace.audio.levels[track.id] !== undefined) continue;
        const url = mediaUrl(track);
        const level = url ? await measureUrl(url) : null;
        if (level === null) continue;
        this.setAudio({ levels: { ...this.workspace.audio.levels, [track.id]: level } });
        this.audio.refreshLevels();
      }
    } finally {
      this.measuring = false;
    }
  };

  setEvenVolume = (even: boolean) => {
    this.setAudio({ even });
    this.audio.refreshLevels();
    if (even) void this.measureTracks(this.audioTracks);
  };

  setCrossfade = (seconds: number) => {
    const crossfade = Math.min(MAX_CROSSFADE, Math.max(0, Math.round(seconds)));
    this.setAudio({ crossfade });
    this.audio.setCrossfade(crossfade);
  };

  setShuffle = (shuffle: boolean) => {
    this.setAudio({ shuffle });
    this.audio.setShuffle(shuffle);
  };

  setStopTrackWithSong = (stopTrackWithSong: boolean) => this.setAudio({ stopTrackWithSong });

  // Sound output: which device the music plays through (the mixer's USB interface, say).

  /** Sound outputs this computer offers; empty until asked for, or where they cannot be chosen. */
  audioOutputs = $state<Array<{ id: string; label: string }>>([]);
  readonly canChooseAudioOutput = canChooseOutput();

  loadAudioOutputs = async () => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.enumerateDevices || !this.canChooseAudioOutput) return;
    const devices = await media.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const outputs = devices.filter((device) => device.kind === "audiooutput" && device.deviceId && device.deviceId !== "default");
    this.audioOutputs = outputs.map((device, n) => ({ id: device.deviceId, label: device.label || t("Sound output {n}", { n: n + 1 }) }));
  };

  setAudioOutput = async (deviceId: string): Promise<string | null> => {
    this.setAudio({ outputId: deviceId });
    this.soundPad.setOutput(deviceId);
    const ok = await this.audio.setOutput(deviceId);
    return ok || !deviceId ? null : t("This computer could not switch the music to that output. Choose it in the computer's sound settings instead.");
  };

  // The congregation's sound output (desktop): the room's sound system when one is connected,
  // the computer's own when none is (audio/outputs.ts). Checked every few seconds, so an interface
  // plugged in or pulled out mid-service is noticed; the output changes only when one comes or
  // goes, or the church chooses, so a change made in the computer's own settings is left alone.

  /** Sound outputs the computer has (desktop), with how each is connected. */
  roomOutputs = $state<AudioOutputDevice[]>([]);
  /** Church Studio sets the computer's sound output itself (a Mac); elsewhere it routes the music. */
  canSetRoomOutput = $state(false);
  /** The last choice made, and why. */
  roomOutput = $state<OutputDecision | null>(null);
  private roomOutputsKey = "";
  /** The computer's sound output at the last check (after any change Church Studio made). */
  private roomDefaultId: string | null = null;
  private roomOutputTimer: ReturnType<typeof setInterval> | undefined;

  startRoomOutput = () => {
    if (!this.desktop() || this.roomOutputTimer) return;
    void this.checkRoomOutputs();
    // A check still running (a slow sound driver) is not stacked up behind another.
    let checking = false;
    this.roomOutputTimer = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.checkRoomOutputs().finally(() => (checking = false));
    }, 4000);
  };

  private readRoomOutputs = async (): Promise<boolean> => {
    const result = await invoke<{ outputs?: unknown; canSetDefault?: unknown }>("audio_outputs").catch(() => null);
    if (!result || !Array.isArray(result.outputs)) return false;
    this.roomOutputs = result.outputs.flatMap((entry) => {
      const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      return typeof record.id === "string" && record.id ? [{ id: record.id, name: typeof record.name === "string" && record.name ? record.name : record.id, transport: sanitizeTransport(record.transport), isDefault: record.isDefault === true }] : [];
    });
    this.canSetRoomOutput = result.canSetDefault === true;
    return true;
  };

  /**
   * One output check or change at a time: a check landing while Church Studio is switching the
   * output would take that switch for a change made by hand.
   */
  private outputQueue: Promise<void> = Promise.resolve();
  private oneAtATime = (task: () => Promise<void>) => (this.outputQueue = this.outputQueue.then(task, task));

  checkRoomOutputs = () => this.oneAtATime(this.checkRoomOutputsNow);

  private checkRoomOutputsNow = async () => {
    const before = this.roomOutputsKey ? this.roomOutputs : null;
    if (!(await this.readRoomOutputs())) return;
    // Changed in the computer's own settings (Control Center): that is the church's choice now.
    const byHand = changedByHand(this.roomDefaultId, this.roomOutputs);
    this.roomDefaultId = this.roomOutputs.find((output) => output.isDefault)?.id ?? null;
    if (byHand) {
      this.adoptRoomOutput(byHand);
      // Where the computer is not told (Windows), the music follows the choice itself.
      if (!this.canSetRoomOutput) await this.routeMusicTo(byHand.name);
    }
    // A different audience screen can mean a different output too (its own speakers).
    const key = `${outputsKey(this.roomOutputs)}#${this.audienceScreenNames().join("|")}`;
    if (key === this.roomOutputsKey) return;
    this.roomOutputsKey = key;
    await this.applyRoomOutput(before);
  };

  /**
   * Keeps the output someone chose in the computer's settings. One Automatic had picked and they
   * left (a display with no speakers behind it) is not picked by Automatic again.
   */
  private adoptRoomOutput = (output: AudioOutputDevice) => {
    const audio = this.workspace.audio;
    const left = this.roomOutput?.output;
    const skip = left && this.roomOutput?.why !== "chosen" && left.id !== output.id ? [...audio.audienceSkip.filter((id) => id !== output.id), left.id] : audio.audienceSkip.filter((id) => id !== output.id);
    this.setAudio({ audience: output.id, audienceName: output.name, audienceSkip: skip });
    this.roomOutput = { output, why: "chosen", missing: false };
    this.notify(t("Sound stays on {output}", { output: output.name }), { detail: t("It was chosen in this computer's sound settings, so Church Studio keeps it. Change it in Settings › Sound & voice."), ms: 10_000 });
  };

  /** "auto", or one output by its id: kept with the workspace, used straight away. */
  setRoomOutput = (choice: string) => this.oneAtATime(() => this.setRoomOutputNow(choice));

  private setRoomOutputNow = async (choice: string) => {
    const output = this.roomOutputs.find((entry) => entry.id === choice);
    // Choosing an output by hand takes it off the never-again list.
    this.setAudio({ audience: output ? output.id : "auto", audienceName: output?.name ?? "", audienceSkip: this.workspace.audio.audienceSkip.filter((id) => id !== output?.id) });
    await this.applyRoomOutput(null, true);
  };

  /** Puts the congregation's sound where the choice says, and tells the desk when a plug changed it. */
  private applyRoomOutput = async (before: AudioOutputDevice[] | null, chosenNow = false) => {
    // An output keeps its name when the computer gives it a new id (Windows ids changed in 0.5.1):
    // the church's choice follows it by name.
    const chosenId = this.workspace.audio.audience;
    if (chosenId !== "auto" && this.workspace.audio.audienceName && !this.roomOutputs.some((output) => output.id === chosenId)) {
      const same = this.roomOutputs.find((output) => output.name === this.workspace.audio.audienceName);
      if (same) this.setAudio({ audience: same.id });
    }
    const audio = this.workspace.audio;
    const plan = planOutput(before, this.roomOutputs, audio.audience || "auto", this.audienceScreenNames(), { chosenNow, chosenName: audio.audienceName || t("The chosen output"), skip: audio.audienceSkip });
    this.roomOutput = plan.decision;
    const target = plan.decision.output;
    if (!target) return;
    if (this.canSetRoomOutput) {
      if (plan.switchTo) {
        try {
          await invoke("set_audio_output", { id: plan.switchTo.id });
          await this.readRoomOutputs();
          this.roomDefaultId = plan.switchTo.id;
        } catch (error) {
          // The computer would not switch (Windows can refuse): the music at least goes there.
          this.warn(String(error));
          await this.routeMusicTo(plan.switchTo.name);
          return;
        }
      }
      // The music follows the computer's sound output, as videos on the audience screens do.
      if (audio.outputId) this.setAudio({ outputId: "" });
      void this.audio.setOutput("");
      this.soundPad.setOutput("");
    } else {
      await this.routeMusicTo(target.name);
    }
    const notice = plan.notice;
    const change = t("Change it in Settings › Sound & voice.");
    if (notice?.kind === "unplugged") {
      this.notify(t("{name} was unplugged", { name: notice.name }), { detail: t("Sound now goes to {output}. It goes back when {name} is plugged in again.", { output: notice.output, name: notice.name }), ms: 12_000 });
    } else if (notice?.kind === "moved") {
      const why = { "plugged-in": t("It was just plugged in."), unplugged: t("The output it used was unplugged."), screen: t("It is the audience screen's own sound."), other: "" }[notice.cause];
      this.notify(t("Sound now goes to {output}", { output: notice.output }), { detail: `${why} ${change}`.trim(), ms: 10_000 });
    } else if (notice?.kind === "start") {
      this.message = t("Sound goes to {output}. Change it in Settings › Sound & voice.", { output: notice.output });
    }
  };

  /** Where the computer cannot be told (Windows), the music itself goes to the output, found by name. */
  private routeMusicTo = async (name: string) => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.enumerateDevices || !this.canChooseAudioOutput) return;
    const devices = await media.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const match = devices.find((device) => device.kind === "audiooutput" && device.deviceId && device.deviceId !== "default" && device.label && (device.label === name || device.label.includes(name) || name.includes(device.label)));
    const id = match?.deviceId ?? "";
    if (id === this.workspace.audio.outputId) return;
    this.setAudio({ outputId: id });
    this.soundPad.setOutput(id);
    await this.audio.setOutput(id);
  };

  private audienceScreenNames = () => this.output.displays.filter((display) => display.audience).map((display) => display.name);

  // Backing tracks: a song with one plays it when the song goes live.

  /** The song whose backing track the deck is playing. */
  private backingSongId: string | null = null;

  /** After Program changes: start the live song's backing track, or let one go when its song left. */
  private followSongTrack = async () => {
    const songId = this.live.program.sourceId?.match(/^song:([^:#]+):/)?.[1] ?? null;
    if (songId && songId === this.backingSongId) return;
    const song = songId ? this.songs.find((entry) => entry.id === songId) : undefined;
    const track = song?.trackId ? this.audioTracks.find((entry) => entry.id === song.trackId) : undefined;
    if (song && track) {
      this.backingSongId = song.id;
      this.walkIn = null;
      void this.measureTracks([track]);
      await this.audio.play([track], 0, { playlistId: null, loop: false });
      this.message = t("{name}: its backing track is playing.", { name: song.title });
      return;
    }
    if (this.backingSongId && this.workspace.audio.stopTrackWithSong && this.audio.playing && this.audio.playlistId === null) this.audio.fadeOut(3);
    this.backingSongId = null;
  };

  // Walk-in: the "Service starts in" countdown on the screen while walk-in music plays, and the
  // music fades by itself when the countdown reaches zero.

  walkIn = $state<{ endsAt: number } | null>(null);
  private walkInTimer: ReturnType<typeof setInterval> | null = null;

  /** Start walk-in: to the service's start time (when it is ahead today), else in `minutes`. */
  startWalkIn = async (minutes = 10): Promise<string | null> => {
    const list = this.workspace.playlists.find((entry) => entry.id === "walk-in" && entry.trackIds.length) ?? this.workspace.playlists.find((entry) => this.playlistTracks(entry.id).length);
    if (!list || !this.playlistTracks(list.id).length) return t("Add music to the Walk-in playlist first.");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = this.service ? parseClock(this.service.startTime) : null;
    const serviceAt = start !== null ? today.getTime() + start * 60_000 : 0;
    const now = Date.now();
    const endsAt = serviceAt > now + 60_000 && serviceAt - now < 4 * 60 * 60_000 ? serviceAt : now + Math.max(1, minutes) * 60_000;
    const timer = { ...createTimer({ name: t("Service starts in"), mode: "target", targetAt: endsAt, label: t("Service starts in"), warningMs: 60_000 }), running: true };
    const theme = { ...this.theme(), fontSize: this.workspace.countdownSize };
    this.previewModel(presentTimer(timer, theme, now), "countdown:walk-in");
    await this.take();
    // After the take (which fades walk-in music), so the music starts fresh.
    this.backingSongId = null;
    await this.playPlaylist(list.id);
    this.walkIn = { endsAt };
    if (this.walkInTimer) clearInterval(this.walkInTimer);
    this.walkInTimer = setInterval(() => this.checkWalkIn(), 1000);
    this.message = t("Walk-in started: the countdown is on the screen and the music fades at zero.");
    return null;
  };

  private checkWalkIn() {
    const walk = this.walkIn;
    if (!walk) {
      if (this.walkInTimer) clearInterval(this.walkInTimer);
      this.walkInTimer = null;
      return;
    }
    if (Date.now() < walk.endsAt) return;
    this.audio.fadeOut(8);
    this.walkIn = null;
    this.message = t("The countdown reached zero; the walk-in music is fading out.");
  }

  /** End walk-in early: the music fades; the countdown stays until something else goes live. */
  stopWalkIn = () => {
    this.walkIn = null;
    this.audio.fadeOut(4);
  };

  // The sound pad: short clips with one click (an offering bell, an intro sting).

  soundPad = new SoundPad();

  addPadSounds = (assetIds: string[]) => {
    const tracks = this.audioTracks.filter((track) => assetIds.includes(track.id));
    const added = tracks.map((track) => ({ id: uid(), assetId: track.id, label: track.name.replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, 30) }));
    this.setAudio({ pad: [...this.workspace.audio.pad, ...added].slice(0, 24) });
    void this.measureTracks(tracks);
  };

  removePadSound = (id: string) => this.setAudio({ pad: this.workspace.audio.pad.filter((button) => button.id !== id) });

  renamePadSound = (id: string, label: string) =>
    this.setAudio({ pad: this.workspace.audio.pad.map((button) => (button.id === id ? { ...button, label: label.trim().slice(0, 30) || button.label } : button)) });

  pressPad = (id: string) => {
    const button = this.workspace.audio.pad.find((entry) => entry.id === id);
    const track = button ? this.audioTracks.find((entry) => entry.id === button.assetId) : undefined;
    const url = track ? mediaUrl(track) : null;
    if (!button || !track || !url) {
      this.warn(t("That sound is no longer in the media library."));
      return;
    }
    const gain = this.workspace.audio.even ? evenGain(this.workspace.audio.levels[track.id]) : 1;
    void this.soundPad.press(id, url, this.workspace.audio.volume * gain);
  };

  // A second audience screen (lobby, overflow room) with its own look.
  secondOpen = $state(false);

  setSecondOutput = (patch: Partial<SecondOutputSettings>) => {
    this.workspace = { ...this.workspace, secondOutput: { ...this.workspace.secondOutput, ...patch } };
    this.persistSoon();
    this.publishSecond();
  };

  /** Program as the second screen shows it. */
  secondModel = (): PresentationModel => {
    const settings = this.workspace.secondOutput;
    const own = settings.themeId ? this.themes.find((theme) => theme.id === settings.themeId) : undefined;
    const backdrop = own
      ? {
          theme: own,
          photo: own.background.type === "image" ? this.mediaSrc(own.background.assetId) : null,
          video: own.background.type === "video" ? this.mediaSrc(own.background.assetId) : null,
        }
      : null;
    return secondOutputModel(this.live.program.model, settings, backdrop, {
      theme: this.theme(),
      title: this.logoTitle(),
      imageUrl: this.logoImage(),
    });
  };

  /** The second screen's last frame as sent, so a Preview-only change does not re-fade it. */
  private secondSent = "";

  /** `always` false: only when its frame changed (every Preview/Program write comes through here). */
  private publishSecond = (always = true) => {
    if (typeof window === "undefined" || !this.secondOpen) return;
    const model = this.secondModel();
    const text = JSON.stringify(model);
    if (!always && text === this.secondSent) return;
    this.secondSent = text;
    const frame = { model, at: Date.now() };
    try {
      publishSecondLocal(frame);
    } catch {
      // Storage full or blocked: the second screen keeps its last frame.
    }
    if (isDesktop()) void emit("second-frame", JSON.stringify(frame)).catch(() => {});
  };

  openSecond = async () => {
    this.secondOpen = true;
    const name = this.workspace.secondOutput.name;
    if (isDesktop()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("second");
        if (existing) {
          await existing.setFocus();
          this.publishSecond();
          return;
        }
        const chosen = this.workspace.secondOutput.displayKey;
        const target =
          (chosen ? this.output.displays.find((display) => display.key === chosen) : undefined) ??
          this.output.displays.find((display) => !display.primary && !display.audience && display.name !== this.output.displayName) ??
          null;
        const second = new WebviewWindow(
          "second",
          target
            ? { url: "/?second=1", title: name, x: target.x, y: target.y, width: target.width, height: target.height, decorations: false }
            : { url: "/?second=1", title: name, width: 1280, height: 720 },
        );
        second.once("tauri://error", (event) => {
          this.warn(t("The {name} screen could not open: {payload}", { name, payload: String(event.payload) }));
        });
        second.once("tauri://destroyed", () => (this.secondOpen = false));
        setTimeout(() => this.publishSecond(), 600);
        this.message = target ? t("{name} screen is on {display}.", { name, display: target.name }) : t("{name} screen opened. Drag it to that screen.", { name });
      } catch (error) {
        this.warn(errorText(error, t("The second screen could not open.")));
      }
      return;
    }
    this.publishSecond();
    const opened = window.open("./?second=1", "church-studio-second", "popup=yes,width=1280,height=720");
    if (opened) this.message = t("{name} screen opened. Drag it to that screen.", { name });
    else this.warn(t("The browser blocked the window. Allow pop-ups for this site, then try again."));
  };

  closeSecond = async () => {
    this.secondOpen = false;
    if (isDesktop()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await (await WebviewWindow.getByLabel("second"))?.destroy();
      } catch {
        // Already closed.
      }
    }
  };

  // Live captions: what is said, on the audience screen and on phones, translated when asked.
  captionsOn = $state(false);
  captions = $state(emptyCaptions());
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private translating: Promise<void> = Promise.resolve();

  /** Start or stop captions. Starting also starts listening if it is off. */
  setCaptions = async (on: boolean) => {
    if (on && !this.requireFeature("captions")) return;
    if (on && !this.voiceAllowed()) return;
    this.captionsOn = on;
    if (on && this.voice.status !== "listening" && this.voice.status !== "starting") await this.startVoice();
    this.message = on ? t("Captions on. What is said shows as it is heard.") : t("Captions off");
    this.publishCaptions(true);
  };

  setCaptionSettings = (patch: Partial<CaptionSettings>) => {
    this.workspace = { ...this.workspace, captions: { ...this.workspace.captions, ...patch } };
    this.persistSoon();
    this.publishCaptions(true);
  };

  clearCaptions = () => {
    this.captions = emptyCaptions();
    this.publishCaptions(true);
  };

  private hearCaption(latest: string, final: boolean) {
    const before = this.captions.next;
    this.captions = addHeard(this.captions, latest, final, Date.now());
    if (!this.captionsOn) return;
    if (this.captions.next !== before) void this.translateCaption(before);
    this.publishCaptions();
  }

  /** Translate a finished line into the chosen languages, one request at a time. */
  private translateCaption(id: number) {
    const languages = this.workspace.captions.languages;
    if (!languages.length || !aiReady(this.workspace.ai) || !aiFeatureOn(this.workspace.ai, "captions")) return;
    this.translating = this.translating.then(async () => {
      const line = this.captions.lines.find((entry) => entry.id === id);
      if (!line) return;
      const context = this.captions.lines.filter((entry) => entry.id < id).slice(-2).map((entry) => entry.text).join(" ");
      try {
        const reply = await this.assistant.post(translateRequest(this.workspace.ai, line.text, languages, context));
        const translations = parseTranslations(replyText(this.workspace.ai.provider, reply), languages);
        if (Object.keys(translations).length) this.captions = withTranslation(this.captions, id, translations);
      } catch (error) {
        this.warn(t("Caption translation: {reason}", { reason: error instanceof Error ? error.message : t("it did not work") }));
      }
    });
  }

  /** The caption rows to the audience screen, at most every 120 ms. */
  private publishCaptions(now = false) {
    if (typeof window === "undefined") return;
    const send = () => {
      this.captionTimer = null;
      const settings = this.workspace.captions;
      const frame = { rows: this.captionsOn && settings.screen ? captionRows(this.captions, 2, 64) : [], position: settings.position, size: settings.size, at: Date.now() };
      try {
        publishCaptionsLocal(frame);
      } catch {
        // Storage blocked: the desktop event still reaches the screen.
      }
      if (isDesktop()) void emit("captions", JSON.stringify(frame)).catch(() => {});
    };
    if (now) {
      if (this.captionTimer) clearTimeout(this.captionTimer);
      send();
      return;
    }
    this.captionTimer ??= setTimeout(send, 120);
  }

  /** The captions link for congregants' phones (a new link replaces the old one). */
  createCaptionsLink = async (): Promise<string | null> => {
    if (!this.voiceAllowed()) return null;
    if (!this.desktop()) {
      this.message = t("Captions on phones work with the desktop app, which runs the network server.");
      return null;
    }
    const token = randomToken(24);
    const device = captionsDevice(crypto.randomUUID(), await sha256Hex(token), Date.now());
    const gate = this.remoteGate();
    this.applyRemoteGate({ ...gate, devices: [...gate.devices.filter((entry) => !entry.captions), device] }, true);
    if (!this.remoteLanUrl) await this.attachLanRemote(true);
    this.message = t("Captions link ready. Show its QR code so people can follow on their phones.");
    return token;
  };

  /** What a phone shows: new lines since `after`, in its language when translated. */
  private captionsRemoteState = (after: number, language: string | null): Record<string, string> => {
    const languages = this.workspace.captions.languages;
    const lang = language && languages.includes(language) ? language : null;
    return {
      desk: this.workspace.churchName || "Church Studio",
      on: this.captionsOn && this.voice.status === "listening" ? "1" : "",
      // Nothing reaches phones while captions are off, even though the desk keeps a transcript.
      lines: JSON.stringify(this.captionsOn ? linesFor(this.captions, after, lang) : []),
      interim: lang || !this.captionsOn ? "" : this.captions.interim,
      languages: JSON.stringify(languages.map((code) => ({ code, name: CAPTION_LANGUAGES.find((entry) => entry.code === code)?.name ?? code }))),
    };
  };

  /** A stage link for a phone or tablet on the platform: it shows the stage and presses nothing. */
  createStageLink = async (name: string): Promise<string | null> => {
    if (!this.requireFeature("stage-display")) return null;
    if (!this.desktop()) {
      this.message = t("Stage links work with the desktop app, which runs the network server.");
      return null;
    }
    const token = randomToken(24);
    const device = stageDevice(crypto.randomUUID(), name.trim() || "Stage", await sha256Hex(token), Date.now());
    const gate = this.remoteGate();
    this.applyRemoteGate({ ...gate, devices: [...gate.devices, device] }, true);
    if (!this.remoteLanUrl) await this.attachLanRemote(true);
    this.message = t("{name} can now show the stage. Open the link or scan the code on that phone or tablet.", { name: device.name });
    return token;
  };

  /** The running section for a stage link: its name and minutes left (negative: over). */
  private sectionStageFields = (): Record<string, string> => {
    const deadline = this.runningDeadline();
    if (!deadline) return { section: "", sectionLeft: "" };
    return { section: deadline.name, sectionLeft: String(Math.round((deadline.endsAt - Date.now()) / 60_000)) };
  };

  /** What a stage link shows: the words now and next, the song place, message, notes, timer. */
  private stageRemoteState = (): Record<string, string> => {
    const program = this.live.program.model;
    const preview = this.live.preview.model;
    const now = keyWords(program);
    const next = keyWords(preview);
    const sermon = this.sermonFocus && this.sermons.find((entry) => entry.id === this.sermonFocus?.sermonId);
    const notes = sermon ? (sermon.sections.find((section) => section.id === this.sermonFocus?.sectionId)?.notes ?? "") : "";
    const timer = timersIn(program)[0];
    const view = timer ? timerDisplay(timerFromPaint(timer), Date.now()) : null;
    const layout = this.workspace.stageLayout;
    const describe = (model: PresentationModel) =>
      model.layout === "black" ? "Black" : model.layout === "empty" ? "Clear" : model.layout === "image" ? "Picture" : model.layout === "video" ? "Video" : model.layout === "composition" ? "Look" : model.layout === "web" ? "Web page" : "";
    return {
      desk: this.workspace.churchName || "Church Studio",
      live: this.output.online ? "on" : "off",
      nowCue: now?.cue ?? describe(program),
      nowBody: now?.body ?? "",
      nextCue: layout.next ? (next?.cue ?? describe(preview)) : "",
      nextBody: layout.next ? (next?.body ?? "") : "",
      place: this.songFocus && program.layout === "lyrics" ? this.songPlace() : "",
      message: this.stageMessage,
      notes: layout.notes ? notes.slice(0, 1200) : "",
      timer: view?.text ?? "",
      timerWarn: view?.warning ? "1" : "",
      ...this.sectionStageFields(),
      clock: layout.clock ? "1" : "",
      size: layout.size,
    };
  };

  stopRemoteLan = async () => {
    this.closeRemotePairing();
    internetRemote.stop();
    try {
      await api.stopRemoteLan();
    } catch (error) {
      console.error(error);
    }
    this.remoteLanUrl = "";
    this.message = t("Phone remote server stopped.");
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
      this.message = t("{name} wants to control this desk. Allow or decline it.", { name: request?.name ?? t("A phone") });
    }
    const action = routed.action;
    if (!action) return routed.reply;
    if (action.kind === "stage") return remoteEnvelope("stage", this.stageRemoteState());
    if (action.kind === "captions") return remoteEnvelope("captions", this.captionsRemoteState(Number(envelope.payload.after) || 0, envelope.payload.lang || null));
    try {
      if (action.kind === "command") await this.runFromRemote(action.id);
      else if (action.kind === "preview-item") await this.selectItem(action.itemId);
      else if (action.kind === "preview-scene") {
        const saved = this.workspace.compositions.find((entry) => entry.id === action.sceneId);
        if (saved) this.previewLook(restoreComposition(saved));
      }
    } catch (error) {
      return remoteEnvelope("denied", { reason: errorText(error, t("The desk could not do that.")) });
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
      // The phone wears the desk's look and speaks its language.
      theme: this.workspace.appearance.theme,
      accent: this.workspace.appearance.accent,
      lang: this.workspace.appearance.language ?? "en",
      output: this.output.online ? "on" : "off",
      undo: this.programBefore ? "1" : "",
      cursor: this.cursor.itemId ?? "",
      scene: this.lookOnPreview?.id ?? "",
      items: JSON.stringify(items.slice(0, 200)),
      scenes: JSON.stringify(scenes.slice(0, 100)),
      live: REMOTE_LIVE_COMMANDS.join(","),
      timer: this.programTimerState,
      music: this.audio.current ? (this.audio.playing && !this.audio.fading ? "playing" : "paused") : "",
      track: this.audio.current?.name ?? "",
    };
  };

  /** Next/Previous move Preview only (songs, sermon sections, verses, then the rundown). */
  private runFromRemote = async (command: CommandId | "next-item" | "previous-item" | "music-toggle" | "music-next" | "music-fade" | "live-next" | "live-previous" | "undo" | "open-output" | "close-output") => {
    if (command === "undo") {
      await this.undoProgram();
      return;
    }
    if (command === "open-output") {
      await this.openAudience();
      return;
    }
    if (command === "close-output") {
      await this.closeAudience();
      return;
    }
    // Like the desk's Live arrows under Program: step, then straight to the screen.
    if (command === "live-next" || command === "live-previous") {
      await this.runFromRemote(command === "live-next" ? "next" : "previous");
      await this.take();
      return;
    }
    if (command === "music-toggle") {
      if (this.audio.current) await this.audio.toggle();
      else await this.playPlaylist(this.workspace.playlists.find((list) => list.trackIds.length)?.id ?? "walk-in");
      return;
    }
    if (command === "music-next") {
      await this.audio.step(1);
      return;
    }
    if (command === "music-fade") {
      this.walkIn = null;
      this.audio.fadeOut(4);
      return;
    }
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

  private mediaSrc = (id: string | null | undefined) => mediaUrl(this.#allMedia.find((asset) => asset.id === id) ?? null);

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

  /** The same verses in the side-by-side translation (the item's own, else the desk's), if not this one. */
  private async parallelVerses(bible: BibleItem): Promise<{ attribution: string | null; verses: VerseText[] } | null> {
    const id = bible.secondTranslationId === undefined ? this.workspace.parallelTranslationId : bible.secondTranslationId;
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
      const lyrics = lyricsFor(song, item.lyric.sectionId, item.title, this.workspace.songLanguage);
      const credit = song ? creditFor(song, item.lyric.sectionId, this.workspace.ccliLicense) : null;
      return presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines, credit });
    }
    if (item.kind === "image" && item.image) {
      return presentImageOrEmpty(theme, this.mediaSrc(item.image.assetId));
    }
    if (item.kind === "video" && item.video) {
      const end = videoEnd(item.video);
      const trim = cleanTrim(item.video);
      return presentVideo({ theme, videoUrl: this.mediaSrc(item.video.assetId), loop: end === "loop", muted: item.video.muted, ...trim, end });
    }
    if (item.kind === "web" && item.web) return presentWeb({ theme, url: item.web.url, mute: item.web.mute, loop: item.web.loop });
    if (item.kind === "deck" && item.deck) {
      const deck = this.decks.find((entry) => entry.id === item.deck?.deckId);
      const page = deck?.pages[0];
      if (!page) return emptyModel(theme);
      if (deck.scroll) {
        const document = this.documentFrame(deck.id, 0);
        if (document) return document;
      }
      return presentComposition(withMediaUrls(page, this.mediaSrc), { theme, now: Date.now(), canvas: this.outputCanvas() });
    }
    if (item.kind === "composition" && item.composition) {
      const saved = this.workspace.compositions.find((entry) => entry.id === item.composition?.compositionId);
      if (!saved) return presentSavedLook(this.workspace.compositions, item.composition.compositionId, { theme, now: Date.now() });
      return presentComposition(withMediaUrls(restoreComposition(saved), this.mediaSrc), { theme, now: Date.now(), canvas: this.outputCanvas() });
    }
    if (item.kind === "announcement" && item.announcement) {
      return presentAnnouncement({ theme, words: item.announcement, backgroundImageUrl: this.mediaSrc(item.announcement.imageId) ?? backgroundImageUrl });
    }
    const heading = item.slide?.heading ?? item.announcement?.heading ?? item.title;
    const body = item.slide?.body ?? item.announcement?.body ?? "";
    const slideImage = this.mediaSrc(item.slide?.imageId);
    return presentText({
      theme,
      layout: "title",
      heading,
      body,
      rich: item.slide?.rich ?? null,
      backgroundImageUrl: slideImage ?? backgroundImageUrl,
    });
  }

  selectItem = async (itemId: string, at: "resume" | "exact" | "first" | "last" = "resume") => {
    if (!this.requireFeature("service")) return;
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
    // A reading shown a few verses at a time: on LIVE, Preview shows the screen after the one up;
    // otherwise it picks up where it was left (from the top once finished), or at its last screen
    // when stepping back into it.
    const bible = found.item.bible;
    const per = bible ? this.perScreenOf(bible) : null;
    if (bible && per) {
      const starts = screenStarts(bible, per);
      const last = starts[starts.length - 1]!;
      const live = this.liveReading?.itemId === itemId && this.live.program.sourceId === itemId ? this.liveReading : null;
      const saved = this.readingAt[itemId];
      const start = live ? (stepScreenful(bible, live.start, per, 1) ?? live.start) : at === "last" ? last : at === "exact" && saved !== undefined ? saved : at === "resume" && saved !== undefined && saved < last ? saved : bible.startVerse;
      this.previewReading = { itemId, start };
      this.readingAt = { ...this.readingAt, [itemId]: start };
    } else this.previewReading = null;
    const model = await this.modelFor(this.screenfulItem(found.item));
    if (token !== this.selectToken) return;
    this.lookOnPreview = null;
    this.live = setPreview(this.live, frame(model, itemId, "cut"));
    this.previewFree = false;
    this.persistSoon();
  };

  /** The screen of a reading on Preview (the item and that screen's first verse). */
  previewReading = $state<{ itemId: string; start: number } | null>(null);
  /** The screen of a reading on LIVE, kept apart from Preview so neither moves the other. */
  liveReading = $state<{ itemId: string; start: number } | null>(null);
  /** Where each reading was left on Preview, so coming back to it picks up there. */
  private readingAt = $state<Record<string, number>>({});
  /** A verse searched or heard onto Preview, outside the running order. */
  previewFree = $state(false);

  /** The reading on Preview (for the running order's position marks). */
  get bibleStep(): { itemId: string; start: number } | null {
    return this.previewReading;
  }

  /** Verses a screen for a reading: its own setting, else long readings a few at a time. */
  perScreenOf = (bible: BibleItem): number | null => versesPerScreen(bible, this.service?.versesPerScreen);

  /** The item as one screen (a reading shown a few verses at a time), else as it is. */
  private screenfulItem(item: PresentationItem, at?: number): PresentationItem {
    const bible = item.bible;
    const per = bible ? this.perScreenOf(bible) : null;
    if (!bible || !per) return item;
    const start = at ?? (this.previewReading?.itemId === item.id ? this.previewReading.start : bible.startVerse);
    const shown = screenful(bible, start, per);
    const book = this.books.find((entry) => entry.ord === bible.bookOrd);
    const reference = formatReference(book?.name ?? bible.reference.replace(/\s*\d+(:.*)?$/, ""), bible.chapter, shown.start, shown.end, book?.chapters ?? 1);
    return { ...item, bible: { ...bible, startVerse: shown.start, endVerse: shown.end, reference } };
  }

  /** Verses heard while on the Service page, offered beside Preview instead of replacing it (newest first). */
  heardVerses = $state<BibleItem[]>([]);

  offerHeardVerse = (passage: BibleItem) => {
    this.heardVerses = [passage, ...this.heardVerses.filter((entry) => entry.reference !== passage.reference)].slice(0, 3);
  };

  dismissHeardVerse = (reference: string | null = null) => {
    this.heardVerses = reference === null ? [] : this.heardVerses.filter((entry) => entry.reference !== reference);
  };

  /** Back from a verse searched or heard: the running order's selected item on Preview again. */
  backToService = async () => {
    if (this.cursor.itemId) await this.selectItem(this.cursor.itemId, "exact");
    else {
      this.previewFree = false;
      this.message = t("Pick an item in the running order.");
    }
  };

  /** Put one screen of a reading on Preview. */
  private showReadingScreen = async (item: PresentationItem, start: number) => {
    this.previewReading = { itemId: item.id, start };
    this.readingAt = { ...this.readingAt, [item.id]: start };
    const model = await this.modelFor(this.screenfulItem(item, start));
    this.lookOnPreview = null;
    this.live = setPreview(this.live, frame(model, item.id, "cut"));
    this.previewFree = false;
  };

  /**
   * Next / previous screen of the reading selected. When it is on LIVE, the next screen goes up
   * (and Preview moves on to the one after); otherwise Preview moves (LIVE too with Auto LIVE).
   * False at either end, so the step moves on through the running order.
   */
  private stepScreenful = async (direction: 1 | -1): Promise<boolean> => {
    if (!this.service || !this.cursor.itemId) return false;
    const item = findItem(this.service, this.cursor.itemId)?.item;
    const bible = item?.bible;
    const per = bible ? this.perScreenOf(bible) : null;
    if (!item || !bible || !per) return false;
    const live = this.liveReading?.itemId === item.id && this.live.program.sourceId === item.id ? this.liveReading : null;
    const from = live ? live.start : this.previewReading?.itemId === item.id ? this.previewReading.start : bible.startVerse;
    const next = stepScreenful(bible, from, per, direction);
    if (next === null) return false;
    await this.showReadingScreen(item, next);
    if (live || this.liveOnClick) await this.take();
    else this.message = t("{reference} is on Preview.", { reference: this.screenfulItem(item, next).bible!.reference });
    return true;
  };

  /** After LIVE: note the reading screen that went up, and run Preview one screen ahead of it. */
  private followReading = async () => {
    const shown = this.previewReading;
    const programId = this.live.program.sourceId;
    if (!shown || programId !== shown.itemId || !this.service) {
      if (this.liveReading && programId !== this.liveReading.itemId) this.liveReading = null;
      return;
    }
    this.liveReading = { ...shown };
    const item = findItem(this.service, shown.itemId)?.item;
    const bible = item?.bible;
    const per = bible ? this.perScreenOf(bible) : null;
    const ahead = bible && per ? stepScreenful(bible, shown.start, per, 1) : null;
    if (item && ahead !== null) await this.showReadingScreen(item, ahead);
  };

  /** The reading selected, as screens: which is on Preview and LIVE, and what Next shows. */
  readingNow = (): { itemId: string; count: number; preview: number | null; live: number | null; next: string | null; nextIndex: number | null } | null => {
    if (!this.service || !this.cursor.itemId) return null;
    const item = findItem(this.service, this.cursor.itemId)?.item;
    const bible = item?.bible;
    const per = bible ? this.perScreenOf(bible) : null;
    if (!item || !bible || !per) return null;
    const starts = screenStarts(bible, per);
    const live = this.liveReading?.itemId === item.id && this.live.program.sourceId === item.id ? this.liveReading.start : null;
    const preview = this.previewReading?.itemId === item.id ? this.previewReading.start : null;
    // Next sends the screen after the one on LIVE; with nothing of it up, it moves Preview on.
    const nextStart = stepScreenful(bible, live ?? preview ?? bible.startVerse, per, 1);
    const index = (start: number | null) => (start === null ? null : starts.indexOf(start) + 1 || null);
    return {
      itemId: item.id,
      count: starts.length,
      preview: index(preview),
      live: index(live),
      next: nextStart === null ? null : this.screenfulItem(item, nextStart).bible!.reference,
      nextIndex: index(nextStart),
    };
  };

  /** Verses a screen for a reading: a number, 0 for all at once, or null for the automatic choice. */
  setVersesPerScreen = async (itemId: string, perScreen: number | null) => {
    if (!this.service) return;
    const found = findItem(this.service, itemId);
    if (!found?.item.bible) return;
    const bible = { ...found.item.bible };
    if (perScreen !== null && perScreen >= 0) bible.perScreen = Math.min(20, Math.round(perScreen));
    else delete bible.perScreen;
    this.updateItem({ ...found.item, bible });
    const { [itemId]: _dropped, ...rest } = this.readingAt;
    this.readingAt = rest;
    if (this.cursor.itemId === itemId) await this.selectItem(itemId, "first");
  };

  /** While the service runs, choosing an item sends it straight to LIVE (unless turned off for this service). */
  get liveOnClick(): boolean {
    return this.serviceRunning && this.service?.liveOnClick !== false;
  }

  setLiveOnClick = (on: boolean) => {
    if (!this.service) return;
    this.service = { ...this.service, liveOnClick: on };
    this.persistSoon();
    this.message = on ? t("While the service runs, a click sends the item straight to LIVE.") : t("A click puts the item on Preview; LIVE sends it.");
  };

  /** Choose an item from the running order: Preview, and LIVE too while the service runs (if on). */
  chooseItem = async (itemId: string, at: "resume" | "first" | "last" = "resume") => {
    // A reading already on LIVE stays where it is: Preview holds its next verses until Next or LIVE.
    const readingUp = this.liveReading?.itemId === itemId && this.live.program.sourceId === itemId;
    await this.selectItem(itemId, at);
    if (this.liveOnClick && !readingUp && this.cursor.itemId === itemId && this.live.preview.model.layout !== "empty") await this.take();
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
    // A PDF on Preview scrolls, then on through the rundown at either end.
    if (this.stepPreviewDocument(direction)) return;
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
    const freeVerse = this.previewFree && this.live.preview.model.layout === "scripture" && this.previewBible !== null;
    if (freeVerse && (await this.stepPreviewScripture(direction))) return;
    // A look with a scripture region on Preview steps its verse.
    if (this.lookVerse("preview") && (await this.stepLookVerse("preview", direction))) return;
    // A scripture item shown a few verses at a time steps through its verses first.
    if (await this.stepScreenful(direction)) return;
    if (!this.service) return;
    const next = stepCursor(this.service, this.cursor, direction);
    // Back into a reading lands on its last screen; forward, on its first.
    if (next.itemId && next.itemId !== this.cursor.itemId) await this.chooseItem(next.itemId, direction < 0 ? "last" : "first");
  };

  previewModel = (model: PresentationModel, sourceId: string | null) => {
    // Whatever was still loading for Preview (a running-order item, a verse) is now out of date.
    this.selectToken++;
    this.lookOnPreview = null;
    this.previewFree = false;
    this.live = setPreview(this.live, frame(model, sourceId, "cut"));
  };

  previewLook = (composition: Composition) => {
    if (!this.requireFeature("slides")) return;
    this.selectToken++;
    this.songFocus = null;
    this.sermonFocus = null;
    const clean = sanitizeComposition(composition);
    this.lookOnPreview = clean;
    const model = presentComposition(withMediaUrls(clean, this.mediaSrc), { theme: this.theme(), now: Date.now(), canvas: this.outputCanvas() });
    this.live = previewComposition(this.live, model, clean.id);
    this.message = t("{name} is on Preview. LIVE still sends Program.", { name: clean.name });
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
      this.warn(target === "program" ? t("The look on Program has no scripture region.") : t("Put a look with a scripture region on Preview first."));
      return false;
    }
    const translation = translationId ?? this.translationForLayer(layer.source.payload);
    const fields = await this.scriptureFields(reference, translation);
    if (!fields || fields.type !== "scripture") {
      this.message = t("Nothing found for “{reference}”. Try John 3:16 or Psalm 23:1-3.", { reference: reference.trim() });
      return false;
    }
    const next = withLiveScripture(look, layer.id, { reference: fields.reference, body: fields.body, attribution: fields.attribution, verse: fields.verse, translationId: translation });
    const model = presentComposition(withMediaUrls(next, this.mediaSrc), { theme: this.theme(), now: Date.now(), canvas: this.outputCanvas() });
    if (target === "preview") {
      this.lookOnPreview = next;
      this.live = setPreview(this.live, frame(model, compositionSourceId(next.id), "cut"));
      this.message = t("{reference} is on Preview. GO LIVE sends it.", { reference: fields.reference });
      return true;
    }
    if (!this.desktop() && !this.controlsAudience) {
      this.warn(t("This window is not sending to the audience."));
      return false;
    }
    this.lookOnProgram = next;
    this.releaseHold();
    this.live = replaceProgramModel(this.live, model, "fade");
    await this.pushProgram();
    this.message = t("{reference} is live.", { reference: fields.reference });
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
        this.message = direction > 0 ? t("That is the end of {book}.", { book: book.name }) : t("That is the start of {book}.", { book: book.name });
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
    this.message = t("Sides swapped on Preview.");
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
      ? t("{names} unlinked: a locked scene uses the shared source. LIVE still sends Program.", { names: synced.unlinked.join(", ") })
      : t("{name} saved. LIVE still sends Program.", { name: clean.name });
  };

  /** Save a look's arrangement as a layout to start from again (content is filled from the desk). */
  saveLookLayout = (composition: Composition) => {
    const layout = layoutFromLook(composition, composition.name);
    if (layout.slots.length === 0) {
      this.message = t("Add a visible layer before saving a layout.");
      return;
    }
    this.workspace = { ...this.workspace, customLayouts: [layout, ...this.workspace.customLayouts].slice(0, 60) };
    this.persistSoon();
    this.message = t("{name} saved under Your layouts.", { name: layout.name });
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
    this.message = t("{name} is on Preview. LIVE still sends Program.", { name: scene.name });
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
    this.message = t("{name} is on Preview. LIVE still sends Program.", { name: scene.name });
    return scene;
  };

  /** Apply a look mutation, persist, and refresh Preview. No-ops when scene-locked. */
  editSceneLook = (next: Composition) => {
    const clean = sanitizeComposition(next);
    const prior = this.workspace.compositions.find((entry) => entry.id === clean.id);
    if (prior?.locked && clean.locked) {
      this.message = t("{name} is locked.", { name: clean.name });
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
    this.message = locked ? t("{name} locked.", { name: next.name }) : t("{name} unlocked.", { name: next.name });
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
      this.warn(t("Used in locked scene \"{blocked}\". Unlock to edit.", { blocked: result.blocked[0] }));
      return result.blocked;
    }
    this.workspace = { ...this.workspace, sources: result.sources, compositions: result.looks };
    this.persistSoon();
    const open = this.lookOnPreview && result.looks.find((entry) => entry.id === this.lookOnPreview?.id);
    if (open) this.previewLook(restoreComposition(open));
    this.message = t("{name} saved. Program updates when you go live.", { name });
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
    if (!this.voiceAllowed()) return;
    await this.startVoice();
  };

  startVoice = async () => {
    if (this.voice.status === "starting" || this.voice.status === "listening") return;
    if (!canUse("voice-detect")) {
      this.voice = { ...this.voice, status: "error", error: "unsupported", message: t("Voice is not available in this build.") };
      return;
    }
    this.voice = { ...this.voice, status: "starting", error: null, heard: "", hearing: false, level: 0, message: t("Starting the microphone…") };
    const blocked = await prepareListening();
    if (this.voice.status !== "starting") return;
    if (blocked) {
      this.voice = { ...this.voice, status: "error", error: blocked.kind, message: blocked.message };
      return;
    }
    // A blocked or muted microphone gives silence, not an error (Windows never asks a desktop app).
    let soundReached = false;
    const handlers = {
      onHeard: (text: string, final: boolean, alternatives: string[], latest: string) =>
        this.handleVoiceHeard(text, final, alternatives, latest),
      onLevel: (level: number) => {
        this.voice.level = level;
        if (level > SILENT_LEVEL) soundReached = true;
      },
      onError: (message: string, kind: ListenErrorKind) => {
        this.voice = { ...this.voice, status: "error", error: kind, message, level: 0 };
      },
      onEnd: () => {
        this.stopVoiceEngine = null;
        if (this.voice.status === "error") return;
        this.voice = { ...this.voice, status: "stopped", level: 0, hearing: false, message: this.voice.message || t("Listening stopped.") };
      },
      onStatus: (message: string) => {
        this.voice.message = message;
      },
    };
    this.voice = {
      ...this.voice,
      status: "listening",
      message: t("Listening. Read a verse to put it on Preview, or say “Studio next”, “Studio open songs”."),
    };
    const filter = this.workspace.voice.noiseFilter ?? "off";
    const engine = this.workspace.voice.engine ?? "system";
    const words = expectedWords(this.workspace.voice.words ?? []);
    // A speech service the church has its own key for: the same in the app and in a browser.
    const cloudKey = engine === "elevenlabs" || engine === "deepgram" ? this.workspace.voice.speechKeys?.[engine] : undefined;
    if ((engine === "elevenlabs" || engine === "deepgram") && cloudKey) {
      this.stopVoiceEngine = startCloudListening(handlers, { service: engine, key: cloudKey, words, filter });
      this.watchForSilence(this.stopVoiceEngine, () => soundReached);
      return;
    }
    const local = engine === "accurate" ? "accurate" : "system";
    this.stopVoiceEngine = isDesktop() ? startNativeListening(handlers, filter, words, local) : startListening(handlers, filter);
    this.watchForSilence(this.stopVoiceEngine, () => soundReached);
  };

  /** Still nothing from the microphone after a while: say where to look instead of waiting quietly. */
  private watchForSilence(engine: (() => void) | null, reached: () => boolean) {
    window.setTimeout(() => {
      if (this.stopVoiceEngine !== engine || this.voice.status !== "listening" || reached()) return;
      this.voice.message = onWindows()
        ? t("Nothing is reaching the microphone. Check it is plugged in and not muted, and that Windows Settings › Privacy & security › Microphone lets desktop apps use it.")
        : t("Nothing is reaching the microphone. Check it is plugged in, not muted, and chosen as the computer's input.");
    }, SILENCE_HINT_MS);
  }

  stopVoice = (message = t("Listening stopped.")) => {
    const stop = this.stopVoiceEngine;
    this.stopVoiceEngine = null;
    this.voice = { ...this.voice, status: "stopped", error: null, level: 0, hearing: false, message };
    stop?.();
  };

  openVoicePrivacy = () => void openPrivacySettings();

  private handleVoiceHeard = (rawText: string, final: boolean, rawAlternatives: string[], rawLatest: string) => {
    if (this.voice.status !== "listening") return;
    // Misheard words put right first (voice/words.ts), so the transcript, captions, commands and
    // verse finding all read "Ephesians 4", not "efficient 4".
    const words = this.workspace.voice?.words ?? [];
    const fixedLatest = fixHeard(rawLatest, words);
    const text = fixHeard(rawText, words).text;
    const latest = fixedLatest.text;
    const alternatives = rawAlternatives.map((option) => fixHeard(option, words).text);
    if (this.voicePractice) {
      this.notePractice(rawLatest || rawText, latest || text, fixedLatest.applied, final);
      return;
    }
    if (final) this.noteWords(latest, fixedLatest.applied);
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
    // Everything heard goes to the desk's transcript; the screen and phones get it only with captions on.
    this.hearCaption(latest, final);
    if (final) this.liveNotes.hear(latest);
    this.followSermon(text);
    for (const listener of this.voiceListeners) listener(text, final, alternatives);
  };

  // Follow the sermon: name the slide being preached (decks in this service and the one showing),
  // and in Suggest put it on Preview, in Auto-advance on the screen when a slide of that deck is up.
  sermonFollow = $state<{ mode: "off" | "suggest" | "auto"; match: SlideMatch | null }>({ mode: "off", match: null });
  private sermonFollowAt = 0;

  setSermonFollow = (mode: "off" | "suggest" | "auto") => {
    this.sermonFollow = { mode, match: null };
  };

  /** The slide pages that can be followed: decks in the open service, and any deck showing. */
  private followSlides(): SlideIndex {
    const ids = new Set<string>();
    for (const section of this.service?.sections ?? []) for (const item of section.items) if (item.kind === "deck" && item.deck) ids.add(item.deck.deckId);
    for (const source of [this.live.program.sourceId, this.live.preview.sourceId]) {
      const id = deckSource(source)?.deckId;
      if (id) ids.add(id);
    }
    const slides: SlideText[] = [];
    for (const deck of this.decks) {
      if (!ids.has(deck.id)) continue;
      deck.pages.forEach((page, index) => slides.push({ key: `deck:${deck.id}:${index}`, label: `${deck.name} · ${index + 1}`, text: deckPageText(page) }));
    }
    return buildSlideIndex(slides);
  }

  private followSermon(heard: string) {
    if (this.sermonFollow.mode === "off" || !heard) return;
    const now = Date.now();
    if (now - this.sermonFollowAt < 1500) return;
    const program = this.live.program.sourceId;
    const match = matchSlide(heard, this.followSlides(), program?.startsWith("deck:") ? program : null);
    if (!match) return;
    this.sermonFollow = { ...this.sermonFollow, match };
    if (match.key === program || match.key === this.live.preview.sourceId) return;
    this.sermonFollowAt = now;
    const target = deckSource(match.key);
    if (!target) return;
    this.previewDeckPage(target.deckId, target.index);
    // Auto-advance changes the screen only while a slide of that same deck is up there.
    if (this.sermonFollow.mode === "auto" && deckSource(program)?.deckId === target.deckId) void this.take();
  }

  /** The slide on Program, one page on or back (voice "next slide" with live commands on). */
  private async stepProgramDeck(direction: 1 | -1): Promise<boolean> {
    const doc = this.live.program.model.document;
    if (this.live.program.sourceId?.startsWith("doc:") && doc) {
      const next = stepScroll(doc.at, direction, this.documentLength(this.live.program.model));
      if (next === null) return false;
      this.scrollProgramTo(next);
      return true;
    }
    const on = deckSource(this.live.program.sourceId);
    if (!on) return false;
    const deck = this.decks.find((entry) => entry.id === on.deckId);
    const next = deck ? stepDeckPage(deck, on.index, direction) : null;
    if (!deck || next === null) return false;
    this.previewDeckPage(deck.id, next);
    await this.take();
    return true;
  }

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
        // With live commands on, "next slide" moves the slide on the screen itself.
        if ((command.id === "next" || command.id === "previous") && this.voice.allowLive && (await this.stepProgramDeck(command.id === "next" ? 1 : -1))) {
          record("executed", t("{label}: the slide on the screen moved.", { label }));
          return;
        }
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
      record("failed", errorText(error, t("{label} failed.", { label })));
    }
  };

  /** Translation chosen by voice; scripture previews from the session use it. */
  voiceTranslationId = $state("");

  // --- Misheard words: learned from the operator, practised in Settings › Audio & voice ----------

  /** Words that sat where a book should be, in the last phrase that found no verse. */
  private voiceMisses: { misses: NearMiss[]; at: number } | null = null;

  /** After a final phrase: count fixes used, and keep near misses for the next passage put up. */
  private noteWords(latest: string, applied: Applied[]) {
    const words = this.workspace.voice?.words ?? [];
    if (applied.length && words.some((word) => applied.some((item) => item.heard === word.heard))) {
      this.saveVoiceSettings({ words: words.map((word) => (applied.some((item) => item.heard === word.heard) ? { ...word, uses: (word.uses ?? 0) + 1 } : word)) });
    }
    if (spokenReference(latest)) {
      this.voiceMisses = null;
      return;
    }
    const misses = nearMisses(latest);
    if (misses.length) this.voiceMisses = { misses, at: Date.now() };
  }

  /** The operator put up a passage soon after a near miss: what was heard was that book. */
  private learnWord(passage: BibleItem) {
    const pending = this.voiceMisses;
    if (!pending || Date.now() - pending.at > 30_000) return;
    this.voiceMisses = null;
    const words = this.workspace.voice?.words ?? [];
    const fix = learnFix(pending.misses, passage, words);
    if (!fix) return;
    this.saveVoiceSettings({ words: [...words, fix] });
    this.notify(t("Learned: “{heard}” means {means}", { heard: fix.heard, means: fix.means }), {
      detail: t("Next time it is put right by itself. If that was wrong, remove it."),
      actions: [{ label: t("Remove"), run: () => this.removeWord(fix.heard) }],
      ms: 9000,
    });
  }

  addWord = (heard: string, means: string) => {
    const words = (this.workspace.voice?.words ?? []).filter((word) => word.heard !== heard.trim().toLowerCase());
    this.saveVoiceSettings({ words: [...words, { heard, means, source: "yours", uses: 0, at: Date.now() }] });
  };

  removeWord = (heard: string) => {
    this.saveVoiceSettings({ words: (this.workspace.voice?.words ?? []).filter((word) => word.heard !== heard) });
  };

  /** Practice: read a reference aloud and see what the recognizer wrote, then teach it. */
  voicePractice = $state<{ target: string; book: string; raw: string; fixed: string; applied: Applied[]; found: string | null; final: boolean; startedVoice: boolean } | null>(null);
  private practiceTargets = ["Ephesians 4:1", "Philippians 4:13", "Galatians 5:22", "Colossians 3:16", "Habakkuk 2:2", "Ecclesiastes 3:1", "Deuteronomy 6:5", "Leviticus 19:18", "1 Thessalonians 5:16", "Psalm 23:1", "Isaiah 40:31", "Jeremiah 29:11", "Ezekiel 37:4", "Zechariah 4:6", "Malachi 3:10", "Hebrews 11:1", "Lamentations 3:22", "Nehemiah 8:10", "Haggai 2:9", "2 Timothy 1:7", "Revelation 21:4", "Proverbs 3:5", "Matthew 6:33", "Luke 2:10", "Romans 8:28"];

  startPractice = async () => {
    const target = this.practiceTargets[Math.floor(Math.random() * this.practiceTargets.length)]!;
    const startedVoice = this.voice.status !== "listening";
    this.voicePractice = { target, book: target.replace(/\s+\d+:\d+$/, "").replace(/^\d\s+/, "").replace(/^Psalm$/, "Psalms"), raw: "", fixed: "", applied: [], found: null, final: false, startedVoice };
    if (startedVoice) await this.startVoice();
  };

  nextPractice = () => {
    if (!this.voicePractice) return;
    const others = this.practiceTargets.filter((item) => item !== this.voicePractice!.target);
    const target = others[Math.floor(Math.random() * others.length)]!;
    this.voicePractice = { ...this.voicePractice, target, book: target.replace(/\s+\d+:\d+$/, "").replace(/^\d\s+/, "").replace(/^Psalm$/, "Psalms"), raw: "", fixed: "", applied: [], found: null, final: false };
  };

  stopPractice = () => {
    const started = this.voicePractice?.startedVoice;
    this.voicePractice = null;
    if (started) this.stopVoice();
  };

  private notePractice(raw: string, fixed: string, applied: Applied[], final: boolean) {
    if (!this.voicePractice) return;
    const hit = spokenReference(fixed);
    this.voicePractice = { ...this.voicePractice, raw, fixed, applied, final, found: hit?.startVerse ? `${hit.bookName} ${hit.chapter}:${hit.startVerse}` : hit ? `${hit.bookName} ${hit.chapter}` : null };
  }

  saveVoiceSettings = (patch: Partial<VoiceSettings>) => {
    this.workspace = { ...this.workspace, voice: sanitizeVoiceSettings({ ...this.workspace.voice, ...patch }) };
    this.persistSoon();
  };

  /** Noise filter for listening. While listening, restarts it so the change is heard at once. */
  setNoiseFilter = async (noiseFilter: NoiseFilter) => {
    this.saveVoiceSettings({ noiseFilter });
    const names = { off: "off", light: "light", strong: "strong" } as const;
    if (this.voice.status !== "listening") {
      this.message = t("Noise filter {noiseFilter}. It applies the next time you listen.", { noiseFilter: names[noiseFilter] });
      return;
    }
    this.stopVoice(`Noise filter ${names[noiseFilter]}. Listening again…`);
    await this.startVoice();
  };

  // --- Accurate listening (Whisper on this computer) -------------------------------------------

  /** The model's state: unknown until asked, then here or not, and a download's progress (0..1). */
  accurate = $state<{ model: AccurateModel | null; progress: number | null; error: string | null }>({ model: null, progress: null, error: null });

  refreshAccurate = async () => {
    try {
      // Await first: spreading before the await would keep a stale progress and, read inside an
      // effect, make that effect depend on (and loop on) `accurate`.
      const model = await accurateModel();
      this.accurate = { ...this.accurate, model };
    } catch {
      this.accurate = { ...this.accurate, model: { installed: false, downloading: false, bytes: 0, unsupported: true } };
    }
  };

  downloadAccurate = async () => {
    this.accurate = { ...this.accurate, progress: 0, error: null };
    let stop: (() => void) | null = null;
    try {
      stop = await downloadAccurateModel((progress) => {
        if (!progress.done) {
          this.accurate = { ...this.accurate, progress: progress.total ? progress.received / progress.total : 0 };
          return;
        }
        stop?.();
        this.accurate = { ...this.accurate, progress: null, error: progress.error };
        void this.refreshAccurate().then(() => {
          // Downloaded on purpose: start using it.
          if (!progress.error) void this.setVoiceEngine("accurate");
        });
      });
    } catch (error) {
      stop?.();
      this.accurate = { ...this.accurate, progress: null, error: error instanceof Error ? error.message : String(error) };
    }
  };

  cancelAccurate = () => void cancelAccurateModel();

  deleteAccurate = async () => {
    if (this.workspace.voice.engine === "accurate") await this.setVoiceEngine("system");
    await deleteAccurateModel().catch(() => {});
    await this.refreshAccurate();
  };

  /** Which recognizer listens. While listening, restarts it so the change is heard at once. */
  setVoiceEngine = async (engine: VoiceEngine) => {
    this.saveVoiceSettings({ engine });
    if (this.voice.status !== "listening") return;
    this.stopVoice(engine === "accurate" ? t("Accurate listening on. Listening again…") : engine === "elevenlabs" || engine === "deepgram" ? t("{service} listening on. Listening again…", { service: CLOUD_SPEECH[engine].name }) : t("System listening on. Listening again…"));
    await this.startVoice();
  };

  /** Keep a speech service's key; an empty one removes it (and goes back to the built-in recognizer). */
  setSpeechKey = (service: CloudSpeech, key: string) => {
    const keys = { ...(this.workspace.voice.speechKeys ?? {}) };
    if (key.trim()) keys[service] = key.trim();
    else delete keys[service];
    this.saveVoiceSettings({ speechKeys: keys });
    if (!key.trim() && this.workspace.voice.engine === service) void this.setVoiceEngine("system");
  };

  /** Check a speech service's key works; rejects with words a church can act on. */
  testSpeechKey = async (service: CloudSpeech): Promise<void> => {
    try {
      await testSpeechKey(service, this.workspace.voice.speechKeys?.[service] ?? "");
    } catch (error) {
      if (error instanceof KeyRefused) throw new Error(service === "deepgram" ? t("{service} refused the connection. Check the key in Settings › Audio & voice, and that this network allows it.", { service: CLOUD_SPEECH[service].name }) : t("{service} did not accept the key. Copy it again from your {service} account.", { service: CLOUD_SPEECH[service].name }));
      throw new Error(t("{service} could not be reached. Check the internet connection.", { service: CLOUD_SPEECH[service].name }));
    }
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
      this.message = t("{name} is locked. Unlock to remove.", { name: saved.name });
      return;
    }
    const compositions = removeLook(this.workspace.compositions, id);
    this.workspace = { ...this.workspace, compositions, sources: pruneSharedSources(this.sharedSources, compositions) };
    if (this.lookOnPreview?.id === id) this.lookOnPreview = null;
    this.persistSoon();
    this.message = t("Look removed. Program was not changed.");
  };

  addLookToService = async (composition: Composition, sectionId?: string) => {
    const queued = queueLook(this.workspace.compositions, composition);
    this.workspace = { ...this.workspace, compositions: queued.looks };
    this.persistSoon();
    if (!this.service) await this.createService("Sunday Service");
    if (!this.service?.sections.length) this.addSection("Looks");
    const target = this.service ? (sectionId && this.service.sections.some((section) => section.id === sectionId) ? sectionId : sectionIdForInsert(this.service, this.cursor)) : null;
    if (!this.service || !target) {
      this.warn(t("{title} saved. Add a section first.", { title: queued.item.title }));
      return;
    }
    this.insertItem(target, queued.item);
    await this.selectItem(queued.item.id);
    this.message = t("{title} queued. Preview only until LIVE.", { title: queued.item.title });
    this.notify(t("Added to {service}", { service: this.service.name }), { detail: queued.item.title, actions: [{ label: t("Undo"), run: () => { this.removeItem(queued.item.id); this.dismissToast(); } }] });
  };

  previewPassage = async (passage: BibleItem) => {
    this.learnWord(passage);
    this.songFocus = null;
    this.sermonFocus = null;
    this.previewBible = passage;
    const item: PresentationItem = { id: "preview", kind: "bible", title: passage.reference, bible: passage };
    // Stepping quickly (or an online Bible answering late): only the newest verse lands on Preview.
    const token = ++this.selectToken;
    let model: PresentationModel;
    try {
      model = await this.modelFor(item);
    } catch (error) {
      if (token === this.selectToken) this.warn(t("{reference} could not be read. {reason}", { reference: passage.reference, reason: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (token !== this.selectToken) return;
    this.previewModel(model, null);
    this.previewFree = true;
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
      this.message = t("Create a service before adding a passage.");
      return;
    }
    const sectionId = this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!sectionId) {
      this.message = t("Add a section, then add the passage.");
      return;
    }
    const item: PresentationItem = { id: uid(), kind: "bible", title: passage.reference, bible: passage };
    this.insertItem(sectionId, item);
    this.remember(passage);
    await this.selectItem(item.id);
    this.message = t("{reference} added to the service. Preview only.", { reference: passage.reference });
  };

  /** Take a passage off the Recent list (in every translation). */
  removeRecent = (passage: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">) => {
    const recent = this.workspace.recent.filter(
      (entry) => !(entry.bookOrd === passage.bookOrd && entry.chapter === passage.chapter && entry.startVerse === passage.startVerse && entry.endVerse === passage.endVerse),
    );
    this.workspace = { ...this.workspace, recent };
    this.persistSoon();
  };

  clearRecent = () => {
    this.workspace = { ...this.workspace, recent: [] };
    this.persistSoon();
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

  // Service timing: a start time, and a length or an end time for each section.
  setServiceStart = (time: string) => {
    if (!this.service) return;
    this.service = { ...this.service, startTime: /^\d{2}:\d{2}$/.test(time) ? time : undefined };
    this.persistSoon();
    this.refreshCountdown();
  };

  setSectionTiming = (id: string, change: { minutes?: number | null; until?: string | null }) => {
    if (!this.service) return;
    const timing = sectionTiming(change);
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        if (section.id !== id) return section;
        const next = { ...section, ...timing };
        if (next.minutes === undefined) delete next.minutes;
        if (next.until === undefined) delete next.until;
        return next;
      }),
    };
    this.persistSoon();
    this.publishStage();
    this.refreshCountdown();
  };

  /** When each section of the open service actually began today (epoch ms), by section id. */
  sectionStarts = $state<Record<string, number>>({});
  private sectionStartsDay = "";

  /** Mark a section as begun now (or again). Also happens when something from it first goes live. */
  startSection = (id: string, at = Date.now()) => {
    const day = new Date(at).toDateString();
    if (day !== this.sectionStartsDay) {
      this.sectionStartsDay = day;
      this.sectionStarts = {};
    }
    this.sectionStarts = { ...this.sectionStarts, [id]: at };
    // Kept for the day, so a restart in the middle of the service remembers where it was.
    try {
      if (this.service) localStorage.setItem(STARTS_KEY, JSON.stringify({ day, serviceId: this.service.id, starts: this.sectionStarts }));
    } catch {
      // Storage blocked: the starts last until the app closes.
    }
    // The run log keeps counting past the planned time, for the planned-and-used report.
    if (this.service?.sections.some((section) => section.id === id)) {
      const before = activeRun(this.service)?.marks.at(-1)?.sectionId;
      this.service = markPart(this.service, id, at, uid());
      this.persistSoon();
      const section = this.service.sections.find((entry) => entry.id === id);
      if (this.leaderTo === "screen" && section?.leader?.trim() && before !== id) this.showLeader(id);
      if (section && before !== id) this.partBegan(section);
    }
    this.publishStage();
    this.refreshCountdown();
  };

  /** A start waiting for the planned time (epoch ms), set from the Start service window. */
  queuedStart = $state<number | null>(null);
  private queueTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Start the service now: its first part begins and the clock starts. With `move`, the plan is moved
   * first so it begins now (each part keeps its length), instead of running behind or ahead.
   */
  startService = (move = false) => {
    if (!this.requireFeature("service")) return;
    this.cancelQueuedStart(false);
    this.advanced.clear();
    this.snoozed.clear();
    this.timeUp = null;
    const service = this.service;
    const first = service?.sections[0];
    if (!service || !first) {
      this.warn(t("Add a part to the service first."));
      return;
    }
    countUse("services");
    if (move) {
      this.service = shiftSchedule(service, Math.floor(minutesOfDay(Date.now())));
      this.persistSoon();
    }
    this.startSection(first.id);
    this.message = move
      ? t("{name} started. The times now begin at {time}.", { name: service.name, time: clockLabel(Math.floor(minutesOfDay(Date.now()))) })
      : t("{name} started.", { name: service.name });
  };

  /** Wait for the planned start, then start by itself (optionally with the countdown on Preview). */
  queueStart = (countdown: boolean) => {
    const service = this.service;
    if (!service) return;
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const at = day.getTime() + (parseClock(service.startTime) ?? (parseClock(DEFAULT_START) as number)) * 60_000;
    if (at <= Date.now()) {
      this.startService();
      return;
    }
    clearTimeout(this.queueTimer);
    this.queuedStart = at;
    this.queueTimer = setTimeout(() => {
      this.queuedStart = null;
      // Already begun by hand (something went live early): leave it running where it is.
      if (this.service?.id === service.id && !this.serviceRunning) this.startService();
    }, at - Date.now());
    if (countdown) this.showCountdown();
    this.message = t("{name} will start by itself at {time}. Keep this window open.", { name: service.name, time: clockLabel(minutesOfDay(at)) });
  };

  cancelQueuedStart = (say = true) => {
    if (this.queuedStart === null) return;
    clearTimeout(this.queueTimer);
    this.queuedStart = null;
    if (say) this.message = t("The waiting start is cancelled.");
  };

  /** The service running now (a part has begun and it has not been ended). */
  get serviceRunning(): boolean {
    return activeRun(this.service) !== null;
  }

  /**
   * End the service: the running part stops counting, the countdown leaves the screen and the
   * leader's name comes off. The planned and used times are kept in the service's report.
   */
  endService = () => {
    if (!this.service) return;
    const running = this.serviceRunning;
    this.advanced.clear();
    this.snoozed.clear();
    this.timeUp = null;
    this.service = endRun(this.service, Date.now());
    this.sectionStarts = {};
    this.presenterPartId = null;
    try {
      localStorage.removeItem(STARTS_KEY);
    } catch {
      // Storage blocked: nothing kept to remove.
    }
    this.hideLeader();
    this.persistSoon();
    this.publishStage();
    this.refreshCountdown();
    this.message = running ? t("{name} ended. Planned and used times are in Report.", { name: this.service.name }) : t("{name} is not running.", { name: this.service.name });
  };

  /** Close the service on the desk (ending it first if it is running). Program stays as it is. */
  closeService = async () => {
    if (!this.service) return;
    const name = this.service.name;
    this.cancelQueuedStart(false);
    if (this.serviceRunning) this.endService();
    await this.persist();
    this.service = null;
    this.cursor = { sectionId: null, itemId: null };
    this.workspace = { ...this.workspace, lastServiceId: null };
    await this.saveWorkspaceDocument(this.workspace);
    this.message = t("{name} closed. Open it again from the services list.", { name });
  };

  /** Who leads a part. */
  setSectionLeader = (id: string, leader: string) => {
    if (!this.service) return;
    const name = leader.trim().slice(0, 80);
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        if (section.id !== id) return section;
        const next: typeof section = { ...section, leader: name };
        if (!name) delete next.leader;
        return next;
      }),
    };
    this.persistSoon();
    this.publishStage();
  };

  /** Where the leader's name goes (older services kept a yes/no for the screen). */
  get leaderTo(): ScreenDest {
    const service = this.service;
    return service?.leaderTo ?? (service?.showLeaders ? "screen" : "off");
  }

  setLeaderTo = (dest: ScreenDest) => {
    if (!this.service) return;
    const next: Service = { ...this.service, leaderTo: dest };
    delete next.showLeaders;
    this.service = next;
    this.persistSoon();
    if (dest !== "screen") this.hideLeader();
    if (dest === "preview" && this.runningSectionId) this.showLeader(this.runningSectionId);
    else
      this.message =
        dest === "screen"
          ? t("Leaders' names will show for a few seconds when their part begins.")
          : dest === "preview"
            ? t("Show name puts the leader on Preview. LIVE sends it.")
            : t("Leaders' names stay off the screen.");
  };

  /** Where the countdown goes. The countdown overlay being on means the screen, however it was turned on. */
  get countdownTo(): ScreenDest {
    if (this.countdownOverlayOn) return "screen";
    return this.service?.countdownTo === "preview" ? "preview" : "off";
  }

  setCountdownTo = (dest: ScreenDest) => this.setCountdownMode(dest === "screen" ? "corner" : dest === "preview" ? "full" : "off");

  /** The countdown on the audience screen: a card in a corner, the whole screen (in front of the slide), or off. */
  get countdownMode(): "corner" | "full" | "off" {
    const overlay = this.countdownOverlay();
    return overlay?.on ? (overlay.cover ? "full" : "corner") : "off";
  }

  private countdownOverlay = () => this.workspace.overlays.find((overlay) => overlay.kind === "countdown");

  setCountdownMode = (mode: "corner" | "full" | "off") => {
    if (this.service) {
      this.service = { ...this.service, countdownTo: mode === "off" ? "off" : "screen" };
      this.persistSoon();
    }
    this.setCountdownLook({ on: mode !== "off", cover: mode === "full" || undefined });
    this.message =
      mode === "off"
        ? t("The countdown stays off the screen.")
        : !this.serviceRunning && !this.screenCountdown()
          ? t("The countdown shows once the service starts.")
          : mode === "full"
            ? t("The countdown fills the screen, in front of the slide.")
            : t("The countdown is in the corner of the screen.");
  };

  /** Change how the countdown looks (made the first time), keeping whether it is on. */
  setCountdownLook = (patch: Partial<ScreenOverlay>) => {
    const existing = this.countdownOverlay();
    if (existing) {
      this.updateOverlay(existing.id, patch);
      return;
    }
    void this.setOverlays(sanitizeOverlays([...this.workspace.overlays, { ...newOverlay("countdown"), ...patch }]));
  };

  /** How the leader's name card looks (its colour, box, and whether the part's name shows under it). */
  get leaderLook(): ScreenOverlay {
    return this.workspace.overlays.find((overlay) => overlay.id === LEADER_OVERLAY) ?? newOverlay("lower-third", "", LEADER_OVERLAY);
  }

  setLeaderLook = (patch: Partial<ScreenOverlay>) => {
    const existing = this.workspace.overlays.find((overlay) => overlay.id === LEADER_OVERLAY);
    if (existing) {
      this.updateOverlay(LEADER_OVERLAY, patch);
      return;
    }
    void this.setOverlays(sanitizeOverlays([...this.workspace.overlays, { ...newOverlay("lower-third", "", LEADER_OVERLAY), text: "", subtitle: "", ...patch, on: false }]));
  };

  /**
   * What the countdown counts to now: the end of the running part; before the service begins (today,
   * within six hours), its start time.
   */
  screenCountdown = (): { name: string; endsAt: number } | null => {
    const running = this.runningDeadline();
    if (running || !this.service || this.serviceRunning) return running;
    const start = parseClock(this.service.startTime);
    if (start === null) return null;
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const at = day.getTime() + start * 60_000;
    return at > Date.now() && at - Date.now() < 6 * 3_600_000 ? { name: t("Service starts in"), endsAt: at } : null;
  };

  private leaderTimer: ReturnType<typeof setTimeout> | undefined;
  /** The section whose leader's name is on the screen now. */
  leaderOnScreen = $state<string | null>(null);

  /** The leader's name and their part as a lower third, for a few seconds (or until hidden). */
  showLeader = (sectionId: string, seconds = this.service?.leaderSeconds ?? 10) => {
    const section = this.service?.sections.find((entry) => entry.id === sectionId);
    const leader = section?.leader?.trim();
    if (!section || !leader) {
      this.warn(t("Add who leads this part first."));
      return;
    }
    if (this.leaderTo === "preview") {
      this.previewModel(presentLowerThird(this.theme(), leader, section.name), `leader:${sectionId}`);
      this.message = t("{leader} · {part} is on Preview. LIVE shows it.", { leader, part: section.name });
      return;
    }
    if (this.leaderTo === "off") {
      this.message = t("Leaders' names are off. Choose Screen or Preview in On the screen.");
      return;
    }
    const existing = this.workspace.overlays.find((overlay) => overlay.id === LEADER_OVERLAY);
    const overlay = { ...(existing ?? newOverlay("lower-third", "", LEADER_OVERLAY)), text: leader, subtitle: section.name, rich: undefined, subtitleRich: undefined, on: true };
    void this.setOverlays(existing ? this.workspace.overlays.map((entry) => (entry.id === LEADER_OVERLAY ? overlay : entry)) : [...this.workspace.overlays, overlay]);
    this.leaderOnScreen = sectionId;
    clearTimeout(this.leaderTimer);
    if (seconds > 0) this.leaderTimer = setTimeout(() => this.hideLeader(), seconds * 1000);
    this.message = t("{leader} · {part} is on the screen.", { leader, part: section.name });
  };

  hideLeader = () => {
    clearTimeout(this.leaderTimer);
    this.leaderOnScreen = null;
    if (this.workspace.overlays.some((overlay) => overlay.id === LEADER_OVERLAY && overlay.on)) this.toggleOverlay(LEADER_OVERLAY, false);
  };

  /** The countdown overlay on or off (made the first time). Where it sits and its size are set in Overlays. */
  get countdownOverlayOn(): boolean {
    return this.workspace.overlays.some((overlay) => overlay.kind === "countdown" && overlay.on);
  }

  toggleCountdownOverlay = () => {
    const existing = this.workspace.overlays.find((overlay) => overlay.kind === "countdown");
    if (existing) {
      this.toggleOverlay(existing.id);
      return;
    }
    const id = this.addOverlay("countdown");
    this.toggleOverlay(id, true);
  };

  setCountdownSize = (size: number) => {
    this.workspace = { ...this.workspace, countdownSize: Math.min(420, Math.max(96, Math.round(size))) };
    this.persistSoon();
  };

  /**
   * A full-screen countdown on Preview (LIVE shows it): to the end of the running section, or of
   * `sectionId`; before the service begins, to its start time.
   */
  showCountdown = (sectionId: string | null = null) => {
    const service = this.service;
    if (!service) return;
    const plan = planSchedule(service);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const running = sectionId ?? this.runningSectionId;
    let target: { name: string; at: number } | null = null;
    const deadline = running ? sectionDeadline(plan, running, this.sectionStarts[running] ?? null) : null;
    if (deadline) target = { name: deadline.name, at: deadline.endsAt };
    else if (running) {
      const slot = plan.slots.find((entry) => entry.sectionId === running);
      if (slot && !slot.untimed) target = { name: slot.name, at: today.getTime() + slot.end * 60_000 };
    }
    if (!target) {
      const start = today.getTime() + (parseClock(service.startTime) ?? plan.start) * 60_000;
      target = { name: t("Service starts in"), at: start };
    }
    const timer = { ...createTimer({ name: target.name, mode: "target", targetAt: target.at, label: target.name, warningMs: 5 * 60_000 }), running: true };
    const theme = { ...this.theme(), fontSize: this.workspace.countdownSize };
    this.previewModel(presentTimer(timer, theme, Date.now()), `countdown:${running ?? "start"}`);
    this.message = t("{name} countdown is on Preview. LIVE shows it full screen.", { name: target.name });
  };

  /** Repaint Program when the running section or its end changes, if a countdown overlay is on. */
  private refreshCountdown() {
    if (!this.workspace.overlays.some((overlay) => overlay.on && overlay.kind === "countdown")) return;
    this.live = { ...this.live };
    void this.pushProgram();
  }

  // Timer sounds: each tick reads the time left on every countdown that is showing (a full-screen
  // timer on Program, timers inside a look, the countdown overlay) and beeps as marks are crossed.
  private timerLeft = new Map<string, number>();

  private countdownsShowing(now: number): Array<{ key: string; left: number }> {
    const found: Array<{ key: string; left: number }> = [];
    const program = this.live.program.model;
    const paints = [program.timer, ...(program.layers ?? []).map((layer) => layer.model.timer)];
    paints.forEach((paint, index) => {
      if (!paint || !paint.running || (paint.mode !== "countdown" && paint.mode !== "target")) return;
      found.push({ key: `timer:${index}:${paint.label}:${paint.mode === "target" ? paint.targetAt : paint.durationMs}`, left: timerDisplay(timerFromPaint(paint), now).remainingMs });
    });
    if (this.countdownOverlayOn) {
      const deadline = this.runningDeadline();
      if (deadline) found.push({ key: `overlay:${deadline.name}:${deadline.endsAt}`, left: deadline.endsAt - now });
    }
    return found;
  }

  // Video ends: the length of each file (read once), and which take already ended.
  private videoLengths = new Map<string, number>();
  private videoEnded: string | null = null;

  private videoLength(url: string): number {
    const known = this.videoLengths.get(url);
    if (known !== undefined) return known;
    this.videoLengths.set(url, 0);
    if (typeof document !== "undefined") {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      const done = () => {
        this.videoLengths.set(url, probe.duration);
        probe.removeAttribute("src");
        probe.load();
      };
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration)) return done();
        // Some files (screen and browser recordings) carry no length; seeking far ahead finds it.
        probe.ondurationchange = () => {
          if (Number.isFinite(probe.duration)) done();
        };
        probe.currentTime = 1e7;
      };
      // A file that cannot be read keeps no length (0: the slideshow does not wait for it).
      probe.onerror = () => {
        probe.removeAttribute("src");
        probe.load();
      };
      probe.src = url;
    }
    return 0;
  }

  /**
   * Whether the video on Program has played to its end (a slideshow waits for it before moving on).
   * Null when Program is not a video; false while its length is still being read.
   */
  programVideoDone = (): boolean | null => {
    const model = this.live.program.model;
    const video = model.layout === "video" ? model.video : undefined;
    if (!video?.url) return null;
    const stopAt = endPoint(video, this.videoLength(video.url));
    if (stopAt === null || !video.control) return false;
    // Paused by the operator is not finished: only reaching the end counts.
    return videoPosition(video.control) >= stopAt - 0.15;
  };

  /** When the video on Program reaches its end: hold, clear, or hand over to the next item. */
  private videoTick() {
    if (!this.controlsAudience && !this.desktop()) return;
    const model = this.live.program.model;
    const video = model.layout === "video" ? model.video : undefined;
    if (!video?.control?.playing) return;
    const end = video.end ?? (video.loop ? "loop" : "hold");
    if (end === "loop") return;
    const stopAt = endPoint(video, this.videoLength(video.url));
    if (stopAt === null) return;
    const take = `${this.live.program.sourceId}:${video.control.stamp}`;
    if (videoPosition(video.control) < stopAt - 0.15 || this.videoEnded === take) return;
    this.videoEnded = take;
    void this.afterVideo(end, stopAt);
  }

  private async afterVideo(end: VideoEnd, stopAt: number) {
    if (end === "hold") {
      await this.controlVideo({ kind: "seek", at: stopAt });
      await this.controlVideo({ kind: "pause" });
      return;
    }
    if (end === "clear") {
      this.clear();
      return;
    }
    const sourceId = this.live.program.sourceId;
    const found = this.service && sourceId ? findItem(this.service, sourceId) : null;
    if (!found || !this.service) return;
    const items = found.section.items;
    const index = items.findIndex((item) => item.id === found.item.id);
    let nextId: string | null = null;
    if (end === "loop-part") nextId = items[(index + 1) % items.length]?.id ?? null;
    else {
      const all = this.service.sections.flatMap((section) => section.items);
      nextId = all[all.findIndex((item) => item.id === found.item.id) + 1]?.id ?? null;
    }
    if (!nextId) {
      await this.controlVideo({ kind: "pause" });
      return;
    }
    await this.selectItem(nextId);
    this.take();
  }

  /** Called a few times a second by the desk. Only the window sending to the audience beeps. */
  timerTick = () => {
    this.videoTick();
    this.countListening();
    const sounds = this.workspace.timerSounds;
    const now = Date.now();
    const showing = this.countdownsShowing(now);
    const due = new Set<TimerCue>();
    const next = new Map<string, number>();
    for (const entry of showing) {
      const before = this.timerLeft.get(entry.key);
      if (before !== undefined) for (const cue of cuesBetween(before, entry.left, sounds)) due.add(cue);
      next.set(entry.key, entry.left);
    }
    this.timerLeft = next;
    if (!this.controlsAudience && !this.desktop()) return;
    const cue: TimerCue | null = due.has("end") ? "end" : due.has("warn") ? "warn" : due.has("tick") ? "tick" : null;
    if (cue) playCue(cue, sounds.volume);
  };

  setTimerSounds = (patch: Partial<TimerSounds>) => {
    this.workspace = { ...this.workspace, timerSounds: sanitizeTimerSounds({ ...this.workspace.timerSounds, ...patch }) };
    this.persistSoon();
  };

  /** Hear what the timer sounds are like. */
  testTimerSound = (cue: TimerCue) => playCue(cue, this.workspace.timerSounds.volume || 0.5);

  /** The running section for the stage screen, with who leads it ("Worship · Ama"). */
  private stageSection = (): { name: string; endsAt: number } | null => {
    const deadline = this.runningDeadline();
    const leader = this.service?.sections.find((section) => section.id === this.runningSectionId)?.leader?.trim();
    return deadline && leader ? { ...deadline, name: `${deadline.name} · ${leader}` } : deadline;
  };

  /** The section running now and when it should end, for the stage screens. */
  runningDeadline = (): { name: string; endsAt: number } | null => {
    const id = this.runningSectionId;
    if (!this.service || !id) return null;
    const found = sectionDeadline(planSchedule(this.service), id, this.sectionStarts[id] ?? null);
    return found ? { name: found.name, endsAt: found.endsAt } : null;
  };

  private loadSectionStarts(serviceId: string) {
    const today = new Date().toDateString();
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STARTS_KEY);
    } catch {
      raw = null;
    }
    this.sectionStartsDay = today;
    const starts = readSavedStarts(raw, serviceId, today);
    // The run log is saved with the service, so a restart that lost the starts still knows which
    // part is running and since when.
    const run = this.service?.id === serviceId ? activeRun(this.service) : null;
    if (run && new Date(run.startedAt).toDateString() === today) {
      for (const mark of run.marks) starts[mark.sectionId] = Math.max(starts[mark.sectionId] ?? 0, mark.at);
    }
    this.sectionStarts = starts;
  }

  /** The section running now: the one most recently begun today. */
  get runningSectionId(): string | null {
    // Read the starts first, so whatever shows this follows every new start.
    const starts = this.sectionStarts;
    if (this.sectionStartsDay !== new Date().toDateString()) return null;
    const entries = Object.entries(starts).filter(([id]) => this.service?.sections.some((section) => section.id === id));
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? null;
  }

  // Service templates: start a service with the usual parts and times already in place.
  createServiceFromTemplate = async (templateId: string, date = new Date()) => {
    const template = this.workspace.serviceTemplates.find((entry) => entry.id === templateId);
    if (!template) return;
    const service: Service = { ...serviceFromTemplate(template, serviceNameFor(template, date), uid, new Date()), ...this.serviceDefaults() };
    this.service = service;
    this.cursor = { sectionId: service.sections[0]?.id ?? null, itemId: null };
    this.loadSectionStarts(service.id);
    await this.persist();
    this.services = await api.serviceList();
    this.message = t("{name} is ready with {length} parts. Add the songs and readings.", { name: service.name, length: service.sections.length });
  };

  private saveTemplates(templates: ServiceTemplate[]) {
    this.workspace = { ...this.workspace, serviceTemplates: templates };
    this.persistSoon();
  }

  /** Keep the open service's parts and times as a template (or update one with them). */
  saveServiceAsTemplate = (name: string, replaceId: string | null = null): ServiceTemplate | null => {
    if (!this.service) return null;
    const template = templateFromService(this.service, name, replaceId ?? uid());
    const rest = this.workspace.serviceTemplates.filter((entry) => entry.id !== template.id);
    const index = this.workspace.serviceTemplates.findIndex((entry) => entry.id === template.id);
    const next = index >= 0 ? [...rest.slice(0, index), template, ...rest.slice(index)] : [...rest, template];
    this.saveTemplates(next);
    this.message = t("{name} saved as a template.", { name: template.name });
    return template;
  };

  updateTemplate = (template: ServiceTemplate) => {
    this.saveTemplates(this.workspace.serviceTemplates.map((entry) => (entry.id === template.id ? template : entry)));
  };

  addTemplate = (): ServiceTemplate => {
    const template: ServiceTemplate = { id: uid(), name: "New service", startTime: "09:00", parts: [{ name: "Welcome", minutes: 10 }, { name: "Worship", minutes: 30 }, { name: "Preaching", minutes: 40 }] };
    this.saveTemplates([...this.workspace.serviceTemplates, template]);
    return template;
  };

  removeTemplate = (id: string) => {
    this.saveTemplates(this.workspace.serviceTemplates.filter((entry) => entry.id !== id));
  };

  /** Delete a service; if it is the one open, the next one opens (or none). */
  deleteService = async (id: string) => {
    const name = this.services.find((entry) => entry.id === id)?.name ?? "Service";
    await api.serviceDelete(id);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.services = await api.serviceList();
    if (this.service?.id === id) {
      const next = this.services[0];
      this.service = null;
      this.cursor = { sectionId: null, itemId: null };
      if (next) await this.openService(next.id);
      else {
        this.workspace = { ...this.workspace, lastServiceId: null };
        this.persistSoon();
      }
    }
    this.message = t("{name} deleted.", { name });
  };

  /** A copy of a service (its parts, times and items), to plan a similar one. */
  duplicateService = async (id: string) => {
    const source = this.service?.id === id ? this.service : await api.serviceGet(id);
    if (!source) return;
    const copy: Service = {
      ...structuredClone($state.snapshot(source) as Service),
      id: uid(),
      name: `${source.name} (copy)`,
      updatedAt: new Date().toISOString(),
    };
    // The copy starts with no history of its own.
    delete copy.runs;
    copy.sections = copy.sections.map((section) => ({ ...section, id: uid(), items: section.items.map((item) => ({ ...item, id: uid() })) }));
    this.service = copy;
    this.cursor = { sectionId: copy.sections[0]?.id ?? null, itemId: null };
    await this.persist();
    this.message = t("{name} made. Rename it at the top.", { name: copy.name });
  };

  /** Delete a picture, video or audio file; playlists, the logo and overlays let go of it. */
  deleteMedia = async (id: string) => {
    const asset = [...this.media, ...this.audioTracks].find((entry) => entry.id === id);
    await api.mediaDelete(id);
    this.media = (await api.mediaList());
    this.workspace = {
      ...this.workspace,
      logoAssetId: this.workspace.logoAssetId === id ? null : this.workspace.logoAssetId,
      playlists: this.workspace.playlists.map((list) => ({ ...list, trackIds: list.trackIds.filter((track) => track !== id) })),
      overlays: this.workspace.overlays.map((overlay) => (overlay.assetId === id ? { ...overlay, assetId: null } : overlay)),
      favorites: { ...this.workspace.favorites, media: this.workspace.favorites.media.filter((entry) => entry !== id) },
    };
    this.persistSoon();
    this.message = t("{name} deleted.", { name: asset?.name ?? t("The file") });
  };

  /** Open a service made elsewhere (the sample service) as a new one, and keep it. */
  openNewService = async (service: Service) => {
    this.service = service;
    this.cursor = { sectionId: service.sections[0]?.id ?? null, itemId: null };
    this.loadSectionStarts(service.id);
    await this.persist();
    this.services = await api.serviceList();
  };

  createService = async (name: string) => {
    const service: Service = { id: uid(), name: name.trim() || "Untitled service", sections: [], updatedAt: new Date().toISOString(), ...this.serviceDefaults() };
    this.service = service;
    this.cursor = { sectionId: null, itemId: null };
    await this.persist();
    this.message = t("{name} created.", { name: service.name });
  };

  openService = async (id: string) => {
    this.cancelQueuedStart(false);
    this.service = await api.serviceGet(id);
    this.savedService = this.service;
    if (typeof window !== "undefined") this.loadSectionStarts(id);
    this.cursor = { sectionId: null, itemId: null };
    this.workspace = { ...this.workspace, lastServiceId: id };
    await this.saveWorkspaceDocument(this.workspace);
  };

  /** The "Add to service" window: what is being added, and who waits for the part chosen (null: cancelled). */
  partPicker = $state<{ title: string; resolve: (sectionId: string | null) => void } | null>(null);

  /** Ask which part of the service `title` goes into. Starts a service first when none is open. */
  pickServicePart = (title: string): Promise<string | null> =>
    new Promise((resolve) => {
      this.partPicker?.resolve(null);
      this.partPicker = { title, resolve };
    });

  answerPartPicker = (sectionId: string | null) => {
    const asked = this.partPicker;
    this.partPicker = null;
    asked?.resolve(sectionId);
  };

  addSection = (name: string) => {
    if (!this.service) return;
    const section = { id: uid(), name: name.trim() || "Section", items: [] };
    this.service = { ...this.service, sections: [...this.service.sections, section] };
    this.cursor = { sectionId: section.id, itemId: null };
    this.persistSoon();
  };

  /** A new part at a place in the running order (from the flow canvas's + between two cards). */
  insertSection = (name: string, at: number, canvas?: { x: number; y: number }): string | null => {
    if (!this.service) return null;
    const section: ServiceSection = { id: uid(), name: name.trim() || "Section", items: [], ...(canvas ? { canvas } : {}) };
    const sections = [...this.service.sections];
    sections.splice(Math.max(0, Math.min(sections.length, at)), 0, section);
    this.service = { ...this.service, sections };
    this.cursor = { sectionId: section.id, itemId: null };
    this.persistSoon();
    return section.id;
  };

  /** Where a part's card sits on the flow canvas (null: back to its tidy place). */
  setSectionCanvas = (id: string, place: { x: number; y: number } | null) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        if (section.id !== id) return section;
        const next: ServiceSection = { ...section, ...(place ? { canvas: { x: Math.round(place.x), y: Math.round(place.y) } } : {}) };
        if (!place) delete next.canvas;
        return next;
      }),
    };
    this.persistSoon();
  };

  /** Every card back to its tidy place. */
  tidyCanvas = () => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        const next = { ...section };
        delete next.canvas;
        return next;
      }),
    };
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

  /**
   * Leave a part out this time (or bring it back): it takes no time in the plan, Next and moving on
   * pass over it, and it is not in the report. Leaving out the running part moves on to the next.
   */
  setSectionSkip = (id: string, skip: boolean) => {
    const section = this.service?.sections.find((entry) => entry.id === id);
    if (!this.service || !section) return;
    this.service = { ...this.service, sections: this.service.sections.map((entry) => (entry.id === id ? { ...entry, skip: skip || undefined } : entry)) };
    this.persistSoon();
    this.publishStage();
    this.refreshCountdown();
    if (skip && this.runningSectionId === id && this.serviceRunning && nextPart(this.service, id)) void this.moveOn(id);
    this.message = skip ? t("{name} is left out this time. The parts after it move up.", { name: section.name }) : t("{name} is back in the service.", { name: section.name });
  };

  moveSection = (id: string, direction: 1 | -1) => {
    if (!this.service) return;
    const index = this.service.sections.findIndex((section) => section.id === id);
    this.service = { ...this.service, sections: moveInList(this.service.sections, index, direction) };
    this.persistSoon();
  };

  /** Drop a section at a new place in the running order. */
  moveSectionTo = (id: string, to: number) => {
    if (!this.service) return;
    const from = this.service.sections.findIndex((section) => section.id === id);
    this.service = { ...this.service, sections: moveTo(this.service.sections, from, to) };
    this.persistSoon();
  };

  /** Drop an item at a place in a section (its own or another). */
  moveItemTo = (itemId: string, sectionId: string, index: number) => {
    if (!this.service) return;
    this.service = moveItemTo(this.service, itemId, sectionId, index);
    if (this.cursor.itemId === itemId) this.cursor = { sectionId, itemId };
    this.persistSoon();
  };

  removeSection = (id: string) => {
    if (!this.service) return;
    const removed = this.service.sections.find((section) => section.id === id);
    this.withUndo(removed ? t("{name} removed", { name: removed.name }) : t("Part removed"), () => {
      if (!this.service) return;
      this.service = { ...this.service, sections: this.service.sections.filter((section) => section.id !== id) };
      if (this.cursor.sectionId === id) this.cursor = { sectionId: null, itemId: null };
    });
  };

  /** Delete one item from the Service page, with Undo. */
  deleteItem = (itemId: string) => {
    const item = this.service?.sections.flatMap((section) => section.items).find((entry) => entry.id === itemId);
    this.withUndo(item ? t("{title} removed", { title: item.title }) : t("Item removed"), () => this.removeItem(itemId));
  };

  /** Change the open service, then offer Undo (back to how it was) for ten seconds. */
  private withUndo(label: string, change: () => void) {
    const before = this.service;
    const cursor = this.cursor;
    if (!before) return;
    change();
    this.persistSoon();
    this.notify(label, {
      actions: [{ label: t("Undo"), run: () => {
        if (this.service?.id === before.id) {
          this.service = before;
          this.cursor = cursor;
          this.persistSoon();
        }
        this.dismissToast();
      } }],
      ms: 10_000,
    });
  }

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
      this.warn(t("Add a section first."));
      return;
    }
    const item: PresentationItem =
      kind === "announcement"
        ? { id: uid(), kind, title: "Announcement", announcement: { heading: "Announcement", body: "", design: "card", label: "Announcement" } }
        : { id: uid(), kind, title: "Slide", slide: { heading: "Slide", body: "", imageId: null } };
    this.insertItem(sectionId, item);
    void this.selectItem(item.id);
  };

  /** The next or previous item in the running order, whatever is inside the current one. */
  stepItem = async (direction: 1 | -1) => {
    if (!this.service) return;
    const next = stepCursor(this.service, this.cursor, direction);
    if (next.itemId && next.itemId !== this.cursor.itemId) await this.chooseItem(next.itemId, "first");
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
  addToService = async (item: Omit<PresentationItem, "id">, preview = false, sectionId?: string): Promise<string> => {
    if (!this.service) await this.createService(`${t("Service")} ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
    if (!this.service!.sections.length) this.addSection(t("Service"));
    const target = sectionId && this.service!.sections.some((section) => section.id === sectionId) ? sectionId : sectionIdForInsert(this.service!, this.cursor)!;
    const full = { ...item, id: uid() } as PresentationItem;
    this.insertItem(target, full);
    this.persistSoon();
    if (preview) await this.selectItem(full.id);
    const part = this.service!.sections.find((section) => section.id === target)?.name ?? "";
    this.message = t("{title} added to {name}.", { title: full.title, name: this.service!.name });
    this.notify(t("Added to {service}", { service: this.service!.name }), {
      detail: part ? `${full.title} → ${part}` : full.title,
      actions: [
        { label: t("Undo"), run: () => { this.removeItem(full.id); this.dismissToast(); } },
        { label: t("Open service"), run: () => { this.pageRequest = "service"; this.dismissToast(); } },
      ],
    });
    return full.id;
  };

  addSongToService = (song: Song, sectionId?: string) => {
    const first = song.sections[0];
    if (!first) {
      this.warn(t("{title} has no sections yet.", { title: song.title || t("That song") }));
      return;
    }
    void this.addToService({ kind: "lyric", title: song.title || t("Untitled song"), lyric: { songId: song.id, sectionId: first.id } }, false, sectionId);
  };

  addMediaToService = (asset: MediaAsset, sectionId?: string) => {
    const video = asset.kind === "video";
    void this.addToService(
      video
        ? { kind: "video", title: asset.name, video: { assetId: asset.id, loop: false, muted: false } }
        : { kind: "image", title: asset.name, image: { assetId: asset.id } },
      false,
      sectionId,
    );
  };

  addAnnouncementToService = (heading: string, body: string, options: { design?: AnnouncementDesign; label?: string; sectionId?: string; rich?: RichDoc | null } = {}) => {
    const title = heading.trim() || t("Announcement");
    void this.addToService(
      {
        kind: "announcement",
        title,
        announcement: { heading: title, body: body.trim(), design: options.design ?? "card", label: options.label ?? t("Announcement"), ...(options.rich ? { rich: options.rich } : {}) },
      },
      false,
      options.sectionId,
    );
  };

  addPassageToService = (passage: BibleItem, sectionId?: string): Promise<string> => {
    this.remember(passage);
    // The service's own verses-per-screen applies to readings longer than one screenful.
    const per = this.service?.versesPerScreen;
    const bible = per && !passage.perScreen && passage.endVerse - passage.startVerse + 1 > per ? { ...passage, perScreen: per } : passage;
    return this.addToService({ kind: "bible", title: passage.reference, bible }, false, sectionId);
  };

  /** Settings new services start with (saved on this computer by "Use for new services"). */
  serviceDefaults = (): ServiceSettingsValues => {
    try {
      return cleanSettings(JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? "null"));
    } catch {
      return {};
    }
  };

  /** Keep this service's settings as the starting point for new services. */
  saveServiceDefaults = () => {
    if (!this.service) return;
    try {
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(pickSettings(this.service)));
      this.message = t("New services will start with these settings.");
    } catch {
      this.warn(t("These settings could not be kept on this computer."));
    }
  };

  /** This service back on the built-in behaviour. */
  resetServiceSettings = () => {
    if (!this.service) return;
    if (this.countdownOverlayOn) this.toggleCountdownOverlay();
    this.hideLeader();
    this.service = withoutSettings(this.service);
    this.persistSoon();
    this.message = t("Service settings are back to the defaults.");
  };

  /** Change this service's own settings (Service settings). */
  setServiceSettings = (patch: Partial<Pick<Service, "liveOnClick" | "autoAdvance" | "advanceGrace" | "warnMinutes" | "versesPerScreen" | "leaderSeconds" | "readingsOn">>) => {
    if (!this.service) return;
    const next: Service = { ...this.service, ...patch };
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) if (next[key] === undefined || next[key] === null) delete next[key];
    this.service = next;
    this.persistSoon();
  };

  /** Parts already moved on from (or kept on by the operator), so a part is moved on from once only. */
  private advanced = new Set<string>();
  private lastChime = 0;
  /** A reminder put off until this moment (epoch ms), by part. */
  private snoozed = new Map<string, number>();

  /** The running part whose time is up, waiting for the operator (the "Remind me" mode). */
  timeUp = $state<{ sectionId: string; nextId: string | null; since: number } | null>(null);

  /**
   * When the running part's time is up (plus the service's grace): in "Remind me" (the default) the
   * desk asks to move on and chimes, again every few minutes; in "Move on" the next part begins by
   * itself (its first item goes up) with a message offering to stay. The plan never runs ahead of
   * the room: a part only begins when it is moved on to or something from it goes live.
   */
  private checkAdvance = async () => {
    const service = this.service;
    const running = this.runningSectionId;
    const mode = service?.autoAdvance ?? "remind";
    if (!service || !running || !this.serviceRunning || mode === "off") {
      if (this.timeUp) this.timeUp = null;
      return;
    }
    if (this.timeUp && this.timeUp.sectionId !== running) this.timeUp = null;
    const deadline = sectionDeadline(planSchedule(service), running, this.sectionStarts[running] ?? null);
    if (!deadline || Date.now() < deadline.endsAt + (service.advanceGrace ?? 0) * 60_000) return;
    const index = service.sections.findIndex((section) => section.id === running);
    const next = nextPart(service, running);
    if (mode === "remind") {
      if ((this.snoozed.get(running) ?? 0) > Date.now()) return;
      const chime = () => {
        this.lastChime = Date.now();
        if (this.workspace.timerSounds.on) playCue("end", this.workspace.timerSounds.volume || 0.5);
      };
      if (!this.timeUp) {
        // `since`: when the part's time was up (its planned end), so "over" counts from there.
        this.timeUp = { sectionId: running, nextId: next?.id ?? null, since: deadline.endsAt };
        chime();
        const part = service.sections[index]!;
        // The Service page and the Presenter pages' service strip say so themselves; elsewhere (the
        // Production Desk) a note does.
        if (this.workspace.appearance.desk !== "pewbeam") this.notify(t("{part}'s time is up.", { part: part.name }), {
          detail: next ? t("Next: {next}", { next: next.name }) : t("This is the last part."),
          ms: 60_000,
          actions: [
            ...(next ? [{ label: t("Move on now"), run: () => { void this.moveOn(part.id); this.dismissToast(); } }] : []),
            { label: t("5 more min"), run: () => { this.snoozeTimeUp(5); this.dismissToast(); } },
          ],
        });
      } else if (Date.now() - this.lastChime > 3 * 60_000) chime();
      return;
    }
    if (this.advanced.has(running)) return;
    this.advanced.add(running);
    if (next) await this.moveOn(running, true);
  };

  /** Move from a part to the next: it begins, and its first item goes up (LIVE with Auto LIVE). */
  moveOn = async (fromId: string | null = this.runningSectionId, offerStay = false) => {
    const service = this.service;
    if (!service || !fromId) return;
    const from = service.sections.find((section) => section.id === fromId);
    const next = nextPart(service, fromId);
    this.timeUp = null;
    if (!from || !next) return;
    const previousItem = this.cursor.itemId;
    this.startSection(next.id);
    if (next.items[0]) await this.chooseItem(next.items[0].id);
    else this.cursor = { sectionId: next.id, itemId: null };
    if (!offerStay) {
      this.message = t("Moved on to {next}.", { next: next.name });
      return;
    }
    this.notify(t("{part}'s time is up. Moved on to {next}.", { part: from.name, next: next.name }), {
      detail: t("Turn this off in Service settings."),
      ms: 15_000,
      actions: [
        {
          label: t("Stay on {part}", { part: from.name }),
          run: () => {
            // Back on the part (the run log notes it resumed); its countdown keeps its first start.
            const began = this.sectionStarts[from.id];
            this.startSection(from.id);
            if (began) this.sectionStarts = { ...this.sectionStarts, [from.id]: began };
            if (previousItem) void this.selectItem(previousItem);
            this.dismissToast();
          },
        },
      ],
    });
  };

  /** Not yet: remind again in a few minutes (the part keeps running and shows as over). */
  snoozeTimeUp = (minutes = 5) => {
    const up = this.timeUp;
    if (!up) return;
    this.snoozed.set(up.sectionId, Date.now() + minutes * 60_000);
    this.timeUp = null;
    this.message = t("Reminding you again in {n} min.", { n: minutes });
  };

  /** Stay on the part until it is moved on by hand (no more reminders for it). */
  stayOnPart = () => {
    const up = this.timeUp;
    if (!up) return;
    this.snoozed.set(up.sectionId, Number.MAX_SAFE_INTEGER);
    this.timeUp = null;
  };

  /** A text slide in a part, ready to edit. */
  /** A text item; with `rich` it is formatted (the Formatted tab), and heading may be empty. */
  addTextToService = (heading: string, body: string, sectionId?: string, rich: RichDoc | null = null) => {
    const title = heading.trim() || (rich ? plainFromRich(rich).heading || richLines(rich).find((line) => line.trim()) : "") || t("Text");
    const slide = rich ? { heading: heading.trim(), body, imageId: null, rich } : { heading: title, body: body.trim(), imageId: null };
    return this.addToService({ kind: "slide", title: title.slice(0, 80), slide }, false, sectionId);
  };

  addLyric = (songId: string, sectionId: string, title: string, partId?: string) => {
    if (!this.service) return;
    const target = (partId && this.service.sections.some((entry) => entry.id === partId) ? partId : null) ?? this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!target) {
      this.warn(t("Add a section first."));
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

  /** Decks, the one changed last first: what a church just made is what it looks for. */
  get recentDecks(): SlideDeck[] {
    return [...this.decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * A deck from the studio onto the screens: one page on Preview, or straight to Program, every page
   * as a slideshow, or into the service to run in order.
   */
  showDeck = async (deckId: string, how: "preview" | "live" | "slideshow" | "service", options: { page?: number; seconds?: number } = {}) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    if (!deck) return;
    const page = Math.min(Math.max(0, options.page ?? 0), deck.pages.length - 1);
    if (how === "service") return this.addDeckToService(deckId);
    if (how === "slideshow") return this.startDeckLoop(deckId, options.seconds ?? 8);
    this.previewDeckPage(deckId, page);
    if (how === "live") await this.take();
    else this.message = t("{name} is on Preview. Press LIVE to show it.", { name: deck.name });
  };

  /**
   * The design studio (the slide editor) open over any page: on a deck, the newest one, or a new one.
   * `start`: open the template gallery straight away.
   */
  studio = $state<{ deckId: string; start: "templates" | null } | null>(null);

  openStudio = (deckId?: string, start: "templates" | null = null) => {
    if (!this.requireFeature("slides")) return;
    const deck = deckId ? this.decks.find((entry) => entry.id === deckId) : [...this.decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const chosen = deck ?? createDeck(t("Slides {n}", { n: this.decks.length + 1 }));
    if (!deck) this.saveDeck(chosen);
    this.studio = { deckId: chosen.id, start };
  };

  closeStudio = () => {
    this.studio = null;
  };

  /** Games a church made for the congregation's phones (games.ts); the built-in ones are not stored. */
  saveGame = (game: Game) => {
    const games = this.workspace.games ?? [];
    const next = { ...game, updatedAt: new Date().toISOString() };
    this.workspace = { ...this.workspace, games: games.some((entry) => entry.id === game.id) ? games.map((entry) => (entry.id === game.id ? next : entry)) : [next, ...games] };
    this.persistSoon();
  };

  removeGame = (id: string) => {
    // A built-in sample is hidden (it can come back); the church's own is deleted.
    if (id.startsWith("builtin:")) this.workspace = { ...this.workspace, hiddenGames: [...new Set([...(this.workspace.hiddenGames ?? []), id])] };
    else this.workspace = { ...this.workspace, games: (this.workspace.games ?? []).filter((entry) => entry.id !== id) };
    this.persistSoon();
  };

  /** The built-in samples removed earlier, back in the list. */
  restoreSampleGames = () => {
    this.workspace = { ...this.workspace, hiddenGames: [] };
    this.persistSoon();
  };

  /** Keep what a quiz showed once it ended (newest first, the oldest dropped past the limit). */
  saveGameReport = (report: GameReport) => {
    this.workspace = { ...this.workspace, gameReports: [report, ...(this.workspace.gameReports ?? []).filter((entry) => entry.id !== report.id)].slice(0, MOST_REPORTS) };
    this.persistSoon();
  };

  removeGameReport = (id: string) => {
    this.workspace = { ...this.workspace, gameReports: (this.workspace.gameReports ?? []).filter((entry) => entry.id !== id) };
    this.persistSoon();
  };

  /** Which deck page is on Preview, so Next/Previous step pages. */
  deckFocus = $state<{ deckId: string; index: number } | null>(null);

  saveDeck = (deck: SlideDeck) => {
    const exists = this.decks.some((entry) => entry.id === deck.id);
    const decks = exists ? this.decks.map((entry) => (entry.id === deck.id ? deck : entry)) : [deck, ...this.decks];
    this.workspace = { ...this.workspace, decks };
    this.persistSoon();
    this.message = t("{name} saved.", { name: deck.name });
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
    this.message = t("{name} deleted. Program was not changed.", { name: deck?.name ?? t("Deck") });
  };

  /** Put one deck page on Preview. Program waits for LIVE. */
  previewDeckPage = (deckId: string, index: number) => {
    if (!this.requireFeature("slides")) return;
    const deck = this.decks.find((entry) => entry.id === deckId);
    const page = deck?.pages[index];
    if (!deck || !page) return;
    // A PDF set to scroll: the whole document as one long page, from the top of this page.
    if (deck.scroll && documentAssets(deck)) {
      void this.previewDocument(deckId, { page: index });
      return;
    }
    this.songFocus = null;
    this.sermonFocus = null;
    this.lookOnPreview = null;
    this.previewBible = null;
    this.deckFocus = { deckId, index };
    const model = presentComposition(withMediaUrls(page, this.mediaSrc), { theme: this.theme(), now: Date.now(), canvas: this.outputCanvas() });
    this.live = setPreview(this.live, frame(model, `deck:${deckId}:${index}`, page.transition.type === "cut" ? "cut" : "fade"));
    this.message = t("{name}: page {index} of {length} on Preview. LIVE sends Program.", { name: deck.name, index: index + 1, length: deck.pages.length });
  };

  // --- A PDF as one long page that scrolls (domain/document-scroll.ts) --------------------------

  /** Each page picture's shape (height / width), read once from the file. */
  private pageShapes = new Map<string, number>();

  private async shapesOf(urls: string[]): Promise<number[]> {
    return Promise.all(
      urls.map((url) => {
        const known = this.pageShapes.get(url);
        if (known) return known;
        return new Promise<number>((resolve) => {
          const image = new Image();
          image.onload = () => {
            const shape = image.naturalWidth ? image.naturalHeight / image.naturalWidth : 1.414;
            this.pageShapes.set(url, shape);
            resolve(shape);
          };
          // A page that will not load still takes an A4 page's room, so the rest stay in place.
          image.onerror = () => resolve(1.414);
          image.src = url;
        });
      }),
    );
  }

  /** The screen's shape (width / height), which sets how tall a page is in screen heights. */
  screenRatio = (): number => {
    const canvas = this.outputCanvas();
    return canvas.width / canvas.height;
  };

  /** How far a document frame can scroll, in screen heights. */
  documentLength = (model: PresentationModel): number => (model.document ? scrollLength(model.document.pages.map((page) => page.aspect), this.screenRatio()) : 0);

  /** The frame for a scrolling PDF; page shapes not read yet count as A4 until they are. */
  private documentFrame(deckId: string, at: number, shapes?: number[]): PresentationModel | null {
    const deck = this.decks.find((entry) => entry.id === deckId);
    const assets = deck ? documentAssets(deck) : null;
    if (!assets) return null;
    const urls = assets.map((id) => this.mediaSrc(id) ?? "");
    const pages = urls.map((url, index) => ({ url, aspect: shapes?.[index] ?? this.pageShapes.get(url) ?? 1.414 }));
    const length = scrollLength(pages.map((page) => page.aspect), this.screenRatio());
    return { ...emptyModel(this.theme()), layout: "document", document: { pages, at: Math.max(0, Math.min(length, at)) } };
  }

  /** A PDF deck shown as one long page that scrolls, or a page at a time. */
  setDeckScroll = (deckId: string, scroll: boolean) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    if (!deck || !documentAssets(deck)) return;
    const { scroll: _was, ...rest } = deck;
    this.saveDeck(scroll ? { ...rest, scroll: true } : rest);
    this.previewDeckPage(deckId, 0);
  };

  /** A PDF deck on Preview as one long page: at a position, or from the top of a page. */
  previewDocument = async (deckId: string, where: { at?: number; page?: number } = {}) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    const assets = deck ? documentAssets(deck) : null;
    if (!deck || !assets) return;
    const shapes = await this.shapesOf(assets.map((id) => this.mediaSrc(id) ?? ""));
    const at = where.page !== undefined ? pageStart(where.page, shapes, this.screenRatio()) : (where.at ?? 0);
    const model = this.documentFrame(deckId, at, shapes);
    if (!model?.document) return;
    this.songFocus = null;
    this.sermonFocus = null;
    this.lookOnPreview = null;
    this.previewBible = null;
    this.deckFocus = null;
    this.live = setPreview(this.live, frame(model, `doc:${deckId}`, "cut"));
    const page = pageAt(model.document.at, shapes, this.screenRatio());
    this.message = t("{name}: page {index} of {length} on Preview, scrolling. LIVE sends Program.", { name: deck.name, index: page + 1, length: assets.length });
  };

  /** Scroll the document on Preview one step; false past either end (the running order moves on). */
  private stepPreviewDocument(direction: 1 | -1): boolean {
    const preview = this.live.preview;
    if (!preview.sourceId?.startsWith("doc:") || !preview.model.document) return false;
    const next = stepScroll(preview.model.document.at, direction, this.documentLength(preview.model));
    if (next === null) return false;
    this.live = setPreview(this.live, frame({ ...preview.model, document: { ...preview.model.document, at: next } }, preview.sourceId, "cut"));
    return true;
  }

  private scrollTimer: ReturnType<typeof setTimeout> | undefined;
  private scrollWanted: number | null = null;

  /**
   * Scroll the document on Program to a position (the desk's slider, the mouse wheel over Program,
   * the up and down buttons). Every screen glides there; a burst of wheel turns sends the last.
   */
  scrollProgramTo = (at: number) => {
    const model = this.live.program.model;
    if (model.layout !== "document" || !model.document) return;
    this.scrollWanted = Math.max(0, Math.min(this.documentLength(model), at));
    if (this.scrollTimer) return;
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = undefined;
      const wanted = this.scrollWanted;
      const current = this.live.program.model;
      if (wanted === null || current.layout !== "document" || !current.document) return;
      this.scrollWanted = null;
      const next = { ...current, document: { ...current.document, at: wanted } };
      this.live = replaceProgramModel(this.live, next, "cut");
      // Preview showing the same document follows, so LIVE after this changes nothing.
      if (this.live.preview.sourceId === this.live.program.sourceId) this.live = setPreview(this.live, frame(next, this.live.preview.sourceId, "cut"));
      void this.pushProgram();
    }, 90);
  };

  scrollProgramBy = (by: number) => {
    const doc = this.live.program.model.document;
    if (doc) this.scrollProgramTo((this.scrollWanted ?? doc.at) + by);
  };

  /** Play, pause, jump or change the volume of the video on Program, on every screen at once. */
  controlVideo = async (change: { kind: "play" | "pause" | "restart" | "mute" | "loop" } | { kind: "seek"; at: number } | { kind: "volume"; volume: number }) => {
    const model = this.live.program.model;
    if (model.layout !== "video" || !model.video) return;
    // Sound on or off, and play once or loop: every screen follows, the picture carries on.
    if (change.kind === "mute" || change.kind === "loop") {
      const video = change.kind === "mute" ? { ...model.video, muted: !model.video.muted } : { ...model.video, loop: !model.video.loop };
      this.live = { ...this.live, program: { ...this.live.program, model: { ...model, video } } };
      if (change.kind === "loop") this.videoEnded = null;
      await this.pushProgram();
      return;
    }
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
        control = { ...current, playing: true, at: model.video.start ?? 0, stamp: now };
        this.videoEnded = null;
        break;
      case "seek":
        control = { ...current, at: Math.max(model.video.start ?? 0, change.at), stamp: now };
        this.videoEnded = null;
        break;
      case "volume":
        control = { ...current, at, stamp: now, volume: Math.min(1, Math.max(0, change.volume)) };
        break;
      default:
        return;
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
  /** NDI output (desktop, macOS): Program as a network video source. */
  ndi = $state<{ status: "off" | "starting" | "on" | "error"; message: string; connections: number; pattern: boolean; name: string; audio?: boolean }>({
    status: "off",
    message: "",
    connections: 0,
    pattern: false,
    name: "",
  });
  private ndiUnlisten: (() => void) | null = null;
  /** Whether this install has NDI output (null until asked). Not every build has it yet. */
  ndiAvailable = $state<boolean | null>(null);

  checkNdiAvailable = async () => {
    if (this.ndiAvailable !== null) return;
    try {
      this.ndiAvailable = this.desktop() ? await invoke<boolean>("ndi_available") : false;
    } catch {
      this.ndiAvailable = false;
    }
  };

  /**
   * Start sending over NDI. Program comes from the audience window, so it is opened first.
   * `pattern` sends colour bars instead, to find the source in OBS or vMix before a service.
   */
  startNdi = async (options: { pattern?: boolean; fps?: number } = {}) => {
    if (!this.requireFeature("ndi")) return;
    if (!this.desktop()) {
      this.ndi = { ...this.ndi, status: "error", message: t("NDI output works in the desktop app.") };
      return;
    }
    const pattern = options.pattern === true;
    const name = this.workspace.churchName.trim() ? `${this.workspace.churchName.trim()} Program` : "Church Studio Program";
    this.ndi = { status: "starting", message: pattern ? "Starting the test pattern…" : "Starting NDI…", connections: 0, pattern, name };
    if (!this.ndiUnlisten) {
      this.ndiUnlisten = await listen<{ line: string }>("ndi-status", (event) => this.onNdiLine(event.payload.line));
    }
    try {
      if (!pattern && !this.output.online) await this.openAudience();
      await invoke("start_ndi", { name, fps: options.fps ?? 30, pattern, audio: this.workspace.ndiAudio });
    } catch (error) {
      this.ndi = { ...this.ndi, status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  };

  // Production apps (OBS, vMix): connect, follow their state, and press their buttons.
  switcherState = $state<SwitcherState>(idleSwitcher());
  private switcherClient: Switcher | null = null;

  connectSwitcher = async (settings?: Partial<SwitcherSettings>) => {
    if (settings) {
      this.workspace = { ...this.workspace, switcher: sanitizeSwitcher({ ...this.workspace.switcher, ...settings }) };
      this.persistSoon();
    }
    this.switcherClient?.close();
    this.switcherClient = null;
    const config = this.workspace.switcher;
    if (config.kind === "none") {
      this.switcherState = idleSwitcher();
      return;
    }
    const onState = (patch: Partial<SwitcherState>) => (this.switcherState = { ...this.switcherState, ...patch });
    const client: Switcher =
      config.kind === "obs"
        ? new ObsSwitcher(config, onState)
        : new VmixSwitcher(config, onState, (host, port, query) =>
            this.desktop() ? invoke<string>("vmix_get", { host, port, query }) : Promise.reject(new Error(t("vMix control works in the desktop app."))),
          );
    this.switcherClient = client;
    try {
      await client.connect();
    } catch {
      // The state already says what went wrong.
    }
  };

  setSwitcherAutoConnect = (on: boolean) => {
    this.workspace = { ...this.workspace, switcher: { ...this.workspace.switcher, autoConnect: on } };
    this.persistSoon();
  };

  disconnectSwitcher = () => {
    this.switcherClient?.close();
    this.switcherClient = null;
    this.switcherState = idleSwitcher();
  };

  private switcherDo = async (run: (client: Switcher) => Promise<void>) => {
    const client = this.switcherClient;
    if (!client || this.switcherState.status !== "on") {
      this.warn(t("Connect OBS or vMix first: Settings › Production apps."));
      return false;
    }
    try {
      await run(client);
      return true;
    } catch (error) {
      this.warn(errorText(error));
      return false;
    }
  };

  switchScene = (name: string) => this.switcherDo((client) => client.setProgram(name));
  setSwitcherStreaming = (on: boolean) => this.switcherDo((client) => client.setStreaming(on));
  setSwitcherRecording = (on: boolean) => this.switcherDo((client) => client.setRecording(on));

  // Going live and recording from Church Studio itself (see broadcast.rs and the Swift helper).
  broadcastState = $state<{ status: "off" | "starting" | "on" | "error"; streaming: boolean; recording: boolean; live: boolean; pattern: boolean; seconds: number; kbps: number; message: string; saved: string | null }>({
    status: "off",
    streaming: false,
    recording: false,
    live: false,
    pattern: false,
    seconds: 0,
    kbps: 0,
    message: "",
    saved: null,
  });
  private broadcastUnlisten: (() => void) | null = null;

  setBroadcast = (patch: Partial<BroadcastSettings>) => {
    this.workspace = { ...this.workspace, broadcast: sanitizeBroadcast({ ...this.workspace.broadcast, ...patch }) };
    this.persistSoon();
  };

  /** Start streaming, recording or both. With `pattern`, colour bars and a beep test the stream key. */
  startBroadcast = async (options: { stream: boolean; record: boolean; pattern?: boolean }) => {
    if (!this.requireFeature(options.stream ? "streaming" : "recording")) return false;
    if (!this.desktop()) {
      this.broadcastFailed(t("Streaming and recording work in the Church Studio app for Mac."));
      return false;
    }
    // Only the Mac app streams and records so far; elsewhere the permission check below would wrongly name macOS.
    if (computerOs() !== "mac") {
      this.broadcastFailed(t("Streaming and recording work on a Mac for now. On this computer, OBS can capture the audience window and stream or record it."));
      return false;
    }
    const settings = this.workspace.broadcast;
    let rtmp: string | null = null;
    if (options.stream) {
      const target = streamTarget(settings);
      if ("missing" in target) {
        this.broadcastFailed(target.missing === "key" ? t("Add your stream key first.") : t("Add the stream server address first."), "settings");
        return false;
      }
      rtmp = target.url;
    }
    // macOS must allow capturing the audience window. The first time it asks; after that (and after
    // an update, until the app is signed by Apple) it is switched on in System Settings.
    if (!options.pattern && !(await invoke<boolean>("screen_capture_allowed", { ask: true }).catch(() => true))) {
      this.broadcastFailed(t("macOS needs your permission to capture the audience window."), "permission");
      return false;
    }
    // A recording that would run out of room partway through the service is stopped before it starts.
    if (options.record && !options.pattern) {
      const room = await this.checks.recordRoom();
      const minutes = room === null ? null : recordingMinutes(room, this.checks.recordKbps());
      if (minutes !== null && minutes < 10) {
        this.broadcastFailed(t("Only about {minutes} minutes of recording fit on this computer. Free some space, or choose another recordings folder.", { minutes }), "space");
        return false;
      }
      if (minutes !== null && minutes < 90) this.warn(t("Recording: room for about {minutes} minutes. Free some space before a long service.", { minutes }));
    }
    if (!this.broadcastUnlisten) this.broadcastUnlisten = await listen<{ line: string }>("broadcast-status", (event) => this.onBroadcastLine(event.payload.line));
    const quality = QUALITIES[settings.quality];
    this.broadcastState = { status: "starting", streaming: options.stream, recording: options.record, live: false, pattern: options.pattern === true, seconds: 0, kbps: 0, message: t("Starting…"), saved: null };
    try {
      if (!options.pattern && !this.output.online) await this.openAudience();
      const saved = await invoke<string | null>("start_broadcast", {
        options: { rtmp, recordFolder: options.record ? settings.recordFolder || null : null, width: quality.width, height: quality.height, fps: quality.fps, videoKbps: quality.videoKbps, audio: settings.sound, pattern: options.pattern === true },
        stamp: recordingStamp(),
      });
      this.broadcastState = { ...this.broadcastState, saved: saved ?? null };
      return true;
    } catch (error) {
      this.broadcastFailed(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  /**
   * Streaming or recording could not start (or stopped): said where it is seen, with the one thing to
   * do about it, not only inside the closed menu.
   */
  private broadcastFailed = (message: string, fix: "permission" | "settings" | "space" | null = null) => {
    this.broadcastState = { ...this.broadcastState, status: "error", message };
    const actions: Array<{ label: string; run: () => void }> = [];
    if (fix === "permission") {
      actions.push({ label: t("Open Screen Recording settings"), run: () => { void openPrivacySettings("screen").catch(() => {}); this.dismissToast(); } });
    } else if (fix === "settings") {
      actions.push({ label: t("Stream & record settings"), run: () => { this.openSettings("broadcast"); this.dismissToast(); } });
    } else if (fix === "space") {
      actions.push({ label: t("Free up space"), run: () => { this.openSettings("storage"); this.dismissToast(); } });
    }
    this.notify(t("Streaming and recording did not start"), {
      detail: fix === "permission" ? t("Turn on Church Studio in Screen & System Audio Recording. After an update, switch it off and on again.") : message,
      ms: 30_000,
      actions,
    });
  };

  stopBroadcast = async () => {
    if (this.desktop()) await invoke("stop_broadcast").catch(() => {});
    this.broadcastState = { ...this.broadcastState, status: "off", live: false, message: this.broadcastState.saved ? t("Saved to {path}", { path: this.broadcastState.saved }) : t("Stopped.") };
  };

  private onBroadcastLine = (line: string) => {
    let message: { kind?: string; message?: string; seconds?: number; kbps?: number; live?: boolean; path?: string };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const state = this.broadcastState;
    if (message.kind === "status") this.broadcastState = { ...state, status: "on", message: "" };
    else if (message.kind === "live") {
      this.broadcastState = { ...state, live: true };
      this.notify(t("You are live"), { detail: state.pattern ? t("Test pattern on the stream") : t("The stream server has the picture and sound.") });
    } else if (message.kind === "stats") this.broadcastState = { ...state, seconds: Number(message.seconds) || 0, kbps: Number(message.kbps) || 0, live: message.live === true || state.live };
    else if (message.kind === "saved" && message.path) {
      this.broadcastState = { ...state, saved: message.path };
      this.notify(t("Recording saved"), { detail: message.path, actions: this.desktop() ? [{ label: t(revealLabel()), run: () => void import("@tauri-apps/plugin-opener").then(({ revealItemInDir }) => revealItemInDir(message.path!)).catch(() => {}) }] : [] });
    } else if (message.kind === "error") this.broadcastFailed(message.message ?? t("Streaming stopped."), (message as { code?: string }).code === "permission" ? "permission" : null);
    else if (message.kind === "end" && state.status !== "error") this.broadcastState = { ...state, status: "off", live: false };
  };

  /** Sound with the NDI picture; a running sender restarts to take the change. */
  setNdiAudio = async (on: boolean) => {
    this.workspace = { ...this.workspace, ndiAudio: on };
    this.persistSoon();
    if (this.ndi.status === "on" || this.ndi.status === "starting") await this.startNdi({ pattern: this.ndi.pattern });
  };

  stopNdi = async () => {
    if (this.desktop()) await invoke("stop_ndi").catch(() => {});
    this.ndi = { ...this.ndi, status: "off", message: t("NDI stopped."), connections: 0 };
  };

  private onNdiLine = (line: string) => {
    let message: { kind?: string; message?: string; connections?: number; code?: string; audio?: boolean };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.kind === "status") this.ndi = { ...this.ndi, status: "on", message: message.message ?? t("Sending."), audio: message.audio === true };
    else if (message.kind === "stats") this.ndi = { ...this.ndi, connections: Number(message.connections) || 0 };
    else if (message.kind === "error") this.ndi = { ...this.ndi, status: "error", message: message.message ?? t("NDI stopped.") };
    else if (message.kind === "end" && this.ndi.status !== "error") this.ndi = { ...this.ndi, status: "off", connections: 0 };
  };

  /** The passage on Program now (goneLiveKey), so each passage is noted once per time it goes up. */
  private programPassageKey: string | null = null;
  private programPassageNow: BibleItem | null = null;

  /** The scripture a Program frame shows: plain scripture, or a look's scripture region. */
  private programPassage(model: PresentationModel): BibleItem | null {
    const words =
      model.layout === "scripture"
        ? model
        : model.layout === "composition"
          ? model.layers?.find((layer) => layer.opacity > 0 && layer.model.layout === "scripture")?.model
          : undefined;
    if (!words?.reference) return null;
    const preview = this.previewBible;
    if (preview && preview.reference === words.reference) return preview;
    const parsed = parseReference(words.reference);
    if (!parsed?.startVerse) return null;
    const translation =
      this.translations.find((entry) => entry.name === words.attribution || entry.abbreviation === words.attribution)?.id ??
      preview?.translationId ??
      this.workspace.recent[0]?.translationId ??
      "kjv";
    return {
      translationId: translation,
      bookOrd: parsed.bookOrd,
      chapter: parsed.chapter,
      startVerse: parsed.startVerse,
      endVerse: parsed.endVerse ?? parsed.startVerse,
      reference: words.reference,
    };
  }

  /** Keep every scripture that reaches Program (GO LIVE, cut, verse steps, voice, the phone). */
  /** The song on Program, so each song shown counts once however many of its parts follow. */
  private songLive: string | null = null;
  private noteSongLive = (sourceId: string | null) => {
    const song = sourceId?.startsWith("song:") ? (sourceId.split(":")[1] ?? null) : null;
    if (song && song !== this.songLive) countUse("songs");
    this.songLive = song;
  };

  private noteGoneLive = (model: PresentationModel) => {
    const passage = this.programPassage(model);
    const key = passage ? goneLiveKey(passage) : null;
    if (key === this.programPassageKey) return;
    const previous = this.programPassageNow;
    this.programPassageKey = key;
    this.programPassageNow = passage;
    if (!passage) return;
    countUse("scripture");
    const words = model.layout === "scripture" ? model : model.layers?.find((layer) => layer.model.layout === "scripture")?.model;
    const snippet = words?.lines.map((line) => line.text).join(" ") ?? "";
    this.workspace = { ...this.workspace, goneLive: recordGoneLive(this.workspace.goneLive, passage, Date.now(), { previous, snippet }) };
    this.persistSoon();
  };

  /** Send a passage straight to Program (no Preview step): the pastor went back to it. */
  goLivePassage = async (passage: BibleItem) => {
    if (!this.desktop() && !this.controlsAudience) {
      this.warn(t("This window is not sending to the audience."));
      return;
    }
    const model = await this.modelFor({ id: "gone-live", kind: "bible", title: passage.reference, bible: passage });
    if (model.lines.length === 0) {
      this.warn(t("{reference} could not be found in this translation.", { reference: passage.reference }));
      return;
    }
    if (this.deckLoop) this.stopDeckLoop();
    this.lookOnProgram = null;
    this.releaseHold();
    this.live = replaceProgramModel(this.live, model, "fade");
    await this.pushProgram();
    this.message = t("{reference} is live.", { reference: passage.reference });
  };

  /** One verse of a passage that went live (a verse it stepped through), straight to Program. */
  goLiveGoneVerse = async (passage: BibleItem) => {
    // It belongs to its passage in the list already: no new entry.
    this.programPassageKey = goneLiveKey(passage);
    this.programPassageNow = passage;
    await this.goLivePassage(passage);
  };

  pinGoneLive = (key: string, pinned: boolean) => {
    this.workspace = { ...this.workspace, goneLive: pinGoneLive(this.workspace.goneLive, key, pinned) };
    this.persistSoon();
  };

  removeGoneLive = (key: string, removed: boolean) => {
    this.workspace = { ...this.workspace, goneLive: removeGoneLive(this.workspace.goneLive, key, removed) };
    this.persistSoon();
  };

  /** Empty the list; pinned passages stay. */
  clearGoneLive = () => {
    this.workspace = { ...this.workspace, goneLive: clearGoneLive(this.workspace.goneLive) };
    this.persistSoon();
    this.message = t("Gone live list cleared. Pinned passages stay.");
  };

  /** NDI key output: only the words on Program, on a transparent picture, to key over cameras. */
  ndiKey = $state<{ status: "off" | "starting" | "on" | "error"; message: string; connections: number; name: string }>({
    status: "off",
    message: "",
    connections: 0,
    name: "",
  });
  private ndiKeyUnlisten: (() => void) | null = null;
  private keySent = "";

  startNdiKey = async () => {
    if (!this.requireFeature("ndi")) return;
    if (!this.desktop()) {
      this.ndiKey = { ...this.ndiKey, status: "error", message: t("NDI output works in the desktop app.") };
      return;
    }
    const church = this.workspace.churchName.trim() || "Church Studio";
    const name = `${church} Words`;
    this.ndiKey = { status: "starting", message: t("Starting the words output…"), connections: 0, name };
    if (!this.ndiKeyUnlisten) {
      this.ndiKeyUnlisten = await listen<{ line: string }>("ndi-key-status", (event) => this.onNdiKeyLine(event.payload.line));
    }
    try {
      await invoke("start_ndi_key", { name, fps: 30 });
      this.keySent = "";
      this.pushKeyWords();
    } catch (error) {
      this.ndiKey = { ...this.ndiKey, status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  };

  stopNdiKey = async () => {
    if (this.desktop()) await invoke("stop_ndi_key").catch(() => {});
    this.ndiKey = { ...this.ndiKey, status: "off", message: "", connections: 0 };
  };

  /** Send the words on Program to the key output when they change. */
  private pushKeyWords = () => {
    if (this.ndiKey.status !== "on" && this.ndiKey.status !== "starting") return;
    const words = keyWords(this.#live.program.model) ?? { cue: "", body: "" };
    const sent = `${words.cue}\n${words.body}`;
    if (sent === this.keySent) return;
    this.keySent = sent;
    void invoke("ndi_key_words", words).catch(() => {});
  };

  private onNdiKeyLine = (line: string) => {
    let message: { kind?: string; message?: string; connections?: number };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.kind === "status") this.ndiKey = { ...this.ndiKey, status: "on", message: message.message ?? t("Sending.") };
    else if (message.kind === "stats") this.ndiKey = { ...this.ndiKey, connections: Number(message.connections) || 0 };
    else if (message.kind === "error") this.ndiKey = { ...this.ndiKey, status: "error", message: message.message ?? t("NDI stopped.") };
    else if (message.kind === "end" && this.ndiKey.status !== "error") this.ndiKey = { ...this.ndiKey, status: "off", connections: 0 };
  };

  /** AI assistant settings (provider, the church's own key, model). */
  setAiSettings = (patch: Partial<AiSettings>) => {
    this.workspace = { ...this.workspace, ai: sanitizeAiSettings({ ...this.workspace.ai, ...patch }) };
    this.persistSoon();
  };

  get aiReady() {
    return aiReady(this.workspace.ai);
  }

  /** Whether the church has this AI feature switched on (Settings › AI assistant). */
  aiOn = (feature: AiFeature): boolean => aiFeatureOn(this.workspace.ai, feature);

  setAiFeature = (feature: AiFeature, on: boolean) => {
    this.setAiSettings({ features: { ...this.workspace.ai.features, [feature]: on } });
  };

  /** The church's own AI (ai-assistant.ts): every feature, behind its switch in Settings › AI assistant. */
  private assistant = new AiAssistant({
    settings: () => this.workspace.ai,
    songs: () => this.songs,
    saveDeck: (deck) => this.saveDeck(deck),
    addDeckToService: (deckId, sectionId) => this.addDeckToService(deckId, sectionId),
    say: (message) => (this.message = message),
  });

  versesFromSpeech = (heard: string) => this.assistant.versesFromSpeech(heard);
  summarizeSermon = (input: Parameters<AiAssistant["summarizeSermon"]>[0]) => this.assistant.summarizeSermon(input);
  generateSlides = (input: Parameters<AiAssistant["generateSlides"]>[0]) => this.assistant.generateSlides(input);
  aiModels = () => this.assistant.models();
  findSongsWithAi = (query: string) => this.assistant.findSongs(query);
  hymnWithAi = (match: SongMatch, folder: string) => this.assistant.hymn(match, folder);
  suggestSongsWithAi = (input: { title: string; notes: string }) => this.assistant.suggestSongs(input);
  makeGameWithAi = (input: Parameters<AiAssistant["makeGame"]>[0]) => this.assistant.makeGame(input);
  sermonText = sermonText;

  /** Notes taken while the pastor preaches (live-notes.svelte.ts): words heard, tidied by the AI. */
  liveNotes = new LiveNotes({
    sermon: (id) => this.sermons.find((entry) => entry.id === id),
    save: (sermon) => this.saveSermonQuietly(sermon),
    listening: () => this.voice.status === "listening" || this.voice.status === "starting",
    startListening: () => this.startVoice(),
    canTidy: () => aiReady(this.workspace.ai) && aiFeatureOn(this.workspace.ai, "notes"),
    tidy: (input) => this.assistant.tidyNotes(input),
  });

  /**
   * Look up a song with AI, asked for elsewhere (Settings, a sermon's suggestions): what to look up
   * ("" to let the operator type), waiting until the Songs page opens it. null: nothing asked.
   */
  aiSongLookup = $state<string | null>(null);

  lookUpSongWithAi = (query = "") => {
    this.aiSongLookup = query;
    this.settingsOpen = false;
    this.goToDesk("presenter", "songs");
  };

  /** Readiness, Performance and the support file (service-checks.svelte.ts). */
  private checks = new ServiceChecks(this, () => this.desktop());

  checkReady = () => this.checks.ready();
  checkHealth = () => this.checks.health();
  measureSmoothness = () => this.checks.measureSmoothness();
  supportFile = () => this.checks.supportFile();
  get lastFrames() {
    return this.checks.lastFrames;
  }

  /** A tiny request to check the key and model work. */
  testAi = async (): Promise<string> => {
    const settings = this.workspace.ai;
    if (settings.provider !== "local" && !settings.key) throw new Error(t("Paste your key first."));
    if (!settings.model) throw new Error(t("Choose a model first. Find models lists them."));
    // The test works whichever features are switched on.
    const result = parseSummary(replyText(settings.provider, await this.assistant.post(summaryRequest(settings, { title: "Test", notes: "God is love. Point one: he made us. Point two: he saves us (John 3:16)." }))));
    return result.points.length ? tn(result.points.length, "Connected. The test made {n} point.", "Connected. The test made {n} points.") : t("Connected.");
  };

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
    this.message = t("{name} imported: {items}, {songs}. Open the Service page to run it.", { name: result.service.name, items: tn(count, "{n} item", "{n} items"), songs: tn(result.songs.length, "{n} new song", "{n} new songs") });
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
      this.warn(t("This window is not sending to the audience."));
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
    this.message = t("{name} is looping on Program, a page every {every} seconds. Preview is free for what comes next.", { name: deck.name, every });
  };

  stopDeckLoop = () => {
    clearInterval(this.loopTimer);
    this.loopTimer = undefined;
    if (this.deckLoop) this.message = t("Loop stopped. Program stays on the page it was showing.");
    this.deckLoop = null;
  };

  /** The loop writes Program directly, so the operator can keep staging on Preview. */
  private showLoopPage = async () => {
    const loop = this.deckLoop;
    const deck = loop && this.decks.find((entry) => entry.id === loop.deckId);
    const page = deck?.pages[loop!.index];
    if (!loop || !deck || !page) return;
    const model = presentComposition(withMediaUrls(page, this.mediaSrc), { theme: this.theme(), now: Date.now(), canvas: this.outputCanvas() });
    this.releaseHold();
    this.live = { ...this.live, program: frame(model, `deck:${deck.id}:${loop.index}`, page.transition.type === "cut" ? "cut" : "fade"), revision: this.live.revision + 1 };
    await this.pushProgram();
  };

  addDeckToService = async (deckId: string, sectionId?: string) => {
    const deck = this.decks.find((entry) => entry.id === deckId);
    if (!deck) return;
    const target = sectionId && this.service?.sections.some((section) => section.id === sectionId) ? sectionId : await this.sectionForMedia();
    if (!target) return;
    const item = deckItem(deck);
    this.insertItem(target, item);
    await this.selectItem(item.id);
    this.message = t("{name} queued. Preview only until LIVE.", { name: deck.name });
    this.notify(t("Added to {service}", { service: this.service?.name ?? "" }), { detail: deck.name, actions: [{ label: t("Undo"), run: () => { this.removeItem(item.id); this.dismissToast(); } }] });
  };

  /** Add a video to the current section. Preview plays it muted; LIVE plays it on the audience. */
  addVideo = async (assetId: string, title: string, options: { loop?: boolean; muted?: boolean } = {}) => {
    const target = await this.sectionForMedia();
    if (!target) {
      this.warn(t("Add a section first."));
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

  /** A YouTube or Vimeo video from its link, into the service (it plays in its own player). */
  addWebVideo = async (url: string, options: { mute: boolean; loop: boolean; sectionId?: string }) => {
    const target = webTarget(url, options);
    if (!target) {
      this.warn(t("That does not look like a web address."));
      return;
    }
    const section = (options.sectionId && this.service?.sections.some((entry) => entry.id === options.sectionId) ? options.sectionId : null) ?? (await this.sectionForMedia());
    if (!section) {
      this.warn(t("Add a section first."));
      return;
    }
    const item: PresentationItem = { id: uid(), kind: "web", title: target.kind === "youtube" ? t("YouTube video") : target.kind === "vimeo" ? t("Vimeo video") : target.label, web: { url: url.trim(), mute: options.mute, loop: options.loop } };
    this.insertItem(section, item);
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
      this.warn(t("Add a section first."));
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
    // Every section's items go; Undo puts them back (one click must never lose a service).
    const before = this.service;
    const cursor = this.cursor;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => ({ ...section, items: [] })),
    };
    this.cursor = { sectionId: this.service.sections[0]?.id ?? null, itemId: null };
    this.persistSoon();
    this.notify(t("Queue cleared"), {
      detail: before.name,
      actions: [{ label: t("Undo"), run: () => {
        if (this.service?.id === before.id) {
          this.service = before;
          this.cursor = cursor;
          this.persistSoon();
        }
        this.dismissToast();
      } }],
      ms: 10_000,
    });
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
    this.message = t("Search songs. A match is Preview only. LIVE still sends Program.");
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
    const inService = serviceSongIds(this.service);
    this.findHits = serviceFirst(searchSongHits(songs, needle), (hit) => inService.has(hit.songId));
  };

  previewSongHit = (hit: SongHit) => {
    const song = this.songs.find((entry) => entry.id === hit.songId);
    if (!song) {
      this.warn(t("That song is no longer available."));
      return;
    }
    this.previewSongSection(song, hit.sectionId);
    this.message = t("{title} on Preview. LIVE still sends Program.", { title: hit.title });
  };

  queueSongHit = async (hit: SongHit) => {
    const part = await this.pickServicePart(`${hit.title} — ${hit.label}`);
    if (!part) return;
    this.addLyric(hit.songId, hit.sectionId, `${hit.title} — ${hit.label}`, part);
    this.message = t("{title} queued. Preview it, then LIVE.", { title: hit.title });
  };

  previewSongSection = (song: Song, sectionId: string | null, slot?: number, screen = 0) => {
    if (!this.requireFeature("songs")) return;
    const clean = sanitizeSong(song);
    const section = clean.sections.find((entry) => entry.id === sectionId) ?? clean.sections[0];
    if (!section) {
      this.message = t("This song has no sections.");
      return;
    }
    const current = this.songFocus?.songId === clean.id ? (this.songFocus.slot ?? null) : null;
    const place = slot !== undefined && songOrder(clean)[slot] === section.id ? slot : slotFor(clean, section.id, current);
    const screens = this.songScreens(section);
    const shown = clampScreen(screen, screens.length);
    this.songFocus = { songId: clean.id, sectionId: section.id, slot: place, screen: shown };
    this.previewBible = null;
    this.recentSongs = rememberSongRecent(this.recentSongs, { songId: clean.id, sectionId: section.id });
    this.library = "songs";
    const theme = this.theme();
    const backgroundImageUrl = theme.background.type === "image" ? this.mediaSrc(theme.background.assetId) : null;
    const split = screens.length > 1;
    const lyrics = lyricsFor(clean, section.id, clean.title, this.workspace.songLanguage, split ? screens[shown] : undefined);
    this.previewModel(
      this.withBackdrop(presentLyrics({ theme, backgroundImageUrl, label: lyrics.label, lines: lyrics.lines, credit: creditFor(clean, section.id, this.workspace.ccliLicense) })),
      // Line by line, each screen is its own source, so the desk can mark which one is live.
      split ? `song:${clean.id}:${section.id}#${shown}` : `song:${clean.id}:${section.id}`,
    );
  };

  stepSong = (direction: 1 | -1): boolean => {
    const focus = this.songFocus;
    if (!focus) return false;
    const song = this.songs.find((entry) => entry.id === focus.songId);
    if (!song) {
      this.songFocus = null;
      this.warn(t("That song is no longer available."));
      this.previewModel(emptyModel(this.theme()), null);
      return false;
    }
    // Line by line: the next screen of this part first.
    const section = song.sections.find((entry) => entry.id === focus.sectionId);
    const screens = section ? this.songScreens(section) : [];
    const screen = focus.screen ?? 0;
    if (section && screen + direction >= 0 && screen + direction < screens.length) {
      this.previewSongSection(song, section.id, focus.slot, screen + direction);
      return true;
    }
    // Through the song's order (a repeated chorus included); at either end there is nowhere further.
    const next = stepSlot(song, focus.slot ?? slotFor(song, focus.sectionId), direction);
    if (!next) return false;
    // Going back lands on the last screen of the part before.
    const landing = direction < 0 ? this.songScreens(next.section).length - 1 : 0;
    this.previewSongSection(song, next.section.id, next.slot, landing);
    return true;
  };

  songPlace = (): string => {
    const focus = this.songFocus;
    if (!focus) return "";
    const song = this.songs.find((entry) => entry.id === focus.songId);
    if (!song) return "";
    const slots = songSlots(song);
    const slot = focus.slot ?? slotFor(song, focus.sectionId);
    const section = slots[slot];
    if (!section) return "";
    const screens = this.songScreens(section).length;
    const part = `${section.label} · ${slot + 1} of ${slots.length}`;
    return screens > 1 ? `${part} · ${t("lines {n} of {total}", { n: (focus.screen ?? 0) + 1, total: screens })}` : part;
  };

  saveSong = async (song: Song): Promise<boolean> => {
    const clean = sanitizeSong(song);
    const error = songError(clean);
    if (error) {
      this.warn(error);
      return false;
    }
    await api.songSave(clean);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.songs = await api.songList();
    if (this.songFocus?.songId === clean.id) this.previewSongSection(clean, this.songFocus.sectionId);
    return true;
  };

  songPacks = $state<SongPack[]>([]);

  /** The library and workspace have loaded (the loading screen can go). */
  booted = $state(false);

  /** What each Presenter Desk page last staged on Preview, so every page keeps its own. */
  private pageStage: Partial<Record<PewPage, { preview: LiveFrame; songFocus: Session["songFocus"]; sermonFocus: Session["sermonFocus"]; previewBible: BibleItem | null; lookOnPreview: Composition | null; previewFree: boolean }>> = {};

  /** The page of the desk open now (Scriptures, Songs, Sermon or Service). */
  deskPage = $state<PewPage>("scriptures");

  /**
   * Leaving one page for another: put away this page's Preview and bring back the other's
   * (empty if it has staged nothing). Program never changes. Returns whether one came back.
   */
  switchPage = (from: PewPage, to: PewPage): boolean => {
    if (from === to) return true;
    // A room's stage on Preview (a quiz, a poll, a question, the join code) belongs to no page:
    // it stays up while the operator moves about, instead of a page's own verse taking its place.
    const keep = this.live.preview.sourceId?.startsWith("room:") ?? false;
    this.pageStage[from] = {
      preview: keep ? (this.pageStage[from]?.preview ?? { transition: "cut", sourceId: null, model: emptyModel(this.theme()) }) : this.live.preview,
      songFocus: this.songFocus,
      sermonFocus: this.sermonFocus,
      previewBible: this.previewBible,
      lookOnPreview: this.lookOnPreview,
      previewFree: this.previewFree,
    };
    this.deskPage = to;
    const saved = this.pageStage[to];
    if (!keep) this.live = { ...this.live, preview: saved?.preview ?? { transition: "cut", sourceId: null, model: emptyModel(this.theme()) } };
    this.songFocus = saved?.songFocus ?? null;
    this.sermonFocus = saved?.sermonFocus ?? null;
    this.previewBible = saved?.previewBible ?? null;
    this.lookOnPreview = saved?.lookOnPreview ?? null;
    this.previewFree = saved?.previewFree ?? false;
    return keep || !!saved;
  };

  // Running a part on the Presenter page: its Bible, songs and everything else, while the service's
  // clock, countdown and report carry on. Preaching does this by default; readings when asked.

  /** The part being run from the Presenter page (what goes LIVE there counts as this part). */
  presenterPartId = $state<string | null>(null);
  /** A passage the Presenter page should open (its book, chapter and verses), then clears. */
  passageRequest = $state<BibleItem | null>(null);

  /** Where a part runs: its own choice, else the church's choice for parts of that name, else the running order. */
  partRunOf = (section: ServiceSection) => partRun(section, this.workspace.partDesks);

  /** In words: "Running order", "Presenter · Songs", "Production desk". */
  partRunLabel = (run: PartRun): string => {
    const one = (desk: PartDesk, short = false) =>
      desk === "production" ? (short ? t("Production") : t("Production desk")) : desk === "presenter" ? t("Presenter · {page}", { page: t(run.page === "songs" ? "Songs" : run.page === "sermon" ? "Sermon" : "Scriptures") }) : short ? t("Order") : t("Running order");
    const desks = partDesks(run);
    return desks.length === 1 ? one(run.desk) : desks.map((desk, index) => one(desk, index > 0)).join(" + ");
  };

  /** The desk the operator is on now, in the same words as a part's desks. */
  get currentDesk(): PartDesk {
    return this.workspace.appearance.desk !== "pewbeam" ? "production" : this.deskPage === "service" ? "service" : "presenter";
  }

  /** Go to one of the desks a part uses (the service strip's switches). The part keeps counting. */
  goToDesk = (desk: PartDesk, page: PresenterPage = "scriptures") => {
    if (desk === "production") {
      if (!this.requireFeature("production")) return;
      this.setAppearance({ desk: "obs" });
      return;
    }
    if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
    this.pageRequest = desk === "service" ? "service" : page;
  };

  /**
   * Set where a part runs. Then offer to do the same for every part with that name (the church's own
   * word for it), so new services and templates follow without anyone choosing again.
   */
  setPartDesk = (sectionId: string, desk: PartDesk, page?: PresenterPage, quiet = false, also: PartDesk[] = []) => {
    if (!this.service) return;
    const others = [...new Set(also.filter((entry) => entry !== desk))];
    const usesPresenter = desk === "presenter" || others.includes("presenter");
    const run: PartRun = { desk, ...(usesPresenter ? { page: page ?? "scriptures" } : {}), ...(others.length ? { also: others } : {}) };
    this.service = { ...this.service, sections: this.service.sections.map((section) => (section.id === sectionId ? { ...section, desk: run.desk, page: run.page, also: run.also } : section)) };
    this.persistSoon();
    const part = this.service.sections.find((section) => section.id === sectionId);
    if (!part || quiet) return;
    const label = this.partRunLabel(run);
    const kept = this.workspace.partDesks?.[partKey(part.name)];
    const same = kept ? kept.desk === run.desk && kept.page === run.page && (kept.also ?? []).join() === (run.also ?? []).join() : run.desk === "service" && !run.also;
    this.notify(t("{part} runs on: {where}", { part: part.name, where: label }), {
      detail: same ? t("The service keeps time wherever it runs.") : t("Every part called {part} can do the same, in new services too.", { part: part.name }),
      actions: same ? [] : [{ label: t("Same for every {part}", { part: part.name }), run: () => { this.learnPartDesk(part.name, run); this.dismissToast(); } }],
    });
  };

  /** Remember where parts of this name run (the church's word for it). Running order forgets it. */
  learnPartDesk = (name: string, run: PartRun) => {
    const key = partKey(name);
    if (!key) return;
    const { [key]: _old, ...rest } = this.workspace.partDesks ?? {};
    this.workspace = { ...this.workspace, partDesks: run.desk === "service" && !run.also?.length ? rest : { ...rest, [key]: run } };
    this.persistSoon();
    this.message = run.desk === "service" ? t("Parts called {part} run in the running order.", { part: name }) : t("Every part called {part} runs on: {where}.", { part: name, where: this.partRunLabel(run) });
  };

  /** Parts already asked about today ("Nothing is planned here…"), so the question comes once. */
  private askedOpenParts = new Set<string>();

  /**
   * A part begins: one set to run on a desk opens it (the service keeps time there). One that runs
   * in the running order but has nothing planned asks, once, whether to open the Presenter desk.
   * Leaving a part that took the operator to a desk brings them back to the running order.
   */
  private partBegan = (section: ServiceSection) => {
    const run = this.partRunOf(section);
    const cameFromDesk = this.presenterPartId !== null && this.presenterPartId !== section.id;
    if (run.desk === "presenter" || run.desk === "production") {
      this.openPartDesk(section, run);
      return;
    }
    // Opens in the running order but uses other desks too: the strip offers them while it runs.
    if (run.also?.length) {
      this.presenterPartId = section.id;
      if (cameFromDesk) this.goToDesk("service");
      return;
    }
    if (cameFromDesk) {
      this.presenterPartId = null;
      if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
      this.pageRequest = "service";
    }
    const planned = section.items.length > 0;
    if (!planned && !run.chosen && !this.askedOpenParts.has(section.id)) {
      this.askedOpenParts.add(section.id);
      this.notify(t("Nothing is planned for {part}", { part: section.name }), {
        detail: t("Open the Presenter desk with every tool? The service keeps time."),
        ms: 30_000,
        actions: [
          { label: t("Open it"), run: () => { this.openPartDesk(section, { desk: "presenter", page: "scriptures" }); this.dismissToast(); } },
          { label: t("Always for {part}", { part: section.name }), run: () => { this.learnPartDesk(section.name, { desk: "presenter", page: "scriptures" }); this.openPartDesk(section, { desk: "presenter", page: "scriptures" }); this.dismissToast(); } },
        ],
      });
    }
  };

  /** Open the desk a part runs on, noting the part so what goes LIVE there counts as it. */
  openPartDesk = (section: ServiceSection, run: PartRun) => {
    this.presenterPartId = section.id;
    if (run.desk === "production") {
      if (!this.requireFeature("production")) return;
      this.setAppearance({ desk: "obs" });
      this.message = t("{part} has begun on the Production desk. The service keeps time.", { part: section.name });
      return;
    }
    if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
    this.pageRequest = run.page ?? "scriptures";
    this.message = t("{part} has begun. The Presenter desk is open with every tool; the service keeps time.", { part: section.name });
  };

  /** Whether a reading opens on the Presenter page (the service's choice, or its part runs there). */
  readingOnPresenter = (itemId: string): boolean => {
    if (!this.service) return false;
    const found = findItem(this.service, itemId);
    if (!found?.item.bible) return false;
    return this.service.readingsOn === "presenter" || this.partRunOf(found.section).desk === "presenter";
  };

  /** Open a reading from the running order on the Presenter page: its passage, the first screen on Preview. */
  openReadingOnPresenter = (itemId: string) => {
    if (!this.service) return;
    const found = findItem(this.service, itemId);
    if (!found?.item.bible) return;
    this.cursor = { sectionId: found.section.id, itemId };
    this.presenterPartId = found.section.id;
    this.passageRequest = { ...found.item.bible };
    this.pageRequest = "scriptures";
  };

  /** Back to the Service page from the Presenter page. */
  returnToService = () => {
    this.presenterPartId = null;
    if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
    this.pageRequest = "service";
  };

  /** The screen tour running now, if any, and the step (in the full list) it starts from. */
  tour = $state<TourId | null>(null);
  tourFrom = $state(0);
  tourHubOpen = $state(false);
  /** A Presenter Desk page the tour needs open (PewDesk switches to it). */
  pageRequest = $state<PewPage | null>(null);

  /** A short note in the corner after an action ("Added to Sunday Service › Worship"), with an optional button. */
  toast = $state<{ id: number; text: string; detail?: string; actions: Array<{ label: string; run: () => void }> } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  notify = (text: string, options: { detail?: string; actions?: Array<{ label: string; run: () => void }>; ms?: number } = {}) => {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const id = Date.now();
    this.toast = { id, text, detail: options.detail, actions: options.actions ?? [] };
    this.toastTimer = setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, options.ms ?? 6000);
  };

  dismissToast = () => {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = null;
  };

  /** Start a tour, on its own page or desk, from any step. */
  startTour = async (id: TourId, from = 0) => {
    this.settingsOpen = false;
    this.tourHubOpen = false;
    // Each tour opens the part of the app it walks through.
    const needs = TOUR_FEATURES[id];
    if (needs && !this.requireFeature(needs)) return;
    if (id === "production") {
      if (this.workspace.appearance.desk !== "obs") this.setAppearance({ desk: "obs" });
    } else if (id === "audience") {
      const { audienceRoom } = await import("./rooms.svelte");
      audienceRoom.show();
      audienceRoom.tab = "questions";
      // The join code, the question switches and the game controls only exist with a room open.
      if (!audienceRoom.current && !audienceRoom.busy) void audienceRoom.start();
    } else if (id === "design") {
      this.openStudio(undefined, "templates");
    } else if (id === "pictures") {
      const { pictures } = await import("./pictures.svelte");
      pictures.show();
    } else if (id === "sound") {
      this.openSettings("audio");
    } else {
      if (this.workspace.appearance.desk !== "pewbeam") this.setAppearance({ desk: "pewbeam" });
      this.pageRequest = id;
    }
    this.tour = null;
    this.tourFrom = Math.max(0, from);
    // Let the page, desk or panel paint before the spotlight looks for its targets.
    setTimeout(() => (this.tour = id), 260);
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
  /** The end of setup: John 3:16 on Preview, and a note saying LIVE shows it. */
  showFirstVerse = async (translationId: string) => {
    const translation = this.translations.some((entry) => entry.id === translationId) ? translationId : (this.translations[0]?.id ?? "kjv");
    await this.previewPassage({ translationId: translation, bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 16, reference: "John 3:16" });
    this.notify(t("John 3:16 is on Preview"), { detail: t("Press LIVE (Space) to show it on the big screen. Then pick any verse, song or slide."), ms: 15_000 });
  };

  finishOnboarding = () => {
    this.workspace = { ...this.workspace, onboarded: true };
    this.persistSoon();
    // Finishing setup, or skipping it, starts the Premium trial on this computer.
    void this.autoStartTrial();
    // The logo slide on Program now carries the church name (and theme) chosen in setup.
    // While held at startup it is redrawn on the desk only.
    if (this.live.program.model.layout === "logo") {
      if (this.programHeld) this.live = applyProgramAction(this.live, "logo", this.theme(), { title: this.logoTitle(), imageUrl: this.logoImage() });
      else void this.logo();
    }
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
      this.message = t("{name} is ready.", { name: this.translations.find((entry) => entry.id === id)?.name ?? id });
    } catch (error) {
      this.warn(errorText(error, t("That translation could not be downloaded.")));
    } finally {
      this.bibleBusy = this.bibleBusy.filter((entry) => entry !== id);
    }
  };

  /** Install a Bible from a church's own file (Zefania, OSIS or OpenSong XML). Returns an error, or null. */
  importBibleFile = async (text: string, fileName: string): Promise<string | null> => {
    if (!this.desktop()) return t("Importing a Bible file needs the desktop app.");
    const bible = readBibleFile(text, fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    if (!bible) return t("Church Studio can't read this file as a Bible. Use a Zefania, OSIS or OpenSong XML file.");
    try {
      await api.bibleImport(bible);
      this.translations = await api.translations();
      this.message = t("{name} is ready: {n} verses in {books} books.", { name: bible.name, n: verseCount(bible), books: bible.books.length });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  removeBible = async (id: string) => {
    try {
      await api.bibleRemove(id);
      this.translations = await api.translations();
      this.message = t("Translation removed. Download it again any time.");
    } catch (error) {
      this.warn(errorText(error, t("That translation could not be removed.")));
    }
  };

  // Plans. `now` ticks once a minute so a trial ends on time without a restart.
  planClock = $state(Date.now());
  /** The feature the plans page is explaining (a locked feature was used), or null. */
  upgradeFor = $state<PlanFeature | null>(null);
  /** The full-screen plans page, opened from Settings or a "See plans" button. */
  paywallOpen = $state(false);

  /** Open the plans page (about one feature, if given). */
  openPlans = (feature: PlanFeature | null = null) => {
    this.upgradeFor = feature;
    this.paywallOpen = true;
  };

  get plan(): PlanId {
    void this.planClock;
    // Development builds keep the PREMIUM-TEST / CHURCH-TEST codes (never in a release build).
    const ent = this.workspace.entitlement;
    if (ent.source === "promo" && ent.plan !== "free") return ent.plan;
    // Otherwise only a lease signed by the license server grants a plan, checked by the native core.
    return this.ent.plan;
  }

  /** The native core's word on this computer's plan (src-tauri/src/entitlement.rs). */
  ent = $state<EntitlementStatus>(freeStatus());
  /** This computer's id for the license server (hashed hardware id on the desktop). */
  deviceId = $state("");
  /** Seats on the license key (for Settings › Computers on this license). */
  activation = $state<ActivationState>(idleActivation());
  /** True while the server runs its test checkout (no money moves). */
  billingTest = $state(false);

  private deviceName(): string {
    const platform = typeof navigator === "undefined" ? "" : /mac/i.test(navigator.platform) ? "Mac" : /win/i.test(navigator.platform) ? "Windows PC" : "Computer";
    return `${this.workspace.churchName.trim() || "Church Studio"} · ${platform || "Computer"}`.slice(0, 60);
  }

  private osName(): string {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    const os = /mac/i.test(platform) ? "macos" : /win/i.test(platform) ? "windows" : /linux/i.test(platform) ? "linux" : "other";
    // The browser demo counts apart from installed apps in the server's numbers.
    return this.desktop() ? os : `web-${os}`;
  }

  /** The browser and its major version ("Edge 129"), for the web version only: the admin page shows who uses which. */
  private browserName(): string {
    if (this.desktop() || typeof navigator === "undefined") return "";
    const agent = navigator.userAgent;
    // Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
    const browsers: Array<[string, RegExp]> = [["Edge", /Edg\/(\d+)/], ["Opera", /OPR\/(\d+)/], ["Firefox", /Firefox\/(\d+)/], ["Chrome", /Chrome\/(\d+)/], ["Safari", /Version\/(\d+).*Safari/]];
    for (const [name, pattern] of browsers) {
      const match = pattern.exec(agent);
      if (match) return `${name} ${match[1]}`;
    }
    return "Other";
  }

  /** Read the plan again from the native core (each minute, and after any change). */
  refreshEntitlement = async () => {
    try {
      this.ent = await api.entitlementStatus();
      if (this.ent.device) this.deviceId = this.ent.device;
      this.notePlanChange();
    } catch (error) {
      console.error(error);
    }
  };

  /** Set when the operator chose Free, so the change is not announced as an ending. */
  private planDropChosen = false;

  /**
   * A paid plan or trial ending on this computer is said once, with the way back (a trial runs
   * out, a license is refunded or not renewed). The last plan seen is kept across restarts.
   */
  private notePlanChange() {
    if (typeof localStorage === "undefined") return;
    const plan = this.plan;
    let last: string | null = null;
    try {
      last = localStorage.getItem("cs-last-plan");
      localStorage.setItem("cs-last-plan", `${plan}:${this.ent.kind ?? ""}`);
    } catch {
      return;
    }
    const [lastPlan, lastKind] = (last ?? "").split(":");
    if (!lastPlan || lastPlan === "free" || plan !== "free") return;
    if (this.planDropChosen) {
      this.planDropChosen = false;
      return;
    }
    const wasTrial = lastKind === "trial";
    this.notify(wasTrial ? t("Your Premium trial has ended") : t("Your plan is no longer active on this computer"), {
      detail: t("You are on Free now. Your songs, services and settings are all still here."),
      actions: [{ label: t("See plans"), run: () => { this.openPlans(); this.dismissToast(); } }],
      ms: 20_000,
    });
  }

  /** Keep a lease from the server (verified by the native core). */
  private keepLease = async (token: string): Promise<boolean> => {
    try {
      this.ent = await api.entitlementSet(token);
      this.planClock = Date.now();
      return true;
    } catch (error) {
      this.warn(errorText(error));
      return false;
    }
  };

  /**
   * Check in (anonymous, unless turned off in Settings › Privacy) with what was done since the last
   * time: how many services were run and scripture and songs shown, counts only.
   */
  private checkIn = async () => {
    if (this.workspace.shareUsage === false) return;
    const counts = usageCounts();
    const hello = await serverCall<{ now: number; test: boolean }>("/v1/hello", { device: this.deviceId, version: APP_VERSION, os: this.osName(), browser: this.browserName(), plan: this.plan, counts, ...(import.meta.env.DEV ? { dev: true } : {}) });
    if (!hello.ok) return;
    usageSent(counts);
    this.billingTest = hello.data.test === true;
    // The server's clock: the native core never lets this computer's clock trail it.
    if (typeof hello.data.now === "number") this.ent = await api.entitlementNoteTime(hello.data.now).catch(() => this.ent);
  };

  /**
   * At start: read the plan, check in, and renew the license's lease
   * when it is due. A computer offline keeps its plan until its lease asks for a check-in.
   */
  private bootEntitlement = async () => {
    this.deviceId = await api.entitlementDevice().catch(() => "");
    await this.refreshEntitlement();
    void this.startErrorReports();
    await this.checkIn();
    // While the app stays open (a Saturday rehearsal into Sunday morning), every few hours too.
    this.every(3 * 60 * 60_000, () => {
      void this.checkIn();
      void this.checkActivation(true);
    });
    // Asked every start, not only when the lease is nearly due: a licence moved to another
    // computer leaves this one at the next start, as Settings says.
    await this.checkActivation(true);
    // The cloud copy, once the plan and the seat are known.
    void this.cloudEngine().then((cloud) => cloud.start());
    // Offline too long: a paid plan must check in before its lease runs out; say so a week ahead.
    const renewBy = this.ent.kind === "license" ? (this.ent.renewBy ?? 0) : 0;
    const daysLeft = renewBy ? Math.ceil((renewBy - Date.now()) / 86_400_000) : Infinity;
    if (this.activation.status === "offline" && daysLeft <= 7 && daysLeft > 0) {
      this.notify(tn(daysLeft, "Connect to the internet within {n} day", "Connect to the internet within {n} days"), {
        detail: t("Church Studio checks your plan online now and then. Without it, this computer goes back to Free until it can check."),
        ms: 20_000,
      });
    }
    // Signed in, but not on a license yet (a plan bought on another computer): pick it up.
    if (this.workspace.profile?.token && this.ent.kind !== "license") await this.syncAccount();
    // Moving from a build that kept the trial on the computer: a trial still running there is
    // started again on the server (one per computer, so it cannot repeat).
    const old = this.workspace.entitlement.trialEndsAt;
    if (this.ent.plan === "free" && this.ent.kind === null && old && Date.parse(old) > Date.now()) await this.startTrial();
    // Setup finished offline: the trial it should have started starts now.
    if (readFlag(AUTO_TRIAL_KEY) === "pending") await this.autoStartTrial();
    this.nudgeTrialSignin();
  };

  /**
   * The trial that comes with a new install: started when setup ends (finished or skipped). Offline,
   * it waits for the next start with an internet connection. Never on a computer with a plan, or
   * one whose trial was used.
   */
  private autoStartTrial = async () => {
    // The browser is a demo: a browser has no lasting identity (clearing it makes a "new computer"),
    // so the trial is given only to the installed app.
    if (!this.desktop()) return;
    if (this.plan !== "free" || this.workspace.entitlement.trialUsed) {
      writeFlag(AUTO_TRIAL_KEY, null);
      return;
    }
    writeFlag(AUTO_TRIAL_KEY, "pending");
    // Signed out: the trial waits for sign-in (onboarding and Settings › Account ask for it).
    if (!this.signedIn) return;
    const answer = await serverCall<{ lease: string; endsAt: number; days?: number }>("/v1/trial", this.trialRequest());
    if (!answer.ok) {
      if (answer.status === 403 || answer.status === 429) {
        writeFlag(AUTO_TRIAL_KEY, null);
        if (answer.status === 403) {
          this.workspace = { ...this.workspace, entitlement: { ...this.workspace.entitlement, trialUsed: true } };
          this.persistSoon();
        }
      }
      return;
    }
    writeFlag(AUTO_TRIAL_KEY, null);
    if (!(await this.keepLease(answer.data.lease))) return;
    this.workspace = { ...this.workspace, entitlement: { ...this.workspace.entitlement, trialUsed: true } };
    this.persistSoon();
    const days = answer.data.days ?? TRIAL_DAYS;
    this.notify(t("Premium is yours free for {n} days", { n: days }), {
      detail: t("Everything is unlocked, on any computer you sign in on."),
      ms: 20_000,
    });
  };

  /** What a trial request carries: this computer, and the account when signed in (one trial a person). */
  private trialRequest = (promo?: string) => ({ device: this.deviceId, name: this.deviceName(), os: this.osName(), ...(this.workspace.profile?.token ? { token: this.workspace.profile.token } : {}), ...(promo ? { promo } : {}) });

  /**
   * On trial and not signed in: a reminder halfway through, and again two days before it ends, that
   * signing in keeps the trial and anything bought with this person (each said once).
   */
  private nudgeTrialSignin() {
    if (this.ent.kind !== "trial" || !this.ent.endsAt || this.workspace.profile?.token) return;
    const left = (this.ent.endsAt - Date.now()) / 86_400_000;
    const stage = left <= 2 ? "ending" : left <= TRIAL_DAYS / 2 ? "halfway" : null;
    if (!stage || readFlag(TRIAL_NUDGE_KEY) === stage || (stage === "halfway" && readFlag(TRIAL_NUDGE_KEY) === "ending")) return;
    writeFlag(TRIAL_NUDGE_KEY, stage);
    const days = Math.max(1, Math.ceil(left));
    this.notify(stage === "ending" ? tn(days, "Your trial ends in {n} day", "Your trial ends in {n} days") : tn(days, "{n} day left in your trial", "{n} days left in your trial"), {
      detail: t("Sign in so your trial, and any plan you choose, follow you to every computer."),
      ms: 30_000,
      actions: [{ label: t("Sign in"), run: () => { void this.startAccountSignin(); this.dismissToast(); } }],
    });
  }

  /** Renew the license key's lease when it is due (or now, with force). */
  checkActivation = async (force = false) => {
    const key = this.workspace.entitlement.source === "license" ? this.workspace.entitlement.license : null;
    if (!key) {
      this.activation = idleActivation();
      return;
    }
    const due = this.ent.kind !== "license" || this.ent.reason !== null || (this.ent.renewBy ?? 0) - Date.now() < RENEW_EARLY_DAYS * 86_400_000;
    if (!force && !due) return;
    this.activation = { ...this.activation, status: "checking" };
    const answer = await serverCall<{ seats: number; devices: ActivatedDevice[]; lease: string }>("/v1/activate", { key, device: this.deviceId, name: this.deviceName(), ...(this.workspace.profile?.token ? { token: this.workspace.profile.token } : {}) });
    if (answer.ok) {
      await this.keepLease(answer.data.lease);
      this.activation = { status: "ok", seats: answer.data.seats, devices: answer.data.devices, message: "" };
      void this.cloudEngine().then((cloud) => cloud.resume());
      return;
    }
    const data = answer.data as { seats?: number; devices?: ActivatedDevice[]; revoked?: boolean; ended?: boolean; moved?: boolean; to?: string };
    const status = activationFrom(answer.status, answer.data, answer.offline);
    this.activation = { status, seats: Number(data.seats) || 0, devices: Array.isArray(data.devices) ? data.devices : [], message: answer.error, ...(status === "moved" ? { movedTo: typeof data.to === "string" ? data.to : "" } : {}) };
    // A refunded or ended key stops here: no new lease, and the old one is let go.
    if (data.revoked || data.ended) this.ent = await api.entitlementClear().catch(() => this.ent);
    // The licence moved to another computer (or was released from this one): Free from now, and
    // said once, with everything the church made left in place.
    if (status === "moved") {
      const hadPlan = this.plan !== "free";
      const plan = this.ent.plan === "church" ? "Church" : "Premium";
      this.ent = await api.entitlementClear().catch(() => this.ent);
      if (hadPlan) {
        this.notify(data.to ? t("{plan} moved to {name}", { plan, name: data.to }) : t("{plan} was released from this computer", { plan }), {
          detail: t("This computer is on Free now. Your songs, services and slides are still here. To use {plan} here again, move it back in Settings › Account.", { plan }),
          ms: 20_000,
        });
      }
    }
  };

  /** Move the licence from another of its computers to this one; that one goes back to Free at its next check-in. */
  moveLicenseHere = async (from: string) => {
    const key = this.workspace.entitlement.license;
    if (!key) return;
    this.activation = { ...this.activation, status: "checking" };
    const answer = await serverCall<{ seats: number; devices: ActivatedDevice[]; lease: string }>("/v1/move", { key, device: this.deviceId, name: this.deviceName(), from, ...(this.workspace.profile?.token ? { token: this.workspace.profile.token } : {}) });
    if (answer.ok) {
      await this.keepLease(answer.data.lease);
      this.activation = { status: "ok", seats: answer.data.seats, devices: answer.data.devices, message: "" };
      this.notify(t("{plan} is on this computer now", { plan: this.ent.plan === "church" ? "Church" : "Premium" }));
      return;
    }
    // Refused (too many moves, a computer no longer listed, no connection): the list stays as it
    // was, with the reason under its heading.
    const data = answer.data as { seats?: number; devices?: ActivatedDevice[] };
    const before = this.activation.status === "moved" ? "moved" : "full";
    this.activation = { ...this.activation, status: answer.offline ? "offline" : before, seats: Number(data.seats) || this.activation.seats, devices: Array.isArray(data.devices) ? data.devices : this.activation.devices, message: answer.error };
  };

  /** Free a computer's place on the license (this one or another). */
  releaseDevice = async (device: string) => {
    const key = this.workspace.entitlement.license;
    if (!key) return;
    const answer = await serverCall<{ seats: number; devices: ActivatedDevice[] }>("/v1/release", { key, device });
    if (!answer.ok) {
      this.activation = { ...this.activation, message: answer.error };
      return;
    }
    if (device === this.deviceId) {
      this.ent = await api.entitlementClear().catch(() => this.ent);
      this.activation = { status: "full", seats: answer.data.seats, devices: answer.data.devices, message: t("This computer was released from the license.") };
    } else await this.checkActivation(true);
  };

  /** Whole days left in a running trial (rounded up), else 0. */
  get trialDays(): number {
    void this.planClock;
    if (this.ent.kind !== "trial" || this.ent.plan === "free" || !this.ent.endsAt) return 0;
    return Math.max(0, Math.ceil((this.ent.endsAt - Date.now()) / 86_400_000));
  }

  /** The free trial was used on this computer (the server says so; shown, not trusted). */
  get trialUsed(): boolean {
    return this.workspace.entitlement.trialUsed || this.ent.kind === "trial";
  }

  entitled = (feature: PlanFeature): boolean => planIncludes(this.plan, feature);

  /** True when the plan includes the feature; otherwise opens the upgrade prompt and returns false. */
  /** Listening on Premium, or within the Free plan's minutes this month; otherwise the upgrade prompt. */
  voiceAllowed = (): boolean => {
    if (this.entitled("voice")) return true;
    if (listenAllowance(this.workspace.listenUsage).leftSeconds > 0) return true;
    this.upgradeFor = "voice";
    return false;
  };

  /** Free listening left this month in minutes, or null on a plan with voice. */
  get freeListenMinutes(): number | null {
    return this.entitled("voice") ? null : Math.ceil(listenAllowance(this.workspace.listenUsage).leftSeconds / 60);
  }

  private listenTick = { at: 0, pending: 0 };

  /** Count Free-plan listening; at the end of the month's minutes, listening stops with a note. */
  private countListening() {
    const now = Date.now();
    const last = this.listenTick.at;
    this.listenTick.at = now;
    if (this.voice.status !== "listening" || this.entitled("voice") || !last) return;
    this.listenTick.pending += Math.min(1000, now - last);
    if (this.listenTick.pending < 10_000) return;
    const { usage } = listenAllowance(this.workspace.listenUsage);
    const next = { month: usage.month, seconds: usage.seconds + Math.round(this.listenTick.pending / 1000) };
    this.listenTick.pending = 0;
    this.workspace = { ...this.workspace, listenUsage: next };
    this.persistSoon();
    if (listenAllowance(next).leftSeconds <= 0) {
      this.stopVoice(t("This month's {minutes} free minutes of listening are used. Premium listens without a limit.", { minutes: FREE_LISTEN_MINUTES }));
      this.upgradeFor = "voice";
    }
  }

  requireFeature = (feature: PlanFeature): boolean => {
    if (this.entitled(feature)) return true;
    this.upgradeFor = feature;
    return false;
  };

  /** Local sign-in: a name and email on this computer only (the development test user). */
  signIn = (name: string, email: string): string | null => {
    if (!validEmail(email)) return "Type a valid email address.";
    this.workspace = { ...this.workspace, profile: sanitizeProfile({ name, email }) };
    this.persistSoon();
    this.message = t("Signed in as {name}.", { name: this.workspace.profile?.name });
    return null;
  };

  signOut = () => {
    const token = this.workspace.profile?.token;
    if (token) void serverCall("/v1/account/signout", { token });
    this.cancelAccountSignin();
    this.accountLicenses = [];
    this.signedInComputers = null;
    this.workspace = { ...this.workspace, profile: null };
    this.persistSoon();
    this.message = t("Signed out. Your library stays on this computer.");
  };

  // Signing in to an account: the browser does the signing in (Google, Microsoft, Apple or an
  // emailed link). On the desktop the browser then comes back to this app on 127.0.0.1 with a
  // one-time code that only this app can use (it holds the PKCE verifier); from another device, or
  // in the browser version, the person types the code shown here instead. The plan follows the
  // account, so a second computer needs no key.

  /** A sign-in waiting in the browser: "browser" comes back by itself, "code" shows a code to type. */
  accountSignin = $state<{ id: string; url: string; mode: "browser" | "code"; code?: string; status: "waiting" | "error"; message?: string } | null>(null);
  private signinTimer: ReturnType<typeof setTimeout> | undefined;
  private signinUnlisten: UnlistenFn | null = null;
  /** What to carry on with once signed in (a trial or a key asked for while signed out). */
  private afterSignin: { kind: "trial"; promo?: string } | { kind: "key"; code: string } | null = null;

  get signedIn(): boolean {
    return !!this.workspace.profile?.token;
  }

  /**
   * Open the sign-in page in the browser and wait for it. Returns an error to show, or null.
   * `elsewhere`: sign in from another device (or a browser that cannot come back here), with a code.
   */
  startAccountSignin = async (elsewhere = false): Promise<string | null> => {
    this.cancelAccountSignin();
    // The browser version, already signed in to this browser: nothing more to ask.
    if (!this.desktop() && !elsewhere && (await this.browserSignin())) return null;
    const loopback = this.desktop() && !elsewhere;
    const pkce = loopback ? await pkcePair() : null;
    const port = loopback ? await invoke<number>("signin_listen").catch(() => null) : null;
    // The listener could not start (a firewall): the code works everywhere.
    const mode = loopback && port ? "loopback" : "code";
    const answer = await serverCall<SigninStart>("/v1/signin/start", {
      device: this.deviceId,
      name: this.deviceName(),
      mode,
      ...(mode === "loopback" && pkce ? { redirect: `http://127.0.0.1:${port}/signin`, challenge: pkce.challenge } : {}),
    });
    if (!answer.ok) return answer.offline ? t("Connect to the internet to sign in.") : answer.error;
    const { id, url, secret, expiresAt } = answer.data;
    this.accountSignin = { id, url, mode: mode === "loopback" ? "browser" : "code", ...(answer.data.code ? { code: answer.data.code } : {}), status: "waiting" };
    await openExternal(url).catch(() => {});
    if (mode === "loopback" && pkce) {
      this.signinUnlisten = await listen<{ id: string; code: string }>("signin-callback", (event) => {
        if (event.payload.id !== id || this.accountSignin?.id !== id) return;
        void this.finishLoopback(id, event.payload.code, pkce.verifier);
      });
      this.signinTimer = setTimeout(() => {
        if (this.accountSignin?.id === id) this.accountSignin = { ...this.accountSignin, status: "error", message: t("That sign-in ended before it finished. Try again.") };
      }, Math.max(0, expiresAt - Date.now()));
    } else this.watchSignin(id, secret, expiresAt);
    return null;
  };

  private finishLoopback = async (id: string, code: string, verifier: string) => {
    const answer = await serverCall<SigninToken>("/v1/signin/token", { id, code, verifier });
    if (this.accountSignin?.id !== id) return;
    if (!answer.ok) {
      this.accountSignin = { ...this.accountSignin, status: "error", message: answer.offline ? t("Connect to the internet to sign in.") : answer.error };
      return;
    }
    await this.finishSignin(answer.data.token, answer.data.account);
  };

  /** Signed in: keep the token, bring the account's plan here, and carry on with what was waiting. */
  private finishSignin = async (token: string, account: { email: string; name: string }) => {
    this.cancelAccountSignin();
    this.workspace = { ...this.workspace, profile: sanitizeProfile({ ...account, token }) };
    this.persistSoon();
    this.message = t("Signed in as {name}.", { name: this.workspace.profile?.name });
    await this.syncAccount();
    const next = this.afterSignin;
    this.afterSignin = null;
    if (next?.kind === "trial") {
      const problem = await this.startTrial(next.promo);
      if (problem) this.warn(problem);
    } else if (next?.kind === "key") {
      const problem = await this.redeemCode(next.code);
      if (problem) this.warn(problem);
    } else if (readFlag(AUTO_TRIAL_KEY) === "pending") void this.autoStartTrial();
  };

  /**
   * The browser version on the server's own address: sign in as whoever is signed in to this browser
   * (its session cookie), so signing in on the page that opened is enough, with no code to type.
   * False when nobody is, or the app is not served from the server (development).
   */
  private browserSignin = async (): Promise<boolean> => {
    if (this.desktop() || typeof location === "undefined") return false;
    const answer = await serverCall<SigninToken & { signedIn?: false }>("/v1/signin/browser", { device: this.deviceId, name: this.deviceName() }, location.origin);
    if (!answer.ok || !answer.data.token) return false;
    await this.finishSignin(answer.data.token, answer.data.account);
    return true;
  };

  private watchSignin(id: string, secret: string, expiresAt: number) {
    clearTimeout(this.signinTimer);
    this.signinTimer = setTimeout(async () => {
      if (this.accountSignin?.id !== id) return;
      if (await this.browserSignin()) return;
      const answer = await serverCall<SigninPoll>("/v1/signin/poll", { id, secret });
      if (this.accountSignin?.id !== id) return;
      if (answer.ok && answer.data.status === "done" && answer.data.token && answer.data.account) {
        await this.finishSignin(answer.data.token, answer.data.account);
        return;
      }
      const ended = answer.ok && answer.data.status !== "pending";
      if (ended || Date.now() > expiresAt) {
        this.accountSignin = { ...this.accountSignin, status: "error", message: t("That sign-in ended before it finished. Try again.") };
        return;
      }
      this.watchSignin(id, secret, expiresAt);
    }, 2000);
  }

  /** The account's licenses as the server last said (owned ones carry the people added to them). */
  accountLicenses = $state<AccountStatus["licenses"]>([]);
  /** Where this account is signed in, once asked for (Settings › Account). */
  signedInComputers = $state<SignedInComputer[] | null>(null);

  loadSignedInComputers = async (): Promise<string | null> => {
    const token = this.workspace.profile?.token;
    if (!token) return null;
    const answer = await serverCall<{ devices: SignedInComputer[] }>("/v1/account/devices", { token });
    if (!answer.ok) return answer.offline ? t("Connect to the internet to see where you are signed in.") : answer.error;
    this.signedInComputers = answer.data.devices;
    return null;
  };

  /** Sign another computer out of this account (by the id the list shows), or every other one. */
  signOutComputer = async (id: string | "others"): Promise<string | null> => {
    const token = this.workspace.profile?.token;
    if (!token) return null;
    const others = (this.signedInComputers ?? []).filter((entry) => !entry.you);
    for (const entry of id === "others" ? others : others.filter((item) => item.id === id)) {
      const answer = await serverCall("/v1/account/signout", { token, device: entry.id });
      if (!answer.ok) return answer.offline ? t("Connect to the internet to sign a computer out.") : answer.error;
    }
    return this.loadSignedInComputers();
  };

  /** The owner adds or removes a person (by email) on one of their licenses. */
  changeLicenseMembers = async (license: string, change: { add?: string; remove?: string }): Promise<string | null> => {
    const token = this.workspace.profile?.token;
    if (!token) return null;
    const answer = await serverCall<{ members: string[] }>("/v1/license/members", { token, license, ...change });
    if (!answer.ok) return answer.offline ? t("Connect to the internet to change who uses this license.") : answer.error;
    this.accountLicenses = this.accountLicenses.map((entry) => (entry.license === license ? { ...entry, members: answer.data.members } : entry));
    return null;
  };

  /** Open the waiting sign-in page again. */
  reopenAccountSignin = () => {
    if (this.accountSignin?.url) void openExternal(this.accountSignin.url).catch(() => {});
  };

  cancelAccountSignin = () => {
    clearTimeout(this.signinTimer);
    this.signinUnlisten?.();
    this.signinUnlisten = null;
    this.accountSignin = null;
  };

  /**
   * Ask the account for its plans: the best one with a free seat comes to this computer, with no
   * key to type. A computer already on its own license key keeps it. Returns what happened, to show.
   */
  syncAccount = async (): Promise<string | null> => {
    const token = this.workspace.profile?.token;
    if (!token) return null;
    const answer = await serverCall<AccountStatus>("/v1/account", { token, device: this.deviceId, name: this.deviceName() });
    if (!answer.ok) {
      if ((answer.data as { signedOut?: boolean }).signedOut && this.workspace.profile) {
        const { token: _dropped, ...rest } = this.workspace.profile;
        this.workspace = { ...this.workspace, profile: rest };
        this.persistSoon();
        return t("Your account signed out on this computer. Sign in again to use its plan.");
      }
      return answer.offline ? null : answer.error;
    }
    const { account, lease, activation } = answer.data;
    this.accountLicenses = answer.data.licenses;
    this.workspace = { ...this.workspace, profile: sanitizeProfile({ ...account, token }) };
    this.persistSoon();
    // A key added on this computer becomes part of the account, so signing in elsewhere brings it.
    const key = this.workspace.entitlement.source === "license" ? this.workspace.entitlement.license : null;
    if (key && this.ent.kind === "license" && this.plan !== "free") {
      const id = readLicense(key)?.id ?? null;
      const linked = answer.data.licenses.some((entry) => entry.license === id);
      if (!linked && (await serverCall("/v1/account/link", { token, key })).ok) {
        this.notify(t("Your {plan} plan is now on your account", { plan: this.plan === "church" ? "Church" : "Premium" }), { detail: t("Sign in on another computer and it comes along, with no key to type.") });
      }
      return null;
    }
    if (lease && activation?.key) {
      const entitlement = redeemCode(this.workspace.entitlement, activation.key, { now: Date.now() });
      if (entitlement.ok) this.workspace = { ...this.workspace, entitlement: entitlement.entitlement };
      this.persistSoon();
      await this.keepLease(lease);
      await this.checkActivation(true);
      this.message = t("Your account's {plan} plan is on this computer.", { plan: this.plan === "church" ? "Church" : "Premium" });
      return null;
    }
    if (activation?.status === 409) return t("Your account's plan is in use on all the computers it covers. Release one, then sign in again.");
    if (answer.data.licenses.length) return null;
    // No plan on the account: say what this computer has instead of a bare "no plan".
    if (this.ent.kind === "trial" && this.ent.endsAt) {
      const days = Math.max(1, Math.ceil((this.ent.endsAt - Date.now()) / 86_400_000));
      this.notify(t("Signed in as {name}", { name: account.name || account.email }), { detail: tn(days, "Your Premium trial is kept with your account: {n} day left.", "Your Premium trial is kept with your account: {n} days left.") });
    } else if (this.workspace.entitlement.source === "promo") {
      this.notify(t("Signed in as {name}", { name: account.name || account.email }), { detail: t("This computer uses a test code; the account itself has no plan yet.") });
    } else {
      this.notify(t("Signed in as {name}", { name: account.name || account.email }), { detail: t("No plan on this account yet. Plans has Premium and Church."), actions: [{ label: t("See plans"), run: () => { this.upgradeFor = "production"; this.dismissToast(); } }] });
    }
    return null;
  };

  /**
   * Add a license key (or a test code in development): the server checks it, counts this computer
   * and returns a lease. Returns an error to show, or null on success.
   */
  redeemCode = async (code: string): Promise<string | null> => {
    const result = redeemCode(this.workspace.entitlement, code, { now: Date.now() });
    if (!result.ok) return result.error;
    if (result.entitlement.source !== "license") {
      // A development test code: no server.
      this.workspace = { ...this.workspace, entitlement: result.entitlement };
      this.planClock = Date.now();
      this.persistSoon();
      this.message = t("License added: {note}.", { note: result.note });
      return null;
    }
    // A key belongs to the person adding it (or the owner adds them): signing in comes first.
    if (!this.signedIn) {
      this.afterSignin = { kind: "key", code };
      const problem = await this.startAccountSignin();
      return problem ?? t("Sign in in your browser to add this key. It is added as soon as you are signed in.");
    }
    const answer = await serverCall<{ seats: number; devices: ActivatedDevice[]; lease: string }>("/v1/activate", { key: result.entitlement.license, device: this.deviceId, name: this.deviceName(), token: this.workspace.profile?.token });
    if (!answer.ok) {
      if ((answer.data as { owned?: boolean }).owned) return answer.error;
      const refused = activationFrom(answer.status, answer.data, answer.offline);
      if (refused === "full" || refused === "moved") {
        this.workspace = { ...this.workspace, entitlement: result.entitlement };
        this.persistSoon();
        const data = answer.data as { seats?: number; devices?: ActivatedDevice[]; to?: string };
        this.activation = { status: refused, seats: Number(data.seats) || 0, devices: Array.isArray(data.devices) ? data.devices : [], message: refused === "moved" ? answer.error : "", ...(refused === "moved" ? { movedTo: typeof data.to === "string" ? data.to : "" } : {}) };
        // A lease this computer still holds from before the move is let go: Free from now.
        if (refused === "moved") this.ent = await api.entitlementClear().catch(() => this.ent);
        return refused === "moved" ? answer.error : t("This key is in use on all the computers it covers. Move it here below, or release a computer, then check again.");
      }
      return answer.offline ? t("Connect to the internet once to add the key; after that it works offline.") : answer.error;
    }
    this.workspace = { ...this.workspace, entitlement: result.entitlement };
    this.persistSoon();
    await this.keepLease(answer.data.lease);
    this.activation = { status: "ok", seats: answer.data.seats, devices: answer.data.devices, message: "" };
    this.message = t("License added: {note}.", { note: result.note });
    return null;
  };

  /** Return to Free: removes a license key (or test code) from this computer. */
  useFreePlan = async () => {
    this.planDropChosen = true;
    const key = this.workspace.entitlement.license;
    if (key) void serverCall("/v1/release", { key, device: this.deviceId });
    this.workspace = { ...this.workspace, entitlement: dropToFree(this.workspace.entitlement) };
    this.persistSoon();
    this.ent = await api.entitlementClear().catch(() => this.ent);
    this.activation = idleActivation();
    this.message = t("Now on Free.");
  };

  /** Start the free trial: one per computer, given by the server. Returns an error to show, or null. */
  startTrial = async (promo?: string): Promise<string | null> => {
    if (!this.desktop()) return t("The free Premium trial is in the desktop app. Download it from church-studio.heitechinc.com to try Premium.");
    // One trial a person: signing in is what makes that hold. The trial starts once signed in.
    if (!this.signedIn) {
      this.afterSignin = { kind: "trial", promo };
      const problem = await this.startAccountSignin();
      return problem ?? t("Sign in in your browser to start your free trial. It stays with you on any computer.");
    }
    const answer = await serverCall<{ lease: string; endsAt: number; days?: number }>("/v1/trial", this.trialRequest(promo));
    if (!answer.ok) {
      if (answer.status === 403) {
        this.workspace = { ...this.workspace, entitlement: { ...this.workspace.entitlement, trialUsed: true } };
        this.persistSoon();
        return /account/.test(answer.error) ? t("The free trial has already been used on this account.") : t("The free trial has already been used on this computer.");
      }
      if (answer.status === 429) return t("Too many trials started from this network today. Try again tomorrow.");
      return answer.offline ? t("Connect to the internet to start the trial.") : answer.error;
    }
    if (!(await this.keepLease(answer.data.lease))) return this.message;
    this.workspace = { ...this.workspace, entitlement: { ...this.workspace.entitlement, trialUsed: true } };
    this.persistSoon();
    this.message = t("Premium trial started: {TRIAL_DAYS} days on this computer.", { TRIAL_DAYS: answer.data.days ?? TRIAL_DAYS });
    return null;
  };

  // Paying from the app: the server opens a checkout, the app waits for it, then keeps the key and
  // the lease it gets back. No key to copy from an email.

  /** The checkout opened in the browser, while the app waits for it. */
  checkout = $state<{ session: string; url: string; plan: PlanId; status: "waiting" | "paid" | "cancelled" | "error"; key?: string; message?: string } | null>(null);
  private checkoutTimer: ReturnType<typeof setTimeout> | undefined;

  /** A promo code's worth for a plan, from the server. */
  checkPromo = async (code: string, plan: "premium" | "church", interval: Interval): Promise<PromoResult | { ok: false; reason: "offline" }> => {
    const answer = await serverCall<PromoResult>("/v1/promo", { code, plan, interval });
    return answer.ok ? answer.data : { ok: false, reason: "offline" };
  };

  /** Open a checkout for a plan; the app then waits for the payment. Returns an error, or null. */
  buy = async (input: { plan: "premium" | "church"; interval: Interval; email: string; name: string; promo?: string }): Promise<string | null> => {
    const token = this.workspace.profile?.token;
    const answer = await serverCall<CheckoutStart>("/v1/checkout", { ...input, device: this.deviceId, ...(token ? { token } : {}) });
    if (!answer.ok) return answer.error;
    this.billingTest = answer.data.test;
    this.checkout = { session: answer.data.session, url: answer.data.url, plan: input.plan, status: "waiting" };
    await openExternal(answer.data.url).catch(() => {});
    this.watchCheckout(answer.data.session, Date.now());
    return null;
  };

  private watchCheckout(session: string, startedAt: number) {
    clearTimeout(this.checkoutTimer);
    this.checkoutTimer = setTimeout(async () => {
      if (this.checkout?.session !== session || this.checkout.status !== "waiting") return;
      // Dismissed while the server was answering: the checkout window stays closed.
      const stillOpen = () => this.checkout?.session === session ? this.checkout : null;
      try {
        const answer = await serverCall<CheckoutPoll>("/v1/checkout/status", { session, device: this.deviceId, name: this.deviceName() });
        if (answer.ok && answer.data.status === "paid" && answer.data.key) {
          // Paid is kept even when the window was dismissed: the church paid for it.
          const entitlement = redeemCode(this.workspace.entitlement, answer.data.key, { now: Date.now() });
          if (entitlement.ok) this.workspace = { ...this.workspace, entitlement: entitlement.entitlement };
          this.persistSoon();
          if (answer.data.lease) await this.keepLease(answer.data.lease);
          else await this.checkActivation(true);
          const open = stillOpen();
          if (open) this.checkout = { ...open, status: "paid", key: answer.data.key };
          this.message = t("Payment received. Welcome to {plan}!", { plan: this.plan === "church" ? "Church" : "Premium" });
          return;
        }
        const open = stillOpen();
        if (!open) return;
        if (answer.ok && answer.data.status === "cancelled") {
          this.checkout = { ...open, status: "cancelled" };
          return;
        }
        if (Date.now() - startedAt > CHECKOUT_WAIT_MS) {
          this.checkout = { ...open, status: "error", message: t("The checkout took too long. If you paid, your key is in your email.") };
          return;
        }
      } catch (error) {
        console.error(error);
        if (!stillOpen()) return;
      }
      this.watchCheckout(session, startedAt);
    }, 2500);
  }

  /** Open the waiting checkout's page again. */
  reopenCheckout = () => {
    if (this.checkout?.url) void openExternal(this.checkout.url).catch(() => {});
  };

  /** Stop waiting for a checkout. */
  dismissCheckout = () => {
    clearTimeout(this.checkoutTimer);
    this.checkout = null;
  };

  /** Anonymous daily check-in on or off (Settings › Privacy). */
  setShareUsage = (on: boolean) => {
    this.workspace = { ...this.workspace, shareUsage: on };
    this.persistSoon();
    setReportsAllowed(on);
  };

  /** Anonymous error reports (telemetry.ts), under the same Privacy switch as the check-in. */
  private startErrorReports = async () => {
    const allowed = this.workspace.shareUsage !== false;
    await startReports({ version: APP_VERSION, device: this.deviceId, os: this.osName(), allowed });
    if (allowed && this.desktop()) {
      const [crashes, tail] = await Promise.all([invoke<string>("crash_log").catch(() => ""), invoke<string>("diagnostic_log").catch(() => "")]);
      reportCrashLog(crashes, localStorage, tail);
    }
  };

  // Updates: checked quietly after start and every six hours; the desk offers one when it is ready,
  // and installing waits until nothing is live on the audience screen.

  /** An update downloaded from the release feed, waiting for the operator. */
  availableUpdate = $state<{ version: string; notes: string } | null>(null);
  /** The operator chose Later for this version: the desk stops offering it until next start. */
  updateDismissed = $state<string | null>(null);
  updateBusy = $state(false);
  private pendingUpdate: { version: string; downloadAndInstall: () => Promise<void> } | null = null;

  /** Ask the release feed. Returns what to show (quiet checks show nothing when up to date). */
  checkForUpdate = async (quiet = false): Promise<string> => {
    if (!this.desktop()) return "";
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) return quiet ? "" : t("You have the latest version.");
      this.pendingUpdate = update;
      this.availableUpdate = { version: update.version, notes: update.body ?? "" };
      return t("Church Studio {version} is ready. Install it after the service.", { version: update.version });
    } catch (error) {
      return quiet ? "" : `${t("Updates could not be checked.")} ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  // --- Cloud sync: one library across the licence's computers (src/lib/app/cloud.svelte.ts) ---------

  /** The engine, once loaded (its own chunk, fetched on first use so the desk starts light). */
  cloud = $state<CloudSync | null>(null);
  private cloudLoading: Promise<CloudSync> | null = null;
  /** Pending refreshes after the cloud wrote records here, done once a moment later. */
  private cloudTouched = new Set<"songs" | "services" | "sermons" | "themes">();
  private cloudRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  cloudEngine = (): Promise<CloudSync> => {
    if (this.cloud) return Promise.resolve(this.cloud);
    if (!this.cloudLoading) this.cloudLoading = this.makeCloud().then((engine) => (this.cloud = engine));
    return this.cloudLoading;
  };

  private makeCloud = async (): Promise<CloudSync> => {
    const [{ CloudSync }, { cloudProtocol }] = await Promise.all([import("./cloud.svelte"), import("../sync/protocol")]);
    const identity = () => ({ token: this.workspace.profile?.token ?? "", device: this.deviceId, name: this.deviceName() });
    const touched = (what: "songs" | "services" | "sermons" | "themes") => {
      this.cloudTouched.add(what);
      clearTimeout(this.cloudRefreshTimer);
      this.cloudRefreshTimer = setTimeout(() => void this.refreshAfterCloud(), 300);
    };
    return new CloudSync({
      protocol: cloudProtocol(identity),
      commands: {
        hash: (id) => invoke("cloud_hash", { id }),
        upload: (id, url) => invoke("cloud_upload", { id, url, ...identity() }),
        download: (url, row) => invoke("cloud_download", { url, token: identity().token, device: identity().device, id: row.id, name: row.name, kind: row.kind, ext: row.ext, createdAt: row.createdAt }),
        readState: () => invoke<string>("cloud_state_read"),
        writeState: (text) => invoke("cloud_state_write", { text }),
      },
      library: {
        collect: async () => ({ ...(await this.exportLibrary()), sermons: await api.sermonList(), workspace: this.workspace }),
        apply: {
          song: async (doc, id) => {
            await (doc ? api.songSave(doc) : api.songDelete(id));
            touched("songs");
          },
          service: async (doc, id) => {
            await (doc ? api.serviceSave(doc) : api.serviceDelete(id));
            touched("services");
          },
          sermon: async (doc, id) => {
            await (doc ? api.sermonSave(doc) : api.sermonDelete(id));
            touched("sermons");
          },
          theme: async (doc, id) => {
            await (doc ? api.themeSave(doc) : api.themeDelete(id));
            touched("themes");
          },
          workspace: (patch) => {
            this.workspace = patch(this.workspace);
            this.persistSoon();
          },
        },
        mediaIds: async () => new Set(this.#allMedia.map((asset) => asset.id)),
      },
      gate: () => (!this.desktop() ? "off" : !this.signedIn ? "signedOut" : this.plan === "free" ? "free" : "ok"),
      now: () => Date.now(),
      name: () => this.deviceName(),
    });
  };

  /** What the cloud wrote here is read back into the desk's lists (and Media, for files that came down). */
  private refreshAfterCloud = async () => {
    const what = new Set(this.cloudTouched);
    this.cloudTouched.clear();
    if (what.has("songs")) this.songs = await api.songList();
    if (what.has("services")) this.services = await api.serviceList();
    if (what.has("sermons")) this.sermons = await api.sermonList();
    if (what.has("themes")) this.themes = await api.themeList();
    this.media = await api.mediaList();
  };

  /** Install the waiting update and restart. Returns an error to show, or never returns (restart). */
  installUpdate = async (): Promise<string> => {
    if (!this.pendingUpdate) return "";
    if (this.output.online && this.live.program.model.layout !== "empty") {
      return t("Something is live on the audience screen. Clear it, then install, so the screen does not go dark mid-service.");
    }
    this.updateBusy = true;
    try {
      await this.flushSave();
      await this.pendingUpdate.downloadAndInstall().catch(async (error: unknown) => {
        // A newer release came out since the check (its file is gone): ask again and take that one.
        if (!/404/.test(error instanceof Error ? error.message : String(error))) throw error;
        const { check } = await import("@tauri-apps/plugin-updater");
        const fresh = await check();
        if (!fresh) throw error;
        this.pendingUpdate = fresh;
        this.availableUpdate = { version: fresh.version, notes: fresh.body ?? "" };
        await fresh.downloadAndInstall();
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
      return "";
    } catch (error) {
      this.updateBusy = false;
      return `${t("The update could not be installed.")} ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  dismissUpdate = () => {
    this.updateDismissed = this.availableUpdate?.version ?? null;
  };

  private watchUpdates() {
    if (!this.desktop() || typeof window === "undefined") return;
    setTimeout(() => void this.checkForUpdate(true), 30_000);
    this.every(6 * 60 * 60_000, () => void this.checkForUpdate(true));
  }

  // What's new: this version's highlights, once, the first time it opens after an update.

  whatsNew = $state<Release | null>(null);

  private noteVersion() {
    if (typeof localStorage === "undefined") return;
    try {
      const seen = localStorage.getItem("cs-seen-version");
      // Setup introduces a first install; an update shows its highlights once.
      this.whatsNew = this.workspace.onboarded ? whatsNewFor(APP_VERSION, seen) : null;
      localStorage.setItem("cs-seen-version", APP_VERSION);
    } catch {
      // Storage blocked: no card.
    }
  }

  dismissWhatsNew = () => {
    this.whatsNew = null;
  };

  /** The What's new card for this version, asked for (Go to anything › What's new). */
  showWhatsNew = () => {
    this.whatsNew = CHANGELOG[0] ?? null;
  };

  /** Packs shipped with the app (static/song-packs/index.json). Missing or broken index: none. */
  loadSongPacks = async () => {
    try {
      const response = await fetch("song-packs/index.json", { cache: "no-store" });
      this.songPacks = response.ok ? sanitizeSongPacks(await response.json()) : [];
    } catch {
      this.songPacks = [];
    }
  };

  /** Install a pack into its folder. Its songs are copies the church can edit. */
  installSongPack = async (pack: SongPack): Promise<boolean> => {
    try {
      const response = await fetch(`song-packs/${pack.file}`);
      if (!response.ok) throw new Error(t("{name} is not available.", { name: pack.name }));
      const decoder = new TextDecoder();
      const files = (await readZip(new Uint8Array(await response.arrayBuffer())))
        .filter((entry) => /\.(xml|txt|cho|chordpro|usr)$/i.test(entry.name))
        .map((entry) => ({ name: entry.name.split("/").pop() ?? entry.name, text: decoder.decode(entry.data) }));
      const result = await this.importSongFiles(files, pack.folder);
      this.workspace = { ...this.workspace, installedPacks: [...new Set([...this.workspace.installedPacks, pack.id])] };
      this.persistSoon();
      this.message = t("{name}: {songs} added to {folder}.", { name: pack.name, songs: tn(result.added, "{n} song", "{n} songs"), folder: pack.folder });
      return true;
    } catch (error) {
      this.warn(errorText(error, t("{name} could not be installed.", { name: pack.name })));
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
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.songs = await api.songList();
    this.message = clean ? t("{title} moved to {folder}.", { title: song.title, folder: clean }) : t("{title} removed from its folder.", { title: song.title });
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
      void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
      added += 1;
    }
    this.songs = await api.songList();
    const imported = clean ? tn(added, "{n} song imported to {folder}.", "{n} songs imported to {folder}.", { folder: clean }) : tn(added, "{n} song imported.", "{n} songs imported.");
    this.message = skipped.length ? `${imported} ${tn(skipped.length, "{n} file had no lyrics.", "{n} files had no lyrics.")}` : imported;
    return { added, skipped };
  };

  /** Save songs already read (ProPresenter, EasyWorship) into a folder. Returns how many were added. */
  importSongs = async (songs: Song[], folder: string): Promise<number> => {
    const clean = cleanFolder(folder);
    if (clean) this.createSongFolder(clean);
    let added = 0;
    for (const song of songs) {
      const ready = sanitizeSong({ ...song, folder: clean });
      if (songError(ready)) continue;
      await api.songSave(ready);
      void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
      added += 1;
    }
    this.songs = await api.songList();
    return added;
  };

  deleteSong = async (id: string) => {
    await api.songDelete(id);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.songs = await api.songList();
    if (this.songFocus?.songId === id) {
      this.songFocus = null;
      this.warn(t("That song is no longer available."));
      this.previewModel(emptyModel(this.theme()), null);
    }
  };

  searchSongs = async (query: string) => {
    this.songs = query.trim() ? await api.songSearch(query) : await api.songList();
  };

  previewSermonSection = async (sermon: Sermon, sectionId: string | null) => {
    if (!this.requireFeature("sermon")) return;
    const clean = sanitizeSermon(sermon);
    const section = clean.sections.find((entry) => entry.id === sectionId) ?? clean.sections[0];
    if (!section) {
      this.message = t("This sermon has no sections.");
      return;
    }
    this.sermonFocus = { sermonId: clean.id, sectionId: section.id };
    this.previewBible = null;
    this.library = "sermon";
    const item = sermonAudienceItem(section);
    const model = await this.modelFor(item);
    this.previewModel(model, `sermon:${clean.id}:${section.id}`);
    this.message = deskNotes(clean, section.id)
      ? t("Notes are on the desk. LIVE still sends Program.")
      : t("Preview the section, then LIVE.");
  };

  stepSermon = async (direction: 1 | -1): Promise<boolean> => {
    const focus = this.sermonFocus;
    if (!focus) return false;
    const sermon = this.sermons.find((entry) => entry.id === focus.sermonId);
    if (!sermon) {
      this.sermonFocus = null;
      this.warn(t("That sermon is no longer available."));
      this.previewModel(emptyModel(this.theme()), null);
      return false;
    }
    const next = stepSermonSection(sermon, focus.sectionId, direction);
    if (!next) return false;
    await this.previewSermonSection(sermon, next.id);
    return true;
  };

  saveSermon = async (sermon: Sermon): Promise<boolean> => {
    // The editor knows nothing of live notes: keep the ones being taken (or taken before).
    const kept = sermon.live ?? this.sermons.find((entry) => entry.id === sermon.id)?.live;
    const clean = sanitizeSermon({ ...sermon, ...(kept ? { live: kept } : {}), updatedAt: new Date().toISOString() });
    const error = sermonError(clean);
    if (error) {
      this.warn(error);
      return false;
    }
    await api.sermonSave(clean);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.sermons = await api.sermonList();
    if (this.sermonFocus?.sermonId === clean.id) void this.previewSermonSection(clean, this.sermonFocus.sectionId);
    this.message = t("{title} saved. Notes stay on the desk.", { title: clean.title });
    return true;
  };

  /** Save live notes as they come in, with no message: it happens every few seconds during a sermon. */
  private saveSermonQuietly = async (sermon: Sermon) => {
    const clean = sanitizeSermon({ ...sermon, updatedAt: new Date().toISOString() });
    await api.sermonSave(clean);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.sermons = this.sermons.some((entry) => entry.id === clean.id) ? this.sermons.map((entry) => (entry.id === clean.id ? clean : entry)) : [clean, ...this.sermons];
  };

  deleteSermon = async (id: string) => {
    await api.sermonDelete(id);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.sermons = await api.sermonList();
    if (this.sermonFocus?.sermonId === id) {
      this.sermonFocus = null;
      this.previewModel(emptyModel(this.theme()), null);
    }
    this.message = t("Sermon deleted.");
  };

  addSermonSection = (section: Sermon["sections"][number], title: string, sectionId?: string) => {
    if (!this.service) return;
    const target = (sectionId && this.service.sections.some((entry) => entry.id === sectionId) ? sectionId : null) ?? this.cursor.sectionId ?? this.service.sections[0]?.id;
    if (!target) {
      this.warn(t("Add a section first."));
      return;
    }
    const source = sermonAudienceItem(section);
    const item: PresentationItem = { ...source, id: uid(), title };
    this.insertItem(target, item);
    void this.selectItem(item.id);
  };

  /** The same notes formatted, when either part was written in the Formatted tab. */
  sermonDeskNotesRich = (): RichDoc | null => {
    const focus = this.sermonFocus;
    if (!focus) return null;
    const sermon = this.sermons.find((entry) => entry.id === focus.sermonId);
    return sermon ? deskNotesRich(sermon, focus.sectionId) : null;
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
    this.message = t("{label} is on Preview. LIVE still sends Program.", { label });
  };

  /** Open a feed for a camera source id. Errors become the desk camera note; Program is never touched. */
  private openFeed = (id: string): Promise<boolean> => {
    if (this.cameraFeeds[id]) return Promise.resolve(true);
    const pending = this.openingFeeds.get(id);
    if (pending) return pending;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      this.cameraNote = cameraUnavailableMessage();
      this.warn(this.cameraNote);
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
        this.warn(this.cameraNote);
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
    if (typeof window === "undefined" || (!this.stageOpen && !this.screensNeedStage())) return;
    const sermon = this.sermonFocus && this.sermons.find((entry) => entry.id === this.sermonFocus?.sermonId);
    const focused = sermon ? sermon.sections.find((section) => section.id === this.sermonFocus?.sectionId) : undefined;
    const notes = focused?.notes ?? "";
    const snapshot: StageSnapshot = {
      program: this.live.program.model,
      next: this.live.preview.model,
      live: this.output.online,
      desk: this.workspace.churchName,
      at: Date.now(),
      message: this.stageMessage,
      notes,
      ...(focused?.notesRich ? { notesRich: focused.notesRich } : {}),
      layout: this.workspace.stageLayout,
      section: this.stageSection(),
      ...(this.workspace.stageLayout.chords ? { chords: this.programChords() } : {}),
    };
    try {
      publishStageLocal(snapshot);
    } catch {
      // Storage full or blocked: the stage keeps its last frame.
    }
    if (isDesktop()) void emit("stage-frame", JSON.stringify(snapshot)).catch(() => {});
  };

  /** Chords for the song part on Program (the screen showing, line by line), transposed. */
  private programChords(): ChordLine[] {
    const match = /^song:([^:#]+):([^#]+)(?:#(\d+))?$/.exec(this.live.program.sourceId ?? "");
    if (!match) return [];
    const song = this.songs.find((entry) => entry.id === match[1]);
    const section = song?.sections.find((entry) => entry.id === match[2]);
    if (!song || !section?.chords) return [];
    const range = match[3] !== undefined ? this.songScreens(section)[Number(match[3])] : undefined;
    return stageChords(section, song.transpose ?? 0, range, song.sections.flatMap((entry) => entry.chords ?? []));
  }

  /** Move a song's chords up or down for the band (the audience screen never shows chords). */
  setSongTranspose = async (songId: string, semitones: number) => {
    const song = this.songs.find((entry) => entry.id === songId);
    if (!song) return;
    // Twelve semitones is the same key again, so it comes round to no change.
    const transpose = Math.round(semitones) % 12;
    const clean = sanitizeSong({ ...song, transpose });
    await api.songSave(clean);
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.songs = await api.songList();
    this.publishStage();
  };

  stageOpen = $state(false);
  /** A message on the stage screen until cleared. Never reaches the audience. */
  stageMessage = $state("");

  sendStageMessage = (text: string) => {
    this.stageMessage = text.trim().slice(0, 140);
    this.publishStage();
    this.message = this.stageMessage ? t("Stage now reads “{text}”.", { text: this.stageMessage }) : t("Stage message cleared.");
  };

  setStageLayout = (patch: Partial<StageLayout>) => {
    this.workspace = { ...this.workspace, stageLayout: { ...this.workspace.stageLayout, ...patch } };
    this.persistSoon();
    this.publishStage();
  };

  /** The alert on Program (nursery call, car lights…). Never on Preview. */
  alert = $state<ProgramAlert | null>(null);
  /** Alerts sent lately, kept with the workspace. */
  get recentAlerts(): string[] {
    return this.workspace.recentAlerts;
  }
  set recentAlerts(list: string[]) {
    this.workspace = { ...this.workspace, recentAlerts: list.slice(0, 12) };
    this.persistSoon();
  }
  private alertTimer: ReturnType<typeof setTimeout> | undefined;

  showAlert = async (input: { text: string; style: ProgramAlert["style"]; position: ProgramAlert["position"]; seconds: number | null }) => {
    const now = Date.now();
    const alert = sanitizeAlert({ text: input.text, style: input.style, position: input.position, until: input.seconds ? now + input.seconds * 1000 : null, id: `alert:${now}` }, now);
    if (!alert) {
      this.warn(t("Type the alert first."));
      return;
    }
    this.alert = alert;
    this.recentAlerts = [alert.text, ...this.recentAlerts.filter((text) => text !== alert.text)].slice(0, 6);
    clearTimeout(this.alertTimer);
    if (alert.until) this.alertTimer = setTimeout(() => void this.clearAlert(), alert.until - now);
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
    this.message = alert.until ? t("Alert on Program for {seconds} s.", { seconds: input.seconds }) : t("Alert on Program until you clear it.");
  };

  /** A Pictures slideshow is playing its own music: its picture changes do not fade it. */
  slideshowMusic = false;
  /** Music started with a slideshow's Test: a try, stopped when Pictures closes or anything goes LIVE. */
  musicAudition = false;

  endMusicAudition = () => {
    this.musicAudition = false;
    if (this.audio.playing) this.audio.fadeOut(1.5);
    else this.audio.stop();
  };

  /** A countdown over a Pictures slideshow ("Service starts in 4:59"), laid over each picture. */
  slideCountdown = $state<{ label: string; endsAt: number } | null>(null);
  /** A running slideshow's title across the top and clock in the corner (null: none). */
  slideBanner = $state<{ title: string; clock: boolean } | null>(null);

  setSlideBanner = async (banner: { title: string; clock: boolean } | null) => {
    const next = banner && (banner.title || banner.clock) ? banner : null;
    if (JSON.stringify(next) === JSON.stringify(this.slideBanner)) return;
    this.slideBanner = next;
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
  };

  /**
   * Something live that keeps changing (a game's answers coming in, its leaderboard): if this
   * source is on Program, its frame is replaced in place with no transition; on Preview, the same.
   */
  refreshSource = async (sourceId: string, model: PresentationModel) => {
    // Only when the frame has changed: a game polls every second, and an unchanged frame repainted
    // costs the desk a redraw (and restarted anything animating on it).
    const next = JSON.stringify(model);
    if (this.live.preview.sourceId === sourceId && JSON.stringify(this.live.preview.model) !== next) this.live = setPreview(this.live, frame(model, sourceId, "cut"));
    if (this.live.program.sourceId !== sourceId || JSON.stringify(this.live.program.model) === next) return;
    this.live = replaceProgramModel(this.live, model, "cut");
    await this.pushProgram();
  };

  setSlideCountdown = async (countdown: { label: string; endsAt: number } | null) => {
    this.slideCountdown = countdown;
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
  };

  /** Overlays that are on, stamped onto a Program frame (the same object back when nothing changes). */
  private withScreenOverlays = (model: PresentationModel): PresentationModel => {
    const painted = [...paintOverlays(this.workspace?.overlays ?? [], (id) => this.mediaSrc(id), this.service ? this.screenCountdown() : null), ...slideOverlays(model, this.slideCountdown, this.slideBanner)];
    if (painted.length === 0) {
      if (!model.overlays) return model;
      const { overlays: _gone, ...rest } = model;
      return rest;
    }
    if (model.overlays && JSON.stringify(model.overlays) === JSON.stringify(painted)) return model;
    return { ...model, overlays: painted };
  };

  /** Save overlays and repaint Program everywhere at once (a cut: overlays never fade with the content). */
  private setOverlays = async (overlays: ScreenOverlay[]) => {
    this.workspace = { ...this.workspace, overlays };
    this.persistSoon();
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
  };

  addOverlay = (kind: OverlayKind): string => {
    let overlay = newOverlay(kind, this.workspace.churchName);
    // A corner overlay starts in a corner no other corner overlay uses, so nothing hides.
    if (kind === "logo" || kind === "clock" || kind === "badge") {
      const taken = new Set(this.workspace.overlays.filter((entry) => entry.kind === "logo" || entry.kind === "clock" || entry.kind === "badge").map((entry) => entry.corner));
      const free = (["top-right", "top-left", "bottom-right", "bottom-left"] as const).find((corner) => !taken.has(corner));
      if (taken.has(overlay.corner) && free) overlay = { ...overlay, corner: free };
    }
    void this.setOverlays([...this.workspace.overlays, overlay]);
    return overlay.id;
  };

  updateOverlay = (id: string, patch: Partial<ScreenOverlay>) => {
    void this.setOverlays(sanitizeOverlays(this.workspace.overlays.map((overlay) => (overlay.id === id ? { ...overlay, ...patch, id } : overlay))));
  };

  toggleOverlay = (id: string, on?: boolean) => {
    const overlay = this.workspace.overlays.find((entry) => entry.id === id);
    if (!overlay) return;
    const next = on ?? !overlay.on;
    this.updateOverlay(id, { on: next });
    this.message = next ? t("{name} is on the screen.", { name: t(OVERLAY_KINDS.find((entry) => entry.kind === overlay.kind)?.label ?? "Overlay") }) : t("Overlay off.");
  };

  removeOverlay = (id: string) => {
    void this.setOverlays(this.workspace.overlays.filter((overlay) => overlay.id !== id));
  };

  /** Every overlay off at once. */
  clearOverlays = () => {
    if (!this.workspace.overlays.some((overlay) => overlay.on)) return;
    void this.setOverlays(this.workspace.overlays.map((overlay) => ({ ...overlay, on: false })));
    this.message = t("All overlays off.");
  };

  clearAlert = async () => {
    clearTimeout(this.alertTimer);
    if (!this.alert) return;
    this.alert = null;
    this.live = replaceProgramModel(this.live, this.live.program.model, "cut");
    await this.pushProgram();
    this.message = t("Alert cleared.");
  };
  /** Where the browser audience popup was placed, so the stage avoids it. */
  private audienceScreen: ScreenLike | null = null;

  /** Open the stage display: a popup in the browser, a separate window on desktop. Never Program. */
  // --- Screens: extra monitors, each with a job (Settings › Screens) ---------------------------

  /** Where each screen is now: showing on its monitor, waiting for it, or blocked. */
  screenPlaces = () => placeScreens(this.workspace.screens ?? [], this.output.displays, this.output.operatorKey);

  private screensNeedStage = () => (this.workspace.screens ?? []).some((screen) => screen.role === "stage" || screen.role === "timer");

  private saveScreens(screens: ScreenOutput[]) {
    this.workspace = { ...this.workspace, screens };
    this.persistSoon();
    this.broadcastScreens();
    this.publishStage();
    void this.placeScreenWindows();
  }

  /** Each screen's job now: its own, or what the running part gives it (locked screens keep theirs). */
  screensForNow = (): ScreenOutput[] => {
    const part = this.runningSectionId ? this.service?.sections.find((section) => section.id === this.runningSectionId) : undefined;
    return screensNow(this.workspace.screens ?? [], part?.screens);
  };

  /** Tell the screen windows what to show (the desk calls this as parts begin). */
  broadcastScreens = () => {
    const now = this.screensForNow();
    writeScreensLocal(now);
    if (isDesktop()) void emit("screens-config", now).catch(() => {});
  };

  /** A part's job for one screen while it runs (null: the screen's own job). */
  setPartScreen = (sectionId: string, screenId: string, role: ScreenRole | null) => {
    if (!this.service) return;
    this.service = {
      ...this.service,
      sections: this.service.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const { [screenId]: _old, ...rest } = section.screens ?? {};
        const screens = role ? { ...rest, [screenId]: role } : rest;
        return { ...section, screens: Object.keys(screens).length ? screens : undefined };
      }),
    };
    this.persistSoon();
    this.broadcastScreens();
  };

  addScreen = () => {
    if (!this.requireFeature("screens")) return;
    const screens = this.workspace.screens ?? [];
    if (screens.length >= MAX_SCREENS) return;
    const id = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    this.saveScreens([...screens, newScreen(screens, this.output.displays, this.output.operatorKey, id)]);
  };

  removeScreen = (id: string) => this.saveScreens((this.workspace.screens ?? []).filter((screen) => screen.id !== id));

  renameScreen = (id: string, name: string) => this.saveScreens((this.workspace.screens ?? []).map((screen) => (screen.id === id ? { ...screen, name: name.trim().slice(0, 40) } : screen)));

  setScreenDisplay = (id: string, displayKey: string | null) => this.saveScreens((this.workspace.screens ?? []).map((screen) => (screen.id === id ? { ...screen, displayKey } : screen)));

  /** Give a screen a job. A locked screen says so instead of changing. */
  setScreenRole = (id: string, role: ScreenRole): boolean => {
    const screens = this.workspace.screens ?? [];
    const index = screens.findIndex((screen) => screen.id === id);
    const target = screens[index];
    if (!target) return false;
    if (target.locked) {
      this.message = t("{name} is locked. Unlock it to change what it shows.", { name: target.name || t("Screen {letter}", { letter: screenLetter(index) }) });
      return false;
    }
    this.saveScreens(switchRole(screens, id, role));
    return true;
  };

  lockScreen = (id: string, locked: boolean) => this.saveScreens((this.workspace.screens ?? []).map((screen) => (screen.id === id ? { ...screen, locked } : screen)));

  /** Show each screen's letter and name on it for a few seconds. */
  identifyScreens = () => {
    if (isDesktop()) void emit("screens-identify").catch(() => {});
  };

  /** Open, move or close each screen's window to match its monitor. */
  private placingScreens = false;
  private placeScreenWindows = async () => {
    if (!isDesktop() || this.placingScreens) return;
    this.placingScreens = true;
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
      const screens = this.workspace.screens ?? [];
      const places = this.screenPlaces();
      const allowed = this.entitled("screens");
      for (const window of await WebviewWindow.getAll()) {
        if (!window.label.startsWith("screen-")) continue;
        const id = window.label.slice("screen-".length);
        if (!allowed || places.get(id)?.state !== "showing") await window.destroy().catch(() => {});
      }
      if (!allowed) return;
      writeScreensLocal(this.screensForNow());
      for (const screen of screens) {
        const place = places.get(screen.id);
        if (place?.state !== "showing") continue;
        const { x, y, width, height } = place.display;
        const existing = await WebviewWindow.getByLabel(`screen-${screen.id}`);
        if (existing) {
          await existing.setPosition(new LogicalPosition(x, y)).catch(() => {});
          await existing.setSize(new LogicalSize(width, height)).catch(() => {});
          continue;
        }
        const opened = new WebviewWindow(`screen-${screen.id}`, {
          url: `/?screen=${screen.id}`,
          title: screen.name || "Screen",
          x,
          y,
          width,
          height,
          decorations: false,
          resizable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          focus: false,
          shadow: false,
        });
        opened.once("tauri://error", (event) => {
          this.warn(t("A screen could not open: {payload}", { payload: String(event.payload) }));
        });
      }
    } catch (error) {
      console.error("Screens could not be placed", error);
    } finally {
      this.placingScreens = false;
    }
  };

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
          this.warn(t("The stage display could not open: {payload}", { payload: String(event.payload) }));
        });
        this.message = target
          ? t("Stage display is on {display}. It shows Program and what is on Preview next.", { display: target.name })
          : t("Stage display opened. Drag it to the platform screen. It shows Program and what is on Preview next.");
      } catch (error) {
        this.warn(errorText(error, t("The stage display could not open.")));
      }
      return;
    }
    const placed = await this.stagePlacement();
    const opened = window.open("./?stage=1", "church-studio-stage", placed?.features ?? "popup=yes,width=1280,height=720");
    if (!opened) this.warn(t("The browser blocked the stage window. Allow pop-ups for this site, then try again."));
    else
      this.message = placed
        ? t("Stage display is on {display}. It shows Program and what is on Preview next.", { display: placed.label })
        : t("Stage display opened. Drag it to the platform screen. It shows Program and what is on Preview next.");
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
      const { existing, ...kept } = asset;
      this.media = [kept, ...this.media.filter((entry) => entry.id !== kept.id)];
      this.message = existing ? t("{name} is already in Media, so it was not saved twice.", { name: kept.name }) : t("{name} saved. Preview it, then LIVE.", { name: kept.name });
      return asset;
    } catch (error) {
      this.warn(errorText(error, t("The image was not saved.")));
      return null;
    }
  };

  /** The picture the Logo button shows: the church's own, else the Church Studio mark, unless set to words alone. */
  logoImage = (): string | null => {
    const own = this.mediaSrc(this.workspace.logoAssetId);
    if (own) return own;
    return this.workspace.logoPicture === "none" ? null : DEFAULT_LOGO_URL;
  };

  /** Logo picture: a media id, "default" (the Church Studio mark) or "none" (the words alone). */
  setLogoPicture = (choice: string) => {
    if (choice === "default" || choice === "none") {
      const { logoPicture: _old, ...rest } = this.workspace;
      this.workspace = { ...rest, logoAssetId: null, ...(choice === "none" ? { logoPicture: "none" as const } : {}) };
      this.persistSoon();
      this.refreshLogoOnProgram();
      return;
    }
    this.setLogo(choice);
  };

  /** A logo already on Program changes with the setting. */
  private refreshLogoOnProgram() {
    if (this.live.program.model.layout === "logo") this.live = applyProgramAction(this.live, "logo", this.theme(), { title: this.logoTitle(), imageUrl: this.logoImage() });
  }

  setLogo = (assetId: string | null) => {
    this.workspace = { ...this.workspace, logoAssetId: assetId };
    this.refreshLogoOnProgram();
    this.persistSoon();
    this.message = t("Logo updated. Press Logo to send it to program.");
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
      this.warn(errorText(error));
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
    void this.cloudEngine().then((cloud) => cloud.scheduleSoon());
    this.themes = this.themes.filter((theme) => theme.id !== id);
    if (this.workspace.themeId === id) this.useTheme(this.themes[0]?.id ?? DEFAULT_THEME_ID);
    this.message = t("Theme deleted.");
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
    else {
      // Words on Preview take the new theme's photo (or lose the old one); pictures and looks keep theirs.
      const current = this.live.preview.model;
      const words = current.layout === "scripture" || current.layout === "lyrics" || current.layout === "title" || current.layout === "lower-third";
      const photo = next.background.type === "image" ? this.mediaSrc(next.background.assetId) : null;
      const model = words ? { ...current, theme: next, backgroundImageUrl: photo } : { ...current, theme: next };
      this.live = setPreview(this.live, frame(this.withBackdrop(model), this.live.preview.sourceId, "cut"));
    }
  }

  // Undo for Program: what it showed before the last LIVE, Cut, Clear, Clear words, Black or Logo.
  // ⌘Z (Ctrl+Z) puts it back; pressing it again swaps back, so an undo can be undone.

  private programBefore: { program: LiveState["program"]; held: boolean; look: Composition | null } | null = null;
  /** There is a Program change to undo. */
  canUndoProgram = $state(false);

  private rememberProgram() {
    this.programBefore = { program: this.live.program, held: this.programHeld, look: this.lookOnProgram };
    this.canUndoProgram = true;
  }

  undoProgram = async () => {
    const before = this.programBefore;
    if (!before) {
      this.warn(t("Nothing to undo on Program."));
      return;
    }
    if (!this.desktop() && !this.controlsAudience) {
      this.warn(t("This window is not sending to the audience."));
      return;
    }
    if (this.deckLoop) this.stopDeckLoop();
    // Keep what is showing now, so pressing Undo again brings it back.
    this.programBefore = { program: this.live.program, held: this.programHeld, look: this.lookOnProgram };
    this.live = restoreProgram(this.live, before.program);
    this.programHeld = before.held;
    this.lookOnProgram = before.look;
    await this.pushProgram();
    this.message = t("Program is back to what it showed before. Undo again to swap back.");
  };

  /** After a change that empties or blacks out the screen: a note with Undo. */
  private offerProgramUndo(label: string) {
    const key = shortcutLabelForUndo();
    this.notify(label, { detail: t("Undo puts back what was showing ({key}).", { key }), actions: [{ label: t("Undo"), run: () => { void this.undoProgram(); this.dismissToast(); } }] });
  }

  /** `transition`: this take's own (a slideshow's chosen one), instead of the theme's. */
  private act = async (action: "take" | "cut" | "clear" | "black" | "logo", transition?: ScreenTransition) => {
    if (action !== "take") this.takeMs = null;
    if (!this.desktop() && !this.controlsAudience) {
      this.warn(t("This window is not sending to the audience."));
      return;
    }
    // An empty Preview (a page with nothing staged yet) never clears the screen by accident.
    if ((action === "take" || action === "cut") && this.live.preview.model.layout === "empty") {
      this.warn(t("Nothing on Preview yet. Program did not change."));
      return;
    }
    // The operator taking over Program ends a running loop.
    if (this.deckLoop) this.stopDeckLoop();
    this.rememberProgram();
    this.releaseHold();
    const imageUrl = this.logoImage();
    const themeTransition = this.theme().transition;
    const takeTransition =
      action === "take"
        ? transition
          ? { type: transition }
          : takeTransitionForPreview(this.live.preview.sourceId, this.looksForTake(), themeTransition)
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
      this.live = { ...this.live, program: { ...this.live.program, model: { ...model, video: { ...model.video!, control: { playing: true, at: model.video!.start ?? 0, stamp: Date.now(), volume: 1 } } } } };
      this.videoEnded = null;
    }
    // The section of what went live has begun (the first time today).
    const fromPresenter = this.presenterPartId !== null && (this.deskPage !== "service" || this.workspace.appearance.desk !== "pewbeam");
    if ((action === "take" || action === "cut") && this.service && ((this.cursor.itemId && this.live.program.sourceId === this.cursor.itemId) || fromPresenter)) {
      const section = fromPresenter ? this.service.sections.find((entry) => entry.id === this.presenterPartId) : this.service.sections.find((entry) => entry.items.some((item) => item.id === this.cursor.itemId));
      const today = new Date().toDateString();
      if (section && (this.sectionStartsDay !== today || this.sectionStarts[section.id] === undefined)) this.startSection(section.id);
    }
    // Walk-in music (a looping playlist) fades out when the service goes live; a backing track plays on,
    // and so does a slideshow's music while the slideshow changes its own pictures.
    const slideshowStep = this.slideshowMusic && (this.live.program.sourceId ?? "").startsWith("picture:");
    // Music heard with a slideshow's Test never plays on under the service, whatever Fade on LIVE says.
    if ((action === "take" || action === "cut") && this.musicAudition && !slideshowStep) this.endMusicAudition();
    if ((action === "take" || action === "cut") && this.workspace.audio.fadeOnLive && this.audio.playing && this.audio.loop && !slideshowStep) {
      this.audio.fadeOut(4);
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
    void this.followSongTrack();
    if (action === "take" || action === "cut") await this.followReading();
    else this.liveReading = null;
    // Remember the look that went live, so its verse can step on Program.
    this.lookOnProgram = action === "take" || action === "cut" ? this.lookAt("program") : null;
    await this.pushProgram();
    if (action === "clear") this.offerProgramUndo(t("Program cleared"));
    else if (action === "black") this.offerProgramUndo(t("Program is black"));
    this.quiet(
      action === "take"
        ? takeTransition?.type === "cut"
          ? t("Cut to program")
          : t("Live")
        : action === "cut"
          ? t("Cut to program")
          : action === "black"
            ? t("Program is black")
            : action === "logo"
              ? t("Logo is on program")
              : t("Program cleared"),
    );
  };

  /** Preview to Program. A slideshow names its own transition and length; otherwise the theme's or look's. */
  take = (transition?: ScreenTransition, ms?: number) => {
    // The same scrolling PDF on both: Program glides to Preview's place rather than fading.
    const { preview, program } = this.live;
    if (preview.sourceId?.startsWith("doc:") && preview.sourceId === program.sourceId && preview.model.document) {
      this.live = replaceProgramModel(this.live, preview.model, "cut");
      return this.pushProgram();
    }
    this.takeMs = transition && ms ? ms : null;
    return this.act("take", transition);
  };
  /** A take's own transition length (a slideshow's), used for that take's frame only. */
  private takeMs: number | null = null;
  cut = () => this.act("cut");
  clear = () => this.act("clear");

  /** Take the words off Program; the background, camera, picture or a look's other regions stay. */
  clearWords = async () => {
    if (!this.desktop() && !this.controlsAudience) {
      this.warn(t("This window is not sending to the audience."));
      return;
    }
    const model = withoutWords(this.live.program.model);
    if (!model) {
      this.warn(t("No words on the screen to clear."));
      return;
    }
    if (this.deckLoop) this.stopDeckLoop();
    this.rememberProgram();
    this.live = replaceProgramModel(this.live, model, "fade");
    await this.pushProgram();
    this.offerProgramUndo(t("Words cleared. The background stays."));
  };
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
      this.warn(t("This browser cannot list monitors. Open the audience window and drag it to the other display."));
      return;
    }
    try {
      this.output = await api.refreshDisplays();
      this.message = this.output.message;
    } catch (error) {
      this.warn(errorText(error, t("Displays could not be listed.")));
    }
  };

  setOutputMode = async (mode: "window" | "fullscreen") => {
    this.rememberOutput({ outputMode: mode });
    if (!this.desktop()) {
      this.output = { ...this.output, mode };
      this.message =
        mode === "fullscreen"
          ? t("On the audience window, choose Fill this screen. This browser cannot fullscreen another monitor from here.")
          : t("The audience window stays in a normal window.");
      return;
    }
    try {
      this.output = await api.setOutput(this.currentProfile()?.outputEnabled ?? false, mode);
      this.message = this.output.message;
    } catch (error) {
      this.warn(errorText(error, t("The audience window could not change mode.")));
    }
  };

  testOutput = async () => {
    if (!this.desktop()) {
      this.noteBrowserAudience();
      if (!this.output.online || !this.audienceWindow) {
        this.warn(t("Open the audience window before sending a test. Program was not changed."));
        return;
      }
      this.audienceWindow.postMessage({ type: "output-test" }, window.location.origin);
      this.message = t("Test pattern sent. Program was not changed.");
      return;
    }
    try {
      await api.testOutput();
      this.message = t("Test pattern sent. Program was not changed.");
    } catch (error) {
      this.warn(errorText(error, t("The test pattern could not be sent. Program was not changed.")));
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
    this.outputWaiting = false;
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
      this.warn(errorText(error, t("The audience window could not be opened.")));
    }
  };

  closeAudience = async () => {
    this.outputWaiting = false;
    this.outputHeldClosed = true;
    this.rememberOutput({ outputEnabled: false });
    await this.persist();
    if (!this.desktop()) {
      this.audienceWindow?.close();
      this.audienceWindow = null;
      this.output = { ...this.output, desired: false, online: false, displayName: "", message: t("Audience output is closed.") };
      this.message = this.output.message;
      return;
    }
    try {
      this.output = await api.setOutput(false, this.currentProfile()?.outputMode ?? "window");
      this.message = this.output.message;
    } catch (error) {
      this.warn(errorText(error, t("The audience window could not be closed.")));
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
    this.message = t("{name} saved.", { name: copy.name });
  };

  saveLayoutAs = (name: string) => {
    const layout = this.activeLayout();
    if (!layout || !name.trim()) return;
    const copy = duplicateLayout(layout, `layout-${crypto.randomUUID()}`, name);
    this.workspace = { ...this.workspace, layouts: [...this.workspace.layouts, copy], activeLayoutId: copy.id };
    this.persistSoon();
    this.message = t("{name} saved.", { name: copy.name });
  };

  deleteLayoutById = (id: string) => {
    const next = deleteLayout(this.workspace.layouts, id);
    if (!next) {
      this.message = t("Built-in workspaces stay in the list. Reset one to restore it.");
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
    this.message = t("{name} restored. Program was not changed.", { name: layout.name });
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
    this.message = t("Built-in workspaces restored.");
  };

  saveLayout = async () => {
    clearTimeout(this.saveTimer);
    await this.persist();
    this.message = t("Workspace saved.");
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
    if (name) this.message = was ? t("{name} removed from favorites.", { name }) : t("{name} added to favorites.", { name });
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

  /** Ready-made song lists (favorites, recently used, most sung, in this service). */
  get songLists() {
    const serviceSongIds = (this.service?.sections ?? []).flatMap((section) => section.items).flatMap((item) => (item.lyric ? [item.lyric.songId] : []));
    return songLists({
      songs: this.songs,
      favoriteIds: this.workspace.favorites.songs,
      sessionRecentIds: this.recentSongs.map((entry) => entry.songId),
      uses: this.workspace.songUses,
      serviceSongIds,
    });
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
    this.message = was ? t("{name} removed from favorites.", { name: item.reference }) : t("{name} added to favorites.", { name: item.reference });
  };

  isFavoritePassage = (item: Pick<BibleItem, "bookOrd" | "chapter" | "startVerse" | "endVerse">) => isFavoritePassage(this.workspace.favorites, item);

  /** The audience screen's shape. "auto" fills whatever screen the output is on. */
  setScreenShape = (shape: ScreenShape) => {
    this.setAppearance({ screenShape: sanitizeScreenShape(shape) });
    if (this.live.program.model.layout !== "empty") void this.pushProgram();
  };

  /** The audience screen's canvas in frame pixels, from its chosen or measured shape. */
  outputCanvas = () => {
    const appearance = this.workspace.appearance;
    return canvasFor(aspectFor(sanitizeScreenShape(appearance.screenShape), appearance.measuredAspect ?? null));
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
      this.warn(errorText(error));
    }
  };

  useDisplayProfile = async (id: string) => {
    if (!this.workspace.displayProfiles.some((profile) => profile.id === id)) return;
    this.workspace = { ...this.workspace, activeDisplayProfileId: id };
    this.persistSoon();
    try {
      await this.applyDisplays();
    } catch (error) {
      this.warn(errorText(error));
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
    this.message = t("{name} saved.", { name: copy.name });
  };

  deleteDisplayProfile = (id: string) => {
    const next = deleteProfile(this.workspace.displayProfiles, id);
    if (!next) {
      this.message = t("The built-in display profile stays on this computer.");
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
      case "clear-words":
        return this.clearWords();
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
      this.warn(t("There is no timer on Program."));
      return;
    }
    this.live = replaceProgramModel(this.live, model, "cut");
    await this.pushProgram();
    this.message = action === "pause" ? t("Timer paused") : action === "resume" ? t("Timer running") : t("Timer reset. Start it when ready.");
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
  logoPreview = (): PresentationModel => logoModel(this.theme(), this.logoTitle(), this.logoImage());
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
