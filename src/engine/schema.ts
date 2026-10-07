// A vertical is one lead product (e.g. pest violations sold to exterminators). Each one is a
// single config file validated against this schema; the engine does the rest.
import { z } from "zod";

export const CITY_IDS = ["nyc", "chicago"] as const;
export const CityIdSchema = z.enum(CITY_IDS);
export type CityId = z.infer<typeof CityIdSchema>;

/** Socrata (SoQL) column name. Kept strict so a typo in a config fails validation, not a query. */
const column = z.string().regex(/^[a-z_][a-z0-9_]*$/, "must be a Socrata column name");

/** One row per violation, matched by code (NYC style). */
const CodesFilter = z.object({
  mode: z.literal("codes"),
  field: column,
  /** violation code → category id */
  codes: z.record(z.string(), z.string()).refine((c) => Object.keys(c).length > 0, "needs at least one code"),
});

/** One row per inspection with all violations in a text field (Chicago style). */
const TextFilter = z.object({
  mode: z.literal("text"),
  field: column,
  /** SoQL LIKE patterns; a row is fetched if any matches. */
  where: z.array(z.string().min(1)).min(1),
  itemSeparator: z.string().default(" | "),
  commentSeparator: z.string().default(" - Comments: "),
  /** A violation item counts if any matcher hits: by item title, or by a regex on its comments. */
  items: z
    .array(z.object({ includes: z.string().optional(), commentPattern: z.string().optional() }))
    .min(1)
    .refine((ms) => ms.every((m) => m.includes || m.commentPattern), "each matcher needs includes or commentPattern"),
  /** Comment regex → category. `unlessAny` skips the rule when those categories already matched. */
  rules: z.array(z.object({ category: z.string(), pattern: z.string(), unlessAny: z.array(z.string()).default([]) })),
  fallbackCategory: z.string(),
  /** Comment regex → flag id (e.g. "inspector ordered pest control"). */
  flags: z.array(z.object({ flag: z.string(), pattern: z.string() })).default([]),
  maxNoteLength: z.number().int().positive().default(400),
});

const FieldMap = z.object({
  /** First non-empty column wins. */
  id: z.array(column).min(1),
  /** Used (prefixed with "i") when every `id` column is empty or invalid. */
  idFallback: column.optional(),
  invalidIds: z.array(z.string()).default([]),
  name: z.array(column).min(1),
  /** Joined with spaces. */
  address: z.array(column).min(1),
  zip: column,
  date: column,
  phone: column.optional(),
  category: column.optional(),
  lat: column.optional(),
  lng: column.optional(),
  inspectionType: column.optional(),
  /** Codes mode: per-violation description used as the note. */
  notes: column.optional(),
  closed: z.object({ field: column, containsAny: z.array(z.string().min(1)).min(1) }).optional(),
  failed: z.union([z.object({ field: column, gte: z.number() }), z.object({ field: column, equals: z.string() })]).optional(),
});

export const SourceSchema = z.object({
  type: z.literal("socrata"),
  domain: z.string().regex(/^[a-z0-9.-]+$/),
  dataset: z.string().regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/),
  filter: z.discriminatedUnion("mode", [CodesFilter, TextFilter]),
  fields: FieldMap,
  /** Columns that must appear in the data; if one disappears, the feed changed and we alert. */
  requiredColumns: z.array(column).min(1),
  /** Alert if a 7-day window returns fewer leads than this. */
  minWeeklyLeads: z.number().int().min(0).default(1),
  rowLimit: z.number().int().positive().max(50000).default(20000),
});

const Labelled = z.object({ label: z.string().min(1), weight: z.number().min(0).max(100) });

