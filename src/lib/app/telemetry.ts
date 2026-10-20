// Automatic error and crash reports (Sentry), so problems reach us without a church having to send
// them. They run only when the build has a Sentry address (VITE_SENTRY_DSN) and while the church
// allows it: the same Settings › Privacy switch as the daily check-in.
//
// Anonymous by design: no names, emails, song or sermon text, file paths or web addresses. A report
// carries the error, where in the code it happened, the app version, the system and the anonymous
// computer id the check-in already uses. No breadcrumbs are kept (they could hold what was on screen).
//
// Desktop crashes of the Rust core are written to crash.log (lib.rs); the next launch sends the new
// lines here. Crashes below that (a native fault that kills the process) are not caught.

type Sentry = typeof import("@sentry/browser");

export const SENTRY_DSN: string = (import.meta.env?.VITE_SENTRY_DSN as string | undefined) ?? "";
const SENT_KEY = "cs-crash-sent";

let sentry: Sentry | null = null;
let allowed = false;

/** Take anything personal out of a line of text before it leaves the computer. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, "[email]")
    .replace(/(\/(?:Users|home)\/)[^/\s"')]+/g, "$1[user]")
    .replace(/([A-Za-z]:\\Users\\)[^\\\s"')]+/g, "$1[user]")
    .replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1")
    .slice(0, 2000);
}

/** Lines of crash.log newer than the last one sent: "[unix seconds] message". */
export function newCrashLines(log: string, lastSent: number): Array<{ at: number; message: string }> {
  const out: Array<{ at: number; message: string }> = [];
  for (const line of log.split("\n")) {
    const match = line.match(/^\[(\d+)\] (.+)$/);
    if (!match) continue;
    const at = Number(match[1]);
    if (at > lastSent) out.push({ at, message: match[2]! });
  }
  return out;
}

/** Start reporting (once). Does nothing without a Sentry address in the build. */
export async function startReports(options: { version: string; device: string; os: string; allowed: boolean }): Promise<void> {
  allowed = options.allowed;
  if (!SENTRY_DSN || sentry || typeof window === "undefined") return;
  try {
    const loaded = await import("@sentry/browser");
    loaded.init({
      dsn: SENTRY_DSN,
      release: `church-studio@${options.version}`,
      environment: import.meta.env?.DEV ? "development" : "production",
      // Collect nothing about the person or the request: no user fields, cookies, headers, bodies or queries.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      integrations: (defaults) => defaults.filter((integration) => integration.name !== "Breadcrumbs"),
      beforeSend(event) {
        if (!allowed) return null;
        if (event.message) event.message = scrub(event.message);
        for (const exception of event.exception?.values ?? []) {
          if (exception.value) exception.value = scrub(exception.value);
          for (const frame of exception.stacktrace?.frames ?? []) {
            if (frame.filename) frame.filename = scrub(frame.filename);
            if (frame.abs_path) frame.abs_path = scrub(frame.abs_path);
          }
        }
        if (event.request) event.request = { url: event.request.url ? scrub(event.request.url) : undefined };
        event.user = options.device ? { id: options.device } : undefined;
        delete event.server_name;
        return event;
      },
    });
    loaded.setTag("os", options.os);
    sentry = loaded;
  } catch (error) {
    console.error("Error reports unavailable", error);
  }
}

/** The Privacy switch: off stops reports at once. */
export function setReportsAllowed(on: boolean): void {
  allowed = on;
}

/** Send crash.log lines not sent before (desktop). */
export function reportCrashLog(log: string, store: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  if (!sentry || !allowed || !log.trim()) return;
  let lastSent = 0;
  try {
    lastSent = Number(store.getItem(SENT_KEY)) || 0;
  } catch {
    // Storage blocked: send what is there.
  }
  const lines = newCrashLines(log, lastSent);
  for (const line of lines) sentry.captureMessage(`Desktop crash: ${scrub(line.message)}`, "fatal");
  if (lines.length) {
    try {
      store.setItem(SENT_KEY, String(lines[lines.length - 1]!.at));
    } catch {
      // Ignore.
    }
  }
}
