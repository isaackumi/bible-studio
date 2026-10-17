// Issue Church Studio license keys. Run with Node 22.6+ (TypeScript runs directly):
//
//   node scripts/license.ts keygen
//       Make the signing key once. It is saved outside the repository, in
//       ~/.church-studio/license-signing.key. Back it up: without it no new keys can be made,
//       and anyone who has it can make keys. Paste the printed public key into
//       src/lib/domain/license.ts (LICENSE_PUBLIC_KEY).
//
//   node scripts/license.ts issue --plan premium --until 2027-10-31 --to "Grace Chapel"
//   node scripts/license.ts issue --plan premium --days 30
//   node scripts/license.ts issue --plan church
//       Print a key. --until ends it on a fixed date; --days runs it from the moment it is
//       redeemed (for launch offers); with neither it never ends.
//
//   node scripts/license.ts check CS1-XXXXX-...
//       Show what a key grants.
//
// CHURCH_STUDIO_SIGNING_KEY (hex) overrides the key file, for a billing server.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { licenseKeyPair, readLicense, signLicense, type LicensePlan } from "../src/lib/domain/license.ts";

const dir = join(homedir(), ".church-studio");
const file = join(dir, "license-signing.key");
const [command, ...rest] = process.argv.slice(2);

function option(name: string): string | undefined {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : undefined;
}

function secret(): string {
  const fromEnv = process.env.CHURCH_STUDIO_SIGNING_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (!existsSync(file)) throw new Error(`No signing key at ${file}. Run: node scripts/license.ts keygen`);
  return readFileSync(file, "utf8").trim();
}

try {
  if (command === "keygen") {
    if (existsSync(file)) throw new Error(`A signing key already exists at ${file}. Remove it first only if you mean to replace it: every key already issued will stop working.`);
    const pair = licenseKeyPair();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, pair.secretKey + "\n", { mode: 0o600 });
    chmodSync(file, 0o600);
    console.log(`Signing key saved to ${file} (back it up somewhere safe).`);
    console.log(`Public key for src/lib/domain/license.ts:\n${pair.publicKey}`);
  } else if (command === "issue") {
    const plan = option("plan") ?? "premium";
    if (plan !== "premium" && plan !== "church") throw new Error("--plan is premium or church.");
    const days = option("days");
    const key = signLicense({ plan: plan as LicensePlan, until: option("until") ?? null, days: days ? Number(days) : null, holder: option("to") ?? "" }, secret());
    const check = readLicense(key);
    if (!check) throw new Error("The new key does not verify with the app's public key. Is LICENSE_PUBLIC_KEY up to date?");
    console.log(key);
  } else if (command === "check") {
    const license = readLicense(rest.join(" "));
    console.log(license ? JSON.stringify(license, null, 2) : "Not a valid Church Studio key.");
  } else {
    console.log("Commands: keygen | issue --plan premium|church [--until YYYY-MM-DD | --days N] [--to NAME] | check KEY");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
