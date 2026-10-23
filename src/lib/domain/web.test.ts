import { describe, expect, it } from "vitest";
import { cleanWebUrl, webTarget } from "./web";

describe("web sources", () => {
  it("accepts links without https and refuses other schemes", () => {
    expect(cleanWebUrl("gracechapel.org/live")).toBe("https://gracechapel.org/live");
    expect(cleanWebUrl("javascript:alert(1)")).toBeNull();
    expect(cleanWebUrl("file:///etc/passwd")).toBeNull();
    expect(cleanWebUrl("not a link")).toBeNull();
  });

  it("turns YouTube watch, short and live links into a player", () => {
    expect(webTarget("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")?.url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1&start=42",
    );
    expect(webTarget("youtu.be/dQw4w9WgXcQ")?.kind).toBe("youtube");
    expect(webTarget("https://youtube.com/live/abcdefghijk", { mute: true })?.url).toContain("mute=1");
  });

  it("turns Vimeo and Google Slides links into players", () => {
    expect(webTarget("https://vimeo.com/123456789")?.url).toBe("https://player.vimeo.com/video/123456789?autoplay=1&muted=0&title=0&byline=0");
    expect(webTarget("https://docs.google.com/presentation/d/1AbCdEf/edit#slide=id.p")?.url).toBe(
      "https://docs.google.com/presentation/d/1AbCdEf/embed?start=false&loop=false&delayms=60000&rm=minimal",
    );
  });

  it("shows any other page as a website", () => {
    expect(webTarget("https://example.org/announcements")).toEqual({ kind: "website", url: "https://example.org/announcements", label: "example.org" });
  });
});

describe("muted players for desk monitors", () => {
  it("mutes YouTube and Vimeo, leaves pages alone", async () => {
    const { mutedUrl } = await import("./web");
    expect(mutedUrl("https://www.youtube-nocookie.com/embed/x?mute=0", "youtube")).toContain("mute=1");
    expect(mutedUrl("https://player.vimeo.com/video/1?muted=0", "vimeo")).toContain("muted=1");
    expect(mutedUrl("https://example.org/", "website")).toBe("https://example.org/");
  });

  it("loops a YouTube video as its own playlist, and a Vimeo video with loop", () => {
    const youtube = new URL(webTarget("https://youtu.be/dQw4w9WgXcQ", { loop: true })!.url);
    expect(youtube.searchParams.get("loop")).toBe("1");
    expect(youtube.searchParams.get("playlist")).toBe("dQw4w9WgXcQ");
    expect(new URL(webTarget("https://youtu.be/dQw4w9WgXcQ")!.url).searchParams.get("loop")).toBeNull();
    expect(webTarget("https://vimeo.com/76979871", { loop: true })!.url).toContain("&loop=1");
  });
});

