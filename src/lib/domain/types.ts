export type TransitionKind = "cut" | "fade";

export type MotionId = "aurora" | "rays" | "bokeh" | "waves" | "stars" | "embers" | "clouds";

export type ThemeBackground =
  | { type: "color"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; assetId: string }
  | { type: "video"; assetId: string }
  | { type: "wash"; washId: string }
  /** An animated scene drawn in CSS (no file), tinted with one color over a base color. */
  | { type: "motion"; motionId: MotionId; tint: string; base: string };

export type ThemeLayout = "frame" | "lower-third";

export type Theme = {
  id: string;
  name: string;
  layout: ThemeLayout;
  background: ThemeBackground;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  vertical: "top" | "middle" | "bottom";
  margin: number;
  reference: { show: boolean; size: number; color: string };
  attribution: { show: boolean; size: number; color: string };
  transition: { type: TransitionKind; ms: number };
  /** Bold, italic, underline, uppercase and shadow for every frame using this theme. */
  effects?: TextStyle;
  /** Darken the background (0–0.8) so text reads over photos, video and motion. */
  dim?: number;
  /** A Premium library theme (animated, photo or video). */
  premium?: boolean;
  /** A panel behind the words: a box, frosted glass, a full-width band, or a broadcast bar. */
  panel?: ThemePanel;
};

export type ThemePanelStyle = "box" | "glass" | "band" | "bar";

export type ThemePanel = {
  style: ThemePanelStyle;
  color: string;
  /** 0–1. */
  opacity: number;
  /** Stripe or edge color (bar, box) and the reference tag. */
  accent: string;
  /** Show the reference as a colored tag, broadcast style. */
  tag: boolean;
};

/**
 * Per-item text styling on top of the theme. Every field is optional; absent fields keep the
 * theme's value. align + vertical together are the 9-point position (timers and clocks use it).
 */
export type TextStyle = {
  fontFamily?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  shadow?: boolean;
  align?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
};

export type PresentationLine = {
  text: string;
  marker?: string;
  /** The same line in a second language, shown under it (songs in two languages). */
  alt?: string;
};

export type PresentationLayout =
  | "scripture"
  | "lyrics"
  | "title"
  | "image"
  | "empty"
  | "black"
  | "logo"
  | "composition"
  | "timer"
  | "lower-third"
  | "video"
  | "qr"
  | "shape"
  | "web";

export type LayerBounds = { x: number; y: number; w: number; h: number };

export type PaintedLayer = {
  id: string;
  zIndex: number;
  opacity: number;
  bounds: LayerBounds;
  fit: "contain" | "cover" | "fill";
  sourceId: string;
  model: PresentationModel;
  /** Camera layers only: flip the video horizontally. */
  mirror?: boolean;
  /** A backing behind the layer so text reads over a camera or picture (CSS color). */
  backing?: string;
  /** How a region's edge shows on screen: a line around it, or a framed panel with rounded corners. */
  edge?: "line" | "framed";
  animation?: {
    entrance: string;
    exit: string;
    durationMs: number;
    easing: string;
  };
};

export type TimerPaint = {
  mode: "countdown" | "countup" | "clock" | "target";
  label: string;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  running: boolean;
  warningMs: number;
  targetAt: number | null;
};

export type PresentationModel = {
  layout: PresentationLayout;
  theme: Theme;
  reference: string | null;
  attribution: string | null;
  lines: PresentationLine[];
  imageUrl: string | null;
  backgroundImageUrl: string | null;
  /** A looping background video (theme background "video"), resolved to a playable URL. */
  backgroundVideoUrl?: string | null;
  layers?: PaintedLayer[];
  timer?: TimerPaint;
  /** Effects (bold, italic, …) after theme and item styles are merged; font/size/color/align live on theme. */
  style?: TextStyle;
  /** layout "video": the file to play. Operator monitors are always muted; the audience plays sound unless muted. */
  video?: { url: string; loop: boolean; muted: boolean; control?: VideoControl; start?: number; stop?: number; end?: import("./video-play").VideoEnd };
  /** layout "qr": a scannable code (giving, sign-up, Wi-Fi). */
  qr?: { data: string; style: "square" | "rounded" | "dots"; dark: string; light: string; caption: string };
  /** A web page shown live: a website, a YouTube or Vimeo player, Google Slides. */
  web?: { url: string; kind: import("./web").WebKind; label: string; zoom: number; mute: boolean };
  /** An alert riding on top of Program (never Preview), e.g. a nursery call. */
  alert?: ProgramAlert;
  /** Overlays that are on (logo bug, ticker, clock…), painted above everything on Program. */
  overlays?: import("./screen-overlays").PaintedOverlay[];
  /** CSS background for the whole frame (deck page gradients); wins over the theme. */
  fill?: string;
  /** layout "shape": a filled rectangle or ellipse. */
  shape?: { kind: "rect" | "ellipse"; fill: string; radius: number };
  /** An announcement laid out in one of its designs (layout "title"). */
  announcement?: import("./announcement").AnnouncementPaint;
  /** Scripture in a second translation, shown beside the first. */
  parallel?: { attribution: string | null; lines: PresentationLine[] };
};

