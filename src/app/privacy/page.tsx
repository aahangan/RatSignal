import type { Metadata } from "next";
import { LEGAL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · RatSignal" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>{LEGAL.company} (&quot;we&quot;) runs RatSignal, a lead service for pest control companies. This policy explains what we collect and why.</p>

      <h2>Information about our customers</h2>
      <ul>
        <li><b>Account details:</b> your company name, email, city and service-area zip codes.</li>
        <li><b>Your pipeline:</b> the statuses and notes you add to leads. Only your account can see them.</li>
        <li><b>Payment:</b> handled by Stripe. We never see your full card number; we store your Stripe customer and subscription IDs.</li>
        <li><b>Usage data:</b> a login cookie and IP address, used to keep you signed in and to prevent abuse.</li>
      </ul>

      <h2>Information about businesses in our leads</h2>
      <p>Lead data comes from health inspection results that city governments publish as public records (for example, NYC Open Data and the City of Chicago Data Portal). We show it as published and don&apos;t add personal information about individuals. To ask about a record, contact the city agency that published it, or email us.</p>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Stripe (payments)</li>
        <li>Vercel (hosting and scheduled jobs)</li>
        <li>Upstash (database)</li>
        <li>Resend (email)</li>
        <li>Anthropic (AI drafting of outreach text; we send it the public inspection details and your company name)</li>
      </ul>
      <p>We don&apos;t sell personal information.</p>

      <h2>Your choices</h2>
      <p>You can turn off the daily email, cancel your subscription in Settings, and email us to request access to or deletion of your account data.</p>

      <h2>Contact</h2>
      <p><a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a></p>
    </LegalPage>
  );
}
