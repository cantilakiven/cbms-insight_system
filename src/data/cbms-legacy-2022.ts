/**
 * CBMS 2022 -> CBMS 2024-compatible runtime adapter.
 *
 * The 2022 export format is a single array of household "HPQF2_LEVEL"
 * records with nested SECTION_* arrays and numeric "code" values. The
 * application expects the flatter 2024 datasets:
 *   barangays / households / persons / childMortality / interviews / ...
 *
 * This adapter converts the old structure at IMPORT TIME. It does not modify
 * the original JSON file and it does not bundle the large 2022 dataset.
 */

export interface Legacy2022Batch {
  barangays: Record<string, any>[];
  barangayList: Record<string, any>[];
  households: Record<string, any>[];
  childMortality: Record<string, any>[];
  interviews: Record<string, any>[];
  persons: Record<string, any>[];
  personsTvet: Record<string, any>[];
}

const BARANGAYS: Record<string, string> = {
  "001": "Alvenda",
  "002": "Buenasuerte",
  "003": "Diland",
  "004": "Diolen",
  "005": "Head Tipan",
  "006": "New Casul",
  "007": "Newland",
  "008": "New Siquijor",
  "009": "Paso Rio",
  "010": "Poblacion",
  "011": "San Miguel",
  "012": "Tinglan",
  "013": "Totongon",
  "014": "Tubac",
  "015": "Unidos",
  "016": "Santo Tomas",
};

const yesNo = (v: any): string | null => {
  const n = code(v);
  if (n === 1) return "Yes";
  if (n === 2) return "No";
  return v === null || v === undefined || v === "" ? null : String(v);
};

const code = (v: any): any => {
  if (v && typeof v === "object" && "code" in v) return v.code;
  return v;
};

const str = (v: any): string | null => {
  const x = code(v);
  if (x === null || x === undefined || x === "") return null;
  return String(x);
};

const num = (v: any): number | null => {
  const x = code(v);
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const pad = (v: any, n: number) => {
  const x = str(v);
  return x === null ? "".padStart(n, "0") : x.padStart(n, "0");
};

/**
 * Safely looks up numeric keys in Record mapping objects without
 * throwing 'Type null cannot be used as an index type' errors.
 */
function safeLookup(map: Record<number, string>, val: number | null, fallback: any): string | null {
  return val !== null && val in map ? map[val] : fallback;
}

function sectionOne(h: any, name: string): Record<string, any> {
  const a = h?.[name];
  return Array.isArray(a) && a[0] && typeof a[0] === "object" ? a[0] : {};
}

function sectionRows(h: any, name: string): Record<string, any>[] {
  const a = h?.[name];
  return Array.isArray(a) ? a.filter((x) => x && typeof x === "object") : [];
}

function flatSection(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const value = code(v);
    out[`legacy_${k.toLowerCase()}`] = value;
  }
  return out;
}

/**
 * Remove the 2022 export's { code: ... } wrappers without dropping anything.
 * Arrays and nested objects are preserved, so every field in HPQF2_LEVEL remains
 * available to the UI even when there is no direct 2024 equivalent.
 */
function unwrapLegacy(value: any): any {
  if (Array.isArray(value)) return value.map(unwrapLegacy);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, "code")) {
      return unwrapLegacy(value.code);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, unwrapLegacy(item)]),
    );
  }
  return value;
}

function legacyRaw(h: any): Record<string, any> {
  return unwrapLegacy(h?.HPQF2_LEVEL || {});
}

function areaMeta(h: any, filename: string) {
  const region = pad(h.REGION_CODE, 2);
  const province = pad(h.PROVINCE_CODE, 3);
  const city = pad(h.CITY_MUN_CODE, 2);
  const brgy = pad(h.BARANGAY_CODE, 3);
  const areaCode = `${region}${province}${city}${brgy}`;
  const municipalityCode = `${region}${province}${city}`;
  const areaName = BARANGAYS[brgy] || `Barangay ${Number(brgy) || brgy}`;

  return {
    area_code: areaCode,
    area_name: areaName,
    region_code: region,
    province_code: province,
    city_mun_code: city,
    barangay_code: brgy,
    id: municipalityCode,
    name: "Mutia, Zamboanga del Norte",
    legacy_source: filename,
  };
}

