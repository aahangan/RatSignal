import { z } from "zod";
import { createAccount, findAccountByEmail, signIn } from "@/lib/accounts";
import { CITY_IDS, normalizeZips } from "@/lib/cities";
import { allow, clientIp } from "@/lib/db";
import { siteUrl } from "@/lib/leads";
import { getStripe, PRICE, TRIAL_DAYS } from "@/lib/stripe";
import { DEFAULT_VERTICAL, VERTICAL_IDS, type VerticalId } from "@/verticals";

const Body = z.object({
  company: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  city: z.enum(CITY_IDS),
  zips: z.string().max(2000),
  vertical: z.enum(VERTICAL_IDS as [VerticalId, ...VerticalId[]]).default(DEFAULT_VERTICAL),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please fill in every field." }, { status: 400 });
  if (!(await allow(`checkout:${clientIp(req)}`, 20, 3600))) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const { company, email, city, vertical } = parsed.data;
  const { zips, invalid } = normalizeZips(city, parsed.data.zips);
  if (invalid.length) return Response.json({ error: `These aren't ${city.toUpperCase()} zip codes: ${invalid.join(", ")}` }, { status: 400 });

  const stripe = getStripe();
  const price = PRICE.base();
  if (!stripe || !price) {
    // Local development without Stripe: create the account directly so the app can be used.
    if (process.env.NODE_ENV === "production") return Response.json({ error: "Payments aren't configured yet." }, { status: 503 });
    const account = (await findAccountByEmail(email)) ?? (await createAccount({ email, company, city, zips, vertical, status: "dev" }));
    await signIn(account.id);
    return Response.json({ url: "/dashboard?welcome=1" });
  }

  const origin = siteUrl(req);
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    metadata: { company, city, vertical, zips: zips.join(",") },
    success_url: `${origin}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/signup`,
  });
  return Response.json({ url: checkout.url });
}
