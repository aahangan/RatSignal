import { Logo } from "@/components/Logo";
import { QuoteForm } from "@/components/QuoteForm";
import type { Restaurant } from "@/lib/quotes";

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null);

export function QuoteLanding({ code, restaurant }: { code?: string; restaurant: Restaurant | null }) {
  const cited = restaurant?.citedOn && restaurant.pests.length ? `${restaurant.pests.join(" and ")} on ${fmt(restaurant.citedOn)}` : null;
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Logo />
      <h1 className="mt-10 font-[family-name:var(--font-display)] text-3xl font-extrabold sm:text-4xl">
        {restaurant ? `${restaurant.name}: pass your re-inspection` : "Cited for pests? Pass your re-inspection."}
      </h1>
      <p className="mt-3 text-muted">
        {cited ? `City records show a citation for ${cited}. ` : ""}
        Get a free, no-obligation quote from a licensed NYC exterminator who handles Health Department re-inspections. Takes 20 seconds.
      </p>
      <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
        {["Licensed and insured NYC company", "A call back within one business day", "Paperwork your inspector will want to see"].map((t) => (
          <li key={t} className="rounded-xl border border-line bg-card px-3 py-2">✓ {t}</li>
        ))}
      </ul>
      <div className="mt-6">
        <QuoteForm code={code} restaurant={restaurant?.name} address={restaurant ? `${restaurant.address}${restaurant.zip ? `, ${restaurant.zip}` : ""}` : undefined} pests={restaurant?.pests} />
      </div>
      <p className="mt-6 text-xs text-muted">
        RatSignal is an independent service and is not affiliated with the NYC Department of Health. Inspection details come from the city&apos;s public records.
        We share your details only with the one pest control company that will contact you.
      </p>
    </main>
  );
}
