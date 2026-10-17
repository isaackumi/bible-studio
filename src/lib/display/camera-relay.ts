// Camera relay: the operator window owns every camera and streams it to the audience window
// over a local WebRTC link. WebKit (Tauri on macOS) lets only one window capture a camera at
// a time, so a second window opening the same camera blanks the operator's Preview and Program.

export type RelayMessage = {
  /** Camera source id (`camera:{deviceId}`); empty for `hello`. */
  id: string;
  /** One peer connection per camera; stale messages from an older link are ignored. */
  session: string;
  kind: "hello" | "offer" | "answer" | "ice" | "close" | "failed";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

export type RelayTransport = {
  send: (message: RelayMessage) => void;
  subscribe: (handler: (message: RelayMessage) => void) => () => void;
};

export function isRelayMessage(value: unknown): value is RelayMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.session === "string" &&
    ["hello", "offer", "answer", "ice", "close", "failed"].includes(message.kind as string)
  );
}

type Link = { pc: RTCPeerConnection; session: string; pending: RTCIceCandidateInit[] };

/** Highest quality the local link should carry: this never leaves the machine. */
const MAX_BITRATE = 20_000_000;

function newSession() {
  return Math.random().toString(36).slice(2, 10);
}

async function addCandidate(link: Link, candidate: RTCIceCandidateInit) {
  if (!link.pc.remoteDescription) {
    link.pending.push(candidate);
    return;
  }
  await link.pc.addIceCandidate(candidate).catch(() => {});
}

async function flushCandidates(link: Link) {
  const queued = link.pending.splice(0);
  for (const candidate of queued) await link.pc.addIceCandidate(candidate).catch(() => {});
}

/** Operator side: mirrors the open camera feeds to the audience window. */
export class CameraRelaySender {
  private links = new Map<string, Link & { stream: MediaStream }>();
  private feeds: Record<string, MediaStream> = {};
  private stop: () => void;

  constructor(
    private transport: RelayTransport,
    private makePeer: () => RTCPeerConnection = () => new RTCPeerConnection({ iceServers: [] }),
  ) {
    this.stop = transport.subscribe((message) => void this.receive(message));
  }

  sync(feeds: Record<string, MediaStream>) {
    this.feeds = feeds;
    for (const [id, link] of this.links) if (feeds[id] !== link.stream) this.close(id);
    for (const [id, stream] of Object.entries(feeds)) if (!this.links.has(id)) void this.open(id, stream);
  }

  destroy() {
    for (const id of [...this.links.keys()]) this.close(id);
    this.stop();
  }

  private async open(id: string, stream: MediaStream) {
    const pc = this.makePeer();
    const link = { pc, stream, session: newSession(), pending: [] as RTCIceCandidateInit[] };
    this.links.set(id, link);
    for (const track of stream.getVideoTracks()) pc.addTrack(track, stream);
    pc.onicecandidate = (event) => {
      if (event.candidate) this.transport.send({ id, session: link.session, kind: "ice", candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.links.get(id) === link) this.restart(id);
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.links.get(id) !== link) return;
      this.transport.send({ id, session: link.session, kind: "offer", sdp: offer.sdp ?? "" });
    } catch {
      if (this.links.get(id) === link) this.close(id);
    }
  }

  private restart(id: string) {
    this.close(id);
    const stream = this.feeds[id];
    if (stream) void this.open(id, stream);
  }

  private close(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    link.pc.close();
    this.transport.send({ id, session: link.session, kind: "close" });
  }

  private async receive(message: RelayMessage) {
    if (message.kind === "hello") {
      // The audience window (re)loaded: start every link again.
      for (const id of [...this.links.keys()]) this.restart(id);
      for (const id of Object.keys(this.feeds)) if (!this.links.has(id)) void this.open(id, this.feeds[id]!);
      return;
    }
    const link = this.links.get(message.id);
    if (!link || link.session !== message.session) return;
    if (message.kind === "failed") return this.restart(message.id);
    if (message.kind === "ice" && message.candidate) return addCandidate(link, message.candidate);
    if (message.kind !== "answer" || !message.sdp) return;
    try {
      await link.pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
      await flushCandidates(link);
      for (const sender of link.pc.getSenders()) {
        const params = sender.getParameters();
        if (!params.encodings?.length) continue;
        params.encodings[0]!.maxBitrate = MAX_BITRATE;
        (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-resolution";
        await sender.setParameters(params).catch(() => {});
      }
    } catch {
      this.restart(message.id);
    }
  }
}

/** Audience side: receives each camera as a live stream. */
export class CameraRelayReceiver {
  private links = new Map<string, Link>();
  private stop: () => void;

