import type { AppearanceSettings, Cursor, DisplayProfile, OperatorTheme, ShortcutMap, Workspace, WorkspaceLayout } from "../domain/types";
import { factoryProfiles, normalizeProfile } from "../display/profiles";
import { defaultWorkspace } from "../domain/theme";
import { factoryLayouts, normalizeLayout } from "./layout";

const SHORTCUTS = ["take", "cut", "previous", "next", "clear", "black", "logo", "escape"] as const;

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
    desk: value?.desk === "obs" ? "obs" : value?.desk === "pewbeam" ? "pewbeam" : base.desk,
  };
}

function shortcuts(value: unknown): ShortcutMap | null {
  if (!value || typeof value !== "object") return null;
  const record = value as ShortcutMap;
  if (!SHORTCUTS.every((action) => Array.isArray(record[action]))) return null;
  return record;
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
    logoText: typeof value.logoText === "string" ? value.logoText : base.logoText,
    themeId: typeof value.themeId === "string" ? value.themeId : base.themeId,
    lastServiceId: typeof value.lastServiceId === "string" ? value.lastServiceId : null,
    recent: Array.isArray(value.recent) ? value.recent : [],
    cursor: cursor(value.cursor, base.cursor),
    shortcuts: shortcuts(value.shortcuts),
    appearance: appearance(value.appearance, base.appearance),
    layouts: safeLayouts,
    activeLayoutId: safeLayouts.some((layout) => layout.id === value.activeLayoutId) ? value.activeLayoutId! : safeLayouts[0].id,
    displayProfiles: safeProfiles,
    activeDisplayProfileId: safeProfiles.some((profile) => profile.id === value.activeDisplayProfileId)
      ? value.activeDisplayProfileId!
      : safeProfiles[0].id,
  };
}
