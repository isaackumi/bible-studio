// Cloud sync, as this computer runs it: push what changed here, pull what changed elsewhere,
// then move the media those records use, up or down, within the plan's space. It runs on start,
// every few minutes while the app is open, and a few seconds after a save. The protocol, the
// library and the file commands come in from outside, so the whole engine runs in a test on fakes.

import { acceptChanges, applyChanges, applyConflicts, collectRecords, diffRecords, emptyManifest, hashDoc, mediaIdsIn, type Apply, type LibraryInput, type Manifest } from "../sync/records";
import type { CloudBinItem, CloudMediaItem, CloudProtocol, CloudStatus, CloudVersion } from "../sync/protocol";
import type { ServerAnswer } from "../domain/billing";

export type CloudLibrary = {
  collect(): Promise<LibraryInput>;
  apply: Apply;
  /** The pictures, videos and audio this computer has in Media: each id and its kind. */
  media(): Promise<Map<string, string>>;
};

export type CloudCommands = {
  hash(id: string): Promise<{ hash: string; bytes: number; name: string; kind: string; ext: string }>;
  upload(id: string, url: string): Promise<void>;
  download(url: string, row: { id: string; name: string; kind: string; ext: string; createdAt: string }, hash: string): Promise<void>;
  /** Fetch a file from a computer nearby on the same licence: true when one had it and it is here now. */
  nearby?(id: string): Promise<boolean>;
  readState(): Promise<string>;
  writeState(text: string): Promise<void>;
};

/** Whether this computer may sync at all: the plan and the sign-in, before the server is asked. */
export type CloudGate = () => "ok" | "free" | "signedOut" | "off";

export type CloudSyncStatus = "off" | "free" | "signedOut" | "idle" | "syncing" | "noSeat" | "readOnly" | "offline" | "error";

const EVERY_MS = 3 * 60_000;
const SOON_MS = 5000;
const PAGE = 500;
/** A file the cloud refused (full, too large, paused) is asked about again after this long. */
const REFUSED_AGAIN_MS = 60 * 60_000;

/** The manifest, with what this computer remembers about its own files. */
type Kept = Manifest & { licence?: string; fileHashes?: Record<string, { hash: string; bytes: number; name: string; kind: string }>; refused?: Record<string, number> };

/** The extension a cloud file is saved with here: from its name, else from its kind. */
function extensionFor(item: { name: string; kind: string }): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(item.name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "png";
}

export class CloudSync {
  status = $state<CloudSyncStatus>("off");
  message = $state("");
  lastSyncAt = $state<number | null>(null);
  usedBytes = $state(0);
  limitBytes = $state(0);
  over = $state(false);
  /** Media refused for want of space (or paused for everyone): "only on this computer". */
  full = $state(false);
  paused = $state(false);
  syncVideos = $state(true);
  readOnlyUntil = $state<number | null>(null);
  devices = $state<Array<{ device: string; name: string; lastSyncAt: number }>>([]);
  onlyHere = $state(new Set<string>());
  /** How many media files are still to go up or come down. */
  pendingMedia = $state(0);

  private manifest: Kept = emptyManifest();
  private loaded = false;
  private running: Promise<void> | null = null;
  /** A save landed while a run was under way: that run leaves edited records alone, and another run follows. */
  private dirty = false;
  private again = false;
  private soonTimer: ReturnType<typeof setTimeout> | undefined;
  private everyTimer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(private deps: { protocol: CloudProtocol; commands: CloudCommands; library: CloudLibrary; gate: CloudGate; now: () => number; name: () => string; onRestored?: (records: number) => void }) {}

  /** Start syncing: now, and every few minutes while the app is open. */
  start = () => {
    this.stopped = false;
    clearInterval(this.everyTimer);
    this.everyTimer = setInterval(() => void this.tick(), EVERY_MS);
    void this.syncNow();
  };

  stop = () => {
    clearInterval(this.everyTimer);
    clearTimeout(this.soonTimer);
    this.everyTimer = undefined;
  };

