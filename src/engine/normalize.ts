// Pure functions that turn raw open-data rows into scored leads. No I/O, so they're unit tested.
import type { CityId, Lead, Source, Vertical } from "./schema";
import type { Row } from "./sources/socrata";

const DAY_MS = 24 * 60 * 60 * 1000;

export type HistoryPair = { id: string; date: string };
export type NormalizeOptions = { includeOptional?: boolean; now?: number };

const first = (r: Row, cols: string[]) => cols.map((c) => r[c]?.trim()).find((v) => v);

export function phoneDigits(p?: string) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : undefined;
}

export function establishmentId(r: Row, src: Source): string | undefined {
  const f = src.fields;
  const id = f.id.map((c) => r[c]?.trim()).find((v) => v && !f.invalidIds.includes(v));
  if (id) return id;
  return f.idFallback && r[f.idFallback] ? `i${r[f.idFallback]}` : undefined;
}

function isClosed(r: Row, src: Source) {
  const c = src.fields.closed;
  if (!c) return false;
  const v = (r[c.field] ?? "").toLowerCase();
  return c.containsAny.some((s) => v.includes(s.toLowerCase()));
}

function isFailed(r: Row, src: Source) {
  const f = src.fields.failed;
  if (!f) return false;
  return "gte" in f ? Number(r[f.field] ?? 0) >= f.gte : r[f.field] === f.equals;
}