  constructor(
    private transport: RelayTransport,
    private onfeed: (id: string, stream: MediaStream | null) => void,
    private makePeer: () => RTCPeerConnection = () => new RTCPeerConnection({ iceServers: [] }),
  ) {
    this.stop = transport.subscribe((message) => void this.receive(message));
    transport.send({ id: "", session: "", kind: "hello" });
  }

  destroy() {
    for (const link of this.links.values()) link.pc.close();
    this.links.clear();
    this.stop();
  }

  private drop(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    link.pc.close();
    this.onfeed(id, null);
  }

  private async receive(message: RelayMessage) {
    const { id, session } = message;
    if (message.kind === "close") {
      if (this.links.get(id)?.session === session) this.drop(id);
      return;
    }
    if (message.kind === "ice" && message.candidate) {
      const link = this.links.get(id);
      if (link?.session === session) await addCandidate(link, message.candidate);
      return;
    }
    if (message.kind !== "offer" || !message.sdp) return;
    this.drop(id);
    const pc = this.makePeer();
    const link: Link = { pc, session, pending: [] };
    this.links.set(id, link);
    pc.ontrack = (event) => {
      if (this.links.get(id) === link) this.onfeed(id, event.streams[0] ?? new MediaStream([event.track]));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) this.transport.send({ id, session, kind: "ice", candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.links.get(id) === link) this.transport.send({ id, session, kind: "failed" });
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
      await flushCandidates(link);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.links.get(id) === link) this.transport.send({ id, session, kind: "answer", sdp: answer.sdp ?? "" });
    } catch {
      if (this.links.get(id) === link) this.transport.send({ id, session, kind: "failed" });
    }
  }
}

/** Desktop: Tauri events between windows. `out` flows operator → audience, `back` the other way. */
export async function tauriRelayTransport(side: "operator" | "audience"): Promise<RelayTransport> {
  const { emit, listen } = await import("@tauri-apps/api/event");
  const sendName = side === "operator" ? "camera-relay-out" : "camera-relay-back";
  const listenName = side === "operator" ? "camera-relay-back" : "camera-relay-out";
  const handlers = new Set<(message: RelayMessage) => void>();
  const unlisten = await listen<unknown>(listenName, (event) => {
    if (isRelayMessage(event.payload)) for (const handler of handlers) handler(event.payload);
  });
  return {
    send: (message) => void emit(sendName, message).catch(() => {}),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
        if (!handlers.size) unlisten();
      };
    },
  };
}

/** Browser builds: same relay over a BroadcastChannel (used when the relay is switched on for testing). */
export function broadcastRelayTransport(side: "operator" | "audience"): RelayTransport {
  const out = new BroadcastChannel("church-studio.camera-relay-out");
  const back = new BroadcastChannel("church-studio.camera-relay-back");
  const [sendOn, listenOn] = side === "operator" ? [out, back] : [back, out];
  return {
    send: (message) => sendOn.postMessage(message),
    subscribe: (handler) => {
      const onMessage = (event: MessageEvent) => isRelayMessage(event.data) && handler(event.data);
      listenOn.addEventListener("message", onMessage);
      return () => {
        listenOn.removeEventListener("message", onMessage);
        out.close();
        back.close();
      };
    },
  };
}

/** The relay runs on desktop always; in a browser only when switched on (tests, debugging). */
export function relayEnabled(desktop: boolean, storage: Pick<Storage, "getItem"> | null): boolean {
  if (desktop) return true;
  try {
    return storage?.getItem("church-studio.camera-relay") === "1";
  } catch {
    return false;
  }
}