  /** A save just happened: sync in a few seconds, once, however many saves follow. */
  scheduleSoon = () => {
    if (this.stopped) return;
    if (this.running) {
      this.dirty = true;
      this.again = true;
    }
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => void this.syncNow(), SOON_MS);
  };

  /** The timer's turn: nothing while a refusal stands (it is tried again at the next start or sign-in). */
  tick = async () => {
    if (this.stopped) return;
    await this.syncNow();
  };

  /** Sign-in or the plan changed: refusals are forgotten and sync may run again. */
  resume = () => {
    this.stopped = false;
    void this.syncNow();
  };

  syncNow = (): Promise<void> => {
    if (this.running) return this.running;
    this.running = this.run()
      .catch(() => {
        this.status = "error";
      })
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          void this.syncNow();
        }
      });
    return this.running;
  };

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const text = await this.deps.commands.readState();
      const saved = text ? (JSON.parse(text) as Partial<Kept>) : null;
      if (saved && typeof saved === "object" && saved.hashes && typeof saved.hashes === "object") this.manifest = { seq: Number(saved.seq) || 0, hashes: saved.hashes, media: saved.media ?? {}, licence: saved.licence, fileHashes: saved.fileHashes ?? {}, refused: saved.refused ?? {} };
    } catch {
      this.manifest = emptyManifest();
    }
  }

  private async save(): Promise<void> {
    try {
      await this.deps.commands.writeState(JSON.stringify(this.manifest));
    } catch {
      // The record could not be written: the next run works it out again from the cloud.
    }
  }

  /** A refusal from the cloud: what it means for the status, and whether to stop trying. */
  private refused(answer: Extract<ServerAnswer<unknown>, { ok: false }>): void {
    const data = answer.data as { noSeat?: boolean; readOnly?: boolean; signedOut?: boolean; plan?: string; removed?: boolean };
    if (answer.offline) {
      this.status = "offline";
      this.message = answer.error;
      return;
    }
    this.message = answer.error;
    if (data.noSeat || data.removed) this.status = "noSeat";
    else if (data.readOnly) this.status = "readOnly";
    else if (data.signedOut) this.status = "signedOut";
    else if (data.plan === "free") this.status = "free";
    else {
      this.status = "error";
      return;
    }
    this.stopped = true;
  }

  private async run(): Promise<void> {
    const gate = this.deps.gate();
    if (gate !== "ok") {
      this.status = gate;
      this.message = "";
      return;
    }
    if (this.stopped) return;
    await this.load();
    this.dirty = false;
    this.status = "syncing";
    const now = this.deps.now();

    // 0. Which library, and how far it goes: another licence, or one wiped and begun again,
    //    means this computer's record of what was agreed no longer holds.
    const first = await this.deps.protocol.status();
    if (!first.ok) return this.refused(first);
    this.takeStatus(first.data);
    if ((this.manifest.licence && this.manifest.licence !== first.data.licence) || first.data.seq < this.manifest.seq) {
      this.manifest = { ...emptyManifest(), licence: first.data.licence, fileHashes: this.manifest.fileHashes ?? {}, refused: {} };
    }
    this.manifest.licence = first.data.licence;
    const fresh = Object.keys(this.manifest.hashes).length === 0;

    // 1. What changed here goes up, in pages. What the cloud kept instead comes straight back,
    //    and a copy kept here under a new name goes up in a second round.
    let library = await this.deps.library.collect();
    let records = collectRecords(library);
    const local = new Map(records.map((record) => [`${record.col}/${record.id}`, record.doc]));
    const suffix = `(from ${this.deps.name()})`;
    for (let round = 0; round < 2; round++) {
      const diff = diffRecords(records, this.manifest, now);
      this.manifest = diff.manifest;
      let copied = false;
      for (let at = 0; at < diff.changes.length; at += PAGE) {
        const page = diff.changes.slice(at, at + PAGE);
        const answer = await this.deps.protocol.push(page);
        if (!answer.ok) {
          await this.save();
          return this.refused(answer);
        }
        const lost = new Set(answer.data.conflicts.map((conflict) => `${conflict.col}/${conflict.id}`));
        this.manifest = acceptChanges(this.manifest, page.filter((change) => !lost.has(`${change.col}/${change.id}`)));
        if (answer.data.conflicts.length) {
          this.manifest = await applyConflicts(answer.data.conflicts, local, this.deps.library.apply, this.manifest, suffix);
          copied = true;
        }
      }
      if (!copied) break;
      records = collectRecords(await this.deps.library.collect());
    }

    // 2. What changed elsewhere comes down, in pages, and is written here. A record edited here
    //    while this ran is left alone: it goes up next time and wins.
    let since = this.manifest.seq;
    let arrived = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const answer = await this.deps.protocol.pull(since);
      if (!answer.ok) {
        await this.save();
        return this.refused(answer);
      }
      const live = this.dirty ? new Map(collectRecords(await this.deps.library.collect()).map((record) => [`${record.col}/${record.id}`, hashDoc(record.doc)])) : undefined;
      this.manifest = await applyChanges(answer.data.changes, this.deps.library.apply, this.manifest, live);
      arrived += answer.data.changes.filter((change) => change.doc !== null && (change.col === "song" || change.col === "service" || change.col === "sermon") && !local.has(`${change.col}/${change.id}`)).length;
      this.manifest.seq = Math.max(this.manifest.seq, answer.data.seq);
      since = answer.data.seq;
      if (!answer.data.more) break;
    }
    await this.save();
    // This computer's first sync brought records it did not have: say so, once.
    if (fresh && arrived > 0) this.deps.onRestored?.(arrived);

    // 3. The media those records use: up from here, down to here.
    library = await this.deps.library.collect();
    records = collectRecords(library);
    await this.moveMedia(mediaIdsIn(records));
    await this.save();

    const after = await this.deps.protocol.status();
    if (after.ok) this.takeStatus(after.data);
    this.status = "idle";
    this.message = "";
    this.lastSyncAt = this.deps.now();
  }

  private takeStatus(status: CloudStatus): void {
    this.usedBytes = status.usedBytes;
    this.limitBytes = status.limitBytes;
    this.over = status.over;
    this.syncVideos = status.syncVideos;
    this.readOnlyUntil = status.readOnly ? status.wipeAt : null;
    this.devices = status.devices;
  }

  /** Files the records use: send what is here and not in the cloud; fetch what the cloud has and this computer lacks. */
  private async moveMedia(needed: Set<string>): Promise<void> {
    const here = await this.deps.library.media();
    const sent = this.manifest.media ?? (this.manifest.media = {});
    const hashes = this.manifest.fileHashes ?? (this.manifest.fileHashes = {});
    const refused = this.manifest.refused ?? (this.manifest.refused = {});
    const now = this.deps.now();
    const stillHere = new Set<string>();
    let full = false;
    let paused = false;
    // Videos stay put when the switch is off; a file refused lately is not asked about again yet.
    const toSend = [...needed].filter((id) => here.has(id) && !sent[id] && (here.get(id) !== "video" || this.syncVideos));
    const toFetch = [...needed].filter((id) => !here.has(id));
    this.pendingMedia = toSend.length + toFetch.length;
    for (const id of toSend) {
      if (refused[id] && now - refused[id] < REFUSED_AGAIN_MS) {
        stillHere.add(id);
        this.pendingMedia -= 1;
        continue;
      }
      // Hashed once: a file in Media never changes its bytes.
      let hashed = hashes[id];
      if (!hashed) {
        try {
          const found = await this.deps.commands.hash(id);
          hashed = hashes[id] = { hash: found.hash, bytes: found.bytes, name: found.name, kind: found.kind };
        } catch {
          this.pendingMedia -= 1;
          continue;
        }
      }
      const claim = await this.deps.protocol.claim({ hash: hashed.hash, bytes: hashed.bytes, name: hashed.name, kind: hashed.kind, mediaId: id });
      if (!claim.ok) {
        if (!claim.offline && (claim.data as { readOnly?: boolean }).readOnly) break;
        this.pendingMedia -= 1;
        continue;
      }
      if (claim.data.stored) sent[id] = hashed.hash;
      else if (claim.data.upload) {
        try {
          await this.deps.commands.upload(id, this.deps.protocol.mediaUrl(hashed.hash));
          sent[id] = hashed.hash;
        } catch {
          stillHere.add(id);
        }
      } else {
        stillHere.add(id);
        refused[id] = now;
        if (claim.data.full || claim.data.tooLarge) full = true;
        if (claim.data.paused) paused = true;
      }
      this.pendingMedia -= 1;
    }
    // A computer nearby lends what it has first: seconds over the church network, no cloud space,
    // and even a video the cloud does not keep. What none of them has comes from the cloud.
    const missing: string[] = [];
    for (const id of toFetch) {
      if (await this.fromNearby(id)) this.pendingMedia -= 1;
      else missing.push(id);
    }
    if (missing.length) {
      const list = await this.deps.protocol.mediaList();
      if (list.ok) {
        for (const id of missing) {
          const item = list.data.items.find((entry) => entry.mediaId === id || entry.aliases?.includes(id));
          if (item && (item.kind !== "video" || this.syncVideos)) {
            try {
              await this.deps.commands.download(this.deps.protocol.mediaUrl(item.hash), { id, name: item.name, kind: item.kind, ext: extensionFor(item), createdAt: new Date(item.storedAt).toISOString() }, item.hash);
              sent[id] = item.hash;
              hashes[id] = { hash: item.hash, bytes: item.bytes, name: item.name, kind: item.kind };
            } catch {
              // Tried again next time.
            }
          }
          this.pendingMedia -= 1;
        }
      }
    }
    this.onlyHere = stillHere;
    this.full = full;
    this.paused = paused;
    this.pendingMedia = 0;
  }

  private async fromNearby(id: string): Promise<boolean> {
    try {
      return (await this.deps.commands.nearby?.(id)) ?? false;
    } catch {
      return false;
    }
  }

  // --- For the Cloud space screen ------------------------------------------------------------

  setSyncVideos = async (on: boolean): Promise<void> => {
    const answer = await this.deps.protocol.settings(on);
    if (answer.ok) this.syncVideos = answer.data.syncVideos;
  };

  media = (): Promise<ServerAnswer<{ items: CloudMediaItem[]; usedBytes: number; binBytes: number }>> => this.deps.protocol.mediaList();

  removeMedia = async (hash: string, everywhere: boolean): Promise<string | null> => {
    const answer = await this.deps.protocol.removeMedia(hash, everywhere);
    if (!answer.ok) return answer.error;
    this.usedBytes = answer.data.usedBytes;
    // Sent again only if a record still uses it and the file is here.
    for (const [id, sentHash] of Object.entries(this.manifest.media ?? {})) if (sentHash === hash) delete this.manifest.media![id];
    await this.save();
    if (everywhere) this.scheduleSoon();
    return null;
  };

  history = (col: string, id: string): Promise<ServerAnswer<{ versions: CloudVersion[] }>> => this.deps.protocol.history(col, id);
  bin = (): Promise<ServerAnswer<{ items: CloudBinItem[] }>> => this.deps.protocol.bin();
  restore = async (col: string, id: string): Promise<string | null> => {
    const answer = await this.deps.protocol.restore(col, id);
    if (!answer.ok) return answer.error;
    this.scheduleSoon();
    return null;
  };
  emptyBin = async (): Promise<string | null> => {
    const answer = await this.deps.protocol.emptyBin();
    return answer.ok ? null : answer.error;
  };

  /** Ask the cloud how things stand, without syncing. */
  refreshStatus = async (): Promise<void> => {
    if (this.deps.gate() !== "ok") return;
    const status = await this.deps.protocol.status();
    if (status.ok) this.takeStatus(status.data);
  };
}
