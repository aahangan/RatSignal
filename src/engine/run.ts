// The daily delivery run. Safe to re-run: each account is claimed once per date, and every
// lead already delivered is remembered, so a second run (or a backfill) never sends duplicates.
// Dependencies are injected so the whole run is unit tested against in-memory fakes.
import type { Logger } from "./log";
import { dedupeKey } from "./normalize";
import type { CityId, Lead, Vertical } from "./schema";

const SENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RunAccount = {
  id: string;
  email: string;
  company: string;
  vertical?: string;
  city: CityId;
  zips: string[];
  digest: boolean;
  sent: Record<string, number>;
};

export type SourceResult = { leads: Lead[]; rowCount: number; missingColumns: string[] };

export type RunStore = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  claim(key: string, value: string): Promise<boolean>;
  del(key: string): Promise<void>;
};

export type RunDeps<A extends RunAccount = RunAccount> = {
  store: RunStore;
  accounts: () => Promise<A[]>;
  isLive: (a: A) => boolean;
  vertical: (id: string | undefined) => Vertical;
  fetchSource: (v: Vertical, city: CityId, asOf: Date) => Promise<SourceResult>;
  hiddenZips: (a: A, zips: string[]) => Promise<Set<string>>;
  saveAccount: (a: A) => Promise<void>;
  sendDigest: (a: A, leads: Lead[], v: Vertical) => Promise<void>;
  alert: (key: string, subject: string, details: Record<string, unknown>) => Promise<void>;
  log: Logger;
  now: () => number;
};

export type SourceReport = { ok: boolean; rows: number; leads: number; missingColumns: string[]; error?: string };

export type RunReport = {
  date: string;
  dryRun: boolean;
  startedAt: number;
  finishedAt?: number;
  status: "completed" | "partial" | "failed";
  sources: Record<string, SourceReport>;
  accounts: { eligible: number; sent: number; noNewLeads: number; alreadySent: number; sourceDown: number; failed: number; notReached: number };
  previews?: { account: string; leads: number }[];
  errors: string[];
};

export type RunOptions = { dryRun?: boolean; budgetMs?: number };

/** End of the run's window: now for today, end of that day for backfills. */
export function asOfFor(date: string, now: number) {
  return new Date(Math.min(now, new Date(`${date}T23:59:59Z`).getTime()));
}

export const runKey = (date: string) => `run:${date}`;
export const claimKey = (accountId: string, date: string) => `digest:${accountId}:${date}`;

