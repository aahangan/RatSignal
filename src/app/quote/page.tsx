import type { Metadata } from "next";
import { QuoteLanding } from "@/components/QuoteLanding";

export const metadata: Metadata = {
  title: "Cited for pests? Free quote before your re-inspection · RatSignal",
  description: "NYC restaurants cited for rats, mice, roaches or flies: get a free quote from a licensed exterminator who handles Health Department re-inspections.",
};

export default function Quote() {
  return <QuoteLanding restaurant={null} />;
}
