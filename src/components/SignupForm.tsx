"use client";

import { useEffect, useState } from "react";

type Preview = { count: number; hot: number; closed: number; zips: string[]; invalid: string[] };

export function SignupForm({ initialError }: { initialError: string | null }) {
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState<"nyc" | "chicago">("nyc");
  const [zips, setZips] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  // Show how many leads their area produced last month, so they see the value before paying.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/preview?city=${city}&zips=${encodeURIComponent(zips)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => d.count !== undefined && setPreview(d))
        .catch(() => {});
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [city, zips]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, email, city, zips }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
    else { setError(data.error ?? "Something went wrong"); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Company name</span>
        <input className="field" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Pest Solutions" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Work email</span>
        <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acmepest.com" />
      </label>
      <div>
        <span className="mb-1.5 block text-sm font-medium">City</span>
        <div className="grid grid-cols-2 gap-2">
          {(["nyc", "chicago"] as const).map((c) => (
            <button type="button" key={c} onClick={() => { setCity(c); setZips(""); }}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${city === c ? "border-signal bg-signal/5 text-signal" : "border-line bg-card"}`}>
              {c === "nyc" ? "New York City" : "Chicago"}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Zip codes you service</span>
        <textarea className="field" rows={3} value={zips} onChange={(e) => setZips(e.target.value)}
          placeholder={city === "nyc" ? "10029, 10035, 11354 … or leave blank for the whole city" : "60614, 60647, 60657 … or leave blank for the whole city"} />
      </label>

      {preview && (
        <div className="rounded-xl border border-line bg-background p-4 text-sm">
          {preview.invalid.length > 0 ? (
            <p className="text-signal">Not valid for this city: {preview.invalid.join(", ")}</p>
          ) : (
            <p>
              Last 30 days in {preview.zips.length ? `your ${preview.zips.length} zip${preview.zips.length === 1 ? "" : "s"}` : "the whole city"}:{" "}
              <b>{preview.count} leads</b>, {preview.hot} hot, {preview.closed} closed by the health department.
            </p>
          )}
        </div>
      )}

      <button disabled={busy} className="btn btn-signal w-full py-3.5 text-lg">{busy ? "Starting…" : "Start 7-day free trial"}</button>
      {error && <p className="text-center text-sm text-signal">{error}</p>}
      <p className="text-center text-xs text-muted">$99/month after the trial. Cancel anytime before it ends and you won&apos;t be charged.</p>
    </form>
  );
}
