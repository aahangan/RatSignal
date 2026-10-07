import { log } from "@/engine/log";
import { db } from "./db";
import { escapeHtml, layout, sendEmail } from "./email";

/** Emails the admins once per alert key (keys include the date, so each problem alerts once a day). */
export async function alert(key: string, subject: string, details: Record<string, unknown>) {
  log.warn("alert", { key, subject, ...details });
  const to = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!to.length || !(await db.claim(`alert:${key}`, String(Date.now())))) return;
  try {
    await Promise.all(
      to.map((addr) =>
        sendEmail(addr, `[RatSignal alert] ${subject}`, layout(`<p><b>${escapeHtml(subject)}</b></p><pre style="font-size:12px;white-space:pre-wrap">${escapeHtml(JSON.stringify(details, null, 2))}</pre>`)),
      ),
    );
  } catch (err) {
    log.error("alert.send_failed", { key, error: err });
  }
}
