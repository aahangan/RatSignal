"use client";

import { useState } from "react";

const PESTS = ["rats", "mice", "roaches", "flies", "other"] as const;

export function QuoteForm({ code, restaurant, address, pests: initialPests }: { code?: string; restaurant?: string; address?: string; pests?: string[] }) {
  const [form, setForm] = useState({
    restaurant: restaurant ?? "", address: address ?? "", contactName: "", phone: "", email: "", timing: "unknown", website: "",
  });
  const [pests, setPests] = useState<string[]>(initialPests?.filter((p) => (PESTS as readonly string[]).includes(p)) ?? []);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, code, pests, consent }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState("sent");
    else { setError(data.error ?? "Something went wrong. Please try again."); setState("idle"); }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <p className="text-lg font-semibold">Got it. You&apos;ll hear back within one business day.</p>
        <p className="mt-2 text-sm text-muted">A licensed pest control company that handles Health Department re-inspections will call you at the number you gave to set up a free, no-obligation visit.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Restaurant<input className="field mt-1" required value={form.restaurant} onChange={set("restaurant")} /></label>
        <label className="text-sm">Address<input className="field mt-1" value={form.address} onChange={set("address")} /></label>
        <label className="text-sm">Your name<input className="field mt-1" required value={form.contactName} onChange={set("contactName")} autoComplete="name" /></label>
        <label className="text-sm">Phone<input className="field mt-1" required type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="(718) 555-0123" /></label>
        <label className="text-sm sm:col-span-2">Email (optional)<input className="field mt-1" type="email" value={form.email} onChange={set("email")} autoComplete="email" /></label>
      </div>
      <fieldset className="text-sm">
        <legend className="mb-1">What was the problem?</legend>
        <div className="flex flex-wrap gap-2">
          {PESTS.map((p) => (
            <label key={p} className={`cursor-pointer rounded-full border px-3 py-1 capitalize ${pests.includes(p) ? "border-signal bg-signal/10 text-signal" : "border-line"}`}>
              <input type="checkbox" className="sr-only" checked={pests.includes(p)} onChange={() => setPests(pests.includes(p) ? pests.filter((x) => x !== p) : [...pests, p])} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">When is your re-inspection?
        <select className="field mt-1" value={form.timing} onChange={set("timing")}>
          <option value="unknown">Not sure</option>
          <option value="this-week">Within a week</option>
          <option value="later">More than a week away</option>
        </select>
      </label>
      <input className="hidden" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>OK to share these details with one licensed NYC pest control company, who will contact me about a free quote.</span>
      </label>
      <button disabled={state === "sending"} className="btn btn-signal w-full py-3">{state === "sending" ? "Sending…" : "Get my free quote"}</button>
      {error && <p className="text-center text-sm text-signal">{error}</p>}
    </form>
  );
}
