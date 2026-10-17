import { emptyTourProgress } from "../tour/steps";
import { displayWash, motionById } from "./backgrounds";
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

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback);

function sanitizeBackground(background: Theme["background"]): Theme["background"] {
  if (background?.type === "wash" && displayWash(background.washId)) return background;
  if ((background?.type === "image" || background?.type === "video") && typeof background.assetId === "string" && background.assetId) {
    return { type: background.type, assetId: background.assetId };
  }
  if (background?.type === "gradient") {
    const angle = typeof background.angle === "number" && Number.isFinite(background.angle) ? ((Math.round(background.angle) % 360) + 360) % 360 : 180;
    return { type: "gradient", from: hex(background.from, "#0b1020"), to: hex(background.to, "#1f2a44"), angle };
  }
  if (background?.type === "motion" && motionById(background.motionId)) {
    const motion = motionById(background.motionId)!;
    return { type: "motion", motionId: motion.id, tint: hex(background.tint, motion.tint), base: hex(background.base, motion.base) };
  }
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
    dim: typeof theme.dim === "number" && Number.isFinite(theme.dim) ? Math.min(0.8, Math.max(0, theme.dim)) : undefined,
    premium: theme.premium === true ? true : undefined,
    panel: sanitizePanel(theme.panel),
  };
}

const PANEL_STYLES = ["box", "glass", "band", "bar"] as const;

