import { describe, expect, it } from "vitest";
import { CHANGELOG, compareVersions, releaseNotes, whatsNewFor } from "./changelog";
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

  it("has an entry for the version being built, newest first", () => {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    expect(CHANGELOG[0]?.version).toBe(version);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBe(1);
  });
});
