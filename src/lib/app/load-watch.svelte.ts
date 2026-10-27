import { cleanThresholds, keepFor, loadAlert, loadLevels, shouldAlert, type LoadActionId, type LoadAlert, type LoadContext, type LoadKind, type LoadLevel, type LoadSample, type LoadThresholds } from "../domain/load-watch";

/** What the load watch needs from the session. */
export type LoadWatchHost = {
  /** One reading from the desktop core (null in a browser, or when it could not be read). */
  read: () => Promise<Omit<LoadSample, "at"> | null>;
  context: () => LoadContext;
  /** Show an alert with its actions (the desk's notice). */
  show: (alert: LoadAlert, run: (action: LoadActionId) => void) => void;
  act: (action: LoadActionId) => void;
  /** A line in the app's log, so a support file shows what the computer went through. */
  log: (line: string) => void;
};

const KEY = "church-studio:load-watch";
const OK: Record<LoadKind, LoadLevel> = { cpu: "ok", memory: "ok", "app-memory": "ok" };

/**
 * The load watch (domain/load-watch.ts has its rules): the computer's processors and memory every
 * few seconds, an alert with what can be done when a level is reached, and the readings for
 * Settings › Performance. Its thresholds and its on/off are kept on this computer.
 */
export class LoadWatch {
  latest = $state<LoadSample | null>(null);
  levels = $state<Record<LoadKind, LoadLevel>>({ ...OK });
  thresholds = $state<LoadThresholds>(cleanThresholds(null));
  alertsOn = $state(true);
  /** The alerts raised since launch, newest last (for the support file and Performance). */
  recent = $state<Array<{ at: number; kind: LoadKind; level: LoadLevel; title: string }>>([]);
  private history: LoadSample[] = [];
  private lastAlert: Partial<Record<LoadKind, number>> = {};

  constructor(private host: LoadWatchHost) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { thresholds?: unknown; alertsOn?: unknown } | null;
      this.thresholds = cleanThresholds(saved?.thresholds);
      this.alertsOn = saved?.alertsOn !== false;
    } catch {
      // Private storage off: the defaults.
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ thresholds: this.thresholds, alertsOn: this.alertsOn }));
    } catch {
      // Kept until the app closes.
    }
  }

  setThresholds = (patch: Partial<LoadThresholds>) => {
    this.thresholds = cleanThresholds({ ...this.thresholds, ...patch });
    this.save();
  };

  setAlertsOn = (on: boolean) => {
    this.alertsOn = on;
    this.save();
  };

  /** One reading, then the levels and any alert (called every few seconds). */
  tick = async (now = Date.now()) => {
    const read = await this.host.read();
    if (!read) return;
    const sample: LoadSample = { ...read, at: now };
    this.latest = sample;
    this.history = [...this.history.filter((entry) => now - entry.at <= keepFor(this.thresholds)), sample];
    const before = this.levels;
    const next = loadLevels(this.history, before, this.thresholds, now);
    this.levels = next;
    for (const kind of Object.keys(next) as LoadKind[]) {
      const level = next[kind];
      if (level !== before[kind]) this.host.log(`load: ${kind} ${before[kind]} -> ${level} (cpu ${Math.round(sample.cpu)}%, app ${Math.round(sample.appCpu)}%, free ${Math.round(sample.memoryAvailable / 1024 ** 2)} MB, app ${Math.round(sample.appMemory / 1024 ** 2)} MB)`);
      if (level === "ok" || !shouldAlert(level, before[kind], this.lastAlert[kind], now)) continue;
      this.lastAlert[kind] = now;
      const alert = loadAlert(kind, level, sample, this.host.context());
      this.recent = [...this.recent, { at: now, kind, level, title: alert.title }].slice(-20);
      if (this.alertsOn) this.host.show(alert, (action) => this.host.act(action));
    }
  };
}
