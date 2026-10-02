"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsForm(props: { company: string; zips: string; digest: boolean; email: string }) {
  const router = useRouter();
  const [company, setCompany] = useState(props.company);
  const [zips, setZips] = useState(props.zips);
  const [digest, setDigest] = useState(props.digest);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, zips, digest }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setZips(data.zips.join(", "));
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } else setMsg({ ok: false, text: data.error ?? "Couldn't save" });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Company name</span>
        <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Zip codes you service</span>
        <textarea className="field" rows={4} value={zips} onChange={(e) => setZips(e.target.value)} placeholder="Leave blank for the whole city" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} className="h-4 w-4 accent-[var(--signal)]" />
        Email me new leads every morning ({props.email})
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn btn-signal px-5 py-2">{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-signal"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

export type ZipRow = { zip: string; leads90: number; state: "mine" | "taken" | "open" };

export function ZipLocks({ rows: initial, trialing }: { rows: ZipRow[]; trialing: boolean }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(row: ZipRow) {
    const action = row.state === "mine" ? "unlock" : "lock";
    if (action === "lock" && !confirm(`Lock ${row.zip} for $49/month? You can unlock it anytime.`)) return;
    setBusy(row.zip);
    setError(null);
    const res = await fetch("/api/locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zip: row.zip, action }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Couldn't update");
      if (res.status === 409) setRows((rs) => rs.map((r) => (r.zip === row.zip ? { ...r, state: "taken" } : r)));
      return;
    }
    setRows((rs) => rs.map((r) => (r.zip === row.zip ? { ...r, state: action === "lock" ? "mine" : "open" } : r)));
  }

  if (!rows.length) return <p className="text-sm text-muted">Add zip codes to your service area to see what&apos;s available.</p>;
  return (
    <>
      {trialing && <p className="mb-3 rounded-lg bg-amber/15 p-3 text-sm text-amber-900">Exclusive zips unlock when your trial converts to a paid plan.</p>}
      {error && <p className="mb-3 text-sm text-signal">{error}</p>}
      <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background text-left text-xs text-muted uppercase">
            <tr><th className="px-3 py-2">Zip</th><th className="px-3 py-2">Leads (90d)</th><th className="px-3 py-2 text-right">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.zip}>
                <td className="px-3 py-2 font-medium">{r.zip}</td>
                <td className="px-3 py-2">{r.leads90}</td>
                <td className="px-3 py-2 text-right">
                  {r.state === "taken" ? (
                    <span className="text-muted">Taken</span>
                  ) : (
                    <button disabled={busy === r.zip || (trialing && r.state === "open")} onClick={() => toggle(r)}
                      className={`btn px-3 py-1 text-xs ${r.state === "mine" ? "btn-ghost" : "btn-signal"}`}>
                      {busy === r.zip ? "…" : r.state === "mine" ? "Yours · Unlock" : "Lock"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function BillingButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className="btn btn-ghost px-4 py-2"
      onClick={async () => {
        setBusy(true);
        const data = await fetch("/api/portal", { method: "POST" }).then((r) => r.json()).catch(() => ({}));
        if (data.url) window.location.href = data.url;
        else setBusy(false);
      }}>
      {busy ? "Opening…" : "Manage billing"}
    </button>
  );
}
