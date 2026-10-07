import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "RatSignal <alerts@getratsignal.com>";

export function emailConfigured() {
  return resend !== null;
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[email disabled] to=${to} subject=${subject}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(error.message);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layout(body: string) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto;padding:24px;color:#18181b">
  <div style="font-weight:800;font-size:18px;margin-bottom:16px">Rat<span style="color:#e11d48">Signal</span></div>
  ${body}
  <p style="color:#71717a;font-size:12px;margin-top:32px">Source: public city health inspection records.</p>
</div>`;
}
