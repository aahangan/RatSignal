// Mails a postcard to each NYC restaurant newly cited for pests, linking to its pre-filled quote page.
//
//   npx tsx scripts/postcards.mts [--days 3] [--max 20] [--send]
//
// Without --send (or without LOB_API_KEY) it only prints what it would mail. With a Lob *test* key,
// Lob renders proofs but mails nothing; a live key mails real cards. Already-mailed restaurants are
// skipped using outreach/postcards-sent.csv.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import QRCode from "qrcode";
import { fetchLeads } from "../src/engine/leads";
import { getVertical } from "../src/verticals";
import { encodeCode } from "../src/lib/quotes";

const args = process.argv.slice(2);
const num = (flag: string, d: number) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : d; };
const DAYS = num("--days", 3);
const MAX = num("--max", 20);
const SEND = args.includes("--send");
const LOB_KEY = process.env.LOB_API_KEY ?? "";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getratsignal.com";
const LEDGER = new URL("../outreach/postcards-sent.csv", import.meta.url).pathname;
const FROM = { name: "RatSignal", address_line1: "330 De Neve Drive", address_city: "Los Angeles", address_state: "CA", address_zip: "90024" };

// Chains have corporate pest contracts; a local owner is who reads the mail and decides.
const CHAINS = /\b(mcdonald|subway|dunkin|starbucks|burger king|wendy|popeyes|kfc|taco bell|chipotle|domino|papa john|pizza hut|panera|chick-fil-a|shake shack|sweetgreen|le pain quotidien|chuck e\. cheese|ihop|potbelly|paris baguette|insomnia cookies|checkers|white castle|applebee|crumbl|playa bowls|just salad|dig inn|pret a manger|five guys|baskin|krispy|wingstop|jamba|tim hortons|7-eleven)\b/i;

const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s/&(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });

const mailed = new Set(existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").map((l) => l.split(",")[0]).filter(Boolean) : []);
const { leads } = await fetchLeads(getVertical("vermin"), "nyc", { days: DAYS, zips: [], fresh: true });
const picks = leads
  .filter((l) => !mailed.has(l.id) && !CHAINS.test(l.name) && l.address && l.zip)
  .sort((a, b) => b.heat - a.heat)
  .slice(0, MAX);

console.log(`${leads.length} cited in the last ${DAYS} days; ${picks.length} to mail (max ${MAX}); ${SEND && LOB_KEY ? (LOB_KEY.startsWith("test_") ? "Lob TEST mode (proofs only)" : "LIVE mailing") : "dry run"}`);

for (const l of picks) {
  const camis = l.id.replace("nyc:", "");
  const code = encodeCode(camis)!;
  const url = `${SITE}/q/${code}`;
  const name = title(l.name);
  const pests = l.categories.filter((c) => c !== "conditions").join(" and ") || "pests";
  const street = title(l.address.replace(/\s+(Manhattan|Brooklyn|Queens|Bronx|Staten Island)$/i, ""));
  const boro = (l.address.match(/(Manhattan|Brooklyn|Queens|Bronx|Staten Island)$/i)?.[1] ?? "New York");
  const city = boro === "Manhattan" ? "New York" : boro;
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 300 });

  const front = `<html><body style="margin:0;width:6.25in;height:4.25in;font-family:Helvetica,Arial,sans-serif;background:#18181b;color:#fff">
  <div style="padding:0.45in 0.5in">
    <div style="font-size:16px;font-weight:800;letter-spacing:0.5px">Rat<span style="color:#f43f5e">Signal</span></div>
    <div style="margin-top:0.35in;font-size:34px;font-weight:800;line-height:1.1">Re-inspection coming?<br>Don't fail it twice.</div>
    <div style="margin-top:0.2in;font-size:16px;line-height:1.4;color:#d4d4d8">${esc(name)} was cited for ${esc(pests)} on ${fmtDate(l.date)}.<br>Get a free quote from a licensed NYC exterminator.</div>
  </div></body></html>`;
  const back = `<html><body style="margin:0;width:6.25in;height:4.25in;font-family:Helvetica,Arial,sans-serif;color:#18181b">
  <div style="position:absolute;left:0.4in;top:0.4in;width:2.9in">
    <div style="font-size:17px;font-weight:800;line-height:1.2">Free pest control quote before your re-inspection</div>
    <div style="margin-top:10px;font-size:11.5px;line-height:1.45">Scan the code or visit the link. It takes 20 seconds, and a licensed, insured NYC pest control company that handles Health Department re-inspections will call you within one business day. No obligation.</div>
    <img src="${qr}" style="margin-top:12px;width:1.1in;height:1.1in">
    <div style="margin-top:6px;font-size:12px;font-weight:700">${url.replace("https://", "")}</div>
    <div style="margin-top:10px;font-size:7.5px;color:#71717a;line-height:1.3">RatSignal is independent and not affiliated with the NYC Department of Health. Citation details come from public city inspection records.</div>
  </div></body></html>`;

  const to = { name: "Owner or Manager", company: name.slice(0, 40), address_line1: street.slice(0, 64), address_city: city, address_state: "NY", address_zip: l.zip };
  console.log(`- ${name} | ${street}, ${city} ${l.zip} | cited ${l.date} for ${pests}${l.closed ? " | CLOSED" : ""} | heat ${l.heat} | ${url}`);
  if (!SEND || !LOB_KEY) continue;

  const res = await fetch("https://api.lob.com/v1/postcards", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${LOB_KEY}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ description: `RatSignal ${camis}`, to, from: FROM, front, back, size: "4x6", use_type: "marketing", metadata: { camis } }),
  });
  const body = await res.json();
  if (!res.ok) { console.log(`  ! Lob error: ${body?.error?.message ?? res.status}`); continue; }
  console.log(`  mailed: ${body.id} expected ${body.expected_delivery_date ?? "?"} proof ${body.url ?? ""}`);
  if (!LOB_KEY.startsWith("test_")) appendFileSync(LEDGER, `${l.id},${new Date().toISOString().slice(0, 10)},${body.id},${code}\n`);
}
