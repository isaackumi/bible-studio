import { describe, expect, it } from "vitest";
import { micVerdict } from "./mic-test";

const fill = (count: number, level: number) => Array.from({ length: count }, () => level);

describe("microphone test verdict", () => {
  it("passes a microphone that hears sound and stays connected", () => {
    expect(micVerdict([...fill(20, 0.005), ...fill(30, 0.1), ...fill(150, 0.01)], false).status).toBe("ok");
  });
  it("reports a microphone that hears nothing", () => {
    expect(micVerdict(fill(200, 0.004), false).status).toBe("quiet");
  });
  it("catches a microphone that drops to digital silence after working", () => {
    expect(micVerdict([...fill(30, 0.1), ...fill(40, 0)], false).status).toBe("cut-out");
  });
  it("catches a track that ended during the test", () => {
    expect(micVerdict(fill(50, 0.1), true).status).toBe("cut-out");
  });
});
