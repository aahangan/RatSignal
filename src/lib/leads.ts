import { type Account, zipsLockedByOthers } from "./accounts";
import { getLeads, type Lead } from "./cities";

/** Leads in the account's service area, minus zips another company holds exclusively. */
export async function leadsForAccount(account: Account, opts: { days: number; includeConditions?: boolean }): Promise<Lead[]> {
  const leads = await getLeads({ city: account.city, zips: account.zips, days: opts.days, includeConditions: opts.includeConditions });
  const hidden = await zipsLockedByOthers(account, [...new Set(leads.map((l) => l.zip))]);
  return hidden.size ? leads.filter((l) => !hidden.has(l.zip)) : leads;
}

export function siteUrl(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}
