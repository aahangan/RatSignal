import type Stripe from "stripe";
import { findAccountBySubscription, releaseAllZips, saveAccount } from "@/lib/accounts";
import { accountFromCheckout } from "@/lib/signup";
import { getStripe, toAccountStatus } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return Response.json({ error: "Not configured" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return Response.json({ error: "Bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await accountFromCheckout(event.data.object.id);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const account = await findAccountBySubscription(sub.id);
      if (!account) break;
      account.status = event.type === "customer.subscription.deleted" ? "canceled" : toAccountStatus(sub.status);
      // A lapsed subscription gives its exclusive zips back to the market.
      if (account.status === "canceled") await releaseAllZips(account);
      await saveAccount(account);
      break;
    }
  }
  return Response.json({ received: true });
}
