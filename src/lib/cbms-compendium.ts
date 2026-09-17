/**
 * Report Compendium - one complete, printable book of the selected CBMS year.
 *
 * The compendium intentionally keeps all calculations in this module so the
 * generated book can never mix 2022 and 2024 records.  When "Include name
 * lists" is enabled, every core sector gets the same report shape used by the
 * sector exports:
 *   1) Summary table
 *   2) By-barangay summary table
 *   3) One detailed person table per barangay
 */
import { getDataVersion, getHouseholdIncome, getYearDatasets, coverageLabel, type DataYear } from "@/data/cbms";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BlobReader, BlobWriter, ZipWriter, TextReader } from "@zip.js/zip.js";
import logoUrl from "@/assets/cbms-insights-logo.png?inline";
import { REPORTS, frequency } from "./cbms-report-defs";
import { getMealFrequency, isUnderThreeMeals } from "./food-frequency";
import { addExportLog, generatePassword, makeExportId, saveBlobWithPrompt, emitExportPassword, emitPrintPreview } from "./export-log";

export interface BookColumn { key: string; label: string }
export interface BookTable {
  id: string;
  title: string;
  note?: string;
  columns: BookColumn[];
  rows: Record<string, any>[];
}
export interface BookSection {
  id: BookSectionId;
  title: string;
  intro?: string;
  tables: BookTable[];
}
export interface ReportBook {
  year: DataYear;
  title: string;
  subtitle: string;
  generatedAt: string;
  scope: string;
  sections: BookSection[];
}

export type BookSectionId = "overview" | "comparative" | "demographics" | "barangays" | "sectors" | "reports";

export const SECTION_CATALOG: { id: BookSectionId; label: string; description: string }[] = [
  { id: "overview", label: "Municipal Overview (Dashboard)", description: "Population, households, services and headline sector counts." },
  { id: "comparative", label: "Comparative Analysis (2022 vs 2024)", description: "The comparative dashboard's key graphs, change ranking and income shift." },
  { id: "demographics", label: "Demographics", description: "Age bands by sex, children per barangay, indigenous communities." },
  { id: "barangays", label: "Barangay Profiles", description: "Population, households and average size for every barangay." },
  { id: "sectors", label: "Sectors by Barangay", description: "Priority sector counts per barangay, with optional complete name rosters." },
  { id: "reports", label: "Statistical Reports", description: "All frequency distributions from the Statistical Reports page." },
];

const yes = (v: any) => v === "Yes" || v === 1 || v === "1" || v === true;
const txt = (v: any) => (v === null || v === undefined || String(v).trim() === "" ? "Not Stated" : String(v).trim());
const share = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(2)}%` : "0.00%");
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const hhKey = (r: any) => `${r?.area_code ?? ""}-${r?.husn ?? ""}-${r?.hsn ?? ""}`;
const fullName = (p: any) =>
  [p?.a01_last_name, p?.a01_first_name, p?.a01_middle_name, p?.a01_suffix]
    .filter(Boolean)
    .join(", ") || "Not Stated";

function isPwd(p: any) {
  if (p.b19_ssdi && String(p.b19_ssdi).toLowerCase() === "without disability") return false;
  const difficulty = ["b13_seeing", "b14_hearing", "b15_walking", "b16_remembering", "b17_self_caring", "b18_communicating"]
    .some((k) => p[k] && p[k] !== "No difficulty");
  const ssdi = p.b19_ssdi && String(p.b19_ssdi).toLowerCase() !== "without disability";
  return yes(p.b10_pwd) || yes(p.b11_with_pwd_id) || difficulty || !!ssdi;
}

function isFisherfolk(p: any) {
  const occupation = [p.e05_psoc, p.e05_occupation_group, p.legacy_occupation_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
  const industry = [p.e06_psic, p.e06_industry_group, p.legacy_industry_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
  return yes(p.e18_fisherfolk) || occupation.includes("fisher") || industry.includes("fishing") || industry.includes("fish capture");
}

function isCoconutFarmer(p: any) {
  const occupation = [p.e05_psoc, p.e05_occupation_group, p.legacy_occupation_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
  const industry = [p.e06_psic, p.e06_industry_group, p.legacy_industry_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
  return occupation.includes("coconut") || industry.includes("coconut") || String(p.legacy_raw?.E07_OCCUPATION ?? "").toLowerCase().includes("coconut");
}

const isHead = (p: any) => p?.a02_relation_to_hh_head === "Head" || Number(p?.line_number) === 1;

/**
 * These are the core sector rosters currently represented in the sector area.
 * They are deliberately defined here rather than importing a React route so
 * the Compendium is independent and safe to use during export/print.
 */
const SECTORS: {
  key: string;
  label: string;
  title: string;
  test: (p: any) => boolean;
  headsOnly?: boolean;
  statusLabel: string;
  detailField?: (p: any) => any;
  detailLabel?: string;
}[] = [
  {
    key: "senior",
    label: "Senior Citizens",
    title: "Senior Citizens by Barangay",
    test: (p) => Number.isFinite(Number(p.a05_age)) && Number(p.a05_age) >= 60,
    statusLabel: "Senior Citizen",
    detailField: (p) => p.b07_senior_citizen_id,
    detailLabel: "Senior ID",
  },
  {
    key: "pwd",
    label: "Persons with Disability",
    title: "Persons with Disability by Barangay",
    test: isPwd,
    statusLabel: "PWD",
    detailField: (p) => p.b11_with_pwd_id,
    detailLabel: "PWD ID",
  },
  {
    key: "children",
    label: "Children (0-17)",
    title: "Children (0-17 Years) by Barangay",
    test: (p) => Number.isFinite(Number(p.a05_age)) && Number(p.a05_age) <= 17,
    statusLabel: "Child",
  },
  {
    key: "fourps",
    label: "4Ps Household Heads",
    title: "Pantawid (4Ps) Household Heads by Barangay",
    test: (p) => yes(p.m05_a_4ps) || yes(p.m06_a_benefit_4ps) || yes(p._hh?.m05_a_4ps) || yes(p._hh?.m06_a_benefit_4ps),
    headsOnly: true,
    statusLabel: "4Ps",
    detailField: (p) => yes(p.m05_a_4ps) || yes(p.m06_a_benefit_4ps) || yes(p._hh?.m05_a_4ps) || yes(p._hh?.m06_a_benefit_4ps),
    detailLabel: "4Ps Status",
  },
  {
    key: "under_three_meals",
    label: "Household Heads Eating Less Than 3 Meals/Day",
    title: "Household Heads Eating Less Than 3 Meals a Day by Barangay",
    test: (p) => !!p._hh && isUnderThreeMeals(p._hh),
    headsOnly: true,
    statusLabel: "Less than 3 meals/day",
    detailField: (p) => getMealFrequency(p._hh).label,
    detailLabel: "Food frequency",
  },
  {
    key: "food_stamp",
    label: "Food Stamp Household Heads",
    title: "Food Stamp Household Heads by Barangay",
    test: (p) => yes(p._hh?.m05_d_food_stamp) || yes(p._hh?.m06_d_benefit_food_stamp),
    headsOnly: true,
    statusLabel: "Food Stamp",
    detailField: (p) => yes(p._hh?.m05_d_food_stamp) || yes(p._hh?.m06_d_benefit_food_stamp),
    detailLabel: "Food Stamp Status",
  },
  {
    key: "socpen",
    label: "Social Pension Household Heads",
    title: "Social Pension Household Heads by Barangay",
    test: (p) => yes(p._hh?.m05_b_socpen) || yes(p._hh?.m06_b_benefit_socpen),
    headsOnly: true,
    statusLabel: "Social Pensioner",
    detailField: (p) => yes(p._hh?.m05_b_socpen) || yes(p._hh?.m06_b_benefit_socpen),
    detailLabel: "SocPen Status",
  },
  {
    key: "solo_parent",
    label: "Solo Parents",
    title: "Solo Parents by Barangay",
    test: (p) => yes(p.b05_solo_parent) || yes(p.b06_solo_parent_id),
    statusLabel: "Solo Parent",
    detailField: (p) => p.b06_solo_parent_id,
    detailLabel: "Solo Parent ID",
  },
  {
    key: "farmers",
    label: "Farmers",
    title: "Farmers by Barangay",
    test: (p) => yes(p.e17_farmer),
    statusLabel: "Farmer",
    detailField: (p) => p.e17_farmer,
    detailLabel: "Farmer",
  },
  {
    key: "fisherfolk",
    label: "Fisherfolk",
    title: "Fisherfolk by Barangay",
    test: isFisherfolk,
    statusLabel: "Fisherfolk",
    detailField: (p) => p.e18_fisherfolk,
    detailLabel: "Fisherfolk",
  },
  {
    key: "employed",
    label: "Employed",
    title: "Employed Persons by Barangay",
    test: (p) => String(p.e01_employment_status ?? "").toLowerCase() === "employed",
    statusLabel: "Employed",
    detailField: (p) => p.e01_employment_status,
    detailLabel: "Employment Status",
  },
  {
    key: "unemployed",
    label: "Unemployed",
    title: "Unemployed Persons by Barangay",
    test: (p) => /^u[nm]employed$/i.test(String(p.e01_employment_status ?? "")),
    statusLabel: "Unemployed",
    detailField: (p) => p.e01_employment_status,
    detailLabel: "Employment Status",
  },
  {
    key: "coconut_farmers",
    label: "Coconut Farmers",
    title: "Coconut Farmers by Barangay",
    test: isCoconutFarmer,
    statusLabel: "Coconut Farmer",
    detailField: (p) => yes(p.e17_farmer),
    detailLabel: "Farmer",
  },
];

function yesNo(v: any): string {
  if (yes(v)) return "YES";
  if (v === "No" || v === 0 || v === "0" || v === false) return "NO";
  return "NOT STATED";
}

function sectorMembers(persons: any[], sector: (typeof SECTORS)[number]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of persons) {
    if (sector.headsOnly && !isHead(p)) continue;
    if (!sector.test(p)) continue;
    const key = sector.headsOnly ? hhKey(p) : `${hhKey(p)}-${p.line_number ?? p._full_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}


function incomeStatus(value: number | null): string {
  if (value === null) return "NOT REPORTED";
  if (value < 15000) return "BELOW ₱15,000";
  if (value < 20000) return "₱15,000–19,999";
  return "₱20,000 AND ABOVE";
}

function householdHeadFor(household: any, persons: any[]): any | null {
  const key = hhKey(household);
  const members = persons.filter((p) => hhKey(p) === key);
  return members.find(isHead) || members[0] || null;
}

export interface BookOptions {
  year: DataYear;
  barangay?: string;
  sections: BookSectionId[];
  includeNameLists?: boolean;
}

interface YearIndex {
  version: number;
  barangay: string;
  persons: any[];
  households: any[];
  barangayNames: string[];
  perBarangay: Map<string, { persons: any[]; households: any[] }>;
}

let cache: { key: string; index: YearIndex } | null = null;

function getIndex(year: DataYear, barangay = ""): YearIndex {
  const version = getDataVersion();
  const key = `${year}|${barangay}|${version}`;
  if (cache && cache.key === key) return cache.index;

  const ds = getYearDatasets(year);
  const hhByKey = new Map<string, any>();
  for (const h of ds.households) hhByKey.set(hhKey(h), h);

  const persons: any[] = [];
  for (const p of ds.persons) {
    if (barangay && p.area_name !== barangay) continue;
    persons.push({ ...p, _hh: hhByKey.get(hhKey(p)), _full_name: fullName(p) });
  }
  const households = barangay ? ds.households.filter((h) => h.area_name === barangay) : ds.households.slice();

  const perBarangay = new Map<string, { persons: any[]; households: any[] }>();
  const ensure = (name: string) => {
    const n = txt(name);
    if (!perBarangay.has(n)) perBarangay.set(n, { persons: [], households: [] });
    return perBarangay.get(n)!;
  };
  for (const p of persons) ensure(p.area_name).persons.push(p);
  for (const h of households) ensure(h.area_name).households.push(h);

  const index: YearIndex = {
    version,
    barangay,
    persons,
    households,
    barangayNames: Array.from(perBarangay.keys()).sort(byName),
    perBarangay,
  };
  cache = { key, index };
  return index;
}

