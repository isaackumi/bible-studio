import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { aiFeatureOn, aiReady } from "../ai/summarize";
import { isOnlineTranslation } from "../bible/online-bibles";
import { QUALITIES, streamTarget } from "../domain/broadcast";
import { SERVER_URL, type EntitlementStatus } from "../domain/billing";
import { healthRows, healthTips, type Frames, type HealthFacts } from "../domain/health";
import type { SlideDeck } from "../domain/decks";
import type { PlanId } from "../domain/plans";
import { aiCheck, backupCheck, internetCheck, libraryCheck, planCheck, screenCheck, serviceCheck, sortChecks, spaceCheck, type ReadyCheck } from "../domain/readiness";
import type { MediaAsset, OutputStatus, Sermon, Service, Song, Workspace } from "../domain/types";
import { t } from "../i18n/core";
import { APP_VERSION } from "../platform/runtime";
import { problemReport, readProblems } from "./diagnostics";

/** What the checks read from the session (all of it as it is now, at the moment of checking). */
export type ChecksHost = {
  readonly workspace: Workspace;
  readonly media: MediaAsset[];
  readonly songs: Song[];
  readonly decks: SlideDeck[];
  readonly services: Array<{ id: string }>;
  readonly service: Service | null;
  readonly sermons: Sermon[];
  readonly remoteVia: "lan" | "internet";
  readonly remoteDevices: readonly unknown[];
  readonly output: OutputStatus;
  readonly plan: PlanId;
  readonly ent: EntitlementStatus;
  aiModels(): Promise<string[]>;
};

/**
 * Settings › Readiness check, Settings › Performance and the support file: what the service depends
 * on, how the app runs on this computer, and a report for the developer with nothing private in it.
 */
export class ServiceChecks {
  constructor(
    private readonly host: ChecksHost,
    private readonly desktop: () => boolean,
  ) {}

  /** Recording speed in kbps: the chosen quality's video plus the sound. */
  recordKbps(): number {
    return QUALITIES[this.host.workspace.broadcast.quality].videoKbps + 192;
  }

  /** Room left for recordings, in bytes (desktop only; null when it cannot be told). */
  recordRoom(): Promise<number | null> {
    return this.desktop() ? invoke<number | null>("record_room", { folder: this.host.workspace.broadcast.recordFolder || null }).catch(() => null) : Promise.resolve(null);
  }

