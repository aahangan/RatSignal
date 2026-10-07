import { describe, expect, it, vi } from "vitest";
import { getVertical } from "../verticals";
import type { Logger } from "./log";
import { claimKey, runDaily, type RunAccount, type RunDeps, type SourceResult } from "./run";
import type { Lead } from "./schema";

const lead = (id: string, zip: string, date = "2026-10-05"): Lead => ({
  id: `nyc:${id}`, vertical: "vermin", city: "nyc", name: id, address: "", zip, date,
  categories: ["mice"], flags: [], notes: [], closed: false, failed: false, priorCitations: 0, heat: 50,
});

const account = (id: string, o: Partial<RunAccount> = {}): RunAccount => ({ id, email: `${id}@x.test`, company: id, city: "nyc", zips: [], digest: true, sent: {}, ...o });

function setup(opts: { accounts?: RunAccount[]; source?: () => Promise<SourceResult>; send?: () => Promise<void>; clockStep?: number } = {}) {
  const kv = new Map<string, unknown>();
  let clock = new Date("2026-10-06T11:00:00Z").getTime();
  const sent: { account: string; leads: string[] }[] = [];
  const alerts: string[] = [];
  const quiet: Logger = { info: () => {}, warn: () => {}, error: () => {} };
  const deps: RunDeps = {
    store: {
      get: async <T,>(k: string) => (kv.get(k) as T) ?? null,
      set: async (k, v) => void kv.set(k, structuredClone(v)),
      claim: async (k, v) => (kv.has(k) ? false : (kv.set(k, v), true)),
      del: async (k) => void kv.delete(k),
    },
    accounts: async () => opts.accounts ?? [account("a", { zips: ["11222"] }), account("b")],
    isLive: () => true,
    vertical: getVertical,
    fetchSource: opts.source ?? (async () => ({ leads: [lead("1", "11222"), lead("2", "10001")], rowCount: 5, missingColumns: [] })),
    hiddenZips: async () => new Set(),
    saveAccount: async () => {},
    sendDigest: opts.send ?? (async (a, leads) => void sent.push({ account: a.id, leads: leads.map((l) => l.id) })),
    alert: async (key) => void alerts.push(key),
    log: quiet,
    now: () => (clock += opts.clockStep ?? 1),
  };
  return { deps, kv, sent, alerts };
}

describe("runDaily", () => {
  it("sends each account only the leads in its area", async () => {
    const { deps, sent } = setup();
    const r = await runDaily("2026-10-06", deps);
    expect(r.status).toBe("completed");
    expect(sent).toEqual([{ account: "a", leads: ["nyc:1"] }, { account: "b", leads: ["nyc:1", "nyc:2"] }]);
  });

  it("is safe to run twice on the same day", async () => {
    const { deps, sent } = setup();
    await runDaily("2026-10-06", deps);
    const second = await runDaily("2026-10-06", deps);
    expect(sent).toHaveLength(2);
    expect(second.accounts.sent).toBe(0);
  });

  it("never re-sends a lead on a later day or a backfill", async () => {
    const accounts = [account("a")];
    const { deps, sent } = setup({ accounts });
    await runDaily("2026-10-05", deps);
    const next = await runDaily("2026-10-06", deps);
    expect(sent).toHaveLength(1);
    expect(next.accounts.noNewLeads).toBe(1);
  });

  it("dry runs report without sending or recording", async () => {
    const { deps, sent, kv } = setup();
    const r = await runDaily("2026-10-06", deps, { dryRun: true });
    expect(sent).toHaveLength(0);
    expect(r.previews).toEqual([{ account: "a@x.test", leads: 1 }, { account: "b@x.test", leads: 2 }]);
    expect(kv.size).toBe(0);
  });

  it("isolates a failing feed and alerts", async () => {
    const accounts = [account("a"), account("c", { vertical: "grease" })];
    const { deps, sent, alerts } = setup({
      accounts,
      source: vi.fn(async () => ({ leads: [lead("1", "11222")], rowCount: 1, missingColumns: [] })),
    });
    deps.fetchSource = async (v) => {
      if (v.id === "grease") throw new Error("feed down");
      return { leads: [lead("1", "11222")], rowCount: 1, missingColumns: [] };
    };
    const r = await runDaily("2026-10-06", deps);
    expect(sent.map((s) => s.account)).toEqual(["a"]);
    expect(r.accounts.sourceDown).toBe(1);
    expect(r.status).toBe("partial");
    expect(alerts).toContain("source-failed:grease:nyc:2026-10-06");
    expect(alerts).toContain("run:partial:2026-10-06");
  });

  it("releases the claim when sending fails so a re-run can retry", async () => {
    let fail = true;
    const sent: string[] = [];
    const { deps, kv } = setup({ accounts: [account("a")], send: async () => { if (fail) throw new Error("smtp"); sent.push("a"); } });
    const first = await runDaily("2026-10-06", deps);
    expect(first.accounts.failed).toBe(1);
    expect(kv.has(claimKey("a", "2026-10-06"))).toBe(false);
    fail = false;
    const retry = await runDaily("2026-10-06", deps);
    expect(retry.accounts.sent).toBe(1);
    expect(sent).toEqual(["a"]);
  });

  it("stops at the time budget and reports a partial run", async () => {
    const { deps, sent } = setup({ accounts: [account("a"), account("b"), account("c")], clockStep: 1000 });
    const r = await runDaily("2026-10-06", deps, { budgetMs: 2500 });
    expect(r.status).toBe("partial");
    expect(r.accounts.notReached).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(3);
  });

  it("alerts on zero rows and on missing columns", async () => {
    const { deps, alerts } = setup({ source: async () => ({ leads: [], rowCount: 0, missingColumns: ["camis"] }) });
    await runDaily("2026-10-06", deps);
    expect(alerts).toContain("zero-rows:vermin:nyc:2026-10-06");
    expect(alerts).toContain("schema:vermin:nyc:2026-10-06");
  });

  it("records the run for the admin page", async () => {
    const { deps, kv } = setup();
    await runDaily("2026-10-06", deps);
    expect(kv.get("runs")).toEqual(["2026-10-06"]);
    expect(kv.get("run:2026-10-06")).toMatchObject({ status: "completed", accounts: { sent: 2 } });
  });
});
