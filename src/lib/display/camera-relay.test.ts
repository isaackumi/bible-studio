import { describe, expect, it } from "vitest";
import { isRelayMessage, relayEnabled } from "./camera-relay";

describe("camera relay", () => {
  it("accepts only well-formed relay messages", () => {
    expect(isRelayMessage({ id: "camera:a", session: "s1", kind: "offer", sdp: "v=0" })).toBe(true);
    expect(isRelayMessage({ id: "", session: "", kind: "hello" })).toBe(true);
    expect(isRelayMessage({ id: "camera:a", session: "s1", kind: "steal" })).toBe(false);
    expect(isRelayMessage({ id: 1, session: "s1", kind: "offer" })).toBe(false);
    expect(isRelayMessage(null)).toBe(false);
  });

  it("always relays on desktop, and in a browser only when switched on", () => {
    expect(relayEnabled(true, null)).toBe(true);
    expect(relayEnabled(false, null)).toBe(false);
    expect(relayEnabled(false, { getItem: () => "1" })).toBe(true);
    expect(relayEnabled(false, { getItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
});
