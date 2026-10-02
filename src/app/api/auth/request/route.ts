import { z } from "zod";
import { findAccountByEmail } from "@/lib/accounts";
import { allow, clientIp } from "@/lib/db";
import { layout, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/leads";
import { seal } from "@/lib/seal";

const Body = z.object({ email: z.email().max(254) });
export type LoginToken = { aid: string; exp: number };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  if (!(await allow(`login:${clientIp(req)}`, 10, 3600)) || !(await allow(`login:${email}`, 5, 3600))) {
    return Response.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
  }

  // Same response whether or not the account exists, so the form can't reveal who's a customer.
  const account = await findAccountByEmail(email);
  if (account) {
    const token = seal({ aid: account.id, exp: Date.now() + 15 * 60 * 1000 } satisfies LoginToken);
    const link = `${siteUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
    await sendEmail(
      email,
      "Your RatSignal login link",
      layout(`<p>Tap below to log in. The link expires in 15 minutes.</p>
        <p><a href="${link}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Log in to RatSignal</a></p>
        <p style="color:#71717a;font-size:13px">If you didn't ask for this, ignore it.</p>`),
    );
    if (process.env.NODE_ENV !== "production") console.log(`[dev] login link for ${email}: ${link}`);
  }
  return Response.json({ ok: true });
}
