import { sanitizeSongLines } from "../domain/song-screens";
import { sanitizeMonitorNames, sanitizeScreens } from "../display/screens";
import type { AppearanceSettings, Cursor, DisplayProfile, OperatorTheme, ShortcutMap, Workspace, WorkspaceLayout } from "../domain/types";
import { sanitizePartDesks } from "../domain/service";
import { sanitizeUiLanguage } from "../i18n/core";
import { sanitizeTimerSounds } from "../domain/timer-cues";
import { sanitizeSwitcher } from "../integrations/switcher";
import { sanitizeBroadcast } from "../domain/broadcast";
import { factoryProfiles, normalizeProfile } from "../display/profiles";
import { sanitizeComposition, sanitizeLayouts } from "../domain/composition";
import { sanitizeSharedSource } from "../domain/sources";
import { sanitizeRemoteDevices } from "../domain/remote";
import { sanitizeVoiceSettings } from "../voice/commands";
import { sanitizeDeck } from "../domain/decks";
import { sanitizeGame } from "../domain/games";
import { MOST_REPORTS, sanitizeReport } from "../domain/game-report";
import { cleanCcli, sanitizeFolderNames } from "../domain/song";
import { sanitizeEntitlement, sanitizeProfile } from "../domain/plans";
import { defaultWorkspace } from "../domain/theme";
import { factoryLayouts, normalizeLayout } from "./layout";
import { defaultShortcuts } from "../keyboard/manager";
import { normalizePew } from "./pew";
import { normalizeProductionLayout } from "./production";
import { sanitizeTourProgress } from "../tour/steps";
import { sanitizeOnlineBibles } from "../bible/online-bibles";
import { sanitizeSongUses } from "../domain/song-usage";
import { sanitizeStageLayout } from "../display/channel";
import { cleanAspect, sanitizeScreenShape } from "../display/shape";
import { sanitizeFavorites } from "../domain/favorites";
import { sanitizeGoneLive } from "../domain/gone-live";
import { sanitizeAudioSettings, sanitizePlaylists } from "../domain/playlists";
import { sanitizeSecondOutput } from "../domain/second-output";
import { sanitizeCaptionSettings } from "../domain/captions";
import { sanitizeTemplates } from "../domain/service-templates";
import { sanitizeMacros } from "../domain/macros";
import { sanitizeOverlays } from "../domain/screen-overlays";
import { sanitizeAiSettings } from "../ai/summarize";

const SHORTCUTS = Object.keys(defaultShortcuts) as (keyof ShortcutMap)[];

export function sanitizeAccent(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#fa4f00";
}

export function clampScale(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1.35, Math.max(0.85, value));
}

const OPERATOR_THEMES: OperatorTheme[] = ["dark", "vespers", "nave", "light"];

function operatorTheme(value: string | undefined, base: OperatorTheme): OperatorTheme {
  return OPERATOR_THEMES.includes(value as OperatorTheme) ? (value as OperatorTheme) : base;
}

function appearance(value: Partial<AppearanceSettings> | undefined, base: AppearanceSettings): AppearanceSettings {
  return {
    theme: operatorTheme(value?.theme, base.theme),
    density: value?.density === "compact" ? "compact" : value?.density === "comfortable" ? "comfortable" : base.density,
    scale: value?.scale === undefined ? base.scale : clampScale(value.scale),
    accent: sanitizeAccent(value?.accent?.toLowerCase() === "#c6a15b" ? undefined : (value?.accent ?? base.accent)),
    desk: value?.desk === "obs" || value?.desk === "pewbeam" || value?.desk === "conductor" ? value.desk : base.desk,
    calm: value?.calm === true,
    // Stronger borders unless the operator switched them off themselves.
    contrast: value?.contrastChosen === true ? value.contrast === true : true,
    ...(value?.contrastChosen === true ? { contrastChosen: true } : {}),
    screenShape: sanitizeScreenShape(value?.screenShape),
    ...(value?.measuredAspect ? { measuredAspect: cleanAspect(value.measuredAspect) } : {}),
    ...(value?.language ? { language: sanitizeUiLanguage(value.language) } : {}),
  };
}

