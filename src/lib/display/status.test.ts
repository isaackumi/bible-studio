import { describe, expect, it } from "vitest";
import type { DisplayInfo, OutputStatus } from "../domain/types";
import { audienceStatus } from "./status";

function display(patch: Partial<DisplayInfo>): DisplayInfo {
  return {
    key: "dell",
    name: "DELL U2415",
    x: -1920,
    y: 0,
    width: 1920,
    height: 1200,
    scale: 1,
    primary: false,
    audience: false,
    ...patch,
  };
}

function output(patch: Partial<OutputStatus>): OutputStatus {
  return {
    desired: false,
    online: false,
    displayName: "",
    message: "Audience output is closed.",
    audienceKey: null,
    operatorKey: null,
    displays: [],
    mode: "window",
    ...patch,
  };
}

describe("audience status", () => {
  it("names the screen that is actually showing Program", () => {
    const status = audienceStatus(
      output({
        desired: true,
        online: true,
        message: "Audience on Monitor #41146",
        displays: [display({ name: "Monitor #41146", audience: true })],
      }),
      true,
    );
    expect(status.title).toBe("Monitor #41146");
    expect(status.detail).toBe("External display · 1920 × 1200 · Window");
  });

  it("stays closed until output is opened", () => {
    expect(audienceStatus(output({}), true)).toEqual({
      title: "Audience is closed",
      detail: "Open output when you are ready to show Program.",
    });
  });
});
