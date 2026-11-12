import { z } from "zod";
import { quoteList, socrataQuery } from "@/engine/sources/socrata";
import { db } from "./db";

// Quote requests from restaurants (mostly via postcards that link to /q/<code>), passed on to pest
// control partners as warm leads.

const NYC = { domain: "data.cityofnewyork.us", dataset: "43nn-pn8j" };
const PEST_CODES: Record<string, string> = { "04K": "rats", "04L": "mice", "04M": "roaches", "04N": "flies" };

/** Short, unguessable-enough code for a restaurant: its NYC CAMIS id in base 36. */
export const encodeCode = (camis: string) => (/^\d{5,10}$/.test(camis) ? Number(camis).toString(36) : null);
export function decodeCode(code: string) {
  if (!/^[0-9a-z]{3,8}$/i.test(code)) return null;
  const n = parseInt(code.toLowerCase(), 36);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
}

export type Restaurant = { camis: string; name: string; address: string; zip: string; boro: string; citedOn?: string; pests: string[] };

/** Looks up a restaurant and its most recent pest citation in the city's open data. */
export async function lookupRestaurant(camis: string): Promise<Restaurant | null> {
  const rows = await socrataQuery(NYC.domain, NYC.dataset, {
    $select: "camis,dba,building,street,zipcode,boro,inspection_date,violation_code",
    $where: `camis = ${quoteList([camis])}`,
    $order: "inspection_date DESC",
    $limit: 200,
  }, { revalidate: 3600 });
  if (!rows.length) return null;
  const r = rows[0];
  const pestRows = rows.filter((x) => x.violation_code && PEST_CODES[x.violation_code]);
  const lastDate = pestRows[0]?.inspection_date;
  const pests = [...new Set(pestRows.filter((x) => x.inspection_date === lastDate).map((x) => PEST_CODES[x.violation_code!]))];
  const tidy = (s?: string) => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    // The city stores names in capitals; show "Houston Hall", not "HOUSTON HALL".
    return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s/&(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : t;
  };
  return {
    camis,
    name: tidy(r.dba),
    address: tidy(`${r.building ?? ""} ${r.street ?? ""}`),
    zip: tidy(r.zipcode),
    boro: tidy(r.boro),
    citedOn: lastDate?.slice(0, 10),
    pests,
  };
}

export const QuoteInput = z.object({
  code: z.string().max(12).optional(),
  restaurant: z.string().trim().min(2).max(120),
  address: z.string().trim().max(160).optional().default(""),
  contactName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[\d\s()+.-]{10,20}$/, "Enter a valid phone number"),
  email: z.union([z.email().max(254), z.literal("")]).optional().default(""),
  pests: z.array(z.enum(["rats", "mice", "roaches", "flies", "other"])).max(5).default([]),
  timing: z.enum(["unknown", "this-week", "later"]).default("unknown"),
  consent: z.literal(true, { error: "Please confirm we can share your details with one licensed pest control company" }),
  /** Honeypot: real people leave it empty. */
  website: z.string().max(200).optional().default(""),
});
export type QuoteInputT = z.infer<typeof QuoteInput>;

export type Quote = Omit<QuoteInputT, "consent" | "website"> & {
  id: string;
  camis?: string;
  createdAt: number;
  status: "new" | "sent" | "closed";
  partner?: string;
};

export async function saveQuote(input: QuoteInputT): Promise<Quote> {
  const { code, restaurant, address, contactName, phone, email, pests, timing } = input;
  const camis = code ? (decodeCode(code) ?? undefined) : undefined;
  const quote: Quote = { code, restaurant, address, contactName, phone, email, pests, timing, id: crypto.randomUUID(), camis, createdAt: Date.now(), status: "new" };
  await db.set(`quote:${quote.id}`, quote);
  const ids = (await db.get<string[]>("quotes")) ?? [];
  await db.set("quotes", [quote.id, ...ids].slice(0, 1000));
  return quote;
}

export async function listQuotes(limit = 50): Promise<Quote[]> {
  const ids = ((await db.get<string[]>("quotes")) ?? []).slice(0, limit);
  return (await db.mget<Quote>(ids.map((id) => `quote:${id}`))).filter((q): q is Quote => !!q);
}
