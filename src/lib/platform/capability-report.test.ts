import { describe, expect, it } from "vitest";
import { capabilityReport } from "./capability-report";
import { detectOutputCapabilities } from "./output-capabilities";

const row = (rows: ReturnType<typeof capabilityReport>, id: string) => rows.find((entry) => entry.id === id)!;

describe("capability report", () => {
  it("explains what the browser cannot do and why", () => {
    const caps = detectOutputCapabilities({ desktop: false, open: () => null, fullscreenEnabled: true, getUserMedia: () => null });
    const rows = capabilityReport({ desktop: false, caps, speech: false, screenDetails: false, secure: true, os: "mac" });
    expect(row(rows, "remote")).toMatchObject({ available: false, detail: expect.stringContaining("desktop app") });
    expect(row(rows, "voice")).toMatchObject({ available: false, detail: expect.stringContaining("Chrome or Edge") });
    expect(row(rows, "placement").available).toBe(false);
    expect(row(rows, "camera").available).toBe(true);
    expect(row(rows, "ndi").available).toBe(false);
  });

  it("blocks camera and microphone off HTTPS", () => {
    const caps = detectOutputCapabilities({ desktop: false, open: () => null, getUserMedia: () => null });
    const rows = capabilityReport({ desktop: false, caps, speech: true, screenDetails: true, secure: false, os: "linux" });
    expect(row(rows, "camera")).toMatchObject({ available: false, detail: expect.stringContaining("HTTPS") });
    expect(row(rows, "voice").available).toBe(false);
    expect(row(rows, "placement").available).toBe(true);
  });

  it("gives the desktop app the remote, placement and on-device voice on macOS", () => {
    const rows = capabilityReport({ desktop: true, caps: detectOutputCapabilities({ desktop: true }), speech: false, screenDetails: false, secure: true, os: "mac" });
    expect(["audience", "placement", "remote", "voice", "camera"].every((id) => row(rows, id).available)).toBe(true);
  });

  it("lets the Windows app listen too, and says Linux needs a speech service", () => {
    const voice = (os: "windows" | "linux") => capabilityReport({ desktop: true, caps: detectOutputCapabilities({ desktop: true }), speech: false, screenDetails: false, secure: true, os }).find((row) => row.id === "voice");
    expect(voice("windows")).toMatchObject({ available: true, detail: expect.stringContaining("Windows") });
    expect(voice("linux")?.available).toBe(false);
  });
});
