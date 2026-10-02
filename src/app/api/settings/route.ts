import { z } from "zod";
import { currentAccount, saveAccount } from "@/lib/accounts";
import { normalizeZips } from "@/lib/cities";

const Body = z.object({
  company: z.string().trim().min(1).max(100),
  zips: z.string().max(2000),
  digest: z.boolean(),
});

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { zips, invalid } = normalizeZips(account.city, parsed.data.zips);
  if (invalid.length) return Response.json({ error: `Not valid zip codes for your city: ${invalid.join(", ")}` }, { status: 400 });

  // Exclusive zips must stay inside the service area. Dropping one from the area keeps it locked
  // (and billed) until the user unlocks it explicitly, so nothing changes on their invoice silently.
  const outside = zips.length ? account.lockedZips.filter((z) => !zips.includes(z)) : [];
  if (outside.length) {
    return Response.json({ error: `Unlock ${outside.join(", ")} before removing them from your area.` }, { status: 400 });
  }

  account.company = parsed.data.company;
  account.zips = zips;
  account.digest = parsed.data.digest;
  await saveAccount(account);
  return Response.json({ ok: true, zips });
}
