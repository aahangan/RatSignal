# RatSignal

**Live: [getratsignal.com](https://getratsignal.com)** · [Live lead demo](https://getratsignal.com/demo)

Daily restaurant pest-violation leads for pest control companies. Reads city health inspection open data
(NYC and Chicago), finds establishments cited for rats, mice, roaches and flies, scores them by urgency,
and delivers them by dashboard and a 7am email.

## How it works
- `src/lib/cities.ts`: queries each city's Socrata API, keeps each establishment's latest pest citation, counts repeat citations over 12 months, computes a 0-100 heat score. Add a city by writing one adapter.
- `src/lib/db.ts`: key-value store. Upstash Redis in production, a JSON file in `.data/` locally.
- `src/lib/accounts.ts`: accounts, lead pipeline states, exclusive zip locks, login cookie.
- Stripe Checkout (7-day trial) creates the account; the webhook keeps its status in sync. Exclusive zips are a per-zip subscription item.
- `src/app/api/cron/digest`: daily email, triggered by Vercel Cron (`vercel.json`, 11:00 UTC ≈ 7am ET).
- `src/lib/outreach.ts`: AI drafts a call script, email and letter from the actual inspection notes.

## Run locally
```
cp .env.example .env.local   # only SESSION_SECRET is required locally
npm install && npm run dev
```
Without Stripe keys, signing up creates a free development account so you can use the dashboard.
Without Resend, login links are printed to the server console.
