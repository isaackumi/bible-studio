// Downloads: the newest release on GitHub, by platform, so the site never names a version by hand.
// /download/mac → the universal .dmg (Apple silicon and Intel), /download/windows → the installer,
// and so on; anything missing falls back to the release page. Read once and kept for a while, so a
// busy Sunday morning does not ask GitHub for every visitor.

const REPO = "isaackumi/bible-studio";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export type Platform = "mac" | "windows" | "windows-msi" | "linux" | "linux-deb" | "linux-rpm";
export type Asset = { name: string; url: string; size: number };
export type Release = { version: string; date: string; assets: Partial<Record<Platform, Asset>> };

const PICK: Record<Platform, RegExp> = {
  mac: /_universal\.dmg$/i,
  windows: /_x64-setup\.exe$/i,
  "windows-msi": /_x64_[a-z-]+\.msi$/i,
  linux: /_amd64\.AppImage$/i,
  "linux-deb": /_amd64\.deb$/i,
  "linux-rpm": /\.x86_64\.rpm$/i,
};

let kept: { at: number; release: Release | null } | null = null;
const KEEP_MS = 10 * 60_000;

/** The latest release and its files by platform; null when GitHub cannot be reached. */
export async function latestRelease(http: typeof fetch = fetch, now = Date.now()): Promise<Release | null> {
  if (kept && now - kept.at < KEEP_MS) return kept.release;
  let release: Release | null = null;
  try {
    const response = await http(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "church-studio-site" } });
    if (response.ok) {
      const data = (await response.json()) as { tag_name?: string; published_at?: string; assets?: Array<{ name: string; browser_download_url: string; size: number }> };
      const assets: Release["assets"] = {};
      for (const [platform, pattern] of Object.entries(PICK) as Array<[Platform, RegExp]>) {
        const found = data.assets?.find((asset) => pattern.test(asset.name) && !asset.name.endsWith(".sig"));
        if (found) assets[platform] = { name: found.name, url: found.browser_download_url, size: found.size };
      }
      release = { version: (data.tag_name ?? "").replace(/^v/, ""), date: data.published_at ?? "", assets };
    }
  } catch {
    release = null;
  }
  // A failed read is kept briefly too, so a GitHub outage does not slow every page.
  kept = { at: release ? now : now - KEEP_MS + 60_000, release };
  return release;
}

/** Where /download/<platform> sends the browser. */
export async function downloadUrl(platform: string, http: typeof fetch = fetch): Promise<string> {
  const release = await latestRelease(http);
  const asset = release?.assets[platform as Platform];
  return asset?.url ?? RELEASES_PAGE;
}

/** 96 MB, 14.7 MB. */
export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes >= 20_000_000 ? 0 : 1)} MB`;

/** Forget the kept release (tests). */
export function forgetRelease() {
  kept = null;
}