function shortcuts(value: unknown): ShortcutMap | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ShortcutMap>;
  const known = SHORTCUTS.filter((action) => Array.isArray(record[action]));
  if (known.length === 0) return null;
  const merged = { ...defaultShortcuts };
  for (const action of known) merged[action] = record[action] ?? defaultShortcuts[action];
  return merged;
}

function cursor(value: unknown, base: Cursor): Cursor {
  if (!value || typeof value !== "object") return base;
  const record = value as Cursor;
  return {
    sectionId: typeof record.sectionId === "string" || record.sectionId === null ? record.sectionId : null,
    itemId: typeof record.itemId === "string" || record.itemId === null ? record.itemId : null,
  };
}

export function normalizeWorkspace(input: unknown): Workspace {
  const base = defaultWorkspace();
  if (!input || typeof input !== "object") return base;
  const value = input as Partial<Workspace>;
  const layouts = Array.isArray(value.layouts)
    ? value.layouts.map(normalizeLayout).filter((layout): layout is WorkspaceLayout => layout !== null)
    : [];
  const safeLayouts = layouts.length > 0 ? layouts : factoryLayouts();
  const profiles = Array.isArray(value.displayProfiles)
    ? value.displayProfiles.map(normalizeProfile).filter((profile): profile is DisplayProfile => profile !== null)
    : [];
  const safeProfiles = profiles.length > 0 ? profiles : factoryProfiles();
  return {
    schemaVersion: 2,
    churchName: typeof value.churchName === "string" ? value.churchName : base.churchName,
    logoAssetId: typeof value.logoAssetId === "string" ? value.logoAssetId : null,
    ...(value.logoPicture === "none" ? { logoPicture: "none" as const } : {}),
    logoText: typeof value.logoText === "string" ? value.logoText : base.logoText,
    themeId: typeof value.themeId === "string" ? value.themeId : base.themeId,
    lastServiceId: typeof value.lastServiceId === "string" ? value.lastServiceId : null,
    recent: Array.isArray(value.recent) ? value.recent : [],
    goneLive: sanitizeGoneLive(value.goneLive),
    cursor: cursor(value.cursor, base.cursor),
    shortcuts: shortcuts(value.shortcuts),
    appearance: appearance(value.appearance, base.appearance),
    pew: normalizePew(value.pew),
    production: normalizeProductionLayout(value.production),
    layouts: safeLayouts,
    activeLayoutId: safeLayouts.some((layout) => layout.id === value.activeLayoutId) ? value.activeLayoutId! : safeLayouts[0].id,
    displayProfiles: safeProfiles,
    activeDisplayProfileId: safeProfiles.some((profile) => profile.id === value.activeDisplayProfileId)
      ? value.activeDisplayProfileId!
      : safeProfiles[0].id,
    compositions: Array.isArray(value.compositions)
      ? value.compositions.map((entry) => {
          const clean = sanitizeComposition(entry);
          return {
            id: clean.id,
            name: clean.name,
            locked: clean.locked,
            ...(clean.color ? { color: clean.color } : {}),
            ...(clean.background ? { background: clean.background } : {}),
            canvas: clean.canvas,
            layers: clean.layers,
            transition: clean.transition,
          };
        })
      : [],
    sources: Array.isArray(value.sources)
      ? value.sources.map(sanitizeSharedSource).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
    remoteDevices: sanitizeRemoteDevices(value.remoteDevices),
    voice: sanitizeVoiceSettings(value.voice),
    playlists: sanitizePlaylists(value.playlists),
    audio: sanitizeAudioSettings(value.audio),
    secondOutput: sanitizeSecondOutput(value.secondOutput),
    captions: sanitizeCaptionSettings(value.captions),
    serviceTemplates: sanitizeTemplates(value.serviceTemplates),
    recentSongs: Array.isArray(value.recentSongs)
      ? value.recentSongs
          .filter((entry): entry is { songId: string; sectionId: string } => !!entry && typeof entry.songId === "string" && typeof entry.sectionId === "string")
          .slice(0, 30)
      : [],
    recentAlerts: Array.isArray(value.recentAlerts) ? value.recentAlerts.filter((text): text is string => typeof text === "string" && text.trim().length > 0).map((text) => text.slice(0, 200)).slice(0, 12) : [],
    macros: sanitizeMacros(value.macros),
    songLanguage: value.songLanguage === "first" || value.songLanguage === "second" ? value.songLanguage : "both",
    songLines: sanitizeSongLines(value.songLines),
    deskTranslationId: typeof value.deskTranslationId === "string" && value.deskTranslationId ? value.deskTranslationId.slice(0, 120) : null,
    partDesks: sanitizePartDesks(value.partDesks),
    timerSounds: sanitizeTimerSounds(value.timerSounds),
    ndiAudio: value.ndiAudio !== false,
    shareUsage: value.shareUsage !== false,
    ...(typeof value.activationOkAt === "string" && !Number.isNaN(Date.parse(value.activationOkAt)) ? { activationOkAt: value.activationOkAt } : {}),
    ...(value.listenUsage && typeof value.listenUsage.month === "string" && typeof value.listenUsage.seconds === "number"
      ? { listenUsage: { month: value.listenUsage.month.slice(0, 7), seconds: Math.max(0, Math.round(value.listenUsage.seconds)) } }
      : {}),
    switcher: sanitizeSwitcher(value.switcher),
    broadcast: sanitizeBroadcast(value.broadcast),
    countdownSize: typeof value.countdownSize === "number" && Number.isFinite(value.countdownSize) ? Math.min(420, Math.max(96, Math.round(value.countdownSize))) : 220,
    games: Array.isArray(value.games) ? value.games.map(sanitizeGame).filter((entry): entry is NonNullable<typeof entry> => entry !== null).slice(0, 200) : [],
    hiddenGames: Array.isArray(value.hiddenGames) ? [...new Set(value.hiddenGames.filter((id: unknown): id is string => typeof id === "string" && id.startsWith("builtin:")))].slice(0, 100) : [],
    gameReports: Array.isArray(value.gameReports) ? value.gameReports.map(sanitizeReport).filter((entry): entry is NonNullable<typeof entry> => entry !== null).slice(0, MOST_REPORTS) : [],
    decks: Array.isArray(value.decks)
      ? value.decks.map(sanitizeDeck).filter((deck): deck is NonNullable<typeof deck> => deck !== null)
      : [],
    songFolders: sanitizeFolderNames(value.songFolders),
    favorites: sanitizeFavorites(value.favorites),
    overlays: sanitizeOverlays(value.overlays),
    ccliLicense: cleanCcli(value.ccliLicense),
    entitlement: sanitizeEntitlement(value.entitlement),
    profile: sanitizeProfile(value.profile),
    // Saved before setup existed: an existing church, so do not show first-run setup.
    onboarded: value.onboarded !== false,
    installedPacks: Array.isArray(value.installedPacks) ? value.installedPacks.filter((id): id is string => typeof id === "string").slice(0, 200) : [],
    customLayouts: sanitizeLayouts(value.customLayouts),
    tours: sanitizeTourProgress(value.tours),
    onlineBibles: sanitizeOnlineBibles(value.onlineBibles),
    songUses: sanitizeSongUses(value.songUses),
    stageLayout: sanitizeStageLayout(value.stageLayout),
    screens: sanitizeScreens(value.screens),
    monitorNames: sanitizeMonitorNames(value.monitorNames),
    backup: {
      folder: typeof value.backup?.folder === "string" ? value.backup.folder.slice(0, 1000) : "",
      lastAt: typeof value.backup?.lastAt === "string" ? value.backup.lastAt : "",
    },
    ai: sanitizeAiSettings(value.ai),
    pco: {
      appId: typeof value.pco?.appId === "string" ? value.pco.appId.trim().slice(0, 200) : "",
      secret: typeof value.pco?.secret === "string" ? value.pco.secret.trim().slice(0, 200) : "",
    },
    parallelTranslationId: typeof value.parallelTranslationId === "string" && value.parallelTranslationId ? value.parallelTranslationId.slice(0, 120) : null,
  };
}
