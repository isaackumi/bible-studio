import { readRemoteEnvelope, remoteEnvelope, type RemoteEnvelope } from "../domain/remote";

const NAME = "church-studio.remote";

export function publishRemote(type: string, payload: Record<string, string> = {}) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(NAME);
  channel.postMessage(remoteEnvelope(type, payload));
  channel.close();
}

export function subscribeRemote(onMessage: (envelope: RemoteEnvelope) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(NAME);
  channel.onmessage = (event) => {
    const parsed = readRemoteEnvelope(event.data);
    if (parsed) onMessage(parsed);
  };
  return () => channel.close();
}
