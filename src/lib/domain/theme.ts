import { factoryProfiles } from "../display/profiles";
import { factoryLayouts } from "../workspace/layout";
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

export function sanitizeTheme(theme: Theme): Theme {
  return {
    ...theme,
    layout: theme.layout === "lower-third" ? "lower-third" : "frame",
    transition: sanitizeTransition(theme.transition),
  };
}

/** True when the control would persist a different transition than the one already stored. */
export function transitionChanged(current: Theme["transition"], kind: string, duration: number): boolean {
  const next = sanitizeTransition({ type: kind === "cut" ? "cut" : "fade", ms: Number(duration) });
  const stored = sanitizeTransition(current);
  return stored.type !== next.type || stored.ms !== next.ms;
}

export function defaultTheme(): Theme {
  return {
    id: DEFAULT_THEME_ID,
    name: "Signal",
    layout: "frame",
    background: { type: "color", color: "#050505" },
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 64,
    color: "#E4E4E4",
    align: "center",
    vertical: "middle",
    margin: 96,
    reference: { show: true, size: 28, color: "#E2CC9D" },
    attribution: { show: true, size: 18, color: "#908D8A" },
    transition: { type: "fade", ms: 450 },
  };
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
    churchName: "",
    logoAssetId: null,
    logoText: "Church Studio",
    themeId: DEFAULT_THEME_ID,
    lastServiceId: null,
    recent: [],
    cursor: emptyCursor(),
    shortcuts: null,
    appearance: defaultAppearance(),
    activeLayoutId: layouts[0].id,
    layouts,
    activeDisplayProfileId: displayProfiles[0].id,
    displayProfiles,
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
