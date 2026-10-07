import { getLeads } from "@/engine/leads";
import { type Account, accountVertical, zipsLockedByOthers } from "./accounts";
import type { Lead } from "./cities";

/** Leads in the account's service area, minus zips another company holds exclusively. */
export async function leadsForAccount(account: Account, opts: { days: number; includeOptional?: boolean }): Promise<Lead[]> {
  const leads = await getLeads(accountVertical(account), account.city, { zips: account.zips, days: opts.days, includeOptional: opts.includeOptional });
  const hidden = await zipsLockedByOthers(account, [...new Set(leads.map((l) => l.zip))]);
  return hidden.size ? leads.filter((l) => !hidden.has(l.zip)) : leads;
}

export function siteUrl(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}
