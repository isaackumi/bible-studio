import { describe, expect, it } from "vitest";
import { isDesktop, platformCapabilities } from "./runtime";

describe("platform runtime", () => {
  it("treats this test process as the web target", () => {
    expect(isDesktop()).toBe(false);
    expect(platformCapabilities()).toMatchObject({
      platform: "web",
      supportsNativeWindows: false,
      supportsMultipleDisplays: false,
      supportsOfflineStorage: true,
      supportsNativeMediaDevices: false,
      supportsAudienceWindow: true,
      audienceOutput: "browser-window",
    });
  });

  it("describes the desktop shell without granting display control to the browser", () => {
    expect(platformCapabilities(true)).toMatchObject({
      platform: "desktop",
      supportsNativeWindows: true,
      supportsMultipleDisplays: true,
      audienceOutput: "native-window",
    });
  });
});
