import { timingSafeEqual } from "crypto";
import type { RunReport } from "@/engine/run";
import { currentAccount, isAdmin, isLive, listAccounts } from "@/lib/accounts";
import { db } from "@/lib/db";

function hasAdminSecret(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

// Read-only overview for monitoring: accounts (no emails sent from here) and recent daily runs.
export async function GET(req: Request) {
  if (!hasAdminSecret(req) && !isAdmin(await currentAccount())) return Response.json({ error: "Not found" }, { status: 404 });
  const accounts = await listAccounts();
  const dates = ((await db.get<string[]>("runs")) ?? []).slice(0, 14);
  const runs = (await db.mget<RunReport>(dates.map((d) => `run:${d}`))).filter(Boolean);
  const iso = (t?: number) => (t ? new Date(t).toISOString() : null);
  return Response.json({
    accounts: accounts.map((a) => {
      const sent = Object.entries(a.sent).sort((x, y) => y[1] - x[1]);
      return {
        company: a.company, email: a.email, vertical: a.vertical ?? "vermin", city: a.city, zips: a.zips, status: a.status, live: isLive(a),
        pilotEndsAt: iso(a.pilotEndsAt), createdAt: iso(a.createdAt), lastLoginAt: iso(a.lastLoginAt), lastSeenAt: iso(a.lastSeenAt),
        leadsEmailed: sent.length, lastEmailedAt: iso(sent[0]?.[1]),
      };
    }),
    runs,
  });
}
