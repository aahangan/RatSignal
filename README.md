# RatSignal

**Live: [getratsignal.com](https://getratsignal.com)** · [Live lead demo](https://getratsignal.com/demo)

Daily lead service for local service businesses. It reads city restaurant-inspection open data (NYC and
Chicago), finds establishments cited for problems a given trade can fix, scores them by urgency, and delivers
them through a dashboard and a 7am email.

Two lead products ("verticals") run on the same engine today:

| Vertical | Sold to | Built from |
|---|---|---|
| `vermin` | Pest control companies | Citations for rats, mice, roaches, flies |
| `grease` | Grease-trap pumpers, drain cleaners, commercial plumbers | Citations for drainage, sewage, plumbing, grease traps |

## Architecture

```
src/verticals/*.ts        one config file per vertical (validated with Zod)
src/engine/schema.ts      config schema + Lead type
src/engine/sources/       data-source adapters (Socrata open-data portals today)
src/engine/normalize.ts   rows -> leads: filtering, field mapping, de-duplication, scoring (pure, unit tested)
src/engine/leads.ts       fetch + normalize for one vertical and city
src/engine/run.ts         the daily delivery run: idempotent, time-boxed, per-source isolation, alerts
src/engine/retry.ts       retries with exponential backoff and jitter
src/engine/log.ts         structured JSON logs
src/lib/runtime.ts        wires the run to Redis, the feeds and email
```

### Adding a vertical
Create `src/verticals/<id>.ts` with `defineVertical({...})`: the data source per city, the filter (violation
codes, or text patterns for feeds that store violations as text), how columns map to lead fields, the
de-duplication key, category labels and scoring weights, and the email and outreach copy. Register it in
`src/verticals/index.ts`. The config is validated when it loads, so mistakes fail the tests instead of production.

### The daily run
`/api/cron/digest` is called by Vercel Cron at 11:00 UTC (about 7am New York).
- **Safe re-runs:** each account is claimed once per date in Redis and every delivered lead is remembered, so running twice, or backfilling, never sends duplicates. A failed send releases its claim so a re-run can retry.
- **Isolation:** each (vertical, city) feed is fetched once and independently; one broken feed only affects its own customers.
- **Limits:** Socrata requests time out after 20s and retry up to 3 times with backoff; the whole run stops after 4 minutes and reports which accounts it didn't reach.
- **Monitoring:** structured logs for every step, plus email alerts to `ADMIN_EMAILS` when a feed returns zero rows, a feed's columns change, a feed fails, or a run is partial or fails. Recent runs are shown on `/admin`.

Backfill missed days (skips days that already completed unless `--force`):
```
RATSIGNAL_ADMIN_SECRET=... npm run backfill -- --from 2026-10-01 --to 2026-10-05 [--dry-run]
```

## Development
```
cp .env.example .env.local   # only SESSION_SECRET is required locally
npm install
npm run dev
npm test                     # Vitest unit tests
npm run lint && npm run typecheck
```
Without Stripe keys, signing up creates a free development account. Without Resend, emails are printed to the
server console. Locally, data is stored in `.data/db.json` instead of Redis.

CI (GitHub Actions) runs lint, typecheck, tests and a production build on every push.

## Stack
Next.js, TypeScript, Stripe, Upstash Redis, Resend, Zod, Vitest, NYC and Chicago open data (Socrata).
