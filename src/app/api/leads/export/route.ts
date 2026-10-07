import { accountVertical, currentAccount, getLeadStates, isLive } from "@/lib/accounts";
import { formatPhone } from "@/lib/cities";
import { leadsForAccount } from "@/lib/leads";

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const account = await currentAccount();
  if (!account || !isLive(account)) return new Response("Not signed in", { status: 401 });
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 1), 365);
  const v = accountVertical(account);
  const [leads, states] = await Promise.all([leadsForAccount(account, { days }), getLeadStates(account.id)]);

  const header = ["Heat", "Name", "Address", "Zip", "Phone", "Type", "Inspection date", "Citation types", "Closed", "Prior citations (12 mo)", "Status", "Note"];
  const rows = leads.map((l) => [
    l.heat, l.name, l.address, l.zip, formatPhone(l.phone) ?? "", l.category ?? "", l.date,
    l.categories.map((c) => v.categories[c]?.label ?? c).join("; "), l.closed ? "yes" : "", l.priorCitations,
    states[l.id]?.status ?? "new", states[l.id]?.note ?? "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ratsignal-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
