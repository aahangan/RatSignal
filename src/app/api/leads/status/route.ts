import { z } from "zod";
import { currentAccount, setLeadState } from "@/lib/accounts";

const Body = z.object({
  leadId: z.string().max(100),
  status: z.enum(["new", "called", "quoted", "won", "lost"]),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { leadId, status, note } = parsed.data;
  await setLeadState(account.id, leadId, { status, note, updatedAt: Date.now() });
  return Response.json({ ok: true });
}
