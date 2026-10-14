import type { FloatGeometry, PanelId, PanelPlacement, RegionId, RegionSizes, WorkspaceKind, WorkspaceLayout } from "../domain/types";

export const PANEL_IDS: PanelId[] = [
  "service",
  "preview",
  "program",
  "bible",
  "lyrics",
  "slides",
  "media",
  "theme",
  "controls",
];

export const PANEL_TITLES: Record<PanelId, string> = {
  service: "Service",
  preview: "Preview",
  program: "Program",
  bible: "Bible",
  lyrics: "Lyrics",
  slides: "Slides",
  media: "Media",
  theme: "Theme",
  controls: "Controls",
};

export const LIBRARY_PANELS: PanelId[] = ["bible", "lyrics", "slides", "media", "theme"];

const FACTORY_TIME = "1970-01-01T00:00:00.000Z";
const FULL_WIDTH = 1360;
const MEDIUM_WIDTH = 1080;

export type ViewportMode = "full" | "medium" | "compact";

export type PresentedLayout = {
  mode: ViewportMode;
  centerAxis: "column" | "row";
  bottomAxis: "column" | "row";
  regions: RegionSizes;
  bottomHeight: number;
  left: PanelPlacement[];
  center: PanelPlacement[];
  right: PanelPlacement[];
  bottom: PanelPlacement[];
  floating: PanelPlacement[];
  overflow: PanelPlacement[];
  activeTabs: { left: PanelId | null; right: PanelId | null; bottom: PanelId | null };
};

export type GridPlan = {
  columns: string;
  rows: string;
  left: number | null;
  leftSplitter: number | null;
  center: number;
  rightSplitter: number | null;
  right: number | null;
};

export function timestamp(now = new Date().toISOString()): string {
  return now;
}

export function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as string[]).includes(value);
}

