import type { Metadata } from "next";
import { QuoteLanding } from "@/components/QuoteLanding";
import { decodeCode, lookupRestaurant } from "@/lib/quotes";

export const metadata: Metadata = { title: "Free pest control quote · RatSignal", robots: { index: false } };

// Personal link printed on postcards: prefills the restaurant from the city's records.
export default async function QuoteForRestaurant({ params }: PageProps<"/q/[code]">) {
  const { code } = await params;
  const camis = decodeCode(code);
  const restaurant = camis ? await lookupRestaurant(camis).catch(() => null) : null;
  return <QuoteLanding code={restaurant ? code : undefined} restaurant={restaurant} />;
}
