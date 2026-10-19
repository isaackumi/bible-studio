// Payment providers behind one small interface, so the provider can be chosen later without
// touching the app or the rest of the server. A provider makes a checkout page for an order; the
// server learns about payment either straight from the provider (mock) or from its webhook (Paddle).
//
// To add Stripe, Lemon Squeezy or Polar: write one more Provider (createCheckout + a webhook route
// that calls `completeCheckout` in api.ts) and pick it with BILLING_PROVIDER.

import type { LicensePlan } from "../src/lib/domain/license.ts";
import type { Interval } from "./pricing.ts";

export type Order = {
  session: string;
  plan: LicensePlan;
  interval: Interval;
  email: string;
  name: string;
  /** What the buyer pays today, in cents, after any promo. */
  due: number;
  currency: string;
  promo: string | null;
};

export type Provider = {
  name: "mock" | "paddle";
  /** True when no real money moves (shown to the buyer). */
  test: boolean;
  /** Where to send the buyer to pay. */
  createCheckout(order: Order, origin: string): Promise<{ url: string; reference: string | null }>;
  /** Whether a discount promo can be charged at this provider's checkout (missing: always). */
  supportsPromo?(code: string): boolean;
};

/** The built-in checkout: a page on this server with a test card. Nothing is charged. */
export const mockProvider: Provider = {
  name: "mock",
  test: true,
  createCheckout: async (order, origin) => ({ url: `${origin}/pay/${encodeURIComponent(order.session)}`, reference: null }),
};

type Fetch = typeof fetch;

/**
 * Paddle Billing: a transaction for the right price, opened on Paddle's hosted checkout. The order's
 * session travels in custom_data, so the webhook (paddle.ts) can finish this checkout and the app
 * receives its key without copying it from the email.
 */
export function paddleProvider(config: { apiKey: string; sandbox: boolean; prices: Record<string, string>; discounts?: Record<string, string> }, http: Fetch = fetch): Provider {
  const base = config.sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  return {
    name: "paddle",
    test: config.sandbox,
    // A promo is charged only through a matching Paddle discount (PADDLE_DISCOUNTS).
    supportsPromo: (code) => !!config.discounts?.[code],
    async createCheckout(order) {
      const price = config.prices[`${order.plan}:${order.interval}`];
      if (!price) throw new Error(`No Paddle price for ${order.plan} ${order.interval}.`);
      const discount = order.promo ? config.discounts?.[order.promo] : undefined;
      const response = await http(`${base}/transactions`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          items: [{ price_id: price, quantity: 1 }],
          custom_data: { session: order.session },
          ...(discount ? { discount_id: discount } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Paddle checkout failed: ${response.status}`);
      const { data } = (await response.json()) as { data?: { id?: string; checkout?: { url?: string } } };
      if (!data?.checkout?.url) throw new Error("Paddle did not return a checkout link.");
      const url = new URL(data.checkout.url);
      url.searchParams.set("user_email", order.email);
      return { url: url.toString(), reference: data.id ?? null };
    },
  };
}

/** "pri_a:premium:monthly,pri_b:premium:yearly" (or the older "pri_a:premium") → "premium:monthly" → price id. */
export function paddlePriceMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split(",")) {
    const [price, plan, interval] = pair.trim().split(":");
    if (!price || (plan !== "premium" && plan !== "church")) continue;
    if (interval === "monthly" || interval === "yearly") out[`${plan}:${interval}`] = price;
    else {
      out[`${plan}:${/year/.test(price) ? "yearly" : "monthly"}`] ??= price;
    }
  }
  return out;
}
