import { describe, expect, it } from "vitest";
import { defaultBroadcast, elapsed, recordingStamp, sanitizeBroadcast, streamTarget } from "./broadcast";

describe("going live", () => {
  it("builds the stream address for each service", () => {
    expect(streamTarget({ ...defaultBroadcast(), key: "abcd-efgh" })).toEqual({ url: "rtmps://a.rtmps.youtube.com/live2/abcd-efgh" });
    expect(streamTarget({ ...defaultBroadcast(), service: "facebook", key: "FB-1?s_bl=1" })).toEqual({ url: "rtmps://live-api-s.facebook.com:443/rtmp/FB-1?s_bl=1" });
    expect(streamTarget({ ...defaultBroadcast(), service: "custom", server: "rtmp://192.168.1.5/live/", key: "church" })).toEqual({ url: "rtmp://192.168.1.5/live/church" });
  });

  it("says what is missing", () => {
    expect(streamTarget(defaultBroadcast())).toEqual({ missing: "key" });
    expect(streamTarget({ ...defaultBroadcast(), service: "custom", server: "https://x", key: "k" })).toEqual({ missing: "server" });
    expect(streamTarget({ ...defaultBroadcast(), key: "has space" })).toEqual({ missing: "key" });
  });

  it("cleans saved settings and formats times", () => {
    expect(sanitizeBroadcast({ service: "twitch", quality: "8k" })).toMatchObject({ service: "youtube", quality: "1080p", sound: true });
    expect(elapsed(65)).toBe("01:05");
    expect(elapsed(3725)).toBe("1:02:05");
    expect(recordingStamp(new Date(2026, 9, 18, 10, 30))).toBe("2026-10-18 10-30");
  });
});
