import { displayWash } from "./backgrounds";
import { factoryProfiles } from "../display/profiles";
import { SCREEN_FONTS } from "./fonts";
import { factoryLayouts } from "../workspace/layout";
import { defaultPewDesk } from "../workspace/pew";
import { defaultProductionLayout } from "../workspace/production";
import type { AppearanceSettings, PresentationModel, Theme, Workspace } from "./types";

export const DEFAULT_THEME_ID = "theme-manuscript";
export const MIN_TRANSITION_MS = 0;
export const MAX_TRANSITION_MS = 2000;

export function sanitizeTransition(value: unknown): Theme["transition"] {
  const record = value && typeof value === "object" ? (value as { type?: unknown; ms?: unknown }) : {};
  const type = record.type === "cut" ? "cut" : "fade";
  const ms = typeof record.ms === "number" && Number.isFinite(record.ms) ? Math.round(record.ms) : 450;
  return { type, ms: Math.min(MAX_TRANSITION_MS, Math.max(MIN_TRANSITION_MS, ms)) };
}

function sanitizeBackground(background: Theme["background"]): Theme["background"] {
  if (background?.type === "wash" && displayWash(background.washId)) return background;
  if (background?.type === "image" && typeof background.assetId === "string" && background.assetId) return background;
  if (background?.type === "color" && typeof background.color === "string" && background.color) return background;
  return { type: "color", color: "#050505" };
}

/** Theme effects are booleans only; font, size, color and position live on the theme itself. */
function sanitizeEffects(value: Theme["effects"]): Theme["effects"] {
  if (!value || typeof value !== "object") return undefined;
  const effects: NonNullable<Theme["effects"]> = {};
  for (const flag of ["bold", "italic", "underline", "uppercase", "shadow"] as const) {
    if (typeof value[flag] === "boolean") effects[flag] = value[flag];
  }
  return Object.keys(effects).length ? effects : undefined;
}

export function sanitizeTheme(theme: Theme): Theme {
  return {
    ...theme,
    background: sanitizeBackground(theme.background),
    layout: theme.layout === "lower-third" ? "lower-third" : "frame",
    transition: sanitizeTransition(theme.transition),
    effects: sanitizeEffects(theme.effects),
  };
}

/** True when the control would persist a different transition than the one already stored. */
export function transitionChanged(current: Theme["transition"], kind: string, duration: number): boolean {
  const next = sanitizeTransition({ type: kind === "cut" ? "cut" : "fade", ms: Number(duration) });
  const stored = sanitizeTransition(current);
  return stored.type !== next.type || stored.ms !== next.ms;
}

const SERIF = SCREEN_FONTS[0].family;
const SANS = SCREEN_FONTS[1].family;
const INTER = SCREEN_FONTS[2].family;
const FIGTREE = SCREEN_FONTS[3].family;

function displayTheme(
  patch: Omit<Partial<Theme>, "reference" | "attribution"> & Pick<Theme, "id" | "name"> & {
    reference?: Partial<Theme["reference"]>;
    attribution?: Partial<Theme["attribution"]>;
  },
): Theme {
  const base = {
    id: DEFAULT_THEME_ID,
    name: "Signal",
    layout: "frame" as const,
    background: { type: "color" as const, color: "#050505" },
    fontFamily: INTER,
    fontSize: 64,
    color: "#E4E4E4",
    align: "center" as const,
    vertical: "middle" as const,
    margin: 96,
    reference: { show: true, size: 28, color: "#E2CC9D" },
    attribution: { show: true, size: 18, color: "#908D8A" },
    transition: { type: "fade" as const, ms: 450 },
  };
  return {
    ...base,
    ...patch,
    reference: { ...base.reference, ...patch.reference },
    attribution: { ...base.attribution, ...patch.attribution },
  };
}

export function defaultTheme(): Theme {
  return displayTheme({ id: DEFAULT_THEME_ID, name: "Signal" });
}