const AGE_BANDS: [string, number, number][] = [
  ["0-5 years", 0, 5],
  ["6-12 years", 6, 12],
  ["13-17 years", 13, 17],
  ["18-24 years", 18, 24],
  ["25-39 years", 25, 39],
  ["40-59 years", 40, 59],
  ["60 years and over", 60, 200],
];

function sourceNote(_year: DataYear) {
  // The official source is shown once on the cover. Table notes contain methodology/context only.
  return "";
}


function comparativeScoped(ds: ReturnType<typeof getYearDatasets>, barangay: string) {
  return {
    persons: ds.persons.filter((p: any) => !barangay || p.area_name === barangay),
    households: ds.households.filter((h: any) => !barangay || h.area_name === barangay),
  };
}

function comparativeYes(v: any) {
  return v === "Yes" || v === "YES" || v === 1 || v === "1" || v === true;
}

function comparativeCountYes(rows: any[], key: string): number | null {
  const defined = rows.filter((r) => r?.[key] !== null && r?.[key] !== undefined && r?.[key] !== "");
  return defined.length ? defined.filter((r) => comparativeYes(r[key])).length : null;
}

function comparativeCountLabel(rows: any[], key: string, value: string): number | null {
  const defined = rows.filter((r) => r?.[key] !== null && r?.[key] !== undefined && r?.[key] !== "");
  return defined.length ? defined.filter((r) => String(r[key]).toLowerCase() === value.toLowerCase()).length : null;
}

function comparativeMetric(ds: ReturnType<typeof getYearDatasets>, barangay: string) {
  const { persons, households } = comparativeScoped(ds, barangay);
  const income = households.filter((h: any) => getHouseholdIncome(h) !== null);
  const aged = (lo: number, hi: number) => {
    const defined = persons.filter((p: any) => Number.isFinite(Number(p.a05_age)));
    return defined.length ? defined.filter((p: any) => Number(p.a05_age) >= lo && Number(p.a05_age) <= hi).length : null;
  };
  const fourPsRows = households.filter((h: any) =>
    (h.m05_a_4ps != null && h.m05_a_4ps !== "") || (h.m06_a_benefit_4ps != null && h.m06_a_benefit_4ps !== ""),
  );
  const socpenRows = households.filter((h: any) =>
    (h.m05_b_socpen != null && h.m05_b_socpen !== "") || (h.m06_b_benefit_socpen != null && h.m06_b_benefit_socpen !== ""),
  );
  return {
    population: persons.length,
    households: households.length,
    male: comparativeCountLabel(persons, "a03_sex", "Male"),
    female: comparativeCountLabel(persons, "a03_sex", "Female"),
    children: aged(0, 14),
    youth: aged(15, 24),
    seniors: aged(60, 200),
    pwd: comparativeCountYes(persons, "b10_pwd"),
    employed: comparativeCountLabel(persons, "e01_employment_status", "Employed"),
    unemployed: comparativeCountLabel(persons, "e01_employment_status", "Unemployed"),
    farmers: comparativeCountYes(persons, "e17_farmer"),
    fisherfolk: comparativeCountYes(persons, "e18_fisherfolk"),
    fourPs: fourPsRows.length ? fourPsRows.filter((h: any) => comparativeYes(h.m05_a_4ps) || comparativeYes(h.m06_a_benefit_4ps)).length : null,
    socpen: socpenRows.length ? socpenRows.filter((h: any) => comparativeYes(h.m05_b_socpen) || comparativeYes(h.m06_b_benefit_socpen)).length : null,
    internet: comparativeCountYes(households, "k01_internet_access"),
    electricity: comparativeCountYes(households, "o11_electricity"),
    overcrowded: (() => {
      const defined = households.filter((h: any) => h.overcrowding_status != null && h.overcrowding_status !== "");
      return defined.length ? defined.filter((h: any) => String(h.overcrowding_status).toLowerCase() === "overcrowded").length : null;
    })(),
    low15: income.length ? income.filter((h: any) => getHouseholdIncome(h)! < 15000).length : null,
    low20: income.length ? income.filter((h: any) => getHouseholdIncome(h)! < 20000).length : null,
    incomeReported: income.length,
  };
}

type ComparativeBookMetric = {
  key: string;
  label: string;
  group: string;
  description: string;
  value: (m: ReturnType<typeof comparativeMetric>) => number | null;
};

const COMPARATIVE_BOOK_METRICS: ComparativeBookMetric[] = [
  { key: "population", label: "Population", group: "Population", description: "All person records", value: (m) => m.population },
  { key: "households", label: "Households", group: "Population", description: "Household records", value: (m) => m.households },
  { key: "children", label: "Children 0–14", group: "Age & vulnerability", description: "Children and young adolescents", value: (m) => m.children },
  { key: "youth", label: "Youth 15–24", group: "Age & vulnerability", description: "Youth population", value: (m) => m.youth },
  { key: "seniors", label: "Senior citizens 60+", group: "Age & vulnerability", description: "Older persons", value: (m) => m.seniors },
  { key: "pwd", label: "Persons with disability", group: "Age & vulnerability", description: "Persons flagged as PWD", value: (m) => m.pwd },
  { key: "employed", label: "Employed", group: "Work & livelihood", description: "Employment status", value: (m) => m.employed },
  { key: "unemployed", label: "Unemployed", group: "Work & livelihood", description: "Unemployment status", value: (m) => m.unemployed },
  { key: "farmers", label: "Farmers", group: "Work & livelihood", description: "Farmer indicator", value: (m) => m.farmers },
  { key: "fisherfolk", label: "Fisherfolk", group: "Work & livelihood", description: "Fisherfolk indicator", value: (m) => m.fisherfolk },
  { key: "fourPs", label: "4Ps households", group: "Social protection", description: "4Ps enrollment / benefit", value: (m) => m.fourPs },
  { key: "socpen", label: "Social pension households", group: "Social protection", description: "Social pension enrollment / benefit", value: (m) => m.socpen },
  { key: "internet", label: "Households with internet", group: "Services & housing", description: "Household internet access", value: (m) => m.internet },
  { key: "electricity", label: "Households with electricity", group: "Services & housing", description: "Household electricity", value: (m) => m.electricity },
  { key: "overcrowded", label: "Overcrowded households", group: "Services & housing", description: "Overcrowding status", value: (m) => m.overcrowded },
  { key: "low15", label: "Households below ₱15,000 income", group: "Income", description: "Reported family income below ₱15,000", value: (m) => m.low15 },
  { key: "low20", label: "Households below ₱20,000 income", group: "Income", description: "Reported family income below ₱20,000", value: (m) => m.low20 },
];

function buildComparativeSection(barangay: string): BookSection {
  const ds2022 = getYearDatasets(2022);
  const ds2024 = getYearDatasets(2024);
  const m22 = comparativeMetric(ds2022, barangay);
  const m24 = comparativeMetric(ds2024, barangay);
  const comparable = COMPARATIVE_BOOK_METRICS.map((metric) => {
    const y2022 = metric.value(m22);
    const y2024 = metric.value(m24);
    const change = y2022 == null || y2024 == null ? null : y2024 - y2022;
    const pct = y2022 == null || y2022 === 0 || y2024 == null ? null : ((y2024 - y2022) / y2022) * 100;
    return { key: metric.key, indicator: metric.label, group: metric.group, description: metric.description, y2022, y2024, change, percent_change: pct == null ? "N/A" : `${pct.toFixed(1)}%` };
  });
  const graphTables: BookTable[] = [
    {
      id: "comparison-graph-population",
      title: "Graph — Population & Age Profile (2022 vs 2024)",
      columns: [{ key: "indicator", label: "Indicator" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "percent_change", label: "Change" }],
      rows: comparable.filter((r) => ["population", "households", "children", "youth", "seniors"].includes(r.key)),
      note: "Bars show relative magnitude within each indicator; exact counts and change percentages are shown alongside the graph.",
    },
    {
      id: "comparison-graph-livelihood",
      title: "Graph — Work & Livelihood (2022 vs 2024)",
      columns: [{ key: "indicator", label: "Indicator" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "percent_change", label: "Change" }],
      rows: comparable.filter((r) => ["employed", "unemployed", "farmers", "fisherfolk"].includes(r.key)),
      note: "Comparison of selected livelihood indicators using the available fields in each CBMS year.",
    },
    {
      id: "comparison-graph-social",
      title: "Graph — Social Protection & Services (2022 vs 2024)",
      columns: [{ key: "indicator", label: "Indicator" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "percent_change", label: "Change" }],
      rows: comparable.filter((r) => ["fourPs", "socpen", "internet", "electricity", "overcrowded"].includes(r.key)),
      note: "Household-level service and social-protection indicators are compared using the same field definitions used by the Comparative Analysis module.",
    },
    {
      id: "comparison-graph-income",
      title: "Graph — Reported Household Income Thresholds (2022 vs 2024)",
      columns: [{ key: "indicator", label: "Indicator" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "percent_change", label: "Change" }],
      rows: comparable.filter((r) => r.group === "Income"),
      note: "Income indicators count only households with a reportable family-income value.",
    },
  ];
  const changeRanking = comparable
    .filter((r) => r.y2022 != null && r.y2024 != null)
    .sort((a, b) => Math.abs((b.change ?? 0)) - Math.abs((a.change ?? 0)))
    .map((r, i) => ({ rank: i + 1, indicator: r.indicator, group: r.group, y2022: r.y2022, y2024: r.y2024, change: r.change, percent_change: r.percent_change }));
  const basis = barangay ? `Barangay ${barangay}` : "Area-wide";
  return {
    id: "comparative",
    title: "Comparative Analysis — CBMS 2022 vs 2024",
    intro: `Comparative indicators and visual graphs for ${basis}. The same definitions used by the Comparative Analysis module are carried into the compendium so the narrative and exported book remain aligned.`,
    tables: [
      ...graphTables,
      { id: "comparison-summary", title: "Comparative Indicator Matrix — 2022 vs 2024", columns: [{ key: "indicator", label: "Indicator" }, { key: "group", label: "Group" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "change", label: "Absolute Change" }, { key: "percent_change", label: "% Change" }], rows: comparable },
      { id: "comparison-change-ranking", title: "Change Ranking", columns: [{ key: "rank", label: "Rank" }, { key: "indicator", label: "Indicator" }, { key: "group", label: "Group" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "change", label: "Change" }, { key: "percent_change", label: "% Change" }], rows: changeRanking },
    ],
  };
}

