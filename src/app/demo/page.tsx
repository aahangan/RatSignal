import type { Metadata } from "next";
import Link from "next/link";
import { LeadSummary } from "@/components/LeadCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getLeads } from "@/engine/leads";
import { labelsFor } from "@/engine/schema";
import { CITIES, CITY_IDS, type CityId } from "@/lib/cities";
import { getVertical, isVerticalId, VERTICAL_IDS, VERTICALS } from "@/verticals";

export const metadata: Metadata = { title: "Live demo · RatSignal" };

export default async function Demo({ searchParams }: PageProps<"/demo">) {
  const { city: rawCity, vertical: rawVertical } = await searchParams;
  const city: CityId = CITY_IDS.includes(rawCity as CityId) ? (rawCity as CityId) : "nyc";
  const vertical = getVertical(isVerticalId(rawVertical) ? rawVertical : undefined);
  const labels = labelsFor(vertical);
  const leads = await getLeads(vertical, city, { zips: [], days: 7 });
  const href = (v: string, c: string) => `/demo?vertical=${v}&city=${c}`;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pb-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold capitalize">{labels.noun.plural} this week</h1>
            <p className="text-muted">{leads.length} establishments in {CITIES[city].name} in the last 7 days, hottest first. Live from city records.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-line bg-card p-1 text-sm">
              {VERTICAL_IDS.map((v) => (
                <Link key={v} href={href(v, city)} className={`rounded-md px-3 py-1.5 ${v === vertical.id ? "bg-foreground text-white" : "text-muted"}`}>
                  {v === "vermin" ? "Pests" : "Grease & drains"}
                </Link>
              ))}
            </div>
            <div className="flex rounded-lg border border-line bg-card p-1 text-sm">
              {CITY_IDS.filter((c) => VERTICALS[vertical.id as keyof typeof VERTICALS].sources[c]).map((c) => (
                <Link key={c} href={href(vertical.id, c)} className={`rounded-md px-3 py-1.5 ${c === city ? "bg-foreground text-white" : "text-muted"}`}>
                  {CITIES[c].short}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-signal/30 bg-signal/5 p-4">
          <p className="text-sm"><b>This is the whole city.</b> In the app you see only your zip codes, with full phone numbers, scripts and tracking.</p>
          <Link href={`/signup?vertical=${vertical.id}`} className="btn btn-signal px-4 py-2 text-sm">Start free trial</Link>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {leads.slice(0, 40).map((l) => (
            <div key={l.id} className="p-5"><LeadSummary lead={l} labels={labels} masked /></div>
          ))}
        </div>
        {leads.length > 40 && <p className="mt-4 text-center text-sm text-muted">+ {leads.length - 40} more this week. <Link href={`/signup?vertical=${vertical.id}`} className="underline">Start your trial</Link> to see them all.</p>}
      </main>
      <SiteFooter />
    </>
  );
}
