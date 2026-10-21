// The open-source software inside Church Studio, for the /licenses page: every JavaScript package
// the app ships (not build tools) and every Rust crate the desktop app is built from, with its
// version and license. Run after changing dependencies: `node scripts/third-party.mjs`.
// It writes server/third-party.ts and warns about any license that needs a closer look.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = [];

/** A package without a license field: read the first lines of its LICENSE file. */
function fromFile(dir) {
  for (const file of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md"]) {
    if (!existsSync(join(dir, file))) continue;
    const head = readFileSync(join(dir, file), "utf8").slice(0, 400);
    if (/MIT License|Permission is hereby granted, free of charge/i.test(head)) return "MIT";
    if (/Apache License/i.test(head)) return "Apache-2.0";
    if (/ISC License/i.test(head)) return "ISC";
  }
  return "See package";
}

// JavaScript: the packages installed for the app itself.
const tree = JSON.parse(execFileSync("npm", ["ls", "--omit=dev", "--all", "--json", "--long"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }));
const seen = new Set();
(function walk(node) {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (!dep.version || seen.has(`${name}@${dep.version}`)) continue;
    seen.add(`${name}@${dep.version}`);
    const dir = dep.path ?? join(root, "node_modules", name);
    const file = join(dir, "package.json");
    const info = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    const license = dep.license ?? (typeof info.license === "string" ? info.license : info.license?.type ?? fromFile(dir));
    out.push({ kind: "js", name, version: dep.version, license, url: `https://www.npmjs.com/package/${name}` });
    walk(dep);
  }
})(tree);

// Rust: crates the app is built from (not test-only ones).
const meta = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1"], { cwd: join(root, "src-tauri"), encoding: "utf8", maxBuffer: 256 << 20 }));
const nodes = new Map(meta.resolve.nodes.map((node) => [node.id, node]));
const packages = new Map(meta.packages.map((pkg) => [pkg.id, pkg]));
const reach = new Set();
const stack = [meta.resolve.root];
while (stack.length) {
  const id = stack.pop();
  if (reach.has(id)) continue;
  reach.add(id);
  for (const dep of nodes.get(id)?.deps ?? []) if (dep.dep_kinds.some((kind) => kind.kind !== "dev")) stack.push(dep.pkg);
}
for (const id of reach) {
  const pkg = packages.get(id);
  if (!pkg || id === meta.resolve.root) continue;
  out.push({ kind: "rust", name: pkg.name, version: pkg.version, license: pkg.license ?? (pkg.license_file ? "See license file" : "See crate"), url: `https://crates.io/crates/${pkg.name}` });
}

out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
writeFileSync(
  join(root, "server", "third-party.ts"),
  `// Made by scripts/third-party.mjs: do not edit by hand. [kind, name, version, license]\nexport const THIRD_PARTY: ReadonlyArray<readonly ["js" | "rust", string, string, string]> = ${JSON.stringify(out.map(({ kind, name, version, license }) => [kind, name, version, license]))};\n`,
);

// Licenses that ask for more than a notice (sharing source, or other conditions) are worth a look.
// OFL fonts may be bundled with software; MPL-2.0 code is used unchanged and its source is on crates.io.
const permissive = /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|Zlib|Unicode-3\.0|Unicode-DFS-2016|Unlicense|0BSD|CC0-1\.0|BSL-1\.0|MIT-0|Python-2\.0|CDDL-1\.0|BlueOak-1\.0\.0|OFL-1\.1|MPL-2\.0|CDLA-Permissive-2\.0|Apache-2\.0 WITH LLVM-exception)$/;
const look = out.filter((item) => !item.license.replace(" WITH LLVM-exception", "").split(/\s+(?:OR|AND)\s+|\/|[()]/).filter(Boolean).some((part) => permissive.test(part.trim())));
console.log(`${out.length} components (${out.filter((item) => item.kind === "js").length} JavaScript, ${out.filter((item) => item.kind === "rust").length} Rust)`);
for (const item of look) console.log(`  check: ${item.kind} ${item.name} ${item.version} — ${item.license}`);
