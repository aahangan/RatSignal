import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
      <Logo dark={dark} />
      <nav className={`flex items-center gap-4 text-sm sm:gap-6 ${dark ? "text-zinc-300" : "text-muted"}`}>
        <Link href="/demo" className="hidden hover:text-current sm:inline">Live demo</Link>
        <Link href="/#pricing" className="hidden hover:text-current sm:inline">Pricing</Link>
        <Link href="/login" className="hover:text-current">Log in</Link>
        <Link href="/signup" className="btn btn-signal px-4 py-2 text-white">Start free trial</Link>
      </nav>
    </header>
  );
}
