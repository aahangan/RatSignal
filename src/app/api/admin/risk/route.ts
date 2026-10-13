import { timingSafeEqual } from "crypto";
import { currentAccount, isAdmin } from "@/lib/accounts";
import { Evaluation, ForecastUpload, forecastMeta, forecastRuns, saveEvaluation, saveForecast, servedForecast } from "@/lib/risk";

export const maxDuration = 60;

function hasAdminSecret(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

// GET: latest forecast metadata and run history, or the lists served on ?date= (for evaluation).
export async function GET(req: Request) {
  if (!hasAdminSecret(req) && !isAdmin(await currentAccount())) return notFound();
  const date = new URL(req.url).searchParams.get("date");
  if (date) {
    const served = await servedForecast(date);
    return served ? Response.json(served) : notFound();
  }
  const [meta, runs] = await Promise.all([forecastMeta(), forecastRuns()]);
  return Response.json({ meta, runs });
}

// POST: upload today's forecast (body: ForecastUpload) or an evaluation (?kind=evaluation). Secret only.
export async function POST(req: Request) {
  if (!hasAdminSecret(req)) return notFound();
  const kind = new URL(req.url).searchParams.get("kind");
  const body = await req.json().catch(() => null);
  if (kind === "evaluation") {
    const parsed = Evaluation.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues.slice(0, 5) }, { status: 400 });
    await saveEvaluation(parsed.data);
    return Response.json({ ok: true });
  }
  const parsed = ForecastUpload.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.slice(0, 5) }, { status: 400 });
  await saveForecast(parsed.data);
  return Response.json({ ok: true, zips: Object.keys(parsed.data.zips).length });
}
