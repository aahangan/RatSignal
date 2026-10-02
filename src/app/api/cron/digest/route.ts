import { isLive, listAccounts, saveAccount, type Account } from "@/lib/accounts";
import { CITIES, formatPhone, PEST_LABELS, type Lead } from "@/lib/cities";
import { escapeHtml, layout, sendEmail } from "@/lib/email";
import { leadsForAccount } from "@/lib/leads";

export const maxDuration = 300;

const SENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function leadRow(l: Lead) {
  const phone = formatPhone(l.phone);
  return `<tr>
    <td style="padding:10px 8px;border-top:1px solid #e4e4e7;vertical-align:top">
      <b>${escapeHtml(l.name)}</b>${l.closed ? ' <span style="color:#e11d48;font-weight:700">CLOSED</span>' : ""}<br>
      <span style="color:#52525b">${escapeHtml(l.address)} ${escapeHtml(l.zip)}</span><br>
      ${phone ? `<a href="tel:${l.phone}" style="color:#18181b">${phone}</a> · ` : ""}${escapeHtml(l.pests.map((p) => PEST_LABELS[p]).join(", "))}
      ${l.priorCitations ? ` · <b>${l.priorCitations} prior</b>` : ""}
    </td>
    <td style="padding:10px 8px;border-top:1px solid #e4e4e7;vertical-align:top;text-align:right;font-weight:800;color:${l.heat >= 60 ? "#e11d48" : "#18181b"}">${l.heat}</td>
  </tr>`;
}

async function digestFor(account: Account, site: string) {
  const now = Date.now();
  for (const [key, t] of Object.entries(account.sent)) if (now - t > SENT_TTL_MS) delete account.sent[key];

  const fresh = (await leadsForAccount(account, { days: 7 })).filter((l) => !account.sent[`${l.id}:${l.date}`]);
  if (!fresh.length) return 0;

  const top = fresh.slice(0, 25);
  await sendEmail(
    account.email,
    `${fresh.length} new pest citation${fresh.length === 1 ? "" : "s"} in your area`,
    layout(`<p>Good morning${account.company ? `, ${escapeHtml(account.company)}` : ""}. New pest citations in ${CITIES[account.city].name}, hottest first:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${top.map(leadRow).join("")}</table>
      ${fresh.length > top.length ? `<p>+ ${fresh.length - top.length} more in your dashboard.</p>` : ""}
      <p><a href="${site}/dashboard" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a></p>`),
  );
  for (const l of fresh) account.sent[`${l.id}:${l.date}`] = now;
  await saveAccount(account);
  return fresh.length;
}

// Vercel Cron calls this daily (see vercel.json) with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const accounts = (await listAccounts()).filter((a) => isLive(a) && a.digest);
  const results = await Promise.allSettled(accounts.map((a) => digestFor(a, site)));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("digest failed", (r as PromiseRejectedResult).reason));
  return Response.json({ accounts: accounts.length, failed: failed.length });
}
