import type { Lead, Vertical } from "@/engine/schema";
import type { Account } from "./accounts";
import { CITIES, formatPhone } from "./cities";
import { escapeHtml, layout } from "./email";

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function leadRow(l: Lead, v: Vertical) {
  const phone = formatPhone(l.phone);
  const labels = l.categories.map((c) => v.categories[c]?.label ?? c).join(", ");
  return `<tr>
    <td style="padding:10px 8px;border-top:1px solid #e4e4e7;vertical-align:top">
      <b>${escapeHtml(l.name)}</b>${l.closed ? ' <span style="color:#e11d48;font-weight:700">CLOSED</span>' : ""}<br>
      <span style="color:#52525b">${escapeHtml(l.address)} ${escapeHtml(l.zip)}</span><br>
      ${phone ? `<a href="tel:${l.phone}" style="color:#18181b">${phone}</a> · ` : ""}${escapeHtml(labels)}
      ${l.priorCitations ? ` · <b>${l.priorCitations} prior</b>` : ""}
    </td>
    <td style="padding:10px 8px;border-top:1px solid #e4e4e7;vertical-align:top;text-align:right;font-weight:800;color:${l.heat >= 60 ? "#e11d48" : "#18181b"}">${l.heat}</td>
  </tr>`;
}

/** The morning email for one account, built from the vertical's template. */
export function digestEmail(account: Account, leads: Lead[], v: Vertical, site: string) {
  const top = leads.slice(0, 25);
  const vars = {
    count: leads.length,
    noun: leads.length === 1 ? v.noun.singular : v.noun.plural,
    nouns: v.noun.plural,
    city: CITIES[account.city].name,
    company: account.company,
  };
  return {
    subject: fill(v.email.subject, vars),
    html: layout(`<p>${escapeHtml(fill(v.email.intro, vars))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${top.map((l) => leadRow(l, v)).join("")}</table>
      ${leads.length > top.length ? `<p>+ ${leads.length - top.length} more in your dashboard.</p>` : ""}
      <p><a href="${site}/dashboard" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a></p>`),
  };
}
