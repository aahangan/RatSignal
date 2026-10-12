// Shared connector for city open-data portals running Socrata (SODA 2.1 / SoQL), built on socrata-fetch.
import { createClient, type SoqlParams } from "socrata-fetch";
import { log } from "../log";

export { missingColumns, quoteList } from "socrata-fetch";
export type { Row } from "socrata-fetch";

export type QueryOptions = {
  /** Seconds Next.js may cache the response; ignored when `fresh` is set. */
  revalidate?: number;
  /** Bypass caches (used by the daily run so it always sees the newest records). */
  fresh?: boolean;
  timeoutMs?: number;
  retries?: number;
};

const PAGE_SIZE = 5000;

function client(domain: string, opts: QueryOptions) {
  return createClient({
    domain,
    appToken: process.env.SOCRATA_APP_TOKEN,
    // Resolve fetch per call so Next.js's patched fetch (and test stubs) are always used.
    fetch: (input, init) => fetch(input, init),
    init: opts.fresh ? { cache: "no-store" } : { next: { revalidate: opts.revalidate ?? 3600 } },
    timeoutMs: opts.timeoutMs ?? 20_000,
    retries: opts.retries ?? 3,
    onRetry: ({ dataset, attempt, delayMs, error }) => log.warn("socrata.retry", { domain, dataset, attempt, delayMs, error }),
  });
}

/** One request. */
export function socrataQuery(domain: string, dataset: string, params: SoqlParams, opts: QueryOptions = {}) {
  return client(domain, opts).query(dataset, params);
}

/** Every matching row up to `maxRows`, fetched in pages. Logs a warning if the cap cut results off. */
export async function socrataQueryAll(domain: string, dataset: string, params: SoqlParams, maxRows: number, opts: QueryOptions = {}) {
  const rows = await client(domain, opts).queryAll(dataset, params, { pageSize: Math.min(PAGE_SIZE, maxRows), maxRows });
  if (rows.length >= maxRows) log.warn("socrata.truncated", { domain, dataset, maxRows });
  return rows;
}
