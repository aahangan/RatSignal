import Stripe from "stripe";
import type { AccountStatus } from "./accounts";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const PRICE = {
  base: () => process.env.STRIPE_PRICE_BASE,
  zipLock: () => process.env.STRIPE_PRICE_ZIP_LOCK,
};

export const TRIAL_DAYS = 7;

export function toAccountStatus(s: Stripe.Subscription.Status): AccountStatus {
  if (s === "trialing" || s === "active" || s === "past_due") return s as AccountStatus;
  return "canceled";
}

/** Sets the exclusive-zip line item on a subscription to `count` (adding or removing it as needed). */
export async function syncZipLockQuantity(subscriptionId: string, count: number) {
  const stripe = getStripe();
  const price = PRICE.zipLock();
  if (!stripe || !price) throw new Error("Stripe is not configured");
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data.find((i) => i.price.id === price);
  if (item && count === 0) {
    await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
  } else if (item) {
    await stripe.subscriptionItems.update(item.id, { quantity: count, proration_behavior: "create_prorations" });
  } else if (count > 0) {
    await stripe.subscriptionItems.create({ subscription: subscriptionId, price, quantity: count, proration_behavior: "create_prorations" });
  }
}
