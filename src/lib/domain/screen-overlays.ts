// Overlays: things that sit on top of whatever is on the screen and stay there while Program
// changes underneath, like a TV channel's logo or a news ticker. Each is switched on or off by
// itself, and appears on the audience screen and the Program monitor (never on Preview alone).

export type OverlayKind = "logo" | "ticker" | "banner" | "clock" | "lower-third" | "badge" | "countdown";
export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type OverlayEdge = "top" | "bottom";
/** Where a countdown sits: a corner, the middle of the top or bottom, or the centre of the screen. */
export type OverlaySpot = OverlayCorner | "top" | "bottom" | "center";
export type OverlaySize = "s" | "m" | "l" | "xl";

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
  /** Countdown: where it sits, and how big. */
  spot: OverlaySpot;
  size: OverlaySize;
};

/** What travels to the screens: only overlays that are on, with the logo picture resolved. */
export type PaintedOverlay = Omit<ScreenOverlay, "on" | "assetId"> & {
  imageUrl: string | null;
  /** Countdown: the section running now and when it should end (epoch ms); null hides it. */
  endsAt?: number | null;
  section?: string;
};

/** The running section for a countdown overlay. */
export type CountdownTarget = { name: string; endsAt: number } | null;

export const OVERLAY_KINDS: Array<{ kind: OverlayKind; label: string; icon: string; detail: string }> = [
  { kind: "logo", label: "Logo bug", icon: "logo", detail: "Your logo or name in a corner" },
  { kind: "ticker", label: "Ticker", icon: "alerts", detail: "Words scrolling along the bottom" },
  { kind: "banner", label: "Banner", icon: "pencil", detail: "A message bar at the top or bottom" },
  { kind: "clock", label: "Clock", icon: "clock", detail: "The time in a corner" },
  { kind: "lower-third", label: "Name lower third", icon: "user", detail: "A name and title, low on the screen" },
  { kind: "badge", label: "Live badge", icon: "cast", detail: "A small LIVE mark for streams" },
  { kind: "countdown", label: "Section countdown", icon: "timer", detail: "Time left in the part of the service now" },
];

export const OVERLAY_SPOTS: Array<[OverlaySpot, string]> = [
  ["top-left", "Top left"],
  ["top", "Top"],
  ["top-right", "Top right"],
  ["center", "Centre"],
  ["bottom-left", "Bottom left"],
  ["bottom", "Bottom"],
  ["bottom-right", "Bottom right"],
];
const SPOTS = new Set<OverlaySpot>(OVERLAY_SPOTS.map(([spot]) => spot));

const KINDS = new Set<OverlayKind>(OVERLAY_KINDS.map((entry) => entry.kind));
const CORNERS = new Set<OverlayCorner>(["top-left", "top-right", "bottom-left", "bottom-right"]);
const HEX = /^#[0-9a-f]{6}$/i;

export function newOverlay(kind: OverlayKind, churchName = "", id: string = crypto.randomUUID()): ScreenOverlay {
  const base: ScreenOverlay = { id, kind, on: false, text: "", subtitle: "", corner: "top-right", edge: "bottom", assetId: null, speed: 2, color: "#fa4f00", spot: "top-right", size: "m" };
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
    case "countdown":
      // The words above the time; empty shows the section's own name.
      return { ...base, text: "", spot: "top-right", size: "m", color: "#30a46c" };
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
      spot: SPOTS.has(record.spot as OverlaySpot) ? (record.spot as OverlaySpot) : base.spot,
      size: record.size === "s" || record.size === "l" || record.size === "xl" ? record.size : "m",
    });
  }
  return result;
}

/** The overlays that are on, ready to paint. Two overlays never fight for one corner: the later one wins. */
export function paintOverlays(overlays: ScreenOverlay[], resolve: (assetId: string) => string | null, countdown: CountdownTarget = null): PaintedOverlay[] {
  const corners = new Map<OverlayCorner, string>();
  const on = overlays.filter((overlay) => overlay.on);
  for (const overlay of on) {
    if (overlay.kind === "logo" || overlay.kind === "clock" || overlay.kind === "badge") corners.set(overlay.corner, overlay.id);
  }
  return on
    .filter((overlay) => !(overlay.kind === "logo" || overlay.kind === "clock" || overlay.kind === "badge") || corners.get(overlay.corner) === overlay.id)
    .map(({ on: _on, assetId, ...rest }) =>
      rest.kind === "countdown"
        ? { ...rest, imageUrl: null, endsAt: countdown?.endsAt ?? null, section: countdown?.name ?? "" }
        : { ...rest, imageUrl: assetId ? resolve(assetId) : null },
    );
}

export function sanitizePaintedOverlays(value: unknown): PaintedOverlay[] {
  if (!Array.isArray(value)) return [];
  return sanitizeOverlays(value.map((entry) => ({ ...(entry as object), on: true }))).map((overlay, index) => {
    const raw = value[index] as { imageUrl?: unknown; endsAt?: unknown; section?: unknown } | undefined;
    const { on: _on, assetId: _asset, ...rest } = overlay;
    return {
      ...rest,
      imageUrl: typeof raw?.imageUrl === "string" ? raw.imageUrl : null,
      ...(overlay.kind === "countdown"
        ? { endsAt: typeof raw?.endsAt === "number" ? raw.endsAt : null, section: typeof raw?.section === "string" ? raw.section.slice(0, 60) : "" }
        : {}),
    };
  });
}