export function buildBook({ year, barangay = "", sections, includeNameLists = false }: BookOptions): ReportBook {
  const idx = getIndex(year, barangay);
  const { persons, households, barangayNames, perBarangay } = idx;
  const note = sourceNote(year);
  const out: BookSection[] = [];
  const pop = persons.length;

  const calculationNote = (title: string, columns: BookColumn[], rows: any[]) => {
    const keys = columns.map((c) => c.key.toLowerCase());
    const labels = columns.map((c) => c.label.toLowerCase());
    const hasPercent = keys.some((k) => /share|percent|percentage/.test(k)) || labels.some((l) => /%|share|percentage|rate/.test(l));
    if (!hasPercent) return `Data extraction: records from the selected CBMS ${year} dataset and selected coverage; rows are grouped by the fields shown in the table. No percentage calculation is applied.`;
    if (keys.includes("share_of_icc")) return `Data extraction: persons classified as Indigenous Cultural Communities/Indigenous Peoples are grouped by reported ethnicity. Formula: Share of ICC/IP (%) = ethnicity count ÷ total ICC/IP count × 100.`;
    if (keys.includes("share_of_population")) return `Data extraction: counts are taken from the selected CBMS ${year} population records. Formula: Share of population (%) = row count ÷ applicable population denominator × 100.`;
    const percentLabel = labels.find((l) => /% of household heads|% of population|% of persons|percentage \/ rate|% below|share/.test(l));
    if (percentLabel) return `Data extraction: counts are computed from the records represented by the Count/Value and Base/Total columns. Formula: ${percentLabel.includes("rate") || percentLabel.includes("percentage") ? "Percentage / Rate" : "Percentage"} (%) = numerator ÷ the table's stated denominator/base × 100.`;
    return `Data extraction: records are counted from the selected CBMS ${year} dataset. Formula: percentage/share (%) = row count or value ÷ applicable total denominator × 100. Percentages are rounded to two decimal places.`;
  };
  const table = (id: string, title: string, columns: BookColumn[], rows: any[], customNote?: string): BookTable => ({
    id, title, columns, rows,
    note: `${customNote ?? note}${customNote || note ? " " : ""}${calculationNote(title, columns, rows)}`,
  });

  if (sections.includes("overview")) {
    const male = persons.filter((p) => p.a03_sex === "Male").length;
    const female = persons.filter((p) => p.a03_sex === "Female").length;
    const avgSize = households.length ? households.reduce((s, h) => s + Number(h.hh_size || 0), 0) / households.length : 0;
    const incomeReported = households.filter((h) => Number.isFinite(Number(h.h06_total_family_income)) && h.h06_total_family_income !== null && h.h06_total_family_income !== "");
    const below20 = incomeReported.filter((h) => Number(h.h06_total_family_income) < 20000).length;

    const ind = [
      { indicator: "Total population", value: pop, share: "100.00%" },
      { indicator: "Male", value: male, share: share(male, pop) },
      { indicator: "Female", value: female, share: share(female, pop) },
      { indicator: "Total households", value: households.length, share: "100.00%" },
      { indicator: "Average household size", value: avgSize ? Number(avgSize.toFixed(2)) : 0, share: "-" },
      { indicator: "Barangays covered", value: barangayNames.length, share: "-" },
      { indicator: "Households with reported family income", value: incomeReported.length, share: share(incomeReported.length, households.length) },
      { indicator: "Households with income below PHP 20,000", value: below20, share: share(below20, incomeReported.length) },
    ];

    const svc = [
      { service: "With electricity", value: households.filter((h) => yes(h.o11_electricity)).length },
      { service: "Without electricity", value: households.filter((h) => h.o11_electricity === "No").length },
      { service: "With internet access", value: households.filter((h) => yes(h.k01_internet_access)).length },
      { service: "Owned or owner-like tenure", value: households.filter((h) => /own/i.test(String(h.o09_tenure ?? ""))).length },
    ].map((r) => ({ ...r, share: share(r.value, households.length) }));

    const sectorRows = SECTORS.map((s) => {
      const members = sectorMembers(persons, s);
      return {
        sector: s.label,
        basis: s.headsOnly ? "Household heads" : "Individuals",
        count: members.length,
        share: share(members.length, s.headsOnly ? households.length : pop),
      };
    });

    out.push({
      id: "overview",
      title: "Municipal Overview",
      intro: `Headline indicators for CBMS ${year}${barangay ? `, Barangay ${barangay}` : ", area-wide"}.`,
      tables: [
        table("ov-key", `Key Indicators - CBMS ${year}`, [{ key: "indicator", label: "Indicator" }, { key: "value", label: "Count / Value" }, { key: "share", label: "Percentage Rate (%Rate)" }], ind),
        table("ov-svc", `Household Services and Tenure - CBMS ${year}`, [{ key: "service", label: "Household condition" }, { key: "value", label: "Households" }, { key: "share", label: "Percentage of households (%Population)" }], svc),
        table("ov-sector", `Sectoral Summary - CBMS ${year}`, [{ key: "sector", label: "Sector" }, { key: "basis", label: "Counting basis" }, { key: "count", label: "Count" }, { key: "share", label: "Percentage Rate (%Rate)" }], sectorRows),
      ],
    });
  }

  if (sections.includes("comparative")) out.push(buildComparativeSection(barangay));

  if (sections.includes("demographics")) {
    const bandRows = AGE_BANDS.map(([label, lo, hi]) => {
      const inBand = persons.filter((p) => { const a = Number(p.a05_age); return Number.isFinite(a) && a >= lo && a <= hi; });
      const m = inBand.filter((p) => p.a03_sex === "Male").length;
      const f = inBand.filter((p) => p.a03_sex === "Female").length;
      return { band: label, male: m, female: f, total: inBand.length, share: share(inBand.length, pop) };
    });
    const notStatedAge = persons.filter((p) => !Number.isFinite(Number(p.a05_age))).length;
    if (notStatedAge) bandRows.push({ band: "Age not stated", male: 0, female: 0, total: notStatedAge, share: share(notStatedAge, pop) });

    const childRows = barangayNames.map((name) => {
      const bp = perBarangay.get(name)!.persons;
      const kids = bp.filter((p) => Number.isFinite(Number(p.a05_age)) && Number(p.a05_age) <= 17);
      return {
        barangay: name,
        children_0_5: kids.filter((p) => Number(p.a05_age) <= 5).length,
        children_6_12: kids.filter((p) => Number(p.a05_age) >= 6 && Number(p.a05_age) <= 12).length,
        children_13_17: kids.filter((p) => Number(p.a05_age) >= 13).length,
        total: kids.length,
        share: share(kids.length, bp.length),
      };
    });

    const iccCounts = new Map<string, number>();
    const excludedEthnicities = new Set(["", "none", "not applicable", "not stated", "no", "n/a", "cebuano", "bisaya", "binisaya", "tagalog", "ilocano", "ilonggo", "hiligaynon", "bicolano", "waray", "kapampangan", "pangasinense", "chavacano", "filipino"]);
    for (const p of persons) {
      const v = String(p.a09_ethnicity ?? "").trim();
      if (v && !excludedEthnicities.has(v.toLowerCase())) iccCounts.set(v, (iccCounts.get(v) || 0) + 1);
    }
    const iccTotal = Array.from(iccCounts.values()).reduce((a, b) => a + b, 0);
    const iccRows = Array.from(iccCounts.entries())
      .sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
      .map(([ethnicity, count]) => ({ ethnicity, count, share_of_icc: share(count, iccTotal), share_of_population: share(count, pop) }));

    out.push({
      id: "demographics",
      title: "Demographics",
      intro: `Age, sex and cultural-community structure for CBMS ${year}. Blank entries are reported as "Not Stated" and are never estimated.`,
      tables: [
        table("dm-bands", `Population by Age Band and Sex - CBMS ${year}`, [{ key: "band", label: "Age band" }, { key: "male", label: "Male" }, { key: "female", label: "Female" }, { key: "total", label: "Total" }, { key: "share", label: "Percentage of population (%Population)" }], bandRows),
        table("dm-children", `Children 0-17 Years by Barangay - CBMS ${year}`, [{ key: "barangay", label: "Barangay" }, { key: "children_0_5", label: "0-5" }, { key: "children_6_12", label: "6-12" }, { key: "children_13_17", label: "13-17" }, { key: "total", label: "Total children" }, { key: "share", label: "Percentage of barangay population (%Population)" }], childRows),
        table("dm-icc", `Indigenous Cultural Communities by Reported Ethnicity - CBMS ${year}`, [{ key: "ethnicity", label: "Ethnicity" }, { key: "count", label: "Persons" }, { key: "share_of_icc", label: "Share of ICC/IP" }, { key: "share_of_population", label: "Share of population" }], iccRows),
      ],
    });
  }

  if (sections.includes("barangays")) {
    const rows = barangayNames.map((name) => {
      const b = perBarangay.get(name)!;
      const avg = b.households.length ? b.households.reduce((s, h) => s + Number(h.hh_size || 0), 0) / b.households.length : 0;
      return {
        barangay: name,
        population: b.persons.length,
        male: b.persons.filter((p) => p.a03_sex === "Male").length,
        female: b.persons.filter((p) => p.a03_sex === "Female").length,
        households: b.households.length,
        average_size: avg ? Number(avg.toFixed(2)) : 0,
        share: share(b.persons.length, pop),
      };
    });
    out.push({
      id: "barangays",
      title: "Barangay Profiles",
      intro: `Population and household distribution across all barangays, CBMS ${year}, sorted A-Z.`,
      tables: [table("bg-profile", `Population and Households by Barangay - CBMS ${year}`, [
        { key: "barangay", label: "Barangay" },
        { key: "population", label: "Population" },
        { key: "male", label: "Male" },
        { key: "female", label: "Female" },
        { key: "households", label: "Households" },
        { key: "average_size", label: "Avg. household size" },
        { key: "share", label: "Percentage of population (%Population)" },
      ], rows)],
    });
  }

  if (sections.includes("sectors")) {
    const tables: BookTable[] = [];
    const matrixAll = barangayNames.map((name) => {
      const bp = perBarangay.get(name)!.persons;
      const row: Record<string, any> = { barangay: name };
      for (const s of SECTORS) row[s.key] = sectorMembers(bp, s).length;
      return row;
    });
    const activeMatrixSectors = SECTORS.filter((s) => matrixAll.some((row) => Number(row[s.key]) > 0));
    const matrix = matrixAll.map((row) => {
      const trimmed: Record<string, any> = { barangay: row.barangay };
      for (const s of activeMatrixSectors) trimmed[s.key] = row[s.key];
      return trimmed;
    });
    if (activeMatrixSectors.length) tables.push(table("sc-matrix", `Sector Counts by Barangay - CBMS ${year}`, [
      { key: "barangay", label: "Barangay" },
      ...activeMatrixSectors.map((s) => ({ key: s.key, label: s.label })),
    ], matrix));

    // -----------------------------------------------------------------------
    // Household income below ₱20,000 is a household-level priority report.
    // It is included in the compendium's complete-name option so the 2022
    // household-income data is represented exactly like the other sectors.
    // -----------------------------------------------------------------------
    const incomeRowsByBarangay = new Map<string, any[]>();
    for (const name of barangayNames) incomeRowsByBarangay.set(name, []);
    const reportedIncomeHouseholds = households
      .map((h) => ({ household: h, income: getHouseholdIncome(h), head: householdHeadFor(h, persons) }))
      .filter((x) => x.income !== null);
    const lowIncomeHouseholds = reportedIncomeHouseholds.filter((x) => (x.income as number) < 20000);
    const incomeSummary = [
      { summary: "Households with income below ₱20,000", value: lowIncomeHouseholds.length, percentage: share(lowIncomeHouseholds.length, reportedIncomeHouseholds.length) },
      { summary: "Households with income ₱20,000 and above", value: Math.max(0, reportedIncomeHouseholds.length - lowIncomeHouseholds.length), percentage: share(Math.max(0, reportedIncomeHouseholds.length - lowIncomeHouseholds.length), reportedIncomeHouseholds.length) },
      { summary: "Households with reported income", value: reportedIncomeHouseholds.length, percentage: share(reportedIncomeHouseholds.length, households.length) },
      { summary: "Total households", value: households.length, percentage: households.length ? "100.00%" : "0.00%" },
      { summary: "No. of Barangay", value: barangayNames.length, percentage: "-" },
    ];

    const incomeBarangaySummary = barangayNames.map((name) => {
      const b = perBarangay.get(name)!;
      const reported = b.households.map((h) => getHouseholdIncome(h)).filter((v): v is number => v !== null);
      const low = reported.filter((v) => v < 20000).length;
      return {
        barangay: name,
        below20: low,
        reported: reported.length,
        total: b.households.length,
        share: share(low, reported.length),
      };
    });
    incomeBarangaySummary.push({
      barangay: "TOTAL",
      below20: lowIncomeHouseholds.length,
      reported: reportedIncomeHouseholds.length,
      total: households.length,
      share: share(lowIncomeHouseholds.length, reportedIncomeHouseholds.length),
    });

    // Keep a compact household-level report in every book; detailed names are
    // added only when the operator enables the complete roster checkbox.
    tables.push(table("income-20k", `Household Income Below ₱20,000 - CBMS ${year}`, [
      { key: "summary", label: "Summary" },
      { key: "value", label: "Count / Value" },
      { key: "percentage", label: "Percentage Rate (%Rate)" },
    ], includeNameLists ? incomeSummary : [
      { summary: "Households with income below ₱20,000", value: lowIncomeHouseholds.length, percentage: share(lowIncomeHouseholds.length, reportedIncomeHouseholds.length) },
      { summary: "Households with reported income", value: reportedIncomeHouseholds.length, percentage: share(reportedIncomeHouseholds.length, households.length) },
      { summary: "Total households", value: households.length, percentage: households.length ? "100.00%" : "0.00%" },
    ], `${note} Household-level H06 Total Family Income; this is not an individual salary.`));

    tables.push(table("income-20k-by-brgy", `Household Income Below ₱20,000 - Summary by Barangay`, [
      { key: "barangay", label: "Barangay" },
      { key: "below20", label: "Below ₱20,000" },
      { key: "reported", label: "Reported Income" },
      { key: "total", label: "Total Households" },
      { key: "share", label: "% Below ₱20k" },
    ], incomeBarangaySummary, `${note} Households are counted only when H06 Total Family Income is numeric.`));

    if (includeNameLists) {
      const detailedIncomeColumns: BookColumn[] = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "income", label: "Household Income" },
        { key: "status", label: "Income Status" },
      ];
      for (const x of lowIncomeHouseholds) {
        const name = txt(x.household.area_name);
        if (!incomeRowsByBarangay.has(name)) incomeRowsByBarangay.set(name, []);
        const head = x.head;
        incomeRowsByBarangay.get(name)!.push({
          _full_name: head?._full_name || fullName(head || {}),
          a03_sex: txt(head?.a03_sex),
          a05_age: Number.isFinite(Number(head?.a05_age)) ? Number(head?.a05_age) : "Not Stated",
          income: `₱${(x.income as number).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
          status: incomeStatus(x.income),
        });
      }
      for (const name of barangayNames) {
        const rows = (incomeRowsByBarangay.get(name) || []).sort((a, b) => byName(a._full_name, b._full_name));
        if (!rows.length) continue;
        tables.push(table(
          `income-20k-detail-${pageSlug(name)}`,
          `Barangay: ${name}`,
          detailedIncomeColumns,
          rows,
          `${note} Priority household list: H06 Total Family Income below ₱20,000. Household head shown where available.`,
        ));
      }

      // Also provide the person-level view requested by the sector screen:
      // every person who lives in a household whose reported income is below
      // ₱20,000. This prevents undercounting families where the head is not
      // available in the normalized person join.
      const lowHhKeys = new Set(lowIncomeHouseholds.map((x) => hhKey(x.household)));
      const personIncomeByBarangay = new Map<string, any[]>();
      for (const name of barangayNames) personIncomeByBarangay.set(name, []);
      for (const p of persons) {
        if (!lowHhKeys.has(hhKey(p))) continue;
        const h = p._hh;
        const income = getHouseholdIncome(h);
        if (income === null || income >= 20000) continue;
        const name = txt(p.area_name);
        if (!personIncomeByBarangay.has(name)) personIncomeByBarangay.set(name, []);
        personIncomeByBarangay.get(name)!.push({
          _full_name: p._full_name,
          a03_sex: txt(p.a03_sex),
          a05_age: Number.isFinite(Number(p.a05_age)) ? Number(p.a05_age) : "Not Stated",
          income: `₱${income.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
          status: incomeStatus(income),
        });
      }
      tables.push(table("income-20k-persons-summary", `Persons Living in Households Below ₱20,000 - CBMS ${year}`, [
        { key: "summary", label: "Summary" },
        { key: "value", label: "Count / Value" },
        { key: "percentage", label: "Percentage Rate (%Rate)" },
      ], [
        { summary: "Persons in households below ₱20,000", value: Array.from(personIncomeByBarangay.values()).reduce((n, r) => n + r.length, 0), percentage: share(Array.from(personIncomeByBarangay.values()).reduce((n, r) => n + r.length, 0), persons.length) },
        { summary: "Total population", value: persons.length, percentage: persons.length ? "100.00%" : "0.00%" },
      ], `${note} Each person is linked to the reported household H06 income.`));
      tables.push(table("income-20k-persons-by-brgy", `Persons in Households Below ₱20,000 - Summary by Barangay`, [
        { key: "barangay", label: "Barangay" },
        { key: "below20", label: "Persons < ₱20k HH" },
        { key: "total", label: "Total Persons" },
        { key: "share", label: "Percentage of population (%Population)" },
      ], [
        ...barangayNames.map((name) => {
          const rows = personIncomeByBarangay.get(name) || [];
          const b = perBarangay.get(name)!;
          return { barangay: name, below20: rows.length, total: b.persons.length, share: share(rows.length, b.persons.length) };
        }),
        { barangay: "TOTAL", below20: Array.from(personIncomeByBarangay.values()).reduce((n, r) => n + r.length, 0), total: persons.length, share: share(Array.from(personIncomeByBarangay.values()).reduce((n, r) => n + r.length, 0), persons.length) },
      ], `${note} Persons linked to households with H06 Total Family Income below ₱20,000.`));
      for (const name of barangayNames) {
        const rows = (personIncomeByBarangay.get(name) || []).sort((a, b) => byName(a._full_name, b._full_name));
        if (!rows.length) continue;
        tables.push(table(
          `income-20k-person-detail-${pageSlug(name)}`,
          `Barangay: ${name} - Persons in Low-Income Households`,
          detailedIncomeColumns,
          rows,
          `${note} Persons are linked to households with H06 Total Family Income below ₱20,000.`,
        ));
      }
    }

    for (const s of SECTORS) {
      const rows = barangayNames.map((name) => {
        const b = perBarangay.get(name)!;
        const count = sectorMembers(b.persons, s).length;
        const base = s.headsOnly ? b.persons.filter(isHead).length : b.persons.length;
        return { barangay: name, count, base, share: share(count, base) };
      });
      tables.push(table(`sc-${s.key}`, `${s.title} - CBMS ${year}`, [
        { key: "barangay", label: "Barangay" },
        { key: "count", label: s.headsOnly ? "Household heads" : "Persons" },
        { key: "base", label: s.headsOnly ? "Household heads" : "Barangay population" },
        { key: "share", label: s.headsOnly ? "% of household heads" : "% of population" },
      ], rows));

      if (!includeNameLists) continue;

      const membersByBarangay = new Map<string, any[]>();
      for (const name of barangayNames) {
        const b = perBarangay.get(name)!;
        const members = sectorMembers(b.persons, s)
          .map((p) => ({
            ...p,
            _full_name: p._full_name || fullName(p),
            a03_sex: txt(p.a03_sex),
            a05_age: Number.isFinite(Number(p.a05_age)) ? Number(p.a05_age) : "Not Stated",
          }))
          .sort((a, b) => byName(a._full_name, b._full_name));
        membersByBarangay.set(name, members);
      }

      const matchedTotal = Array.from(membersByBarangay.values()).reduce((n, rows2) => n + rows2.length, 0);
      if (matchedTotal === 0) continue;
      const denominator = s.headsOnly ? persons.filter(isHead).length : pop;
      const complement = Math.max(0, denominator - matchedTotal);
      const complementLabel =
        s.key === "senior" ? "Non-Senior Citizens" :
        s.key === "pwd" ? "Without Disability" :
        s.key === "children" ? "Age 18 and Over" :
        s.key === "fourps" ? "Non-4Ps Household Heads" :
        s.key === "food_stamp" ? "Other Household Heads" :
        s.key === "under_three_meals" ? "3+ meals/day or not explicitly below 3" :
        s.key === "socpen" ? "Other Household Heads" :
        s.key === "solo_parent" ? "Non-Solo Parents" :
        s.key === "farmers" ? "Non-Farmers" :
        s.key === "fisherfolk" ? "Non-Fisherfolk" :
        s.key === "employed" ? "Not Employed" :
        s.key === "unemployed" ? "Not Unemployed" :
        s.key === "coconut_farmers" ? "Non-Coconut Farmers" :
        "Not in sector";

      const summaryRows = [
        { summary: s.label, value: matchedTotal, percentage: share(matchedTotal, denominator) },
        { summary: complementLabel, value: complement, percentage: share(complement, denominator) },
        { summary: s.headsOnly ? "Total Household Heads" : "Total Population", value: denominator, percentage: denominator ? "100.00%" : "0.00%" },
        { summary: "No. of Barangay", value: barangayNames.length, percentage: "-" },
      ];

      tables.push(table(`sc-${s.key}-summary`, s.title, [
        { key: "summary", label: "Summary" },
        { key: "value", label: "Count / Value" },
        { key: "percentage", label: "Percentage Rate (%Rate)" },
      ], summaryRows));

      const detailSummaryRows = barangayNames.map((name) => {
        const b = perBarangay.get(name)!;
        const members = membersByBarangay.get(name) || [];
        const base = s.headsOnly ? b.persons.filter(isHead).length : b.persons.length;
        return { barangay: name, count: members.length, other: Math.max(0, base - members.length), total: base, share: share(members.length, base) };
      });
      detailSummaryRows.push({ barangay: "TOTAL", count: matchedTotal, other: complement, total: denominator, share: share(matchedTotal, denominator) });

      tables.push(table(`sc-${s.key}-by-brgy`, `${s.label} - Summary by Barangay`, [
        { key: "barangay", label: "Barangay" },
        { key: "count", label: s.label },
        { key: "other", label: s.headsOnly ? "Other" : "Not in sector" },
        { key: "total", label: s.headsOnly ? "Total Household Heads" : "Total Population" },
        { key: "share", label: s.headsOnly ? "% of household heads" : "% of population" },
      ], detailSummaryRows));

      const baseDetailColumns: BookColumn[] = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "_status", label: "Status" },
      ];
      if (s.detailField && s.detailLabel) baseDetailColumns.push({ key: "_detail", label: s.detailLabel });

      for (const name of barangayNames) {
        const members = membersByBarangay.get(name) || [];
        if (!members.length) continue;
        const detailRows = members.map((p) => ({
          _full_name: p._full_name,
          a03_sex: txt(p.a03_sex),
          a05_age: Number.isFinite(Number(p.a05_age)) ? Number(p.a05_age) : "Not Stated",
          _status: s.statusLabel,
          _detail: detailValue(s, p),
        }));
        tables.push(table(
          `sc-${s.key}-detail-${pageSlug(name)}`,
          `Barangay: ${name}`,
          baseDetailColumns,
          detailRows,
          `${note} ${s.title}.`,
        ));
      }
    }

    out.push({
      id: "sectors",
      title: "Sectors by Barangay",
      intro: includeNameLists
        ? `Complete sector compendium for CBMS ${year}. Each sector includes a Summary, Summary by Barangay, and detailed names per barangay. Household income below ₱20,000 is included with household-head and person-level priority lists.`
        : `Priority sector counts per barangay for CBMS ${year}. Enable “Include complete sector rosters” to add names, summary tables, by-barangay tables and household-income priority lists.`,
      tables,
    });
  }

  if (sections.includes("reports")) {
    const tables = REPORTS.flatMap((r) => {
      const source = r.source === "households" ? households : persons;
      const { rows, total } = frequency(source, r);
      if (!total) return [];
      const withTotal = [...rows, { category: "TOTAL", count: total, percent: "100.00%" }];
      return [table(`rp-${r.id}`, `${r.title} - CBMS ${year}`, [
        { key: "category", label: "Category" },
        { key: "count", label: r.source === "households" ? "Households" : "Persons" },
        { key: "percent", label: "Percentage Rate (%Rate)" },
      ], withTotal)];
    });
    if (tables.length) out.push({ id: "reports", title: "Statistical Reports", intro: `Complete frequency distributions for CBMS ${year}.`, tables });
  }

  const filteredSections = out.filter((section) => section.tables.length > 0);

  return {
    year,
    title: `CBMS ${year} Selected Local Area`,
    subtitle: `Community-Based Monitoring System - Consolidated Statistical Report`,
    generatedAt: new Date().toLocaleString(),
    scope: barangay ? `Barangay ${barangay}` : "Area-wide",
    sections: filteredSections,
  };
}

