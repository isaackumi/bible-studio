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

describe("a live stream that stops", () => {
  it("reloads after a growing wait on a dropped connection, recovers bad decoding twice, then gives up", async () => {
    const { streamRecovery } = await import("./stream");
    let tries = { network: 0, media: 0 };
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const step = streamRecovery("network", tries);
      expect(step.action).toBe("reload");
      waits.push(step.waitMs);
      tries = step.tries;
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(streamRecovery("network", tries).action).toBe("give-up");
    tries = { network: 0, media: 0 };
    expect(streamRecovery("media", tries).action).toBe("recover");
    expect(streamRecovery("media", { network: 0, media: 2 }).action).toBe("give-up");
    expect(streamRecovery("other", tries).action).toBe("give-up");
  });
});

