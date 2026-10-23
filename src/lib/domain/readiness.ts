import { msg } from "../i18n/core";

// Readiness check: one press checks what a service depends on, and says it the church's way.
// Each check turns facts the desk gathered into a line: fine, worth a look, or needs fixing, with
// the one thing to do about it. Nothing here names the machinery behind it.

export type ReadyState = "ok" | "warn" | "fail";

/** What a check's button does; the settings page runs it. */
export type ReadyFix = "open-audience" | "displays" | "service" | "backup" | "storage" | "plans" | "ai" | "recording";

export type ReadyCheck = {
  id: string;
  state: ReadyState;
  /** English line, translated where it is shown; {name} placeholders come from `values`. */
  title: string;
  detail: string;
  values?: Record<string, string | number>;
  fix?: { label: string; action: ReadyFix };
};

const DAY = 86_400_000;

export function screenCheck(facts: { online: boolean; displayName: string; screens: number; mode: string }): ReadyCheck {
  if (facts.online) return { id: "screen", state: "ok", title: msg("The audience screen is on"), detail: facts.displayName ? msg("Showing on {name}.") : msg("Ready to show."), values: { name: facts.displayName } };
  if (facts.mode === "window" && facts.screens < 2) {
    return { id: "screen", state: "warn", title: msg("Only one screen is connected"), detail: msg("Plug in the projector or TV, then check again."), fix: { label: msg("Displays"), action: "displays" } };
  }
  return { id: "screen", state: "fail", title: msg("The audience screen is closed"), detail: msg("Open it so the congregation sees what you send."), fix: { label: msg("Open it"), action: "open-audience" } };
}

export function serviceCheck(facts: { name: string | null; missing: string[] }): ReadyCheck {
  if (!facts.name) return { id: "service", state: "warn", title: msg("No service is open"), detail: msg("Open today's service to check its songs, pictures and videos."), fix: { label: msg("Open Service"), action: "service" } };
  if (facts.missing.length) {
    const shown = facts.missing.slice(0, 3).join(", ") + (facts.missing.length > 3 ? "…" : "");
    return { id: "service", state: "fail", title: msg("Some of {service} can't be shown"), detail: msg("Missing: {items}. Add them again or take them out of the service."), values: { service: facts.name, items: shown }, fix: { label: msg("Open Service"), action: "service" } };
  }
  return { id: "service", state: "ok", title: msg("Everything in {service} is here"), detail: msg("Every song, picture, video and slide it uses was found."), values: { service: facts.name } };
}

/** Minutes of recording that fit in `free` bytes at `kbps` (video and sound together). */
export function recordingMinutes(free: number, kbps: number): number {
  return Math.floor((free * 8) / 1000 / Math.max(500, kbps) / 60);
}

export function spaceCheck(facts: { free: number | null; kbps: number }): ReadyCheck {
  if (facts.free === null) return { id: "space", state: "warn", title: msg("Space for recording is unknown"), detail: msg("Check the recordings folder in Stream & record."), fix: { label: msg("Stream & record"), action: "recording" } };
  const minutes = recordingMinutes(facts.free, facts.kbps);
  const hours = Math.floor(minutes / 60);
  if (minutes < 30) return { id: "space", state: "fail", title: msg("Almost no room to record"), detail: msg("Only about {minutes} minutes of recording fit. Free some space first."), values: { minutes }, fix: { label: msg("Free up space"), action: "storage" } };
  if (minutes < 120) return { id: "space", state: "warn", title: msg("Room for about {minutes} minutes of recording"), detail: msg("Enough for a short service. Free some space for a long one."), values: { minutes }, fix: { label: msg("Free up space"), action: "storage" } };
  return { id: "space", state: "ok", title: msg("Room for about {hours} hours of recording"), detail: msg("Plenty of space on this computer."), values: { hours } };
}