/**
 * The operator's play state for a video on Program. Every window plays from the same clock:
 * position = at + (now - stamp) while playing, so the audience and monitors stay in step.
 */
export type VideoControl = { playing: boolean; at: number; stamp: number; volume: number };

/** Where a controlled video should be, in seconds, at a given time. */
export function videoPosition(control: VideoControl, now = Date.now()): number {
  return control.playing ? control.at + Math.max(0, now - control.stamp) / 1000 : control.at;
}

export type ProgramAlert = {
  id: string;
  text: string;
  style: "banner" | "ticker";
  position: "top" | "bottom";
  /** Epoch ms when it clears itself; null = until cleared. */
  until: number | null;
};

export type LiveFrame = {
  transition: TransitionKind;
  sourceId: string | null;
  model: PresentationModel;
};

export type LiveState = {
  preview: LiveFrame;
  program: LiveFrame;
  revision: number;
};

export type ProgramAction = "take" | "cut" | "clear" | "black" | "logo";

export const PROGRAM_ACTIONS: ProgramAction[] = ["take", "cut", "clear", "black", "logo"];

export type ItemKind = "bible" | "lyric" | "slide" | "image" | "video" | "announcement" | "composition" | "deck";

export type BibleItem = {
  translationId: string;
  bookOrd: number;
  chapter: number;
  startVerse: number;
  endVerse: number;
  reference: string;
};

export type PresentationItem = {
  id: string;
  kind: ItemKind | string;
  title: string;
  bible?: BibleItem;
  lyric?: { songId: string; sectionId: string };
  slide?: { heading: string; body: string; imageId: string | null };
  image?: { assetId: string };
  /** Trim (seconds) and what happens at the end; older items only have loop. */
  video?: { assetId: string; loop: boolean; muted: boolean; start?: number; stop?: number; end?: import("./video-play").VideoEnd };
  announcement?: import("./announcement").AnnouncementWords;
  deck?: { deckId: string };
  /** Text styling for slide and announcement items. */
  style?: TextStyle;
  composition?: { compositionId: string };
};

export type ServiceSection = {
  id: string;
  name: string;
  items: PresentationItem[];
  /** Planned length in minutes. */
  minutes?: number;
  /** Or: runs until this clock time ("11:00"). */
  until?: string;
};

export type Service = {
  id: string;
  name: string;
  sections: ServiceSection[];
  updatedAt: string;
  /** When the service starts ("08:00"). */
  startTime?: string;
};

export type Cursor = {
  sectionId: string | null;
  itemId: string | null;
};

export type SongSectionKind = "verse" | "chorus" | "bridge" | "tag";

export type SongSection = {
  id: string;
  kind: SongSectionKind;
  label: string;
  lines: string[];
  /** The section in the song's second language, line by line. */
  second?: string[];
};

export type Song = {
  id: string;
  title: string;
  author: string;
  sections: SongSection[];
  /** Library folder (Hymns, Worship, Christmas…). Absent: no folder. */
  folder?: string;
  /** CCLI song number, digits only. */
  ccli?: string;
  /** Copyright line as published, without the © sign (e.g. "2010 Some Publisher"). */
  copyright?: string;
  /** The order it is sung in, by section id, repeats allowed. Absent: the sections as written. */
  order?: string[];
  /** The name of the song's second language ("Twi", "Français"), when it has one. */
  secondLanguage?: string;
};

export type SermonSection = {
  id: string;
  name: string;
  notes: string;
  items: PresentationItem[];
};

export type Sermon = {
  id: string;
  title: string;
  speaker: string;
  notes: string;
  sections: SermonSection[];
  updatedAt: string;
};

export type MediaAsset = {
  id: string;
  name: string;
  path: string;
  kind: "image" | "video" | "audio";
  createdAt: string;
};

export type RecentPassage = BibleItem;

export type ShortcutAction = ProgramAction | "clear-words" | "previous" | "next" | "escape" | "focus" | "library" | "queue" | "find";

export type ShortcutMap = Record<ShortcutAction, string[]>;

export type PanelId =
  | "service"
  | "preview"
  | "program"
  | "bible"
  | "lyrics"
  | "slides"
  | "media"
  | "theme"
  | "controls";

export type RegionId = "left" | "center" | "right" | "bottom";

export type FloatGeometry = { x: number; y: number; width: number; height: number };

