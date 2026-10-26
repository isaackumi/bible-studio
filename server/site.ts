// The public pages: what Church Studio is, its plans and prices, how to reach us, and the terms,
// privacy and refund policies. Paddle reviews these before it approves selling, and buyers can
// read them before paying. Prices and plan contents come from the same tables the app and the
// checkout use (pricing.ts, domain/plans.ts), so the site cannot drift from what is charged.
//
// DRAFTS: the policies are a plain-language starting point, not legal advice. Have them checked
// for the countries you sell in before going live.

import { TRIAL_DAYS } from "../src/lib/domain/plans.ts";
import { THIRD_PARTY } from "./third-party.ts";
import { FONT_CSS, seoHead } from "./seo.ts";

export type Site = {
  /** The legal name of the business that sells Church Studio (COMPANY_NAME). */
  company: string;
  /** An inbox someone reads (CONTACT_EMAIL). */
  contact: string;
  /** The business's postal address (COMPANY_ADDRESS), shown as the data controller's address. */
  address?: string;
  /** The country whose law governs the terms (COMPANY_COUNTRY), e.g. "Ghana". */
  country?: string;
};

const UPDATED = "21 October 2026";
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Each policy page: its address and what a search result says about it. */
const POLICY_META: Record<string, { path: string; description: string }> = {
  "Terms of Service · Church Studio": { path: "/terms", description: "The terms for using Church Studio, the church presentation software made by HeiTech: plans, trials, licences and your content." },
  "Privacy Policy · Church Studio": { path: "/privacy", description: "What Church Studio keeps, what it never sees, and your rights: your songs, services and audio stay on your computer." },
  "Open-source licenses · Church Studio": { path: "/licenses", description: "The open-source software and Bible texts Church Studio is built with, and their licences." },
  "Security · Church Studio": { path: "/security", description: "How Church Studio protects churches' data, and how to report a security problem." },
  "Refund and Cancellation Policy · Church Studio": { path: "/refunds", description: "How to cancel a Church Studio plan at any time, and when a refund is given." },
};

