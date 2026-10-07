import { z } from "zod";
import { claimZip, currentAccount, isLive, isTrial, lockOwner, releaseZip, saveAccount } from "@/lib/accounts";
import { CITIES } from "@/lib/cities";
import { getStripe, syncZipLockQuantity } from "@/lib/stripe";

const Body = z.object({ zip: z.string().regex(/^\d{5}$/), action: z.enum(["lock", "unlock"]) });

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account || !isLive(account)) return Response.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { zip, action } = parsed.data;

  if (!CITIES[account.city].zip.test(zip) || (account.zips.length && !account.zips.includes(zip))) {
    return Response.json({ error: "That zip isn't in your service area." }, { status: 400 });
  }
  const billed = !!getStripe() && !!account.stripeSubscription;

  if (action === "lock") {
    if (account.lockedZips.includes(zip)) return Response.json({ ok: true, lockedZips: account.lockedZips });
    // Trials can't lock: otherwise a competitor could lock a whole borough for free for a week.
    if (isTrial(account)) {
      return Response.json({ error: "Exclusive zips start once your trial ends. Contact us to start your paid plan early." }, { status: 402 });
    }
    if (!(await claimZip(account, zip))) {
      return Response.json({ error: "Another company already holds this zip." }, { status: 409 });
    }
    account.lockedZips = [...account.lockedZips, zip].sort();
  } else {
    if ((await lockOwner(account, zip)) === account.id) await releaseZip(account, zip);
    account.lockedZips = account.lockedZips.filter((z) => z !== zip);
  }

  try {
    if (billed) await syncZipLockQuantity(account.stripeSubscription!, account.lockedZips.length);
  } catch (err) {
    // Billing failed: undo the lock so nobody holds a zip they aren't paying for.
    if (action === "lock") {
      await releaseZip(account, zip);
      account.lockedZips = account.lockedZips.filter((z) => z !== zip);
    }
    console.error("zip lock billing failed", err);
    return Response.json({ error: "Couldn't update billing. Try again." }, { status: 502 });
  }
  await saveAccount(account);
  return Response.json({ ok: true, lockedZips: account.lockedZips });
}
