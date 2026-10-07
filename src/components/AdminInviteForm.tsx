"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { sent: boolean; subject: string; html: string };

export function AdminInviteForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", name: "", company: "", city: "nyc", zips: "", days: 14 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: k === "days" ? Number(e.target.value) : e.target.value });
    setResult(null);
  };

  async function submit(send: boolean) {
    if (send && !confirm(`Create a free account for ${form.email} and email them the invite now?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, send }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Failed");
    setResult(data);
    if (send) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="field" placeholder="First name (optional)" value={form.name} onChange={set("name")} />
        <input className="field" placeholder="Company" value={form.company} onChange={set("company")} />
      </div>
      <input className="field" type="email" placeholder="Email" value={form.email} onChange={set("email")} />
      <div className="grid grid-cols-[auto_1fr_auto] gap-3">
        <select className="field w-auto" value={form.city} onChange={set("city")}>
          <option value="nyc">NYC</option>
          <option value="chicago">Chicago</option>
        </select>
        <input className="field" placeholder="Zips, e.g. 11222 (blank = whole city)" value={form.zips} onChange={set("zips")} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input className="field w-20" type="number" min={1} max={90} value={form.days} onChange={set("days")} /> days
        </label>
      </div>
      <div className="flex gap-2">
        <button disabled={busy || !form.email || !form.company} onClick={() => submit(false)} className="btn btn-ghost px-4 py-2">Preview email</button>
        <button disabled={busy || !result || result.sent} onClick={() => submit(true)} className="btn btn-signal px-4 py-2">Create account & send</button>
      </div>
      {error && <p className="text-sm text-signal">{error}</p>}
      {result && (
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2 text-sm">
            {result.sent ? <b className="text-emerald-700">Sent ✓ </b> : <b>Preview · </b>}
            <span className="text-muted">Subject:</span> {result.subject}
          </p>
          <iframe title="Invite preview" srcDoc={result.html} className="h-[460px] w-full rounded-b-xl bg-white" />
        </div>
      )}
    </div>
  );
}
