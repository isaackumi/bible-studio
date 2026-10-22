import { describe, expect, it } from "vitest";
import { checkStreamUrl, isHls } from "./stream";

describe("videos from the network", () => {
  it("takes http(s) files and HLS streams, and says plainly that RTSP cannot play here", () => {
    expect(checkStreamUrl(" https://cdn.church.org/live/index.m3u8?token=1 ")).toEqual({ ok: true, url: "https://cdn.church.org/live/index.m3u8?token=1", hls: true });
    expect(checkStreamUrl("http://192.168.1.20/clip.mp4")).toMatchObject({ ok: true, hls: false });
    expect(checkStreamUrl("rtsp://192.168.1.50:554/stream1")).toEqual({ ok: false, reason: "rtsp" });
    expect(checkStreamUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "invalid" });
    expect(checkStreamUrl("")).toEqual({ ok: false, reason: "empty" });
    expect(isHls("/a/playlist.M3U8")).toBe(true);
  });
});
