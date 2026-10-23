// How many times Church Studio was downloaded, from two places:
//  - this website: every /download/… that hands over a file writes one point to Analytics Engine
//    (the same dataset as check-ins, kept apart by blob6 = "download"). This is the true number for
//    the site, because Cloudflare keeps the installer near visitors and GitHub never sees most of them.
//  - GitHub: each release file's own download_count. It also counts the app's own updates (the
//    updater fetches from GitHub) and anyone downloading from the releases page.
//
// A download point's layout:
//   index1 "download"   blob1 platform ("mac", "windows", "linux-deb"…)   blob4 country   blob5 version
//   blob6  "download"   blob7 "site"

import { USAGE_DATASET, type Usage } from "./usage.ts";

export const DOWNLOAD_REPO = "isaackumi/bible-studio";

export function recordDownload(usage: Usage | undefined, visit: { platform: string; country: string; version: string }): void {
  if (!usage) return;
  try {
    usage.write({ indexes: ["download"], blobs: [visit.platform, "", "", visit.country.slice(0, 8), visit.version.slice(0, 20), "download", "site"], doubles: [1] });
  } catch {
    // A download never fails because it could not be counted.
  }
}

/** The kind of computer a release file is for, and whether the app's updater uses it. */
export function fileKind(name: string): { system: "mac" | "windows" | "linux" | null; update: boolean } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".sig") || lower.endsWith(".json")) return { system: null, update: false };
  if (lower.endsWith(".app.tar.gz")) return { system: "mac", update: true };
  if (lower.endsWith(".dmg")) return { system: "mac", update: false };
  if (lower.endsWith(".exe") || lower.endsWith(".msi") || lower.endsWith(".nsis.zip") || lower.endsWith(".msi.zip")) return { system: "windows", update: lower.endsWith(".zip") };
  if (lower.endsWith(".appimage") || lower.endsWith(".deb") || lower.endsWith(".rpm") || lower.endsWith(".appimage.tar.gz")) return { system: "linux", update: lower.endsWith(".tar.gz") };
  return { system: null, update: false };
}

type GithubRelease = { tag_name?: string; published_at?: string; prerelease?: boolean; draft?: boolean; assets?: Array<{ name?: string; download_count?: number }> };

export type ReleaseCount = { version: string; date: string; mac: number; windows: number; linux: number; updates: number };

/** Every app release on GitHub, newest first, with its files' downloads added up per system. */
export function countReleases(releases: GithubRelease[]): ReleaseCount[] {
  return releases
    .filter((release) => !release.draft && !release.prerelease && /^v\d/.test(release.tag_name ?? ""))
    .map((release) => {
      const row: ReleaseCount = { version: (release.tag_name ?? "").slice(1), date: (release.published_at ?? "").slice(0, 10), mac: 0, windows: 0, linux: 0, updates: 0 };
      for (const asset of release.assets ?? []) {
        const kind = fileKind(asset.name ?? "");
        const count = Math.max(0, Number(asset.download_count) || 0);
        if (!kind.system) continue;
        if (kind.update) row.updates += count;
        else row[kind.system] += count;
      }
      return row;
    });
}

export type DownloadReport = {
  /** This website, from Analytics Engine (kept 90 days). Null until the server can read it. */
  site: null | {
    days: Array<{ day: string; downloads: number }>;
    platforms: Array<{ platform: string; day: number; week: number; month: number; quarter: number }>;
    countries: Array<[string, number]>;
  };
  /** GitHub's counts for every release, or why they could not be read. */
  github: { releases: ReleaseCount[] } | { error: string };
};

const number = (value: unknown) => Number(value) || 0;

async function siteReport(usage: Usage | undefined): Promise<DownloadReport["site"]> {
  const query = usage?.query;
  if (!query) return null;
  const DOWNLOADS = `blob6 = 'download'`;
  const total = `sum(_sample_interval * double1)`;
  const since = (days: number) => `timestamp > NOW() - INTERVAL '${days}' DAY`;
  const [days, platforms, countries] = await Promise.all([
    query(`SELECT toStartOfDay(timestamp) AS day, ${total} AS n FROM ${USAGE_DATASET} WHERE ${DOWNLOADS} AND ${since(60)} GROUP BY day ORDER BY day`),
    query(
      `SELECT blob1 AS platform, sum(if(timestamp > NOW() - INTERVAL '1' DAY, _sample_interval * double1, 0)) AS day, sum(if(timestamp > NOW() - INTERVAL '7' DAY, _sample_interval * double1, 0)) AS week, sum(if(timestamp > NOW() - INTERVAL '30' DAY, _sample_interval * double1, 0)) AS month, ${total} AS quarter FROM ${USAGE_DATASET} WHERE ${DOWNLOADS} AND ${since(90)} GROUP BY platform ORDER BY quarter DESC`,
    ),
    query(`SELECT blob4 AS country, ${total} AS n FROM ${USAGE_DATASET} WHERE ${DOWNLOADS} AND ${since(30)} GROUP BY country ORDER BY n DESC LIMIT 12`),
  ]);
  return {
    days: days.map((row) => ({ day: String(row.day ?? "").slice(0, 10), downloads: Math.round(number(row.n)) })),
    platforms: platforms.map((row) => ({ platform: String(row.platform ?? ""), day: Math.round(number(row.day)), week: Math.round(number(row.week)), month: Math.round(number(row.month)), quarter: Math.round(number(row.quarter)) })),
    countries: countries.map((row) => [String(row.country || "—"), Math.round(number(row.n))] as [string, number]),
  };
}

async function githubReport(http: typeof fetch): Promise<DownloadReport["github"]> {
  try {
    // Kept for an hour near the server: GitHub allows few unsigned requests an hour.
    const response = await http(`https://api.github.com/repos/${DOWNLOAD_REPO}/releases?per_page=100`, {
      headers: { "user-agent": "church-studio-admin", accept: "application/vnd.github+json" },
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 3600, "300-599": -1 } },
    } as RequestInit);
    if (!response.ok) return { error: `GitHub answered ${response.status}` };
    return { releases: countReleases((await response.json()) as GithubRelease[]) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function downloadReport(usage: Usage | undefined, http: typeof fetch = fetch): Promise<DownloadReport> {
  const [site, github] = await Promise.all([siteReport(usage).catch(() => null), githubReport(http)]);
  return { site, github };
}
