import { describe, expect, it } from "vitest";
import { VerticalSchema } from "../engine/schema";
import { getVertical, VERTICAL_IDS, VERTICALS } from ".";
import { vermin } from "./vermin";

describe("vertical configs", () => {
  it.each(VERTICAL_IDS)("%s is a valid config", (id) => {
    expect(() => VerticalSchema.parse(VERTICALS[id])).not.toThrow();
  });

  it("falls back to the default vertical for unknown or missing ids", () => {
    expect(getVertical(undefined).id).toBe("vermin");
    expect(getVertical("nope").id).toBe("vermin");
    expect(getVertical("grease").id).toBe("grease");
  });

  const base = structuredClone(vermin);

  it("rejects a code that maps to an unknown category", () => {
    const bad = structuredClone(base);
    if (bad.sources.nyc?.filter.mode === "codes") bad.sources.nyc.filter.codes["99Z"] = "unicorns";
    expect(() => VerticalSchema.parse(bad)).toThrow(/unknown category.*unicorns/);
  });

  it("rejects an invalid regex in a text rule", () => {
    const bad = structuredClone(base);
    if (bad.sources.chicago?.filter.mode === "text") bad.sources.chicago.filter.rules.push({ category: "rats", pattern: "(unclosed", unlessAny: [] });
    expect(() => VerticalSchema.parse(bad)).toThrow(/invalid regex/);
  });

  it("rejects a column name that isn't a valid Socrata column", () => {
    const bad = structuredClone(base);
    bad.sources.nyc!.fields.zip = "zip code; drop";
    expect(() => VerticalSchema.parse(bad)).toThrow();
  });

  it("requires the dedupe key to include the lead id", () => {
    expect(() => VerticalSchema.parse({ ...base, dedupeKey: "{date}" })).toThrow(/\{id\}/);
  });
});