export async function runDaily<A extends RunAccount>(date: string, deps: RunDeps<A>, opts: RunOptions = {}): Promise<RunReport> {
  const { log } = deps;
  const startedAt = deps.now();
  const budgetMs = opts.budgetMs ?? 240_000;
  const dryRun = !!opts.dryRun;
  const report: RunReport = {
    date, dryRun, startedAt, status: "completed", sources: {}, errors: [],
    accounts: { eligible: 0, sent: 0, noNewLeads: 0, alreadySent: 0, sourceDown: 0, failed: 0, notReached: 0 },
    ...(dryRun ? { previews: [] } : {}),
  };
  log.info("run.start", { date, dryRun, budgetMs });

  try {
    const accounts = (await deps.accounts()).filter((a) => deps.isLive(a) && a.digest);
    report.accounts.eligible = accounts.length;
    const asOf = asOfFor(date, startedAt);

    // Fetch each (vertical, city) feed once, independently: one broken feed only affects its own accounts.
    const keys = [...new Set(accounts.map((a) => `${deps.vertical(a.vertical).id}:${a.city}`))];
    const results = new Map<string, SourceResult>();
    await Promise.all(
      keys.map(async (key) => {
        const [vid, city] = key.split(":") as [string, CityId];
        const v = deps.vertical(vid);
        try {
          const res = await deps.fetchSource(v, city, asOf);
          results.set(key, res);
          report.sources[key] = { ok: true, rows: res.rowCount, leads: res.leads.length, missingColumns: res.missingColumns };
          log.info("run.source", { date, source: key, rows: res.rowCount, leads: res.leads.length });
          const min = v.sources[city]?.minWeeklyLeads ?? 0;
          if (res.rowCount === 0 && min > 0) {
            await deps.alert(`zero-rows:${key}:${date}`, `${key} feed returned zero rows`, { date, source: key, expectedAtLeast: min });
          }
          if (res.missingColumns.length) {
            await deps.alert(`schema:${key}:${date}`, `${key} feed changed: columns missing`, { date, source: key, missing: res.missingColumns });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          report.sources[key] = { ok: false, rows: 0, leads: 0, missingColumns: [], error: message };
          report.errors.push(`${key}: ${message}`);
          log.error("run.source_failed", { date, source: key, error: message });
          await deps.alert(`source-failed:${key}:${date}`, `${key} feed failed`, { date, source: key, error: message });
        }
      }),
    );

    for (const [i, account] of accounts.entries()) {
      if (deps.now() - startedAt > budgetMs) {
        report.status = "partial";
        report.accounts.notReached = accounts.length - i;
        log.warn("run.budget_exceeded", { date, notReached: accounts.length - i });
        break;
      }
      const v = deps.vertical(account.vertical);
      const source = results.get(`${v.id}:${account.city}`);
      if (!source) {
        report.accounts.sourceDown++;
        continue;
      }
      try {
        const inArea = account.zips.length ? source.leads.filter((l) => account.zips.includes(l.zip)) : source.leads;
        const hidden = await deps.hiddenZips(account, [...new Set(inArea.map((l) => l.zip))]);
        const fresh = inArea.filter((l) => !hidden.has(l.zip) && !account.sent[dedupeKey(l, v)]);
        if (!fresh.length) {
          report.accounts.noNewLeads++;
          continue;
        }
        if (dryRun) {
          report.previews!.push({ account: account.email, leads: fresh.length });
          continue;
        }
        if (!(await deps.store.claim(claimKey(account.id, date), String(startedAt)))) {
          report.accounts.alreadySent++;
          continue;
        }
        try {
          await deps.sendDigest(account, fresh, v);
        } catch (err) {
          // Release the claim so a re-run can retry this account.
          await deps.store.del(claimKey(account.id, date));
          throw err;
        }
        const now = deps.now();
        for (const [key, t] of Object.entries(account.sent)) if (now - t > SENT_TTL_MS) delete account.sent[key];
        for (const l of fresh) account.sent[dedupeKey(l, v)] = now;
        await deps.saveAccount(account);
        report.accounts.sent++;
        log.info("run.sent", { date, account: account.id, leads: fresh.length });
      } catch (err) {
        report.accounts.failed++;
        const message = err instanceof Error ? err.message : String(err);
        report.errors.push(`${account.id}: ${message}`);
        log.error("run.account_failed", { date, account: account.id, error: message });
      }
    }
  } catch (err) {
    report.status = "failed";
    report.errors.push(err instanceof Error ? err.message : String(err));
    log.error("run.failed", { date, error: err });
  }

  if (report.status === "completed" && (report.accounts.failed || Object.values(report.sources).some((s) => !s.ok))) {
    report.status = "partial";
  }
  report.finishedAt = deps.now();
  if (!dryRun) {
    await deps.store.set(runKey(date), report);
    const index = (await deps.store.get<string[]>("runs")) ?? [];
    await deps.store.set("runs", [date, ...index.filter((d) => d !== date)].slice(0, 60));
  }
  if (report.status !== "completed" && !dryRun) {
    await deps.alert(`run:${report.status}:${date}`, `Daily run ${report.status} for ${date}`, {
      date, accounts: report.accounts, errors: report.errors.slice(0, 10),
    });
  }
  log.info("run.finish", { date, status: report.status, accounts: report.accounts, ms: report.finishedAt - startedAt });
  return report;
}