const RELATION: Record<number, string> = {
  1: "Head",
  2: "Spouse",
  3: "Son",
  4: "Daughter",
  5: "Stepson",
  6: "Stepdaughter",
  7: "Son-in-law",
  8: "Daughter-in-law",
  9: "Grandson",
  10: "Granddaughter",
  11: "Father",
  12: "Mother",
  13: "Father-in-law",
  14: "Mother-in-law",
  15: "Brother",
  16: "Sister",
  17: "Brother-in-law",
  18: "Sister-in-law",
  19: "Uncle",
  20: "Aunt",
  21: "Nephew",
  22: "Niece",
  23: "Other relative",
  24: "Boarder",
  25: "Domestic helper",
  26: "Nonrelative",
};

const NUCLEAR_RELATION: Record<number, string> = {
  0: "One-member household",
  1: "Family head",
  2: "Spouse",
  3: "Partner",
  4: "Son",
  5: "Daughter",
  6: "Brother",
  7: "Sister",
  8: "Father",
  9: "Mother",
  10: "Other family member",
};

const MARITAL: Record<number, string> = {
  1: "Single",
  2: "Married",
  3: "Common law/live-in",
  4: "Widowed",
  5: "Divorced",
  6: "Separated",
  7: "Annulled",
  8: "Unknown",
};

const CLASS_OF_WORKER: Record<number, string> = {
  0: "Worked for private household",
  1: "Worked for private establishment",
  2: "Worked for government/government-owned and controlled corporation",
  3: "Self-employed without paid employee",
  4: "Employer in own family-operated farm or business",
  5: "Worked with pay in own family-operated farm or business",
  6: "Worked without pay in own family-operated farm or business",
};

const NATURE_OF_EMPLOYMENT: Record<number, string> = {
  1: "Permanent job/business/unpaid family work",
  2: "Short-term or seasonal or casual job/business, unpaid family work",
  3: "Worked for different employers or customers on day-to-day or week-to-week basis",
};

const BASIS_OF_PAYMENT: Record<number, string> = {
  0: "In-kind, imputed",
  1: "Per piece",
  2: "Per hour",
  3: "Per day",
  4: "Monthly",
  5: "Pakyaw",
  6: "Other salaries/wages",
  7: "Not salaries/wages",
};

const EMPLOYMENT_FROM_PERSON = (p: Record<string, any>) => {
  const worked = code(p.E01_WORK_PAST_WEEK) === 1;
  const looking = code(p.E25_TRY_LOOK_FOR_WORK_OR_DO_BUSINESS) === 1;
  const available = code(p.E31_AVAILABLE_FOR_WORK) === 1;
  if (worked || code(p.E03_JOB_OR_BUSINESS_PAST_WEEK) === 1) return "Employed";
  if (looking || available) return "Unemployed";
  return "Not in Labor Force";
};

const laborForceFromPerson = (p: Record<string, any>) => {
  const status = EMPLOYMENT_FROM_PERSON(p);
  return status === "Not in Labor Force" ? "Not in labor force" : "In the labor force";
};

function birthdayParts(v: any) {
  const s = str(v);
  if (!s) return { month: null, day: null, year: null };
  const x = s.padStart(8, "0");
  return {
    month: Number(x.slice(0, 2)) || null,
    day: Number(x.slice(2, 4)) || null,
    year: Number(x.slice(4, 8)) || null,
  };
}

/** CBMS 2022 education level codes. The 2022 questionnaire stores these as
 * numeric values, while the 2024 normalized files store the level label. */
const EDUCATION_LEVELS_2022: Record<number, string> = {
  0: "Early childhood education",
  1: "Elementary level",
  2: "Junior high school level",
  3: "Senior high school level",
  4: "Post-secondary non-tertiary level",
  5: "Short-cycle tertiary level",
  6: "College level",
  7: "Masteral level",
  8: "Doctoral level",
};

function educationLevel2022(level: any, hgc: any): string | null {
  const direct = EDUCATION_LEVELS_2022[num(level) ?? -1];
  if (direct) return direct;
  const rawCode = code(hgc);
  if (rawCode === null || rawCode === undefined || rawCode === "") return null;
  const raw = String(rawCode).padStart(8, "0");
  if (/^0+$/.test(raw)) return "Early childhood education";
  if (raw.startsWith("34") || raw.startsWith("35") || raw.startsWith("37")) return "Senior high school level";
  if (raw.startsWith("24") || raw.startsWith("23") || raw.startsWith("20")) return "Junior high school level";
  if (raw.startsWith("10")) return "Elementary level";
  if (raw.startsWith("60")) return "College level";
  if (raw.startsWith("50")) return "Short-cycle tertiary level";
  if (raw.startsWith("40")) return "Post-secondary non-tertiary level";
  return null;
}