export function backupCheck(facts: { folder: string; lastAt: string | null; now: number; desktop: boolean }): ReadyCheck {
  if (!facts.desktop) return { id: "backup", state: "warn", title: msg("Back up from the desktop app"), detail: msg("In a browser, use Export in Storage & backup now and then."), fix: { label: msg("Storage & backup"), action: "backup" } };
  if (!facts.folder) return { id: "backup", state: "warn", title: msg("Not backed up yet"), detail: msg("Choose a backup folder so songs and services are kept safe."), fix: { label: msg("Set up backups"), action: "backup" } };
  const last = facts.lastAt ? Date.parse(facts.lastAt) : NaN;
  if (!Number.isFinite(last)) return { id: "backup", state: "warn", title: msg("No backup made yet"), detail: msg("Back up now, then it happens by itself."), fix: { label: msg("Storage & backup"), action: "backup" } };
  const days = Math.floor((facts.now - last) / DAY);
  if (days >= 7) return { id: "backup", state: "warn", title: msg("Last backup was {days} days ago"), detail: msg("Back up now, and keep the backup folder's drive connected."), values: { days }, fix: { label: msg("Storage & backup"), action: "backup" } };
  return { id: "backup", state: "ok", title: msg("Backed up recently"), detail: days === 0 ? msg("Today.") : msg("{days} days ago."), values: { days } };
}

export function planCheck(facts: { plan: string; endsAt: number | null; renewBy: number | null; now: number; dateText: (time: number) => string }): ReadyCheck | null {
  if (facts.plan === "free") return null;
  if (facts.renewBy !== null && facts.renewBy - facts.now < 3 * DAY) {
    return { id: "plan", state: "warn", title: msg("Connect to the internet soon"), detail: msg("Your plan checks in now and then. Go online before {date} to keep it."), values: { date: facts.dateText(facts.renewBy) } };
  }
  if (facts.endsAt !== null && facts.endsAt - facts.now < 7 * DAY) {
    return { id: "plan", state: "warn", title: msg("Your plan ends on {date}"), detail: msg("Renew it to keep the features you use."), values: { date: facts.dateText(facts.endsAt) }, fix: { label: msg("Renew"), action: "plans" } };
  }
  return { id: "plan", state: "ok", title: msg("Your plan is active"), detail: facts.endsAt !== null ? msg("Until {date}.") : msg("No end date."), values: { date: facts.endsAt !== null ? facts.dateText(facts.endsAt) : "" } };
}

export function libraryCheck(ok: boolean): ReadyCheck {
  return ok
    ? { id: "library", state: "ok", title: msg("Your library is in good shape"), detail: msg("Songs, services and settings read back without a problem.") }
    : { id: "library", state: "fail", title: msg("Your library needs attention"), detail: msg("Restore the latest backup, or contact support before the service."), fix: { label: msg("Storage & backup"), action: "backup" } };
}

export function internetCheck(online: boolean, needed: string[]): ReadyCheck | null {
  if (!needed.length) return null;
  return online
    ? { id: "internet", state: "ok", title: msg("Connected to the internet"), detail: msg("Needed today for: {uses}."), values: { uses: needed.join(", ") } }
    : { id: "internet", state: "fail", title: msg("No internet"), detail: msg("Needed today for: {uses}. Connect, then check again."), values: { uses: needed.join(", ") } };
}

export function aiCheck(facts: { problem: string | null }): ReadyCheck {
  return facts.problem
    ? { id: "ai", state: "fail", title: msg("The AI is not answering"), detail: facts.problem, fix: { label: msg("AI assistant"), action: "ai" } }
    : { id: "ai", state: "ok", title: msg("The AI is answering"), detail: msg("Summaries, slides, songs and captions can use it.") };
}

/** Worst first, so what needs doing is at the top. */
export function sortChecks(checks: ReadyCheck[]): ReadyCheck[] {
  const rank: Record<ReadyState, number> = { fail: 0, warn: 1, ok: 2 };
  return [...checks].sort((a, b) => rank[a.state] - rank[b.state]);
}