export function viewportMode(width: number): ViewportMode {
  if (width >= FULL_WIDTH) return "full";
  if (width >= MEDIUM_WIDTH) return "medium";
  return "compact";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function panel(
  panelId: PanelId,
  region: RegionId,
  order: number,
  visible = true,
): PanelPlacement {
  return {
    panelId,
    region,
    floating: false,
    x: 72,
    y: 56,
    width: 420,
    height: 520,
    order,
    visible,
    collapsed: false,
  };
}

function buildLayout(input: {
  id: string;
  name: string;
  kind: WorkspaceKind;
  centerAxis: "column" | "row";
  regions: RegionSizes;
  activeTabs: WorkspaceLayout["activeTabs"];
  panels: PanelPlacement[];
}): WorkspaceLayout {
  return {
    builtin: true,
    updatedAt: FACTORY_TIME,
    ...input,
    panels: renumber(input.panels),
  };
}

export function factoryLayouts(): WorkspaceLayout[] {
  return [
    buildLayout({
      id: "layout-bible",
      name: "Bible Operator",
      kind: "bible",
      centerAxis: "column",
      regions: { left: 300, right: 400, bottom: 96, centerSplit: 0.62 },
      activeTabs: { left: "service", right: "bible", bottom: "controls" },
      panels: [
        panel("service", "left", 0),
        panel("preview", "center", 0),
        panel("program", "center", 1),
        panel("bible", "right", 0),
        panel("lyrics", "right", 1),
        panel("slides", "right", 2),
        panel("media", "right", 3),
        panel("theme", "right", 4),
        panel("controls", "bottom", 0),
      ],
    }),
    buildLayout({
      id: "layout-production",
      name: "Live Production",
      kind: "production",
      centerAxis: "row",
      regions: { left: 280, right: 340, bottom: 96, centerSplit: 0.5 },
      activeTabs: { left: "service", right: "bible", bottom: "controls" },
      panels: [
        panel("service", "left", 0),
        panel("preview", "center", 0),
        panel("program", "center", 1),
        panel("bible", "right", 0),
        panel("lyrics", "right", 1),
        panel("slides", "right", 2, false),
        panel("media", "right", 3, false),
        panel("theme", "right", 4, false),
        panel("controls", "bottom", 0),
      ],
    }),
    buildLayout({
      id: "layout-simple",
      name: "Simple Presenter",
      kind: "simple",
      centerAxis: "column",
      regions: { left: 280, right: 360, bottom: 96, centerSplit: 0.68 },
      activeTabs: { left: "service", bottom: "controls" },
      panels: [
        panel("service", "left", 0),
        panel("preview", "center", 0),
        panel("program", "center", 1),
        panel("bible", "right", 0, false),
        panel("lyrics", "right", 1, false),
        panel("slides", "right", 2, false),
        panel("media", "right", 3, false),
        panel("theme", "right", 4, false),
        panel("controls", "bottom", 0),
      ],
    }),
  ];
}

function renumber(panels: PanelPlacement[]): PanelPlacement[] {
  const next = panels.map((item) => ({ ...item }));
  for (const region of ["left", "center", "right", "bottom"] as const) {
    next
      .filter((item) => item.region === region)
      .sort((a, b) => a.order - b.order || a.panelId.localeCompare(b.panelId))
      .forEach((item, index) => {
        item.order = index;
      });
  }
  return next;
}

function touch(layout: WorkspaceLayout, patch: Partial<WorkspaceLayout>, now: string): WorkspaceLayout {
  return { ...layout, ...patch, updatedAt: now };
}

export function movePanel(layout: WorkspaceLayout, panelId: PanelId, region: RegionId, now = timestamp()): WorkspaceLayout {
  const max = Math.max(-1, ...layout.panels.filter((item) => item.region === region).map((item) => item.order));
  const panels = renumber(
    layout.panels.map((item) =>
      item.panelId === panelId
        ? { ...item, region, order: max + 1, floating: false, visible: true, collapsed: false }
        : item,
    ),
  );
  return touch(layout, { panels, activeTabs: { ...layout.activeTabs, [region]: panelId } }, now);
}

export function hidePanel(layout: WorkspaceLayout, panelId: PanelId, now = timestamp()): WorkspaceLayout {
  const current = layout.panels.find((item) => item.panelId === panelId);
  const panels = layout.panels.map((item) =>
    item.panelId === panelId ? { ...item, visible: false, floating: false } : item,
  );
  const activeTabs = { ...layout.activeTabs };
  if (current && activeTabs[current.region] === panelId) {
    const next = panels
      .filter((item) => item.region === current.region && item.visible)
      .sort((a, b) => a.order - b.order)[0];
    activeTabs[current.region] = next?.panelId;
  }
  return touch(layout, { panels, activeTabs }, now);
}

export function showPanel(layout: WorkspaceLayout, panelId: PanelId, now = timestamp()): WorkspaceLayout {
  const current = layout.panels.find((item) => item.panelId === panelId);
  if (!current) return layout;
  const panels = layout.panels.map((item) => (item.panelId === panelId ? { ...item, visible: true } : item));
  return touch(layout, { panels, activeTabs: { ...layout.activeTabs, [current.region]: panelId } }, now);
}

export function collapsePanel(layout: WorkspaceLayout, panelId: PanelId, collapsed: boolean, now = timestamp()): WorkspaceLayout {
  const panels = layout.panels.map((item) => (item.panelId === panelId ? { ...item, collapsed } : item));
  return touch(layout, { panels }, now);
}

export function placeFloating(
  layout: WorkspaceLayout,
  panelId: PanelId,
  geometry: Partial<FloatGeometry> = {},
  now = timestamp(),
): WorkspaceLayout {
  const panels = layout.panels.map((item) => {
    if (item.panelId !== panelId) return item;
    return {
      ...item,
      floating: true,
      visible: true,
      collapsed: false,
      x: clamp(geometry.x ?? item.x, 0, 4000),
      y: clamp(geometry.y ?? item.y, 0, 4000),
      width: clamp(geometry.width ?? item.width, 280, 960),
      height: clamp(geometry.height ?? item.height, 180, 1000),
    };
  });
  return touch(layout, { panels }, now);
}

export function dockPanel(layout: WorkspaceLayout, panelId: PanelId, region?: RegionId, now = timestamp()): WorkspaceLayout {
  const current = layout.panels.find((item) => item.panelId === panelId);
  return movePanel(layout, panelId, region ?? current?.region ?? "right", now);
}

export function resizeLayout(layout: WorkspaceLayout, patch: Partial<RegionSizes>, now = timestamp()): WorkspaceLayout {
  const regions = { ...layout.regions };
  if (patch.left !== undefined) regions.left = clamp(patch.left, 220, 640);
  if (patch.right !== undefined) regions.right = clamp(patch.right, 260, 720);
  if (patch.bottom !== undefined) regions.bottom = clamp(patch.bottom, 72, 420);
  if (patch.centerSplit !== undefined) regions.centerSplit = clamp(patch.centerSplit, 0.22, 0.78);
  return touch(layout, { regions }, now);
}

export function activateTab(layout: WorkspaceLayout, region: RegionId, panelId: PanelId, now = timestamp()): WorkspaceLayout {
  return touch(layout, { activeTabs: { ...layout.activeTabs, [region]: panelId } }, now);
}

export function renameLayout(layout: WorkspaceLayout, name: string, now = timestamp()): WorkspaceLayout {
  const trimmed = name.trim();
  if (!trimmed) return layout;
  return touch(layout, { name: trimmed }, now);
}

export function duplicateLayout(layout: WorkspaceLayout, id: string, name: string, now = timestamp()): WorkspaceLayout {
  return {
    ...structuredClone(layout),
    id,
    name: name.trim() || `${layout.name} copy`,
    kind: "custom",
    builtin: false,
    updatedAt: now,
  };
}

export function deleteLayout(layouts: WorkspaceLayout[], id: string): WorkspaceLayout[] | null {
  const target = layouts.find((layout) => layout.id === id);
  if (!target || target.builtin || layouts.length < 2) return null;
  return layouts.filter((layout) => layout.id !== id);
}

export function resetLayout(layout: WorkspaceLayout, now = timestamp()): WorkspaceLayout {
  const factory = factoryLayouts().find((item) => item.id === layout.id);
  if (!factory) return layout;
  return { ...structuredClone(factory), updatedAt: now };
}

export function restoreBuiltinLayouts(layouts: WorkspaceLayout[]): WorkspaceLayout[] {
  const custom = layouts.filter((layout) => !layout.builtin && !factoryLayouts().some((item) => item.id === layout.id));
  return [...factoryLayouts().map((layout) => structuredClone(layout)), ...custom.map((layout) => structuredClone(layout))];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePanels(input: unknown): PanelPlacement[] {
  const seen = new Set<PanelId>();
  const panels: PanelPlacement[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const record = item as Partial<PanelPlacement>;
      if (typeof record.panelId !== "string" || !isPanelId(record.panelId) || seen.has(record.panelId)) continue;
      const region = record.region === "left" || record.region === "center" || record.region === "right" || record.region === "bottom" ? record.region : "right";
      seen.add(record.panelId);
      panels.push({
        panelId: record.panelId,
        region,
        floating: Boolean(record.floating),
        x: clamp(numberOr(record.x, 72), 0, 4000),
        y: clamp(numberOr(record.y, 56), 0, 4000),
        width: clamp(numberOr(record.width, 420), 280, 960),
        height: clamp(numberOr(record.height, 520), 180, 1000),
        order: numberOr(record.order, panels.length),
        visible: record.visible !== false,
        collapsed: Boolean(record.collapsed),
      });
    }
  }
  for (const panelId of PANEL_IDS) {
    if (!seen.has(panelId)) panels.push(panel(panelId, "right", panels.length, false));
  }
  return renumber(panels);
}

function sanitizeTabs(input: unknown): WorkspaceLayout["activeTabs"] {
  if (!input || typeof input !== "object") return {};
  const tabs: WorkspaceLayout["activeTabs"] = {};
  for (const region of ["left", "center", "right", "bottom"] as const) {
    const value = (input as Record<string, unknown>)[region];
    if (typeof value === "string" && isPanelId(value)) tabs[region] = value;
  }
  return tabs;
}

export function normalizeLayout(input: unknown): WorkspaceLayout | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<WorkspaceLayout>;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  const kind: WorkspaceKind =
    value.kind === "bible" || value.kind === "production" || value.kind === "simple" || value.kind === "custom"
      ? value.kind
      : "custom";
  const regions = value.regions ?? { left: 300, right: 380, bottom: 96, centerSplit: 0.62 };
  return {
    id: value.id,
    name: value.name.trim(),
    kind,
    builtin: Boolean(value.builtin),
    centerAxis: value.centerAxis === "row" ? "row" : "column",
    regions: {
      left: clamp(numberOr(regions.left, 300), 220, 640),
      right: clamp(numberOr(regions.right, 380), 260, 720),
      bottom: clamp(numberOr(regions.bottom, 96), 72, 420),
      centerSplit: clamp(numberOr(regions.centerSplit, 0.62), 0.22, 0.78),
    },
    activeTabs: sanitizeTabs(value.activeTabs),
    panels: normalizePanels(value.panels),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : FACTORY_TIME,
  };
}

