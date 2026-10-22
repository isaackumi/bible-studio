import { describe, expect, it } from "vitest";
import { remoteSafe } from "./remote-safe";

describe("screens for other devices", () => {
  it("leaves out what only the church's computer can open, and keeps the rest", () => {
    const model = {
      layout: "image",
      imageUrl: "http://asset.localhost/Users/x/media/a.png",
      video: { url: "asset://localhost/clip.mp4", loop: true },
      lines: [{ text: "Grace" }],
      theme: { background: { image: "blob:http://x/1" }, logo: "https://church.org/logo.png" },
      fill: "center / cover no-repeat url(\"http://asset.localhost/bg.jpg\"), linear-gradient(#000, #111)",
    };
    expect(remoteSafe(model)).toEqual({
      layout: "image",
      imageUrl: "",
      video: { url: "", loop: true },
      lines: [{ text: "Grace" }],
      theme: { background: { image: "" }, logo: "https://church.org/logo.png" },
      fill: "center / cover no-repeat none, linear-gradient(#000, #111)",
    });
  });
});
