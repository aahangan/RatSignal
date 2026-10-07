// Sample rows shaped exactly like the live NYC and Chicago inspection feeds.
import type { Row } from "../sources/socrata";

const nyc = (o: Partial<Row>): Row => ({
  camis: "1", dba: "TEST DINER", building: "10", street: "MAIN STREET", boro: "Brooklyn", zipcode: "11222",
  phone: "7185551234", cuisine_description: "American", inspection_date: "2026-10-01T00:00:00.000",
  inspection_type: "Cycle Inspection / Initial Inspection", action: "Violations were cited in the following area(s).",
  violation_code: "04L", violation_description: "Evidence of mice.", score: "20", latitude: "40.7", longitude: "-73.9",
  ...o,
});

/** Newest first, like the live query. */
export const nycRows: Row[] = [
  // Diner: two pest violations on its latest inspection, closed, plus an older inspection.
  nyc({ camis: "1", violation_code: "04L", action: "Establishment Closed by DOHMH. Violations were cited...", score: "45" }),
  nyc({ camis: "1", violation_code: "04M", violation_description: "Live roaches.", action: "Establishment Closed by DOHMH. Violations were cited...", score: "45" }),
  nyc({ camis: "1", inspection_date: "2026-06-01T00:00:00.000", violation_code: "04N" }),
  // Cafe: flies only, bad phone number.
  nyc({ camis: "2", dba: "CORNER  CAFE", phone: "N/A", violation_code: "04N", inspection_date: "2026-09-20T00:00:00.000" }),
  // Bakery: conditions only (optional category).
  nyc({ camis: "3", dba: "BAKERY", violation_code: "08A", inspection_date: "2026-09-28T00:00:00.000" }),
  // Deli: drainage problem (grease vertical).
  nyc({ camis: "4", dba: "DELI", violation_code: "10B", violation_description: "Floor not properly drained.", inspection_date: "2026-09-30T00:00:00.000" }),
];

export const nycHistory = [
  { id: "1", date: "2026-06-01T00:00:00.000" },
  { id: "1", date: "2026-03-01T00:00:00.000" },
  { id: "1", date: "2025-01-01T00:00:00.000" }, // more than a year before: ignored
  { id: "1", date: "2026-10-01T00:00:00.000" }, // the latest itself: ignored
];

const chi = (o: Partial<Row>): Row => ({
  inspection_id: "9001", license_: "500", dba_name: "TACO SPOT", aka_name: "", facility_type: "Restaurant",
  address: "100  N STATE ST", zip: "60602", inspection_date: "2026-09-29T00:00:00.000", inspection_type: "Canvass",
  results: "Fail", violations: "", ...o,
});

export const chicagoRows: Row[] = [
  chi({
    violations:
      "38. INSECTS, RODENTS, & ANIMALS NOT PRESENT - Comments: OBSERVED 30 MOUSE DROPPINGS. RECOMMENDED PEST CONTROL SERVICE. | " +
      "51. PLUMBING INSTALLED; PROPER BACKFLOW DEVICES - Comments: OBSERVED LEAKING DRAIN PIPE UNDER SINK. INSTRUCTED TO REPAIR.",
  }),
  chi({ inspection_id: "9002", license_: "501", aka_name: "BURGER BAR", results: "Pass w/ Conditions",
    violations: "38. INSECTS, RODENTS, & ANIMALS NOT PRESENT - Comments: OBSERVED RODENT ACTIVITY AND LIVE COCKROACHES." }),
  // License "0" is invalid; falls back to the inspection id.
  chi({ inspection_id: "9003", license_: "0", dba_name: "SCHOOL KITCHEN",
    violations: "55. PHYSICAL FACILITIES - Comments: DEBRIS BEHIND GREASE TRAP. | 38. INSECTS, RODENTS, & ANIMALS NOT PRESENT - Comments: DEAD INSECTS NOTED." }),
  // Older inspection for the taco spot: ignored because a newer one exists.
  chi({ inspection_id: "8000", inspection_date: "2026-08-01T00:00:00.000",
    violations: "38. INSECTS, RODENTS, & ANIMALS NOT PRESENT - Comments: OBSERVED RATS." }),
];
