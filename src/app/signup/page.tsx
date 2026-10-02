import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { SignupForm } from "@/components/SignupForm";

export const metadata: Metadata = { title: "Start your free trial · RatSignal" };

export default async function Signup({ searchParams }: PageProps<"/signup">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <Logo />
      <h1 className="mt-10 font-[family-name:var(--font-display)] text-3xl font-extrabold">Start your free trial</h1>
      <p className="mt-2 mb-8 text-muted">Tomorrow at 7am you&apos;ll get your first list of restaurants cited for pests in your area.</p>
      <SignupForm initialError={error === "checkout" ? "Checkout didn't complete. Try again." : null} />
    </main>
  );
}
