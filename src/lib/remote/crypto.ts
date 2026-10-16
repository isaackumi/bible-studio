/** Web Crypto helpers for remote pairing. Never Math.random for credentials. */

export function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let text = "";
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Six digits without modulo bias. */
export function randomCode(): string {
  const data = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 900000) * 900000;
  do crypto.getRandomValues(data);
  while (data[0]! >= limit);
  return String(100000 + (data[0]! % 900000));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