export function sanitizePanel(value: unknown): Theme["panel"] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!record || !PANEL_STYLES.includes(record.style as (typeof PANEL_STYLES)[number])) return undefined;
  const opacity = Number(record.opacity);
  return {
    style: record.style as (typeof PANEL_STYLES)[number],
    color: hex(record.color, "#050505"),
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.75,
    accent: hex(record.accent, "#fa4f00"),
    tag: record.tag === true,
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
    // Library themes (Premium): animated scenes and seasonal gradients.
    displayTheme({ id: "theme-aurora", name: "Aurora", premium: true, background: { type: "motion", motionId: "aurora", tint: "#3ee6b4", base: "#04121a" }, fontFamily: SANS, fontSize: 62, color: "#f2fffb", reference: { color: "#9cf2d6" }, attribution: { color: "#8ccfbd" } }),
    displayTheme({ id: "theme-candlelight", name: "Candlelight", premium: true, background: { type: "motion", motionId: "embers", tint: "#ff9a4a", base: "#0d0504" }, fontFamily: SERIF, fontSize: 64, color: "#fff4e6", reference: { color: "#ffcf96" }, attribution: { color: "#d9b08a" } }),
    displayTheme({ id: "theme-starfield", name: "Starfield", premium: true, background: { type: "motion", motionId: "stars", tint: "#e8f0ff", base: "#03050c" }, fontFamily: INTER, fontSize: 60, color: "#f4f7ff", reference: { color: "#b9c8ff" }, attribution: { color: "#8f9bc0" } }),
    displayTheme({ id: "theme-glory", name: "Glory rays", premium: true, background: { type: "motion", motionId: "rays", tint: "#ffd89a", base: "#140d06" }, fontFamily: SERIF, fontSize: 64, color: "#fffaf0", reference: { color: "#ffe2a8" }, attribution: { color: "#d8bf94" } }),
    displayTheme({ id: "theme-bokeh", name: "Bokeh", premium: true, background: { type: "motion", motionId: "bokeh", tint: "#b98cff", base: "#0c0716" }, fontFamily: FIGTREE, fontSize: 62, color: "#fbf7ff", reference: { color: "#dcc6ff" }, attribution: { color: "#b8a6d8" } }),
    displayTheme({ id: "theme-deep-sea", name: "Deep sea", premium: true, background: { type: "motion", motionId: "waves", tint: "#3aa0ff", base: "#02101f" }, fontFamily: SANS, fontSize: 60, color: "#f2f8ff", reference: { color: "#a8d4ff" }, attribution: { color: "#86a9cc" } }),
    displayTheme({ id: "theme-heaven", name: "Heaven’s clouds", premium: true, background: { type: "motion", motionId: "clouds", tint: "#ffffff", base: "#5d7fa8" }, fontFamily: SERIF, fontSize: 64, color: "#ffffff", dim: 0.15, reference: { color: "#fff3c4" }, attribution: { color: "#e6eefa" }, effects: { shadow: true } }),
    displayTheme({ id: "theme-advent", name: "Advent", premium: true, background: { type: "gradient", from: "#1b0f2e", to: "#4b2a6b", angle: 160 }, fontFamily: SERIF, fontSize: 62, color: "#f7f0ff", reference: { color: "#d9c2ff" }, attribution: { color: "#b4a2cc" } }),
    displayTheme({ id: "theme-easter", name: "Easter", premium: true, background: { type: "gradient", from: "#fff6e5", to: "#f2d9a6", angle: 180 }, fontFamily: SERIF, fontSize: 62, color: "#3a2410", reference: { color: "#9a6420" }, attribution: { color: "#8a7258" } }),
    displayTheme({ id: "theme-pentecost", name: "Pentecost", premium: true, background: { type: "gradient", from: "#2a0606", to: "#c2410c", angle: 200 }, fontFamily: SANS, fontSize: 62, color: "#fff4ec", reference: { color: "#ffd2a8" }, attribution: { color: "#f0b998" } }),
    displayTheme({ id: "theme-royal", name: "Royal", premium: true, background: { type: "gradient", from: "#070b1f", to: "#1d2a5c", angle: 165 }, fontFamily: SERIF, fontSize: 62, color: "#f6f2e6", reference: { color: "#e6c879" }, attribution: { color: "#a9a48f" } }),
    // Broadcast and stage themes (Premium): words on a panel, the way TV graphics and big-room screens do it.
    displayTheme({ id: "theme-newsdesk", name: "Newsdesk", premium: true, layout: "lower-third", background: { type: "color", color: "#050505" }, fontFamily: INTER, fontSize: 46, color: "#ffffff", align: "left", vertical: "bottom", margin: 72, effects: { bold: true }, panel: { style: "bar", color: "#0b1530", opacity: 0.94, accent: "#e11d48", tag: true }, reference: { size: 22, color: "#ffffff" }, attribution: { color: "#a9b4d0" } }),
    displayTheme({ id: "theme-headline", name: "Headline", premium: true, layout: "lower-third", background: { type: "color", color: "#050505" }, fontFamily: INTER, fontSize: 44, color: "#0b0b0f", align: "left", vertical: "bottom", margin: 72, panel: { style: "bar", color: "#ffffff", opacity: 0.96, accent: "#0a84ff", tag: true }, reference: { size: 22, color: "#ffffff" }, attribution: { color: "#5b6170" } }),
    displayTheme({ id: "theme-caption-glass", name: "Glass caption", premium: true, layout: "lower-third", background: { type: "color", color: "#050505" }, fontFamily: SANS, fontSize: 46, color: "#ffffff", align: "center", vertical: "bottom", margin: 72, panel: { style: "glass", color: "#0a0a0a", opacity: 0.45, accent: "#ffffff", tag: false }, reference: { size: 22, color: "#ffe6b0" }, attribution: { color: "#d0d0d0" } }),
    displayTheme({ id: "theme-key-green", name: "Key green", premium: true, layout: "lower-third", background: { type: "color", color: "#00b140" }, fontFamily: INTER, fontSize: 46, color: "#ffffff", align: "left", vertical: "bottom", margin: 72, effects: { bold: true }, panel: { style: "bar", color: "#101418", opacity: 1, accent: "#f5a524", tag: true }, reference: { size: 22, color: "#101418" }, attribution: { color: "#b8c0c8" } }),
    displayTheme({ id: "theme-studio-box", name: "Studio box", premium: true, background: { type: "gradient", from: "#0d1117", to: "#1f2937", angle: 160 }, fontFamily: INTER, fontSize: 58, color: "#f8fafc", panel: { style: "box", color: "#000000", opacity: 0.55, accent: "#fa4f00", tag: true }, reference: { size: 24, color: "#ffffff" }, attribution: { color: "#94a3b8" } }),
    displayTheme({ id: "theme-frosted", name: "Frosted", premium: true, background: { type: "motion", motionId: "aurora", tint: "#7aa2ff", base: "#050b1c" }, fontFamily: SANS, fontSize: 58, color: "#ffffff", panel: { style: "glass", color: "#0b1020", opacity: 0.35, accent: "#9cb8ff", tag: false }, reference: { color: "#cdd9ff" }, attribution: { color: "#a8b4d8" } }),
    displayTheme({ id: "theme-band", name: "Band", premium: true, background: { type: "gradient", from: "#1a1206", to: "#3b2a10", angle: 180 }, fontFamily: SERIF, fontSize: 62, color: "#fff8e8", panel: { style: "band", color: "#000000", opacity: 0.45, accent: "#e2cc9d", tag: false }, reference: { color: "#e2cc9d" }, attribution: { color: "#bfae8c" } }),
    displayTheme({ id: "theme-keynote", name: "Keynote", premium: true, background: { type: "color", color: "#000000" }, fontFamily: INTER, fontSize: 72, color: "#ffffff", align: "left", margin: 140, effects: { bold: true }, reference: { size: 26, color: "#fa4f00" }, attribution: { color: "#8e8e93" } }),
    displayTheme({ id: "theme-daylight", name: "Daylight", premium: true, background: { type: "color", color: "#f7f8fa" }, fontFamily: INTER, fontSize: 64, color: "#0f172a", align: "left", margin: 140, effects: { bold: true }, reference: { color: "#2563eb" }, attribution: { color: "#64748b" } }),
    displayTheme({ id: "theme-stage-wide", name: "Big room", premium: true, background: { type: "motion", motionId: "rays", tint: "#ffb35c", base: "#0a0603" }, fontFamily: FIGTREE, fontSize: 70, color: "#ffffff", dim: 0.25, effects: { bold: true, uppercase: true, shadow: true }, panel: { style: "band", color: "#000000", opacity: 0.35, accent: "#ffb35c", tag: false }, reference: { color: "#ffd59a" }, attribution: { color: "#e0c7a4" } }),
    displayTheme({ id: "theme-slate", name: "Slate", premium: true, background: { type: "gradient", from: "#111418", to: "#2c333d", angle: 180 }, fontFamily: INTER, fontSize: 60, color: "#eef2f6", reference: { color: "#9fb3c8" }, attribution: { color: "#7d8a98" } }),
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
  return { theme: "dark", density: "comfortable", scale: 1, accent: "#fa4f00", desk: "pewbeam", calm: false };
}

export function defaultWorkspace(): Workspace {
  const layouts = factoryLayouts();
  const displayProfiles = factoryProfiles();
  return {
    schemaVersion: 2,
    songFolders: [],
    ccliLicense: "",
    installedPacks: [],
    customLayouts: [],
    tours: emptyTourProgress(),
    onlineBibles: { key: "", bibles: [] },
    songUses: [],
    parallelTranslationId: null,
    stageLayout: { next: true, clock: true, notes: true, size: "m" },
    entitlement: { plan: "free", source: "free", expiresAt: null, code: null, license: null, holder: null, trialEndsAt: null, trialUsed: false },
    profile: null,
    onboarded: false,
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
