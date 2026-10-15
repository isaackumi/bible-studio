import { isLanRemoteOrigin, readRemoteEnvelope, remoteEnvelope, type RemoteEnvelope } from "../domain/remote";

export { isLanRemoteOrigin };

export async function postRemoteEnvelope(base: string, envelope: RemoteEnvelope): Promise<RemoteEnvelope | null> {
  const url = new URL("v1/remote", base.endsWith("/") ? base : `${base}/`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  try {
    return readRemoteEnvelope(await response.json());
  } catch {
    return remoteEnvelope("denied", { reason: "The desk did not answer." });
  }
}