function byOrder(a: PanelPlacement, b: PanelPlacement): number {
  return a.order - b.order;
}

function resolveTab(panels: PanelPlacement[], preferred?: PanelId): PanelId | null {
  if (panels.length === 0) return null;
  if (preferred && panels.some((panel) => panel.panelId === preferred)) return preferred;
  return panels[0].panelId;
}

export function presentLayout(layout: WorkspaceLayout, width: number, options?: { live?: boolean }): PresentedLayout {
  const mode = viewportMode(width);
  const live = options?.live ?? false;
  const library = new Set<PanelId>(LIBRARY_PANELS);
  const visible = layout.panels
    .filter((item) => item.visible && !(live && library.has(item.panelId)))
    .map((item) => ({ ...item }));
  const floating = mode === "compact" ? [] : visible.filter((item) => item.floating);
  let docked = visible.filter((item) => !item.floating);
  let overflow: PanelPlacement[] = [];
  if (mode === "medium") {
    docked = docked.map((item) => (item.region === "left" ? { ...item, region: "bottom", order: item.order - 100 } : item));
  }
  if (mode === "compact") {
    overflow = visible.filter((item) => item.floating || item.region === "left" || item.region === "right");
    docked = visible.filter((item) => !item.floating && (item.region === "center" || item.region === "bottom"));
    docked = docked.map((item) => ({ ...item, floating: false }));
  }
  const left = docked.filter((item) => item.region === "left").sort(byOrder);
  const center = docked.filter((item) => item.region === "center").sort(byOrder);
  const right = docked.filter((item) => item.region === "right").sort(byOrder);
  const bottom = docked.filter((item) => item.region === "bottom").sort(byOrder);
  const serviceBelow = mode === "medium" && bottom.some((item) => item.panelId === "service");
  return {
    mode,
    centerAxis: layout.centerAxis,
    bottomAxis: mode === "medium" ? "row" : "column",
    regions: layout.regions,
    bottomHeight: serviceBelow ? Math.max(layout.regions.bottom, 220) : layout.regions.bottom,
    left,
    center,
    right,
    bottom,
    floating,
    overflow,
    activeTabs: {
      left: resolveTab(left, layout.activeTabs.left),
      right: resolveTab(right, layout.activeTabs.right),
      bottom: resolveTab(bottom, layout.activeTabs.bottom),
    },
  };
}