// ---------------------------------------------------------------------------
// Printable book (Folio portrait)
// ---------------------------------------------------------------------------
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const cell = (v: any) => (typeof v === "number" ? v.toLocaleString() : esc(v));

function detailValue(s: (typeof SECTORS)[number], p: any) {
  if (!s.detailField) return undefined;
  const raw = s.detailField(p);
  if (s.key === "employed" || s.key === "unemployed" || s.key === "under_three_meals") return txt(raw);
  return yesNo(raw);
}

const pageSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

function tableAnchor(t: BookTable, si: number, ti: number) {
  return `tbl-${pageSlug(t.id || t.title)}-${si}-${ti}`;
}

function isDetailTable(t: BookTable) {
  return /(?:^|-)detail(?:-|$)/i.test(t.id) || /^barangay:/i.test(t.title);
}

function isSectorDetailTable(t: BookTable) {
  return /^sc-(?:.+)-detail-/i.test(t.id) || /^income-20k-(?:detail|person-detail)-/i.test(t.id);
}

interface TocEntry {
  label: string;
  anchor: string;
  level: 0 | 1 | 2;
  tableId?: string;
}

function makeTocEntries(book: ReportBook): TocEntry[] {
  const entries: TocEntry[] = [];
  book.sections.forEach((s, si) => {
    const sectionAnchor = `sec-${s.id}`;
    entries.push({ label: `Part ${si + 1} — ${s.title}`, anchor: sectionAnchor, level: 0 });
    if (s.id !== "sectors") {
      s.tables.forEach((t, ti) => entries.push({ label: `${si + 1}.${ti + 1} ${t.title}`, anchor: tableAnchor(t, si, ti), level: 1, tableId: t.id }));
      return;
    }
    const categories: { key: string; label: string; ids: string[]; startsWith?: string }[] = [
      { key: "income", label: "Household Income Below ₱20,000", ids: ["income-20k", "income-20k-by-brgy", "income-20k-persons-summary", "income-20k-persons-by-brgy"], startsWith: "income-20k" },
      ...SECTORS.map((sector) => ({ key: sector.key, label: sector.label, ids: [`sc-${sector.key}`, `sc-${sector.key}-summary`, `sc-${sector.key}-by-brgy`], startsWith: `sc-${sector.key}-detail-` })),
    ];
    // The matrix is the top-level sector overview.
    const matrixIndex = s.tables.findIndex((t) => t.id === "sc-matrix");
    if (matrixIndex >= 0) entries.push({ label: `Overview — Sector Counts by Barangay`, anchor: tableAnchor(s.tables[matrixIndex], si, matrixIndex), level: 1, tableId: "sc-matrix" });
    for (const cat of categories) {
      const first = s.tables.findIndex((t) => cat.ids.includes(t.id));
      if (first < 0) continue;
      entries.push({ label: cat.label, anchor: tableAnchor(s.tables[first], si, first), level: 1, tableId: s.tables[first].id });
      const mainTables = s.tables
        .map((t, ti) => ({ t, ti }))
        .filter(({ t }) => cat.ids.includes(t.id));
      for (const { t, ti } of mainTables) entries.push({ label: t.title, anchor: tableAnchor(t, si, ti), level: 2, tableId: t.id });
      const firstDetail = s.tables.findIndex((t) => cat.startsWith && t.id.startsWith(cat.startsWith));
      if (firstDetail >= 0) {
        entries.push({ label: "Detailed barangay rosters (opens first barangay)", anchor: tableAnchor(s.tables[firstDetail], si, firstDetail), level: 2, tableId: s.tables[firstDetail].id });
      }
    }
  });
  return entries;
}