/** Built-in looks for the audience screen. A saved copy of one of these is left alone. */
export function factoryThemes(): Theme[] {
  return [
    defaultTheme(),
    displayTheme({
      id: "theme-manuscript-page",
      name: "Manuscript",
      background: { type: "color", color: "#f3ead7" },
      fontFamily: SERIF,
      fontSize: 58,
      color: "#24180f",
      margin: 110,
      reference: { size: 26, color: "#6b3f1f" },
      attribution: { color: "#8a735c" },
    }),
    displayTheme({
      id: "theme-vespers",
      name: "Vespers",
      background: { type: "color", color: "#100c09" },
      fontFamily: SERIF,
      fontSize: 66,
      color: "#f6f1e7",
      reference: { color: "#e2cc9d" },
      attribution: { color: "#a89880" },
    }),
    displayTheme({
      id: "theme-nave",
      name: "Nave",
      background: { type: "color", color: "#071018" },
      fontFamily: SANS,
      fontSize: 60,
      color: "#f4f7fb",
      reference: { color: "#b7c9de" },
      attribution: { color: "#8ea0b5" },
    }),
    displayTheme({
      id: "theme-day",
      name: "Day",
      background: { type: "color", color: "#f7f4ef" },
      fontFamily: FIGTREE,
      fontSize: 62,
      color: "#1c1917",
      reference: { color: "#8a4b12" },
      attribution: { color: "#6f675f" },
    }),
    displayTheme({
      id: "theme-caption",
      name: "Caption",
      layout: "lower-third",
      background: { type: "color", color: "#050505" },
      fontFamily: INTER,
      fontSize: 48,
      color: "#f5f5f5",
      vertical: "bottom",
      margin: 48,
      reference: { size: 22, color: "#e2cc9d" },
    }),
    displayTheme({
      id: "theme-dawn",
      name: "Dawn",
      background: { type: "wash", washId: "dawn" },
      fontFamily: SERIF,
      fontSize: 62,
      color: "#fff8ef",
      reference: { color: "#ffe0b8" },
      attribution: { color: "#f0d2b4" },
    }),
    displayTheme({
      id: "theme-sea",
      name: "Sea",
      background: { type: "wash", washId: "sea" },
      fontFamily: SANS,
      fontSize: 60,
      color: "#f4fbff",
      reference: { color: "#b7e4ea" },
      attribution: { color: "#9ec9d4" },
    }),
    displayTheme({
      id: "theme-ember",
      name: "Ember",
      background: { type: "wash", washId: "ember" },
      fontFamily: SANS,
      fontSize: 62,
      color: "#fff6ef",
      reference: { color: "#ffd0a8" },
      attribution: { color: "#e7b89a" },
    }),
    displayTheme({
      id: "theme-garden",
      name: "Garden",
      background: { type: "wash", washId: "garden" },
      fontFamily: SERIF,
      fontSize: 60,
      color: "#f3fff6",
      reference: { color: "#c6e6c4" },
      attribution: { color: "#b7d4b4" },
    }),
    displayTheme({
      id: "theme-glass",
      name: "Glass",
      background: { type: "wash", washId: "glass" },
      fontFamily: SANS,
      fontSize: 60,
      color: "#f6f3ff",
      reference: { color: "#d7c8ff" },
      attribution: { color: "#c4b6e6" },
    }),
  ];
}

/** Add any built-in theme the library does not already have. Keep edits to ones it does. */
export function mergeFactoryThemes(stored: Theme[]): Theme[] {
  const saved = new Map(stored.map((theme) => [theme.id, sanitizeTheme(theme)]));
  const factory = factoryThemes();
  const known = new Set(factory.map((theme) => theme.id));
  return [...factory.map((theme) => saved.get(theme.id) ?? theme), ...stored.filter((theme) => !known.has(theme.id)).map(sanitizeTheme)];
}

export function emptyCursor() {
  return { sectionId: null, itemId: null };
}

export function defaultAppearance(): AppearanceSettings {
  return { theme: "dark", density: "comfortable", scale: 1, accent: "#fa4f00", desk: "pewbeam" };
}

export function defaultWorkspace(): Workspace {
  const layouts = factoryLayouts();
  const displayProfiles = factoryProfiles();
  return {
    schemaVersion: 2,
    songFolders: [],
    churchName: "",
    logoAssetId: null,
    logoText: "Church Studio",
    themeId: DEFAULT_THEME_ID,
    lastServiceId: null,
    recent: [],
    cursor: emptyCursor(),
    shortcuts: null,
    appearance: defaultAppearance(),
    pew: defaultPewDesk(),
    production: defaultProductionLayout(),
    activeLayoutId: layouts[0].id,
    layouts,
    activeDisplayProfileId: displayProfiles[0].id,
    displayProfiles,
    compositions: [],
    sources: [],
    remoteDevices: [],
    voice: { commands: true, wake: true, custom: [] },
    decks: [],
  };
}

export function shellModel(theme: Theme, layout: PresentationModel["layout"], lines: PresentationModel["lines"] = []): PresentationModel {
  return {
    layout,
    theme,
    reference: null,
    attribution: null,
    lines,
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

export function emptyModel(theme: Theme): PresentationModel {
  return shellModel(theme, "empty");
}

export function blackModel(theme: Theme): PresentationModel {
  return shellModel(theme, "black");
}

export function logoModel(theme: Theme, title: string, imageUrl: string | null): PresentationModel {
  return {
    ...shellModel(theme, "logo", [{ text: title }]),
    imageUrl,
  };
}
