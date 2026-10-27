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

/** What to do about a stream that stopped: reload it after a wait, recover its decoding, or give up. */
export function streamRecovery(kind: "network" | "media" | "other", tries: { network: number; media: number }): { action: "reload" | "recover" | "give-up"; waitMs: number; tries: { network: number; media: number } } {
  if (kind === "network" && tries.network < 6) return { action: "reload", waitMs: Math.min(8000, 1000 * 2 ** tries.network), tries: { ...tries, network: tries.network + 1 } };
  if (kind === "media" && tries.media < 2) return { action: "recover", waitMs: 0, tries: { ...tries, media: tries.media + 1 } };
  return { action: "give-up", waitMs: 0, tries };
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
      let retry: ReturnType<typeof setTimeout> | undefined;
      let tries = { network: 0, media: 0 };
      // A dropped connection or a bad chunk mid-service: pick the stream up again rather than stop.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        const step = streamRecovery(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : data.type === Hls.ErrorTypes.MEDIA_ERROR ? "media" : "other", tries);
        tries = step.tries;
        if (step.action === "reload") retry = setTimeout(() => hls.startLoad(), step.waitMs);
        else if (step.action === "recover") hls.recoverMediaError();
        else {
          // Out of ways back: let the engine's own player try the address.
          hls.destroy();
          node.src = next;
        }
      });
      // Playing again: the next trouble starts its count afresh.
      hls.on(Hls.Events.FRAG_LOADED, () => (tries = { network: 0, media: 0 }));
      hls.loadSource(next);
      hls.attachMedia(node);
      detach = () => {
        clearTimeout(retry);
        hls.destroy();
      };
    });
  };

  attach(url);
  return {
    update: attach,
    destroy() {
      detach?.();
      releaseVideo(node);
    },
  };
}

/**
 * Let go of a video's decoder and buffers when its element leaves the page. A detached element
 * keeps them until it is collected (tens of MB each, and WebKit allows only so many at once), so a
 * service with many clips would climb in memory. A Svelte action: `use:release`.
 */
export function release(node: HTMLVideoElement) {
  return {
    destroy() {
      releaseVideo(node);
    },
  };
}

export function releaseVideo(node: HTMLVideoElement) {
  try {
    node.pause();
    node.removeAttribute("src");
    node.load();
  } catch {
    // Already gone.
  }
}
