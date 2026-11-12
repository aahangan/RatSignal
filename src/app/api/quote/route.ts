import { allow, clientIp } from "@/lib/db";
import { escapeHtml, layout, sendEmail } from "@/lib/email";
import { QuoteInput, saveQuote } from "@/lib/quotes";
import { formatPhone } from "@/lib/cities";

// A restaurant asks for a pest control quote. Saved, then emailed to the admins to pass to a partner.
export async function POST(req: Request) {
  if (!(await allow(`quote:${clientIp(req)}`, 5, 3600))) {
    return Response.json({ error: "Too many requests. Please call us instead." }, { status: 429 });
  }
  const parsed = QuoteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }
  if (parsed.data.website) return Response.json({ ok: true }); // bot filled the honeypot

  const q = await saveQuote(parsed.data);
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const phone = formatPhone(q.phone.replace(/\D/g, "").slice(-10)) ?? q.phone;
  const rows: [string, string][] = [
    ["Restaurant", q.restaurant], ["Address", q.address || "–"], ["Contact", q.contactName], ["Phone", phone],
    ["Email", q.email || "–"], ["Pests", q.pests.join(", ") || "not specified"], ["Re-inspection", q.timing],
    ["City record", q.camis ? `https://data.cityofnewyork.us/resource/43nn-pn8j.json?camis=${q.camis}` : "–"],
  ];
  const html = layout(`<p><b>New quote request</b>. Pass it to a partner today.</p>
    <table cellpadding="4">${rows.map(([k, v]) => `<tr><td style="color:#71717a">${k}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>`);
  await Promise.all(admins.map((to) => sendEmail(to, `Quote request: ${q.restaurant}`, html).catch(() => {})));
  return Response.json({ ok: true });
}