export const VerticalSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    /** Who buys these leads, e.g. "pest control companies". */
    audience: z.string().min(1),
    noun: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
    categories: z.record(z.string(), Labelled.extend({ optional: z.boolean().default(false) })),
    flags: z.record(z.string(), Labelled).default({}),
    /** Template for the "already sent" key: {id}, {date}, {city}, {vertical}. */
    dedupeKey: z.string().refine((k) => k.includes("{id}"), "must include {id}").default("{id}:{date}"),
    sources: z.object({ nyc: SourceSchema.optional(), chicago: SourceSchema.optional() }),
    email: z.object({
      /** {count}, {noun} */
      subject: z.string().min(1),
      /** {city}, {nouns}, {company} */
      intro: z.string().min(1),
    }),
    outreach: z.object({
      seller: z.string().min(1),
      situation: z.string().min(1),
      goal: z.string().min(1),
      offers: z.string().min(1),
    }),
  })
  .superRefine((v, ctx) => {
    const cats = new Set(Object.keys(v.categories));
    const flags = new Set(Object.keys(v.flags));
    const need = (ok: boolean, path: (string | number)[], message: string) => ok || ctx.addIssue({ code: "custom", path, message });
    need(Object.values(v.sources).some(Boolean), ["sources"], "needs at least one city source");
    for (const [city, src] of Object.entries(v.sources)) {
      if (!src) continue;
      const f = src.filter;
      if (f.mode === "codes") {
        for (const [code, cat] of Object.entries(f.codes)) need(cats.has(cat), ["sources", city, "filter", "codes", code], `unknown category "${cat}"`);
      } else {
        need(cats.has(f.fallbackCategory), ["sources", city, "filter", "fallbackCategory"], `unknown category "${f.fallbackCategory}"`);
        f.rules.forEach((r, i) => need(cats.has(r.category), ["sources", city, "filter", "rules", i], `unknown category "${r.category}"`));
        f.flags.forEach((r, i) => need(flags.has(r.flag), ["sources", city, "filter", "flags", i], `unknown flag "${r.flag}"`));
        for (const p of [...f.rules.map((r) => r.pattern), ...f.flags.map((r) => r.pattern), ...f.items.flatMap((m) => (m.commentPattern ? [m.commentPattern] : []))]) {
          try {
            new RegExp(p);
          } catch {
            need(false, ["sources", city, "filter"], `invalid regex ${p}`);
          }
        }
      }
    }
  });

export type VerticalInput = z.input<typeof VerticalSchema>;
export type Vertical = z.output<typeof VerticalSchema>;
export type Source = z.output<typeof SourceSchema>;

/** Validates a vertical config at load time so a broken config fails loudly at build/test time. */
export function defineVertical(config: VerticalInput): Vertical {
  return VerticalSchema.parse(config);
}

export type Lead = {
  /** Stable per establishment and city, e.g. "nyc:50141510". */
  id: string;
  vertical: string;
  city: CityId;
  name: string;
  address: string;
  zip: string;
  phone?: string;
  category?: string;
  lat?: number;
  lng?: number;
  /** YYYY-MM-DD of the most recent qualifying citation */
  date: string;
  inspectionType?: string;
  categories: string[];
  flags: string[];
  notes: string[];
  closed: boolean;
  failed: boolean;
  /** Other inspections with qualifying citations in the 12 months before `date` */
  priorCitations: number;
  /** 0-100 urgency */
  heat: number;
};

/** What the UI needs to label leads, safe to pass to client components. */
export type VerticalLabels = {
  id: string;
  name: string;
  noun: { singular: string; plural: string };
  categories: Record<string, string>;
  optionalCategories: string[];
  flags: Record<string, string>;
};

export function labelsFor(v: Vertical): VerticalLabels {
  return {
    id: v.id,
    name: v.name,
    noun: v.noun,
    categories: Object.fromEntries(Object.entries(v.categories).map(([k, c]) => [k, c.label])),
    optionalCategories: Object.entries(v.categories).filter(([, c]) => c.optional).map(([k]) => k),
    flags: Object.fromEntries(Object.entries(v.flags).map(([k, f]) => [k, f.label])),
  };
}
