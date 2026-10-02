// Turns city restaurant-inspection open data (Socrata) into pest-control leads.

export const CITIES = {
  nyc: { name: "New York City", short: "NYC", zip: /^(100|101|102|103|104|110|111|112|113|114|116)\d\d$/ },
  chicago: { name: "Chicago", short: "Chicago", zip: /^(606|607|608)\d\d$/ },
} as const;

export type CityId = keyof typeof CITIES;
export const CITY_IDS = Object.keys(CITIES) as CityId[];

export type PestType = "rats" | "mice" | "rodents" | "roaches" | "flies" | "other" | "conditions";

export const PEST_LABELS: Record<PestType, string> = {
  rats: "Rats",
  mice: "Mice",
  rodents: "Rodents",
  roaches: "Roaches",
  flies: "Flies",
  other: "Other pests",
  conditions: "Pest-friendly conditions",
};

export type Lead = {
  /** Stable per establishment, e.g. "nyc:50141510" */
  id: string;
  city: CityId;
  name: string;
  address: string;
  zip: string;
  phone?: string;
  category?: string;
  lat?: number;
  lng?: number;
  /** ISO date (YYYY-MM-DD) of the most recent pest citation */
  date: string;
  inspectionType?: string;
  pests: PestType[];
  notes: string[];
  closed: boolean;
  failed: boolean;
  /** The inspector explicitly told them to bring in pest control */
  pestControlOrdered: boolean;
  /** Other inspections with pest citations in the 12 months before `date` */
  priorCitations: number;
  /** 0-100: how likely this restaurant needs (and will pay for) service now */
  heat: number;
};

