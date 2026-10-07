// Shared connector for city open-data portals running Socrata (SODA 2.1 / SoQL).
import { log } from "../log";
import { HttpError, withRetry } from "../retry";

export type Row = Record<string, string | undefined>;

export type QueryOptions = {
  /** Seconds Next.js may cache the response; ignored when `fresh` is set. */
  revalidate?: number;
  /** Bypass caches (used by the daily run so it always sees the newest records). */
  fresh?: boolean;
  timeoutMs?: number;
  retries?: number;
};

export function socrataUrl(domain: string, dataset: string, params: Record<string, string>) {
  return `https://${domain}/resource/${dataset}.json?${new URLSearchParams(params)}`;
}

export async function socrataQuery(domain: string, dataset: string, params: Record<string, string>, opts: QueryOptions = {}): Promise<Row[]> {
  const url = socrataUrl(domain, dataset, params);
  const headers: Record<string, string> = {};
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const caching = opts.fresh ? { cache: "no-store" as const } : { next: { revalidate: opts.revalidate ?? 3600 } };

  return withRetry(
    async () => {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 20000), ...caching });
      if (!res.ok) throw new HttpError(res.status, `${domain}/${dataset} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = await res.json();
      if (!Array.isArray(body)) throw new HttpError(502, `${domain}/${dataset} returned a non-array body`);
      return body as Row[];
    },
    {
      retries: opts.retries ?? 3,
      onRetry: (attempt, delayMs, err) => log.warn("socrata.retry", { domain, dataset, attempt, delayMs, error: err }),
    },
  );
}

/** Columns from `required` that appear in none of the rows: a sign the feed's schema changed. */
export function missingColumns(rows: Row[], required: string[]) {
  if (!rows.length) return [];
  return required.filter((c) => !rows.some((r) => c in r));
}

export const quoteList = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",");