function layout(title: string, site: Site, body: string): string {
  const mail = escape(site.contact);
  const meta = POLICY_META[title];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${meta ? seoHead({ title, description: meta.description, path: meta.path, crumb: title.replace(/ · Church Studio$/, ""), systemFonts: true }) : `<title>${escape(title)}</title>`}
<style>
  ${FONT_CSS}
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
  .doc table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0; } .doc th, .doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; } .doc th { color: var(--muted); font-weight: 650; }
  .doc details { margin: 8px 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); } .doc summary { cursor: pointer; font-weight: 650; } .doc .names { margin: 10px 0 2px; font-size: 13px; color: var(--muted); line-height: 1.8; }
  .doc .toc { padding: 12px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); font-size: 15px; } .doc .toc ol { margin: 6px 0 0; padding-left: 20px; }
  .doc { max-width: 760px; padding: 24px 0 48px; } .doc h1 { font-size: 34px; letter-spacing: -.02em; margin: 10px 0 4px; } .doc h2 { font-size: 20px; margin: 30px 0 8px; } .doc p, .doc li { color: var(--ink); }
  footer { margin-top: 30px; padding: 26px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
  footer .wrap { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; } footer a { color: var(--muted); }
</style></head><body>
<header class="wrap"><nav>
  <a class="brand" href="/"><span class="mark"><i></i><i></i><i></i><i></i></span>Church Studio</a>
  <span class="links"><a href="/features">Features</a><a href="/#pricing">Pricing</a><a href="/whats-new">What's new</a><a href="mailto:${mail}">Contact</a></span>
</nav></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">
  <span>© 2026 ${escape(site.company)} · <a href="mailto:${mail}">${mail}</a></span>
  <span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds &amp; cancellation</a> · <a href="/licenses">Open-source licenses</a> · <a href="/security">Security</a></span>
</div></footer>
</body></html>`;
}

/** Who we are, as the policies name us: the company, and its address when one is set. */
const controller = (site: Site) => `${escape(site.company)}${site.address ? `, ${escape(site.address)}` : ""}`;

export function termsPage(site: Site): string {
  const c = escape(site.company);
  const mail = escape(site.contact);
  const law = site.country ? `the laws of ${escape(site.country)}` : `the laws of the country where ${c} is registered`;
  return layout("Terms of Service · Church Studio", site, `<article class="doc">
  <h1>Terms of Service</h1><p class="note">Last updated ${UPDATED}</p>
  <p>These terms are an agreement between you and ${controller(site)} ("we", "us") about your use of Church Studio: the desktop application, the browser version, and the services that come with them (license activation, accounts, updates and support). By installing or using Church Studio you agree to them. If you use it for a church or organisation, you confirm you may accept these terms for it.</p>
  <h2>1. Using Church Studio</h2>
  <p>We grant you a non-exclusive, non-transferable license to install and use Church Studio under the plan you have: Free, Premium or Church. Each plan covers the number of computers shown on our pricing page. The browser version at church-studio.heitechinc.com/app is a demo of the app; your work there is kept only in that browser.</p>
  <h2>2. What you may not do</h2>
  <ul>
    <li>Resell, rent or sublicense Church Studio, or share a license beyond the computers its plan covers.</li>
    <li>Remove, bypass or tamper with license checks, or reverse engineer the software, except where the law allows it regardless of these terms.</li>
    <li>Use our servers in a way that harms them or other people, such as automated abuse, attempts to get trials or licenses you are not entitled to, or attempts to reach data that is not yours.</li>
    <li>Use Church Studio to show or stream anything unlawful, or anything you do not have the rights to show.</li>
  </ul>
  <h2>3. Plans, trials and payment</h2>
  <p>Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Paddle's buyer terms apply to your purchase. Prices are shown on our pricing page; taxes are added at checkout where they apply. A paid plan is a subscription that renews each month or year until you cancel. The Premium trial lasts ${TRIAL_DAYS} days, once per computer, in the desktop app, and needs no payment details.</p>
  <h2>4. Cancelling and refunds</h2>
  <p>You can cancel at any time; your plan keeps working until the end of the period you paid for. Refunds are described in our <a href="/refunds">Refund and Cancellation Policy</a>.</p>
  <h2>5. Your content</h2>
  <p>Your songs, services, notes and media stay on your computer and remain yours. You are responsible for having the rights to what you show and stream, including song licenses (for example CCLI), Bible translation permissions, images, videos and music. The Bible texts that come with the app are in the public domain or openly licensed, as listed on our <a href="/licenses">licenses page</a>.</p>
  <h2>6. Other services you connect</h2>
  <p>Some features use services you choose to connect, such as an AI provider with your own key, API.Bible, Planning Center or a streaming platform. Your use of them is under their terms, and they are responsible for them. AI output can be wrong: check summaries and translations before you rely on them or show them.</p>
  <h2>7. Accounts</h2>
  <p>An account is optional. If you create one, keep access to your email or sign-in provider secure; you are responsible for activity on your account. You can ask us to delete it at any time.</p>
  <h2>8. Updates, availability and changes</h2>
  <p>Church Studio works offline once activated, but activation, trials, accounts and updates need our servers. Updates are signed by us, and the app installs only signed updates. We may change or improve the software. If we make a change that materially reduces what a paid plan includes, you may cancel and receive a pro-rata refund for the unused period.</p>
  <h2>9. Our software and names</h2>
  <p>Church Studio, its design and its code belong to us or our licensors. These terms do not give you any right to our names or logos. Church Studio includes open-source software; each component is under its own license, listed on our <a href="/licenses">licenses page</a>, and nothing in these terms limits what those licenses allow. If you send us feedback or ideas, we may use them without obligation to you.</p>
  <h2>10. Warranty and liability</h2>
  <p>Church Studio is provided "as is" to the extent the law allows. We do not promise it will be free of errors or always available, so keep backups of what matters and have a plan for a live service. We are not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have as a consumer that cannot be limited by law, or our liability where the law does not allow it to be limited.</p>
  <h2>11. Ending</h2>
  <p>You may stop using Church Studio at any time. We may suspend a license that is used in breach of these terms, for example shared beyond its computers, after telling you why. Sections 5, 9, 10 and 13 continue after these terms end.</p>
  <h2>12. Changes to these terms</h2>
  <p>We may update these terms. For a change that matters, we will tell you on our website or in the app at least 30 days before it applies. If you do not agree, you may cancel and receive a pro-rata refund for the unused period of a paid plan.</p>
  <h2>13. Law and disputes</h2>
  <p>These terms are governed by ${law}. If you are a consumer, you keep the protection of the mandatory laws of the country where you live, and you may bring a claim in its courts. Please write to us first: most problems are solved quickly that way. If any part of these terms cannot be enforced, the rest still applies. These terms, with the policies they link to, are the whole agreement about Church Studio.</p>
  <h2>14. Contact</h2>
  <p>${controller(site)} · <a href="mailto:${mail}">${mail}</a></p>
  </article>`);
}

export function privacyPage(site: Site): string {
  const c = escape(site.company);
  const mail = escape(site.contact);
  return layout("Privacy Policy · Church Studio", site, `<article class="doc">
  <h1>Privacy Policy</h1><p class="note">Last updated ${UPDATED}</p>
  <p>${c} makes Church Studio. This policy explains what information we handle, why, and what you can do about it. In short: <b>your library stays on your computer</b>, we keep only what we need to run licenses, accounts and support, and we never sell personal data or use it for advertising.</p>
  <nav class="toc"><b>Contents</b><ol>
    <li><a href="#who">Who we are</a></li><li><a href="#local">What stays with you</a></li><li><a href="#receive">What we receive</a></li><li><a href="#features">Features that use other services</a></li>
    <li><a href="#cookies">Cookies and storage</a></li><li><a href="#processors">Who processes data for us</a></li><li><a href="#why">Why we use it</a></li><li><a href="#keep">How long we keep it</a></li>
    <li><a href="#safe">How we protect it</a></li><li><a href="#rights">Your rights</a></li><li><a href="#children">Children</a></li><li><a href="#changes">Changes</a></li>
  </ol></nav>

  <h2 id="who">1. Who we are</h2>
  <p>The controller of the personal data described here is ${controller(site)}. For anything about privacy, write to <a href="mailto:${mail}">${mail}</a>. For purchases, Paddle.com, our reseller and Merchant of Record, is a separate controller of the payment data it collects, under <a href="https://www.paddle.com/legal/privacy" rel="noopener">Paddle's privacy policy</a>.</p>

  <h2 id="local">2. What stays with you</h2>
  <p>Songs, services, sermons, notes, media, settings, church details and connected-service keys (AI, streaming, Planning Center) are stored on your computer. We do not receive them. In the browser version they are stored in that browser, and clearing the browser's site data removes them.</p>

  <h2 id="receive">3. What we receive</h2>
  <ul>
    <li><b>Check-in.</b> When the app starts, and every few hours while it is open, it sends a computer identifier (a one-way hash, not your hardware serial), the app version, the operating system and the plan in use; in the browser version also the browser's name and version (such as "Edge 129"). It also sends how many services were started and how many scripture passages and songs were shown since the last check-in: numbers only, never which ones or what they said. If you are signed in, the check-in is linked to your account. We note the days a computer was used. We use this to count active computers and people, see how much the app is used, keep one free trial per computer, and help with support. You can turn it off in Settings › Plan &amp; account › Privacy. Paid plans still check their license online at least once every 30 days.</li>
    <li><b>Trials.</b> The computer identifier and when the trial started and ends. To stop trials being farmed from one place, we count new trials per network (IP) address for two days, then the count is deleted.</li>
    <li><b>Licenses.</b> The license, the email it was bought with, and the computers using it, by the name you give them (for example "Sanctuary Mac") and when they last checked in.</li>
    <li><b>Purchases.</b> Your email address and church name, the plan bought, the price and any promo code. Payments are handled by Paddle; we never see your card details.</li>
    <li><b>Accounts (optional).</b> Your name and email address from your sign-in method (email link, Google, Microsoft or Apple), your sign-in sessions, and which computers are signed in.</li>
    <li><b>Error reports.</b> When something goes wrong, the app sends the error and where in the app it happened, with the app version, the operating system and the computer identifier. Email addresses and file paths are removed first, and no songs, sermons or screen content are included. The same Privacy switch turns this off.</li>
    <li><b>Support.</b> What you send us when you write, including any problem report you choose to attach.</li>
    <li><b>Website and servers.</b> Our hosting provider, Cloudflare, processes the IP address and browser details of every visit to keep the service secure and working; we do not use them to track you.</li>
  </ul>
  <p>Only a few authorised people at ${c} can see this data, through a sign-in protected admin page that records every change they make.</p>

  <h2 id="features">4. Features that use other services, when you turn them on</h2>
  <ul>
    <li><b>Voice and captions</b> use your computer's speech recognition. On a Mac this is Apple's Speech Recognition, which may process audio on Apple's servers under Apple's privacy policy; on Windows, the recognizer built into Windows runs on the computer. If you choose <b>Accurate</b> or <b>Most accurate</b> listening, the speech model runs entirely on your computer and audio never leaves it; the model is downloaded once from a third-party model host, which sees your IP address. We do not receive the audio or the words.</li>
    <li><b>AI features</b> (summaries, slides, translation and the like) send the text involved to the AI provider whose key you enter (for example OpenAI or Anthropic), under that provider's terms. Once an AI is set up, <b>verses by meaning</b> is on: while listening, short phrases that sound like scripture are sent to that provider so it can name the verse. Each feature can be switched off in Settings › AI assistant, and with an AI on your own computer nothing is sent.</li>
    <li><b>Online Bibles</b> are fetched from API.Bible, which receives the passages requested and anonymous usage counts required by the publishers.</li>
    <li><b>Planning Center</b>, when you connect it, exchanges service plans with your Planning Center account.</li>
    <li><b>Streaming</b> sends your program straight from your computer to the platform you choose (for example YouTube or Facebook), under its terms.</li>
    <li><b>The phone remote</b> works on your local network unless you choose <i>Internet</i> in its settings. Then the buttons pressed and what the phone shows (the words on Preview and Program, the running order) pass through our server to reach your computer; they are relayed and never stored.</li>
    <li><b>Audience rooms</b> (questions, votes, quizzes and polls on people's phones) and <b>screens shared to phones and TVs</b> go through our server. A room keeps what is typed into it (questions and any name given), the answers and votes, and the screen being shared, until the church ends the room or a day after it was last used; then it is deleted. To limit votes, a one-way code made from each phone's IP address and the room is kept for the room's life; the address itself is not stored.</li>
    <li><b>NDI®</b> works on your local network; nothing goes through our servers.</li>
    <li><b>Updates</b> are checked and downloaded from GitHub, which sees your IP address.</li>
  </ul>

  <h2 id="cookies">5. Cookies and storage</h2>
  <p>We do not use advertising or analytics cookies, and no third-party trackers run on our website or in the app. When you sign in, we set a session cookie that keeps you signed in. Cloudflare may set a cookie needed for security. Paddle's checkout sets the cookies it needs to take a payment. The browser version keeps your library and settings in your browser's storage. Because these are needed for what you asked for, they do not need your consent; you can clear them in your browser at any time.</p>

  <h2 id="processors">6. Who processes data for us</h2>
  <table><thead><tr><th>Service</th><th>What for</th><th>Where</th></tr></thead><tbody>
    <tr><td>Paddle</td><td>Checkout, payments, invoices, tax (Merchant of Record)</td><td>UK, EU, US</td></tr>
    <tr><td>Cloudflare</td><td>Hosting our servers, database and website; security</td><td>Global</td></tr>
    <tr><td>Resend</td><td>Sending emails (license keys, sign-in links, receipts from us)</td><td>US</td></tr>
    <tr><td>Sentry</td><td>Collecting error reports</td><td>US</td></tr>
    <tr><td>GitHub</td><td>Serving downloads and updates</td><td>US</td></tr>
    <tr><td>Google, Microsoft, Apple</td><td>Only if you choose them to sign in</td><td>US</td></tr>
  </tbody></table>
  <p>Each processes data only to provide its service to us. Where data leaves your country, for example from the EU, UK, Ghana or Nigeria to the US, we rely on the safeguards the law requires, such as the European Commission's standard contractual clauses or an adequacy decision.</p>

  <h2 id="why">7. Why we use it</h2>
  <p>To provide what you asked for: licenses, trials, accounts, updates and support (performing our contract with you). To meet legal and tax obligations. For check-ins, error reports, trial limits and security, our legitimate interest in keeping the product working, fair and safe, which you can switch off where noted. Where we ask for consent, you can withdraw it at any time.</p>

  <h2 id="keep">8. How long we keep it</h2>
  <table><tbody>
    <tr><td>Purchase and license records</td><td>As long as the law requires for tax, usually up to 7 years</td></tr>
    <tr><td>Accounts</td><td>Until you ask us to delete the account</td></tr>
    <tr><td>Check-ins and computer records</td><td>Up to 24 months after the computer was last seen</td></tr>
    <tr><td>Trial records</td><td>As long as needed to keep one trial per computer</td></tr>
    <tr><td>Trial counts per network address</td><td>2 days</td></tr>
    <tr><td>Sign-in links</td><td>10 minutes, or until used</td></tr>
    <tr><td>Error reports</td><td>90 days</td></tr>
    <tr><td>Record of staff changes</td><td>24 months</td></tr>
    <tr><td>Support emails</td><td>As long as needed to help you, up to 3 years</td></tr>
  </tbody></table>

  <h2 id="safe">9. How we protect it</h2>
  <p>Data travels encrypted (HTTPS). Licenses and updates are cryptographically signed, so they cannot be forged. Staff access is limited to a few people, protected by sign-in through Cloudflare Access, and every change is recorded. We collect as little as we can: your library never leaves your computer. If a breach affecting your data happens, we will tell you and the authorities as the law requires. To report a security problem, see our <a href="/security">security page</a>.</p>

  <h2 id="rights">10. Your rights</h2>
  <p>Depending on where you live, you can ask to see the personal data we hold about you, correct it, delete it, get a copy to take elsewhere, restrict or object to how we use it, and withdraw consent. Write to <a href="mailto:${mail}">${mail}</a> from the email involved; we may ask you to confirm it is you, and we answer within 30 days. To delete an account, write to the same address. We do not sell or "share" personal data as the California Consumer Privacy Act defines it.</p>
  <p>You may also complain to a data protection authority, for example Ghana's Data Protection Commission, the Nigeria Data Protection Commission, the authority in your EU country, or the UK Information Commissioner's Office. We would like the chance to help first.</p>

  <h2 id="children">11. Children</h2>
  <p>Church Studio is made for churches and the adults who run their services. It is not directed at children, and we do not knowingly collect personal data from children under 13 (or 16 where the law requires). If you think a child has given us personal data, write to us and we will delete it.</p>

  <h2 id="changes">12. Changes</h2>
  <p>We will update this policy when what we do changes, and change the date at the top. For a change that matters, we will tell you on our website or in the app before it applies.</p>
  <p>${controller(site)} · <a href="mailto:${mail}">${mail}</a></p>
  </article>`);
}

/** The open-source software inside Church Studio, by license, from scripts/third-party.mjs. */
export function licensesPage(site: Site): string {
  const groups = new Map<string, Array<readonly ["js" | "rust", string, string, string]>>();
  for (const item of THIRD_PARTY) groups.set(item[3], [...(groups.get(item[3]) ?? []), item]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const link = (item: readonly ["js" | "rust", string, string, string]) =>
    `<a href="${item[0] === "js" ? `https://www.npmjs.com/package/${escape(item[1])}` : `https://crates.io/crates/${escape(item[1])}`}" rel="noopener">${escape(item[1])}</a> ${escape(item[2])}`;
  return layout("Open-source licenses · Church Studio", site, `<article class="doc">
  <h1>Open-source licenses</h1><p class="note">Last updated ${UPDATED}</p>
  <p>Church Studio is built with ${THIRD_PARTY.length} open-source components: ${THIRD_PARTY.filter((item) => item[0] === "js").length} JavaScript packages and ${THIRD_PARTY.filter((item) => item[0] === "rust").length} Rust crates. We are grateful to their authors. Each component is under its own license, listed below with a link to its page, where its full license text and source code are published.</p>
  <h2>Bible texts</h2>
  <table><thead><tr><th>Translation</th><th>License</th></tr></thead><tbody>
    <tr><td>King James Version, American Standard Version, World English Bible, Bible in Basic English</td><td>Public domain</td></tr>
    <tr><td>Akuapem Twi Bible (Nkwa Asɛm)</td><td>© 1996, 2020 Biblica, Inc. Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>, from <a href="https://ebible.org/details.php?id=twi" rel="noopener">eBible.org</a>, unchanged. Church Studio is not affiliated with or endorsed by Biblica, Inc.</td></tr>
    <tr><td>Ewe, Yorùbá, Igbo, Hausa and Asante Twi (Biblica Open), downloaded when you choose them</td><td>© Biblica, Inc. (Ewe 1988, 2006, 2020; Yorùbá 2009, 2017; Igbo 2020; Hausa 2009, 2020; Asante Twi 1996, 2020). Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>, from <a href="https://ebible.org" rel="noopener">eBible.org</a>, unchanged. Church Studio is not affiliated with or endorsed by Biblica, Inc.</td></tr>
  </tbody></table>
  <p>Other translations come from API.Bible under each publisher's license, when you choose them.</p>
  <h2>Speech model</h2>
  <p>Accurate listening uses <a href="https://github.com/openai/whisper" rel="noopener">OpenAI Whisper</a> through <a href="https://github.com/ggml-org/whisper.cpp" rel="noopener">whisper.cpp</a>, both under the MIT License. Most accurate listening uses <a href="https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" rel="noopener">Parakeet TDT 0.6B v3</a> by NVIDIA, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a> and converted for <a href="https://onnxruntime.ai" rel="noopener">ONNX Runtime</a> (MIT License), run through <a href="https://github.com/cjpais/transcribe-rs" rel="noopener">transcribe-rs</a> (MIT License) with a change to how many processor cores it uses. Each model is downloaded only when you turn it on.</p>
  <h2>Fonts</h2>
  <p>Inter, Figtree, Instrument Sans and Instrument Serif are licensed under the <a href="https://openfontlicense.org" rel="noopener">SIL Open Font License 1.1</a>.</p>
  <h2>Software components</h2>
  <p class="note">Components under the Mozilla Public License 2.0 are used unchanged; their source code is available at the links below.</p>
  ${sorted.map(([license, items]) => `<details><summary>${escape(license)} · ${items.length}</summary><p class="names">${items.map(link).join(" · ")}</p></details>`).join("\n  ")}
  <h2>Trademarks</h2>
  <p>NDI® is a registered trademark of Vizrt NDI AB. Other names are the trademarks of their owners and are used only to describe compatibility.</p>
  </article>`);
}

export function securityPage(site: Site): string {
  const mail = escape(site.contact);
  return layout("Security · Church Studio", site, `<article class="doc">
  <h1>Security</h1><p class="note">Last updated ${UPDATED}</p>
  <h2>Reporting a problem</h2>
  <p>If you find a security weakness in Church Studio, its website or its servers, please write to <a href="mailto:${mail}?subject=Security">${mail}</a> with "Security" in the subject. Tell us what you found, how to reproduce it and what it could affect. We reply within 5 working days, keep you updated, and credit you if you wish once it is fixed.</p>
  <p>Please give us a reasonable time to fix a problem before telling others, do not access or change data that is not yours, and do not disrupt the service or other people. If you act in good faith within these rules, we will not take legal action against you.</p>
  <h2>How Church Studio is protected</h2>
  <ul>
    <li>Your library stays on your computer; our servers never receive your songs, sermons or notes.</li>
    <li>Updates are signed, and the app installs only updates signed by us.</li>
    <li>Licenses and plan leases are signed with Ed25519 keys, so they cannot be forged or edited.</li>
    <li>Everything travels over HTTPS.</li>
    <li>Staff access is limited, protected by Cloudflare Access sign-in, capped, and every change is recorded and reported.</li>
    <li>Payments are taken by Paddle; we never see card details.</li>
  </ul>
  </article>`);
}

/** /.well-known/security.txt (RFC 9116): where to report a security problem. */
export function securityTxt(site: Site, origin: string, now: number): string {
  // Kept within a year, as the standard asks, by counting from today.
  const expires = new Date(now + 300 * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
  return `Contact: mailto:${site.contact}\nExpires: ${expires}\nPreferred-Languages: en\nPolicy: ${origin}/security\nCanonical: ${origin}/.well-known/security.txt\n`;
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
