export type TransitionKind = "cut" | "fade";

export type ThemeBackground =
  | { type: "color"; color: string }
  | { type: "image"; assetId: string }
  | { type: "wash"; washId: string };

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
};

export type PresentationLine = {
  text: string;
  marker?: string;
};

export type PresentationLayout = "scripture" | "lyrics" | "title" | "image" | "empty" | "black" | "logo";

export type PresentationModel = {
  layout: PresentationLayout;
  theme: Theme;
  reference: string | null;
  attribution: string | null;
  lines: PresentationLine[];
  imageUrl: string | null;
  backgroundImageUrl: string | null;
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

export type ItemKind = "bible" | "lyric" | "slide" | "image" | "announcement";

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
  kind: ItemKind;
  title: string;
  bible?: BibleItem;
  lyric?: { songId: string; sectionId: string };
  slide?: { heading: string; body: string; imageId: string | null };
  image?: { assetId: string };
  announcement?: { heading: string; body: string };
};

export type ServiceSection = {
  id: string;
  name: string;
  items: PresentationItem[];
};

export type Service = {
  id: string;
  name: string;
  sections: ServiceSection[];
  updatedAt: string;
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
};

export type Song = {
  id: string;
  title: string;
  author: string;
  sections: SongSection[];
};

export type MediaAsset = {
  id: string;
  name: string;
  path: string;
  kind: "image";
  createdAt: string;
};

export type RecentPassage = BibleItem;

export type ShortcutAction = ProgramAction | "previous" | "next" | "escape" | "focus" | "library" | "queue" | "find";

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

/** PewBeam column sizes. Panel visibility stays on the workspace layout. */
export type PewDeskState = {
  focus: boolean;
  columns: [number, number, number];
  librarySplit: number;
  stageSplit: number;
  programSplit: number;
};

export type AppearanceSettings = {
  theme: OperatorTheme;
  density: "compact" | "comfortable";
  scale: number;
  accent: string;
  desk: DeskStyle;
};

export type Workspace = {
  schemaVersion: 2;
  churchName: string;
  logoAssetId: string | null;
  logoText: string;
  themeId: string;
  lastServiceId: string | null;
  recent: RecentPassage[];
  cursor: Cursor;
  shortcuts: ShortcutMap | null;
  appearance: AppearanceSettings;
  pew: PewDeskState;
  activeLayoutId: string;
  layouts: WorkspaceLayout[];
  activeDisplayProfileId: string;
  displayProfiles: DisplayProfile[];
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
