/**
 * Shared statistical-report definitions.
 *
 * Used by the Statistical Reports page and by the Report Compendium so both
 * always produce identical frequency distributions for a given CBMS year.
 */

export interface ReportDef {
  id: string;
  title: string;
  source: "households" | "persons";
  field: string | ((r: any) => string | null);
}

export function householdSizeBucket(n: any): string {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  if (value === 1) return "1 member";
  if (value === 2) return "2 members";
  if (value <= 4) return "3–4 members";
  if (value <= 6) return "5–6 members";
  if (value <= 9) return "7–9 members";
  return "10+ members";
}

export const REPORTS: ReportDef[] = [
  { id: "hh_size", title: "Distribution of Households by Number of Household Members", source: "households", field: (h) => householdSizeBucket(h.hh_size) },
  { id: "internet", title: "Distribution of Households by Access to Internet", source: "households", field: "k01_internet_access" },
  { id: "safety", title: "Distribution of Households by Perception on Safety while Walking Alone at Night", source: "households", field: "l01_safe_walking_alone" },
  { id: "main_water", title: "Distribution of Households by Main Source of Water Supply", source: "households", field: "n01_main_water" },
  { id: "drinking_water", title: "Distribution of Households by Main Source of Drinking Water", source: "households", field: "n02_drinking_water" },
  { id: "drinking_service", title: "Distribution of Households by Service Level of Drinking Water", source: "households", field: "n03_service_level_drinking_water" },
  { id: "toilet", title: "Distribution of Households by Type of Toilet Facility", source: "households", field: "n08_toilet_facility" },
  { id: "toilet_service", title: "Distribution of Households by Service Level of Toilet Facility", source: "households", field: "n08_service_level_toilet_facility" },
  { id: "handwash", title: "Distribution of Households by Service Level of Handwashing Facility", source: "households", field: "n13_service_level_handwashing_facility" },
  { id: "building", title: "Distribution of Households by Type of Building/Housing Unit", source: "households", field: "o01_building_type" },
  { id: "roof", title: "Distribution of Households by Roof Material", source: "households", field: "o03_roof" },
  { id: "walls", title: "Distribution of Households by Outer Wall Material", source: "households", field: "o04_outer_walls" },
  { id: "floor", title: "Distribution of Households by Floor Material", source: "households", field: "o06_floor" },
  { id: "tenure", title: "Distribution of Households by Tenure Status", source: "households", field: "o09_tenure" },
  { id: "electricity", title: "Distribution of Households by Availability of Electricity", source: "households", field: "o11_electricity" },
  { id: "cooking", title: "Distribution of Households by Fuel Used for Cooking", source: "households", field: "o13_fuel_for_cooking" },
  { id: "age_group", title: "Distribution of Population by Age Group", source: "persons", field: "a05_age_group_five_years" },
  { id: "sex", title: "Distribution of Population by Sex", source: "persons", field: "a03_sex" },
  { id: "civil", title: "Distribution of Population by Civil Status", source: "persons", field: "a07_marital_status" },
  { id: "education", title: "Distribution of Population by Educational Level", source: "persons", field: "a11_hgc_level" },
  { id: "employment", title: "Distribution of Labor Force by Employment Status", source: "persons", field: "e01_employment_status" },
];

/** Frequency distribution rows (sorted by count) with a TOTAL row appended. */
export function frequency(rowsIn: any[], report: ReportDef) {
  const counts = new Map<string, number>();
  for (const r of rowsIn) {
    const v = typeof report.field === "function" ? report.field(r) : r[report.field];
    const k = v == null || v === "" ? "Not reported" : String(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = rowsIn.length;
  const rows = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count, percent: total ? `${((count / total) * 100).toFixed(2)}%` : "0%" }))
    .sort((a, b) => b.count - a.count);
  return { rows, total };
}
