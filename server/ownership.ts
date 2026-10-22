// Who a license belongs to: one owner account, and the people the owner added by email (the
// church's team). A key bought while signed in belongs to the buyer; one bought signed out goes to
// whoever first signs in with the email it was sent to (verified), or links it by hand. After that,
// another account can use it only once the owner adds them.
//
//   owner:<license>   { owner, members: [email…], at }
//   member:<email>    [ { id, key } ]  licenses this email was added to, linked when they sign in

import type { ApiConfig } from "./api.ts";
import type { Account, LinkedLicense } from "./accounts.ts";
import { getJson, putJson } from "./store.ts";

export type Ownership = { owner: string; members: string[]; at: number };

/** People an owner may add to one license. */
export const MOST_MEMBERS = 10;

const normal = (email: string) => email.trim().toLowerCase();

export const ownershipOf = (config: ApiConfig, license: string) => getJson<Ownership>(config.store, `owner:${license}`);

/** True when this account may use the license (it owns it, or the owner added its email). */
export function mayUse(ownership: Ownership | null, account: Pick<Account, "id" | "email">): boolean {
  return !ownership || ownership.owner === account.id || ownership.members.includes(normal(account.email));
}

/**
 * Link a license to an account: an unowned license becomes the account's; one owned by someone else
 * is linked only when its owner added this account's email.
 */
export async function claimLicense(config: ApiConfig, account: Account, license: LinkedLicense): Promise<{ ok: true; owner: boolean } | { ok: false; error: string }> {
  const ownership = await ownershipOf(config, license.id);
  if (!mayUse(ownership, account)) return { ok: false, error: "This license belongs to another account. Ask its owner to add your email in Church Studio (Settings › Account)." };
  if (!ownership) await putJson(config.store, `owner:${license.id}`, { owner: account.id, members: [], at: config.now() } satisfies Ownership, { owner: account.id });
  const fresh = (await getJson<Account>(config.store, `acct:${account.id}`)) ?? account;
  if (!fresh.licenses.some((entry) => entry.id === license.id)) {
    await putJson(config.store, `acct:${account.id}`, { ...fresh, licenses: [...fresh.licenses, license] }, { email: fresh.email, createdAt: fresh.createdAt });
  }
  return { ok: true, owner: !ownership || ownership.owner === account.id };
}

/** The owner adds or removes a person (by email). Returns the members, or why not. */
export async function changeMembers(config: ApiConfig, account: Account, license: LinkedLicense, change: { add?: string; remove?: string }): Promise<{ ok: true; members: string[] } | { ok: false; status: number; error: string }> {
  const ownership = await ownershipOf(config, license.id);
  if (!ownership || ownership.owner !== account.id) return { ok: false, status: 403, error: "Only the license's owner can add or remove people." };
  let members = ownership.members;
  const add = change.add ? normal(change.add) : "";
  const remove = change.remove ? normal(change.remove) : "";
  if (add) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(add)) return { ok: false, status: 400, error: "That email address does not look right." };
    if (add === normal(account.email)) return { ok: false, status: 400, error: "You own this license already." };
    if (!members.includes(add)) {
      if (members.length >= MOST_MEMBERS) return { ok: false, status: 400, error: `A license can have ${MOST_MEMBERS} people besides its owner.` };
      members = [...members, add];
      const waiting = (await getJson<LinkedLicense[]>(config.store, `member:${add}`)) ?? [];
      if (!waiting.some((entry) => entry.id === license.id)) await putJson(config.store, `member:${add}`, [...waiting, license]);
    }
  }
  if (remove) {
    members = members.filter((email) => email !== remove);
    const waiting = (await getJson<LinkedLicense[]>(config.store, `member:${remove}`)) ?? [];
    await putJson(config.store, `member:${remove}`, waiting.filter((entry) => entry.id !== license.id));
    // Their account keeps the link but can no longer use it: activation checks mayUse.
  }
  await putJson(config.store, `owner:${license.id}`, { ...ownership, members } satisfies Ownership, { owner: ownership.owner });
  return { ok: true, members };
}
