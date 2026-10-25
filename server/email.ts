// The emails Church Studio sends (sign-in links, license keys), in one design: the app's icon and
// name, a clear heading, one button or one code, and a short footer from HeiTech. Each has a plain
// text version too, for mail apps that show no HTML. Built with tables and inline styles, which is
// what every mail app (Gmail, Outlook, Apple Mail) draws the same.

export type Email = { subject: string; text: string; html: string };

const ACCENT = "#fa4f00";
const INK = "#16181d";
const MUTED = "#5f6470";
const LINE = "#e6e7eb";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Where the logo is served (the license server's own address). */
export const logoUrl = (base: string) => `${base.replace(/\/+$/, "")}/email/logo.png`;

type Block = { kind: "text"; text: string } | { kind: "button"; label: string; url: string } | { kind: "code"; code: string } | { kind: "note"; text: string };

function layout(base: string, input: { preheader: string; heading: string; blocks: Block[]; footer: string }): string {
  const body = input.blocks
    .map((block) => {
      if (block.kind === "text") return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escape(block.text)}</p>`;
      if (block.kind === "note") return `<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:${MUTED};">${escape(block.text)}</p>`;
      if (block.kind === "code")
        return `<div style="margin:4px 0 20px;padding:14px 16px;border:1px solid ${LINE};border-radius:10px;background:#f6f7f9;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.5;color:${INK};word-break:break-all;">${escape(block.code)}</div>`;
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 22px;"><tr><td style="border-radius:10px;background:${ACCENT};"><a href="${escape(block.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(block.label)}</a></td></tr></table>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(input.heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f3f5;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 18px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${escape(logoUrl(base))}" width="40" height="40" alt="Church Studio" style="display:block;border:0;border-radius:10px;"></td>
        <td style="vertical-align:middle;padding-left:12px;font-size:17px;font-weight:700;color:${INK};letter-spacing:-0.01em;">Church Studio</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px 32px 18px;">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:750;color:${INK};letter-spacing:-0.01em;">${escape(input.heading)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
      ${escape(input.footer)}<br>
      Church Studio by HeiTech · <a href="mailto:support@heitechinc.com" style="color:${MUTED};">support@heitechinc.com</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** The emailed sign-in link. */
export function signInEmail(url: string, base: string): Email {
  return {
    subject: "Sign in to Church Studio",
    text: `Sign in to Church Studio\n\nOpen this link to sign in:\n${url}\n\nIt works once, for 15 minutes. Then go back to Church Studio and tap the number it shows.\n\nIf you did not ask to sign in, you can ignore this email.\n\nChurch Studio by HeiTech · support@heitechinc.com`,
    html: layout(base, {
      preheader: "Your sign-in link for Church Studio. It works once, for 15 minutes.",
      heading: "Sign in to Church Studio",
      blocks: [
        { kind: "text", text: "Use the button below to sign in. Then go back to Church Studio and tap the number it shows." },
        { kind: "button", label: "Sign in to Church Studio", url },
        { kind: "note", text: "The link works once, for 15 minutes." },
        { kind: "note", text: `Button not working? Copy this into your browser: ${url}` },
      ],
      footer: "You got this because someone asked to sign in to Church Studio with this address. If it was not you, ignore it: nothing changes.",
    }),
  };
}

/** An owner added someone to their license: who invited them, to which church, and how to join. */
export function inviteEmail(input: { inviter: string; inviterEmail: string; church: string; to: string; plan: "premium" | "church" }, base: string): Email {
  const root = base.replace(/\/+$/, "");
  const where = input.church ? input.church : "their church";
  const whose = input.church ? `${input.church}'s` : "their";
  const plan = input.plan === "church" ? "Church" : "Premium";
  const about = `${input.inviter} (${input.inviterEmail}) added you to ${whose} ${plan} plan on Church Studio, the app for putting songs, Bible verses and slides on the screens at church. Once you join, the church's songs, services, slides and pictures come to your computer and stay in step with everyone else's.`;
  const steps = ["1. Download Church Studio for your computer (Windows or Mac).", "2. Open it, go to Settings › Plan & account and choose Sign in.", `3. Sign in with this email address: ${input.to}`];
  const keyless = "No license key to type: signing in is all it takes.";
  return {
    subject: `${input.inviter} invited you to ${where} on Church Studio`,
    text: [
      `${input.inviter} invited you to ${where} on Church Studio`,
      "",
      about,
      "",
      ...steps,
      "",
      keyless,
      "",
      `Windows: ${root}/download/windows`,
      `Mac: ${root}/download/mac`,
      "",
      "Not expecting this? Ignore it: nothing happens unless you sign in.",
      "",
      "Church Studio by HeiTech · support@heitechinc.com",
    ].join("\n"),
    html: layout(base, {
      preheader: `${input.inviter} invited you to ${where}. Download Church Studio and sign in with ${input.to}.`,
      heading: `Join ${where} on Church Studio`,
      blocks: [
        { kind: "text", text: about },
        ...steps.map((step) => ({ kind: "text" as const, text: step })),
        { kind: "button", label: "Download Church Studio", url: `${root}/#download` },
        { kind: "note", text: keyless },
        { kind: "note", text: `Direct downloads: Windows ${root}/download/windows · Mac ${root}/download/mac` },
      ],
      footer: `You got this because ${input.inviter} added this address to their Church Studio plan. Not expecting it? Ignore it: nothing happens unless you sign in.`,
    }),
  };
}

/** Someone the owner added could not join: every computer on the plan is in use. */
export function seatsFullEmail(input: { who: string; email: string; computer: string; seats: number; plan: "premium" | "church" }, base: string): Email {
  const plan = input.plan === "church" ? "Church" : "Premium";
  const said = `${input.who} (${input.email}) tried to use Church Studio on ${input.computer}, but all ${input.seats} computers on your ${plan} plan are in use.`;
  const how = "To let them in, open Church Studio, go to Settings › Plan & account, and release a computer that is no longer used. They are let in the next time they open Church Studio.";
  return {
    subject: `${input.who} could not join: all ${input.seats} computers are in use`,
    text: [said, "", how, "", "Church Studio by HeiTech · support@heitechinc.com"].join("\n"),
    html: layout(base, {
      preheader: said,
      heading: `${input.who} could not join`,
      blocks: [
        { kind: "text", text: said },
        { kind: "text", text: how },
      ],
      footer: "You got this because you own this Church Studio plan and added this person to it.",
    }),
  };
}

/** A license key, after a purchase. `added`: Church Studio already put it on the computer that bought it. */
export function licenseKeyEmail(input: { key: string; plan: "premium" | "church"; until?: string | null; added?: boolean }, base: string): Email {
  const plan = input.plan === "church" ? "Church" : "Premium";
  const how = input.added
    ? "Church Studio has already added it on the computer you bought from. To use it on another computer: Settings › Plan & account › License key."
    : "Open Church Studio, go to Settings › Plan & account, paste the key under License key, and choose Add key.";
  const when = input.until ? `It runs until ${input.until}. When your plan renews, it keeps working.` : "The key keeps working while your plan renews; there is nothing to do at renewal.";
  return {
    subject: `Your Church Studio ${plan} license key`,
    text: [`Thank you for choosing Church Studio ${plan}.`, "", "Your license key:", "", input.key, "", how, "", when, "", "Keep this email. You can add the same key again on a new computer.", "", "Church Studio by HeiTech · support@heitechinc.com"].join("\n"),
    html: layout(base, {
      preheader: `Your Church Studio ${plan} license key, and how to add it.`,
      heading: `Your ${plan} plan is ready`,
      blocks: [
        { kind: "text", text: `Thank you for choosing Church Studio ${plan}. Here is your license key:` },
        { kind: "code", code: input.key },
        { kind: "text", text: how },
        { kind: "note", text: when },
        { kind: "note", text: "Keep this email. You can add the same key again on a new computer." },
      ],
      footer: "You got this because a Church Studio plan was bought with this address.",
    }),
  };
}
