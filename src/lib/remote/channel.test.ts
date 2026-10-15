import { describe, expect, it } from "vitest";
import { readRemoteEnvelope, remoteEnvelope } from "../domain/remote";

describe("remote channel", () => {
  it("wraps a command in protocol v1", () => {
    const envelope = remoteEnvelope("command", { token: "tok", id: "take" });
    expect(readRemoteEnvelope(envelope)).toEqual(envelope);
    expect(readRemoteEnvelope({ type: "command", payload: { id: "take" } })).toBeNull();
  });
});