  /** Readiness check: everything the service depends on, checked in one go, worst first. */
  ready = async (): Promise<ReadyCheck[]> => {
    const desktop = this.desktop();
    const media = new Map(this.host.media.map((asset) => [asset.id, asset]));
    const songs = new Set(this.host.songs.map((song) => song.id));
    const decks = new Set(this.host.decks.map((deck) => deck.id));
    const items = this.host.service?.sections.flatMap((section) => section.items) ?? [];
    // What each item needs: a file (by its place in `paths`), or a song or deck that must exist.
    const paths: string[] = [];
    const needs = items.map((item) => {
      const assetId = item.image?.assetId ?? item.video?.assetId ?? item.slide?.imageId ?? null;
      if (assetId) {
        const asset = media.get(assetId);
        if (!asset) return { title: item.title, gone: true, path: -1 };
        paths.push(asset.path);
        return { title: item.title, gone: false, path: paths.length - 1 };
      }
      if (item.lyric) return { title: item.title, gone: !songs.has(item.lyric.songId), path: -1 };
      if (item.deck) return { title: item.title, gone: !decks.has(item.deck.deckId), path: -1 };
      return { title: item.title, gone: false, path: -1 };
    });
    const facts = desktop ? await invoke<{ missing: number[]; libraryOk: boolean }>("ready_facts", { paths: desktop ? paths : [] }).catch(() => null) : null;
    const missingFiles = new Set(facts?.missing ?? []);
    const missing = needs.filter((need) => need.gone || (need.path >= 0 && missingFiles.has(need.path))).map((need) => need.title || t("Untitled"));

    const ai = this.host.workspace.ai;
    const aiUsed = aiReady(ai) && (["summary", "slides", "songSuggest", "songLookup", "captions", "verses", "games"] as const).some((feature) => aiFeatureOn(ai, feature));
    const needed = [
      ...(aiUsed && ai.provider !== "local" ? [t("the AI")] : []),
      ...(this.host.remoteVia === "internet" && this.host.remoteDevices.length ? [t("the phone remote")] : []),
      ...(items.some((item) => item.bible && isOnlineTranslation(item.bible.translationId)) ? [t("online Bibles")] : []),
      ...("url" in streamTarget(this.host.workspace.broadcast) ? [t("streaming")] : []),
    ];
    const online = needed.length ? await this.reachable() : true;

    const checks: Array<ReadyCheck | null> = [
      screenCheck({ online: this.host.output.online, displayName: this.host.output.displayName, screens: this.host.output.displays.length, mode: this.host.output.mode, os: typeof navigator === "undefined" ? "other" : /Windows/i.test(navigator.userAgent) ? "windows" : /Mac/i.test(navigator.userAgent) ? "mac" : "other" }),
      serviceCheck({ name: this.host.service?.name ?? null, missing }),
      desktop ? spaceCheck({ free: await this.recordRoom(), kbps: this.recordKbps() }) : null,
      backupCheck({ folder: this.host.workspace.backup.folder, lastAt: this.host.workspace.backup.lastAt ?? null, now: Date.now(), desktop }),
      planCheck({ plan: this.host.plan, endsAt: this.host.ent.endsAt, renewBy: this.host.ent.kind === "license" ? this.host.ent.renewBy : null, now: Date.now(), dateText: (time) => new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "long" }) }),
      facts ? libraryCheck(facts.libraryOk) : null,
      internetCheck(online, needed),
      aiUsed && online ? aiCheck({ problem: await this.host.aiModels().then(() => null, (error: unknown) => (error instanceof Error ? error.message : String(error))) }) : null,
    ];
    return sortChecks(checks.filter((check): check is ReadyCheck => check !== null));
  };

  /** The audience window's last smoothness measurement (Settings › Performance). */
  lastFrames = $state<Frames | null>(null);

  /** Ask the audience window to watch its frames for a few seconds. Null when it is closed or quiet. */
  measureSmoothness = async (): Promise<Frames | null> => {
    if (!this.desktop() || !this.host.output.online) return null;
    const answer = new Promise<Frames | null>((resolve) => {
      let stop = () => {};
      const timer = setTimeout(() => { stop(); resolve(null); }, 9000);
      void listen<Frames>("audience-frames", (event) => { clearTimeout(timer); stop(); resolve(event.payload); }).then((unlisten) => (stop = unlisten));
    });
    await emit("measure-frames", { ms: 5000 }).catch(() => {});
    this.lastFrames = await answer;
    return this.lastFrames;
  };

  /** What the core knows about this computer and recent launches (desktop), unprocessed: for support. */
  private async healthRaw() {
    if (!this.desktop()) return null;
    type Raw = { startups: Array<{ at: number; ms: number; steps: Array<[string, number]> }>; hangs: Array<{ at: number; seconds: number; during: string }>; memory: { total: number; available: number; app: number }; libraryFree: number | null; uptimeSecs: number };
    const [raw, usage, unused] = await Promise.all([
      invoke<Raw>("health_facts").catch(() => null),
      invoke<{ library: number; media: number; models: number; cache: number }>("storage_usage").catch(() => null),
      invoke<Array<{ bytes: number }>>("storage_unused_media").catch(() => [] as Array<{ bytes: number }>),
    ]);
    return { raw, usage, unusedBytes: unused.reduce((sum, item) => sum + item.bytes, 0) };
  }

  /** Settings › Performance: how it is running here, and what to do about it. */
  health = async () => {
    const found = await this.healthRaw();
    const facts: HealthFacts = {
      launches: found?.raw?.startups.map((startup) => startup.ms) ?? [],
      hangs: found?.raw?.hangs ?? [],
      memory: found?.raw?.memory ?? null,
      libraryFree: found?.raw?.libraryFree ?? null,
      frames: this.lastFrames,
      audienceOpen: this.host.output.online,
      spare: { model: this.host.workspace.voice.engine === "accurate" ? 0 : (found?.usage?.models ?? 0), cache: found?.usage?.cache ?? 0, unused: found?.unusedBytes ?? 0 },
      dateText: (at) => new Date(at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long" }),
    };
    return { rows: healthRows(facts), tips: healthTips(facts), desktop: this.desktop() };
  };

  /**
   * The support file: everything a developer needs to see what went wrong, and nothing private (no
   * keys, passwords, songs, sermons or notes). The church saves it and sends it in; nothing is sent by itself.
   */
  supportFile = async (): Promise<string> => {
    const desktop = this.desktop();
    const [found, crashLog, logTail, ready] = await Promise.all([
      this.healthRaw(),
      desktop ? invoke<string>("crash_log").catch(() => "") : Promise.resolve(""),
      desktop ? invoke<string>("diagnostic_log").catch(() => "") : Promise.resolve(""),
      this.ready().catch(() => []),
    ]);
    const mb = (bytes: number | null | undefined) => (bytes === null || bytes === undefined ? "unknown" : `${Math.round(bytes / 1_000_000)} MB`);
    const when = (secs: number) => new Date(secs * 1000).toISOString();
    const raw = found?.raw;
    const sections: Array<[string, string]> = [
      ["Plan", `${this.host.plan} (${this.host.ent.kind ?? "none"}${this.host.ent.reason ? `, free because: ${this.host.ent.reason}` : ""}${this.host.ent.endsAt ? `, ends ${new Date(this.host.ent.endsAt).toISOString()}` : ""}${this.host.ent.renewBy ? `, renew by ${new Date(this.host.ent.renewBy).toISOString()}` : ""})`],
      ["Screens", [`audience: ${this.host.output.online ? "open" : "closed"} (${this.host.output.mode}) on ${this.host.output.displayName || "-"}`, ...this.host.output.displays.map((display) => `- ${display.name} ${display.width}x${display.height}${display.primary ? " (primary)" : ""}`)].join("\n")],
      ["Readiness", ready.map((check) => `- [${check.state}] ${check.id}: ${t(check.title, check.values)}`).join("\n")],
      ["Launches (ms until the desk was ready)", (raw?.startups ?? []).map((startup) => `- ${when(startup.at)}: ${startup.ms} ms; ${startup.steps.map(([name, ms]) => `${name} ${ms}`).join(", ")}`).join("\n")],
      ["Freezes, last 30 days", (raw?.hangs ?? []).map((hang) => `- ${when(hang.at)}: ${hang.seconds}s while ${hang.during}`).join("\n") || "none"],
      ["Memory", raw ? `computer ${mb(raw.memory.available)} free of ${mb(raw.memory.total)}; app core ${mb(raw.memory.app)}; up ${raw.uptimeSecs}s` : ""],
      ["Space", found ? `library drive free ${mb(raw?.libraryFree)}; library ${mb(found.usage?.library)}, media ${mb(found.usage?.media)}, speech model ${mb(found.usage?.models)}, cache ${mb(found.usage?.cache)}, unused media ${mb(found.unusedBytes)}` : ""],
      ["Smoothness", this.lastFrames ? `${this.lastFrames.fps} fps, ${this.lastFrames.hiccups} hiccups, worst ${this.lastFrames.worstMs} ms` : "not measured"],
      ["Settings (no keys)", [`language ${this.host.workspace.appearance.language ?? "en"}`, `listening ${this.host.workspace.voice.engine ?? "system"}`, `AI ${aiReady(this.host.workspace.ai) ? this.host.workspace.ai.provider : "off"}${this.host.workspace.ai.features ? ` ${JSON.stringify(this.host.workspace.ai.features)}` : ""}`, `recording ${this.host.workspace.broadcast.quality}`, `backup ${this.host.workspace.backup.folder ? `on, last ${this.host.workspace.backup.lastAt || "never"}` : "off"}`].join("; ")],
      ["Log (last lines)", logTail],
    ];
    return problemReport({
      version: APP_VERSION,
      platform: desktop ? "Desktop app" : "Browser",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      counts: { songs: this.host.songs.length, services: this.host.services.length, sermons: this.host.sermons.length, decks: this.host.decks.length, media: this.host.media.length },
      problems: readProblems(),
      crashLog,
      sections,
    });
  };

  /** Whether the internet answers (a quick request; the address is never shown). */
  private async reachable(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    try {
      await fetch(SERVER_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(5000) });
      return true;
    } catch {
      return false;
    }
  }
}