function educationGroup2022(hgc: any, level: any): string | null {
  const raw = String(code(hgc) ?? "").padStart(8, "0");
  if (!raw) return null;
  if (raw === "00000000") return "No grade completed";
  if (raw.startsWith("340")) return "Senior high school level";
  if (raw.startsWith("350")) return "Senior high school level";
  if (raw.startsWith("37")) return "Senior high school level";
  const lvl = educationLevel2022(level, hgc);
  return lvl;
}

function makePerson(
  h: any,
  source: Record<string, any>,
  filename: string,
  meta: ReturnType<typeof areaMeta>,
  gByLine: Map<string, Record<string, any>>,
) {
  const line = pad(source.LINE_NUMBER, 2);
  const bday = birthdayParts(source.A06_BIRTHDAY);
  const g = gByLine.get(line) || {};
  const p2Rows = sectionRows(h, "SECTION_P02_TO_P13");
  const p2Line = p2Rows.find((row) => pad(row.P2_LINE_NUMBER || row.SECTION_P_LINE_NUMBER, 2) === line) || {};
  const sexCode = num(source.A05_SEX);
  const age = num(source.A07_AGE);

  const relationCode = num(source.A02_RELATION_TO_HH_HEAD);
  const nuclearCode = num(source.A04_RELATION_TO_NUCLEAR_FAMILY_HEAD);
  const maritalCode = num(source.A09_MARITAL_STATUS);
  const classCode = num(source.E18_CLASS_OF_WORKER);
  const basisCode = num(source.E19_BASIS_OF_PAYMENT);
  const natureCode = num(source.E11_NATURE_OF_EMPLOYMENT);

  const employment = EMPLOYMENT_FROM_PERSON(source);
  const underemployed =
    employment === "Employed" &&
    (code(source.E15_WANT_MORE_HOURS) === 1 || code(source.E16_LOOKING_FOR_ADDITIONAL_WORK) === 1);

  const occupationText = [source.E07_OCCUPATION, source.E35_LAST_OCCUPATION].map(str).filter(Boolean).join(" ");
  const industryText = [source.E09_KIND_OF_BUSINESS_OR_INDUSTRY, source.E37_LAST_INDUSTRY].map(str).filter(Boolean).join(" ");
  const farmer =
    code(g.G11_ENGAGED_IN_AGRI) === 1 ||
    code(g.G12_A_GROWING_OF_CROPS) === 1 ||
    code(g.G12_B_LIVESTOCK_AND_POULTRY) === 1 ||
    code(g.G13_TYPE_OF_ENGAGEMENT_IN_FARMING) !== null ||
    /farm|farmer|farming|agri/i.test(occupationText) ||
    /farm|farmer|farming|agri/i.test(industryText);
  const fisherfolk =
    code(g.G15_ENGAGED_IN_AQUACULTURE) === 1 ||
    code(g.G15_ENGAGED_IN_FISH_CAPTURE) === 1 ||
    code(g.G15_ENGAGED_IN_GLEANING) === 1 ||
    code(g.G12_D_FISH_CAPTURE) === 1 ||
    code(g.G12_C_AQUACULTURE) === 1;

  return {
    ...meta,
    uuid: `${meta.area_code}-${pad(h.HUSN, 5)}-${pad(h.HSN, 5)}-${line}`,
    line_number: line,
    husn: pad(h.HUSN, 5),
    hsn: pad(h.HSN, 5),

    a01_last_name: str(source.A01_LAST_NAME),
    a01_first_name: str(source.A01_FIRST_NAME),
    a01_suffix: str(source.A01_SUFFIX),
    a01_middle_name: str(source.A01_MIDDLE_NAME),
    a02_relation_to_hh_head: safeLookup(RELATION, relationCode, str(source.A02_RELATION_TO_HH_HEAD)),
    a03_sex: sexCode === 1 ? "Male" : sexCode === 2 ? "Female" : str(source.A05_SEX),
    a04_birthday_month: bday.month,
    a04_birthday_day: bday.day,
    a04_birthday_year: bday.year,
    a05_age: age,
    a05_age_group_five_years: age === null ? null : `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4} years old`,
    a06_lcr_reg_status: yesNo(source.A08_LCR_REG_STATUS),
    a07_marital_status: safeLookup(MARITAL, maritalCode, str(source.A09_MARITAL_STATUS)),
    a08_religion: str(source.A11_RELIGION),
    a09_ethnicity: str(source.A10_ETHNICITY),
    a10_simple_literacy: yesNo(source.C01_SIMPLE_LITERACY),
    a11_hgc_level: educationLevel2022(source.C02_HGC_LEVEL, source.C02_HGC),
    a11_hgc_group: educationGroup2022(source.C02_HGC, source.C02_HGC_LEVEL),
    a11_hgc: str(source.C02_HGC),
    b01_nuclear_family: num(source.A03_NUCLEAR_FAMILY),
    b02_relation_to_nuclear_family_head: safeLookup(
      NUCLEAR_RELATION,
      nuclearCode,
      str(source.A04_RELATION_TO_NUCLEAR_FAMILY_HEAD)
    ),
    b03_phil_id: yesNo(source.A12_PHIL_ID),
    b05_solo_parent: yesNo(source.A17_SOLO_PARENT),
    b06_solo_parent_id: yesNo(source.A18_SOLO_PARENT_ID),
    b07_senior_citizen_id: yesNo(source.A19_SENIOR_CITIZEN_ID),
    b08_currently_pregnant: null,
    b09_lactating_mother: null,
    b10_pwd:
      [source.A20_A_SEEING, source.A20_B_HEARING, source.A20_C_WALKING, source.A20_D_REMEMBERING,
        source.A20_E_SELF_CARING, source.A20_F_COMMUNICATING]
        .some((v) => code(v) === 2)
        ? "Yes"
        : "No",
    b11_with_pwd_id: null,
    b12_a_visual_disability: code(source.A20_A_SEEING) === 2 ? "Yes" : "No",
    b12_b_hearing_disability: code(source.A20_B_HEARING) === 2 ? "Yes" : "No",
    b12_c_mental_disability: code(source.A20_C_REMEMBERING) === 2 ? "Yes" : "No",
    b12_d_physical_disability: code(source.A20_D_WALKING) === 2 ? "Yes" : "No",
    b12_e_speech_impairment: code(source.A20_F_COMMUNICATING) === 2 ? "Yes" : "No",
    b19_ssdi:
      [source.A20_A_SEEING, source.A20_B_HEARING, source.A20_C_WALKING, source.A20_D_REMEMBERING, source.A20_E_SELF_CARING, source.A20_F_COMMUNICATING].some((v) => code(v) === 2)
        ? "With disability"
        : "Without disability",

    c02_ofi: str(source.B06_OFI),
    d01_currently_attending_school: yesNo(source.C03_CURRENTLY_ATTENDING_SCHOOL),
    d02_type_of_school_attended: str(source.C04_TYPE_OF_SCHOOL_ATTENDED),
    d03_current_grade_level: educationLevel2022(source.C05_CURRENT_GRADE_LEVEL, source.C05_CURRENT_GRADE),
    d03_current_grade: str(source.C05_CURRENT_GRADE),
    d06_reason_not_attending_school: str(source.C06_REASON_NOT_ATTENDING_SCHOOL),
    d07_tvet_graduate: yesNo(source.C07_TVET_GRADUATE),
    d08_tvet_currently_attending: yesNo(source.C08_TVET_CURRENTLY_ATTENDING),

    e01_labor_force_participation: laborForceFromPerson(source),
    e01_employment_status: employment,
    e01_underemployment_status: underemployed ? "Underemployed" : "Not underemployed",
    e01_discouraged_worker: null,
    e01_work_past_week: yesNo(source.E01_WORK_PAST_WEEK),
    e02_job_or_business_past_week: yesNo(source.E03_JOB_OR_BUSINESS_PAST_WEEK),
    e03_work_location_province: null,
    e04_work_location_city_mun: null,
    // 2022 separates the text occupation/industry (E07/E09) from the
    // corresponding PSOC/PSIC codes (E08/E10). Keep the human-readable text
    // in the normalized fields so sector filters can work exactly like 2024,
    // while retaining the numeric classification code in dedicated fields.
    e05_psoc: str(source.E07_OCCUPATION) || str(source.E08_PSOC),
    e05_psoc_code: num(source.E08_PSOC),
    e05_occupation_group: str(source.E07_OCCUPATION) || str(source.E08_PSOC),
    e06_psic: str(source.E09_KIND_OF_BUSINESS_OR_INDUSTRY) || str(source.E10_PSIC),
    e06_psic_code: num(source.E10_PSIC),
    e06_industry_group: str(source.E09_KIND_OF_BUSINESS_OR_INDUSTRY) || str(source.E10_PSIC),
    e07_nature_of_employment: safeLookup(NATURE_OF_EMPLOYMENT, natureCode, str(source.E11_NATURE_OF_EMPLOYMENT)),
    e08_class_of_worker: safeLookup(CLASS_OF_WORKER, classCode, str(source.E18_CLASS_OF_WORKER)),
    e09_basis_of_payment: safeLookup(BASIS_OF_PAYMENT, basisCode, str(source.E19_BASIS_OF_PAYMENT)),
    // CBMS 2022 records E20 as the person's basic pay per day. Keep the
    // source value unchanged; do not convert it to monthly/yearly income.
    e20_basic_pay_per_day: num(source.E20_BASIC_PAY_PER_DAY),
    e10_other_job_or_business_past_week: yesNo(source.E21_OTHER_WORK_OR_BUSINESS),
    e11_number_of_hours_worked_in_all_jobs: num(source.E23_NUMBER_OF_HOURS_WORKED_IN_ALL_JOBS),
    e12_want_more_hours: yesNo(source.E15_WANT_MORE_HOURS),
    e13_try_look_for_work: yesNo(source.E25_TRY_LOOK_FOR_WORK_OR_DO_BUSINESS),
    e14_reason_not_looking_for_work: str(source.E29_REASON_NOT_LOOKING_FOR_WORK),
    e15_available_for_work: yesNo(source.E31_AVAILABLE_FOR_WORK),
    e16_willing_to_work: yesNo(source.E32_WILLING_TO_WORK),
    e17_farmer: farmer ? "Yes" : "No",
    e18_fisherfolk: fisherfolk ? "Yes" : "No",
    m06_a_benefit_4ps: [p2Line.P06_A_4PS_REGULAR_RECEIVED_BENEFITS, p2Line.P06_B_4PS_MODIFIED_RECEIVED_BENEFITS].some((v) => code(v) === 1) ? "Yes" : "No",
    m06_b_benefit_socpen: code(p2Line.P06_D_SOCPEN_RECEIVED_BENEFITS) === 1 ? "Yes" : "No",
    legacy_occupation_text: occupationText || null,
    legacy_industry_text: industryText || null,
    legacy_hgc_code: num(source.C02_HGC),
    legacy_hgc_level_code: num(source.C02_HGC_LEVEL),

    legacy_year: 2022,
    // Keep every original 2022 person field available, including fields that
    // have no 2024-normalized counterpart.
    legacy_raw: unwrapLegacy(source),
  };
}

