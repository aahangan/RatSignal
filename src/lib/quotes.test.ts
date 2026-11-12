import { describe, expect, it } from "vitest";
import { decodeCode, encodeCode, QuoteInput } from "./quotes";

describe("restaurant codes", () => {
  it("round-trips a CAMIS id", () => {
    const code = encodeCode("50131932")!;
    expect(code).toMatch(/^[0-9a-z]+$/);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(decodeCode(code)).toBe("50131932");
    expect(decodeCode(code.toUpperCase())).toBe("50131932");
  });

  it("rejects junk", () => {
    expect(encodeCode("abc")).toBeNull();
    expect(decodeCode("../etc")).toBeNull();
    expect(decodeCode("")).toBeNull();
  });
});

describe("quote input", () => {
  const ok = { restaurant: "Houston Hall", contactName: "Sam", phone: "(212) 675-9323", consent: true };
  it("accepts a minimal request", () => {
    const r = QuoteInput.safeParse(ok);
    expect(r.success).toBe(true);
  });
  it("requires consent and a real phone", () => {
    expect(QuoteInput.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(QuoteInput.safeParse({ ...ok, phone: "12" }).success).toBe(false);
  });
  it("keeps the honeypot value so the route can drop bots silently", () => {
    const r = QuoteInput.safeParse({ ...ok, website: "spam" });
    expect(r.success && r.data.website).toBe("spam");
  });
});
