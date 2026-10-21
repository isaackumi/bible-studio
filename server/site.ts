// The public pages: what Church Studio is, its plans and prices, how to reach us, and the terms,
// privacy and refund policies. Paddle reviews these before it approves selling, and buyers can
// read them before paying. Prices and plan contents come from the same tables the app and the
// checkout use (pricing.ts, domain/plans.ts), so the site cannot drift from what is charged.
//
// DRAFTS: the policies are a plain-language starting point, not legal advice. Have them checked
// for the countries you sell in before going live.

import { TRIAL_DAYS } from "../src/lib/domain/plans.ts";

export type Site = {
  /** The legal name of the business that sells Church Studio (COMPANY_NAME). */
  company: string;
  /** An inbox someone reads (CONTACT_EMAIL). */
  contact: string;
};

const UPDATED = "20 October 2026";
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function layout(title: string, site: Site, body: string): string {
  const mail = escape(site.contact);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="Church Studio puts scripture, songs and sermons on your church's screens, and runs the whole service from one desk.">
<style>
  :root { color-scheme: light dark; --bg: #f6f5f3; --panel: #fff; --ink: #17171b; --muted: #62626c; --line: #e4e2de; --accent: #fa4f00; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f0f12; --panel: #18181d; --ink: #f3f3f5; --muted: #a0a0ab; --line: #2a2a31; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
  a { color: var(--accent); }
  .wrap { width: min(1040px, calc(100% - 32px)); margin: 0 auto; }
  nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; color: var(--ink); text-decoration: none; }
  .mark { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 22px; height: 22px; }
  .mark i { border-radius: 2px; background: var(--ink); opacity: .85; } .mark i:nth-child(2) { background: var(--accent); opacity: 1; }
  nav .links { display: flex; gap: 18px; flex-wrap: wrap; font-size: 14px; } nav .links a { color: var(--muted); text-decoration: none; } nav .links a:hover { color: var(--ink); }
  .hero { padding: 56px 0 40px; }
  .hero h1 { max-width: 760px; margin: 0 0 16px; font-size: clamp(34px, 5vw, 54px); line-height: 1.08; letter-spacing: -.025em; }
  .hero p { max-width: 640px; margin: 0 0 26px; font-size: 19px; color: var(--muted); }
  .btn { display: inline-flex; align-items: center; height: 46px; padding: 0 22px; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 750; text-decoration: none; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .btn.ghost { background: none; color: var(--ink); border: 1px solid var(--line); }
  section { padding: 34px 0; } h2 { margin: 0 0 18px; font-size: 26px; letter-spacing: -.015em; }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
  .feature { padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); } .feature b { display: block; margin-bottom: 4px; } .feature span { color: var(--muted); font-size: 15px; }
  .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  .plan { display: flex; flex-direction: column; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
  .plan.popular { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .plan h3 { margin: 0; font-size: 20px; } .plan .tag { min-height: 48px; margin: 4px 0 14px; color: var(--muted); font-size: 15px; }
  .price { font-size: 32px; font-weight: 800; letter-spacing: -.02em; } .price small { font-size: 15px; font-weight: 600; color: var(--muted); }
  .yearly { margin: 2px 0 14px; color: var(--muted); font-size: 14px; }
  .plan ul { margin: 0; padding: 0; list-style: none; font-size: 15px; } .plan li { padding: 4px 0; } .plan li::before { content: "✓  "; color: var(--accent); font-weight: 800; }
  .plan li em { margin-left: 6px; font-size: 12px; font-style: normal; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; }
  .note { color: var(--muted); font-size: 14px; }
  .doc { max-width: 760px; padding: 24px 0 48px; } .doc h1 { font-size: 34px; letter-spacing: -.02em; margin: 10px 0 4px; } .doc h2 { font-size: 20px; margin: 30px 0 8px; } .doc p, .doc li { color: var(--ink); }
  footer { margin-top: 30px; padding: 26px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
  footer .wrap { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; } footer a { color: var(--muted); }
</style></head><body>
<header class="wrap"><nav>
  <a class="brand" href="/"><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio</a>
  <span class="links"><a href="/#features">Features</a><a href="/#pricing">Pricing</a><a href="/#contact">Contact</a></span>
</nav></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">
  <span>© 2026 ${escape(site.company)} · <a href="mailto:${mail}">${mail}</a></span>
  <span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds &amp; cancellation</a></span>
</div></footer>
</body></html>`;
}

export function termsPage(site: Site): string {
  const c = escape(site.company);
  const mail = escape(site.contact);
  return layout("Terms of Service · Church Studio", site, `<article class="doc">
  <h1>Terms of Service</h1><p class="note">Last updated ${UPDATED}</p>
  <p>These terms are an agreement between you and ${c} ("we", "us") about your use of Church Studio, the desktop application and the services that come with it (license activation, accounts and updates). By installing or using Church Studio you agree to them.</p>
  <h2>1. Using Church Studio</h2>
  <p>We grant you a non-exclusive, non-transferable license to install and use Church Studio under the plan you have: Free, Premium or Church. Each plan covers the number of computers shown on our pricing page. You may not resell, sublicense, reverse engineer or remove license checks from the software, except where the law allows it regardless of these terms.</p>
  <h2>2. Plans, trials and payment</h2>
  <p>Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Prices are shown on our pricing page; taxes are added at checkout where they apply. A paid plan is a subscription that renews each month or year until you cancel. The Premium trial lasts ${TRIAL_DAYS} days, once per computer, and needs no payment details.</p>
  <h2>3. Cancelling and refunds</h2>
  <p>You can cancel at any time; your plan keeps working until the end of the period you paid for. Refunds are described in our <a href="/refunds">Refund and Cancellation Policy</a>.</p>
  <h2>4. Your content</h2>
  <p>Your songs, services, notes and media stay on your computer and remain yours. You are responsible for having the rights to what you show, including song licenses (for example CCLI) and Bible translation permissions.</p>
  <h2>5. Accounts</h2>
  <p>An account is optional. If you create one, keep access to your email or sign-in provider secure; you are responsible for activity on your account.</p>
  <h2>6. Availability and changes</h2>
  <p>Church Studio works offline once activated, but activation, trials and updates need our servers. We may change or improve the software. If we make a change that materially reduces what a paid plan includes, you may cancel and receive a pro-rata refund for the unused period.</p>
  <h2>7. Warranty and liability</h2>
  <p>Church Studio is provided "as is" to the extent the law allows. We are not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have as a consumer that cannot be limited by law.</p>
  <h2>8. Ending</h2>
  <p>You may stop using Church Studio at any time. We may suspend a license that is used in breach of these terms, for example shared beyond its computers, after telling you why.</p>
  <h2>9. Contact</h2>
  <p>${c} · <a href="mailto:${mail}">${mail}</a></p>
  </article>`);
}

export function privacyPage(site: Site): string {
  const c = escape(site.company);
  const mail = escape(site.contact);
  return layout("Privacy Policy · Church Studio", site, `<article class="doc">
  <h1>Privacy Policy</h1><p class="note">Last updated ${UPDATED}</p>
  <p>${c} makes Church Studio. This policy explains what information we handle and why. In short: your library stays on your computer, and we keep only what we need to run licenses, accounts and support.</p>
  <h2>What stays on your computer</h2>
  <p>Songs, services, sermons, notes, media, settings and church details are stored on your computer. We do not receive them.</p>
  <h2>What we receive</h2>
  <ul>
    <li><b>Check-ins.</b> Once a day the app sends an anonymous computer identifier (a one-way hash, not your hardware serial), the app version, the operating system and the plan in use. We use this to count active computers and to keep one free trial per computer. You can turn it off in Settings › Privacy. License activation needs a check-in at least once every 30 days on paid plans.</li>
    <li><b>Error reports.</b> When something goes wrong, the app sends the error and where in the app it happened, with the app version, the operating system and the same anonymous computer identifier. Personal details such as email addresses and file paths are removed first, and no songs, sermons or screen content are included. The same switch in Settings › Privacy turns this off.</li>
    <li><b>Purchases.</b> Your email address and church name, the plan bought, and the license issued. Payments are handled by Paddle; we never see your card details.</li>
    <li><b>Accounts (optional).</b> Your name and email address from your sign-in method (email link, Google, Microsoft or Apple), and which computers are signed in.</li>
    <li><b>Support.</b> What you send us when you write, including any problem report you choose to attach.</li>
  </ul>
  <h2>Features that use other services, when you turn them on</h2>
  <ul>
    <li><b>Voice and captions</b> use your computer's speech recognition (on a Mac, Apple's Speech Recognition, which may process audio on Apple's servers under Apple's privacy policy).</li>
    <li><b>AI summaries and translation</b> send the text involved to the AI provider whose key you enter (for example OpenAI or Anthropic), under that provider's terms.</li>
    <li><b>Online Bibles</b> are fetched from API.Bible, which receives the passages requested and anonymous usage counts required by the publishers.</li>
    <li><b>Planning Center</b>, when you connect it, exchanges service plans with your Planning Center account.</li>
  </ul>
  <h2>Who processes data for us</h2>
  <p>Paddle (payments, invoices and tax), Cloudflare (hosting our servers and database), Resend (sending emails such as license keys and sign-in links), Sentry (collecting error reports), and GitHub (serving downloads and updates). Each processes data only to provide its service.</p>
  <h2>Why we may use it</h2>
  <p>To provide what you asked for (licenses, accounts, updates and support), to meet legal and tax obligations, and, for the anonymous check-ins, our legitimate interest in keeping trials fair and the product working. We do not sell personal data or use it for advertising.</p>
  <h2>How long we keep it</h2>
  <p>Purchase and license records for as long as the law requires for tax (usually up to 7 years). Account data until you ask us to delete the account. Check-in records for up to 24 months, and error reports for up to 90 days.</p>
  <h2>Your rights</h2>
  <p>You can ask to see, correct, export or delete your personal data, or object to how we use it, by writing to <a href="mailto:${mail}">${mail}</a>. You may also complain to your local data protection authority.</p>
  <h2>Contact</h2>
  <p>${c} · <a href="mailto:${mail}">${mail}</a></p>
  </article>`);
}

export function refundsPage(site: Site): string {
  const mail = escape(site.contact);
  return layout("Refund and Cancellation Policy · Church Studio", site, `<article class="doc">
  <h1>Refund and Cancellation Policy</h1><p class="note">Last updated ${UPDATED}</p>
  <h2>Try before you buy</h2>
  <p>Premium can be tried free for ${TRIAL_DAYS} days on each computer, with no payment details, so you can make sure Church Studio works for your church first.</p>
  <h2>Refunds</h2>
  <p>If you are not happy with a purchase, ask for a full refund within 14 days of the first payment for a plan, for any reason. After that, renewals can be refunded within 14 days of the renewal date if the plan has not been used since it renewed. Where the law gives you a longer or wider right to a refund, that applies.</p>
  <p>To ask for a refund, write to <a href="mailto:${mail}">${mail}</a> with the email you bought with, or reply to your Paddle receipt. Refunds are made by Paddle, our reseller, to the original payment method, usually within 5 to 10 working days. A refunded license stops working on its computers, which return to the Free plan.</p>
  <h2>Cancelling</h2>
  <p>You can cancel a subscription at any time, from the link in your Paddle receipt or by writing to us. Cancelling stops the next renewal; your plan keeps working until the end of the period you have paid for. Your library is never deleted: on the Free plan everything you made stays on your computer.</p>
  </article>`);
}
