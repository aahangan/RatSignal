import Link from "next/link";

export function Logo({ href = "/", dark = false }: { href?: string; dark?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight ${dark ? "text-white" : ""}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#e11d48" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="white" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.2" fill="white" />
      </svg>
      <span>Rat<span className="text-signal">Signal</span></span>
    </Link>
  );
}
