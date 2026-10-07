import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";
import { BillingButton, SettingsForm, ZipLocks, type ZipRow } from "@/components/Settings";
import { isTrial, lockOwner, requireAccount } from "@/lib/accounts";
import { getLeads } from "@/lib/cities";

export const metadata: Metadata = { title: "Settings · RatSignal" };

export default async function Settings() {
  const account = await requireAccount();

  // Lead volume per zip over 90 days helps them decide which zips are worth locking.
  const leads = await getLeads({ city: account.city, zips: account.zips, days: 90 });
  const volume = new Map<string, number>();
  for (const l of leads) volume.set(l.zip, (volume.get(l.zip) ?? 0) + 1);
  const candidates = account.zips.length
    ? account.zips
    : [...new Set([...account.lockedZips, ...[...volume].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([z]) => z)])];
  const owners = await Promise.all(candidates.map((z) => lockOwner(account.city, z)));
  const rows: ZipRow[] = candidates.map((zip, i) => ({
    zip,
    leads90: volume.get(zip) ?? 0,
    state: owners[i] === account.id ? "mine" : owners[i] ? "taken" : "open",
  }));

  return (
    <DashboardShell account={account} active="settings">
      <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-extrabold">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-line bg-card p-6">
          <h2 className="mb-4 font-semibold">Company & service area</h2>
          <SettingsForm company={account.company} zips={account.zips.join(", ")} digest={account.digest} email={account.email} />
        </section>
        <section className="rounded-2xl border border-line bg-card p-6">
          <h2 className="font-semibold">Exclusive zips</h2>
          <p className="mb-4 text-sm text-muted">$49/month per zip. While you hold a zip, other RatSignal customers don&apos;t see its leads.</p>
          <ZipLocks rows={rows} trialing={isTrial(account)} />
        </section>
      </div>
      {account.stripeCustomer && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-6">
          <div>
            <h2 className="font-semibold">Billing</h2>
            <p className="text-sm text-muted">Update your card, download invoices or cancel.</p>
          </div>
          <BillingButton />
        </section>
      )}
    </DashboardShell>
  );
}
