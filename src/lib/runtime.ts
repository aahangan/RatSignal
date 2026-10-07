// Wires the daily run to the real database, open-data feeds and email.
import { fetchLeads } from "@/engine/leads";
import { log } from "@/engine/log";
import { type RunDeps, runDaily } from "@/engine/run";
import { getVertical } from "@/verticals";
import { type Account, isLive, listAccounts, saveAccount, zipsLockedByOthers } from "./accounts";
import { alert } from "./alerts";
import { db } from "./db";
import { digestEmail } from "./digest";
import { sendEmail } from "./email";

export function liveDeps(site: string): RunDeps<Account> {
  return {
    store: { get: db.get, set: db.set, claim: db.claim, del: db.del },
    accounts: listAccounts,
    isLive,
    vertical: getVertical,
    fetchSource: (v, city, asOf) => fetchLeads(v, city, { zips: [], days: 7, asOf, fresh: true }),
    hiddenZips: zipsLockedByOthers,
    saveAccount,
    sendDigest: async (account, leads, v) => {
      const email = digestEmail(account, leads, v, site);
      await sendEmail(account.email, email.subject, email.html);
    },
    alert,
    log,
    now: Date.now,
  };
}

/** Today's date in New York, where the 7am email is scheduled. */
export function todayNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export const runFor = (date: string, site: string, opts: { dryRun?: boolean }) => runDaily(date, liveDeps(site), opts);
