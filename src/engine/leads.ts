// Fetches a vertical's source for one city and turns it into leads.
import { normalizeCodes, normalizeText } from "./normalize";
import type { CityId, Lead, Vertical } from "./schema";
import { missingColumns, quoteList, type QueryOptions, type Row, socrataQuery } from "./sources/socrata";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export type LeadQuery = {
  /** Empty = whole city */
  zips: string[];
  days: number;
  includeOptional?: boolean;
  /** End of the window (default now). Used by backfills. */
  asOf?: Date;
} & Pick<QueryOptions, "fresh" | "revalidate">;

export type LeadResult = { leads: Lead[]; rowCount: number; missingColumns: string[] };

export class UnsupportedCityError extends Error {}

export function sourceFor(v: Vertical, city: CityId) {
  const src = v.sources[city];
  if (!src) throw new UnsupportedCityError(`${v.name} isn't available in ${city}`);
  return src;
}

/** SoQL WHERE clause selecting this vertical's qualifying rows. */
export function whereClause(v: Vertical, city: CityId, q: { zips: string[]; from: string; to?: string; includeOptional?: boolean }) {
  const src = sourceFor(v, city);
  const f = src.filter;
  const parts: string[] = [];
  if (f.mode === "codes") {
    const codes = Object.entries(f.codes)
      .filter(([, cat]) => q.includeOptional || !v.categories[cat]?.optional)
      .map(([code]) => code);
    parts.push(`${f.field} in (${quoteList(codes)})`);
  } else {
    parts.push(`(${f.where.map((p) => `${f.field} like ${quoteList([p])}`).join(" OR ")})`);
  }
  parts.push(`${src.fields.date} > '${q.from}'`);
  if (q.to) parts.push(`${src.fields.date} <= '${q.to}T23:59:59'`);
  if (q.zips.length) parts.push(`${src.fields.zip} in (${quoteList(q.zips)})`);
  return parts.join(" AND ");
}

export async function fetchLeads(v: Vertical, city: CityId, q: LeadQuery): Promise<LeadResult> {
  const src = sourceFor(v, city);
  const asOf = q.asOf ?? new Date();
  const to = q.asOf ? isoDate(asOf) : undefined;
  const from = isoDate(new Date(asOf.getTime() - q.days * DAY_MS));
  const historyFrom = isoDate(new Date(asOf.getTime() - (q.days + 365) * DAY_MS));
  const idCol = src.fields.id[0];
  const opts = { fresh: q.fresh, revalidate: q.revalidate };

  const [rows, history] = await Promise.all([
    socrataQuery(src.domain, src.dataset, {
      $where: whereClause(v, city, { zips: q.zips, from, to, includeOptional: q.includeOptional }),
      $order: `${src.fields.date} DESC`,
      $limit: String(src.rowLimit),
    }, opts),
    socrataQuery(src.domain, src.dataset, {
      $select: `${idCol},${src.fields.date}`,
      $group: `${idCol},${src.fields.date}`,
      $where: whereClause(v, city, { zips: q.zips, from: historyFrom, to, includeOptional: q.includeOptional }),
      $limit: "50000",
    }, opts),
  ]);

  const pairs = history.map((h: Row) => ({ id: h[idCol] ?? "", date: h[src.fields.date] ?? "" })).filter((p) => p.id);
  const leads = src.filter.mode === "codes"
    ? normalizeCodes(rows, pairs, v, city, { includeOptional: q.includeOptional })
    : normalizeText(rows, pairs, v, city, { includeOptional: q.includeOptional });

  return { leads, rowCount: rows.length, missingColumns: missingColumns(rows, src.requiredColumns) };
}

export async function getLeads(v: Vertical, city: CityId, q: LeadQuery): Promise<Lead[]> {
  return (await fetchLeads(v, city, q)).leads;
}
