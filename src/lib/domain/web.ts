// Web sources: a page shown live on the screen. People paste whatever link they have; this turns
// a watch or share link into one that can be shown full screen (YouTube and Vimeo players,
// Google Slides as a slideshow) and says what it is.

export type WebKind = "website" | "youtube" | "vimeo" | "slides";

export type WebTarget = { kind: WebKind; url: string; label: string };

/** Add https:// when missing; only http(s) pages are shown. Null for anything else. */
export function cleanWebUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(?:embed|live|shorts)\/([\w-]{6,})/);
    if (match) return match[1] ?? null;
  }
  return null;
}

/**
 * What a pasted link should show. `autoplay` and `mute` apply to video players; a page that
 * plays sound on the projector should be the operator's choice.
 */
export function webTarget(raw: string, options: { autoplay?: boolean; mute?: boolean; loop?: boolean } = {}): WebTarget | null {
  const clean = cleanWebUrl(raw);
  if (!clean) return null;
  const url = new URL(clean);
  const play = options.autoplay !== false ? "1" : "0";
  const mute = options.mute ? "1" : "0";

  const yt = youtubeId(url);
  if (yt && /^[\w-]{6,}$/.test(yt)) {
    const start = url.searchParams.get("t")?.replace(/s$/, "");
    const params = new URLSearchParams({ autoplay: play, mute, rel: "0", modestbranding: "1", playsinline: "1" });
    if (start && /^\d+$/.test(start)) params.set("start", start);
    // YouTube loops one video only when it is also its own playlist.
    if (options.loop) {
      params.set("loop", "1");
      params.set("playlist", yt);
    }
    return { kind: "youtube", url: `https://www.youtube-nocookie.com/embed/${yt}?${params}`, label: "YouTube" };
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{5,})/)?.[1];
    if (id) return { kind: "vimeo", url: `https://player.vimeo.com/video/${id}?autoplay=${play}&muted=${mute}&title=0&byline=0${options.loop ? "&loop=1" : ""}`, label: "Vimeo" };
  }

  if (host === "docs.google.com" && /^\/presentation\/d\//.test(url.pathname)) {
    const id = url.pathname.split("/")[3];
    if (id) {
      // Published decks (/d/e/…) and shared decks both open as a full-screen slideshow.
      const path = id === "e" ? url.pathname.replace(/\/(pub|edit|embed).*$/, "") : `/presentation/d/${id}`;
      return { kind: "slides", url: `https://docs.google.com${path}/embed?start=false&loop=false&delayms=60000&rm=minimal`, label: "Google Slides" };
    }
  }

  return { kind: "website", url: clean, label: url.hostname.replace(/^www\./, "") };
}

/** The same player with its sound off (desk monitors: only the audience screen plays sound). */
export function mutedUrl(url: string, kind: WebKind): string {
  if (kind !== "youtube" && kind !== "vimeo") return url;
  try {
    const next = new URL(url);
    next.searchParams.set(kind === "youtube" ? "mute" : "muted", "1");
    return next.toString();
  } catch {
    return url;
  }
}