export type LeadQuery = {
  city: CityId;
  /** Empty = whole city */
  zips: string[];
  days: number;
  includeConditions?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDate(new Date(Date.now() - n * DAY_MS));

async function soql<T>(base: string, params: Record<string, string>, revalidate = 3600): Promise<T[]> {
  const url = `${base}?${new URLSearchParams(params)}`;
  const headers: Record<string, string> = {};
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, { headers, next: { revalidate } });
  if (!res.ok) throw new Error(`Open data request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

const quoteList = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "")}'`).join(",");

// ---------------------------------------------------------------------------
// Scoring

const PEST_WEIGHT: Record<PestType, number> = {
  rats: 35,
  mice: 30,
  rodents: 30,
  roaches: 30,
  flies: 15,
  other: 15,
  conditions: 8,
};

function scoreLead(l: Omit<Lead, "heat">): number {
  const weights = l.pests.map((p) => PEST_WEIGHT[p]).sort((a, b) => b - a);
  let heat = (weights[0] ?? 0) + 5 * Math.max(0, weights.length - 1);
  if (l.closed) heat += 25;
  if (l.failed) heat += 10;
  if (l.pestControlOrdered) heat += 10;
  heat += Math.min(l.priorCitations * 8, 24);
  const age = (Date.now() - new Date(l.date).getTime()) / DAY_MS;
  heat += age <= 3 ? 15 : age <= 7 ? 8 : age <= 30 ? 3 : 0;
  return Math.min(100, Math.round(heat));
}

function finish(leads: Omit<Lead, "heat">[]): Lead[] {
  return leads.map((l) => ({ ...l, heat: scoreLead(l) })).sort((a, b) => b.heat - a.heat || b.date.localeCompare(a.date));
}

/** Counts distinct earlier citation dates per establishment within 12 months of its latest citation. */
function priorCounts(pairs: { id: string; date: string }[], latest: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const { id, date } of pairs) {
    const last = latest.get(id);
    if (!last || date >= last) continue;
    if (new Date(last).getTime() - new Date(date).getTime() > 365 * DAY_MS) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// New York City: DOHMH Restaurant Inspection Results (one row per violation)

const NYC = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const NYC_PEST_CODES: Record<string, PestType> = {
  "04K": "rats",
  "04L": "mice",
  "04M": "roaches",
  "04N": "flies",
  "08A": "conditions",
};

type NycRow = {
  camis: string;
  dba?: string;
  building?: string;
  street?: string;
  boro?: string;
  zipcode?: string;
  phone?: string;
  cuisine_description?: string;
  inspection_date: string;
  inspection_type?: string;
  action?: string;
  violation_code: string;
  violation_description?: string;
  score?: string;
  latitude?: string;
  longitude?: string;
};

function nycPhone(p?: string) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : undefined;
}

async function nycLeads(q: LeadQuery): Promise<Lead[]> {
  const codes = Object.entries(NYC_PEST_CODES)
    .filter(([, t]) => q.includeConditions || t !== "conditions")
    .map(([c]) => c);
  const zipFilter = q.zips.length ? ` AND zipcode in (${quoteList(q.zips)})` : "";
  const codeFilter = `violation_code in (${quoteList(codes)})`;

  const [rows, history] = await Promise.all([
    soql<NycRow>(NYC, {
      $where: `${codeFilter} AND inspection_date > '${daysAgo(q.days)}'${zipFilter}`,
      $order: "inspection_date DESC",
      $limit: "20000",
    }),
    soql<{ camis: string; inspection_date: string }>(NYC, {
      $select: "camis,inspection_date",
      $group: "camis,inspection_date",
      $where: `${codeFilter} AND inspection_date > '${daysAgo(q.days + 365)}'${zipFilter}`,
      $limit: "50000",
    }),
  ]);

  // Keep only each restaurant's most recent pest-cited inspection.
  const byId = new Map<string, NycRow[]>();
  for (const r of rows) {
    const list = byId.get(r.camis);
    if (!list) byId.set(r.camis, [r]);
    else if (r.inspection_date === list[0].inspection_date) list.push(r);
  }
  const latest = new Map([...byId].map(([id, rs]) => [id, rs[0].inspection_date]));
  const prior = priorCounts(history.map((h) => ({ id: h.camis, date: h.inspection_date })), latest);

  return finish(
    [...byId].map(([camis, rs]) => {
      const r = rs[0];
      const pests = [...new Set(rs.map((x) => NYC_PEST_CODES[x.violation_code]).filter(Boolean))];
      const action = (r.action ?? "").toLowerCase();
      return {
        id: `nyc:${camis}`,
        city: "nyc" as const,
        name: r.dba?.trim() || "Unnamed establishment",
        address: [r.building, r.street, r.boro].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        zip: r.zipcode ?? "",
        phone: nycPhone(r.phone),
        category: r.cuisine_description,
        lat: r.latitude ? Number(r.latitude) : undefined,
        lng: r.longitude ? Number(r.longitude) : undefined,
        date: r.inspection_date.slice(0, 10),
        inspectionType: r.inspection_type,
        pests,
        notes: rs.map((x) => x.violation_description ?? "").filter(Boolean),
        closed: action.includes("closed by") || action.includes("re-closed"),
        failed: Number(r.score ?? 0) >= 28,
        pestControlOrdered: false,
        priorCitations: prior.get(`${camis}`) ?? 0,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Chicago: Food Inspections (one row per inspection, violations as text)

const CHI = "https://data.cityofchicago.org/resource/4ijn-s7e5.json";
const CHI_PEST_MATCH = "%INSECTS, RODENTS%";

type ChiRow = {
  license_?: string;
  inspection_id: string;
  dba_name?: string;
  aka_name?: string;
  facility_type?: string;
  address?: string;
  zip?: string;
  inspection_date: string;
  inspection_type?: string;
  results?: string;
  violations?: string;
  latitude?: string;
  longitude?: string;
};

function chicagoPests(comments: string): PestType[] {
  const t = comments.toUpperCase();
  const found = new Set<PestType>();
  if (/\bRATS?\b/.test(t)) found.add("rats");
  if (/\bMICE\b|\bMOUSE\b/.test(t)) found.add("mice");
  if (!found.has("rats") && !found.has("mice") && /RODENT/.test(t)) found.add("rodents");
  if (/ROACH/.test(t)) found.add("roaches");
  if (/\bFLIES\b|\bFLY\b|\bGNATS?\b/.test(t)) found.add("flies");
  if (!found.size) found.add("other");
  return [...found];
}

async function chicagoLeads(q: LeadQuery): Promise<Lead[]> {
  const zipFilter = q.zips.length ? ` AND zip in (${quoteList(q.zips)})` : "";
  const pestFilter = `violations like '${CHI_PEST_MATCH}'`;

  const [rows, history] = await Promise.all([
    soql<ChiRow>(CHI, {
      $where: `${pestFilter} AND inspection_date > '${daysAgo(q.days)}'${zipFilter}`,
      $order: "inspection_date DESC",
      $limit: "5000",
    }),
    soql<{ license_: string; inspection_date: string }>(CHI, {
      $select: "license_,inspection_date",
      $group: "license_,inspection_date",
      $where: `${pestFilter} AND inspection_date > '${daysAgo(q.days + 365)}'${zipFilter}`,
      $limit: "50000",
    }),
  ]);

  const byId = new Map<string, ChiRow>();
  for (const r of rows) {
    const id = r.license_ && r.license_ !== "0" ? r.license_ : `i${r.inspection_id}`;
    if (!byId.has(id)) byId.set(id, r);
  }
  const latest = new Map([...byId].map(([id, r]) => [id, r.inspection_date]));
  const prior = priorCounts(history.map((h) => ({ id: h.license_, date: h.inspection_date })), latest);

  return finish(
    [...byId].map(([id, r]) => {
      const pestItems = (r.violations ?? "")
        .split(" | ")
        .filter((v) => v.includes("INSECTS, RODENTS"))
        .map((v) => v.split(" - Comments: ")[1]?.trim() ?? "")
        .filter(Boolean);
      const comments = pestItems.join(" ");
      return {
        id: `chicago:${id}`,
        city: "chicago" as const,
        name: (r.aka_name || r.dba_name || "Unnamed establishment").trim(),
        address: (r.address ?? "").trim(),
        zip: r.zip ?? "",
        category: r.facility_type,
        lat: r.latitude ? Number(r.latitude) : undefined,
        lng: r.longitude ? Number(r.longitude) : undefined,
        date: r.inspection_date.slice(0, 10),
        inspectionType: r.inspection_type,
        pests: chicagoPests(comments),
        notes: pestItems.map((c) => (c.length > 400 ? `${c.slice(0, 400)}…` : c)),
        closed: false,
        failed: r.results === "Fail",
        pestControlOrdered: /PEST CONTROL/i.test(comments),
        priorCitations: prior.get(id) ?? 0,
      };
    }),
  );
}

// ---------------------------------------------------------------------------

export async function getLeads(q: LeadQuery): Promise<Lead[]> {
  return q.city === "nyc" ? nycLeads(q) : chicagoLeads(q);
}

export function normalizeZips(city: CityId, raw: string | string[]): { zips: string[]; invalid: string[] } {
  const parts = (Array.isArray(raw) ? raw : raw.split(/[\s,;]+/)).map((z) => z.trim()).filter(Boolean);
  const zips = [...new Set(parts.filter((z) => CITIES[city].zip.test(z)))].sort();
  const invalid = parts.filter((z) => !CITIES[city].zip.test(z));
  return { zips, invalid };
}

export function formatPhone(digits?: string) {
  if (!digits) return undefined;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskPhone(digits?: string) {
  if (!digits) return undefined;
  return `(${digits.slice(0, 3)}) •••-••${digits.slice(8)}`;
}
