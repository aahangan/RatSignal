import { timingSafeEqual } from "crypto";
import { runKey, type RunReport } from "@/engine/run";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/leads";
import { runFor, todayNY } from "@/lib/runtime";

export const maxDuration = 300;

function authorized(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return [process.env.CRON_SECRET, process.env.ADMIN_SECRET].some(
    (s) => !!s && s.length === given.length && timingSafeEqual(Buffer.from(s), Buffer.from(given)),
  );
}

// Vercel Cron calls this daily (vercel.json). Admins can also call it to backfill a missed day:
//   ?date=YYYY-MM-DD   run for a specific day (default: today in New York)
//   ?dryRun=1          report what would be sent without sending or recording anything
//   ?force=1           run even if that day already completed (still never re-sends a lead)
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? todayNY();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayNY()) return Response.json({ error: "Invalid date" }, { status: 400 });
  const dryRun = params.get("dryRun") === "1";

  if (!dryRun && params.get("force") !== "1") {
    const previous = await db.get<RunReport>(runKey(date));
    if (previous?.status === "completed") return Response.json({ skipped: "already completed", report: previous });
  }
  const report = await runFor(date, siteUrl(req), { dryRun });
  return Response.json({ report }, { status: report.status === "failed" ? 500 : 200 });
}
