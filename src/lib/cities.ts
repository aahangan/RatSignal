// City-level helpers shared by every vertical. Lead logic lives in src/engine.
import type { CityId } from "@/engine/schema";

export { CITY_IDS, type CityId, type Lead } from "@/engine/schema";

export const CITIES: Record<CityId, { name: string; short: string; zip: RegExp }> = {
  nyc: { name: "New York City", short: "NYC", zip: /^(100|101|102|103|104|110|111|112|113|114|116)\d\d$/ },
  chicago: { name: "Chicago", short: "Chicago", zip: /^(606|607|608)\d\d$/ },
};

export function normalizeZips(city: CityId, raw: string | string[]): { zips: string[]; invalid: string[] } {
  const parts = (Array.isArray(raw) ? raw : raw.split(/[\s,;]+/)).map((z) => z.trim()).filter(Boolean);
  const zips = [...new Set(parts.filter((z) => CITIES[city].zip.test(z)))].sort();
  const invalid = parts.filter((z) => !CITIES[city].zip.test(z));
  return { zips, invalid };
}

export function formatPhone(digits?: string) {
  if (!digits) return undefined;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskPhone(digits?: string) {
  if (!digits) return undefined;
  return `(${digits.slice(0, 3)}) •••-••${digits.slice(8)}`;
}
