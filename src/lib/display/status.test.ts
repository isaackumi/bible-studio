import { describe, expect, it } from "vitest";
import type { DisplayInfo, OutputStatus } from "../domain/types";
import { audienceDeskLine, audienceStatus } from "./status";

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

  it("names a connected external display before output is opened", () => {
    const status = audienceStatus(output({ displays: [display({ primary: false })] }), true);
    expect(status.title).toBe("DELL U2415");
    expect(status.detail).toContain("External display detected");
  });

  it("stays closed when only the built-in display is connected", () => {
    expect(audienceStatus(output({ displays: [display({ primary: true, name: "Built-in" })] }), true)).toEqual({
      title: "Audience is closed",
      detail: "No external display is connected. Connect one, or choose this screen.",
    });
  });

  it("puts name, size, and mode on the desk without the settings sentence", () => {
    expect(
      audienceDeskLine(
        output({
          desired: true,
          online: true,
          mode: "fullscreen",
          displays: [display({ name: "DELL U2415", audience: true })],
        }),
        true,
      ),
    ).toEqual({ title: "DELL U2415", line: "1920×1200 · Fullscreen" });
    expect(audienceDeskLine(output({ displays: [display({ primary: false })] }), true)).toEqual({
      title: "DELL U2415",
      line: "1920×1200 · Closed",
    });
    expect(audienceDeskLine(output({ desired: true, online: true }), false)).toEqual({
      title: "Audience window is open",
      line: "Window",
    });
    expect(audienceDeskLine(output({}), false)).toEqual({
      title: "Audience is closed",
      line: "Closed",
    });
  });
});
