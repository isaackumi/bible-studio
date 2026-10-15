import { describe, expect, it } from "vitest";
import { detectOutputCapabilities } from "./output-capabilities";

describe("output capabilities", () => {
  it("does not grant the browser native monitor placement", () => {
    expect(
      detectOutputCapabilities({
        desktop: false,
        open: () => null,
        getScreenDetails: async () => ({}),
        fullscreenEnabled: true,
        getUserMedia: () => Promise.resolve(null),
        rtcPeerConnection: function RTCPeerConnection() {},
      }),
    ).toEqual({
      canOpenAudienceWindow: true,
      canRequestFullscreen: true,
      canEnumerateScreens: true,
      canPlaceWindow: false,
      canUseCamera: true,
      canUseMicrophone: true,
      canUseWebRTC: true,
    });
  });

  it("lets the desktop shell place the audience window", () => {
    expect(detectOutputCapabilities({ desktop: true })).toMatchObject({
      canOpenAudienceWindow: true,
      canPlaceWindow: true,
      canEnumerateScreens: true,
      canRequestFullscreen: true,
    });
  });

  it("stays honest in a bare test process", () => {
    expect(detectOutputCapabilities({ desktop: false })).toEqual({
      canOpenAudienceWindow: false,
      canRequestFullscreen: false,
      canEnumerateScreens: false,
      canPlaceWindow: false,
      canUseCamera: false,
      canUseMicrophone: false,
      canUseWebRTC: false,
    });
  });
});
