import { describe, expect, it } from "vitest";
import { lanMediaToken, lanSafe } from "./lan-safe";

describe("a screen sent to a TV over the church Wi-Fi", () => {
  it("points this computer's pictures at the desk's own address, and leaves out what only works here", () => {
    const mac = `asset://localhost/${encodeURIComponent("/Users/me/Media/welcome slide.png")}`;
    const windows = `http://asset.localhost/${encodeURIComponent("C:\\Users\\me\\Media\\bg.jpg")}`;
    const model = {
      background: { image: mac, css: `url("${windows}") center / cover` },
      video: "blob:abc",
      web: "https://example.org/a.png",
      words: "Amazing grace",
    };
    expect(lanSafe(model)).toEqual({
      background: { image: `/media/${lanMediaToken("/Users/me/Media/welcome slide.png")}`, css: `url("/media/${lanMediaToken("C:\\Users\\me\\Media\\bg.jpg")}") center / cover` },
      video: "",
      web: "https://example.org/a.png",
      words: "Amazing grace",
    });
  });

  it("makes a token that is safe in a web address and reads back to the path", () => {
    const token = lanMediaToken("/Users/me/Média/ünï +?/x.png");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const bytes = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("/Users/me/Média/ünï +?/x.png");
  });
});
