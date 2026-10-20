// Writes server/auth-schema.sql: the tables Better Auth needs (users, sessions, sign-in methods,
// sign-in links), for D1. Run `node server/auth-schema.ts` after changing auth.ts's plugins; deploy.sh
// applies the file. Every statement is "if not exists", so applying it again changes nothing.

import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "./auth.ts";

const options = authOptions({ database: new DatabaseSync(":memory:"), secret: "x".repeat(32), baseURL: "https://example.com", mail: async () => {} });
const sql = (await (await getMigrations(options)).compileMigrations())
  .replace(/create table "/g, 'create table if not exists "')
  .replace(/create index "/g, 'create index if not exists "');
writeFileSync(join(import.meta.dirname, "auth-schema.sql"), `-- Better Auth's tables (made by server/auth-schema.ts; do not edit by hand).\n${sql}\n`);
console.log(sql);