export type PanelPlacement = {
  panelId: PanelId;
  region: RegionId;
  floating: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  visible: boolean;
  collapsed: boolean;
};

export type RegionSizes = {
  left: number;
  right: number;
  bottom: number;
  centerSplit: number;
};

export type WorkspaceKind = "bible" | "production" | "simple" | "custom";

export type WorkspaceLayout = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  builtin: boolean;
  centerAxis: "column" | "row";
  regions: RegionSizes;
  activeTabs: Partial<Record<RegionId, PanelId>>;
  panels: PanelPlacement[];
  updatedAt: string;
};

export type OutputRole = "operator" | "audience" | "stage";

export type DisplayAssignment = Record<OutputRole, string | null>;

export type OutputMode = "window" | "fullscreen";

export type DisplayProfile = {
  id: string;
  name: string;
  builtin: boolean;
  assignments: DisplayAssignment;
  /** Opens the audience window on launch when true. Missing older profiles stay closed until Open. */
  outputEnabled: boolean;
  outputMode: OutputMode;
};

export type DeskStyle = "pewbeam" | "obs";

/** Operator chrome. Scripture themes are a separate record. */
export type OperatorTheme = "dark" | "vespers" | "nave" | "light";

/** Presenter Desk column sizes. Panel visibility stays on the workspace layout. */
/** Which monitors a Presenter Desk page shows. Program keeps running when its monitor is hidden. */
export type PewMonitors = { preview: boolean; program: boolean };
export type PewPage = "scriptures" | "songs" | "sermon" | "service";

export type PewDeskState = {
  focus: boolean;
  /** Each page chooses its own monitors. */
  monitors: Record<PewPage, PewMonitors>;
  columns: [number, number, number];
  librarySplit: number;
  stageSplit: number;
  programSplit: number;
};

export type ProductionLayout = {
  stage: [number, number, number];
  /** Scenes, Sources, Media, Controls. */
  docks: [number, number, number, number];
  /** Monitors row vs docks row, percent of the desk height. */
  rows: [number, number];
  /** Media dock (files, cameras, slides) shown. */
  mediaOpen: boolean;
};

export type AppearanceSettings = {
  theme: OperatorTheme;
  density: "compact" | "comfortable";
  scale: number;
  accent: string;
  desk: DeskStyle;
  /** Hold animated theme backgrounds still on this computer, for slower projector machines. */
  calm?: boolean;
  /** The audience screen's shape: "auto" fills whatever screen the output is on. */
  screenShape?: "auto" | "16:9" | "16:10" | "4:3" | "21:9" | "9:16";
  /** Width ÷ height the audience window last measured, so the desk matches it before it opens. */
  measuredAspect?: number;
  /** The desk's own words (menus, buttons, settings) on this computer. Unset: English, or the computer's language on a first run. */
  language?: import("../i18n/core").UiLanguage;
};

