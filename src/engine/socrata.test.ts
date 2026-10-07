import { afterEach, describe, expect, it, vi } from "vitest";
import { vermin } from "../verticals/vermin";
import { whereClause } from "./leads";
import { missingColumns, socrataQuery } from "./sources/socrata";

afterEach(() => vi.unstubAllGlobals());

describe("socrata connector", () => {
  it("retries a failing request and returns rows", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ camis: "1" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(socrataQuery("data.example.org", "abcd-1234", { $limit: "1" }, { retries: 2 })).resolves.toEqual([{ camis: "1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://data.example.org/resource/abcd-1234.json?%24limit=1");
  }, 10_000);

  it("rejects a non-array body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: true }), { status: 200 })));
    await expect(socrataQuery("data.example.org", "abcd-1234", {}, { retries: 0 })).rejects.toThrow(/non-array/);
  });

  it("detects columns that vanished from the feed", () => {
    expect(missingColumns([{ a: "1" }, { a: "2", b: "3" }], ["a", "b", "c"])).toEqual(["c"]);
    expect(missingColumns([], ["a"])).toEqual([]);
  });
});

describe("query building", () => {
  it("selects only non-optional codes unless asked", () => {
    const w = whereClause(vermin, "nyc", { zips: [], from: "2026-09-01" });
    expect(w).toContain("violation_code in ('04K','04L','04M','04N')");
    expect(whereClause(vermin, "nyc", { zips: [], from: "2026-09-01", includeOptional: true })).toContain("'08A'");
  });

  it("filters by zip and date window, escaping quotes", () => {
    const w = whereClause(vermin, "nyc", { zips: ["11222", "1'1"], from: "2026-09-01", to: "2026-09-30" });
    expect(w).toContain("zipcode in ('11222','1''1')");
    expect(w).toContain("inspection_date > '2026-09-01'");
    expect(w).toContain("inspection_date <= '2026-09-30T23:59:59'");
  });

  it("ORs text-mode LIKE patterns", () => {
    expect(whereClause(vermin, "chicago", { zips: [], from: "2026-09-01" })).toContain("(violations like '%INSECTS, RODENTS%')");
  });
});
