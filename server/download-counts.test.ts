import { describe, expect, it } from "vitest";
import { countReleases, downloadReport, fileKind, recordDownload } from "./download-counts";

describe("download counts", () => {
  it("sorts each release file by system, keeping the updater's files apart", () => {
    expect(fileKind("Church.Studio_0.4.4_universal.dmg")).toEqual({ system: "mac", update: false });
    expect(fileKind("Church.Studio_universal.app.tar.gz")).toEqual({ system: "mac", update: true });
    expect(fileKind("Church.Studio_0.4.4_x64-setup.exe")).toEqual({ system: "windows", update: false });
    expect(fileKind("Church.Studio_0.4.4_amd64.AppImage")).toEqual({ system: "linux", update: false });
    expect(fileKind("Church.Studio_0.4.4_x64-setup.exe.sig").system).toBeNull();
    expect(fileKind("latest.json").system).toBeNull();
  });

  it("adds up app releases only, leaving out Bibles and drafts", () => {
    const rows = countReleases([
      { tag_name: "v0.4.4", published_at: "2026-10-23T21:40:00Z", assets: [
        { name: "Church.Studio_0.4.4_universal.dmg", download_count: 10 },
        { name: "Church.Studio_universal.app.tar.gz", download_count: 30 },
        { name: "Church.Studio_0.4.4_x64-setup.exe", download_count: 25 },
        { name: "Church.Studio_0.4.4_x64_en-US.msi", download_count: 2 },
        { name: "Church.Studio_0.4.4_amd64.deb", download_count: 3 },
      ] },
      { tag_name: "bibles-2026-10", prerelease: true, assets: [{ name: "twi.json", download_count: 99 }] },
      { tag_name: "v0.5.0", draft: true, assets: [] },
    ]);
    expect(rows).toEqual([{ version: "0.4.4", date: "2026-10-23", mac: 10, windows: 27, linux: 3, updates: 30 }]);
  });

  it("records a website download as its own kind of point, never as a church's check-in", () => {
    const points: Array<{ blobs?: string[] }> = [];
    recordDownload({ write: (point) => points.push(point) }, { platform: "windows", country: "GH", version: "0.4.4" });
    expect(points[0]?.blobs?.[0]).toBe("windows");
    expect(points[0]?.blobs?.[5]).toBe("download");
    expect(() => recordDownload({ write: () => { throw new Error("full"); } }, { platform: "mac", country: "", version: "" })).not.toThrow();
  });

  it("reports GitHub's trouble instead of failing the admin page", async () => {
    const report = await downloadReport(undefined, (async () => new Response("", { status: 403 })) as typeof fetch);
    expect(report.site).toBeNull();
    expect(report.github).toEqual({ error: "GitHub answered 403" });
  });
});
