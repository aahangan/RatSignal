import { defineVertical } from "../engine/schema";

/** Restaurants cited for drainage, sewage, plumbing and grease-trap problems, sold to grease-trap
 *  pumpers, drain cleaners and commercial plumbers. */
export const grease = defineVertical({
  id: "grease",
  name: "Restaurant grease & drain leads",
  audience: "grease-trap pumping, drain cleaning and plumbing companies",
  noun: { singular: "drain or sewage citation", plural: "drain and sewage citations" },
  categories: {
    sewage: { label: "Sewage", weight: 35 },
    greaseTrap: { label: "Grease trap", weight: 35 },
    drainage: { label: "Drainage / plumbing", weight: 25 },
    backflow: { label: "Backflow device", weight: 20 },
    plumbing: { label: "Plumbing", weight: 20 },
  },
  flags: {
    repairOrdered: { label: "REPAIR ORDERED", weight: 8 },
  },
  dedupeKey: "{id}:{date}",
  sources: {
    nyc: {
      type: "socrata",
      domain: "data.cityofnewyork.us",
      dataset: "43nn-pn8j",
      filter: {
        mode: "codes",
        field: "violation_code",
        // 10B: plumbing not maintained, floors not drained, sewage system in disrepair, no backflow device
        // 05A: sewage disposal system improper; 04F: food areas contaminated by sewage or liquid waste
        codes: { "10B": "drainage", "05A": "sewage", "04F": "sewage" },
      },
      fields: {
        id: ["camis"],
        name: ["dba"],
        address: ["building", "street", "boro"],
        zip: "zipcode",
        date: "inspection_date",
        phone: "phone",
        category: "cuisine_description",
        lat: "latitude",
        lng: "longitude",
        inspectionType: "inspection_type",
        notes: "violation_description",
        closed: { field: "action", containsAny: ["closed by", "re-closed"] },
        failed: { field: "score", gte: 28 },
      },
      requiredColumns: ["camis", "dba", "zipcode", "inspection_date", "violation_code", "action"],
      minWeeklyLeads: 20,
      rowLimit: 20000,
    },
    chicago: {
      type: "socrata",
      domain: "data.cityofchicago.org",
      dataset: "4ijn-s7e5",
      filter: {
        mode: "text",
        field: "violations",
        where: ["%51. PLUMBING%", "%GREASE TRAP%", "%GREASE INTERCEPTOR%"],
        items: [{ includes: "51. PLUMBING" }, { commentPattern: "GREASE (TRAP|INTERCEPTOR)" }],
        rules: [
          { category: "greaseTrap", pattern: "GREASE (TRAP|INTERCEPTOR)" },
          { category: "sewage", pattern: "SEWAGE|SEWER" },
          { category: "backflow", pattern: "BACKFLOW|SIPHON|AIR GAP" },
          { category: "drainage", pattern: "DRAIN|CLOG|STANDING WATER|LEAK" },
        ],
        fallbackCategory: "plumbing",
        flags: [{ flag: "repairOrdered", pattern: "INSTRUCTED TO (REPAIR|FIX|INSTALL|PROVIDE)" }],
      },
      fields: {
        id: ["license_"],
        idFallback: "inspection_id",
        invalidIds: ["0"],
        name: ["aka_name", "dba_name"],
        address: ["address"],
        zip: "zip",
        date: "inspection_date",
        category: "facility_type",
        lat: "latitude",
        lng: "longitude",
        inspectionType: "inspection_type",
        failed: { field: "results", equals: "Fail" },
      },
      requiredColumns: ["license_", "dba_name", "zip", "inspection_date", "results", "violations"],
      minWeeklyLeads: 3,
      rowLimit: 5000,
    },
  },
  email: {
    subject: "{count} new {noun} in your area",
    intro: "Good morning, {company}. New {nouns} at restaurants in {city}, most urgent first:",
  },
  outreach: {
    seller: "a local grease-trap pumping, drain cleaning or commercial plumbing company",
    situation: "a restaurant (or other food business) that was recently cited in a public health inspection for drainage, plumbing, sewage or grease-trap problems",
    goal: "get a callback or a booked service visit before the business's re-inspection",
    offers: "fast scheduling (e.g. next-day pumping or drain service), after-hours visits so the kitchen isn't disrupted, and a recurring maintenance schedule",
  },
});
