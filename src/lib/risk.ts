import { z } from "zod";
import { db } from "./db";

// Pest-violation forecasts produced daily by the Python model in ml/ (see ml/README.md).

const Entry = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  zip: z.string(),
  phone: z.string().optional(),
  cuisine: z.string().optional(),
  /** Probability of a pest violation within the horizon */
  prob: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(5),
});
export type ForecastEntry = z.infer<typeof Entry>;

const Metrics = z.record(z.string(), z.number());

export const ForecastUpload = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.string(),
  horizonDays: z.number().int().positive(),
  /** Mean predicted probability across all scored restaurants */
  cityRate: z.number().min(0).max(1),
  scored: z.number().int().nonnegative(),
  /** Offline test-period metrics of the model and the baselines it was compared with */
  metrics: z.record(z.string(), Metrics),
  zips: z.record(z.string().regex(/^\d{5}$/), z.array(Entry).max(25)),
  /** Highest-risk ids citywide, kept so accuracy can be measured once the horizon has passed */
  top: z.array(z.tuple([z.string(), z.number()])).max(1000),
});
export type ForecastUploadT = z.infer<typeof ForecastUpload>;

export type ForecastMeta = Omit<ForecastUploadT, "zips" | "top"> & { generatedAt: number; zipCount: number };

export const Evaluation = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evaluatedAt: z.string(),
  metrics: z.record(z.string(), z.number()),
});
export type EvaluationT = z.infer<typeof Evaluation>;

const RUNS_KEPT = 180;

export async function saveForecast(f: ForecastUploadT) {
  const { zips, top, ...rest } = f;
  const meta: ForecastMeta = { ...rest, generatedAt: Date.now(), zipCount: Object.keys(zips).length };
  // Served lists are stored per date for later evaluation; per-zip lists are what the dashboard reads.
  const served = { top, zips: Object.fromEntries(Object.entries(zips).map(([z, es]) => [z, es.map((e) => e.id)])) };
  await Promise.all(Object.entries(zips).map(([zip, entries]) => db.set(`risk:zip:${zip}`, { date: f.date, entries })));
  await db.set(`risk:served:${f.date}`, served);
  await db.set("risk:meta", meta);
  const runs = (await db.get<string[]>("risk:runs")) ?? [];
  await db.set("risk:runs", [f.date, ...runs.filter((d) => d !== f.date)].slice(0, RUNS_KEPT));
}

export async function forecastMeta() {
  return db.get<ForecastMeta>("risk:meta");
}

/** Today's forecast for these zips, highest risk first. Lists older than `maxAgeDays` are ignored. */
export async function forecastForZips(zips: string[], maxAgeDays = 7): Promise<ForecastEntry[]> {
  const lists = await db.mget<{ date: string; entries: ForecastEntry[] }>(zips.map((z) => `risk:zip:${z}`));
  const fresh = (d: string) => Date.now() - new Date(`${d}T12:00:00Z`).getTime() <= maxAgeDays * 86_400_000;
  return lists.flatMap((l) => (l && fresh(l.date) ? l.entries : [])).sort((a, b) => b.prob - a.prob);
}

export async function servedForecast(date: string) {
  return db.get<{ top: [string, number][]; zips: Record<string, string[]> }>(`risk:served:${date}`);
}

export async function forecastRuns() {
  const dates = (await db.get<string[]>("risk:runs")) ?? [];
  const evals = await db.mget<EvaluationT>(dates.map((d) => `risk:eval:${d}`));
  return dates.map((date, i) => ({ date, evaluation: evals[i] }));
}

export async function saveEvaluation(e: EvaluationT) {
  await db.set(`risk:eval:${e.date}`, e);
}
