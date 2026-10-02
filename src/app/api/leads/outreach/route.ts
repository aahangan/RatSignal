import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentAccount, isLive } from "@/lib/accounts";
import { CITY_IDS } from "@/lib/cities";
import { allow } from "@/lib/db";
import { draftOutreach, OutreachError } from "@/lib/outreach";

export const maxDuration = 60;

// The client sends the lead it's looking at. It only shapes the draft text, so trusting it is fine.
const LeadInput = z.object({
  id: z.string().max(100),
  city: z.enum(CITY_IDS as [string, ...string[]]),
  name: z.string().max(200),
  address: z.string().max(300),
  zip: z.string().max(10),
  category: z.string().max(100).optional(),
  date: z.string().max(20),
  inspectionType: z.string().max(200).optional(),
  pests: z.array(z.enum(["rats", "mice", "rodents", "roaches", "flies", "other", "conditions"])).max(10),
  notes: z.array(z.string().max(600)).max(10),
  closed: z.boolean(),
  failed: z.boolean(),
  pestControlOrdered: z.boolean(),
  priorCitations: z.number().int().min(0).max(100),
  heat: z.number(),
});

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account || !isLive(account)) return Response.json({ error: "Not signed in" }, { status: 401 });
  const parsed = LeadInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid lead" }, { status: 400 });
  if (!(await allow(`outreach:${account.id}`, 100, 86400))) {
    return Response.json({ error: "Daily drafting limit reached (100). It resets tomorrow." }, { status: 429 });
  }

  try {
    const draft = await draftOutreach(parsed.data as Parameters<typeof draftOutreach>[0], account.company);
    return Response.json({ draft });
  } catch (err) {
    if (err instanceof OutreachError) return Response.json({ error: err.message }, { status: 422 });
    if (err instanceof Anthropic.RateLimitError) return Response.json({ error: "Busy right now. Try again in a moment." }, { status: 429 });
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic error", err.status, err.message);
      return Response.json({ error: "Drafting failed. Try again." }, { status: 502 });
    }
    throw err;
  }
}
