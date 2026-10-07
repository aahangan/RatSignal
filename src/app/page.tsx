import Link from "next/link";
import { LeadSummary } from "@/components/LeadCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getLeads } from "@/engine/leads";
import { labelsFor } from "@/engine/schema";
import type { Lead } from "@/lib/cities";
import { vermin } from "@/verticals/vermin";

export const revalidate = 3600;

async function stats() {
  const [nyc, chicago] = await Promise.all([
    getLeads(vermin, "nyc", { zips: [], days: 30 }).catch(() => [] as Lead[]),
    getLeads(vermin, "chicago", { zips: [], days: 30 }).catch(() => [] as Lead[]),
  ]);
  const thisWeek = nyc.filter((l) => Date.now() - new Date(l.date).getTime() < 7 * 86400000);
  return { nyc: nyc.length, chicago: chicago.length, closed: nyc.filter((l) => l.closed).length, samples: thisWeek.slice(0, 3) };
}

const steps = [
  { title: "Inspectors cite a restaurant", body: "Rats, mice, roaches or flies get written up. The city publishes the report, usually within a day or two." },
  { title: "You get it at 7am", body: "RatSignal pulls every new pest citation in your zip codes, ranks them by urgency and emails you the list." },
  { title: "You call first", body: "They have to fix it before re-inspection. The first pro who calls with a plan usually gets the contract." },
];

const features = [
  ["Morning lead email", "New pest citations in your service area every day, hottest first."],
  ["Heat score", "Ranks leads by pest type, closures, repeat citations and how recent the inspection was."],
  ["Repeat offenders", "See who's been cited again and again. They need a real contract, not a one-time spray."],
  ["Phone numbers", "Direct numbers from city records in NYC, one-click lookup elsewhere."],
  ["AI call scripts", "A tailored call opener, email and drop-off letter for each lead, written from the actual violation."],
  ["Pipeline + CSV", "Mark leads called, quoted or won. Export to your CRM or spreadsheet anytime."],
];

const faqs = [
  ["Where does the data come from?", "City health departments publish every restaurant inspection as open data. RatSignal reads it daily, filters for pest violations and organizes it into leads."],
  ["Is it legal to contact these businesses?", "Yes. Inspection results are public records, and calling or mailing a business about a service it needs is ordinary B2B sales. Don't send automated texts to their numbers; telemarketing rules (TCPA) restrict that."],
  ["Which cities are covered?", "New York City and Chicago today. More cities with open inspection data are coming. Email us to request yours."],
  ["What's an exclusive zip?", "For $49/month per zip, other RatSignal customers stop seeing leads in that zip code. First come, first served."],
  ["Can I cancel anytime?", "Yes, from your settings page. You're not charged during the 7-day trial if you cancel before it ends."],
];

export default async function Home() {
  const s = await stats();
  return (
    <>
      <div className="night">
        <SiteHeader dark />
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> Live from city health inspection records
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.04] font-extrabold tracking-tight md:text-6xl">
              They just got cited for rats. <span className="text-amber">Call them first.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-zinc-300">
              Every morning, RatSignal sends pest control companies the restaurants in their area that inspectors just cited for rats, mice, roaches and flies. Ranked by urgency, with phone numbers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="btn btn-signal px-6 py-3.5 text-lg">Start 7-day free trial</Link>
              <Link href="/demo" className="btn border border-white/20 px-6 py-3.5 text-lg hover:border-white/40">See today&apos;s leads</Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              <Stat value={s.nyc} label="NYC restaurants cited for pests, last 30 days" />
              <Stat value={s.closed} label="of them closed by the health department" />
              <Stat value={s.chicago} label="Chicago pest citations, last 30 days" />
            </dl>
          </div>

          <div className="rounded-2xl bg-white p-5 text-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Cited this week · NYC</p>
              <span className="text-xs text-muted">Phone numbers unlocked in trial</span>
            </div>
            <div className="divide-y divide-line">
              {s.samples.map((l) => (
                <div key={l.id} className="py-4 first:pt-0 last:pb-0">
                  <LeadSummary lead={l} labels={labelsFor(vermin)} masked />
                </div>
              ))}
              {!s.samples.length && <p className="text-sm text-muted">Loading today&apos;s citations…</p>}
            </div>
          </div>
        </section>
      </div>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="mb-10 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold">How it works</h2>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((st, i) => (
              <li key={st.title} className="rounded-2xl border border-line bg-card p-6">
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-signal/10 font-bold text-signal">{i + 1}</span>
                <h3 className="mb-1 font-semibold">{st.title}</h3>
                <p className="text-muted">{st.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold">One new account pays for the year</h2>
              <p className="mt-4 text-lg text-muted">
                A restaurant with a fresh pest citation needs service now and ongoing service after. If one recurring account is worth $150 to $400 a month to you, closing a single lead covers RatSignal many times over.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {features.map(([title, body]) => (
                <div key={title}>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-4xl px-5 py-20">
          <h2 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold">Simple pricing</h2>
          <p className="mb-10 text-center text-muted">7-day free trial. Cancel anytime.</p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-signal bg-card p-7">
              <h3 className="font-semibold text-muted">RatSignal Pro</h3>
              <p className="mt-2 mb-5"><span className="font-[family-name:var(--font-display)] text-5xl font-extrabold">$99</span><span className="text-muted">/month</span></p>
              <ul className="mb-7 space-y-2 text-sm">
                {["Every pest citation in your service area", "7am lead email, daily", "Heat scores and repeat-offender history", "AI call scripts, emails and letters", "Pipeline tracking and CSV export"].map((p) => <li key={p}>✓ {p}</li>)}
              </ul>
              <Link href="/signup" className="btn btn-signal w-full py-3">Start free trial</Link>
            </div>
            <div className="rounded-2xl border border-line bg-card p-7">
              <h3 className="font-semibold text-muted">Exclusive zip add-on</h3>
              <p className="mt-2 mb-5"><span className="font-[family-name:var(--font-display)] text-5xl font-extrabold">+$49</span><span className="text-muted">/zip/month</span></p>
              <p className="mb-5 text-sm">Lock a zip code and other RatSignal customers stop seeing its leads. One company per zip, first come, first served.</p>
              <p className="text-sm text-muted">Available once your trial converts. Manage locks from your settings.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 pb-24">
          <h2 className="mb-8 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold">Questions</h2>
          <div className="space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="rounded-xl border border-line bg-card p-5">
                <summary className="cursor-pointer font-semibold">{q}</summary>
                <p className="mt-2 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-white">{value.toLocaleString()}</dd>
      <p className="mt-1 text-xs leading-snug text-zinc-400">{label}</p>
    </div>
  );
}
