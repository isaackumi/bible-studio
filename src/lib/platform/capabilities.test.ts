import { describe, expect, it } from "vitest";
import { canUse } from "./capabilities";

describe("capabilities", () => {
  it("keeps the offline operator available and leaves commercial add-ons closed", () => {
    expect(canUse("workspace")).toBe(true);
    expect(canUse("audience-output")).toBe(true);
    expect(canUse("bible")).toBe(true);
    expect(canUse("voice-detect")).toBe(true);
    expect(canUse("stage-display")).toBe(false);
    expect(canUse("ndi")).toBe(false);
    expect(canUse("cloud-sync")).toBe(false);
    expect(canUse("ai")).toBe(false);
  });
});