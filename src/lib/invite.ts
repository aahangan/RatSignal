import { type Account, createAccount, findAccountByEmail, saveAccount } from "./accounts";
import { CITIES, type CityId } from "./cities";
import { escapeHtml, layout, sendEmail } from "./email";
import { seal } from "./seal";

export type InviteInput = {
  email: string;
  name?: string;
  company: string;
  city: CityId;
  zips: string[];
  days: number;
};

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

export function inviteEmail(input: InviteInput, endsAt: number, link: string) {
  const area = input.zips.length ? input.zips.join(", ") : `all of ${CITIES[input.city].name}`;
  const hi = input.name?.trim() ? `Hi ${input.name.trim()},` : `Hi ${input.company} team,`;
  const subject = `Your RatSignal access for ${input.zips.length ? input.zips.join(", ") : CITIES[input.city].short} is ready`;
  const paras = [
    "As promised, here's your free access to RatSignal.",
    `Starting tomorrow, you'll get an email at 7am every morning with any restaurants in ${area} newly cited for pests, ranked by urgency, with phone numbers.`,
    "You also have a dashboard with every recent citation in your area, where you can mark who you've called and get a ready-to-use call script for any restaurant.",
  ];
  const after = [
    `The button works for 7 days. After that, log in anytime at getratsignal.com/login with this email address.`,
    `Your free trial runs until ${fmtDate(endsAt)}. No card on file and nothing to cancel.`,
    "Questions or ideas? Just reply to this email.",
  ];
  const html = layout(`
    <p>${escapeHtml(hi)}</p>
    ${paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    <p><a href="${link}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open my dashboard</a></p>
    ${after.map((p) => `<p style="color:#52525b;font-size:14px">${escapeHtml(p)}</p>`).join("")}
    <p>Aahan Gandhi<br>RatSignal · getratsignal.com</p>`);
  const text = [hi, ...paras, `Open my dashboard: ${link}`, ...after, "Aahan Gandhi\nRatSignal · getratsignal.com"].join("\n\n");
  return { subject, html, text };
}

/** Creates (or converts) a free pilot account and, unless previewing, emails the invite. */
export async function invite(input: InviteInput, site: string, opts: { send: boolean; replyTo?: string }) {
  const endsAt = Date.now() + input.days * 24 * 60 * 60 * 1000;
  const existing = await findAccountByEmail(input.email);
  if (existing && ["active", "trialing", "past_due"].includes(existing.status)) {
    throw new Error("That email already has a paid account.");
  }

  if (!opts.send) {
    return { account: null, email: inviteEmail(input, endsAt, `${site}/api/auth/verify?token=PREVIEW`) };
  }

  let account: Account;
  if (existing) {
    Object.assign(existing, { company: input.company, city: input.city, zips: input.zips, status: "pilot", pilotEndsAt: endsAt, digest: true });
    await saveAccount(existing);
    account = existing;
  } else {
    account = await createAccount({ email: input.email, company: input.company, city: input.city, zips: input.zips, status: "pilot", pilotEndsAt: endsAt });
  }
  const token = seal({ aid: account.id, exp: Date.now() + LINK_TTL_MS });
  const email = inviteEmail(input, endsAt, `${site}/api/auth/verify?token=${encodeURIComponent(token)}`);
  await sendEmail(account.email, email.subject, email.html, { replyTo: opts.replyTo, text: email.text });
  return { account, email };
}
