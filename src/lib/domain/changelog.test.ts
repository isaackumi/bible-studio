import { describe, expect, it } from "vitest";
import { CHANGELOG, compareVersions, releaseNotes, releasesSince, updateStops, whatsNewFor, published } from "./changelog";
import { TOURS } from "../tour/steps";
import { readFileSync } from "node:fs";

const sample = [
  { version: "0.3.0", date: "2026-11-01", highlights: [{ icon: "x", title: "Three", text: "Third." }] },
  { version: "0.2.0", date: "2026-10-20", highlights: [{ icon: "x", title: "Two", text: "Second." }] },
];

describe("what's new", () => {
  it("orders versions by number, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.2.1")).toBe(-1);
  });

  it("shows a version's highlights once after an update, never on a first install", () => {
    expect(whatsNewFor("0.3.0", "0.2.0", sample)?.highlights[0]?.title).toBe("Three");
    expect(whatsNewFor("0.3.0", "0.3.0", sample)).toBeNull();
    expect(whatsNewFor("0.3.0", null, sample)).toBeNull();
    // Going back a version, or a version with nothing written, shows nothing.
    expect(whatsNewFor("0.2.0", "0.3.0", sample)).toBeNull();
    expect(whatsNewFor("0.4.0", "0.3.0", sample)).toBeNull();
  });

  it("writes the GitHub release notes from the same words", () => {
    expect(releaseNotes("0.3.0", sample)).toContain("- **Three.** Third.");
  });

  it("keeps an entry written for the next version off the website until it is released", () => {
    const log = [{ version: "0.4.2", date: "2026-10-24", highlights: [] }, { version: "0.4.1", date: "2026-10-23", highlights: [] }];
    expect(published("0.4.1", "2026-10-24", log).map((r) => r.version)).toEqual(["0.4.1"]);
    expect(published("0.4.2", "2026-10-23", log).map((r) => r.version)).toEqual(["0.4.2", "0.4.1"]);
    expect(published(null, "2026-10-23", log).map((r) => r.version)).toEqual(["0.4.1"]);
  });

  it("has an entry for the version being built, newest first", () => {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    expect(CHANGELOG[0]?.version).toBe(version);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBe(1);
  });

  it("walks through every version an update brought, newest first, briefly", () => {
    const log = [
      { version: "0.4.0", date: "", highlights: [{ icon: "x", title: "Four", text: "" }] },
      { version: "0.3.0", date: "", highlights: [{ icon: "x", title: "Three", text: "" }, { icon: "x", title: "Three b", text: "" }] },
      { version: "0.2.0", date: "", highlights: [{ icon: "x", title: "Two", text: "" }] },
    ];
    expect(releasesSince("0.4.0", "0.2.0", log).map((r) => r.version)).toEqual(["0.4.0", "0.3.0"]);
    expect(updateStops(releasesSince("0.4.0", "0.2.0", log)).map((stop) => stop.highlight.title)).toEqual(["Four", "Three", "Three b"]);
    expect(updateStops(releasesSince("0.4.0", "0.2.0", log), 2)).toHaveLength(2);
  });

  it("says where each of the newest version's highlights lives, at a target its tour knows", () => {
    for (const highlight of CHANGELOG[0]!.highlights) {
      expect(highlight.show, highlight.title).not.toBeUndefined();
      if (!highlight.show) continue;
      const targets = TOURS[highlight.show.tour].steps.flatMap((step) => step.target ?? []);
      expect(targets, highlight.title).toContain(highlight.show.target);
    }
  });

  it("never names the engines behind a feature in what churches read", () => {
    const words = CHANGELOG.flatMap((release) => release.highlights.flatMap((highlight) => [highlight.title, highlight.text])).join(" ");
    expect(words).not.toMatch(/whisper|parakeet|nvidia|onnx|hugging ?face|rnnoise/i);
  });
});
