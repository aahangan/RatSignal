import { CITY_IDS, getLeads, normalizeZips, type CityId } from "@/lib/cities";

// Lets visitors see how many leads their service area produced recently, before paying.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const city = params.get("city") as CityId;
  if (!CITY_IDS.includes(city)) return Response.json({ error: "Unknown city" }, { status: 400 });
  const { zips, invalid } = normalizeZips(city, params.get("zips") ?? "");
  const leads = await getLeads({ city, zips, days: 30 });
  return Response.json({
    zips,
    invalid,
    count: leads.length,
    hot: leads.filter((l) => l.heat >= 60).length,
    closed: leads.filter((l) => l.closed).length,
  });
}
