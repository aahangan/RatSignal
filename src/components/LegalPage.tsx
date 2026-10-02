import { Logo } from "./Logo";
import { SiteFooter } from "./SiteFooter";

export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "RatSignal",
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "support@ratsignal.com",
  updated: "October 1, 2026",
};

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto w-full max-w-3xl px-5 py-5"><Logo /></header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold">{title}</h1>
        <p className="mt-2 mb-8 text-sm text-muted">Last updated {LEGAL.updated}</p>
        <div className="space-y-4 leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-accent">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
