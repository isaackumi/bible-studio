// Who is signed in to the browser, through Better Auth: Google, Microsoft, Apple and an emailed
// sign-in link, its users and sessions in a small SQL database (Cloudflare D1 on the Worker,
// node:sqlite in development). accounts.ts uses it only through the Identity shape, so the rest of
// the server never sees a password, a provider token or a table.
//
// A sign-in method is offered only when its credentials are set. The tables are in auth-schema.sql
// (made by `node server/auth-schema.ts`, applied by deploy.sh).

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { signInEmail } from "./email.ts";
import { magicLink } from "better-auth/plugins/magic-link";
import type { Identity, SigninMethod } from "./accounts.ts";

type Credentials = { clientId?: string; clientSecret?: string };

export type AuthSettings = {
  /** A D1 database binding, or a node:sqlite DatabaseSync. */
  database: unknown;
  /** Long random secret that signs the session cookies (BETTER_AUTH_SECRET). */
  secret: string;
  /** This server's address, e.g. https://license.heitechinc.com. */
  baseURL: string;
  google?: Credentials;
  microsoft?: Credentials;
  apple?: Credentials;
  /** Sends the sign-in link; without it there is no email sign-in. */
  mail?: (to: string, subject: string, text: string, html?: string) => Promise<void>;
};

const has = (credentials?: Credentials): credentials is Required<Credentials> => !!(credentials?.clientId && credentials.clientSecret);

export function authOptions(settings: AuthSettings): BetterAuthOptions {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (has(settings.google)) socialProviders.google = { clientId: settings.google.clientId, clientSecret: settings.google.clientSecret, prompt: "select_account" };
  // "common": work, school and personal Microsoft accounts alike.
  if (has(settings.microsoft)) socialProviders.microsoft = { clientId: settings.microsoft.clientId, clientSecret: settings.microsoft.clientSecret, tenantId: "common", prompt: "select_account" };
  if (has(settings.apple)) socialProviders.apple = { clientId: settings.apple.clientId, clientSecret: settings.apple.clientSecret };
  const mail = settings.mail;
  return {
    database: settings.database as BetterAuthOptions["database"],
    secret: settings.secret,
    baseURL: settings.baseURL,
    basePath: "/auth",
    // Apple answers with a form post from its own site.
    trustedOrigins: socialProviders.apple ? ["https://appleid.apple.com"] : [],
    socialProviders,
    // One person, one account: signing in with Google and later with Microsoft under the same
    // verified email is the same person.
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "microsoft", "apple"] } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    plugins: mail
      ? [
          magicLink({
            expiresIn: 15 * 60,
            sendMagicLink: async ({ email, url }) =>
              (({ subject, text, html }) => mail(email, subject, text, html))(signInEmail(url, new URL(url).origin)),
          }),
        ]
      : [],
  };
}

export function betterAuthIdentity(settings: AuthSettings): Identity {
  const options = authOptions(settings);
  // Made on first use, so requests that never touch accounts (check-ins, checkouts) skip it.
  let made: ReturnType<typeof betterAuth> | null = null;
  const auth = () => (made ??= betterAuth(options));
  const methods: SigninMethod[] = [];
  for (const method of ["google", "microsoft", "apple"] as const) if (options.socialProviders?.[method]) methods.push(method);
  if (settings.mail) methods.push("email");
  return {
    methods,
    handler: (request) => auth().handler(request),
    async current(request) {
      const session = await auth().api.getSession({ headers: request.headers }).catch(() => null);
      if (!session) return null;
      const { user } = session;
      return { id: user.id, email: user.email, name: user.name ?? "", emailVerified: !!user.emailVerified };
    },
  };
}
