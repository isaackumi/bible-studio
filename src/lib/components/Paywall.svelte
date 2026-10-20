<script lang="ts">
  import { modalFocus } from "../ui/modal-focus";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut, backOut } from "svelte/easing";
  import { session } from "../app/session.svelte";
  import { discounted, PROMO_REASONS, type Interval, type PromoResult } from "../domain/billing";
  import { FEATURE_LABELS, PLANS, planFor, TRIAL_DAYS, type PlanFeature, type PlanId } from "../domain/plans";
  import BrandMark from "./BrandMark.svelte";
  import Icon from "./Icon.svelte";
  import { t, tn } from "../i18n/core";

  // The plans page, full screen: why upgrade (in the words of the feature that was asked for), the
  // three plans with live prices, promo codes, the free trial, and checkout without leaving the
  // app. After payment the app keeps the key and its lease by itself.

  const open = $derived(session.paywallOpen || session.upgradeFor !== null);
  const feature = $derived(session.upgradeFor);
  const wanted = $derived(feature ? planFor(feature) : null);

  let interval = $state<Interval>("yearly");
  let promoOpen = $state(false);
  let promoText = $state("");
  let promo = $state<PromoResult | null>(null);
  let promoNote = $state("");
  let promoBusy = $state(false);
  let keyOpen = $state(false);
  let keyText = $state("");
  let keyError = $state("");
  let keyBusy = $state(false);
  let compareOpen = $state(false);
  /** The plan being bought (the checkout step), or null while choosing. */
  let buying = $state<"premium" | "church" | null>(null);
  let email = $state(session.workspace.profile?.email ?? "");
  let name = $state(session.workspace.churchName || session.workspace.profile?.name || "");
  let busy = $state(false);
  let error = $state("");
  let trialNote = $state("");

  const PAID = ["premium", "church"] as const;
  const BASE: PlanFeature[] = ["presenter", "scripture", "songs", "sermon", "slides", "media", "audience-output"];

  const yearlySaving = $derived(Math.round((1 - PLANS[1]!.price.yearly / (PLANS[1]!.price.monthly * 12)) * 100));
  /** A feature's name without its explanation ("Production Desk: scenes, cameras, video" → "Production Desk"). */
  const short = (entry: PlanFeature) => t(FEATURE_LABELS[entry].label).split(":")[0]!.trim();
  const headline = $derived(
    feature
      ? t("Unlock {feature}", { feature: short(feature) })
      : t("Run every service with confidence"),
  );
  const current = $derived(session.plan);
  const canTrial = $derived(current === "free" && !session.trialUsed);
  const subline = $derived(
    feature && wanted
      ? canTrial
        ? t("{feature} is part of {plan}. Try it free for {days} days, or choose the plan that fits your church.", { feature: short(feature), plan: t(wanted.name), days: TRIAL_DAYS })
        : t("{feature} is part of {plan}. Choose the plan that fits your church.", { feature: short(feature), plan: t(wanted.name) })
      : t("Production, voice, broadcast and more, for churches of every size. Start free, upgrade when you are ready."),
  );

  function cents(plan: PlanId): number {
    const entry = PLANS.find((item) => item.id === plan)!;
    return (interval === "yearly" ? entry.price.yearly : entry.price.monthly) * 100;
  }
  const money = (value: number) => `$${(value / 100).toFixed(value % 100 ? 2 : 0)}`;
  /** The big number on a card: per month (yearly shows its monthly share). */
  function perMonth(plan: PlanId, after = true): string {
    const total = after ? discounted(cents(plan), promoFor(plan)) : cents(plan);
    return money(interval === "yearly" ? Math.round(total / 12) : total);
  }
  function promoFor(plan: PlanId): PromoResult | null {
    if (!promo?.ok || plan === "free") return null;
    return promo;
  }

  /** What a plan adds over the one below it (the base features are taken as read). */
  function adds(plan: (typeof PLANS)[number]): PlanFeature[] {
    const index = PLANS.indexOf(plan);
    const below = index > 0 ? PLANS[index - 1]!.features : [];
    return plan.features.filter((entry) => !below.includes(entry) && (plan.id === "free" || !BASE.includes(entry)));
  }


  async function applyPromo() {
    const code = promoText.trim();
    if (!code) return;
    promoBusy = true;
    const plan = buying ?? (wanted?.id === "church" ? "church" : "premium");
    const result = await session.checkPromo(code, plan, interval);
    promoBusy = false;
    if (result.ok) {
      promo = result as PromoResult;
      promoNote = "";
    } else {
      promo = null;
      promoNote = result.reason === "offline" ? t("The code could not be checked. Check the internet connection.") : t(PROMO_REASONS[result.reason]);
    }
  }

  function clearPromo() {
    promo = null;
    promoText = "";
    promoNote = "";
  }

  async function trial() {
    busy = true;
    trialNote = "";
    const problem = await session.startTrial(promo?.ok && promo.trialDays ? promo.code : undefined);
    busy = false;
    if (problem) trialNote = problem;
    else close();
  }

  function choose(plan: "premium" | "church") {
    buying = plan;
    error = "";
    // A code checked for another plan is checked again for this one.
    if (promo?.ok) void applyPromo();
  }

  async function checkoutNow(event: SubmitEvent) {
    event.preventDefault();
    if (!buying) return;
    busy = true;
    error = "";
    const problem = await session.buy({ plan: buying, interval, email: email.trim(), name: name.trim(), ...(promo?.ok ? { promo: promo.code } : {}) });
    busy = false;
    if (problem) error = problem;
  }

  async function addKey(event: SubmitEvent) {
    event.preventDefault();
    keyBusy = true;
    keyError = (await session.redeemCode(keyText)) ?? "";
    keyBusy = false;
    if (!keyError) {
      keyText = "";
      close();
    }
  }

  function close() {
    if (session.checkout?.status === "waiting") return;
    session.paywallOpen = false;
    session.upgradeFor = null;
    buying = null;
    error = "";
    if (session.checkout) session.dismissCheckout();
  }

  function onKey(event: KeyboardEvent) {
    if (!open || event.key !== "Escape") return;
    if (buying && !session.checkout) buying = null;
    else close();
  }

  let copied = $state(false);
  async function copyKey() {
    if (!session.checkout?.key) return;
    await navigator.clipboard.writeText(session.checkout.key).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  const FAQ = [
    { q: "Can I cancel any time?", a: "Yes. Your plan runs to the end of the period you paid for, then the app returns to Free. Your library stays on your computer either way." },
    { q: "Does it work without internet?", a: "Yes. Church Studio checks in now and then; between check-ins it runs offline for up to 30 days." },
    { q: "How many computers?", a: "Premium runs on one computer, Church on three at once (for multi-campus or a second operator). Release a computer any time in Settings." },
  ];
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="paywall" role="dialog" aria-modal="true" aria-label={t("Plans")} transition:fade={{ duration: 180 }} use:modalFocus>
    <div class="glow one" aria-hidden="true"></div>
    <div class="glow two" aria-hidden="true"></div>

    <header class="bar">
      <span class="pw-brand"><BrandMark size={26} tone="current" /> Church Studio</span>
      <span class="bar-tools">
        {#if session.billingTest}<span class="test-pill" title={t("Payments are in test mode: nothing is charged.")}>{t("Test mode")}</span>{/if}
        <button type="button" class="link" onclick={() => (keyOpen = !keyOpen)}>{t("Have a key?")}</button>
        <button type="button" class="close" aria-label={t("Close")} onclick={close} disabled={session.checkout?.status === "waiting"}><Icon name="close" size={18} /></button>
      </span>
    </header>

    <div class="scroll">
      {#if session.checkout}
        {@const checkout = session.checkout}
        <section class="state" in:fly={{ y: 16, duration: 260, easing: cubicOut }}>
          {#if checkout.status === "waiting"}
            <div class="ring" aria-hidden="true"></div>
            <h1>{t("Finish paying in your browser")}</h1>
            <p class="lede">{t("A secure checkout opened in your browser. This page updates by itself the moment the payment goes through.")}</p>
            <div class="state-actions">
              <button type="button" class="cta" onclick={() => session.reopenCheckout()}><Icon name="globe" size={15} /> {t("Open checkout again")}</button>
              <button type="button" class="ghost" onclick={() => session.dismissCheckout()}>{t("Cancel")}</button>
            </div>
          {:else if checkout.status === "paid"}
            <div class="burst" aria-hidden="true">{#each Array(14) as _, index (index)}<i style:--a="{index * 25.7}deg" style:--d="{(index % 5) * 40}ms"></i>{/each}</div>
            <div class="tick" in:scale={{ duration: 520, easing: backOut, start: 0.3 }}><Icon name="check" size={40} /></div>
            <h1>{t("Welcome to {plan}", { plan: t(PLANS.find((entry) => entry.id === checkout.plan)!.name) })}</h1>
            <p class="lede">{t("Everything in your plan is ready on this computer. A receipt and your key are on their way to your email.")}</p>
            {#if checkout.key}
              <div class="key-box">
                <code>{checkout.key}</code>
                <button type="button" class="ghost small" onclick={copyKey}><Icon name={copied ? "check" : "copy"} size={13} /> {copied ? t("Copied") : t("Copy key")}</button>
              </div>
              <p class="fine">{t("Keep the key to add this plan on another computer.")}</p>
            {/if}
            <button type="button" class="cta big" onclick={close}>{t("Start using it")} <Icon name="chevron-right" size={16} /></button>
          {:else}
            <div class="tick muted" aria-hidden="true"><Icon name="close" size={34} /></div>
            <h1>{checkout.status === "cancelled" ? t("Checkout cancelled") : t("Checkout did not finish")}</h1>
            <p class="lede">{checkout.message ?? t("Nothing was charged. Choose a plan to try again.")}</p>
            <button type="button" class="cta" onclick={() => session.dismissCheckout()}>{t("Back to plans")}</button>
          {/if}
        </section>
      {:else}
        <section class="hero" in:fly={{ y: 14, duration: 280, easing: cubicOut }}>
          {#if feature}<span class="eyebrow"><Icon name="sparkles" size={13} /> {t("Unlock with {plan}", { plan: t(wanted?.name ?? "Premium") })}</span>{/if}
          <h1>{headline}</h1>
          <p class="lede">{subline}</p>
          <ul class="trust">
            {#if canTrial}<li><Icon name="check" size={13} /> {t("{days}-day free trial", { days: TRIAL_DAYS })}</li>{/if}
            <li><Icon name="check" size={13} /> {t("Cancel any time")}</li>
            <li><Icon name="check" size={13} /> {t("Works offline on Sunday")}</li>
          </ul>
        </section>

        {#if keyOpen}
          <form class="key-form" onsubmit={addKey} transition:fly={{ y: -8, duration: 200 }}>
            <Icon name="key" size={16} />
            <input aria-label={t("License key")} placeholder="CS1-…" bind:value={keyText} />
            <button type="submit" class="cta small" disabled={keyBusy || !keyText.trim()}>{keyBusy ? t("Checking…") : t("Add key")}</button>
            {#if keyError}<p class="error" role="alert">{keyError}</p>{/if}
          </form>
        {/if}

        <div class="billing" role="radiogroup" aria-label={t("Billing")}>
          <button type="button" role="radio" aria-checked={interval === "monthly"} onclick={() => (interval = "monthly")}>{t("Monthly")}</button>
          <button type="button" role="radio" aria-checked={interval === "yearly"} onclick={() => (interval = "yearly")}>{t("Yearly")} <span class="save">{t("Save {n}%", { n: yearlySaving })}</span></button>
          <span class="thumb" class:right={interval === "yearly"} aria-hidden="true"></span>
        </div>

        <div class="plans">
          {#each PLANS as plan, index (plan.id)}
            {@const isCurrent = current === plan.id}
            {@const highlight = feature && wanted?.id === plan.id}
            <article class="plan" class:popular={plan.popular} class:wanted={highlight} style:--tone={plan.color} in:fly={{ y: 20, duration: 320, delay: 60 * index, easing: cubicOut }}>
              {#if plan.popular}<span class="ribbon">{t("Most popular")}</span>{/if}
              <h2>{t(plan.name)}</h2>
              <p class="tagline">{t(plan.tagline)}</p>
              <div class="price">
                {#if plan.id === "free"}
                  <strong>$0</strong><span>{t("forever")}</span>
                {:else}
                  {#if promoFor(plan.id)}<s>{perMonth(plan.id, false)}</s>{/if}
                  <strong>{perMonth(plan.id)}</strong><span>{t("/ month")}</span>
                {/if}
              </div>
              <p class="billed">
                {#if plan.id === "free"}{t("No card needed")}{:else if interval === "yearly"}{t("{price} billed yearly", { price: money(discounted(cents(plan.id), promoFor(plan.id))) })}{:else}{t("Billed monthly")}{/if}
                · {tn(plan.computers, "{n} computer", "{n} computers")}
              </p>

              {#if isCurrent}
                <button type="button" class="cta outline" disabled>{t("Your plan")}</button>
              {:else if plan.id === "free"}
                <button type="button" class="cta outline" disabled>{t("Included")}</button>
              {:else if plan.id === "premium" && canTrial}
                <button type="button" class="cta" disabled={busy} onclick={trial}>{t("Start {days}-day free trial", { days: TRIAL_DAYS })}</button>
                <button type="button" class="link center" onclick={() => choose("premium")}>{t("or buy now")}</button>
              {:else}
                <button type="button" class="cta" onclick={() => choose(plan.id as "premium" | "church")}>{t("Get {plan}", { plan: t(plan.name) })}</button>
              {/if}

              <ul class="features">
                {#if index > 0}<li class="everything">{t("Everything in {plan}, plus", { plan: t(PLANS[index - 1]!.name) })}</li>{/if}
                {#each adds(plan) as entry (entry)}
                  <li class:hit={entry === feature}><Icon name="check" size={13} />{t(FEATURE_LABELS[entry].label)}{#if FEATURE_LABELS[entry].soon}<em>{t("soon")}</em>{/if}</li>
                {/each}
              </ul>
            </article>
          {/each}
        </div>
        {#if trialNote}<p class="error center-text">{trialNote}</p>{/if}

        <div class="promo">
          {#if promo?.ok}
            <span class="promo-chip"><Icon name="check" size={13} /> <b>{promo.code}</b> · {promo.label}<button type="button" aria-label={t("Remove code")} onclick={clearPromo}><Icon name="close" size={12} /></button></span>
          {:else if promoOpen}
            <form class="promo-form" onsubmit={(event) => { event.preventDefault(); void applyPromo(); }}>
              <input aria-label={t("Promo code")} placeholder={t("Promo code")} bind:value={promoText} />
              <button type="submit" class="cta small" disabled={promoBusy || !promoText.trim()}>{promoBusy ? t("Checking…") : t("Apply")}</button>
            </form>
            {#if promoNote}<p class="error" role="alert">{promoNote}</p>{/if}
          {:else}
            <button type="button" class="link" onclick={() => (promoOpen = true)}>{t("Have a promo code?")}</button>
          {/if}
        </div>

        <button type="button" class="compare-toggle" aria-expanded={compareOpen} onclick={() => (compareOpen = !compareOpen)}><Icon name={compareOpen ? "chevron-up" : "chevron-down"} size={14} /> {t("Compare every feature")}</button>
        {#if compareOpen}
          <div class="compare" transition:fly={{ y: -6, duration: 200 }}>
            <table>
              <thead><tr><th></th>{#each PLANS as plan (plan.id)}<th style:color={plan.color}>{t(plan.name)}</th>{/each}</tr></thead>
              <tbody>
                {#each Object.keys(FEATURE_LABELS) as entry (entry)}
                  <tr class:hit={entry === feature}>
                    <td>{t(FEATURE_LABELS[entry as PlanFeature].label)}{#if FEATURE_LABELS[entry as PlanFeature].soon}<em class="soon-tag">{t("soon")}</em>{/if}</td>
                    {#each PLANS as plan (plan.id)}<td class="mark">{#if plan.features.includes(entry as PlanFeature)}<Icon name="check" size={14} />{:else}<span class="dash">—</span>{/if}</td>{/each}
                  </tr>
                {/each}
                <tr><td>{t("Computers at once")}</td>{#each PLANS as plan (plan.id)}<td class="mark">{plan.computers}</td>{/each}</tr>
              </tbody>
            </table>
          </div>
        {/if}

        <div class="faq">
          {#each FAQ as item (item.q)}
            <details><summary>{t(item.q)}</summary><p>{t(item.a)}</p></details>
          {/each}
        </div>
      {/if}
    </div>

    {#if buying && !session.checkout}
      {@const plan = PLANS.find((entry) => entry.id === buying)!}
      <div class="sheet-scrim" role="presentation" transition:fade={{ duration: 150 }} onclick={() => (buying = null)}></div>
      <form class="sheet" onsubmit={checkoutNow} transition:fly={{ y: 40, duration: 260, easing: cubicOut }}>
        <header>
          <span class="dot" style:background={plan.color}></span>
          <span class="sheet-title"><strong>{t("{plan} plan", { plan: t(plan.name) })}</strong><em>{interval === "yearly" ? t("Billed yearly") : t("Billed monthly")} · {tn(plan.computers, "{n} computer", "{n} computers")}</em></span>
          <span class="due">{#if promoFor(plan.id)}<s>{money(cents(plan.id))}</s>{/if}<strong>{money(discounted(cents(plan.id), promoFor(plan.id)))}</strong><em>{t("today")}</em></span>
        </header>
        <div class="fields">
          <label>{t("Email for the receipt and key")}<input type="email" required bind:value={email} placeholder="office@yourchurch.org" /></label>
          <label>{t("Church or name on the license")}<input bind:value={name} maxlength="40" placeholder={t("Grace Chapel")} /></label>
        </div>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <button type="submit" class="cta big" disabled={busy || !email.trim()}>{busy ? t("Opening checkout…") : t("Continue to secure checkout")} <Icon name="lock" size={14} /></button>
        <p class="fine">{session.billingTest ? t("Test mode: a test checkout opens and nothing is charged.") : t("You finish paying on our payment provider's secure page. Cancel any time.")}</p>
      </form>
    {/if}
  </div>
{/if}

<style>
  .paywall { position: fixed; inset: 0; z-index: 400; display: flex; flex-direction: column; overflow: hidden; background: var(--bg, var(--panel)); color: var(--ink); }
  .glow { position: absolute; width: 60vmax; height: 60vmax; border-radius: 50%; filter: blur(90px); opacity: 0.22; pointer-events: none; animation: drift 18s ease-in-out infinite alternate; }
  .glow.one { top: -30vmax; left: -15vmax; background: #fa4f00; }
  .glow.two { bottom: -35vmax; right: -20vmax; background: #7c5cff; animation-delay: -6s; }
  @keyframes drift { to { transform: translate(6vmax, 4vmax) scale(1.08); } }

  .bar { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; }
  .pw-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; }
  .bar-tools { display: inline-flex; align-items: center; gap: 12px; }
  .test-pill { padding: 3px 10px; border-radius: 999px; background: #ffe7a3; color: #5b4300; font-size: 11px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
  .close { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 50%; background: color-mix(in srgb, var(--panel) 70%, transparent); color: var(--ink); cursor: pointer; }
  .close:disabled { opacity: 0.4; cursor: default; }
  .link { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  .link:hover { color: var(--ink); }
  .link.center { display: block; margin: 6px auto 0; }

  .scroll { position: relative; z-index: 1; flex: 1; overflow: auto; padding: 8px 24px 120px; }
  .hero { max-width: 760px; margin: 2vh auto 26px; text-align: center; }
  .eyebrow { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: 0.02em; }
  h1 { margin: 14px 0 10px; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.05; letter-spacing: -0.035em; font-weight: 850; }
  .lede { margin: 0 auto; max-width: 620px; font-size: 16px; line-height: 1.55; color: var(--muted); }
  .trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 20px; margin: 18px 0 0; padding: 0; list-style: none; font-size: 13px; font-weight: 650; }
  .trust li { display: inline-flex; align-items: center; gap: 6px; }
  .soon-tag { margin-left: 6px; padding: 0 6px; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; font-style: normal; color: var(--muted); }
  .trust :global(svg) { color: #30a46c; }

  .key-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 560px; margin: 0 auto 22px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  .key-form input { flex: 1; min-width: 200px; height: 36px; border: 0; background: none; color: var(--ink); font: inherit; font-family: ui-monospace, monospace; outline: none; }
  .key-form .error { flex-basis: 100%; }

  .billing { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: 300px; margin: 0 auto 26px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); }
  .billing button { position: relative; z-index: 1; height: 36px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 750; cursor: pointer; transition: color 0.2s; }
  .billing button[aria-checked="true"] { color: var(--panel); }
  .save { margin-left: 4px; padding: 1px 6px; border-radius: 6px; background: color-mix(in srgb, #30a46c 85%, transparent); color: #fff; font-size: 10px; }
  .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 999px; background: var(--ink); transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
  .thumb.right { transform: translateX(100%); }

  .plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; max-width: 1080px; margin: 0 auto; align-items: stretch; }
  .plan { position: relative; display: flex; flex-direction: column; padding: 26px 22px 22px; border: 1px solid var(--line); border-radius: 22px; background: color-mix(in srgb, var(--panel) 88%, transparent); backdrop-filter: blur(12px); transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s; }
  .plan:hover { transform: translateY(-4px); box-shadow: 0 24px 50px rgb(0 0 0 / 0.18); }
  .plan.popular { border-color: color-mix(in srgb, var(--tone) 70%, var(--line)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone) 45%, transparent), 0 26px 60px color-mix(in srgb, var(--tone) 18%, transparent); }
  .plan.wanted { border-color: var(--tone); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 40%, transparent), 0 26px 60px color-mix(in srgb, var(--tone) 22%, transparent); }
  .ribbon { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: var(--tone); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
  h2 { margin: 0; font-size: 20px; letter-spacing: -0.01em; color: var(--tone); }
  .tagline { min-height: 42px; margin: 6px 0 14px; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .price { display: flex; align-items: baseline; gap: 6px; }
  .price strong { font-size: 44px; font-weight: 850; letter-spacing: -0.04em; line-height: 1; }
  .price span { font-size: 14px; color: var(--muted); font-weight: 650; }
  .price s { font-size: 18px; color: var(--muted); }
  .billed { margin: 8px 0 18px; font-size: 12px; color: var(--muted); }
  .cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 44px; padding: 0 18px; border: 0; border-radius: 12px; background: var(--tone, var(--accent)); color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; transition: transform 0.15s, filter 0.15s, box-shadow 0.15s; box-shadow: 0 8px 20px color-mix(in srgb, var(--tone, var(--accent)) 30%, transparent); }
  .cta:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
  .cta:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
  .cta.outline { background: none; color: var(--ink); border: 1px solid var(--line); box-shadow: none; }
  .cta.small { width: auto; height: 36px; font-size: 13px; }
  .cta.big { height: 50px; font-size: 15px; }
  .features { display: grid; gap: 9px; margin: 20px 0 0; padding: 18px 0 0; border-top: 1px solid var(--line); list-style: none; font-size: 13px; }
  .features li { display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; }
  .features li :global(svg) { flex: none; margin-top: 2px; color: var(--tone); }
  .features li.hit { font-weight: 800; color: var(--ink); background: color-mix(in srgb, var(--tone) 12%, transparent); margin: -3px -8px; padding: 3px 8px; border-radius: 8px; }
  .features em { margin-left: 4px; padding: 0 6px; border-radius: 6px; background: color-mix(in srgb, var(--ink) 10%, transparent); font-style: normal; font-size: 10px; font-weight: 700; color: var(--muted); }
  .everything { font-weight: 750; color: var(--muted); font-size: 12px; }

  .promo { display: grid; justify-items: center; gap: 6px; margin: 22px auto 0; }
  .promo-form { display: flex; gap: 6px; }
  .promo-form input { width: 200px; height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); font: inherit; text-transform: uppercase; }
  .promo-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px; border-radius: 999px; background: color-mix(in srgb, #30a46c 16%, transparent); font-size: 13px; }
  .promo-chip :global(svg) { color: #30a46c; }
  .promo-chip button { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); cursor: pointer; }

  .compare-toggle { display: flex; align-items: center; gap: 6px; margin: 26px auto 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; font-weight: 750; cursor: pointer; }
  .compare { max-width: 1080px; margin: 12px auto 0; overflow: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
  .compare table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .compare th, .compare td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
  .compare th { font-size: 13px; }
  .compare .mark { text-align: center; }
  .compare .mark :global(svg) { color: #30a46c; }
  .compare tr.hit td { background: color-mix(in srgb, var(--accent) 9%, transparent); font-weight: 750; }
  .dash { color: var(--muted); }

  .faq { display: grid; gap: 8px; max-width: 760px; margin: 28px auto 0; }
  .faq details { padding: 12px 16px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--panel) 80%, transparent); }
  .faq summary { font-weight: 750; cursor: pointer; }
  .faq p { margin: 8px 0 0; font-size: 13px; line-height: 1.55; color: var(--muted); }

  .sheet-scrim { position: absolute; inset: 0; z-index: 3; background: rgb(0 0 0 / 0.35); }
  .sheet { position: absolute; z-index: 4; left: 50%; bottom: 24px; width: min(520px, calc(100% - 32px)); transform: translateX(-50%); display: grid; gap: 14px; padding: 20px; border: 1px solid var(--line); border-radius: 22px; background: var(--panel); box-shadow: 0 30px 80px rgb(0 0 0 / 0.4); }
  .sheet header { display: flex; align-items: center; gap: 12px; }
  .sheet .dot { width: 12px; height: 12px; border-radius: 50%; }
  .sheet-title { flex: 1; display: grid; }
  .sheet-title em, .due em { font-style: normal; font-size: 12px; color: var(--muted); }
  .due { display: grid; justify-items: end; }
  .due strong { font-size: 22px; font-weight: 850; letter-spacing: -0.02em; }
  .due s { font-size: 12px; color: var(--muted); }
  .fields { display: grid; gap: 10px; }
  .fields label { display: grid; gap: 4px; font-size: 12px; font-weight: 700; color: var(--muted); }
  .fields input { height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--field, var(--bg)); color: var(--ink); font: inherit; font-size: 14px; }
  .fine { margin: 0; font-size: 12px; color: var(--muted); text-align: center; }
  .error { margin: 0; color: var(--danger, #e5484d); font-size: 13px; font-weight: 650; }
  .center-text { text-align: center; margin-top: 12px; }

  .state { display: grid; justify-items: center; gap: 14px; max-width: 560px; margin: 10vh auto 0; text-align: center; }
  .state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .state .cta { width: auto; --tone: var(--accent); }
  .ghost { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
  .ghost.small { height: 32px; font-size: 12px; }
  .ring { width: 64px; height: 64px; border-radius: 50%; border: 5px solid color-mix(in srgb, var(--accent) 20%, transparent); border-top-color: var(--accent); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tick { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 50%; background: #30a46c; color: #fff; box-shadow: 0 18px 40px rgb(48 164 108 / 0.4); }
  .tick.muted { background: color-mix(in srgb, var(--ink) 14%, transparent); color: var(--ink); box-shadow: none; }
  .burst { position: relative; width: 0; height: 0; }
  .burst i { position: absolute; width: 8px; height: 14px; border-radius: 2px; background: var(--accent); transform: rotate(var(--a)) translateY(0); animation: burst 0.9s var(--d) cubic-bezier(0.2, 0.8, 0.3, 1) forwards; opacity: 0; }
  .burst i:nth-child(3n) { background: #7c5cff; } .burst i:nth-child(3n + 1) { background: #30a46c; }
  @keyframes burst { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(-140px); } }
  .key-box { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; max-width: 100%; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 12px; }
  .key-box code { font-size: 12px; word-break: break-all; }

  @media (max-width: 900px) {
    .plans { grid-template-columns: 1fr; max-width: 460px; }
    .tagline { min-height: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow, .ring, .burst i { animation: none; }
    .plan:hover { transform: none; }
  }
</style>
