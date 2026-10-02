import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CITIES, PEST_LABELS, type Lead } from "./cities";

export const Outreach = z.object({
  callScript: z.string().describe("A natural 30-45 second phone opener plus 2-3 likely objections with short answers"),
  email: z.object({ subject: z.string(), body: z.string() }),
  letter: z.string().describe("A short printed letter to drop off or mail, under 180 words"),
});
export type Outreach = z.infer<typeof Outreach>;

const SYSTEM = `You write sales outreach for a local pest control company contacting a restaurant (or other food business) that was recently cited for pests in a public health inspection.

Goals: get a callback or a booked inspection before the business's re-inspection.

Rules:
- Be helpful and matter-of-fact, never shaming or alarmist. Owners are stressed; position the company as the fast, discreet fix.
- You may mention that the citation is public record, but lead with the help you offer, not with "we saw you failed".
- Use only facts from the provided inspection details. Don't invent dates, prices, guarantees, certifications or regulations.
- Mention speed (e.g. same-week service) and discretion (unmarked vehicle, after-hours visits) as offers, phrased so the company can edit them.
- Use placeholders in square brackets for anything you don't know: [Your Name], [Phone], [Offer].
- Plain text only. Keep everything short enough to actually be read.`;

let client: Anthropic | null = null;

export class OutreachError extends Error {}

export async function draftOutreach(lead: Lead, company: string): Promise<Outreach> {
  if (!process.env.ANTHROPIC_API_KEY) throw new OutreachError("Outreach drafting isn't configured yet (missing ANTHROPIC_API_KEY).");
  client ??= new Anthropic();

  const details = [
    `Pest control company: ${company}`,
    `Business: ${lead.name}${lead.category ? ` (${lead.category})` : ""}`,
    `Address: ${lead.address}, ${CITIES[lead.city].name} ${lead.zip}`,
    `Inspection date: ${lead.date}${lead.inspectionType ? ` (${lead.inspectionType})` : ""}`,
    `Pests cited: ${lead.pests.map((p) => PEST_LABELS[p]).join(", ")}`,
    lead.closed ? "The health department closed the establishment at this inspection." : null,
    lead.priorCitations ? `Pest citations at ${lead.priorCitations} other inspection(s) in the prior 12 months.` : null,
    lead.pestControlOrdered ? "The inspector instructed them to bring in a pest control service." : null,
    `Inspector notes:\n${lead.notes.slice(0, 4).map((n) => `- ${n}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Outreach) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Write the call script, email and letter for this lead.\n\n${details}` }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new OutreachError("Couldn't draft outreach for this lead. Try again.");
  }
  return response.parsed_output;
}
