import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { LeadBoard } from "@/components/LeadBoard";
import { labelsFor } from "@/engine/schema";
import { accountVertical, getLeadStates, isLive, requireAccount } from "@/lib/accounts";
import { leadsForAccount } from "@/lib/leads";

export const metadata: Metadata = { title: "Leads · RatSignal" };

const RANGES = [7, 30, 90];

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const account = await requireAccount();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30;
  const includeConditions = params.conditions === "1";
  const vertical = accountVertical(account);
  const labels = labelsFor(vertical);
  const optionalLabel = labels.optionalCategories.map((c) => labels.categories[c]).join(", ");

  if (!isLive(account)) {
    return <DashboardShell account={account} active="leads"><p className="text-muted">Your subscription isn&apos;t active.</p></DashboardShell>;
  }

  const [leads, states] = await Promise.all([leadsForAccount(account, { days, includeOptional: includeConditions }), getLeadStates(account.id)]);
  const link = (d: number, c: boolean) => `/dashboard?days=${d}${c ? "&conditions=1" : ""}`;

  return (
    <DashboardShell account={account} active="leads">
      {params.welcome && (
        <div className="mb-6 rounded-xl border border-line bg-card p-4 text-sm">
          <b>You&apos;re in.</b> These are the {labels.noun.plural} in your area. Starting tomorrow, new ones arrive by email at 7am ET. Tip: start with the red heat scores.
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold">Leads</h1>
          <p className="text-sm text-muted">
            {account.zips.length ? `${account.zips.length} zip codes` : "Whole city"} · last {days} days · {leads.length} establishments
            {account.lockedZips.length > 0 && ` · ${account.lockedZips.length} exclusive`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex rounded-lg border border-line bg-card p-1">
            {RANGES.map((d) => (
              <Link key={d} href={link(d, includeConditions)} className={`rounded-md px-3 py-1 ${d === days ? "bg-foreground text-white" : "text-muted"}`}>{d}d</Link>
            ))}
          </div>
          {optionalLabel && (
            <Link href={link(days, !includeConditions)} className={`rounded-lg border px-3 py-1.5 ${includeConditions ? "border-signal text-signal" : "border-line bg-card text-muted"}`}
              title={`Also include: ${optionalLabel}`}>
              {includeConditions ? "✓ " : ""}{optionalLabel}
            </Link>
          )}
          <a href={`/api/leads/export?days=${days}`} className="btn btn-ghost px-3 py-1.5">Export CSV</a>
        </div>
      </div>
      <LeadBoard leads={leads} initialStates={states} labels={labels} />
    </DashboardShell>
  );
}