export type Workspace = {
  schemaVersion: 2;
  churchName: string;
  logoAssetId: string | null;
  logoText: string;
  themeId: string;
  lastServiceId: string | null;
  recent: RecentPassage[];
  /** Scriptures that have gone live, in order, to send back with one click. */
  goneLive: import("./gone-live").GoneLive[];
  cursor: Cursor;
  shortcuts: ShortcutMap | null;
  appearance: AppearanceSettings;
  pew: PewDeskState;
  production: ProductionLayout;
  activeLayoutId: string;
  layouts: WorkspaceLayout[];
  activeDisplayProfileId: string;
  displayProfiles: DisplayProfile[];
  /** Saved looks. Preview only until LIVE. */
  compositions: CompositionDocument[];
  /** A folder (often a cloud drive) that automatic backups go to, and the last backup time. */
  backup: { folder: string; lastAt: string };
  /** Planning Center Personal Access Token (kept on this computer). */
  pco: { appId: string; secret: string };
  /** The church's own AI service for sermon summaries (bring your own key). Kept on this computer. */
  ai: import("../ai/summarize").AiSettings;
  /** What the stage (confidence) screen shows. */
  stageLayout: import("../display/channel").StageLayout;
  /** A second translation shown beside the first on scripture slides, or null. */
  parallelTranslationId: string | null;
  /** Songs shown live, once per day, for CCLI copy reporting. */
  songUses: import("./song-usage").SongUse[];
  /** Licensed translations through the church's own API.Bible key. */
  onlineBibles: { key: string; bibles: import("../bible/online-bibles").OnlineBibleChoice[] };
  /** How far the operator got in each screen tour. */
  tours: import("../tour/steps").TourProgress;
  /** Layouts the church saved from its own looks ("Start from a layout"). */
  customLayouts: import("./composition").CompositionTemplate[];
  /** Shared sources. Scenes link to these by layer sourceKey. */
  sources: SharedSourceDocument[];
  /** Phones approved for the LAN remote. Only token hashes are stored. */
  remoteDevices: RemoteDeviceDocument[];
  /** Slide decks: named, multi-page, each page a canvas of layers. */
  decks: SlideDeckDocument[];
  /** Audio playlists (walk-in music, backing tracks). */
  playlists: import("./playlists").Playlist[];
  audio: import("./playlists").AudioSettings;
  /** A second audience screen with its own look (lobby, overflow room). */
  secondOutput: import("./second-output").SecondOutputSettings;
  /** Live captions on the screen and on phones. */
  captions: import("./captions").CaptionSettings;
  /** Size of the full-screen countdown, in frame pixels. */
  countdownSize: number;
  /** Beeps as a countdown runs out, on the operator's computer only. */
  timerSounds: import("./timer-cues").TimerSounds;
  /** Service templates: the usual parts of a service with their times. */
  serviceTemplates: import("./service-templates").ServiceTemplate[];
  /** Song parts used lately (Songs › Recently used). */
  recentSongs: import("./song-search").SongRecent[];
  /** Alert messages sent lately, to send again in one click. */
  recentAlerts: string[];
  /** The translation the Scriptures page was last on. */
  deskTranslationId: string | null;
  /** Songs with two languages: which to show on the screen. */
  songLanguage: import("./song").SongLanguage;
  /** Macros: one button for several steps. */
  macros: import("./macros").Macro[];
  voice: VoiceSettings;
  /** Song folders, kept even while empty. Songs name their folder in Song.folder. */
  songFolders: string[];
  /** Starred songs, verses, themes, layouts, looks and media, shown first in their lists. */
  favorites: import("./favorites").Favorites;
  /** Overlays the church has set up; each is switched on or off by itself. */
  overlays: import("./screen-overlays").ScreenOverlay[];
  /** The church's CCLI Church Copyright License number, shown with song copyright. */
  ccliLicense: string;
  /** Song pack ids already installed (static/song-packs), so they are not offered twice. */
  installedPacks: string[];
  /** Plan on this computer (Free, a Premium trial, or a purchased plan). See domain/plans. */
  entitlement: import("./plans").Entitlement;
  /** First-run setup finished or skipped. */
  onboarded: boolean;
  /** Who is signed in on this computer (local until accounts are online). */
  profile: { name: string; email: string } | null;
};

/** Voice command preferences. Program-changing commands still need Live voice commands each launch. */
export type VoiceSettings = {
  /** Spoken commands on at all (verse detection always runs while listening). */
  commands: boolean;
  /** Require "Studio …" before a command (off by default; plain phrases work). */
  wake: boolean;
  /** The operator chose the wake setting themselves. */
  wakeChosen?: boolean;
  custom: Array<{ phrase: string; action: string }>;
  /** Clean the microphone before listening: off, light (keeps some room) or strong. */
  noiseFilter?: NoiseFilter;
};

export type NoiseFilter = "off" | "light" | "strong";

export type SlideDeckDocument = {
  id: string;
  name: string;
  updatedAt: string;
  pages: unknown[];
};

export type RemoteDeviceDocument = {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: number;
  lastSeen: number;
  expiresAt: number;
};

/** Workspace-level source shared by scenes (OBS-style). `source` is a SourceRef. */
export type SharedSourceDocument = {
  id: string;
  name: string;
  source: { type: string; id: string; title: string; payload: Record<string, string> };
};

export type CompositionDocument = {
  id: string;
  name: string;
  locked?: boolean;
  /** Folder color in the Scenes list (#rrggbb). */
  color?: string;
  background?: unknown;
  canvas: { width: number; height: number };
  layers: unknown[];
  transition: { type: TransitionKind; ms: number };
};

export type ProgramPacket = {
  /** @deprecated Use sessionId and generation. Kept so older packets still parse. */
  epoch?: number;
  sessionId?: string;
  generation?: number;
  revision: number;
  transition: TransitionKind;
  transitionMs: number;
  frame: LiveFrame;
  /** Hold animated backgrounds still on the audience screen. */
  calm?: boolean;
  /** A chosen screen shape (width ÷ height); absent = fill the screen the window is on. */
  aspect?: number;
};

export type TranslationInfo = {
  id: string;
  name: string;
  abbreviation: string;
  licenseNote: string;
  source: string;
};

export type BookInfo = {
  ord: number;
  name: string;
  abbreviation: string;
  chapters: number;
};

export type VerseText = {
  verse: number;
  text: string;
};

export type SearchHit = {
  bookOrd: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
};

export type DisplayInfo = {
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  primary: boolean;
  audience: boolean;
};

export type OutputStatus = {
  desired: boolean;
  online: boolean;
  displayName: string;
  message: string;
  audienceKey: string | null;
  operatorKey: string | null;
  displays: DisplayInfo[];
  mode: OutputMode;
};
