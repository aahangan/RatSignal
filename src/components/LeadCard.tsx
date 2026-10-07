import type { VerticalLabels } from "@/engine/schema";
import { CITIES, formatPhone, maskPhone, type Lead } from "@/lib/cities";

export function heatColor(heat: number) {
  return heat >= 75 ? "bg-signal text-white" : heat >= 55 ? "bg-amber text-night" : "bg-zinc-200 text-zinc-700";
}

export function daysAgoLabel(date: string) {
  const d = Math.round((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/** Read-only lead summary shared by the demo, landing page and dashboard. */
export function LeadSummary({ lead, labels, masked = false }: { lead: Lead; labels: VerticalLabels; masked?: boolean }) {
  const phone = masked ? maskPhone(lead.phone) : formatPhone(lead.phone);
  const query = encodeURIComponent(`${lead.name} ${lead.address} ${CITIES[lead.city].name}`);
  return (
    <div className="flex gap-4">
      <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-bold ${heatColor(lead.heat)}`} title="Heat score: how urgently they likely need service">
        <span className="text-lg leading-none">{lead.heat}</span>
        <span className="text-[9px] tracking-wider uppercase opacity-80">heat</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-semibold">{lead.name}</h3>
          {lead.closed && <span className="rounded bg-signal px-1.5 py-0.5 text-[10px] font-bold text-white">CLOSED BY DOH</span>}
          {lead.flags.map((f) => (
            <span key={f} className="rounded bg-amber/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{labels.flags[f] ?? f}</span>
          ))}
        </div>
        <p className="truncate text-sm text-muted">
          {lead.address} {lead.zip}
          {lead.category ? ` · ${lead.category}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lead.categories.map((c) => (
            <span key={c} className="rounded-full border border-line bg-background px-2 py-0.5 text-xs">{labels.categories[c] ?? c}</span>
          ))}
          {lead.priorCitations > 0 && (
            <span className="rounded-full bg-signal/10 px-2 py-0.5 text-xs font-medium text-signal">
              Repeat: {lead.priorCitations} prior in 12 mo
            </span>
          )}
        </div>
        <p className="mt-2 text-sm">
          <span className="text-muted">Cited {daysAgoLabel(lead.date)} · </span>
          {phone ? (
            masked ? <span className="font-medium">{phone}</span> : <a href={`tel:${lead.phone}`} className="font-medium underline">{phone}</a>
          ) : (
            <a href={`https://www.google.com/search?q=${query}`} target="_blank" rel="noreferrer" className="underline">Find phone</a>
          )}
          {!masked && (
            <>
              {" · "}
              <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer" className="underline">Map</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
