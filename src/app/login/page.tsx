import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Log in · RatSignal" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <Logo />
      <h1 className="mt-10 font-[family-name:var(--font-display)] text-3xl font-extrabold">Log in</h1>
      <p className="mt-2 mb-6 text-muted">No password. We&apos;ll email you a link.</p>
      <LoginForm initialError={error === "expired" ? "That link expired or was invalid. Request a new one." : null} />
      <p className="mt-6 text-center text-sm text-muted">New here? <Link href="/signup" className="underline">Start a free trial</Link></p>
    </main>
  );
}
