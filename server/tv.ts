// A TV's own address that never changes: church-studio.heitechinc.com/tv/CODE. The desk tells this
// server where it is on the church Wi-Fi today (http://192.168.x.y:17891/?lan=1, which changes when
// the router hands out another address), and the link sends the TV there. Bookmark it once on the
// TV; the screen itself still comes straight from the church computer over the Wi-Fi.
//
//   POST /v1/tv   {url, code?, secret?} → {code, secret}   (a new link, or this computer's moved)
//   GET  /tv/:code[?screen=id]            → 302 to the computer, or a page that waits for it

import type { ApiConfig } from "./api.ts";
import { getJson, putJson } from "./store.ts";

type TvLink = { secretHash: string; url: string; at: number };

/** A link not refreshed for this long is forgotten (the desk refreshes it whenever the Wi-Fi screen starts). */
const KEEP_SECONDS = 60 * 86_400;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function random(chars: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => chars[byte % chars.length]).join("");
}

/** Only the desk's own Wi-Fi page on a private address: the link can never send a TV anywhere else. */
export function localDeskUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const parts = url.hostname.split(".").map(Number);
  const privateIp =
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || (parts[0] === 169 && parts[1] === 254));
  if (url.protocol !== "http:" || !privateIp || url.pathname !== "/" || url.searchParams.get("lan") !== "1" || url.username || url.password) return null;
  return url.toString();
}

export async function tvRegister(config: ApiConfig, input: Record<string, unknown>): Promise<Response> {
  const url = localDeskUrl(input.url);
  if (!url) return json(400, { error: "That is not this computer's address on the Wi-Fi." });
  const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
  const secret = typeof input.secret === "string" ? input.secret : "";
  if (code) {
    const saved = await getJson<TvLink>(config.store, `tv:${code}`);
    if (saved) {
      if (saved.secretHash !== (await sha256(secret))) return json(403, { error: "That TV link belongs to another computer." });
      await putJson(config.store, `tv:${code}`, { ...saved, url, at: config.now() } satisfies TvLink, undefined, KEEP_SECONDS);
      return json(200, { code, secret });
    }
  }
  // A new link (or one forgotten after two unused months: made again under a new code).
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = random(CODE_CHARS, 6);
    if (await config.store.get(`tv:${fresh}`)) continue;
    const key = random("abcdefghijklmnopqrstuvwxyz0123456789", 32);
    await putJson(config.store, `tv:${fresh}`, { secretHash: await sha256(key), url, at: config.now() } satisfies TvLink, undefined, KEEP_SECONDS);
    return json(200, { code: fresh, secret: key });
  }
  return json(503, { error: "Try again." });
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** `screen`: one of the church's screens (Settings › Screens) this TV is, kept on the way through. */
export async function tvPage(config: ApiConfig, code: string, screen?: string | null): Promise<Response> {
  const saved = await getJson<TvLink>(config.store, `tv:${code.toUpperCase()}`);
  const url = saved ? localDeskUrl(saved.url) : null;
  if (url) {
    const to = new URL(url);
    if (screen && /^[a-z0-9]{4,24}$/.test(screen)) to.searchParams.set("screen", screen);
    // The TV page knows the link it came by: if the computer moves, it comes back through it.
    to.searchParams.set("via", code.toUpperCase());
    return new Response(null, { status: 302, headers: { location: to.toString(), "cache-control": "no-store" } });
  }
  // Not showing on Wi-Fi yet: a calm page that tries again by itself.
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Church Studio</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center}h1{font-size:24px;margin:0 0 8px}p{color:#a3a3ad;margin:0;font-size:16px}</style></head>
<body><div><h1>Waiting for the church computer</h1><p>On it, open Church Studio and turn on Show on a TV over Wi-Fi. This page keeps trying. Link ${escape(code.toUpperCase())}</p></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
