// The license server on this computer, for development: the same API as the Worker (api.ts) with
// the mock checkout, its data in server/.dev-store.json. Start it with `npm run server:dev`, and run
// the app with VITE_LICENSE_SERVER=http://localhost:8787 so the app talks to it.
//
// It signs with the real key from ~/.church-studio/license-signing.key (or CHURCH_STUDIO_SIGNING_KEY),
// so the app accepts its leases. The admin page is http://localhost:8787/admin (token: dev).
//
// Accounts work too: sign-in links are printed here instead of emailed, and Google, Microsoft or
// Apple sign-in is offered when GOOGLE_CLIENT_ID/SECRET (and so on) are set. Users and sessions are
// in server/.dev-auth.sqlite.

import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { handleApi } from "./api.ts";
import { authOptions, betterAuthIdentity, type AuthSettings } from "./auth.ts";
import { mockProvider } from "./billing.ts";
import { memoryStore } from "./store.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DATA = join(import.meta.dirname ?? ".", ".dev-store.json");
const keyFile = join(homedir(), ".church-studio", "license-signing.key");
const signingKey = (process.env.CHURCH_STUDIO_SIGNING_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "")).trim();
if (!signingKey) {
  console.error("No signing key: run `node scripts/license.ts keygen` or set CHURCH_STUDIO_SIGNING_KEY.");
  process.exit(1);
}

const store = memoryStore();
if (existsSync(DATA)) {
  for (const [key, entry] of Object.entries(JSON.parse(readFileSync(DATA, "utf8")) as Record<string, { value: string; meta: Record<string, unknown> | null }>)) {
    await store.put(key, entry.value, entry.meta ?? undefined);
  }
}
const save = () => writeFileSync(DATA, JSON.stringify(Object.fromEntries(store.dump()), null, 1));

const mail = async (to: string, subject: string, text: string) => console.log(`\n✉️  To ${to}: ${subject}\n${text}\n`);
const env = process.env;
const authSettings: AuthSettings = {
  database: new DatabaseSync(join(import.meta.dirname ?? ".", ".dev-auth.sqlite")),
  secret: env.BETTER_AUTH_SECRET ?? "church-studio-development-secret-not-for-production",
  baseURL: `http://localhost:${PORT}`,
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  microsoft: { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET },
  apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET },
  mail,
};
await (await getMigrations(authOptions(authSettings))).runMigrations();

const config = {
  store,
  identity: betterAuthIdentity(authSettings),
  signingKey,
  provider: mockProvider,
  adminToken: process.env.ADMIN_TOKEN ?? "dev",
  leaseDays: 30,
  trialDays: 14,
  graceDays: 7,
  mail,
  now: () => Date.now(),
};

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const request = new Request(`http://localhost:${PORT}${incoming.url}`, {
    method: incoming.method,
    headers: Object.entries(incoming.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as [string, string]] : [])),
    body: incoming.method === "GET" || incoming.method === "HEAD" || body.length === 0 ? undefined : body,
  });
  const response = await handleApi(request, config);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
  if (incoming.method !== "GET") save();
}).listen(PORT, () => console.log(`Church Studio license server (mock payments) on http://localhost:${PORT} · admin: /admin (token ${config.adminToken})`));
