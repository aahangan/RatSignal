import { describe, expect, it } from "vitest";
import { grease } from "../verticals/grease";
import { vermin } from "../verticals/vermin";
import { chicagoRows, nycHistory, nycRows } from "./__fixtures__/rows";
import { categorize, dedupeKey, normalizeCodes, normalizeText, phoneDigits, priorCounts, relevantItems, scoreLead } from "./normalize";

const NOW = new Date("2026-10-02T12:00:00Z").getTime();

describe("codes mode (NYC)", () => {
  const leads = normalizeCodes(nycRows, nycHistory, vermin, "nyc", { now: NOW });
  const byId = Object.fromEntries(leads.map((l) => [l.id, l]));

  it("keeps one lead per establishment, using its latest inspection", () => {
    expect(byId["nyc:1"].date).toBe("2026-10-01");
    expect(byId["nyc:1"].categories.sort()).toEqual(["mice", "roaches"]);
    expect(byId["nyc:1"].notes).toEqual(["Evidence of mice.", "Live roaches."]);
  });

  it("maps fields and detects closures and failing scores", () => {
    const l = byId["nyc:1"];
    expect(l).toMatchObject({ name: "TEST DINER", address: "10 MAIN STREET Brooklyn", zip: "11222", phone: "7185551234", closed: true, failed: true, category: "American" });
    expect(byId["nyc:2"].closed).toBe(false);
  });

  it("drops invalid phone numbers and collapses whitespace in names", () => {
    expect(byId["nyc:2"].phone).toBeUndefined();
    expect(byId["nyc:2"].name).toBe("CORNER CAFE");
  });

  it("counts prior citations within the past year only", () => {
    expect(byId["nyc:1"].priorCitations).toBe(2);
  });

  it("excludes optional categories unless asked", () => {
    expect(byId["nyc:3"]).toBeUndefined();
    const all = normalizeCodes(nycRows, [], vermin, "nyc", { includeOptional: true, now: NOW });
    expect(all.find((l) => l.id === "nyc:3")?.categories).toEqual(["conditions"]);
  });

  it("only includes codes the vertical maps", () => {
    expect(byId["nyc:4"]).toBeUndefined();
    const drains = normalizeCodes(nycRows, [], grease, "nyc", { now: NOW });
    expect(drains.map((l) => l.id)).toEqual(["nyc:4"]);
    expect(drains[0].categories).toEqual(["drainage"]);
  });

  it("sorts hottest first", () => {
    expect(leads[0].id).toBe("nyc:1");
    expect(leads.map((l) => l.heat)).toEqual([...leads.map((l) => l.heat)].sort((a, b) => b - a));
  });
});

describe("text mode (Chicago)", () => {
  const src = vermin.sources.chicago!;

  it("picks out only the violation items the vertical cares about", () => {
    expect(relevantItems(chicagoRows[0].violations!, src)).toEqual(["OBSERVED 30 MOUSE DROPPINGS. RECOMMENDED PEST CONTROL SERVICE."]);
  });

  it("applies category rules, including 'unless' rules", () => {
    expect(categorize("OBSERVED RODENT ACTIVITY AND LIVE COCKROACHES", src)).toEqual(["rodents", "roaches"]);
    expect(categorize("OBSERVED MOUSE AND RODENT DROPPINGS", src)).toEqual(["mice"]);
    expect(categorize("DEAD INSECTS NOTED", src)).toEqual(["other"]);
  });

  const leads = normalizeText(chicagoRows, [{ id: "500", date: "2026-08-01T00:00:00.000" }], vermin, "chicago", { now: NOW });
  const byId = Object.fromEntries(leads.map((l) => [l.id, l]));

  it("keeps the latest inspection per establishment and counts history", () => {
    expect(byId["chicago:500"]).toMatchObject({ date: "2026-09-29", categories: ["mice"], failed: true, priorCitations: 1 });
  });

  it("sets flags from comments", () => {
    expect(byId["chicago:500"].flags).toEqual(["pestControlOrdered"]);
    expect(byId["chicago:501"].flags).toEqual([]);
  });

  it("prefers the AKA name and falls back to the inspection id for invalid licenses", () => {
    expect(byId["chicago:501"].name).toBe("BURGER BAR");
    expect(byId["chicago:i9003"]).toBeDefined();
    expect(byId["chicago:500"].address).toBe("100 N STATE ST");
  });

  it("matches items by comment text for the grease vertical", () => {
    const drains = normalizeText(chicagoRows, [], grease, "chicago", { now: NOW });
    const ids = Object.fromEntries(drains.map((l) => [l.id, l]));
    expect(ids["chicago:500"]).toMatchObject({ categories: ["drainage"], flags: ["repairOrdered"] });
    expect(ids["chicago:i9003"].categories).toEqual(["greaseTrap"]);
    expect(ids["chicago:501"]).toBeUndefined();
  });
});

describe("helpers", () => {
  it("normalizes phone numbers to 10 digits", () => {
    expect(phoneDigits("(718) 555-1234")).toBe("7185551234");
    expect(phoneDigits("555-1234")).toBeUndefined();
  });

  it("priorCounts ignores duplicates and future dates", () => {
    const counts = priorCounts(
      [{ id: "a", date: "2026-05-01" }, { id: "a", date: "2026-05-01T00:00:00.000" }, { id: "a", date: "2026-11-01" }],
      new Map([["a", "2026-10-01"]]),
    );
    expect(counts.get("a")).toBe(1);
  });

  it("scores closures, repeats and recency higher", () => {
    const base = { id: "x", vertical: "vermin", city: "nyc" as const, name: "", address: "", zip: "", date: "2026-10-01", categories: ["flies"], flags: [], notes: [], closed: false, failed: false, priorCitations: 0 };
    const plain = scoreLead(base, vermin, NOW);
    expect(scoreLead({ ...base, closed: true }, vermin, NOW)).toBe(plain + 25);
    expect(scoreLead({ ...base, priorCitations: 5 }, vermin, NOW)).toBe(plain + 24);
    expect(scoreLead({ ...base, date: "2026-08-01" }, vermin, NOW)).toBeLessThan(plain);
    expect(scoreLead({ ...base, categories: ["rats", "mice", "roaches", "flies"], closed: true, failed: true, priorCitations: 9 }, vermin, NOW)).toBe(100);
  });

  it("builds dedupe keys from the vertical's template", () => {
    const lead = normalizeCodes(nycRows, [], vermin, "nyc", { now: NOW })[0];
    expect(dedupeKey(lead, vermin)).toBe("nyc:1:2026-10-01");
  });
});
