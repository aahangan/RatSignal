import { currentAccount } from "@/lib/accounts";
import { siteUrl } from "@/lib/leads";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const account = await currentAccount();
  if (!stripe || !account?.stripeCustomer) return Response.json({ error: "No billing account found" }, { status: 404 });
  const portal = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomer,
    return_url: `${siteUrl(req)}/dashboard/settings`,
  });
  return Response.json({ url: portal.url });
}