/** Counts distinct earlier citation dates per establishment within 12 months of its latest one. */
export function priorCounts(pairs: HistoryPair[], latest: Map<string, string>) {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const { id, date } of pairs) {
    const last = latest.get(id);
    const d = date.slice(0, 10);
    if (!last || d >= last || seen.has(`${id}|${d}`)) continue;
    if (new Date(last).getTime() - new Date(d).getTime() > 365 * DAY_MS) continue;
    seen.add(`${id}|${d}`);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function scoreLead(l: Omit<Lead, "heat">, v: Vertical, now = Date.now()): number {
  const weights = l.categories.map((c) => v.categories[c]?.weight ?? 0).sort((a, b) => b - a);
  let heat = (weights[0] ?? 0) + 5 * Math.max(0, weights.length - 1);
  if (l.closed) heat += 25;
  if (l.failed) heat += 10;
  for (const f of l.flags) heat += v.flags[f]?.weight ?? 0;
  heat += Math.min(l.priorCitations * 8, 24);
  const age = (now - new Date(l.date).getTime()) / DAY_MS;
  heat += age <= 3 ? 15 : age <= 7 ? 8 : age <= 30 ? 3 : 0;
  return Math.min(100, Math.round(heat));
}

function baseFields(r: Row, src: Source, city: CityId, vertical: string, id: string) {
  const f = src.fields;
  return {
    id: `${city}:${id}`,
    vertical,
    city,
    name: (first(r, f.name) || "Unnamed establishment").replace(/\s+/g, " "),
    address: f.address.map((c) => r[c]).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
    zip: r[f.zip] ?? "",
    phone: f.phone ? phoneDigits(r[f.phone]) : undefined,
    category: f.category ? r[f.category] : undefined,
    lat: f.lat && r[f.lat] ? Number(r[f.lat]) : undefined,
    lng: f.lng && r[f.lng] ? Number(r[f.lng]) : undefined,
    date: (r[f.date] ?? "").slice(0, 10),
    inspectionType: f.inspectionType ? r[f.inspectionType] : undefined,
  };
}

function finish(leads: Omit<Lead, "heat">[], v: Vertical, now: number): Lead[] {
  return leads
    .map((l) => ({ ...l, heat: scoreLead(l, v, now) }))
    .sort((a, b) => b.heat - a.heat || b.date.localeCompare(a.date));
}

/** Codes mode: one row per violation. Rows must be sorted newest first. */
export function normalizeCodes(rows: Row[], history: HistoryPair[], v: Vertical, city: CityId, opts: NormalizeOptions = {}): Lead[] {
  const src = v.sources[city]!;
  if (src.filter.mode !== "codes") throw new Error("normalizeCodes needs a codes-mode source");
  const { field, codes } = src.filter;
  const dateCol = src.fields.date;
  const wanted = (code?: string) => {
    const cat = code ? codes[code] : undefined;
    return cat && (opts.includeOptional || !v.categories[cat]?.optional) ? cat : undefined;
  };

  // Keep only each establishment's most recent qualifying inspection.
  const byId = new Map<string, Row[]>();
  for (const r of rows) {
    if (!wanted(r[field])) continue;
    const id = establishmentId(r, src);
    if (!id) continue;
    const list = byId.get(id);
    if (!list) byId.set(id, [r]);
    else if (r[dateCol] === list[0][dateCol]) list.push(r);
  }
  const latest = new Map([...byId].map(([id, rs]) => [id, (rs[0][dateCol] ?? "").slice(0, 10)]));
  const prior = priorCounts(history, latest);

  return finish(
    [...byId].map(([id, rs]) => {
      const r = rs[0];
      return {
        ...baseFields(r, src, city, v.id, id),
        categories: [...new Set(rs.map((x) => wanted(x[field])).filter((c): c is string => !!c))],
        flags: [],
        notes: src.fields.notes ? rs.map((x) => x[src.fields.notes!] ?? "").filter(Boolean) : [],
        closed: isClosed(r, src),
        failed: isFailed(r, src),
        priorCitations: prior.get(id) ?? 0,
      };
    }),
    v,
    opts.now ?? Date.now(),
  );
}

/** Splits a text-mode violations field into the items this vertical cares about. */
export function relevantItems(text: string, src: Source): string[] {
  if (src.filter.mode !== "text") return [];
  const f = src.filter;
  return text
    .split(f.itemSeparator)
    .map((item) => {
      const [title, comment = ""] = item.split(f.commentSeparator);
      return { title, comment: comment.trim() };
    })
    .filter(({ title, comment }) =>
      f.items.some((m) => (m.includes && title.includes(m.includes)) || (m.commentPattern && new RegExp(m.commentPattern, "i").test(comment))),
    )
    .map(({ comment }) => comment)
    .filter(Boolean);
}

export function categorize(comments: string, src: Source): string[] {
  if (src.filter.mode !== "text") return [];
  const found: string[] = [];
  for (const rule of src.filter.rules) {
    if (rule.unlessAny.some((c) => found.includes(c))) continue;
    if (new RegExp(rule.pattern, "i").test(comments) && !found.includes(rule.category)) found.push(rule.category);
  }
  return found.length ? found : [src.filter.fallbackCategory];
}

/** Text mode: one row per inspection. Rows must be sorted newest first. */
export function normalizeText(rows: Row[], history: HistoryPair[], v: Vertical, city: CityId, opts: NormalizeOptions = {}): Lead[] {
  const src = v.sources[city]!;
  if (src.filter.mode !== "text") throw new Error("normalizeText needs a text-mode source");
  const f = src.filter;

  const byId = new Map<string, { row: Row; items: string[] }>();
  for (const r of rows) {
    const id = establishmentId(r, src);
    if (!id || byId.has(id)) continue;
    const items = relevantItems(r[f.field] ?? "", src);
    if (items.length) byId.set(id, { row: r, items });
  }
  const latest = new Map([...byId].map(([id, x]) => [id, (x.row[src.fields.date] ?? "").slice(0, 10)]));
  const prior = priorCounts(history, latest);

  return finish(
    [...byId].map(([id, { row, items }]) => {
      const comments = items.join(" ");
      return {
        ...baseFields(row, src, city, v.id, id),
        categories: categorize(comments, src),
        flags: f.flags.filter((x) => new RegExp(x.pattern, "i").test(comments)).map((x) => x.flag),
        notes: items.map((c) => (c.length > f.maxNoteLength ? `${c.slice(0, f.maxNoteLength)}…` : c)),
        closed: isClosed(row, src),
        failed: isFailed(row, src),
        priorCitations: prior.get(id) ?? 0,
      };
    }),
    v,
    opts.now ?? Date.now(),
  );
}

/** The key that marks a lead as already delivered, from the vertical's dedupe template. */
export function dedupeKey(lead: Lead, v: Vertical) {
  return v.dedupeKey.replace(/\{(id|date|city|vertical)\}/g, (_m, k: "id" | "date" | "city" | "vertical") => String(lead[k]));
}
