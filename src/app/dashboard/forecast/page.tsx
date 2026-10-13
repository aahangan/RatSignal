import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";
import { accountVertical, isLive, requireAccount } from "@/lib/accounts";
import { CITIES, formatPhone } from "@/lib/cities";
import { type ForecastEntry, forecastForZips, forecastMeta } from "@/lib/risk";

export const metadata: Metadata = { title: "Forecast · RatSignal" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function Forecast() {
  const account = await requireAccount();
  const supported = accountVertical(account).id === "vermin" && account.city === "nyc";

  if (!isLive(account)) {
    return <DashboardShell account={account} active="forecast"><p className="text-muted">Your subscription isn&apos;t active.</p></DashboardShell>;
  }
  if (!supported) {
    return (
      <DashboardShell account={account} active="forecast">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-extrabold">Forecast</h1>
        <p className="text-muted">The forecast covers New York City pest leads for now. It isn&apos;t available for your plan yet.</p>
      </DashboardShell>
    );
  }

  const [meta, entries] = await Promise.all([forecastMeta(), account.zips.length ? forecastForZips(account.zips) : Promise.resolve([])]);
  const tested = meta?.metrics.model;

  return (
    <DashboardShell account={account} active="forecast">
      <div className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold">Forecast</h1>
        <p className="text-sm text-muted">
          Restaurants in your zip codes most likely to be cited for pests in the next {meta?.horizonDays ?? 60} days, before it happens.
          {meta && ` Updated ${new Date(`${meta.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-line bg-card p-4 text-sm">
        <b>How to use this:</b> these restaurants haven&apos;t been cited yet, so you reach them before the inspector does. Offer a
        pre-inspection check or a second opinion ahead of their next inspection. The reasons under each one are what to mention on the call.
        {tested && meta && (
          <span className="mt-2 block text-muted">
            Tested on Apr–Aug 2026 records: of the 100 highest-risk restaurants citywide, {pct(tested.precision_at_100)} were cited within {meta.horizonDays} days,
            versus {pct(meta.cityRate)} of restaurants overall.
          </span>
        )}
      </div>

      {!account.zips.length ? (
        <p className="text-muted">Add zip codes in Settings to see your forecast.</p>
      ) : !entries.length ? (
        <p className="text-muted">No forecast for your zip codes yet. It refreshes every morning.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => <ForecastCard key={e.id} entry={e} cityRate={meta?.cityRate ?? 0} />)}
        </ul>
      )}
    </DashboardShell>
  );
}

function ForecastCard({ entry: e, cityRate }: { entry: ForecastEntry; cityRate: number }) {
  const query = encodeURIComponent(`${e.name} ${e.address} ${CITIES.nyc.name}`);
  const phone = formatPhone(e.phone);
  const tone = e.prob >= 0.25 ? "bg-signal text-white" : e.prob >= 0.12 ? "bg-amber text-night" : "bg-zinc-200 text-zinc-700";
  const times = cityRate > 0 ? e.prob / cityRate : 0;
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex gap-4">
        <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-bold ${tone}`} title="Chance of a pest citation in the forecast window">
          <span className="text-lg leading-none">{pct(e.prob)}</span>
          <span className="text-[9px] tracking-wider uppercase opacity-80">risk</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h3 className="font-semibold">{e.name}</h3>
            {times >= 2 && <span className="rounded bg-signal/10 px-1.5 py-0.5 text-[10px] font-bold text-signal">{Math.round(times)}× CITY AVERAGE</span>}
          </div>
          <p className="truncate text-sm text-muted">{e.address} {e.zip}{e.cuisine ? ` · ${e.cuisine}` : ""}</p>
          {e.reasons.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {e.reasons.map((r) => <li key={r} className="rounded-full border border-line bg-background px-2 py-0.5 text-xs">{r}</li>)}
            </ul>
          )}
          <p className="mt-2 text-sm">
            {phone ? <a href={`tel:${e.phone}`} className="font-medium underline">{phone}</a>
              : <a href={`https://www.google.com/search?q=${query}`} target="_blank" rel="noreferrer" className="underline">Find phone</a>}
            {" · "}
            <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer" className="underline">Map</a>
          </p>
        </div>
      </div>
    </li>
  );
}
