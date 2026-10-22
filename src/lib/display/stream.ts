// Videos from the network: a file over http(s) plays as it is; an HLS live stream (.m3u8) plays
// natively where the engine can (Safari / the Mac app) and through hls.js elsewhere, which is loaded
// only when such a stream actually plays. RTSP is not something a browser engine can play at all.

export const isHls = (url: string) => /\.m3u8(?:[?#]|$)/i.test(url);
export const isRtsp = (url: string) => /^rtsps?:\/\//i.test(url.trim());

/** A web address a video can play from, or why not. */
export function checkStreamUrl(raw: string): { ok: true; url: string; hls: boolean } | { ok: false; reason: "empty" | "rtsp" | "invalid" } {
  const url = raw.trim();
  if (!url) return { ok: false, reason: "empty" };
  if (isRtsp(url)) return { ok: false, reason: "rtsp" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: "invalid" };
    return { ok: true, url: parsed.toString(), hls: isHls(parsed.pathname) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * Give a video its source: directly, or through hls.js when it is an HLS stream this engine cannot
 * play itself. A Svelte action: `use:stream={url}`.
 */
export function stream(node: HTMLVideoElement, url: string) {
  let detach: (() => void) | null = null;
  let current = "";

  const attach = (next: string) => {
    if (next === current) return;
    current = next;
    detach?.();
    detach = null;
    if (!isHls(next) || node.canPlayType("application/vnd.apple.mpegurl")) {
      node.src = next;
      return;
    }
    node.removeAttribute("src");
    let gone = false;
    detach = () => void (gone = true);
    void import("hls.js").then(({ default: Hls }) => {
      if (gone || current !== next) return;
      if (!Hls.isSupported()) {
        node.src = next;
        return;
      }
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(next);
      hls.attachMedia(node);
      detach = () => hls.destroy();
    });
  };

  attach(url);
  return {
    update: attach,
    destroy() {
      detach?.();
    },
  };
}