export function gridPlan(presented: PresentedLayout): GridPlan {
  const tracks: string[] = [];
  let cursor = 1;
  const left = presented.left.length ? cursor : null;
  if (presented.left.length) {
    tracks.push(`${presented.regions.left}px`, "6px");
    cursor += 2;
  }
  const center = cursor;
  tracks.push("minmax(0, 1fr)");
  cursor += 1;
  const rightSplitter = presented.right.length ? cursor : null;
  const right = presented.right.length ? cursor + 1 : null;
  if (presented.right.length) tracks.push("6px", `${presented.regions.right}px`);
  return {
    columns: tracks.join(" "),
    rows: presented.bottom.length ? `minmax(0, 1fr) 6px ${presented.bottomHeight}px` : "minmax(0, 1fr)",
    left,
    leftSplitter: left === null ? null : left + 1,
    center,
    rightSplitter,
    right,
  };
}

export function splitTracks(
  axis: "column" | "row",
  split: number,
  primaryCollapsed: boolean,
  secondaryCollapsed: boolean,
): { columns: string; rows: string } {
  const first = primaryCollapsed ? "auto" : `${split}fr`;
  const second = secondaryCollapsed ? "auto" : `${1 - split}fr`;
  const pair = `${first} 6px ${second}`;
  return axis === "row"
    ? { columns: pair, rows: "minmax(0, 1fr)" }
    : { columns: "minmax(0, 1fr)", rows: pair };
}
