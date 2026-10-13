import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminInviteForm } from "@/components/AdminInviteForm";
import { DashboardShell } from "@/components/DashboardShell";
import { isAdmin, isLive, listAccounts, requireAccount } from "@/lib/accounts";
import type { RunReport } from "@/engine/run";
import { CITIES } from "@/lib/cities";
import { db } from "@/lib/db";
import { forecastMeta, forecastRuns } from "@/lib/risk";
import { getVertical } from "@/verticals";

export const metadata: Metadata = { title: "Admin · RatSignal", robots: { index: false } };

const fmt = (t?: number) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–");

export default async function Admin() {
  const me = await requireAccount();
  if (!isAdmin(me)) notFound();
  const accounts = (await listAccounts()).sort((a, b) => b.createdAt - a.createdAt);
  const runDates = ((await db.get<string[]>("runs")) ?? []).slice(0, 10);
  const runs = (await db.mget<RunReport>(runDates.map((d) => `run:${d}`))).filter((r): r is RunReport => !!r);
  const [risk, riskRuns] = await Promise.all([forecastMeta(), forecastRuns()]);
  const evaluated = riskRuns.filter((r) => r.evaluation).slice(0, 10);
  const pct = (x?: number) => (x === undefined ? "–" : `${(x * 100).toFixed(1)}%`);

  return (
    <DashboardShell account={me} active="admin">
      <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-extrabold">Admin</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-line bg-card p-6">
          <h2 className="mb-1 font-semibold">Invite a free trial user</h2>
          <p className="mb-4 text-sm text-muted">Creates an account with no card or Stripe. Preview first, then send.</p>
          <AdminInviteForm />
        </section>
        <section className="rounded-2xl border border-line bg-card p-6">
          <h2 className="mb-4 font-semibold">Accounts ({accounts.length})</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase">
                <tr><th className="py-2 pr-3">Company</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Area</th><th className="py-2 pr-3">Since</th><th className="py-2 pr-3">Last login</th><th className="py-2">Leads emailed</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3"><div className="font-medium">{a.company}</div><div className="text-xs text-muted">{a.email}</div></td>
                    <td className="py-2 pr-3">
                      {a.status === "pilot" ? `free trial → ${fmt(a.pilotEndsAt)}` : a.status}
                      {!isLive(a) && <span className="ml-1 text-signal">(inactive)</span>}
                    </td>
                    <td className="py-2 pr-3">{getVertical(a.vertical).id === "vermin" ? "Pest" : "Grease"} · {CITIES[a.city].short}: {a.zips.length ? a.zips.join(", ") : "all"}</td>
                    <td className="py-2 pr-3">{fmt(a.createdAt)}</td>
                    <td className="py-2 pr-3">{a.lastSeenAt ? fmt(a.lastSeenAt) : <span className="text-muted">never</span>}</td>
                    <td className="py-2">{Object.keys(a.sent).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-1 font-semibold">Daily runs</h2>
        <p className="mb-4 text-sm text-muted">The 7am delivery job. Problems are also emailed to you as alerts.</p>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No runs recorded yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase">
                <tr><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Emails sent</th><th className="py-2 pr-3">Feeds</th><th className="py-2">Errors</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.date}>
                    <td className="py-2 pr-3 font-medium">{r.date}</td>
                    <td className={`py-2 pr-3 ${r.status === "completed" ? "text-emerald-700" : "text-signal"}`}>{r.status}</td>
                    <td className="py-2 pr-3">{r.accounts.sent} of {r.accounts.eligible}{r.accounts.noNewLeads ? ` (${r.accounts.noNewLeads} had nothing new)` : ""}</td>
                    <td className="py-2 pr-3">{Object.entries(r.sources).map(([k, s]) => `${k}: ${s.ok ? `${s.leads} leads` : "FAILED"}`).join(" · ") || "–"}</td>
                    <td className="py-2 text-signal">{r.errors.slice(0, 2).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="mt-6 rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-1 font-semibold">Pest-risk model</h2>
        {!risk ? (
          <p className="text-sm text-muted">No forecast uploaded yet. The scorer runs daily from GitHub Actions (ml/README.md).</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              Model {risk.version} · last forecast {risk.date} · {risk.scored.toLocaleString()} restaurants in {risk.zipCount} zips · mean risk {pct(risk.cityRate)}.
              Offline test precision@100: model {pct(risk.metrics.model?.precision_at_100)}, rule {pct(risk.metrics.rule?.precision_at_100)},
              current heuristic {pct(risk.metrics.heuristic?.precision_at_100)}.
            </p>
            <h3 className="mb-2 text-sm font-semibold">Served forecasts, scored after their {risk.horizonDays}-day window closed</h3>
            {evaluated.length === 0 ? (
              <p className="text-sm text-muted">None yet: the first ones can be scored {risk.horizonDays} days after the first upload.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted uppercase">
                  <tr><th className="py-2 pr-3">Forecast date</th><th className="py-2 pr-3">Precision@100</th><th className="py-2 pr-3">Rule</th><th className="py-2 pr-3">Heuristic</th><th className="py-2 pr-3">Zip precision@5</th><th className="py-2">Base rate</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {evaluated.map(({ date, evaluation: e }) => (
                    <tr key={date}>
                      <td className="py-2 pr-3 font-medium">{date}</td>
                      <td className="py-2 pr-3">{pct(e!.metrics.precision_at_100)}</td>
                      <td className="py-2 pr-3">{pct(e!.metrics.rule_precision_at_100)}</td>
                      <td className="py-2 pr-3">{pct(e!.metrics.heuristic_precision_at_100)}</td>
                      <td className="py-2 pr-3">{pct(e!.metrics.zip_precision_at_5)}</td>
                      <td className="py-2">{pct(e!.metrics.base_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
