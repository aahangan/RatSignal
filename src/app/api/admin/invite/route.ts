import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { currentAccount, isAdmin } from "@/lib/accounts";
import { CITY_IDS, normalizeZips, type CityId } from "@/lib/cities";
import { invite } from "@/lib/invite";
import { siteUrl } from "@/lib/leads";

const Body = z.object({
  email: z.email().max(254),
  name: z.string().trim().max(80).optional(),
  company: z.string().trim().min(1).max(100),
  city: z.enum(CITY_IDS as [string, ...string[]]),
  zips: z.string().max(2000),
  days: z.number().int().min(1).max(90),
  send: z.boolean(),
});

function hasAdminSecret(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: Request) {
  const me = await currentAccount();
  if (!isAdmin(me) && !hasAdminSecret(req)) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the form fields." }, { status: 400 });
  const { zips, invalid } = normalizeZips(parsed.data.city as CityId, parsed.data.zips);
  if (invalid.length) return Response.json({ error: `Not valid zip codes for that city: ${invalid.join(", ")}` }, { status: 400 });

  try {
    const { account, email } = await invite(
      { ...parsed.data, email: parsed.data.email.toLowerCase(), city: parsed.data.city as CityId, zips },
      siteUrl(req),
      { send: parsed.data.send, replyTo: process.env.ADMIN_REPLY_TO ?? me?.email },
    );
    return Response.json({ sent: parsed.data.send, accountId: account?.id ?? null, subject: email.subject, html: email.html, text: email.text });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Invite failed" }, { status: 400 });
  }
}
