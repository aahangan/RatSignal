"use client";

import { useState } from "react";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState("sent");
    else { setError(data.error ?? "Something went wrong"); setState("idle"); }
  }

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">If {email} has a RatSignal account, a login link is on its way. It expires in 15 minutes.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      <button disabled={state === "sending"} className="btn btn-signal w-full py-3">{state === "sending" ? "Sending…" : "Email me a login link"}</button>
      {error && <p className="text-center text-sm text-signal">{error}</p>}
    </form>
  );
}
