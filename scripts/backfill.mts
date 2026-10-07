export {};

// Re-runs the daily delivery for missed days. Safe to repeat: leads are never sent twice.
//
//   RATSIGNAL_ADMIN_SECRET=... node --experimental-strip-types scripts/backfill.mts --from 2026-10-01 --to 2026-10-05 [--dry-run] [--force]
//
// Days whose run already completed are skipped unless --force is given.

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = arg("from");
const to = arg("to") ?? from;
const site = arg("url") ?? process.env.RATSIGNAL_URL ?? "https://getratsignal.com";
const secret = process.env.RATSIGNAL_ADMIN_SECRET;
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !secret) {
  console.error("Usage: RATSIGNAL_ADMIN_SECRET=... node --experimental-strip-types scripts/backfill.mts --from YYYY-MM-DD [--to YYYY-MM-DD] [--dry-run] [--force] [--url https://...]");
  process.exit(1);
}

const days: string[] = [];
for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
  days.push(d.toISOString().slice(0, 10));
}

let failures = 0;
for (const date of days) {
  const params = new URLSearchParams({ date, ...(dryRun ? { dryRun: "1" } : {}), ...(force ? { force: "1" } : {}) });
  const res = await fetch(`${site}/api/cron/digest?${params}`, { headers: { authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) failures++;
  if (body.skipped) console.log(`${date}: skipped (${body.skipped})`);
  else if (body.report) {
    const a = body.report.accounts;
    console.log(`${date}: ${body.report.status}${dryRun ? " (dry run)" : ""}: sent ${a.sent}/${a.eligible}, nothing new ${a.noNewLeads}, already sent ${a.alreadySent}, failed ${a.failed}`);
    for (const e of body.report.errors ?? []) console.log(`   error: ${e}`);
  } else console.log(`${date}: HTTP ${res.status} ${JSON.stringify(body)}`);
}
process.exit(failures ? 1 : 0);
