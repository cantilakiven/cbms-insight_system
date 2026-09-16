// Friendly labels for CBMS variables.
export const FIELD_LABELS: Record<string, string> = {
  area_code: "Area Code",
  area_name: "Barangay",
  region_code: "Region",
  province_code: "Province",
  city_mun_code: "City/Municipality",
  barangay_code: "Barangay Code",
  husn: "Household Serial No.",
  hsn: "Housing Serial No.",
  hh_size: "Household Size",
  number_of_males: "Males",
  number_of_females: "Females",
  number_of_nuclear_families: "Nuclear Families",
  overcrowding_status: "Overcrowding Status",
  proximity_hospital: "Distance to Hospital (km)",
  proximity_health_center: "Distance to Health Center (km)",
  // person
  a01_last_name: "Last Name",
  a01_first_name: "First Name",
  a01_middle_name: "Middle Name",
  a01_suffix: "Suffix",
  a02_relation_to_hh_head: "Relationship to Head",
  a03_sex: "Sex",
  a05_age: "Age",
  a05_age_group_five_years: "Age Group",
  a07_marital_status: "Civil Status",
  a08_religion: "Religion",
  a09_ethnicity: "Ethnicity",
  a10_simple_literacy: "Literate",
  a11_hgc_level: "Educational Level",
  a11_hgc: "Highest Grade Completed",
  b03_phil_id: "PhilSys ID",
  b05_solo_parent: "Solo Parent",
  b07_senior_citizen_id: "Senior Citizen ID",
  b08_currently_pregnant: "Currently Pregnant",
  b09_lactating_mother: "Lactating Mother",
  b10_pwd: "PWD",
  b11_with_pwd_id: "With PWD ID",
  c01_citizenship: "Citizenship",
  d01_currently_attending_school: "Attending School",
  d07_tvet_graduate: "TVET Graduate",
  d08_tvet_currently_attending: "Attending TVET",
  e01_labor_force_participation: "Labor Force",
  e01_employment_status: "Employment Status",
  e01_underemployment_status: "Underemployment",
  e05_psoc: "Occupation",
  e05_occupation_group: "Occupation Group",
  e06_psic: "Industry",
  e06_industry_group: "Industry Group",
  e07_nature_of_employment: "Nature of Employment",
  e08_class_of_worker: "Class of Worker",
  e11_number_of_hours_worked_in_all_jobs: "Hours Worked",
  e17_farmer: "Farmer",
  e18_fisherfolk: "Fisherfolk",
  m01_a_sss: "SSS Member",
  m01_b_gsis: "GSIS Member",
  m01_c_philhealth: "PhilHealth Member",
  m05_a_4ps: "4Ps Beneficiary",
  m05_b_socpen: "Social Pension",
  // household conditions
  n01_main_water: "Main Water Source",
  n02_drinking_water: "Drinking Water Source",
  n03_service_level_drinking_water: "Drinking Water Service Level",
  n08_toilet_facility: "Toilet Facility",
  n08_service_level_toilet_facility: "Toilet Service Level",
  n13_service_level_handwashing_facility: "Handwashing Facility",
  o01_building_type: "Building Type",
  o03_roof: "Roof Material",
  o04_outer_walls: "Outer Wall Material",
  o06_floor: "Floor Material",
  o09_tenure: "Tenure Status",
  o11_electricity: "Electricity",
  o12_fuel_for_lighting: "Lighting Fuel",
  o13_fuel_for_cooking: "Cooking Fuel",
  k01_internet_access: "Internet Access",
  k02_internet_at_home: "Internet at Home",
  l01_safe_walking_alone: "Safety Walking at Night",
};

export function labelOf(key: string): string {
  return FIELD_LABELS[key] || key.replace(/^[a-z]\d+_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fullName(p: Record<string, any>): string {
  const parts = [p.a01_first_name, p.a01_middle_name, p.a01_last_name, p.a01_suffix].filter(Boolean);
  return parts.join(" ").trim() || "—";
}

export function formatVal(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}

/** Normalizes common CBMS misspellings in employment / labor-force variables. */
export function normalizeEmploymentStatus(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const raw = String(v).trim().toLowerCase();
  // Misspelling: "Umployed" / "umployed" -> Unemployed
  if (raw === "umployed" || raw === "unemployed") return "Unemployed";
  if (raw === "employed") return "Employed";
  if (raw === "not in labor force") return "Not in Labor Force";
  if (raw === "in the labor force") return "In the labor force";
  return String(v).trim();
}

export function normalizeUnderemploymentStatus(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const raw = String(v).trim().toLowerCase();
  if (raw === "underemployed") return "Underemployed";
  if (raw === "not underemployed") return "Not underemployed";
  return String(v).trim();
}

export const SOURCE_NOTE =
  "Source: 2024 Community-Based Monitoring System, Philippine Statistics Authority";
