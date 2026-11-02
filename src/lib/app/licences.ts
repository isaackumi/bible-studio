// A person can be on more than one church's licence. Each computer stays on one, with that church's
// library (src-tauri/src/library.rs), and moves only when someone here chooses to.

import type { AccountStatus } from "../domain/billing";

type Listed = AccountStatus["licenses"][number];

const NOT_NOW_KEY = "church-studio:licence-not-now";

/** The licences this computer could use: not refunded, and the person is still on them. */
export const usableLicences = (licenses: Listed[]) => licenses.filter((entry) => !entry.revoked && !entry.removed);

/** Someone else's licence the person was added to and has not answered about here, if any. */
export function licenceToOffer(licenses: Listed[], here: string, notNow: string[]): Listed | null {
  if (!here) return null;
  return usableLicences(licenses).find((entry) => !entry.owner && entry.license !== here && !notNow.includes(entry.license)) ?? null;
}

export function readNotNow(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(NOT_NOW_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveNotNow(ids: string[]) {
  try {
    localStorage.setItem(NOT_NOW_KEY, JSON.stringify(ids));
  } catch {
    // Private storage off: asked again next time.
  }
}
