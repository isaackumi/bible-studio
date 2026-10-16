import { describe, expect, it } from "vitest";
import { randomCode, randomToken, sha256Hex } from "./crypto";

describe("remote crypto", () => {
  it("makes url-safe 256-bit tokens and six-digit codes", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
    for (let i = 0; i < 50; i += 1) expect(randomCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it("hashes with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
