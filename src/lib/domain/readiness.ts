import { msg } from "../i18n/core";
import { micLabel, pickMicrophone, type MicHeard } from "../voice/microphone";

// Readiness check: one press checks what a service depends on, and says it the church's way.
// Each check turns facts the desk gathered into a line: fine, worth a look, or needs fixing, with
// the one thing to do about it. Nothing here names the machinery behind it.

export type ReadyState = "ok" | "warn" | "fail";

/** What a check's button does; the settings page runs it. */
export type ReadyFix = "open-audience" | "displays" | "service" | "backup" | "storage" | "plans" | "ai" | "recording" | "sound" | "cloud";

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

export function screenCheck(facts: { online: boolean; displayName: string; screens: number; mode: string; os?: "windows" | "mac" | "other" }): ReadyCheck {
  if (facts.online) return { id: "screen", state: "ok", title: msg("The audience screen is on"), detail: facts.displayName ? msg("Showing on {name}.") : msg("Ready to show."), values: { name: facts.displayName } };
  if (facts.mode === "window" && facts.screens < 2) {
    // The usual cause on a church PC: the projector is plugged in but Windows mirrors the laptop to it.
    const detail =
      facts.os === "windows"
        ? msg("Plug in the projector or TV. If it is plugged in and shows the same as this screen, press Windows key + P and choose Extend, then check again.")
        : facts.os === "mac"
          ? msg("Plug in the projector or TV. If it shows the same as this screen, open System Settings › Displays and turn off mirroring, then check again.")
          : msg("Plug in the projector or TV, then check again.");
    return { id: "screen", state: "warn", title: msg("Only one screen is connected"), detail, fix: { label: msg("Displays"), action: "displays" } };
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

/**
 * A service day, when the desk checks readiness by itself on opening: a Sunday, or a day the open
 * service is named for (the desk names a new service with its date, "Bible study, 28 Oct").
 */
export function isServiceDay(now: Date, serviceName: string | null): boolean {
  if (now.getDay() === 0) return true;
  return !!serviceName && serviceName.includes(now.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
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

/**
 * The microphone, for a church that listens: each one was opened for a moment, and a real one always
 * hears a little hiss, so a dead one shows without anyone speaking. Already listening: how that goes.
 */
export function micCheck(facts: { heard: MicHeard[]; chosen: string | null; fallback: string | null; listening: boolean; problem: string | null }): ReadyCheck {
  const fix = { label: msg("Sound & voice"), action: "sound" as const };
  if (facts.listening) {
    return facts.problem
      ? { id: "mic", state: "fail", title: msg("Listening has a problem"), detail: facts.problem, fix }
      : { id: "mic", state: "ok", title: msg("Listening is on"), detail: msg("Verses read aloud go to Preview.") };
  }
  if (!facts.heard.length) return { id: "mic", state: "fail", title: msg("No microphone is plugged in"), detail: msg("Plug one in, then check again."), fix };
  const choice = pickMicrophone(facts.heard, facts.chosen, facts.fallback);
  if (choice.allSilent) return { id: "mic", state: "fail", title: msg("No microphone is sending sound"), detail: msg("Check it is plugged in, switched on and not muted. A wireless one needs its receiver on too."), fix };
  const name = micLabel(choice.name ?? "");
  if (choice.moved) {
    const from = micLabel(choice.moved.from);
    return choice.moved.because === "unplugged"
      ? { id: "mic", state: "warn", title: msg("{from} is not plugged in"), detail: msg("Listening will use {name} instead."), values: { from, name }, fix }
      : { id: "mic", state: "warn", title: msg("{from} sends no sound"), detail: msg("Listening will use {name} instead."), values: { from, name }, fix };
  }
  return { id: "mic", state: "ok", title: msg("The microphone is sending sound"), detail: msg("Listening will use {name}."), values: { name } };
}

/** Cloud sync, for a church that uses it: whether this computer's songs and files reach the others. */
export function cloudCheck(facts: { status: string; held: number; pendingMedia: number; full: boolean; lastSyncAt: number | null; timeText: (time: number) => string }): ReadyCheck | null {
  const fix = { label: msg("Cloud space"), action: "cloud" as const };
  switch (facts.status) {
    case "off":
    case "free":
    case "signedOut":
      return null;
    case "licenceChanged":
      return { id: "cloud", state: "fail", title: msg("Cloud sync is paused"), detail: msg("This computer's license changed. Choose in Cloud space whether to bring this library along."), fix };
    case "noSeat":
      return { id: "cloud", state: "warn", title: msg("This computer is not syncing"), detail: msg("It is not on the license. Sign in and activate it, then sync."), fix: { label: msg("Account"), action: "cloud" } };
    case "readOnly":
      return { id: "cloud", state: "warn", title: msg("The cloud is read-only"), detail: msg("Changes made here stay on this computer until the plan is renewed."), fix: { label: msg("Plans"), action: "plans" } };
    case "offline":
      return { id: "cloud", state: "warn", title: msg("Cloud sync is offline"), detail: msg("Changes made here wait until the internet is back; your other computers do not have them yet.") };
    case "error":
      return { id: "cloud", state: "warn", title: msg("Cloud sync stopped"), detail: msg("Open Cloud space to try again."), fix };
  }
  if (facts.held > 0) return { id: "cloud", state: "warn", title: msg("Changes are waiting to go to the cloud"), detail: msg("{n} waiting for Sync now, so your other computers do not have them yet."), values: { n: facts.held }, fix };
  if (facts.full) return { id: "cloud", state: "warn", title: msg("Some files are only on this computer"), detail: msg("The cloud space is full, so other computers cannot show them."), fix };
  if (facts.pendingMedia > 0) return { id: "cloud", state: "warn", title: msg("Files are still syncing"), detail: msg("{n} to go. Leave the app open until they finish."), values: { n: facts.pendingMedia } };
  return { id: "cloud", state: "ok", title: msg("Synced with the cloud"), detail: facts.lastSyncAt ? msg("Last synced at {time}.") : msg("Songs and files reach your other computers."), values: facts.lastSyncAt ? { time: facts.timeText(facts.lastSyncAt) } : undefined };
}

/** Worst first, so what needs doing is at the top. */
export function sortChecks(checks: ReadyCheck[]): ReadyCheck[] {
  const rank: Record<ReadyState, number> = { fail: 0, warn: 1, ok: 2 };
  return [...checks].sort((a, b) => rank[a.state] - rank[b.state]);
}
