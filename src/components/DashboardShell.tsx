import Link from "next/link";
import { type Account, isAdmin, isLive } from "@/lib/accounts";
import { CITIES } from "@/lib/cities";
import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

export function DashboardShell({ account, active, children }: { account: Account; active: "leads" | "settings" | "admin"; children: React.ReactNode }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-md px-3 py-1.5 ${on ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>{label}</Link>
  );
  return (
    <>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-5">
            <Logo href="/dashboard" />
            <nav className="flex gap-1 text-sm">
              {tab("/dashboard", "Leads", active === "leads")}
              {tab("/dashboard/settings", "Settings", active === "settings")}
              {isAdmin(account) && tab("/admin", "Admin", active === "admin")}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{account.company} · {CITIES[account.city].short}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {account.status === "trialing" && <Banner tone="info">You&apos;re on the free trial. Your $99/month plan starts when it ends unless you cancel in Settings.</Banner>}
      {account.status === "pilot" && isLive(account) && (
        <Banner tone="info">Free trial until {new Date(account.pilotEndsAt!).toLocaleDateString("en-US", { month: "long", day: "numeric" })}. No card on file, nothing to cancel.</Banner>
      )}
      {account.status === "pilot" && !isLive(account) && (
        <Banner tone="warn">Your free trial has ended. <Link href="/signup" className="underline">Start your subscription</Link> to keep getting leads.</Banner>
      )}
      {account.status === "dev" && <Banner tone="info">Development account: Stripe isn&apos;t configured, so billing is skipped.</Banner>}
      {account.status === "past_due" && <Banner tone="warn">Your last payment failed. Update your card in Settings to keep receiving leads.</Banner>}
      {account.status === "canceled" && <Banner tone="warn">Your subscription has ended. <Link href="/signup" className="underline">Restart it</Link> to see new leads.</Banner>}
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
    </>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div className={`px-5 py-2.5 text-center text-sm ${tone === "warn" ? "bg-signal text-white" : "bg-amber/15 text-amber-900"}`}>{children}</div>
  );
}
