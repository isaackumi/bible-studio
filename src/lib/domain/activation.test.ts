import { describe, expect, it } from "vitest";
import { activationFrom } from "./activation";

describe("activation state from the server's answer", () => {
  it("names a full licence, one that moved away, no connection, and anything else", () => {
    expect(activationFrom(409, { full: true }, false)).toBe("full");
    expect(activationFrom(403, { moved: true }, false)).toBe("moved");
    expect(activationFrom(0, {}, true)).toBe("offline");
    expect(activationFrom(500, {}, false)).toBe("error");
    expect(activationFrom(403, { revoked: true }, false)).toBe("error");
  });
});
