import { afterEach, describe, expect, it } from "vitest";
import { forgetRelease, latestRelease } from "./downloads";

const store = () => {
  const data = new Map<string, string>();
  return { get: async (key: string) => data.get(key) ?? null, put: async (key: string, value: string) => void data.set(key, value), data };
};

describe("the newest release", () => {
  afterEach(() => forgetRelease());

  it("is found from latest.json, with each file's size, not GitHub's rate-limited API", async () => {
    const asked: string[] = [];
    const http = (async (url: string, init?: RequestInit) => {
      asked.push(url);
      if (url.endsWith("/latest.json")) return new Response(JSON.stringify({ version: "1.2.3", pub_date: "2026-11-01T00:00:00Z" }));
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": url.endsWith(".dmg") ? "30000000" : "1000" } });
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const kept = store();
    const release = await latestRelease(http, kept, 0);
    expect(release?.version).toBe("1.2.3");
    expect(release?.assets.mac).toEqual({ name: "Church.Studio_1.2.3_universal.dmg", url: "https://github.com/isaackumi/bible-studio/releases/download/v1.2.3/Church.Studio_1.2.3_universal.dmg", size: 30_000_000 });
    expect(release?.assets["linux-rpm"]?.name).toBe("Church.Studio-1.2.3-1.x86_64.rpm");
    expect(asked.some((url) => url.includes("api.github.com"))).toBe(false);
    expect(kept.data.get("release:latest")).toContain("1.2.3");
  });

  it("never drops a file because GitHub missed one answer, and keeps its last known size", async () => {
    const kept = store();
    const sizes = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/latest.json")) return new Response(JSON.stringify({ version: "1.2.3" }));
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": "29000000" } });
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    await latestRelease(sizes, kept, 0);
    forgetRelease();
    // This time the Mac and Windows files do not answer: they stay, with the sizes read before.
    const flaky = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/latest.json")) return new Response(JSON.stringify({ version: "1.2.3" }));
      if (init?.method === "HEAD" && (url.endsWith(".dmg") || url.endsWith("-setup.exe"))) return new Response(null, { status: 503 });
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": "29000000" } });
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const release = await latestRelease(flaky, kept, 0);
    expect(Object.keys(release!.assets).sort()).toEqual(["linux", "linux-deb", "linux-rpm", "mac", "windows", "windows-msi"]);
    expect(release!.assets.mac!.size).toBe(29_000_000);
    expect(release!.assets.windows!.size).toBe(29_000_000);
  });

  it("keeps working from the last good release when GitHub does not answer", async () => {
    const kept = store();
    await kept.put("release:latest", JSON.stringify({ version: "1.2.2", date: "", assets: { mac: { name: "a.dmg", url: "https://x/a.dmg", size: 1 } } }));
    const down = (async () => new Response(null, { status: 503 })) as typeof fetch;
    expect((await latestRelease(down, kept, 0))?.assets.mac?.url).toBe("https://x/a.dmg");
  });
});