function householdSectionValue(h: any, sectionName: string, fieldName: string): any {
  const row = sectionOne(h, sectionName);
  return row?.[fieldName];
}

function makeHousehold(h: any, filename: string, meta: ReturnType<typeof areaMeta>) {
  const summary = sectionOne(h, "SUMMARY_OF_VISIT");
  const geo = sectionOne(h, "GEO_INFO");
  const p = sectionOne(h, "SECTION_P");
  const p2 = sectionRows(h, "SECTION_P02_TO_P13");
  const q = sectionOne(h, "SECTION_Q");
  const r = sectionOne(h, "SECTION_R");
  const j = sectionOne(h, "SECTION_J");
  const k = sectionOne(h, "SECTION_K");
  const i = sectionOne(h, "SECTION_I");
  const l = sectionOne(h, "SECTION_L");
  const m = sectionOne(h, "SECTION_M");
  const n = sectionOne(h, "SECTION_N");

  const p2ByLine = new Map<string, Record<string, any>>();
  for (const row of p2) {
    const line = pad(row.P2_LINE_NUMBER || row.SECTION_P_LINE_NUMBER, 2);
    p2ByLine.set(line, row);
  }

  const hhSize = num(summary.HH_SIZE);

  return {
    ...meta,
    uuid: str(h.uuid) || `${meta.area_code}-${pad(h.HUSN, 5)}-${pad(h.HSN, 5)}`,
    husn: pad(h.HUSN, 5),
    hsn: pad(h.HSN, 5),
    longitude: num(geo.LONGITUDE),
    latitude: num(geo.LATITUDE),
    hh_size: hhSize,
    number_of_males: num(summary.NUMBER_OF_MALES),
    number_of_females: num(summary.NUMBER_OF_FEMALES),
    number_of_nuclear_families: num(summary.NUMBER_OF_NUCLEAR_FAMILY),
    respondent_line_number: pad(summary.RESPONDENT_LINE_NUMBER, 2),
    agree_to_sign_the_waiver: yesNo(summary.AGREE_TO_SIGN_THE_WAIVER),
    reason_for_not_signing_the_waiver: str(summary.REASON_NOT_SIGNING_THE_WAIVER),
    address_house_number: str(geo.HOUSE_NUMBER),
    address_floor_number: num(geo.FLOOR_NUMBER),
    address_block_or_lot_number: str(geo.BLOCK_OR_LOT_NUMBER),
    address_street_name: str(geo.STREET_NAME),
    address_subdivision_or_village: null,
    address_sitio_purok: str(geo.SITIO_PUROK),

    // Health / food / financial / disaster / internet / social protection.
    f01_with_member_who_has_been_sick: yesNo(l.L33_MEMBER_WHO_HAS_BEEN_SICK),
    f06_with_child_died: yesNo(l.L10_WITH_CHILD_DIED),
    g01_worried: yesNo(j.J01_WORRIED),
    g02_not_eaten_healthy: yesNo(j.J02_NOT_EATEN_HEALTHY),
    g03_ate_few_food: yesNo(j.J03_ATE_FEW_FOOD),
    g04_skipped_meal: yesNo(j.J04_SKIPPED_MEAL),
    g05_ate_less: yesNo(j.J05_ATE_LESS),
    g06_ran_out_of_food: yesNo(j.J06_RAN_OUT_OF_FOOD),
    g07_hungry: yesNo(j.J07_HUNGRY),
    g08_not_eaten_whole_day: yesNo(j.J08_NOT_EATEN_WHOLE_DAY),

    // CBMS 2022 food-consumption fields. IMPORTANT: I02 is frequency of food
    // expenditure/consumption, not number of meals eaten per day.
    i02_usual_food_consumption: str(i.I01_USUAL_FOOD_CONSUMPTION),
    i02_frequency_of_food_consumption: num(i.I02_FREQUENCY_OF_FOOD_CONSUMPTION),
    i02_frequency_of_food_consumption_label: safeLookup(
      { 1: "Per day", 2: "Per week", 3: "Every 15 days", 4: "Per month", 5: "Entire year" },
      num(i.I02_FREQUENCY_OF_FOOD_CONSUMPTION),
      str(i.I02_FREQUENCY_OF_FOOD_CONSUMPTION),
    ),
    i03_occasional_food_consumption: str(i.I03_OCCASSIONAL_FOOD_CONSUMPTION),
    i04_total_food_consumption: num(i.I04_TOTAL_FOOD_CONSUMPTION),
    i04_total_food_consumption_annual: num(i.I04_TOTAL_FOOD_CONSUMPTION),

    i01_a_bank_account: yesNo(k.K01_A_BANK_ACCOUNT),
    i01_b_digital_bank_account: yesNo(k.K01_B_ONLINE_BANK_ACCOUNT),
    i01_c_emoney_or_cash_card: yesNo(k.K01_C_EMONEY_ACCOUNT),
    i01_d_nssla: yesNo(k.K01_D_NSSLA),
    i01_e_account_with_coop: yesNo(k.K01_E_COOPERATIVE),
    i01_f_microfinance: yesNo(k.K01_F_MICROFINANCE),

    k01_internet_access: yesNo(n.N01_INTERNET_ACCESS),
    k02_internet_at_home: yesNo(n.N03_INTERNET_AT_HOME),
    k03_a_wired_broadband: yesNo(n.N04_A_WIRED),
    k03_b_wireless_broadband: yesNo(n.N04_B_WIRELESS),
    k03_c_satellite_broadband: yesNo(n.N04_C_SATELLITE),
    k03_d_mobile_broadband: yesNo(n.N04_D_MOBILE_BROADBAND),

    l01_safe_walking_alone: (() => {
      const c = num(sectionOne(h, "SECTION_O").O01_SAFE_WALKING_ALONE);
      const labels: Record<number, string> = {
        1: "Safe",
        2: "Somewhat safe",
        3: "Somewhat unsafe",
        4: "Unsafe",
        5: "Afraid to be alone",
      };
      return safeLookup(labels, c, str(sectionOne(h, "SECTION_O").O01_SAFE_WALKING_ALONE));
    })(),

    m01_a_sss: yesNo(p.P01_A_SSS),
    m01_b_gsis: yesNo(p.P01_B_GSIS),
    m01_c_philhealth: yesNo(p.P01_G_PHILHEALTH),
    m01_d_health_insurance: yesNo(p.P01_D_HEALTH_INSURANCE),
    m05_a_4ps: [p.P05_A_4PS_REGULAR, p.P05_B_4PS_MODIFIED].some((v) => code(v) === 1) ? "Yes" : "No",
    m05_b_socpen: yesNo(p.P05_D_SOCPEN),
    m05_c_aics: null,
    m05_d_food_stamp: null,
    m05_e_educ_assistance: null,
    m05_f_employ_assistance: null,
    m05_g_lgu_assistance: null,
    m05_z_assistance_other: yesNo(p.P05_Z_OTHER_SOCIAL_ASSISTANCE),
    m06_a_benefit_4ps:
      p2.some((x) => code(x.P06_A_4PS_REGULAR_RECEIVED_BENEFITS) === 1 || code(x.P06_B_4PS_MODIFIED_RECEIVED_BENEFITS) === 1)
        ? "Yes"
        : "No",
    m06_b_benefit_socpen: p2.some((x) => code(x.P06_D_SOCPEN_RECEIVED_BENEFITS) === 1) ? "Yes" : "No",
    m06_c_benefit_aics: null,
    m06_d_benefit_food_stamp: null,

    n01_main_water: str(q.Q01_MAIN_WATER),
    n02_drinking_water: str(q.Q03_DRINKING_WATER),
    n04_water_source_location: str(q.Q05_DRINKING_WATER_SOURCE_LOCATION),
    n05_time_to_collect_water: num(q.Q06_TIME_TO_COLLECT_WATER),
    n07_drinking_water_source_distance: num(q.Q07_DRINKING_WATER_SOURCE_DISTANCE),
    n08_toilet_facility: str(q.Q14_TOILET_FACILITY),
    n09_toilet_facility_located: str(q.Q18_TOILET_FACILITY_LOCATED),
    n10_share_toilet: yesNo(q.Q19_SHARE_TOILET),
    n11_toilet_for_public_use: yesNo(q.Q21_TOILET_FOR_PUBLIC_USE),
    n12_a_segregating_waste: yesNo(q.Q22_A_SEGREGATE_WASTE),
    n12_b_garbage_truck: yesNo(q.Q22_B_GARBAGE_TRUCK),
    n12_c_recycling_at_home: yesNo(q.Q22_C_RECYCLE_AT_HOME),
    n12_e_composting: yesNo(q.Q22_E_COMPOSTING),
    n12_f_burning: yesNo(q.Q22_F_BURNING),
    n12_g_dumping_in_pit_with_cover: yesNo(q.Q22_G_DUMPING_WITH_COVER),
    n12_h_dumping_in_pit_without_cover: yesNo(q.Q22_H_DUMPING_WITHOUT_COVER),
    n12_i_throwing_in_unhabited_locations: yesNo(q.Q22_I_THROW),
    n13_handwashing_facility: str(q.Q23_HANDWASHING),
    n14_handwashing_with_water: yesNo(q.Q24_HANDWASHING_WITH_WATER),
    n15_handwashing_with_soap: yesNo(q.Q25_HANDWASHING_WITH_SOAP),

    // CBMS 2022 household income fields. These are household-level amounts
    // and must not be presented as an individual person's salary.
    h02_a_salaries: num(householdSectionValue(h, "SECTION_H", "H02_A_SALARIES")),
    h02_b_commissions: num(householdSectionValue(h, "SECTION_H", "H02_B_COMMISSIONS")),
    h02_c_other_compensations: num(householdSectionValue(h, "SECTION_H", "H02_C_OTHER_COMPENSATIONS")),
    h04_total_income_from_current_members: num(householdSectionValue(h, "SECTION_H", "H04_TOTAL_INCOME_FROM_CURRENT_MEMBERS")),
    h05_total_income_from_former_members: num(householdSectionValue(h, "SECTION_H", "H05_TOTAL_INCOME_FROM_FORMER_MEMBERS")),
    h06_total_family_income: num(householdSectionValue(h, "SECTION_H", "H06_TOTAL_FAMILY_INCOME")),

    o01_building_type: str(r.R01_BUILDING_TYPE),
    o02_number_of_floors: num(r.R02_NUMBER_OF_FLOORS),
    o03_roof: str(r.R03_ROOF),
    o03_roof_strength: str(r.R03_ROOF_FRAME),
    o04_outer_walls: str(r.R04_OUTER_WALLS),
    o05_floor_finishing: str(r.R05_FLOOR_FINISHING),
    o06_floor: str(r.R06_FLOOR),
    o07_floor_area: num(r.R07_FLOOR_AREA),
    o08_number_of_bedrooms: num(r.R09_NUMBER_OF_BEDROOMS),
    o09_tenure: str(r.R10_TENURE),
    o10_year_constructed: num(r.R10_YEAR_CONSTRUCTED),
    o11_electricity: yesNo(r.R12_ELECTRICITY),
    o12_fuel_for_lighting: str(r.R14_FUEL_FOR_LIGHTING),
    o13_fuel_for_cooking: str(r.R15_FUEL_FOR_COOKING),
    o14_a_refrigerator: num(r.R16_A_REFRIGERATOR),
    o14_b_air_conditioner: num(r.R16_G_AIR_CONDITIONER),
    o14_c_washing_machine: num(r.R16_F_WASHING_MACHINE),
    o14_d_stove_oven: num(r.R16_B_STOVE_OVEN_WITH_GAS_RANGE),
    o14_e_radio: num(r.R16_I_RADIO),
    o14_f_tv: num(r.R16_J_TV),
    o14_g_audio_component: num(r.R16_L_AUDIO_COMPONENT),
    o14_h_telephone: num(r.R16_M_TELEPHONE),
    o14_i_basic_cp: num(r.R16_N_MOBILE_PHONE),
    o14_k_tablet: num(r.R16_O_TABLET),
    o14_l_computer: num(r.R16_P_COMPUTER),
    o14_m_car: num(r.R16_Q_CAR),
    o14_q_motorcycle: num(r.R16_U_MOTORCYCLE),
    o14_s_tricycle: num(r.R16_V_TRICYCLE),
    o14_t_bicycle: num(r.R16_W_BICYCLE),
    o14_v_banca_motorized: num(r.R16_Y_BANCA_MOTORIZED),
    o14_w_banca_nonmotorized: num(r.R16_Z_BANCA_NONMOTORIZED),

    legacy_year: 2022,
    // Preserve the complete original HPQF2_LEVEL payload. This is intentionally
    // separate from the normalized fields above so the application can expose
    // all 2022 fields without changing the source JSON.
    legacy_raw: legacyRaw(h),
  };
}

