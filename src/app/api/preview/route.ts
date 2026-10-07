import { getLeads, UnsupportedCityError } from "@/engine/leads";
import { CITY_IDS, normalizeZips, type CityId } from "@/lib/cities";
import { allow, clientIp } from "@/lib/db";
import { getVertical, isVerticalId } from "@/verticals";

// Lets visitors see how many leads their service area produced recently, before paying.
export async function GET(req: Request) {
  if (!(await allow(`preview:${clientIp(req)}`, 120, 3600))) return Response.json({ error: "Slow down" }, { status: 429 });
  const params = new URL(req.url).searchParams;
  const city = params.get("city") as CityId;
  if (!CITY_IDS.includes(city)) return Response.json({ error: "Unknown city" }, { status: 400 });
  const raw = params.get("vertical");
  const vertical = getVertical(isVerticalId(raw) ? raw : undefined);
  const { zips, invalid } = normalizeZips(city, params.get("zips") ?? "");
  try {
    const leads = await getLeads(vertical, city, { zips, days: 30 });
    return Response.json({
      zips,
      invalid,
      count: leads.length,
      hot: leads.filter((l) => l.heat >= 60).length,
      closed: leads.filter((l) => l.closed).length,
    });
  } catch (err) {
    if (err instanceof UnsupportedCityError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