function renderTable(t: BookTable, si: number, ti: number) {
  const head = t.columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const rows = t.rows.length
    ? t.rows.map((r) => {
        const isTotal = String(r[t.columns[0].key] ?? "").trim().toUpperCase() === "TOTAL";
        const cells = t.columns.map((c, i) => `<td class="${i === 0 ? "lbl" : "data"}">${cell(r[c.key])}</td>`).join("");
        return `<tr${isTotal ? ' class="total"' : ""}>${cells}</tr>`;
      }).join("")
    : `<tr><td class="lbl" colspan="${t.columns.length}">No records for this table in the selected CBMS year.</td></tr>`;
  const anchor = tableAnchor(t, si, ti);
  const isBarangayDetail = isDetailTable(t);
  const titlePrefix = isBarangayDetail ? "" : `<span class="tno">Table ${si + 1}.${ti + 1}</span>`;
  if (t.id.startsWith("comparison-graph-")) {
    const graph = t.rows.map((r) => { const a=Number(r.y2022)||0; const b=Number(r.y2024)||0; const max=Math.max(1,a,b); return `<div class="cmp-row"><div class="cmp-label">${esc(r.indicator)}</div><div class="cmp-line"><span class="cmp-year">22</span><div class="cmp-track"><div class="cmp-bar y22" style="width:${a/max*100}%"></div></div><strong>${esc(r.y2022==null?"N/A":a.toLocaleString())}</strong></div><div class="cmp-line"><span class="cmp-year">24</span><div class="cmp-track"><div class="cmp-bar y24" style="width:${b/max*100}%"></div></div><strong>${esc(r.y2024==null?"N/A":b.toLocaleString())}</strong></div></div>`; }).join("");
    return `<section class="tbl comparison-chart" id="${anchor}"><h3>${titlePrefix}${esc(t.title)}</h3><div class="cmp-chart">${graph}</div>${t.note ? `<p class="src">${esc(t.note)}</p>` : ""}</section>`;
  }
  return `<section class="tbl${isBarangayDetail ? " barangay-detail" : ""}" id="${anchor}">
    <h3>${titlePrefix}${esc(t.title)}</h3>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    ${t.note ? `<p class="src">${esc(t.note)}</p>` : ""}
  </section>`;
}

function renderHtmlToc(book: ReportBook): string {
  const toc = makeTocEntries(book);
  const output: string[] = [];
  let currentPart = "";
  for (const e of toc) {
    if (e.level === 0) {
      if (currentPart) output.push("</ol></details>");
      currentPart = e.anchor;
      output.push(`<details class="toc-part" open><summary><a href="#${e.anchor}">${esc(e.label)}</a></summary><ol>`);
    } else if (e.level === 1) {
      output.push(`<li class="toc-l1"><a href="#${e.anchor}">${esc(e.label)}</a></li>`);
    } else {
      output.push(`<li class="toc-l2"><a href="#${e.anchor}">${esc(e.label)}</a></li>`);
    }
  }
  if (currentPart) output.push("</ol></details>");
  return output.join("");
}

export function buildBookHtml(book: ReportBook): string {
  const note = sourceNote(book.year);
  const body = book.sections.map((s, si) => {
    const tables = s.tables.map((t, ti) => renderTable(t, si, ti)).join("");
    return `<section class="part" id="sec-${s.id}"><div class="part-head"><div class="kicker">Part ${si + 1}</div><h2>${esc(s.title)}</h2>${s.intro ? `<p>${esc(s.intro)}</p>` : ""}</div>${tables}</section>`;
  }).join("");
  const tocHtml = renderHtmlToc(book);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(book.title)}</title>
