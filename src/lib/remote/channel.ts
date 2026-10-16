import { readRemoteEnvelope, remoteEnvelope, type RemoteEnvelope } from "../domain/remote";

/** Same-origin remote (a pad window on this computer): requests and replies on separate channels. */
const REQUESTS = "church-studio.remote";
const REPLIES = "church-studio.remote.reply";

type Wire = { rid: string; envelope: RemoteEnvelope };

/** Desk side: answer each request on the reply channel with the same request id. */
export function serveRemote(handle: (envelope: RemoteEnvelope) => Promise<RemoteEnvelope>): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const requests = new BroadcastChannel(REQUESTS);
  const replies = new BroadcastChannel(REPLIES);
  requests.onmessage = (event) => {
    const wire = event.data as Partial<Wire> | null;
    const envelope = readRemoteEnvelope(wire?.envelope);
    if (!wire?.rid || !envelope) return;
    void handle(envelope).then((reply) => replies.postMessage({ rid: wire.rid, envelope: reply }));
  };
  return () => {
    requests.close();
    replies.close();
  };
}

/** Pad side: one request, one reply, or null when no desk answers in time. */
export function requestLocal(envelope: RemoteEnvelope, timeoutMs = 3000): Promise<RemoteEnvelope | null> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(null);
  const rid = crypto.randomUUID();
  const replies = new BroadcastChannel(REPLIES);
  const requests = new BroadcastChannel(REQUESTS);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(value: RemoteEnvelope | null) {
      clearTimeout(timer);
      replies.close();
      requests.close();
      resolve(value);
    }
    replies.onmessage = (event) => {
      const wire = event.data as Partial<Wire> | null;
      if (wire?.rid === rid) finish(readRemoteEnvelope(wire.envelope) ?? remoteEnvelope("denied", { reason: "Bad reply." }));
    };
    requests.postMessage({ rid, envelope });
  });
}
