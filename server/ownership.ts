// Who a license belongs to: one owner account, and the people the owner added by email (the
// church's team). A key bought while signed in belongs to the buyer; one bought signed out goes to
// whoever first signs in with the email it was sent to (verified), or links it by hand. After that,
// another account can use it only once the owner adds them.
//
// Adding someone emails them an invitation (who, which church, how to join); the owner sees each
// person as invited until they first sign in, then joined.
//
//   owner:<license>   { owner, members: [email…], at, invited: {email: at}, joined: {email: at} }
//   member:<email>    [ { id, key } ]  licenses this email was added to, linked when they sign in

import { inboxFull, type ApiConfig } from "./api.ts";
import type { Account, LinkedLicense } from "./accounts.ts";
import { inviteEmail } from "./email.ts";
import { getJson, putJson } from "./store.ts";

export type Ownership = { owner: string; members: string[]; at: number; invited?: Record<string, number>; joined?: Record<string, number> };
/** One person on a license, as the owner sees them. */
export type Member = { email: string; invitedAt?: number; joinedAt?: number };

/** People an owner may add to one license. */
export const MOST_MEMBERS = 10;

const normal = (email: string) => email.trim().toLowerCase();

export const ownershipOf = (config: ApiConfig, license: string) => getJson<Ownership>(config.store, `owner:${license}`);

export const peopleOf = (ownership: Ownership): Member[] =>
  ownership.members.map((email) => ({ email, ...(ownership.invited?.[email] ? { invitedAt: ownership.invited[email] } : {}), ...(ownership.joined?.[email] ? { joinedAt: ownership.joined[email] } : {}) }));

/** A name or church for an email's subject: one line, not too long. */
const oneLine = (value: string, most: number) => value.replace(/\s+/g, " ").trim().slice(0, most);

/** An added person signed in for the first time: the owner sees them as joined (one write, once). */
export async function noteJoined(config: ApiConfig, license: string, ownership: Ownership, email: string): Promise<void> {
  const who = normal(email);
  if (!ownership.members.includes(who) || ownership.joined?.[who]) return;
  await putJson(config.store, `owner:${license}`, { ...ownership, joined: { ...ownership.joined, [who]: config.now() } } satisfies Ownership, { owner: ownership.owner });
}

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
  else if (ownership.owner !== account.id) await noteJoined(config, license.id, ownership, account.email);
  const fresh = (await getJson<Account>(config.store, `acct:${account.id}`)) ?? account;
  if (!fresh.licenses.some((entry) => entry.id === license.id)) {
    await putJson(config.store, `acct:${account.id}`, { ...fresh, licenses: [...fresh.licenses, license] }, { email: fresh.email, createdAt: fresh.createdAt });
  }
  return { ok: true, owner: !ownership || ownership.owner === account.id };
}

/**
 * The owner adds, removes or sends a fresh invitation to a person (by email). `church` and `plan`
 * word the invitation. Returns the members, or why not.
 */
export async function changeMembers(
  config: ApiConfig,
  account: Account,
  license: LinkedLicense,
  change: { add?: string; remove?: string; resend?: string; church?: string; plan?: "premium" | "church" },
): Promise<{ ok: true; members: string[]; people: Member[] } | { ok: false; status: number; error: string }> {
  const ownership = await ownershipOf(config, license.id);
  if (!ownership || ownership.owner !== account.id) return { ok: false, status: 403, error: "Only the license's owner can add or remove people." };
  let members = ownership.members;
  const invited = { ...ownership.invited };
  const joined = { ...ownership.joined };
  const add = change.add ? normal(change.add) : "";
  const remove = change.remove ? normal(change.remove) : "";
  const resend = change.resend ? normal(change.resend) : "";
  let invite = "";
  if (add) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(add)) return { ok: false, status: 400, error: "That email address does not look right." };
    if (add === normal(account.email)) return { ok: false, status: 400, error: "You own this license already." };
    if (!members.includes(add)) {
      if (members.length >= MOST_MEMBERS) return { ok: false, status: 400, error: `A license can have ${MOST_MEMBERS} people besides its owner.` };
      members = [...members, add];
      const waiting = (await getJson<LinkedLicense[]>(config.store, `member:${add}`)) ?? [];
      if (!waiting.some((entry) => entry.id === license.id)) await putJson(config.store, `member:${add}`, [...waiting, license]);
      invite = add;
    }
  }
  if (resend) {
    if (!members.includes(resend)) return { ok: false, status: 404, error: "That person is not on this license. Add them first." };
    invite = resend;
  }
  if (remove) {
    members = members.filter((email) => email !== remove);
    delete invited[remove];
    delete joined[remove];
    const waiting = (await getJson<LinkedLicense[]>(config.store, `member:${remove}`)) ?? [];
    await putJson(config.store, `member:${remove}`, waiting.filter((entry) => entry.id !== license.id));
    // Their account keeps the link but can no longer use it: activation checks mayUse.
  }
  if (invite && config.mail) {
    // A newly added person is kept even when their inbox has had its share today; a resend says so.
    if (await inboxFull(config, invite)) {
      if (resend) return { ok: false, status: 429, error: `Several emails went to ${invite} today. Try again tomorrow.` };
    } else {
      const email = inviteEmail(
        { inviter: oneLine(account.name || account.email, 60), inviterEmail: account.email, church: oneLine(change.church ?? "", 60), to: invite, plan: change.plan ?? "church" },
        config.publicUrl ?? "https://church-studio.heitechinc.com",
      );
      await config.mail(invite, email.subject, email.text, email.html).catch(() => {});
      invited[invite] = config.now();
    }
  }
  const saved: Ownership = { ...ownership, members, invited, joined };
  await putJson(config.store, `owner:${license.id}`, saved, { owner: ownership.owner });
  return { ok: true, members, people: peopleOf(saved) };
}