<style>
@page{size:215.9mm 330.2mm;margin:12mm 14mm 16mm}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fff;color:#25313f;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;line-height:1.35}
.cover{height:302mm;display:flex;flex-direction:column;break-after:page;background:linear-gradient(145deg,#0b2340,#174c7f 58%,#0e6a8d);color:#fff;overflow:hidden}.cover-top{height:235mm;padding:10mm 12mm;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}.cover-logo{width:42mm;height:42mm;object-fit:contain;margin-bottom:5mm;filter:drop-shadow(0 10px 24px rgba(0,0,0,.25))}.cover-kicker{font-size:9pt;letter-spacing:.22em;line-height:1.15;font-weight:800;text-transform:uppercase;color:#cfe9f7}.cover-title{font-size:31pt;line-height:1;font-weight:900;letter-spacing:.02em;text-transform:uppercase;margin-top:3mm}.cover-subtitle{margin-top:8mm;padding:4mm 8mm;font-size:12pt;font-weight:700;line-height:1.25;color:#0b2239;background:rgba(255,255,255,.9);max-width:175mm;border-radius:3mm}.cover-meta{margin-top:5mm;font-size:10.5pt;line-height:1.45;color:#10314d;background:rgba(255,255,255,.85);padding:3mm 8mm;max-width:150mm;border-radius:3mm}.cover-bottom{height:67mm;padding:8mm 12mm;background:rgba(2,18,35,.45);display:flex;align-items:center;justify-content:center;gap:8mm;text-align:center}.cover-info{font-size:9pt;line-height:1.55;color:#dbe7f5}.cover-info strong{color:#fff}
.toc{break-after:page;padding-bottom:6mm}.toc h2{font-size:18pt;color:#163b66;border-bottom:1px solid #163b66;padding-bottom:3mm;margin:0 0 6mm}.toc-part{margin:0 0 3mm;border:1px solid #d5dde6;border-radius:2.5mm;overflow:hidden;break-inside:avoid}.toc-part summary{padding:3mm 4mm;background:#eef2f6;color:#163b66;font-weight:800;cursor:pointer}.toc-part summary::marker{color:#163b66}.toc-part summary a{text-decoration:none;color:inherit}.toc-part ol{margin:0;padding:1.5mm 5mm 3mm 10mm;list-style:none}.toc-part li{border-bottom:.35pt dotted #c4ccd6;padding:1.2mm 0}.toc-part a{color:#283544;text-decoration:none}.toc-l1 a{font-weight:700}.toc-l2{padding-left:6mm!important;font-size:8.2pt}.toc-l2:before{content:"↳ ";color:#8a97a6}
.part{break-before:page}.part-head{border-bottom:1.1px solid #163b66;padding-bottom:4mm;margin-bottom:6mm}.part-head .kicker{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#66788b;font-weight:800}.part-head h2{font-size:19pt;line-height:1.1;margin:2mm 0;color:#163b66}.part-head p{margin:0;font-size:9pt;color:#4e5e6f}.tbl{break-inside:auto;margin-bottom:7mm}.tbl.barangay-detail{break-before:page}.tbl h3{font-size:10.8pt;line-height:1.2;margin:0 0 2.5mm;color:#1b2d42}.tbl.barangay-detail h3{font-size:16pt;margin-bottom:4mm;padding-bottom:3mm;border-bottom:1.1px solid #cbd4df}.tbl.barangay-detail h3:before{content:"Barangay detail";display:block;font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:#68798b;margin-bottom:1mm}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.45pt solid #bfc8d2;padding:1.65mm 1.8mm;font-size:8.1pt;word-break:break-word;vertical-align:top}th{background:#dfe5ec;font-weight:800;text-align:left;color:#1f2933}td.data,td.lbl{text-align:left}tbody tr:nth-child(even) td{background:#fafbfc}tr.total td{background:#eef1f5;font-weight:800;border-top:1px solid #7f8b97}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.src{margin:1.6mm 0 0;font-size:7pt;color:#687789}.comparison-chart{break-inside:avoid;padding:3mm 0}.cmp-chart{display:grid;gap:4mm}.cmp-row{border:1px solid #d7dfe8;border-radius:2mm;padding:3mm}.cmp-label{font-weight:800;color:#1f3348;margin-bottom:2mm}.cmp-line{display:grid;grid-template-columns:10mm 1fr 22mm;align-items:center;gap:2mm;margin-top:1.3mm;font-size:7.5pt}.cmp-year{font-weight:800;color:#64748b}.cmp-track{height:3.5mm;background:#eef2f6;border-radius:99px;overflow:hidden}.cmp-bar{height:100%;border-radius:99px}.cmp-bar.y22{background:#355b8c}.cmp-bar.y24{background:#4e8a67}
@media screen{body{padding:8mm;max-width:216mm;margin:0 auto;background:#eef2f6}.cover,.toc,.part{background:#fff}.toc-part summary{position:sticky;top:0}}
</style></head><body>
<section class="cover"><div class="cover-top"><img class="cover-logo" src="${logoUrl}" alt="CBMS Insights logo"><div class="cover-kicker">Community-Based Monitoring System</div><div class="cover-title">CBMS Insights</div><div class="cover-subtitle">Consolidated Statistical Report</div><div class="cover-meta"><strong>Data year:</strong> CBMS ${esc(book.year)}<br><strong>Coverage:</strong> ${esc(book.scope)}<br><strong>Parts included:</strong> ${book.sections.length}<br><strong>Tables:</strong> ${book.sections.reduce((n,s)=>n+s.tables.length,0)}</div></div><div class="cover-bottom"><div class="cover-info"><div><strong>CBMS ${esc(book.year)} · Generated report</strong></div><div>${esc(book.generatedAt)}</div></div></div></section>
<section class="toc"><h2>Table of Contents</h2><p style="margin:0 0 5mm;color:#657487;font-size:8.5pt">Click any part, report, or detailed roster to jump directly to that section.</p>${tocHtml}</section>${body}
</body></html>`;
}

// ── Download helpers ───────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function dataUrlParts(dataUrl: string) {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const encoded = match[3];
  try {
    if (match[2]) {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { mime, bytes };
    }
    const decoded = decodeURIComponent(encoded);
    const bytes = new TextEncoder().encode(decoded);
    return { mime, bytes };
  } catch {
    return null;
  }
}

function addCoverToPdf(pdf: jsPDF, book: ReportBook) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(11,35,64); pdf.rect(0, 0, w, h, "F");
  pdf.setFillColor(23,76,127); pdf.rect(0, 0, w, 105, "F");
  try { pdf.addImage(logoUrl, "PNG", (w - 46) / 2, 16, 46, 46); } catch {}
  pdf.setTextColor(210,236,247); pdf.setFont("helvetica","bold"); pdf.setFontSize(11); pdf.text("COMMUNITY-BASED MONITORING SYSTEM", w/2, 72, {align:"center"});
  pdf.setTextColor(255,255,255); pdf.setFontSize(28); pdf.text("CBMS INSIGHTS", w/2, 89, {align:"center"});
  pdf.setFillColor(255,255,255); pdf.roundedRect(14, 118, w-28, 112, 4, 4, "F");
  pdf.setTextColor(23,61,109); pdf.setFont("helvetica","bold"); pdf.setFontSize(32); pdf.text(`CBMS ${book.year}`, w/2, 145, {align:"center"});
  pdf.setFontSize(17); pdf.text("Consolidated Statistical Report", w/2, 163, {align:"center"});
  pdf.setTextColor(70,82,98); pdf.setFont("helvetica","normal"); pdf.setFontSize(10); pdf.text(`Coverage: ${book.scope}`, w/2, 180, {align:"center"});
  pdf.text(`Generated: ${book.generatedAt}`, w/2, 188, {align:"center"});
  pdf.setFillColor(6,37,82); pdf.rect(0, 248, w, 82, "F");
  pdf.setTextColor(225,235,246); pdf.setFont("helvetica","bold"); pdf.setFontSize(9); pdf.text("CBMS INSIGHTS", w/2, 271, {align:"center"});
  pdf.setFont("helvetica","normal"); pdf.setFontSize(8.5); pdf.text("Community data • analysis • reporting • secure export", w/2, 282, {align:"center"});
}

function pdfSafeText(value: any): string {
  // jsPDF's built-in fonts are not reliably Unicode-complete. Use a clean
  // printable fallback for the Philippine peso sign instead of allowing the
  // symbol to be rendered as a broken glyph such as ±.
  return String(value ?? "")
    .replace(/₱/g, "P")
    .replace(/\u00ad/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function pdfColumnStyles(t: BookTable, pageWidth = 215.9) {
  const available = pageWidth - 28;
  const widths: Record<string, number> = {
    barangay: 38,
    _full_name: 68,
    a03_sex: 21,
    a05_age: 14,
    _status: 28,
    status: 36,
    income: 30,
    _detail: 27,
    summary: 76,
    indicator: 76,
    service: 76,
    sector: 54,
    basis: 30,
    category: 82,
    ethnicity: 66,
    band: 36,
    population: 25,
    male: 21,
    female: 21,
    households: 27,
    average_size: 25,
    children_0_5: 24,
    children_6_12: 24,
    children_13_17: 24,
    count: 24,
    value: 27,
    percentage: 32,
    percent: 28,
    share: 30,
    share_of_icc: 32,
    share_of_population: 32,
    base: 28,
    other: 30,
    total: 28,
    reported: 30,
    below20: 30,
  };

  // Never let an unknown/new column fall back to AutoTable's intrinsic width.
  // That is the main cause of right-edge clipping in exported compendia.
  const fallback = Math.max(14, available / Math.max(1, t.columns.length));
  const preferred = t.columns.map((c) => widths[c.key] ?? fallback);

  // The sector matrix is deliberately balanced so the first column remains readable.
  if (t.id === "sc-matrix") {
    preferred[0] = Math.min(52, Math.max(38, available * 0.21));
    const sectorWidth = (available - preferred[0]) / Math.max(1, t.columns.length - 1);
    for (let i = 1; i < preferred.length; i++) preferred[i] = sectorWidth;
  }

  const minimum = t.columns.length >= 8 ? 12 : 16;
  const total = preferred.reduce((a, b) => a + b, 0) || available;
  const scale = available / total;
  const out: Record<number, any> = {};
  preferred.forEach((w, i) => {
    out[i] = { cellWidth: Math.max(minimum, w * scale) };
  });

  // A second normalization pass makes the sum exact even after minimum clamps.
  const clampedTotal = preferred.reduce((sum, w) => sum + Math.max(minimum, w * scale), 0);
  if (clampedTotal !== available && clampedTotal > 0) {
    const factor = available / clampedTotal;
    Object.keys(out).forEach((k) => { out[Number(k)].cellWidth *= factor; });
  }
  return out;
}

function pdfTable(pdf: jsPDF, t: BookTable, startY: number, pageWidth = 215.9) {
  const bodyRows = t.rows.length
    ? t.rows.map((r) => t.columns.map((c) => pdfSafeText(r[c.key])))
    : [["No records for this table in the selected CBMS year."] .concat(t.columns.slice(1).map(() => ""))];
  const numeric = new Set<number>();
  t.columns.forEach((c, i) => {
    if (t.rows.some((r) => typeof r[c.key] === "number")) numeric.add(i);
  });
  const stylesByColumn = pdfColumnStyles(t, pageWidth);
  const wideTable = t.columns.length >= 8;
  const bodyFontSize = wideTable ? 5.8 : 7.4;
  const headFontSize = wideTable ? 5.9 : 7.4;

  autoTable(pdf, {
    startY,
    head: [t.columns.map((c) => pdfSafeText(c.label))],
    body: bodyRows,
    margin: { left: 14, right: 14, top: 18, bottom: 16 },
    tableWidth: "auto",
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontStyle: "normal",
      fontSize: bodyFontSize,
      cellPadding: wideTable ? 1.15 : { top: 1.65, right: 1.8, bottom: 1.65, left: 1.8 },
      lineColor: [188, 196, 205],
      lineWidth: 0.15,
      textColor: [42, 48, 57],
      valign: "middle",
      overflow: "linebreak",
      cellWidth: "wrap",
      minCellHeight: 5.4,
    },
    headStyles: {
      fillColor: [223, 229, 236],
      textColor: [24, 35, 49],
      fontStyle: "bold",
      fontSize: headFontSize,
      minCellHeight: wideTable ? 8 : 7,
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      ...stylesByColumn,
      ...Object.fromEntries(Array.from(numeric).map((i) => [i, { ...(stylesByColumn[i] || {}), halign: "right" }])) as any,
    },
    didParseCell(data) {
      if (data.section === "body" && data.row.raw) {
        const first = String((data.row.raw as any[])[0] ?? "").trim().toUpperCase();
        if (first === "TOTAL") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [238, 241, 245];
        }
      }
    },
  });
  return (pdf as any).lastAutoTable?.finalY ?? startY + 10;
}

function addPdfPageFooter(pdf: jsPDF, book: ReportBook, page: number) {
  pdf.setPage(page);
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(210, 216, 224);
  pdf.setLineWidth(0.2);
  pdf.line(14, h - 12, w - 14, h - 12);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(98, 108, 121);
  pdf.setFontSize(7);
  pdf.text(`CBMS ${book.year} Selected Local Area`, 14, h - 7);
  pdf.text(`Page ${page}`, w - 14, h - 7, { align: "right" });
}

function addPdfTableHeading(pdf: jsPDF, title: string, startY: number, detail = false) {
  const safe = pdfSafeText(title);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(27, 45, 66);
  pdf.setFontSize(detail ? 14.5 : 11.5);
  const lines = pdf.splitTextToSize(safe, pdf.internal.pageSize.getWidth() - 28);
  pdf.text(lines, 14, startY);
  return startY + Math.max(6, lines.length * (detail ? 6.1 : 5.0));
}



function compendiumFileBase(book: ReportBook) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const scope = book.scope && book.scope !== "All barangays (area-wide)" ? String(book.scope).replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"").toUpperCase() : "ALL_AREA";
  return `CBMS${book.year}_COMPENDIUM_${scope}_${stamp}_${makeExportId().replace("EXP-", "")}`;
}

async function packageCompendiumProtected(
  innerFilename: string,
  data: Blob,
  format: "PDF" | "DOCX",
  book: ReportBook,
  password?: string,
) {
  const resolvedPassword = password || generatePassword(16);
  const zipBlobWriter = new BlobWriter("application/zip");
  const writer = new ZipWriter(zipBlobWriter, { password: resolvedPassword, encryptionStrength: 3 });
  await writer.add(innerFilename, new BlobReader(data));
  const readme =
`Protected CBMS Insights Report Compendium

Document: ${book.title}
Data year: CBMS ${book.year}
Coverage: ${book.scope}
Format: ${format}
Generated: ${book.generatedAt}

The ${format} document inside this archive is protected by an AES-256 encrypted ZIP container.
Keep this password separate from the archive when sharing the report.

Password protection: AES-256
Coverage: Selected Local Area
`;
  await writer.add("README.txt", new TextReader(readme));
  await writer.close();
  const zipBlob = await zipBlobWriter.getData();
  const savedFilename = innerFilename.replace(/\.(pdf|docx)$/i, ".protected.zip");
  const savedPath = await saveBlobWithPrompt(zipBlob, savedFilename);
  if (!savedPath) return;
  addExportLog({
    id: makeExportId(),
    timestamp: new Date().toISOString(),
    filename: savedFilename,
    innerFile: innerFilename,
    format,
    title: book.title,
    rowCount: book.sections.reduce((n, sec) => n + sec.tables.reduce((m, t) => m + t.rows.length, 0), 0),
    password: resolvedPassword,
    bytes: zipBlob.size,
    savedPath,
    encryption: "AES-256",
  });
  emitExportPassword(savedFilename, resolvedPassword, format);
}

function showCompendiumPassword(filename: string, password: string, format: string) { emitExportPassword(filename, password, format); }

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function buildPasswordProtectedHtml(html: string): Promise<{ blob: Blob; password: string; filename: string }> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("This browser does not support AES-256 Web Crypto required for protected HTML export.");
  }
  const password = generatePassword(16);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const encryptKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encryptKey, new TextEncoder().encode(html));
  const logoParts = dataUrlParts(logoUrl);
  const logoDataUrl = logoParts ? `data:${logoParts.mime};base64,${bytesToBase64(logoParts.bytes)}` : "";
  const fileToken = bytesToBase64(salt).replace(/[^a-z0-9]/gi, "").slice(0, 18) || "cbms";
  const titleBase = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "CBMS_Compendium";
  const filename = `${titleBase}_${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")}_${fileToken}.protected.html`;
  const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Protected CBMS Compendium</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:linear-gradient(135deg,#0b2748,#eef4fa 55%,#dfe9f3);color:#1f2937;font-family:Arial,Helvetica,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(520px,100%);background:rgba(255,255,255,.96);border:1px solid #d7dee7;border-radius:18px;padding:28px;box-shadow:0 12px 40px rgba(15,23,42,.1)}.brand{display:flex;align-items:center;gap:12px}.logo{width:58px;height:58px;object-fit:contain;border-radius:14px;border:1px solid #d6e0ea;background:#fff;padding:5px}.shield{font-size:30px}.kicker{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#52667d}.card h1{margin:8px 0 6px;font-size:24px}.card p{color:#63748a;line-height:1.5}.row{display:flex;gap:8px;margin-top:18px}.row input{flex:1;border:1px solid #c7d2df;border-radius:10px;padding:11px 12px;font-size:15px}.row button{border:0;border-radius:10px;padding:0 16px;background:#173d6d;color:#fff;font-weight:800;cursor:pointer}.msg{margin-top:12px;font-size:13px;color:#8a3f0b;min-height:18px}.small{font-size:12px;color:#7b8898;margin-top:14px}
</style></head><body><main class="card"><div class="brand">${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="CBMS Insights logo">` : ""}<div class="shield">🔐</div></div><div class="kicker">Private CBMS Export</div><h1>Protected Report Compendium</h1><p>This HTML book is encrypted with AES-256. Enter the password from the system's Export Log. Three wrong passwords will lock this file for 5 hours.</p><div class="row"><input id="password" type="password" autocomplete="current-password" placeholder="Enter password"><button id="unlock">Unlock</button></div><div id="msg" class="msg"></div><div class="small">File security is enforced with PBKDF2 + AES-256-GCM. The password is never stored in this file.</div></main><script>
const PAYLOAD={salt:${JSON.stringify(bytesToBase64(salt))},iv:${JSON.stringify(bytesToBase64(iv))},data:${JSON.stringify(bytesToBase64(new Uint8Array(cipher)))},key:${JSON.stringify(fileToken)}};
const LOCK_MS=5*60*60*1000; const STORE_KEY='cbms-insights.cbms.html.lock.'+PAYLOAD.key; const $=id=>document.getElementById(id); const input=$('password'),msg=$('msg'),btn=$('unlock');
function storage(){try{return window.localStorage}catch{return null}} function readState(){try{const raw=storage()?.getItem(STORE_KEY);return raw?JSON.parse(raw):{attempts:0,lockedUntil:0}}catch{return{attempts:0,lockedUntil:0}}} function writeState(s){try{storage()?.setItem(STORE_KEY,JSON.stringify(s))}catch{}}
function fmt(ms){const s=Math.max(0,Math.ceil(ms/1000));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h+'h '+m+'m '+String(sec).padStart(2,'0')+'s'}
let tick=null; function renderLock(){const s=readState(); if(s.lockedUntil && Date.now()<s.lockedUntil){btn.disabled=true;input.disabled=true;msg.textContent='Too many incorrect attempts. Try again in '+fmt(s.lockedUntil-Date.now())+'.';clearInterval(tick);tick=setInterval(()=>{const x=readState();if(!x.lockedUntil||Date.now()>=x.lockedUntil){writeState({attempts:0,lockedUntil:0});clearInterval(tick);btn.disabled=false;input.disabled=false;msg.textContent='You may enter the password again.'}else msg.textContent='Too many incorrect attempts. Try again in '+fmt(x.lockedUntil-Date.now())+'.'},1000)}else{btn.disabled=false;input.disabled=false}}
function b64(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function unlock(){renderLock();const state=readState();if(state.lockedUntil&&Date.now()<state.lockedUntil)return;const pass=input.value;if(!pass){msg.textContent='Enter the password.';return} btn.disabled=true;msg.textContent='Decrypting securely…';try{const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(PAYLOAD.salt),iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(PAYLOAD.iv)},key,b64(PAYLOAD.data));const html=new TextDecoder().decode(plain);writeState({attempts:0,lockedUntil:0});document.open();document.write(html);document.close()}catch(e){const next={attempts:(state.attempts||0)+1,lockedUntil:0};if(next.attempts>=3){next.attempts=3;next.lockedUntil=Date.now()+LOCK_MS}writeState(next);input.value='';btn.disabled=false;msg.textContent=next.lockedUntil?'Three incorrect attempts. Locked for 5 hours.':('Incorrect password. '+(3-next.attempts)+' attempt(s) remaining before the 5-hour lockout.')}}
btn.addEventListener('click',unlock);input.addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});renderLock();</script></body></html>`;
  return { blob: new Blob([shell], {type:"text/html;charset=utf-8"}), password, filename };
}

export async function downloadBookPdf(book: ReportBook) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [215.9, 330.2] });
  const tocEntries = makeTocEntries(book);
  const tocRowsPerPage = 34;
  const tocPageCount = Math.max(1, Math.ceil(tocEntries.length / tocRowsPerPage));
  addCoverToPdf(pdf, book);

  const tocPages: { entry: TocEntry; page: number; x: number; y: number; w: number; h: number }[] = [];
  for (let pageNo = 0; pageNo < tocPageCount; pageNo++) {
    pdf.addPage([215.9, 330.2], "portrait");
    const w = pdf.internal.pageSize.getWidth();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(22, 59, 102);
    pdf.text("TABLE OF CONTENTS", 14, 18);
    pdf.setDrawColor(22, 59, 102);
    pdf.line(14, 22, w - 14, 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.8);
    pdf.setTextColor(99, 112, 128);
    pdf.text("Click a report entry to jump directly to that category in the PDF.", 14, 29);
    let y = 36;
    const slice = tocEntries.slice(pageNo * tocRowsPerPage, (pageNo + 1) * tocRowsPerPage);
    for (const e of slice) {
      const indent = e.level === 0 ? 0 : e.level === 1 ? 5 : 12;
      pdf.setFont("helvetica", e.level === 0 ? "bold" : "normal");
      pdf.setFontSize(e.level === 0 ? 9.5 : e.level === 1 ? 8.7 : 8.1);
      pdf.setTextColor(e.level === 0 ? 22 : 48, e.level === 0 ? 59 : 61, e.level === 0 ? 102 : 75);
      const line = pdf.splitTextToSize(pdfSafeText(e.label), w - 50 - indent);
      pdf.text(line, 14 + indent, y);
      const height = Math.max(5.5, line.length * 4.1);
      tocPages.push({ entry: e, page: pdf.getNumberOfPages(), x: 14 + indent, y: y - 3.5, w: w - 28 - indent, h: height });
      y += height + (e.level === 0 ? 1.5 : 0);
    }
  }

  const tablePages = new Map<string, number>();
  book.sections.forEach((s, si) => {
    pdf.addPage([215.9, 330.2], "portrait");
    tablePages.set(`sec:${s.id}`, pdf.getNumberOfPages());
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(102, 120, 139);
    pdf.text(`PART ${si + 1}`, 14, 18);
    pdf.setFontSize(19);
    pdf.setTextColor(22, 59, 102);
    pdf.text(pdfSafeText(s.title), 14, 27, { maxWidth: pdf.internal.pageSize.getWidth() - 28 });
    pdf.setDrawColor(22, 59, 102);
    pdf.line(14, 31, pdf.internal.pageSize.getWidth() - 14, 31);
    let y = 38;
    if (s.intro) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(78, 94, 111);
      const intro = pdf.splitTextToSize(pdfSafeText(s.intro), pdf.internal.pageSize.getWidth() - 28);
      pdf.text(intro, 14, y);
      y += intro.length * 4.0 + 2;
    }

    for (const [ti, t] of s.tables.entries()) {
      // Every table gets its own page. Wide tables use landscape orientation so
      // the data never has to be squeezed into unreadable micro-columns.
      const landscape = t.columns.length >= 8 || t.id === "sc-matrix";
      const pageFormat: [number, number] = landscape ? [330.2, 215.9] : [215.9, 330.2];
      pdf.addPage(pageFormat, landscape ? "landscape" : "portrait");
      const pageWidth = pdf.internal.pageSize.getWidth();
      let tableY = 18;
      tablePages.set(t.id, pdf.getNumberOfPages());
      tableY = addPdfTableHeading(pdf, t.title, tableY, isDetailTable(t)) + 3.5;
      if (t.id.startsWith("comparison-graph-")) {
        let gy=tableY;
        for (const row of t.rows) {
          const a=row.y2022==null?null:Number(row.y2022); const b=row.y2024==null?null:Number(row.y2024); const max=Math.max(1,a??0,b??0);
          pdf.setFont("helvetica","bold"); pdf.setFontSize(9); pdf.setTextColor(31,45,62); pdf.text(pdfSafeText(String(row.indicator)),14,gy); gy+=5;
          pdf.setFont("helvetica","normal"); pdf.setFontSize(7.5); pdf.setTextColor(95,108,123); pdf.text("2022",14,gy); pdf.text(a==null?"N/A":a.toLocaleString(),pageWidth-14,gy,{align:"right"});
          pdf.setFillColor(223,230,237); pdf.roundedRect(28,gy-3, pageWidth-62,3,1,1,"F"); pdf.setFillColor(53,91,140); pdf.roundedRect(28,gy-3,(pageWidth-62)*(a??0)/max,3,1,1,"F"); gy+=4.5;
          pdf.setTextColor(95,108,123); pdf.text("2024",14,gy); pdf.text(b==null?"N/A":b.toLocaleString(),pageWidth-14,gy,{align:"right"});
          pdf.setFillColor(223,230,237); pdf.roundedRect(28,gy-3, pageWidth-62,3,1,1,"F"); pdf.setFillColor(78,138,103); pdf.roundedRect(28,gy-3,(pageWidth-62)*(b??0)/max,3,1,1,"F"); gy+=9;
        }
      } else {
        pdfTable(pdf, t, tableY, pageWidth);
      }
      if (t.note) {
        const noteY = Math.min((pdf as any).lastAutoTable?.finalY ?? tableY + 10, pdf.internal.pageSize.getHeight() - 22);
        const note = pdf.splitTextToSize(pdfSafeText(t.note), pageWidth - 28);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.8);
        pdf.setTextColor(102, 119, 137);
        pdf.text(note, 14, noteY + 5);
      }
    }
  });

  // Add clickable destination rectangles to the already-written TOC pages.
  tocPages.forEach((item) => {
    const targetPage = tablePages.get(item.entry.tableId || "") || tablePages.get(`sec:${item.entry.anchor.replace(/^sec-/, "")}`) || 1;
    pdf.setPage(item.page);
    try {
      (pdf as any).link(item.x, item.y, item.w, item.h, { pageNumber: targetPage, y: 0 });
    } catch {}
  });

  // Professional footer: page number and document title only. The official
  // source appears once on the cover, not on every page.
  for (let page = 2; page <= pdf.getNumberOfPages(); page++) addPdfPageFooter(pdf, book, page);

  pdf.setPage(1);
  const blob = pdf.output("blob");
  const innerFilename = `${compendiumFileBase(book)}.pdf`;
  await packageCompendiumProtected(innerFilename, blob, "PDF", book);
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\'/g, "&apos;");
}

function docxRun(text: unknown, bold = false, size = 20) {
  const safe = xmlEscape(String(text ?? ""));
  return `<w:r><w:rPr>${bold?"<w:b/>":""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r>`;
}
function docxParagraph(content: string, opts: {align?: string; before?: number; after?: number; pageBreak?: boolean} = {}) {
  const ppr = `<w:pPr>${opts.align?`<w:jc w:val="${opts.align}"/>`:""}${opts.before!==undefined?`<w:spacing w:before="${opts.before}"/>`:""}${opts.after!==undefined?`<w:spacing w:after="${opts.after}"/>`:""}${opts.pageBreak?"<w:pageBreakBefore/>":""}</w:pPr>`;
  return `<w:p>${ppr}${content}</w:p>`;
}

function docxImageParagraph(relId: string, cx: number, cy: number, docPrId: number) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="CBMS cover image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="cover"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
function docxTable(t: BookTable) {
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="6" w:color="AEB8C4"/><w:left w:val="single" w:sz="6" w:color="AEB8C4"/><w:bottom w:val="single" w:sz="6" w:color="AEB8C4"/><w:right w:val="single" w:sz="6" w:color="AEB8C4"/><w:insideH w:val="single" w:sz="4" w:color="C7CED7"/><w:insideV w:val="single" w:sz="4" w:color="C7CED7"/></w:tblBorders>`;
  const preferred: Record<string, number> = {
    barangay: 2500, _full_name: 5200, a03_sex: 1500, a05_age: 1000, _status: 2000, status: 2200,
    income: 2200, _detail: 2000, summary: 5600, indicator: 5600, service: 5200, sector: 3500, basis: 2600,
    category: 6000, ethnicity: 4800, band: 2600, count: 1600, value: 1800, percentage: 2200, percent: 2000,
    share: 2200, share_of_icc: 2300, share_of_population: 2300, base: 2000, other: 2000, total: 2000, reported: 2200, below20: 2200,
  };
  const pageWidth = 10440;
  const fallback = Math.max(900, Math.floor(pageWidth / Math.max(1, t.columns.length)));
  const raw = t.columns.map((c) => preferred[c.key] ?? fallback);
  const minimum = t.columns.length >= 8 ? 700 : 900;
  const preferredSum = raw.reduce((a, b) => a + b, 0) || pageWidth;
  const scale = pageWidth / preferredSum;
  const widths = raw.map((w) => Math.max(minimum, Math.round(w * scale)));
  let widthSum = widths.reduce((a, b) => a + b, 0);
  // Correct rounding while preserving the first-column emphasis.
  widths[widths.length - 1] += pageWidth - widthSum;
  widthSum = widths.reduce((a, b) => a + b, 0);
  if (widthSum !== pageWidth) widths[0] += pageWidth - widthSum;

  const row = (cells: string[], header = false, total = false) => `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}</w:trPr>${cells.map((c, i) => {
    const width = widths[i] || fallback;
    const shade = header ? `<w:shd w:fill="DFE5EC"/>` : total ? `<w:shd w:fill="EEF1F5"/>` : "";
    const bold = header || total;
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/><w:keepNext w:val="0"/></w:pPr>${docxRun(c, bold, t.columns.length >= 8 ? 13 : 16)}</w:p></w:tc>`;
  }).join("")}</w:tr>`;
  const header = t.columns.map((c) => String(c.label));
  const rows = t.rows.length ? t.rows.map((r) => t.columns.map((c) => String(r[c.key] ?? ""))) : [["No records for this table in the selected CBMS year.", ...t.columns.slice(1).map(() => "")]];
  const body = rows.map((r) => row(r, false, String(r[0] ?? "").trim().toUpperCase() === "TOTAL")).join("");
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${pageWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="55" w:type="dxa"/><w:left w:w="65" w:type="dxa"/><w:bottom w:w="55" w:type="dxa"/><w:right w:w="65" w:type="dxa"/></w:tblCellMar>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${row(header, true, false)}${body}</w:tbl>`;
}

async function makeDocxBlob(book: ReportBook): Promise<Blob> {
  const entries = makeTocEntries(book);
  const bookmarks = new Map<string,string>();
  entries.forEach((e, i) => bookmarks.set(e.anchor, `bm_${i+1}`));
  let bookmarkId = entries.length + 10;
  const body: string[] = [];
  const logoData = dataUrlParts(logoUrl);

  // Cover
  let nextRelId = 2;
  const logoRelId = logoData ? `rId${nextRelId++}` : null;
  if (logoRelId) body.push(docxImageParagraph(logoRelId, 1700000, 1700000, 1));
  body.push(docxParagraph(docxRun("COMMUNITY-BASED MONITORING SYSTEM", false, 24), {align:"center", after:90}));
  body.push(docxParagraph(docxRun("CBMS INSIGHTS", true, 34), {align:"center", after:120}));
  body.push(docxParagraph(docxRun("Consolidated Statistical Report", true, 22), {align:"center", after:90}));
  body.push(docxParagraph(docxRun(`Data year: CBMS ${book.year}`, false, 20), {align:"center", after:40}));
  body.push(docxParagraph(docxRun(`Coverage: ${book.scope}`, false, 20), {align:"center", after:80}));
  body.push(docxParagraph(docxRun(`Generated: ${book.generatedAt}`, false, 17), {align:"center"}));
  body.push(docxParagraph("", {pageBreak:true}));

  // TOC
  body.push(docxParagraph(docxRun("TABLE OF CONTENTS", true, 28), {after:120}));
  body.push(docxParagraph(docxRun("Click a report entry to jump directly to that category.", false, 17), {after:120}));
  entries.forEach((e) => {
    const bm = bookmarks.get(e.anchor)!;
    const indent = e.level * 360;
    const ppr = `<w:pPr><w:ind w:left="${indent}"/><w:spacing w:after="40"/></w:pPr>`;
    body.push(`<w:p>${ppr}<w:hyperlink w:anchor="${xmlEscape(bm)}"><w:r><w:rPr><w:color w:val="163B66"/><w:underline w:val="single"/><w:b/></w:rPr><w:t>${xmlEscape(e.label)}</w:t></w:r></w:hyperlink></w:p>`);
  });
  body.push(docxParagraph("", {pageBreak:true}));

  // Body; a clean page for each report keeps TOC targets unambiguous.
  book.sections.forEach((s, si) => {
    const secAnchor = `sec-${s.id}`;
    const secBm = bookmarks.get(secAnchor) || `bm_sec_${si}`;
    const secId = bookmarkId++;
    body.push(`<w:bookmarkStart w:id="${secId}" w:name="${secBm}"/>`);
    body.push(docxParagraph(docxRun(`PART ${si+1}`, true, 16), {after:50, pageBreak:true}));
    body.push(docxParagraph(docxRun(s.title, true, 28), {after:80}));
    if (s.intro) body.push(docxParagraph(docxRun(s.intro, false, 17), {after:100}));
    body.push(`<w:bookmarkEnd w:id="${secId}"/>`);
    s.tables.forEach((t, ti) => {
      const anchor=tableAnchor(t,si,ti); const bm=bookmarks.get(anchor)||`bm_tbl_${si}_${ti}`;
      const bid=bookmarkId++;
      body.push(`<w:bookmarkStart w:id="${bid}" w:name="${bm}"/>`);
      body.push(docxParagraph(docxRun(t.title, true, isDetailTable(t)?24:19), {pageBreak:true, after:100}));
      body.push(docxTable(t));
      if (t.note) body.push(docxParagraph(docxRun(t.note, false, 14), {before:80}));
      body.push(`<w:bookmarkEnd w:id="${bid}"/>`);
    });
  });
  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="18720"/><w:pgMar w:top="720" w:right="900" w:bottom="720" w:left="900"/><w:cols w:num="1"/></w:sectPr></w:body></w:document>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const imageRels = [
    logoRelId ? `<Relationship Id="${logoRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cbms-insights-logo.png"/>` : "",
  ].join("");
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imageRels}</Relationships>`;
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos"/><w:sz w:val="18"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const settingsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat/><w:themeFontLang w:val="en-US"/></w:settings>`;
  const coreXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>CBMS ${xmlEscape(book.year)} Selected Local Area - Report Compendium</dc:title><dc:creator>Selected Local Area</dc:creator></cp:coreProperties>`;
  const appXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CBMS Insights</Application></Properties>`;
  const zw = new ZipWriter(new BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  await zw.add("[Content_Types].xml", new TextReader(ct));
  await zw.add("_rels/.rels", new TextReader(rootRels));
  await zw.add("docProps/core.xml", new TextReader(coreXml));
  await zw.add("docProps/app.xml", new TextReader(appXml));
  await zw.add("word/styles.xml", new TextReader(stylesXml));
  await zw.add("word/settings.xml", new TextReader(settingsXml));
  await zw.add("word/document.xml", new TextReader(documentXml));
  await zw.add("word/_rels/document.xml.rels", new TextReader(docRels));
  if (logoData) await zw.add("word/media/cbms-insights-logo.png", new BlobReader(new Blob([logoData.bytes], {type:"image/png"})));
  return await zw.close();
}

export async function downloadBookWord(book: ReportBook) {
  const blob = await makeDocxBlob(book);
  const innerFilename = `${compendiumFileBase(book)}.docx`;
  await packageCompendiumProtected(innerFilename, blob, "DOCX", book);
}

export function printBook(book: ReportBook) { emitPrintPreview(buildBookHtml(book), book.title); return true; }

export async function downloadBookHtml(book: ReportBook) {
  const protectedHtml = await buildPasswordProtectedHtml(buildBookHtml(book));
  const savedPath = await saveBlobWithPrompt(protectedHtml.blob, protectedHtml.filename);
  if (!savedPath) return;
  addExportLog({
    id: makeExportId(),
    timestamp: new Date().toISOString(),
    filename: protectedHtml.filename,
    innerFile: protectedHtml.filename,
    format: "HTML",
    title: book.title,
    rowCount: book.sections.reduce((n, sec) => n + sec.tables.reduce((m, t) => m + t.rows.length, 0), 0),
    password: protectedHtml.password,
    bytes: protectedHtml.blob.size,
    savedPath,
    encryption: "AES-256-GCM",
  });
  emitExportPassword(protectedHtml.filename, protectedHtml.password, "HTML");
}