function makeInterview(h: any, meta: ReturnType<typeof areaMeta>) {
  const s = sectionOne(h, "SUMMARY_OF_VISIT");
  return {
    uuid: str(h.uuid),
    ...meta,
    husn: pad(h.HUSN, 5),
    hsn: pad(h.HSN, 5),
    visit_number: num(s.NUMBER_OF_VISITS) || 1,
    result_of_visit: num(s.RESULT_OF_VISIT),
    date_of_visit: null,
    time_began: null,
    time_ended: null,
    legacy_year: 2022,
  };
}

export function isLegacy2022Record(row: any): boolean {
  return !!row && typeof row === "object" && !!row.HPQF2_LEVEL;
}

export function convertLegacy2022(records: any[], filename: string): Legacy2022Batch {
  const out: Legacy2022Batch = {
    barangays: [],
    barangayList: [],
    households: [],
    childMortality: [],
    interviews: [],
    persons: [],
    personsTvet: [],
  };

  const seenAreas = new Set<string>();
  const seenPuroks = new Set<string>();

  for (const record of records) {
    const h = record?.HPQF2_LEVEL;
    if (!h || typeof h !== "object") continue;
    const meta = areaMeta(h, filename);
    const persons = sectionRows(h, "SECTION_A_TO_E");

    const gByLine = new Map<string, Record<string, any>>();
    for (const row of sectionRows(h, "SECTION_G11_TO_G27")) {
      gByLine.set(pad(row.SECTION_G_LINE_NUMBER, 2), row);
    }

    out.households.push(makeHousehold(h, filename, meta));
    out.interviews.push(makeInterview(h, meta));

    for (const person of persons) {
      out.persons.push(makePerson(h, person, filename, meta, gByLine));
    }

    if (!seenAreas.has(meta.area_code)) {
      seenAreas.add(meta.area_code);
      out.barangays.push({
        uuid: `${meta.area_code}-legacy-2022`,
        ...meta,
        date_of_visit: null,
        time_began: null,
        time_ended: null,
        legacy_year: 2022,
      });
    }

    const purok = str(sectionOne(h, "GEO_INFO").SITIO_PUROK);
    if (purok) {
      const pk = `${meta.area_code}|${purok}`;
      if (!seenPuroks.has(pk)) {
        seenPuroks.add(pk);
        out.barangayList.push({
          uuid: `${meta.area_code}-purok-${seenPuroks.size}`,
          ...meta,
          line_number: String(
            [...seenPuroks].filter((x) => x.startsWith(`${meta.area_code}|`)).length,
          ).padStart(2, "0"),
          value: purok,
          type: "Purok/Zone",
          legacy_year: 2022,
        });
      }
    }
  }

  return out;
}