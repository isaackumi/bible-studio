import { describe, expect, it } from "vitest";
import { inkOn, presentAnnouncement } from "./announcement";
import { defaultTheme } from "./theme";

describe("announcements", () => {
  it("lays out the heading, details and the church's own small line", () => {
    const model = presentAnnouncement({
      theme: defaultTheme(),
      words: { heading: " Youth camp ", body: "Saturday 9am\n\nChurch hall", design: "banner", label: "Save the date", accent: "#4F8CFF" },
    });
    expect(model.layout).toBe("title");
    expect(model.announcement).toMatchObject({ design: "banner", label: "Save the date", heading: "Youth camp", body: ["Saturday 9am", "Church hall"], accent: "#4f8cff" });
    expect(model.lines.map((line) => line.text)).toEqual(["Youth camp", "Saturday 9am", "Church hall"]);
  });

  it("falls back to the centered design and the theme's accent", () => {
    const model = presentAnnouncement({ theme: defaultTheme(), words: { heading: "Notice", body: "", design: "nope" as never, accent: "red" } });
    expect(model.announcement?.design).toBe("classic");
    expect(model.announcement?.accent).toMatch(/^#|rgb/);
    expect(model.announcement?.label).toBe("");
  });

  it("picks text that reads on the accent", () => {
    expect(inkOn("#ffffff")).toBe("#14161a");
    expect(inkOn("#f2b33d")).toBe("#14161a");
    expect(inkOn("#4f8cff")).toBe("#ffffff");
    expect(inkOn("#8e6cf0")).toBe("#ffffff");
  });
});
