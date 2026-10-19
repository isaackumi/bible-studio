// A service's own settings (Service settings): what it does by itself while it runs. They can be
// reset to the built-in behaviour, or kept as the starting point for new services.

import type { Service } from "./types";

export const SETTING_KEYS = ["liveOnClick", "autoAdvance", "advanceGrace", "warnMinutes", "versesPerScreen", "leaderSeconds", "leaderTo", "countdownTo"] as const;
export type ServiceSettingsValues = Partial<Pick<Service, (typeof SETTING_KEYS)[number]>>;

/** The settings a service has changed from the built-in behaviour. */
export function pickSettings(service: Service): ServiceSettingsValues {
  const picked: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) if (service[key] !== undefined) picked[key] = service[key];
  return picked as ServiceSettingsValues;
}

/** The service back on the built-in behaviour (the older yes/no for names goes too). */
export function withoutSettings(service: Service): Service {
  const next: Service = { ...service };
  for (const key of SETTING_KEYS) delete next[key];
  delete next.showLeaders;
  return next;
}

/** Saved defaults, cleaned: only known settings with sensible values. */
export function cleanSettings(value: unknown): ServiceSettingsValues {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: ServiceSettingsValues = {};
  if (typeof record.liveOnClick === "boolean") out.liveOnClick = record.liveOnClick;
  if (record.autoAdvance === "remind" || record.autoAdvance === "next" || record.autoAdvance === "off") out.autoAdvance = record.autoAdvance;
  const minutes = (raw: unknown, max: number) => (typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.min(max, Math.round(raw)) : undefined);
  const grace = minutes(record.advanceGrace, 60);
  if (grace) out.advanceGrace = grace;
  const warn = minutes(record.warnMinutes, 60);
  if (warn) out.warnMinutes = warn;
  const verses = minutes(record.versesPerScreen, 20);
  if (verses) out.versesPerScreen = verses;
  const seconds = minutes(record.leaderSeconds, 120);
  if (seconds) out.leaderSeconds = seconds;
  for (const key of ["leaderTo", "countdownTo"] as const) {
    const dest = record[key];
    if (dest === "screen" || dest === "preview" || dest === "off") out[key] = dest;
  }
  return out;
}
