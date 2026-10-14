export type FeatureId =
  | "operator"
  | "workspace"
  | "audience-output"
  | "bible"
  | "lyrics"
  | "slides"
  | "media-images"
  | "themes"
  | "service"
  | "stage-display"
  | "ndi"
  | "cloud-sync"
  | "remote-control"
  | "ai"
  | "voice-detect"
  | "streaming"
  | "recording";

const CORE = new Set<FeatureId>([
  "operator",
  "workspace",
  "audience-output",
  "bible",
  "lyrics",
  "slides",
  "media-images",
  "themes",
  "service",
  "voice-detect",
]);

/**
 * Local capability check. A future license service can replace this set.
 * Core presentation stays available offline with no account.
 */
export function canUse(feature: FeatureId): boolean {
  return CORE.has(feature);
}
