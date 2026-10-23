import { msg } from "../i18n/core";

/** Which kind of computer this is, so the desk names its own keys, settings and file browser. */
export type ComputerOs = "mac" | "windows" | "linux" | "other";

function agent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

export function computerOs(text = agent()): ComputerOs {
  if (/Windows/i.test(text)) return "windows";
  if (/Macintosh|Mac OS|iPhone|iPad/i.test(text)) return "mac";
  if (/Linux|X11|CrOS/i.test(text)) return "linux";
  return "other";
}

/**
 * A shortcut written the Mac way ("⌘K", "⇧⌘Z", "⌘+scroll"), as this computer writes it:
 * "Ctrl+K", "Shift+Ctrl+Z", "Ctrl+scroll" off a Mac. Every shortcut answers to Ctrl as well as ⌘.
 */
export function keys(text: string, os: ComputerOs = computerOs()): string {
  if (os === "mac") return text;
  return text
    .replace(/⌘/g, "Ctrl+")
    .replace(/⇧/g, "Shift+")
    .replace(/\+\+/g, "+")
    .replace(/\+(?=[\s)]|$)/g, "");
}

/** The button that shows a saved file in the computer's file browser. */
export function revealLabel(os: ComputerOs = computerOs()): string {
  return os === "mac" ? msg("Show in Finder") : os === "windows" ? msg("Show in File Explorer") : msg("Show in folder");
}
