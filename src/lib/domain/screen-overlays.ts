// Overlays: things that sit on top of whatever is on the screen and stay there while Program
// changes underneath, like a TV channel's logo or a news ticker. Each is switched on or off by
// itself, and appears on the audience screen and the Program monitor (never on Preview alone).

export type OverlayKind = "logo" | "ticker" | "banner" | "clock" | "lower-third" | "badge";
export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type OverlayEdge = "top" | "bottom";

export type ScreenOverlay = {
  id: string;
  kind: OverlayKind;
  on: boolean;
  /** Main words: ticker or banner text, lower-third name, badge word. */
  text: string;
  /** Lower third second line. */
  subtitle: string;
  corner: OverlayCorner;
  edge: OverlayEdge;
  /** Logo: a library picture; none uses the church name. */
  assetId: string | null;
  /** Ticker speed, words per minute-ish: 1 slow … 3 fast. */
  speed: 1 | 2 | 3;
  color: string;
};

/** What travels to the screens: only overlays that are on, with the logo picture resolved. */
export type PaintedOverlay = Omit<ScreenOverlay, "on" | "assetId"> & { imageUrl: string | null };

export const OVERLAY_KINDS: Array<{ kind: OverlayKind; label: string; icon: string; detail: string }> = [
  { kind: "logo", label: "Logo bug", icon: "logo", detail: "Your logo or name in a corner" },
  { kind: "ticker", label: "Ticker", icon: "alerts", detail: "Words scrolling along the bottom" },
  { kind: "banner", label: "Banner", icon: "pencil", detail: "A message bar at the top or bottom" },
  { kind: "clock", label: "Clock", icon: "clock", detail: "The time in a corner" },
  { kind: "lower-third", label: "Name lower third", icon: "user", detail: "A name and title, low on the screen" },
  { kind: "badge", label: "Live badge", icon: "cast", detail: "A small LIVE mark for streams" },
];

const KINDS = new Set<OverlayKind>(OVERLAY_KINDS.map((entry) => entry.kind));
const CORNERS = new Set<OverlayCorner>(["top-left", "top-right", "bottom-left", "bottom-right"]);
const HEX = /^#[0-9a-f]{6}$/i;

export function newOverlay(kind: OverlayKind, churchName = "", id: string = crypto.randomUUID()): ScreenOverlay {
  const base: ScreenOverlay = { id, kind, on: false, text: "", subtitle: "", corner: "top-right", edge: "bottom", assetId: null, speed: 2, color: "#fa4f00" };
  switch (kind) {
    case "logo":
      return { ...base, text: churchName || "Your church", corner: "top-right" };
    case "ticker":
      return { ...base, text: "Welcome! Wi-Fi: Guest · Join us after the service for refreshments", edge: "bottom" };
    case "banner":
      return { ...base, text: "Please silence your phones", edge: "top" };
    case "clock":
      return { ...base, corner: "top-left" };
    case "lower-third":
      return { ...base, text: "Pastor's name", subtitle: "Senior Pastor", corner: "bottom-left" };
    case "badge":
      return { ...base, text: "LIVE", corner: "top-left", color: "#e5484d" };
  }
}

export function sanitizeOverlays(value: unknown): ScreenOverlay[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ScreenOverlay[] = [];
  for (const entry of value.slice(0, 40)) {
    const record = entry && typeof entry === "object" ? (entry as Partial<ScreenOverlay>) : null;
    if (!record || typeof record.id !== "string" || seen.has(record.id) || !KINDS.has(record.kind as OverlayKind)) continue;
    seen.add(record.id);
    const base = newOverlay(record.kind as OverlayKind, "", record.id);
    result.push({
      ...base,
      on: record.on === true,
      text: typeof record.text === "string" ? record.text.slice(0, 400) : base.text,
      subtitle: typeof record.subtitle === "string" ? record.subtitle.slice(0, 160) : base.subtitle,
      corner: CORNERS.has(record.corner as OverlayCorner) ? (record.corner as OverlayCorner) : base.corner,
      edge: record.edge === "top" || record.edge === "bottom" ? record.edge : base.edge,
      assetId: typeof record.assetId === "string" && record.assetId ? record.assetId : null,
      speed: record.speed === 1 || record.speed === 3 ? record.speed : 2,
      color: typeof record.color === "string" && HEX.test(record.color) ? record.color.toLowerCase() : base.color,
    });
  }
  return result;
}

/** The overlays that are on, ready to paint. Two overlays never fight for one corner: the later one wins. */
export function paintOverlays(overlays: ScreenOverlay[], resolve: (assetId: string) => string | null): PaintedOverlay[] {
  const corners = new Map<OverlayCorner, string>();
  const on = overlays.filter((overlay) => overlay.on);
  for (const overlay of on) {
    if (overlay.kind === "logo" || overlay.kind === "clock" || overlay.kind === "badge") corners.set(overlay.corner, overlay.id);
  }
  return on
    .filter((overlay) => !(overlay.kind === "logo" || overlay.kind === "clock" || overlay.kind === "badge") || corners.get(overlay.corner) === overlay.id)
    .map(({ on: _on, assetId, ...rest }) => ({ ...rest, imageUrl: assetId ? resolve(assetId) : null }));
}

export function sanitizePaintedOverlays(value: unknown): PaintedOverlay[] {
  if (!Array.isArray(value)) return [];
  return sanitizeOverlays(value.map((entry) => ({ ...(entry as object), on: true }))).map((overlay, index) => {
    const raw = value[index] as { imageUrl?: unknown } | undefined;
    const { on: _on, assetId: _asset, ...rest } = overlay;
    return { ...rest, imageUrl: typeof raw?.imageUrl === "string" ? raw.imageUrl : null };
  });
}
