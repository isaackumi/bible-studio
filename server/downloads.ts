// Downloads: the newest release on GitHub, by platform, so the site never names a version by hand.
// /download/mac → the universal .dmg (Apple silicon and Intel), /download/windows → the installer,
// and so on; anything missing falls back to the release page. Read once and kept for a while, so a
// busy Sunday morning does not ask GitHub for every visitor.

const REPO = "isaackumi/bible-studio";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export type Platform = "mac" | "windows" | "windows-msi" | "linux" | "linux-deb" | "linux-rpm";
export type Asset = { name: string; url: string; size: number };
export type Release = { version: string; date: string; assets: Partial<Record<Platform, Asset>> };

/**
 * Each platform's file name in a release. The names follow the version, so the release is found
 * from latest.json (published with every release for the app's updater, at a fixed address that
 * GitHub does not rate-limit) instead of GitHub's API, which allows only 60 requests an hour from
 * a shared address like Cloudflare's and so failed for some visitors.
 */
const NAMES: Record<Platform, (version: string) => string> = {
  mac: (v) => `Church.Studio_${v}_universal.dmg`,
  windows: (v) => `Church.Studio_${v}_x64-setup.exe`,
  "windows-msi": (v) => `Church.Studio_${v}_x64_en-US.msi`,
  linux: (v) => `Church.Studio_${v}_amd64.AppImage`,
  "linux-deb": (v) => `Church.Studio_${v}_amd64.deb`,
  "linux-rpm": (v) => `Church.Studio-${v}-1.x86_64.rpm`,
};

let kept: { at: number; release: Release | null } | null = null;
const KEEP_MS = 10 * 60_000;
const STORE_KEY = "release:latest";

/** A small key-value store that outlives one server instance (Cloudflare KV), for the last good release. */
type Keeper = { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };

/** Read the newest release from GitHub: its version from latest.json, each file's size from its headers. */
async function readRelease(http: typeof fetch): Promise<Release | null> {
  const response = await http(`https://github.com/${REPO}/releases/latest/download/latest.json`, { redirect: "follow", headers: { "user-agent": "church-studio-site" } });
  if (!response.ok) return null;
  const data = (await response.json()) as { version?: string; pub_date?: string };
  const version = (data.version ?? "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+/.test(version)) return null;
  const entries = await Promise.all(
    (Object.entries(NAMES) as Array<[Platform, (v: string) => string]>).map(async ([platform, name]) => {
      const file = name(version);
      const url = `https://github.com/${REPO}/releases/download/v${version}/${file}`;
      try {
        const head = await http(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "church-studio-site" } });
        if (!head.ok) return null;
        return [platform, { name: file, url, size: Number(head.headers.get("content-length")) || 0 }] as const;
      } catch {
        return [platform, { name: file, url, size: 0 }] as const;
      }
    }),
  );
  const assets: Release["assets"] = {};
  for (const entry of entries) if (entry) assets[entry[0]] = entry[1];
  return { version, date: data.pub_date ?? "", assets };
}

/**
 * The latest release and its files by platform. Kept in memory for a few minutes and in the store
 * for good, so a slow or failing GitHub never leaves the page or the downloads without it.
 */
export async function latestRelease(http: typeof fetch = fetch, store?: Keeper, now = Date.now()): Promise<Release | null> {
  if (kept && kept.release && now - kept.at < KEEP_MS) return kept.release;
  let release: Release | null = null;
  try {
    release = await readRelease(http);
  } catch {
    release = null;
  }
  if (release && Object.keys(release.assets).length) {
    const changed = kept?.release?.version !== release.version;
    kept = { at: now, release };
    // Written only when the version is new to the store (KV allows few writes a day).
    if (changed && store) {
      const saved = await store.get(STORE_KEY).catch(() => null);
      if (!saved || (JSON.parse(saved) as Release).version !== release.version) await store.put(STORE_KEY, JSON.stringify(release)).catch(() => {});
    }
    return release;
  }
  // GitHub did not answer: the last good release (this instance's, else the store's).
  if (kept?.release) return kept.release;
  const saved = await store?.get(STORE_KEY).catch(() => null);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Release;
      kept = { at: now - KEEP_MS + 60_000, release: parsed };
      return parsed;
    } catch {
      /* unreadable: none */
    }
  }
  return null;
}

/** 96 MB, 14.7 MB. */
export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes >= 20_000_000 ? 0 : 1)} MB`;

/** Forget the kept release (tests). */
export function forgetRelease() {
  kept = null;
}
