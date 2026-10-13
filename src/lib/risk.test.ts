import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("./db", () => ({
  db: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
    mget: async (ks: string[]) => ks.map((k) => store.get(k) ?? null),
  },
}));

const { ForecastUpload, forecastForZips, forecastMeta, forecastRuns, saveEvaluation, saveForecast, servedForecast } = await import("./risk");

const today = new Date().toISOString().slice(0, 10);
const entry = (id: string, zip: string, prob: number) => ({ id, name: id, address: "1 Main St", zip, prob, reasons: ["Re-inspection due"] });
const upload = (date = today) => ForecastUpload.parse({
  date, version: "20261012", horizonDays: 60, cityRate: 0.04, scored: 3,
  metrics: { model: { precision_at_100: 0.3 }, heuristic: { precision_at_100: 0.08 } },
  zips: { "11222": [entry("nyc:1", "11222", 0.3), entry("nyc:2", "11222", 0.1)], "11211": [entry("nyc:3", "11211", 0.2)] },
  top: [["nyc:1", 0.3], ["nyc:3", 0.2]],
});

beforeEach(() => store.clear());

describe("forecast storage", () => {
  it("serves the account's zips merged and sorted by risk", async () => {
    await saveForecast(upload());
    expect((await forecastForZips(["11222", "11211", "10001"])).map((e) => e.id)).toEqual(["nyc:1", "nyc:3", "nyc:2"]);
    expect(await forecastMeta()).toMatchObject({ version: "20261012", zipCount: 2, scored: 3 });
  });

  it("ignores stale forecasts", async () => {
    await saveForecast(upload("2020-01-01"));
    expect(await forecastForZips(["11222"])).toEqual([]);
  });

  it("keeps what was served for later evaluation", async () => {
    await saveForecast(upload());
    expect(await servedForecast(today)).toEqual({ top: [["nyc:1", 0.3], ["nyc:3", 0.2]], zips: { "11222": ["nyc:1", "nyc:2"], "11211": ["nyc:3"] } });
    await saveEvaluation({ date: today, evaluatedAt: "x", metrics: { precision_at_100: 0.28 } });
    expect(await forecastRuns()).toEqual([{ date: today, evaluation: { date: today, evaluatedAt: "x", metrics: { precision_at_100: 0.28 } } }]);
  });

  it("rejects malformed uploads", () => {
    expect(ForecastUpload.safeParse({ ...upload(), zips: { "112": [] } }).success).toBe(false);
    expect(ForecastUpload.safeParse({ ...upload(), cityRate: 2 }).success).toBe(false);
  });
});
