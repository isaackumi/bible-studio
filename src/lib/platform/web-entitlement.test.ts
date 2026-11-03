import { describe, expect, it } from "vitest";
import { localUnlimited } from "./web-entitlement";

describe("localUnlimited", () => {
  it("unlocks a development build opened on this computer", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "LOCALHOST"]) expect(localUnlimited(host, true)).toBe(true);
  });
  it("never unlocks a shipped build, or another address", () => {
    expect(localUnlimited("localhost", false)).toBe(false);
    expect(localUnlimited("church-studio.heitechinc.com", true)).toBe(false);
    expect(localUnlimited("192.168.1.20", true)).toBe(false);
    expect(localUnlimited("localhost.evil.example", true)).toBe(false);
  });
});
