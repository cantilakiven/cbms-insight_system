import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getActiveBarangay, getActiveYear, getAvailableBarangays, getYearDatasets, getPersonFullName, householdKey } from "@/data/cbms";
import { getMealFrequency, isUnderThreeMeals } from "@/lib/food-frequency";
import { DataTable } from "@/components/DataTable";
import { PersonModal } from "@/components/CBMSModals";
import {
  RULES, type RuleId,
  listSector, getRuleChoice, subscribeRuleChanges, getEnrichedPersons,
} from "@/lib/cbms-recognition";
import { verifySector, verifyGroups } from "@/lib/cbms-verify";
import { Button } from "@/components/ui/button";
import { exportDOCX, exportPDF, printPayload, type ExportColumn, type GroupedExportPayload } from "@/lib/cbms-export";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Download, Info, RotateCcw, Search, Utensils, ClipboardList, Printer } from "lucide-react";

type AggKind =
  | "pantawid_by_brgy"
  | "non_pantawid_by_brgy"
  | "employed_by_brgy"
  | "unemployed_by_brgy"
  | "in_lf_by_brgy"
  | "not_in_lf_by_brgy"
  | "senior_by_brgy"
  | "solo_parent_by_brgy"
  | "socpen_by_brgy"
  | "pwd_by_brgy"
  | "household_income_below_20k_by_brgy"
  | "persons_income_by_brgy"
  | "food_under_three_by_brgy"
  | "food_frequency_daily_by_brgy"
  | "food_frequency_weekly_by_brgy"
  | "skipped_meal_by_brgy";

const NS = "Not Stated";
const txt = (v: any) => (v === null || v === undefined || String(v).trim() === "" ? NS : String(v).trim());
const low = (v: any) => String(v ?? "").toLowerCase();

type SectorSummaryItem = {
  label: string;
  value: number | string;
  percentage?: number | null;
  percentageLabel?: string;
};

const shareOf = (value: number, denominator: number): number | null =>
  denominator > 0 ? (value / denominator) * 100 : null;

const pctText = (value: number | null) => value == null ? "—" : `${value.toFixed(2)}%`;

const sortNamesAZ = (a: string, b: string) =>
  a.replace(/[^a-z0-9]/gi, "").localeCompare(b.replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true });

const getSectorBarangays = (year = getActiveYear()) =>
  Array.from(
    new Set(
      getAvailableBarangays(year)
        .map((b) => String(b.area_name ?? "").trim())
        .filter(Boolean),
    ),
  ).sort(sortNamesAZ);

/** Livelihood / education views driven by a single config (added on request). */
type GenericDef = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  mode: "flag" | "distribution";
  /** flag mode: is this person a member? */
  match?: (p: any) => boolean;
  /** distribution mode: which category does this person fall into? */
  categoryOf?: (p: any) => string;
  /** extra person columns shown in the per-barangay lists */
  extra: { key: string; label: string }[];
  /** label used for the count column in the summary (flag mode) */
  countLabel?: string;
};

const isCoconutFarmer = (p: any) => {
  const occupation = [p.e05_psoc, p.e05_occupation_group, p.legacy_occupation_text].map(low).join(" ");
  const industry = [p.e06_psic, p.e06_industry_group, p.legacy_industry_text].map(low).join(" ");
  return occupation.includes("coconut") || industry.includes("coconut") || /coconut/.test(low(p.legacy_raw?.E07_OCCUPATION));
};

const eduLevel = (p: any): string => {
  const v = low(p.a11_hgc_level || p.a11_hgc_group);
  if (!v) {
    const code = Number(p.legacy_hgc_level_code);
    const byCode: Record<number, string> = {
      0: "Early childhood education", 1: "Elementary level", 2: "Junior high school level",
      3: "Senior high school level", 4: "Post-secondary non-tertiary level",
      5: "Short-cycle tertiary level", 6: "College level", 7: "Masteral level", 8: "Doctoral level",
    };
    return byCode[code] || NS;
  }
  if (v.includes("early childhood") || v.includes("pre-school") || v.includes("preschool")) return "Early childhood education";
  if (v.includes("elementary")) return "Elementary level";
  if (v.includes("junior high")) return "Junior high school level";
  if (v.includes("senior high")) return "Senior high school level";
  if (v.includes("post-secondary") || v.includes("post secondary")) return "Post-secondary non-tertiary level";
  if (v.includes("short-cycle") || v.includes("short cycle")) return "Short-cycle tertiary level";
  if (v.includes("college") || v.includes("baccalaureate") || v.includes("bachelor")) return "College level";
  if (v.includes("master")) return "Masteral level";
  if (v.includes("doctor")) return "Doctoral level";
  if (v.includes("not reported") || v.includes("not stated") || v.includes("no grade")) return NS;
  return txt(p.a11_hgc_level || p.a11_hgc_group);
};

const EDU_LEVELS = [
  "Early childhood education",
  "Elementary level",
  "Junior high school level",
  "Senior high school level",
  "Post-secondary non-tertiary level",
  "Short-cycle tertiary level",
  "College level",
  "Masteral level",
  "Doctoral level",
  NS,
] as const;

const EDU_SLUG: Record<string, string> = {
  "Early childhood education": "edu_early_childhood_by_brgy",
  "Elementary level": "edu_elementary_by_brgy",
  "Junior high school level": "edu_junior_high_by_brgy",
  "Senior high school level": "edu_senior_high_by_brgy",
  "Post-secondary non-tertiary level": "edu_post_secondary_by_brgy",
  "Short-cycle tertiary level": "edu_short_cycle_by_brgy",
  "College level": "edu_college_by_brgy",
  "Masteral level": "edu_masteral_by_brgy",
  "Doctoral level": "edu_doctoral_by_brgy",
  [NS]: "edu_not_stated_by_brgy",
};

/** Expected school-age band per basic-education level (inclusive). */
const EDU_AGE_BANDS: Record<string, [number, number]> = {
  "Early childhood education": [0, 17],
  "Elementary level": [6, 12],
  "Junior high school level": [12, 16],
  "Senior high school level": [16, 18],
};

const ageOf = (p: any): number | null => {
  const n = Number(p?.a05_age);
  return Number.isFinite(n) ? n : null;
};

const inAge = (p: any, lo: number, hi: number) => {
  const a = ageOf(p);
  return a !== null && a >= lo && a <= hi;
};

const EDU_COLUMNS = [
  { key: "a11_hgc_level", label: "Educational Level" },
  { key: "a11_hgc", label: "Highest Grade Completed" },
  { key: "d01_currently_attending_school", label: "Attending School" },
];


const hasAnyDisability = (p: any) =>
  [p.b12_a_visual_disability, p.b12_b_hearing_disability, p.b12_c_mental_disability, p.b12_d_physical_disability, p.b12_e_speech_impairment]
    .some((v) => yes(v)) || String(p.b19_ssdi || "").toLowerCase() === "with disability";

const isFourPsMember = (p: any) =>
  yes(p._hh?.m05_a_4ps) || yes(p._hh?.m06_a_benefit_4ps) || yes(p.m06_a_benefit_4ps);

const isNonFourPsMember = (p: any) => !isFourPsMember(p);

const genericComplementLabel = (def: GenericDef) => {
  const map: Record<string, string> = {
    farmers_by_brgy: "Non-Farmers",
    coconut_farmers_by_brgy: "Non-Coconut Farmers",
    fisherfolk_by_brgy: "Non-Fisherfolk",
    pwd_with_disability_by_brgy: "Without Disability",
    pwd_without_disability_by_brgy: "With Disability",
    fourps_members_by_brgy: "Non-4Ps Members",
    non_fourps_members_by_brgy: "4Ps Members",
    solo_parents_by_brgy_names: "Non-Solo Parents",
    social_pensioners_by_brgy_names: "Non-Social Pensioners",
    safe_walking_at_night_by_brgy: "Not Safe / Not Stated",
    early_childhood_by_brgy_names: "Other Ages / Levels",
  };
  return map[def.id] || `Non-${def.countLabel || "Members"}`;
};

const isSocialPensioner = (p: any) =>
  yes(p.m06_b_benefit_socpen) || yes(p._hh?.m05_b_socpen) || yes(p._hh?.m06_b_benefit_socpen);

const GENERIC_DEFS: GenericDef[] = [
  {
    id: "farmers_by_brgy",
    label: "Farmers by Barangay",
    title: "Farmers by Barangay",
    subtitle: "Persons identified as farmers through the normalized 2022 agriculture indicators, occupation, or industry. Names are listed per barangay.",
    mode: "flag",
    match: (p) => yes(p.e17_farmer),
    countLabel: "Farmers",
    extra: [
      { key: "e17_farmer", label: "Farmer" },
      { key: "e05_occupation_group", label: "Occupation" },
      { key: "e06_industry_group", label: "Industry" },
      { key: "e08_class_of_worker", label: "Class of Worker" },
    ],
  },
  {
    id: "pwd_with_disability_by_brgy",
    label: "PWD with Disability by Barangay",
    title: "PWD with Disability by Barangay",
    subtitle: "Persons with a declared/derived disability based on functional difficulty records in 2022.",
    mode: "flag",
    match: hasAnyDisability,
    countLabel: "PWD with Disability",
    extra: [
      { key: "b19_ssdi", label: "Disability Status" },
      { key: "b12_a_visual_disability", label: "Seeing" },
      { key: "b12_b_hearing_disability", label: "Hearing" },
      { key: "b12_d_physical_disability", label: "Walking / Physical" },
      { key: "b12_e_speech_impairment", label: "Communicating" },
    ],
  },
  {
    id: "pwd_without_disability_by_brgy",
    label: "Persons without Disability by Barangay",
    title: "Persons without Disability by Barangay",
    subtitle: "Persons whose 2022 functional-difficulty responses indicate no disability.",
    mode: "flag",
    match: (p) => !hasAnyDisability(p),
    countLabel: "Without Disability",
    extra: [
      { key: "b19_ssdi", label: "Disability Status" },
      { key: "a03_sex", label: "Sex" },
      { key: "a05_age", label: "Age" },
    ],
  },
  {
    id: "fourps_members_by_brgy",
    label: "4Ps Members by Barangay",
    title: "4Ps Members by Barangay",
    subtitle: "All persons belonging to a 4Ps household or with a recorded 4Ps benefit. Names are shown per barangay.",
    mode: "flag",
    match: isFourPsMember,
    countLabel: "4Ps Members",
    extra: [
      { key: "a02_relation_to_hh_head", label: "Relation" },
      { key: "m06_a_benefit_4ps", label: "Received 4Ps Benefit" },
      { key: "_hh.m05_a_4ps", label: "HH 4Ps" } as any,
    ],
  },
  {
    id: "non_fourps_members_by_brgy",
    label: "Non-4Ps Members by Barangay",
    title: "Non-4Ps Members by Barangay",
    subtitle: "All persons not belonging to a 4Ps household and without a recorded 4Ps benefit.",
    mode: "flag",
    match: isNonFourPsMember,
    countLabel: "Non-4Ps Members",
    extra: [
      { key: "a02_relation_to_hh_head", label: "Relation" },
      { key: "_hh.m05_a_4ps", label: "HH 4Ps" } as any,
      { key: "m06_a_benefit_4ps", label: "Received 4Ps Benefit" },
    ],
  },
  {
    id: "solo_parents_by_brgy_names",
    label: "Solo Parents by Barangay",
    title: "Solo Parents by Barangay",
    subtitle: "Persons self-declared as solo parents or carrying a Solo Parent ID in the normalized 2022 records.",
    mode: "flag",
    match: (p) => yes(p.b05_solo_parent) || yes(p.b06_solo_parent_id),
    countLabel: "Solo Parents",
    extra: [
      { key: "b05_solo_parent", label: "Solo Parent" },
      { key: "b06_solo_parent_id", label: "Solo Parent ID" },
      { key: "a07_marital_status", label: "Civil Status" },
    ],
  },
  {
    id: "social_pensioners_by_brgy_names",
    label: "Social Pensioners by Barangay",
    title: "Social Pensioners by Barangay",
    subtitle: "Persons identified through a person-level Social Pension benefit record or Social Pension household membership.",
    mode: "flag",
    match: isSocialPensioner,
    countLabel: "Social Pensioners",
    extra: [
      { key: "m06_b_benefit_socpen", label: "Received SocPen Benefit" },
      { key: "_hh.m05_b_socpen", label: "HH SocPen" } as any,
      { key: "a02_relation_to_hh_head", label: "Relation" },
    ],
  },
  {
    id: "safe_walking_at_night_by_brgy",
    label: "Safe Walking at Night by Barangay",
    title: "Households Reporting Safe Walking at Night by Barangay",
    subtitle: "Household-level public safety response, displayed using the household head's name. The questionnaire records this at household level.",
    mode: "flag",
    match: (p) => isHead(p) && ["safe", "very safe"].includes(String(p._hh?.l01_safe_walking_alone || "").toLowerCase()),
    countLabel: "Households Reporting Safe / Very Safe",
    extra: [
      { key: "_hh.l01_safe_walking_alone", label: "Safety at Night" } as any,
      { key: "_address", label: "Address" } as any,
      { key: "_purok", label: "Purok / Sitio" } as any,
    ],
  },
  {
    id: "early_childhood_by_brgy_names",
    label: "Early Childhood by Barangay",
    title: "Early Childhood Education by Barangay",
    subtitle: "Young children whose highest grade/level completed is normalized to Early childhood education in the 2022 data.",
    mode: "flag",
    match: (p) => eduLevel(p) === "Early childhood education",
    countLabel: "Early Childhood",
    extra: [
      { key: "a11_hgc_level", label: "Educational Level" },
      { key: "a11_hgc", label: "Highest Grade Completed" },
      { key: "d01_currently_attending_school", label: "Attending School" },
    ],
  },
  {
    id: "coconut_farmers_by_brgy",
    label: "Coconut Farmers by Barangay",
    title: "Coconut Farmers by Barangay",
    subtitle: "Persons whose occupation (PSOC) or industry (PSIC) identifies coconut farming. Blanks shown as “Not Stated”.",
    mode: "flag",
    match: isCoconutFarmer,
    countLabel: "Coconut Farmers",
    extra: [
      { key: "e05_psoc", label: "Occupation (PSOC)" },
      { key: "e06_psic", label: "Industry (PSIC)" },
      { key: "e08_class_of_worker", label: "Class of Worker" },
      { key: "e09_basis_of_payment", label: "Basis of Payment" },
    ],
  },
  {
    id: "fisherfolk_by_brgy",
    label: "Fisherfolk by Barangay",
    title: "Fisherfolk by Barangay",
    subtitle: "Persons flagged as fisherfolk (e18_fisherfolk = Yes) or with fishing occupation/industry.",
    mode: "flag",
    match: (p) => {
      const occupation = [p.e05_psoc, p.e05_occupation_group, p.legacy_occupation_text].map(low).join(" ");
      const industry = [p.e06_psic, p.e06_industry_group, p.legacy_industry_text].map(low).join(" ");
      return yes(p.e18_fisherfolk) || occupation.includes("fisher") || industry.includes("fishing") || industry.includes("fish capture");
    },
    countLabel: "Fisherfolk",
    extra: [
      { key: "e18_fisherfolk", label: "Fisherfolk" },
      { key: "e05_psoc", label: "Occupation (PSOC)" },
      { key: "e06_psic", label: "Industry (PSIC)" },
      { key: "e08_class_of_worker", label: "Class of Worker" },
    ],
  },
  {
    id: "basis_of_payment_by_brgy",
    label: "Salary / Wage Type by Barangay",
    title: "Types of Salary / Wages — All Persons by Barangay",
    subtitle: "Distribution of basis of payment (e09_basis_of_payment) for all persons. Blanks shown as “Not Stated”.",
    mode: "distribution",
    categoryOf: (p: any) => txt(p.e09_basis_of_payment),
    extra: [
      { key: "e09_basis_of_payment", label: "Basis of Payment" },
      { key: "e01_employment_status", label: "Employment Status" },
      { key: "e08_class_of_worker", label: "Class of Worker" },
      { key: "e05_occupation_group", label: "Occupation Group" },
    ],
  },
  {
    id: "class_of_worker_by_brgy",
    label: "Class of Worker by Barangay",
    title: "All Persons by Barangay with Class of Worker",
    subtitle: "Distribution of class of worker (e08_class_of_worker) for all persons. Blanks shown as “Not Stated”.",
    mode: "distribution",
    categoryOf: (p: any) => txt(p.e08_class_of_worker),
    extra: [
      { key: "e08_class_of_worker", label: "Class of Worker" },
      { key: "e07_nature_of_employment", label: "Nature of Employment" },
      { key: "e09_basis_of_payment", label: "Basis of Payment" },
      { key: "e01_employment_status", label: "Employment Status" },
    ],
  },
  // Educational level views. For basic-education levels the cohort is split into the
  // expected school-age band vs. older persons so student data is not mixed with adults.
  ...EDU_LEVELS.flatMap((lvl): GenericDef[] => {
    const isMatch = (p: any) => eduLevel(p) === lvl;
    const base = {
      subtitle: "Based on highest grade/level completed (a11_hgc_level). Blanks shown as “Not Stated”.",
      mode: "flag" as const,
      extra: EDU_COLUMNS,
    };

    if (lvl === NS) {
      // Replaced on request: these records are mostly very young children.
      return [
        {
          ...base,
          id: "age_0_5_by_brgy",
          label: "0-5 Years Old by Barangay",
          title: "Population Aged 0-5 Years by Barangay",
          subtitle: "All persons aged 0 to 5 years old (a05_age). Blanks shown as “Not Stated”.",
          match: (p: any) => inAge(p, 0, 5),
          countLabel: "Children 0-5 Years",
        },
      ];
    }

    const band = EDU_AGE_BANDS[lvl];
    if (!band) {
      return [
        {
          ...base,
          id: EDU_SLUG[lvl],
          label: `${lvl} by Barangay`,
          title: `Population by Educational Level — ${lvl} by Barangay`,
          match: isMatch,
          countLabel: lvl,
        },
      ];
    }

    const [lo, hi] = band;
    const bandText = lvl === "Early childhood education" ? `minors (below ${hi + 1})` : `ages ${lo}-${hi}`;
    return [
      {
        ...base,
        id: EDU_SLUG[lvl],
        label: `${lvl} by Barangay (${lvl === "Early childhood education" ? "Minors" : `Age ${lo}-${hi}`})`,
        title: `Population by Educational Level — ${lvl}, ${bandText}, by Barangay`,
        subtitle: `${lvl} where the person is within the expected school age (${bandText}). Older persons are listed in the separate “older age” view.`,
        match: (p: any) => isMatch(p) && inAge(p, lo, hi),
        countLabel: `${lvl} (${bandText})`,
      },
      {
        ...base,
        id: `${EDU_SLUG[lvl]}_older`,
        label: `${lvl} by Barangay (Older Age)`,
        title: `Population by Educational Level — ${lvl}, older than ${hi} years, by Barangay`,
        subtitle: `${lvl} where the person is older than ${hi} years old — separated so adult records are not counted as current students.`,
        match: (p: any) => isMatch(p) && inAge(p, hi + 1, 200),
        countLabel: `${lvl} (older than ${hi})`,
      },
    ];
  }),
];


const GENERIC_BY_ID = new Map(GENERIC_DEFS.map((d) => [d.id, d]));

type TabId = RuleId | "not_fourps" | AggKind | string;

const AGG_KINDS: AggKind[] = [
  "pantawid_by_brgy",
  "non_pantawid_by_brgy",
  "employed_by_brgy",
  "unemployed_by_brgy",
  "in_lf_by_brgy",
  "not_in_lf_by_brgy",
  "senior_by_brgy",
  "solo_parent_by_brgy",
  "socpen_by_brgy",
  "pwd_by_brgy",
  "household_income_below_20k_by_brgy",
  "persons_income_by_brgy",
  "food_frequency_daily_by_brgy",
  "food_frequency_weekly_by_brgy",
  "skipped_meal_by_brgy",
  "farming_household_by_brgy",
  "farming_poverty_by_brgy",
  "agri_employment_by_brgy",
  "agri_income_by_brgy",
];

const SECTOR_TABS: { id: TabId; label: string }[] = [
  { id: "pwd_by_brgy", label: "PWD by Barangay" },
  { id: "household_income_below_20k_by_brgy", label: "Household Income < ₱20,000" },
  { id: "persons_income_by_brgy", label: "Persons by Household Income" },
  { id: "food_under_three_by_brgy", label: "Households Eating Less Than 3 Meals a Day" },
  { id: "skipped_meal_by_brgy", label: "Households That Skipped a Meal" },
  { id: "farming_household_by_brgy", label: "Farming & Non-Farming Households by Barangay" },
  { id: "farming_poverty_by_brgy", label: "Farming Household Poverty / Low-Income by Barangay" },
  { id: "agri_employment_by_brgy", label: "Agricultural vs Non-Agricultural Employment by Barangay" },
  { id: "agri_income_by_brgy", label: "Agricultural Household Income by Barangay" },
  { id: "pantawid_by_brgy", label: "Pantawid (4Ps) by Barangay" },
  { id: "non_pantawid_by_brgy", label: "Non-Pantawid by Barangay" },
  { id: "employed_by_brgy", label: "Employed by Barangay" },
  { id: "unemployed_by_brgy", label: "Unemployed by Barangay" },
  { id: "in_lf_by_brgy", label: "In Labor Force by Barangay" },
  { id: "not_in_lf_by_brgy", label: "Not in Labor Force by Barangay" },
  { id: "senior_by_brgy", label: "Seniors by Barangay" },
  { id: "solo_parent_by_brgy", label: "Solo Parents by Barangay" },
  { id: "socpen_by_brgy", label: "Social Pensioners by Barangay" },
  ...GENERIC_DEFS.map((d) => ({ id: d.id, label: d.label })),
];

const schema = z.object({
  tab: z.string().catch("pwd_by_brgy").default("pwd_by_brgy"),
});


const yes = (v: any) => v === "Yes" || v === 1 || v === "1" || v === true;
const isHead = (p: any) => p.a02_relation_to_hh_head === "Head" || p.line_number === 1;

export const Route = createFileRoute("/sectors")({
  validateSearch: schema,
  component: SectorsPage,
});

function useRuleVersion() {
  return useSyncExternalStore(
    (cb) => subscribeRuleChanges(cb),
    () => getRuleChoice("pwd") + getRuleChoice("fourps") + getRuleChoice("food_stamp") + getRuleChoice("senior") + getRuleChoice("solo_parent") + getRuleChoice("socpen"),
    () => "ssr",
  );
}

function SectorsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  useRuleVersion();
  const [brgy, setBrgy] = useState<string>("");
  const [tabSearch, setTabSearch] = useState("");
  const year = getActiveYear();
  const activeBarangays = useMemo(() => getAvailableBarangays(year).map((b) => b.area_name), [year]);
  const [selected, setSelected] = useState<any | null>(null);

  const filteredTabs = useMemo(() => {
    const q = tabSearch.trim().toLowerCase();
    if (!q) return SECTOR_TABS;
    return SECTOR_TABS.filter((t) => t.label.toLowerCase().includes(q));
  }, [tabSearch]);

  const currentTabLabel = SECTOR_TABS.find((t) => t.id === tab)?.label ?? tab;
  const hasTab = SECTOR_TABS.some((t) => t.id === tab);
  const activeTab = hasTab ? tab : "pwd_by_brgy";
  const activeGeneric = GENERIC_BY_ID.get(activeTab);
  const activeIsAggregate = (AGG_KINDS as string[]).includes(activeTab) || !!activeGeneric;
  const selectedBarangayValid = !brgy || activeBarangays.includes(brgy);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-r from-primary/10 via-background to-background p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">CBMS Sector Analysis</div>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Sector Rosters</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Find priority groups, compare barangays, and open the underlying person or household records.
                Recognition rules come from the Data Validation & Mapping settings.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Year</div>
                <div className="font-semibold">CBMS {year}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Barangays</div>
                <div className="font-semibold">{activeBarangays.length}</div>
              </div>
              <div className="col-span-2 rounded-xl border border-border bg-background px-3 py-2 sm:col-span-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current View</div>
                <div className="truncate font-semibold">{currentTabLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <span>Choose a sector group, then select the indicator. Search works across all sector filters.</span>
          </div>

          <div className="sector-filter-panel">
            <div className="sector-filter-toolbar">
              <div className="sector-filter-categories" role="tablist" aria-label="Sector groups">
                {(() => {
                  const groups = [
                    ["priority", "Priority & Protection"],
                    ["livelihood", "Employment & Livelihood"],
                    ["agriculture", "Agriculture & Rural Livelihood"],
                    ["education", "Education"],
                  ] as const;
                  const currentId = String(activeTab);
                  const groupFor = (id: string) =>
                    /^(pwd|fourps|not_fourps|pantawid|non_pantawid|senior|solo|socpen|.*income|.*pwd|food_frequency|skipped_meal)/.test(id) ? "priority" :
                    /^(farming_|agri_)/.test(id) ? "agriculture" :
                    /^(employed|unemployed|in_lf|not_in_lf|farmers|coconut|fisher|basis_of_payment|class_of_worker)/.test(id) ? "livelihood" :
                    /^(edu_|early_childhood)/.test(id) ? "education" : "priority";
                  const [firstGroup] = groups;
                  const derived = groupFor(currentId);
                  const activeGroup = (tabSearch ? derived : derived) as typeof firstGroup[0];
                  return groups.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeGroup === id}
                      className={`sector-filter-category ${activeGroup === id ? "is-active" : ""}`}
                      onClick={() => {
                        const first = SECTOR_TABS.find((t) => groupFor(String(t.id)) === id);
                        setTabSearch("");
                        if (first) navigate({ search: { tab: first.id } });
                      }}
                    >
                      {label}
                    </button>
                  ));
                })()}
              </div>
              <div className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={tabSearch}
                  onChange={(e) => setTabSearch(e.target.value)}
                  placeholder="Find a sector or indicator…"
                  aria-label="Find a sector or indicator"
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            {(() => {
              const groupFor = (id: string) =>
                /^(pwd|fourps|not_fourps|pantawid|non_pantawid|senior|solo|socpen|.*income|.*pwd|food_frequency|skipped_meal)/.test(id) ? "priority" :
                    /^(farming_|agri_)/.test(id) ? "agriculture" :
                /^(employed|unemployed|in_lf|not_in_lf|farmers|coconut|fisher|basis_of_payment|class_of_worker)/.test(id) ? "livelihood" :
                /^(edu_|early_childhood)/.test(id) ? "education" : "priority";
              const currentGroup = groupFor(String(activeTab));
              const groupTabs = SECTOR_TABS.filter((t) => groupFor(String(t.id)) === currentGroup);
              const visible = filteredTabs.filter((t) => groupFor(String(t.id)) === currentGroup);
              const options = tabSearch ? filteredTabs : groupTabs;
              return (
                <div className="sector-filter-select-row">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Sector view</div>
                    <div className="relative mt-1.5">
                      <select
                        value={hasTab ? String(activeTab) : "pwd_by_brgy"}
                        onChange={(e) => { setTabSearch(""); navigate({ search: { tab: e.target.value } }); }}
                        className="sector-filter-select"
                        aria-label="Choose sector view"
                      >
                        {options.length ? options.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.label}</option>) : <option value="pwd_by_brgy">No matching sector</option>}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="sector-filter-current">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Current indicator</div>
                    <div className="mt-1 text-sm font-bold">{currentTabLabel}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{options.length} matching sector{options.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {!hasTab && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold">This sector view is no longer available.</div>
                <div className="mt-0.5 text-xs text-muted-foreground">The link may be outdated. PWD by Barangay is the safest default view.</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto shrink-0"
                onClick={() => navigate({ search: { tab: "pwd_by_brgy" } })}
              >
                Open PWD by Barangay
              </Button>
            </div>
          )}

          {!activeIsAggregate && hasTab && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold">Barangay filter</div>
                <div className="text-[11px] text-muted-foreground">Leave this on All barangays to see the complete roster.</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedBarangayValid ? brgy : ""}
                  onChange={(e) => setBrgy(e.target.value)}
                  className="h-9 min-w-48 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="Filter by barangay"
                >
                  <option value="">All barangays</option>
                  {activeBarangays.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {brgy && (
                  <Button size="sm" variant="ghost" onClick={() => setBrgy("")} title="Clear barangay filter">
                    <RotateCcw className="h-4 w-4" />
                    <span className="hidden sm:inline">Clear</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {activeTab === "farming_household_by_brgy" ? (
        <AgricultureByBarangay mode="farming_households" onSelect={setSelected} />
      ) : activeTab === "farming_poverty_by_brgy" ? (
        <AgricultureByBarangay mode="farming_poverty" onSelect={setSelected} />
      ) : activeTab === "agri_employment_by_brgy" ? (
        <AgricultureByBarangay mode="agri_employment" onSelect={setSelected} />
      ) : activeTab === "agri_income_by_brgy" ? (
        <AgricultureByBarangay mode="agri_income" onSelect={setSelected} />
      ) : activeTab === "household_income_below_20k_by_brgy" ? (
        <IncomeByBarangay mode="households" />
      ) : activeTab === "persons_income_by_brgy" ? (
        <IncomeByBarangay mode="persons" />
      ) : activeTab === "food_under_three_by_brgy" || activeTab === "food_frequency_daily_by_brgy" || activeTab === "food_frequency_weekly_by_brgy" ? (
        <FoodHouseholdByBarangay mode="under_three" />
      ) : activeTab === "skipped_meal_by_brgy" ? (
        <FoodHouseholdByBarangay mode="skipped" />
      ) : activeGeneric ? (
        <GenericByBarangay def={activeGeneric} onSelect={setSelected} />
      ) : activeIsAggregate ? (
        <AggregateByBarangay kind={activeTab as AggKind} />
      ) : (
        <RosterView
          tab={activeTab as Exclude<TabId, AggKind>}
          brgy={brgy}
          onSelect={setSelected}
        />
      )}

      <PersonModal person={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RosterView({
  tab, brgy, onSelect,
}: {
  tab: Exclude<TabId, AggKind>;
  brgy: string;
  onSelect: (p: any) => void;
}) {
  const isNotFourPs = tab === "not_fourps";
  const rule = isNotFourPs ? null : RULES.find((r) => r.id === (tab as RuleId));
  const def = isNotFourPs
    ? { title: "Non-4Ps Members (Household Heads)" }
    : rule ?? { title: "Sector Roster" };
  const selectedRule = rule?.options.find((o) => o.id === getRuleChoice(tab as RuleId)) ?? rule?.options[0];
  const ruleChoice = isNotFourPs
    ? { id: "not_fourps", label: "Household head whose household is NOT enrolled in 4Ps" }
    : selectedRule ?? { id: "default", label: "Default recognition rule" };

  const rows = useMemo(() => {
    let list: any[];
    const dedupeHeads = (arr: any[]) => {
      const seen = new Set<string>();
      return arr.filter((p) => {
        if (!isHead(p)) return false;
        const k = `${p.area_code}-${p.husn}-${p.hsn}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    if (isNotFourPs) {
      list = dedupeHeads(
        getEnrichedPersons().filter((p: any) => !yes(p._hh?.m05_a_4ps) && !yes(p._hh?.m06_a_benefit_4ps)),
      );
    } else {
      list = listSector(tab as RuleId);
      if (tab === "fourps" || tab === "food_stamp" || tab === "socpen") {
        list = dedupeHeads(list);
      }
    }
    return list.filter((p) => !brgy || p.area_name === brgy);
  }, [tab, brgy, ruleChoice.id, isNotFourPs]);


  const cols = useMemo(() => baseColumnsFor(tab), [tab]);

  const summary = useMemo(() => {
    if (tab !== "fourps" && tab !== "not_fourps" && tab !== "food_stamp") return undefined;
    const all = getEnrichedPersons();
    const headsInScope = all.filter((p: any) => isHead(p) && (!brgy || p.area_name === brgy));
    const dedupe = (arr: any[]) => {
      const seen = new Set<string>();
      return arr.filter((p) => {
        const k = `${p.area_code}-${p.husn}-${p.hsn}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    if (tab === "fourps" || tab === "not_fourps") {
      const fourps = dedupe(headsInScope.filter((p) => yes(p._hh?.m05_a_4ps) || yes(p._hh?.m06_a_benefit_4ps)));
      const nonFourps = dedupe(headsInScope.filter((p) => !yes(p._hh?.m05_a_4ps) && !yes(p._hh?.m06_a_benefit_4ps)));
      return [
        { label: "Pantawid Members (Heads)", value: fourps.length },
        { label: "Non-Pantawid Members (Heads)", value: nonFourps.length },
        { label: "TOTAL Household Heads", value: fourps.length + nonFourps.length },
      ];
    }
    const fs = dedupe(headsInScope.filter((p) => yes(p._hh?.m05_d_food_stamp) || yes(p._hh?.m06_d_benefit_food_stamp)));
    const nonFs = dedupe(headsInScope.filter((p) => !yes(p._hh?.m05_d_food_stamp) && !yes(p._hh?.m06_d_benefit_food_stamp)));
    return [
      { label: "Food Stamp Members (Heads)", value: fs.length },
      { label: "Non-Food Stamp Members (Heads)", value: nonFs.length },
      { label: "TOTAL Household Heads", value: fs.length + nonFs.length },
    ];
  }, [tab, brgy]);

  const rosterSummary = useMemo<SectorSummaryItem[]>(() => {
    const all = getEnrichedPersons();
    const scoped = all.filter((p: any) => !brgy || p.area_name === brgy);
    const headBased = tab === "fourps" || tab === "not_fourps" || tab === "food_stamp";
    const population = headBased
      ? (() => {
          const seen = new Set<string>();
          return scoped.filter((p: any) => {
            if (!isHead(p)) return false;
            const key = `${p.area_code}-${p.husn}-${p.hsn}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).length;
        })()
      : scoped.length;
    const count = rows.length;
    const share = shareOf(count, population);
    const name = isNotFourPs ? "Non-4Ps Members" : (rule as any)?.title || def.title;
    const items: SectorSummaryItem[] = [
      { label: name, value: count, percentage: share, percentageLabel: `${pctText(share)} of ${headBased ? "household heads" : "total population"} in scope` },
      { label: "Remaining population", value: Math.max(0, population - count), percentage: shareOf(Math.max(0, population - count), population), percentageLabel: `${pctText(shareOf(Math.max(0, population - count), population))} remaining in scope` },
      { label: headBased ? "Total Household Heads" : "Total Population", value: population, percentage: population > 0 ? 100 : null, percentageLabel: population > 0 ? "100% population base" : "No population recorded" },
      { label: "No. of Barangay", value: new Set(scoped.map((p: any) => p.area_name).filter(Boolean)).size },
    ];
    return items;
  }, [tab, brgy, rows.length, isNotFourPs, (rule as any)?.title, def.title]);

  const title = `${def.title} — Roster${brgy ? ` (Barangay ${brgy})` : ""}`;
  const subtitle = `Rule applied: ${ruleChoice.label} • Total: ${rows.length.toLocaleString()} record(s)`;

  return (
    <>
      <VerifyPanel tab={tab} brgy={brgy} rows={rows} summary={summary} />

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Export {def.title}</div>
          <div className="text-xs text-muted-foreground">{rows.length.toLocaleString()} record(s){brgy ? ` · Barangay ${brgy}` : " · All Barangays"}</div>
        </div>
        <SectorExportActions
          title={title}
          subtitle={subtitle}
          columns={cols}
          rows={rows}
          summary={rosterSummary}
          groups={new Map(Array.from(new Set(rows.map((r:any)=>txt(r.area_name)))).sort(sortNamesAZ).map((b) => [b, rows.filter((r:any)=>txt(r.area_name)===b)]))}
        />
      </section>

      <DataTable
        title={title}
        subtitle={subtitle}
        rows={rows}
        columns={cols}
        summary={rosterSummary}
        onRowClick={onSelect}
        emptyText="No matching persons. Try changing barangay or recognition rule."
        hideExport
      />
    </>
  );
}

function AggregateByBarangay({ kind }: { kind: AggKind }) {
  const category: "fourps" | "employment" | "labor_force" | "senior" | "solo_parent" | "socpen" | "pwd" =
    kind === "pantawid_by_brgy" || kind === "non_pantawid_by_brgy" ? "fourps"
    : kind === "employed_by_brgy" || kind === "unemployed_by_brgy" ? "employment"
    : kind === "senior_by_brgy" ? "senior"
    : kind === "solo_parent_by_brgy" ? "solo_parent"
    : kind === "socpen_by_brgy" ? "socpen"
    : kind === "pwd_by_brgy" ? "pwd"
    : "labor_force";

  const filterStatus: string | null =
    kind === "pantawid_by_brgy" ? "Pantawid (4Ps)"
    : kind === "non_pantawid_by_brgy" ? "Non-Pantawid"
    : kind === "employed_by_brgy" ? "Employed"
    : kind === "unemployed_by_brgy" ? "Unemployed"
    : kind === "in_lf_by_brgy" ? "In Labor Force"
    : kind === "not_in_lf_by_brgy" ? "Not in Labor Force"
    : kind === "senior_by_brgy" ? "Senior Citizen"
    : kind === "solo_parent_by_brgy" ? "Solo Parent"
    : kind === "socpen_by_brgy" ? "Social Pensioner"
    : kind === "pwd_by_brgy" ? "PWD"
    : null;

  const result = useMemo(() => {
    const all = getEnrichedPersons();
    const NOT_STATED = "Not Stated";

    type PersonRow = Record<string, any>;
    const groupsMap = new Map<string, PersonRow[]>();
    const allBarangays = getSectorBarangays();
    // Keep every barangay visible, including zero-count barangays, so sector reports
    // always have a complete A-Z barangay roster matching the summary table.
    for (const b of allBarangays) groupsMap.set(b, []);
    const personKey = (p: any, fallback = "") => {
      const direct = String(p?.uuid || p?.id || "");
      if (direct) return direct;
      const line = String(p?.line_number ?? "");
      if (line) return `${p?.area_code ?? ""}-${p?.husn ?? ""}-${p?.hsn ?? ""}-${line}`;
      return `${p?.area_code ?? ""}-${p?.husn ?? ""}-${p?.hsn ?? ""}|${p?._full_name ?? ""}|${p?.a05_age ?? ""}|${p?.a03_sex ?? ""}|${fallback}`;
    };

    const put = (b: string, row: PersonRow) => {
      if (!groupsMap.has(b)) groupsMap.set(b, []);
      const list = groupsMap.get(b)!;
      const key = row._person_key
        ? String(row._person_key)
        : `${b}|${row._full_name ?? ""}|${row.a05_age ?? ""}|${row.husn ?? ""}`;
      if (list.some((existing) => String(existing._person_key ?? "") === key && key !== "")) return;
      list.push(row);
    };

    // 4PS CATEGORY FILTER
    if (category === "fourps") {
      const seen = new Set<string>();
      for (const p of all) {
        if (!isHead(p)) continue;
        const key = `${p.area_code}-${p.husn}-${p.hsn}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const b = p.area_name || NOT_STATED;
        const isFourps = yes(p._hh?.m05_a_4ps) || yes(p._hh?.m06_a_benefit_4ps);
        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status: isFourps ? "Pantawid (4Ps)" : "Non-Pantawid",
          husn: p.husn,
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "4Ps Status" },
        { key: "husn", label: "HUSN" },
      ];
      let tPant = 0, tNon = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const pant = rows.filter((r) => r.status === "Pantawid (4Ps)").length;
        const non = rows.length - pant;
        tPant += pant; tNon += non;
        return {
          barangay, pantawid: pant, non_pantawid: non, total: rows.length,
          share: rows.length ? `${((pant / rows.length) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      overallRows.push({
        barangay: "TOTAL", pantawid: tPant, non_pantawid: tNon, total: tPant + tNon,
        share: tPant + tNon ? `${((tPant / (tPant + tNon)) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Pantawid Households", value: tPant },
          { label: "Non-Pantawid Households", value: tNon },
          { label: "TOTAL Household Heads", value: tPant + tNon },
          { label: "Barangays", value: groupsMap.size },
        ],
        sectionTitle: "Pantawid Members by Barangay",
        sectionSubtitle: "Household heads listed per barangay with 4Ps status. Blanks shown as “Not Stated”.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "pantawid", label: "Pantawid (4Ps) Heads" },
          { key: "non_pantawid", label: "Non-Pantawid Heads" },
          { key: "total", label: "Total Heads" },
          { key: "share", label: "% Pantawid" },
        ],
        overallRows,
      };
    }

    // EMPLOYMENT FILTER
    if (category === "employment") {
      for (const p of all) {
        const age = typeof p.a05_age === "number" ? p.a05_age : null;
        if (age === null || age < 15) continue;
        const b = p.area_name || NOT_STATED;
        
        const rawEmp = String(p.e01_employment_status || "").trim().toLowerCase();
        const rawLF = p.e01_labor_force_participation;
        
        let status: string;
        if (rawEmp === "employed") {
          status = "Employed";
        } else if (rawEmp === "unemployed") {
          status = "Unemployed";
        } else if (rawLF === "Not in the labor force") {
          status = "Not in Labor Force";
        } else {
          status = NOT_STATED;
        }

        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status,
          e05_occupation_group: p.e05_occupation_group || NOT_STATED,
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "Employment Status" },
        { key: "e05_occupation_group", label: "Occupation" },
      ];
      let tE = 0, tU = 0, tN = 0, tNS = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const emp = rows.filter((r) => r.status === "Employed").length;
        const un = rows.filter((r) => r.status === "Unemployed").length;
        const nilf = rows.filter((r) => r.status === "Not in Labor Force").length;
        const ns = rows.filter((r) => r.status === NOT_STATED).length;
        tE += emp; tU += un; tN += nilf; tNS += ns;
        const lf = emp + un;
        return {
          barangay, employed: emp, unemployed: un, not_in_lf: nilf, not_stated: ns,
          labor_force: lf,
          employment_rate: lf ? `${((emp / lf) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      const tLF = tE + tU;
      overallRows.push({
        barangay: "TOTAL", employed: tE, unemployed: tU, not_in_lf: tN, not_stated: tNS,
        labor_force: tLF, employment_rate: tLF ? `${((tE / tLF) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Employed", value: tE },
          { label: "Unemployed", value: tU },
          { label: "Not in Labor Force", value: tN },
          { label: "Not Stated", value: tNS },
        ],
        sectionTitle: "Employment by Barangay",
        sectionSubtitle: "Persons aged 15+ listed per barangay with employment status. Blanks shown as “Not Stated”.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "employed", label: "Employed" },
          { key: "unemployed", label: "Unemployed" },
          { key: "not_in_lf", label: "Not in Labor Force" },
          { key: "not_stated", label: "Not Stated" },
          { key: "labor_force", label: "Labor Force" },
          { key: "employment_rate", label: "Employment Rate" },
        ],
        overallRows,
      };
    }

    // SENIOR CITIZEN FILTER
    if (category === "senior") {
      const seniorList = listSector("senior");
      const seniorIds = new Set(seniorList.map((p: any) => `${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`));

      for (const p of all) {
        const b = p.area_name || NOT_STATED;
        const isSenior = seniorIds.has(`${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`) || (typeof p.a05_age === "number" && p.a05_age >= 60);
        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status: isSenior ? "Senior Citizen" : "Non-Senior",
          b07_senior_citizen_id: p.b07_senior_citizen_id || NOT_STATED,
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "Status" },
        { key: "b07_senior_citizen_id", label: "Senior ID" },
      ];
      let tSenior = 0, tNonSenior = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const snr = rows.filter((r) => r.status === "Senior Citizen").length;
        const nonSnr = rows.length - snr;
        tSenior += snr; tNonSenior += nonSnr;
        return {
          barangay, senior: snr, non_senior: nonSnr, total: rows.length,
          share: rows.length ? `${((snr / rows.length) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      overallRows.push({
        barangay: "TOTAL", senior: tSenior, non_senior: tNonSenior, total: tSenior + tNonSenior,
        share: tSenior + tNonSenior ? `${((tSenior / (tSenior + tNonSenior)) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Senior Citizens", value: tSenior },
          { label: "Non-Senior Citizens", value: tNonSenior },
          { label: "Total Population", value: tSenior + tNonSenior },
          { label: "Barangays", value: groupsMap.size },
        ],
        sectionTitle: "Senior Citizens by Barangay",
        sectionSubtitle: "Population breakdown per barangay highlighting dynamic Senior Citizen status.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "senior", label: "Senior Citizens" },
          { key: "non_senior", label: "Non-Seniors" },
          { key: "total", label: "Total Population" },
          { key: "share", label: "% Senior" },
        ],
        overallRows,
      };
    }

    // SOLO PARENT FILTER
    if (category === "solo_parent") {
      const soloList = listSector("solo_parent");
      const soloIds = new Set(soloList.map((p: any) => `${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`));

      for (const p of all) {
        const b = p.area_name || NOT_STATED;
        const isSolo = soloIds.has(`${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`) || yes(p.b06_solo_parent_id);
        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status: isSolo ? "Solo Parent" : "Non-Solo Parent",
          b06_solo_parent_id: p.b06_solo_parent_id || NOT_STATED,
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "Status" },
        { key: "b06_solo_parent_id", label: "Solo Parent ID" },
      ];
      let tSolo = 0, tNonSolo = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const solo = rows.filter((r) => r.status === "Solo Parent").length;
        const nonSolo = rows.length - solo;
        tSolo += solo; tNonSolo += nonSolo;
        return {
          barangay, solo_parent: solo, non_solo: nonSolo, total: rows.length,
          share: rows.length ? `${((solo / rows.length) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      overallRows.push({
        barangay: "TOTAL", solo_parent: tSolo, non_solo: tNonSolo, total: tSolo + tNonSolo,
        share: tSolo + tNonSolo ? `${((tSolo / (tSolo + tNonSolo)) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Solo Parents", value: tSolo },
          { label: "Non-Solo Parents", value: tNonSolo },
          { label: "Total Population", value: tSolo + tNonSolo },
        ],
        sectionTitle: "Solo Parents by Barangay",
        sectionSubtitle: "Pre-built distribution rosters of Solo Parents across barangays.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "solo_parent", label: "Solo Parents" },
          { key: "non_solo", label: "Non-Solo Parents" },
          { key: "total", label: "Total Population" },
          { key: "share", label: "% Solo Parent" },
        ],
        overallRows,
      };
    }

    // SOCIAL PENSIONER
    if (category === "socpen") {
      const socpenList = listSector("socpen");
      const socpenIds = new Set(socpenList.map((p: any) => `${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`));

      for (const p of all) {
        const b = p.area_name || NOT_STATED;
        const isSocPen = socpenIds.has(`${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`) || yes(p._hh?.m05_b_socpen);
        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status: isSocPen ? "Social Pensioner" : "Non-Pensioner",
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "Status" },
      ];
      let tSocPen = 0, tNonSocPen = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const sp = rows.filter((r) => r.status === "Social Pensioner").length;
        const nonSp = rows.length - sp;
        tSocPen += sp; tNonSocPen += nonSp;
        return {
          barangay, socpen: sp, non_socpen: nonSp, total: rows.length,
          share: rows.length ? `${((sp / rows.length) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      overallRows.push({
        barangay: "TOTAL", socpen: tSocPen, non_socpen: tNonSocPen, total: tSocPen + tNonSocPen,
        share: tSocPen + tNonSocPen ? `${((tSocPen / (tSocPen + tNonSocPen)) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Social Pensioners", value: tSocPen },
          { label: "Non-Pensioners", value: tNonSocPen },
          { label: "Total Population", value: tSocPen + tNonSocPen },
        ],
        sectionTitle: "Social Pensioners by Barangay",
        sectionSubtitle: "Aggregation breakdown of Social Pensioners per distinct areas.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "socpen", label: "Social Pensioners" },
          { key: "non_socpen", label: "Non-Pensioners" },
          { key: "total", label: "Total Population" },
          { key: "share", label: "% Pensioner" },
        ],
        overallRows,
      };
    }

    // PWD CAT FILTER
    if (category === "pwd") {
      const pwdList = listSector("pwd");
      const pwdIds = new Set(pwdList.map((p: any) => `${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`));

      for (const p of all) {
        const b = p.area_name || NOT_STATED;
        const isPwd = pwdIds.has(`${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}`) || yes(p.b10_pwd) || yes(p.b11_with_pwd_id);
        put(b, {
          _person_key: personKey(p),
          _full_name: p._full_name || NOT_STATED,
          a03_sex: p.a03_sex || NOT_STATED,
          a05_age: p.a05_age ?? NOT_STATED,
          status: isPwd ? "PWD" : "Non-PWD",
          b11_with_pwd_id: p.b11_with_pwd_id || NOT_STATED,
        });
      }
      const personColumns = [
        { key: "_full_name", label: "Full Name" },
        { key: "a03_sex", label: "Sex" },
        { key: "a05_age", label: "Age" },
        { key: "status", label: "Status" },
        { key: "b11_with_pwd_id", label: "PWD ID" },
      ];
      let tPwd = 0, tNonPwd = 0;
      const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
        const pwdCount = rows.filter((r) => r.status === "PWD").length;
        const nonPwdCount = rows.length - pwdCount;
        tPwd += pwdCount; tNonPwd += nonPwdCount;
        return {
          barangay, pwd: pwdCount, non_pwd: nonPwdCount, total: rows.length,
          share: rows.length ? `${((pwdCount / rows.length) * 100).toFixed(2)}%` : "0%",
        };
      }).sort((a, b) => a.barangay.localeCompare(b.barangay));
      overallRows.push({
        barangay: "TOTAL", pwd: tPwd, non_pwd: tNonPwd, total: tPwd + tNonPwd,
        share: tPwd + tNonPwd ? `${((tPwd / (tPwd + tNonPwd)) * 100).toFixed(2)}%` : "0%",
      });
      return {
        groups: groupsMap,
        summary: [
          { label: "Persons with Disability", value: tPwd },
          { label: "Non-PWD Population", value: tNonPwd },
          { label: "Total Population", value: tPwd + tNonPwd },
        ],
        sectionTitle: "Persons with Disability (PWD) by Barangay",
        sectionSubtitle: "Barangay breakdown distribution mapping for identified PWD criteria.",
        personColumns,
        overallColumns: [
          { key: "barangay", label: "Barangay" },
          { key: "pwd", label: "PWD Count" },
          { key: "non_pwd", label: "Non-PWD" },
          { key: "total", label: "Total Population" },
          { key: "share", label: "% PWD" },
        ],
        overallRows,
      };
    }

    // LABOR FORCE BY BRGY FALLBACK
    for (const p of all) {
      const age = typeof p.a05_age === "number" ? p.a05_age : null;
      if (age === null || age < 15) continue;
      const b = p.area_name || NOT_STATED;
      
      const lfVal = p.e01_labor_force_participation;
      let status: string;
      if (lfVal === "In the labor force") {
        status = "In Labor Force";
      } else if (lfVal === "Not in the labor force") {
        status = "Not in Labor Force";
      } else {
        status = NOT_STATED;
      }

      put(b, {
          _person_key: personKey(p),
        _full_name: p._full_name || NOT_STATED,
        a03_sex: p.a03_sex || NOT_STATED,
        a05_age: p.a05_age ?? NOT_STATED,
        status,
        e01_labor_force_participation: p.e01_labor_force_participation || NOT_STATED,
      });
    }
    const personColumns = [
      { key: "_full_name", label: "Full Name" },
      { key: "a03_sex", label: "Sex" },
      { key: "a05_age", label: "Age" },
      { key: "status", label: "Labor Force" },
      { key: "e01_labor_force_participation", label: "Labor Force Status" },
    ];
    let tIn = 0, tOut = 0, tNS = 0;
    const overallRows = Array.from(groupsMap.entries()).map(([barangay, rows]) => {
      const inLF = rows.filter((r) => r.status === "In Labor Force").length;
      const out = rows.filter((r) => r.status === "Not in Labor Force").length;
      const ns = rows.filter((r) => r.status === NOT_STATED).length;
      tIn += inLF; tOut += out; tNS += ns;
      const total = inLF + out + ns;
      return {
        barangay, in_labor_force: inLF, not_in_labor_force: out, not_stated: ns, total,
        participation_rate: total ? `${((inLF / total) * 100).toFixed(2)}%` : "0%",
      };
    }).sort((a, b) => a.barangay.localeCompare(b.barangay));
    const tTotal = tIn + tOut + tNS;
    overallRows.push({
      barangay: "TOTAL", in_labor_force: tIn, not_in_labor_force: tOut, not_stated: tNS, total: tTotal,
      participation_rate: tTotal ? `${((tIn / tTotal) * 100).toFixed(2)}%` : "0%",
    });
    return {
      groups: groupsMap,
      summary: [
        { label: "In Labor Force", value: tIn },
        { label: "Not in Labor Force", value: tOut },
        { label: "Not Stated", value: tNS },
        { label: "Working-Age Population (15+)", value: tTotal },
      ],
      sectionTitle: "Labor Force by Barangay",
      sectionSubtitle: "Persons aged 15+ listed per barangay with labor force participation. Blanks shown as “Not Stated”.",
      personColumns,
      overallColumns: [
        { key: "barangay", label: "Barangay" },
        { key: "in_labor_force", label: "In Labor Force" },
        { key: "not_in_labor_force", label: "Not in Labor Force" },
        { key: "not_stated", label: "Not Stated" },
        { key: "total", label: "Total (15+)" },
        { key: "participation_rate", label: "Labor Force Participation Rate" },
      ],
      overallRows,
    };
  }, [kind, category]);

  const { groups, summary, sectionTitle, sectionSubtitle, personColumns, overallColumns, overallRows } = result as any;

  const filteredGroups = useMemo(() => {
    if (!filterStatus) return groups as Map<string, any[]>;
    const out = new Map<string, any[]>();
    for (const [b, rows] of (groups as Map<string, any[]>).entries()) {
      const kept = rows.filter((r) => r.status === filterStatus);
      out.set(b, kept);
    }
    return out;
  }, [groups, filterStatus]);

  const sortedBarangays = useMemo(
    () => Array.from(filteredGroups.keys()).sort(sortNamesAZ),
    [filteredGroups],
  );

  const displayTitle = filterStatus
    ? `${filterStatus} by Barangay`
    : sectionTitle;

  const expectedTotal = useMemo(() => {
    const s = (summary as any[]) || [];
    const exactLabels: Record<string, string> = {
      "Pantawid (4Ps)": "Pantawid Households",
      "Non-Pantawid": "Non-Pantawid Households",
      "Employed": "Employed",
      "Unemployed": "Unemployed",
      "In Labor Force": "In Labor Force",
      "Not in Labor Force": "Not in Labor Force",
      "Senior Citizen": "Senior Citizens",
      "Solo Parent": "Solo Parents",
      "Social Pensioner": "Social Pensioners",
      "PWD": "Persons with Disability",
    };
    const statusKey = filterStatus;
    const label = statusKey !== null ? exactLabels[statusKey] : undefined;
    const hit = label
      ? s.find((x) => String(x.label).trim().toLowerCase() === label.toLowerCase())
      : s.find((x) => String(x.label).toUpperCase().includes("TOTAL"));
    return hit && Number.isFinite(Number(hit.value)) ? Number(hit.value) : null;
  }, [summary, filterStatus]);

  const overallExpectedTotal = useMemo(() => {
    const totalRow = (overallRows as any[]).find((r) => r.barangay === "TOTAL");
    if (!totalRow) return null;
    const field: Record<string, string> = {
      "Pantawid (4Ps)": "pantawid",
      "Non-Pantawid": "non_pantawid",
      "Employed": "employed",
      "Unemployed": "unemployed",
      "In Labor Force": "in_labor_force",
      "Not in Labor Force": "not_in_labor_force",
      "Senior Citizen": "senior",
      "Solo Parent": "solo_parent",
      "Social Pensioner": "socpen",
      "PWD": "pwd",
    };
    const statusKey = filterStatus;
    const fieldKey = statusKey !== null ? field[statusKey] : undefined;
    const value = fieldKey ? totalRow[fieldKey] : (totalRow.total ?? totalRow.count);
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }, [overallRows, filterStatus]);

  const detailSummary = useMemo<SectorSummaryItem[]>(() => {
    const items = (summary as SectorSummaryItem[]) || [];
    const totalRow = (overallRows as any[]).find((r) => r.barangay === "TOTAL");
    const primary = filterStatus ? expectedTotal : null;
    const population = totalRow?.total ?? totalRow?.population ?? null;
    const barangays = getSectorBarangays().length;
    if (filterStatus && primary !== null) {
      const denominator = population == null ? 0 : Number(population);
      const complement = denominator > 0 ? Math.max(0, denominator - Number(primary)) : null;
      const complementLabel =
        filterStatus === "Senior Citizen" ? "Non-Senior" :
        filterStatus === "Solo Parent" ? "Non-Solo Parent" :
        filterStatus === "Social Pensioner" ? "Non-Social Pensioner" :
        filterStatus === "PWD" ? "Without Disability" :
        filterStatus === "Pantawid (4Ps)" ? "Non-4Ps Members" :
        filterStatus === "Non-Pantawid" ? "4Ps Members" :
        filterStatus === "Employed" ? "Other Working-Age Status" :
        filterStatus === "Unemployed" ? "Other Working-Age Status" :
        filterStatus === "In Labor Force" ? "Not in Labor Force / Not Stated" :
        filterStatus;

      const base = denominator > 0 ? denominator : 0;
      const rows: SectorSummaryItem[] = [
        { label: displayTitle.replace(/ by Barangay$/i, ""), value: primary, percentage: shareOf(Number(primary), base), percentageLabel: `${pctText(shareOf(Number(primary), base))} of the ${populationLabelFor(category)} in scope` },
        { label: complementLabel, value: complement ?? 0, percentage: shareOf(Number(complement ?? 0), base), percentageLabel: base ? `${pctText(shareOf(Number(complement ?? 0), base))} of the ${populationLabelFor(category)} in scope` : "No denominator available" },
        { label: "Total Population", value: population ?? 0, percentage: base ? 100 : null, percentageLabel: base ? "100% of the population in scope" : "No denominator available" },
      ];

      // Add the most useful rate for employment/labor filters without pretending it is a generic population share.
      if (category === "employment" && totalRow) {
        const laborForce = Number(totalRow.labor_force ?? 0);
        const rate = shareOf(Number(totalRow.employed ?? 0), laborForce);
        if (filterStatus === "Employed") rows.push({ label: "Employment Rate", value: `${Number(totalRow.employed ?? 0).toLocaleString()} / ${laborForce.toLocaleString()}`, percentage: rate, percentageLabel: "Employed ÷ Labor Force" });
        if (filterStatus === "Unemployed") {
          const unemploymentRate = shareOf(Number(totalRow.unemployed ?? 0), laborForce);
          rows.push({ label: "Unemployment Rate", value: `${Number(totalRow.unemployed ?? 0).toLocaleString()} / ${laborForce.toLocaleString()}`, percentage: unemploymentRate, percentageLabel: "Unemployed ÷ Labor Force" });
        }
      }
      if (category === "labor_force" && totalRow) {
        const rate = shareOf(Number(totalRow.in_labor_force ?? 0), Number(totalRow.total ?? 0));
        if (filterStatus === "In Labor Force") rows.push({ label: "Labor Force Participation Rate", value: pctText(rate), percentage: rate, percentageLabel: "In labor force ÷ population aged 15+" });
      }

      rows.push({ label: "No. of Barangay", value: barangays });
      return rows;
    }
    return items.map((x) => ({ ...x, label: String(x.label).replace(/^Barangays$/i, "No. of Barangay") }));
  }, [summary, overallRows, filterStatus, expectedTotal, sortedBarangays, displayTitle, category]);

  function populationLabelFor(cat: string) {
    if (cat === "fourps") return "household heads";
    if (cat === "employment" || cat === "labor_force") return "persons aged 15+";
    return "population";
  }

  return (
    <div className="space-y-6">
      <GroupVerifyPanel
        label={displayTitle}
        groups={filteredGroups}
        summaryTotal={expectedTotal}
        overallTotal={overallExpectedTotal}
      />

      <SectorSummaryTable
        title={displayTitle}
        subtitle={sectionSubtitle}
        summary={detailSummary}
        exportRows={overallRows}
        exportColumns={overallColumns}
        exportTitle={`${displayTitle} — Summary by Barangay`}
        exportSubtitle={sectionSubtitle}
        exportGroups={filteredGroups}
        exportDetailColumns={personColumns as ExportColumn[]}
      />

      <div className="space-y-5">
        {sortedBarangays.map((b) => {
          const rows = filteredGroups.get(b) || [];
          return (
            <BarangayNameTable
              key={b}
              barangay={b}
              rows={rows}
              columns={personColumns as any}
              entityLabel={filterStatus === "Pantawid (4Ps)" ? "4Ps Member(s)" : filterStatus === "Non-Pantawid" ? "Non-4Ps Member(s)" : displayTitle.replace(/ by Barangay$/i, "")}
              onSelect={undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
function GroupVerifyPanel({
  label, groups, summaryTotal, overallTotal,
}: { label: string; groups: Map<string, any[]>; summaryTotal: number | null; overallTotal: number | null }) {
  const [result, setResult] = useState<ReturnType<typeof verifyGroups> | null>(null);
  const run = () => setResult(verifyGroups(label, groups, summaryTotal, overallTotal));
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={run}>
          <CheckCircle2 className="h-4 w-4" /> Verify Counts vs Exports
        </Button>
        <span className="text-xs text-muted-foreground">
          Re-adds every per-barangay list independently and confirms the summary TOTAL matches what CSV/Excel/PDF will contain.
        </span>
      </div>
      {result && <VerifyResultCard result={result} />}
    </div>
  );
}

function VerifyResultCard({ result }: { result: ReturnType<typeof verifySector> }) {
  return (
    <div className={`mt-3 rounded-md border p-3 text-xs ${result.matches ? "border-success/40 bg-success/10 text-success-foreground" : "border-destructive/40 bg-destructive/10"}`}>
      <div className="flex items-center gap-2 font-semibold">
        {result.matches ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        {result.matches ? "PASS — On-screen totals match recomputed counts and will match the exports." : "FAIL — Differences detected."}
      </div>
      <div className="mt-1 text-muted-foreground">Scope: {result.scope}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(result.expected).map(([k, v]) => (
          <div key={k} className="rounded border border-border bg-background px-2 py-1">
            <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
            <div className="font-semibold text-foreground">{v}</div>
          </div>
        ))}
        <div className="rounded border border-border bg-background px-2 py-1">
          <div className="text-[10px] uppercase text-muted-foreground">on-screen rows</div>
          <div className="font-semibold text-foreground">{result.onScreen.rows}</div>
        </div>
      </div>
      {result.mismatches.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-destructive">
          {result.mismatches.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
    </div>
  );
}


const AGRI_WORK_RE = /\b(farm|farmer|farming|agri|agricultur|crop|rice|corn|coconut|sugar|livestock|poultry|forestry|plantation|nursery|hatchery)\b/i;
const isAgriculturalWork = (p: any) => {
  if (yes(p?.e17_farmer)) return true;
  const occupation = [p?.e05_occupation_group, p?.legacy_occupation_text, p?.e05_psoc].map(low).join(" ");
  const industry = [p?.e06_industry_group, p?.legacy_industry_text, p?.e06_psic].map(low).join(" ");
  return AGRI_WORK_RE.test(occupation) || AGRI_WORK_RE.test(industry);
};
const isEmployed = (p: any) => {
  const v = low(p?.e01_employment_status);
  return v === "employed" || (v.includes("employed") && !v.includes("unemployed") && !v.includes("not employed"));
};
const householdIsFarming = (persons: any[], key: string) => persons.some((p) => householdKey(p) === key && isAgriculturalWork(p));
const agricultureSource = (persons: any[], key: string) => {
  const p = persons.find((row) => householdKey(row) === key && isAgriculturalWork(row));
  if (!p) return "Not Stated";
  return String(p.e06_industry_group || p.e05_occupation_group || p.legacy_industry_text || p.legacy_occupation_text || "Agricultural livelihood").trim() || "Agricultural livelihood";
};
const farmingPersonOccupation = (persons: any[], key: string) => {
  const p = persons.find((row) => householdKey(row) === key && isAgriculturalWork(row));
  if (!p) return { occupation: "Not Stated", industry: "Not Stated" };
  return {
    occupation: String(p.e05_occupation_group || p.legacy_occupation_text || "Not Stated").trim() || "Not Stated",
    industry: String(p.e06_industry_group || p.legacy_industry_text || "Not Stated").trim() || "Not Stated",
  };
};

type AgricultureMode = "farming_households" | "farming_poverty" | "agri_employment" | "agri_income";

function AgricultureByBarangay({ mode, onSelect }: { mode: AgricultureMode; onSelect: (p: any) => void }) {
  const year = getActiveYear();
  const ds = getYearDatasets(year);
  const barangays = getSectorBarangays(year);
  const personByHousehold = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of ds.persons) {
      const key = householdKey(p);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [ds.persons, year]);
  const householdInfo = useMemo(() => {
    const m = new Map<string, { household: any; farming: boolean; income: number | null; head: any | null; source: string }>();
    for (const h of ds.households) {
      const key = householdKey(h);
      const people = personByHousehold.get(key) || [];
      const head = people.find((p) => isHead(p)) || people[0] || null;
      const rawIncome = Number(h?.h06_total_family_income);
      const income = Number.isFinite(rawIncome) && h?.h06_total_family_income !== "" ? rawIncome : null;
      m.set(key, { household: h, farming: householdIsFarming(people, key), income, head, source: agricultureSource(people, key) });
    }
    return m;
  }, [ds.households, personByHousehold]);

  const model = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const b of barangays) groups.set(b, []);
    const byBarangaySummary: any[] = [];
    const add = (b: string, row: any) => { if (!groups.has(b)) groups.set(b, []); groups.get(b)!.push(row); };

    if (mode === "farming_households") {
      const allHouseholds = ds.households;
      const farmingHouseholds = allHouseholds.filter((h) => householdInfo.get(hhKeySafe(h))?.farming);
      const farmingHouseholdKeys = new Set(farmingHouseholds.map((h) => householdKey(h)));
      const peopleRows = ds.persons.map((p) => {
        const key = householdKey(p); const info = householdInfo.get(key); const farming = Boolean(info?.farming);
        return { ...p, _full_name: getPersonFullName(p) || "Not Stated", livelihood: farming ? "Farming Household" : "Non-Farming Household", _household_head: info?.head ? getPersonFullName(info.head) : "Not Stated" };
      });
      for (const row of peopleRows) add(row.area_name || "Not Stated", row);
      const farmingPop = peopleRows.filter((p) => farmingHouseholdKeys.has(householdKey(p))).length;
      const totalPop = peopleRows.length;
      const farmingCount = farmingHouseholds.length;
      const totalHh = allHouseholds.length;
      const summary = [
        { label: "Farming Households", value: farmingCount, percentage: totalHh ? shareOf(farmingCount, totalHh) : null, percentageLabel: "Farming households ÷ total households" },
        { label: "Non-Farming Households", value: Math.max(0, totalHh - farmingCount), percentage: totalHh ? shareOf(totalHh - farmingCount, totalHh) : null, percentageLabel: "Non-farming households ÷ total households" },
        { label: "Farming-Household Population", value: farmingPop, percentage: totalPop ? shareOf(farmingPop, totalPop) : null, percentageLabel: "Persons in farming households ÷ total population" },
        { label: "Non-Farming-Household Population", value: Math.max(0, totalPop - farmingPop), percentage: totalPop ? shareOf(totalPop - farmingPop, totalPop) : null, percentageLabel: "Persons in non-farming households ÷ total population" },
        { label: "Total Households", value: totalHh },
        { label: "Total Population", value: totalPop },
        { label: "No. of Barangay", value: barangays.length },
      ];
      for (const b of barangays) {
        const hs = allHouseholds.filter((h) => (h.area_name || "Not Stated") === b);
        const f = hs.filter((h) => householdInfo.get(hhKeySafe(h))?.farming).length;
        const ps = peopleRows.filter((p) => (p.area_name || "Not Stated") === b);
        const fp = ps.filter((p) => p.livelihood === "Farming Household").length;
        byBarangaySummary.push({ barangay: b, farming_households: f, non_farming_households: hs.length - f, total_households: hs.length, farming_population: fp, non_farming_population: ps.length - fp, total_population: ps.length, population_rate: ps.length ? `${(fp / ps.length * 100).toFixed(2)}%` : "0.00%" });
      }
      return {
        groups, summary, byBarangaySummary,
        columns: [
          { key: "_full_name", label: "Full Name" },
          { key: "a03_sex", label: "Sex" },
          { key: "a05_age", label: "Age" },
          { key: "livelihood", label: "Household Livelihood" },
          { key: "_household_head", label: "Household Head" },
        ],
        title: `Farming & Non-Farming Households by Barangay — CBMS ${year}`,
        subtitle: "Households are classified as farming when at least one household member has a normalized farmer/agricultural occupation or industry indicator.",
        note: `Method: Farming household = household with at least one member classified as agricultural/farming. Non-farming = all other households. Source: Municipal Planning and Development Office · CBMS ${year} dataset · Municipality of Mutia, Zamboanga del Norte`,
      };
    }

    if (mode === "farming_poverty" || mode === "agri_income") {
      const farmingHouseholds = ds.households.filter((h) => householdInfo.get(hhKeySafe(h))?.farming);
      const reported = farmingHouseholds.filter((h) => householdInfo.get(hhKeySafe(h))?.income !== null);
      const lowIncome = reported.filter((h) => (householdInfo.get(hhKeySafe(h))!.income as number) < 20000);
      for (const h of farmingHouseholds) {
        const info = householdInfo.get(hhKeySafe(h))!;
        if (mode === "farming_poverty" && info.income === null) continue;
        const head = info.head;
        const source = farmingPersonOccupation(personByHousehold.get(hhKeySafe(h)) || [], hhKeySafe(h));
        add(h.area_name || "Not Stated", {
          ...h,
          _full_name: head ? getPersonFullName(head) : "Not Stated",
          _household_head: head ? getPersonFullName(head) : "Not Stated",
          _household_income: info.income,
          _income_status: info.income === null ? "Not Reported" : info.income < 20000 ? "Below ₱20,000" : "₱20,000 and Above",
          _agriculture_source: info.source,
          _agri_occupation: source.occupation,
          _agri_industry: source.industry,
        });
      }
      for (const b of barangays) {
        const bh = farmingHouseholds.filter((h) => (h.area_name || "Not Stated") === b);
        const br = bh.filter((h) => householdInfo.get(hhKeySafe(h))?.income !== null);
        const bl = br.filter((h) => (householdInfo.get(hhKeySafe(h))!.income as number) < 20000);
        const incomes = br.map((h) => householdInfo.get(hhKeySafe(h))!.income as number);
        const avg = incomes.length ? incomes.reduce((a, x) => a + x, 0) / incomes.length : null;
        byBarangaySummary.push(mode === "farming_poverty"
          ? { barangay: b, farming_households: bh.length, reported_income: br.length, below_20k: bl.length, poverty_proxy_rate: br.length ? `${(bl.length / br.length * 100).toFixed(2)}%` : "N/A", magnitude: bl.length }
          : { barangay: b, farming_households: bh.length, reported_income: br.length, average_income: avg === null ? "N/A" : `₱${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, below_20k: bl.length, below_20k_rate: br.length ? `${(bl.length / br.length * 100).toFixed(2)}%` : "N/A" });
      }
      if (mode === "farming_poverty") {
        return {
          groups, summary: [
            { label: "Farming Households", value: farmingHouseholds.length },
            { label: "Farming Households with Reported Income", value: reported.length, percentage: farmingHouseholds.length ? shareOf(reported.length, farmingHouseholds.length) : null, percentageLabel: "Reported income ÷ farming households" },
            { label: "Farming Households Below ₱20,000", value: lowIncome.length, percentage: reported.length ? shareOf(lowIncome.length, reported.length) : null, percentageLabel: "Low-income farming households ÷ reported-income farming households" },
            { label: "Magnitude of Low-Income Farming Households", value: lowIncome.length },
            { label: "No. of Barangay", value: barangays.length },
          ],
          byBarangaySummary,
          columns: [
            { key: "_full_name", label: "Household Head" },
            { key: "area_name", label: "Barangay" },
            { key: "_household_income", label: "Household Income" },
            { key: "_income_status", label: "Income Status" },
            { key: "_agriculture_source", label: "Agricultural Income Source / Industry" },
          ],
          title: `Farming Household Poverty / Low-Income Proxy by Barangay — CBMS ${year}`,
          subtitle: "Income-based proxy only: reported farming-household family income below ₱20,000. This is not an official PSA poverty-line classification.",
          note: `Method: Magnitude = count of farming households with reported H06 Total Family Income below ₱20,000. Incidence / rate = magnitude ÷ farming households with reported income × 100. Source: Municipal Planning and Development Office · CBMS ${year} dataset · Municipality of Mutia, Zamboanga del Norte`,
        };
      }
      const incomes = reported.map((h) => householdInfo.get(hhKeySafe(h))!.income as number).sort((a,b)=>a-b);
      const median = incomes.length ? (incomes.length % 2 ? incomes[(incomes.length-1)/2] : (incomes[incomes.length/2-1] + incomes[incomes.length/2])/2) : null;
      const avg = incomes.length ? incomes.reduce((a,x)=>a+x,0)/incomes.length : null;
      return {
        groups, summary: [
          { label: "Farming Households", value: farmingHouseholds.length },
          { label: "Reported Farming-Household Income", value: reported.length, percentage: farmingHouseholds.length ? shareOf(reported.length, farmingHouseholds.length) : null, percentageLabel: "Reported income ÷ farming households" },
          { label: "Average Reported Family Income", value: avg === null ? "N/A" : `₱${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, percentageLabel: "Arithmetic mean of reported farming-household family income" },
          { label: "Median Reported Family Income", value: median === null ? "N/A" : `₱${median.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, percentageLabel: "Median of reported farming-household family income" },
          { label: "Below ₱20,000", value: lowIncome.length, percentage: reported.length ? shareOf(lowIncome.length, reported.length) : null, percentageLabel: "Below ₱20,000 ÷ reported farming-household income" },
          { label: "No. of Barangay", value: barangays.length },
        ],
        byBarangaySummary, columns: [
          { key: "_full_name", label: "Household Head" },
          { key: "area_name", label: "Barangay" },
          { key: "_household_income", label: "Household Income" },
          { key: "_agriculture_source", label: "Agricultural Source / Industry" },
          { key: "_agri_occupation", label: "Agricultural Occupation" },
        ], title: `Agricultural Household Income by Barangay — CBMS ${year}`,
        subtitle: "Average and median income are calculated only from farming households with numeric reported family income.",
        note: `Method: Average = sum of reported farming-household H06 Total Family Income ÷ number of farming households with reported income. Median = middle value after sorting reported incomes. Source: Municipal Planning and Development Office · CBMS ${year} dataset · Municipality of Mutia, Zamboanga del Norte`,
      };
    }

    const employed = ds.persons.filter((p) => ageOf(p) !== null && (ageOf(p) as number) >= 15 && isEmployed(p));
    let agri = 0, nonAgri = 0, notStated = 0;
    for (const p of employed) {
      const category = isAgriculturalWork(p) ? "Agricultural Job" : ((p.e05_occupation_group || p.e06_industry_group || p.legacy_occupation_text || p.legacy_industry_text) ? "Non-Agricultural Job" : "Not Stated");
      if (category === "Agricultural Job") agri++; else if (category === "Non-Agricultural Job") nonAgri++; else notStated++;
      add(p.area_name || "Not Stated", { ...p, _full_name: getPersonFullName(p) || "Not Stated", job_type: category, occupation: p.e05_occupation_group || p.legacy_occupation_text || "Not Stated", industry: p.e06_industry_group || p.legacy_industry_text || "Not Stated" });
    }
    const labor = ds.persons.filter((p) => ageOf(p) !== null && (ageOf(p) as number) >= 15 && low(p.e01_labor_force_participation).includes("labor force")).length || employed.length;
    for (const b of barangays) {
      const list = groups.get(b) || [];
      const aa = list.filter((r) => r.job_type === "Agricultural Job").length;
      const na = list.filter((r) => r.job_type === "Non-Agricultural Job").length;
      const ns = list.filter((r) => r.job_type === "Not Stated").length;
      byBarangaySummary.push({ barangay: b, agricultural_jobs: aa, non_agricultural_jobs: na, not_stated: ns, employed: list.length, agricultural_employment_rate: list.length ? `${(aa / list.length * 100).toFixed(2)}%` : "0.00%" });
    }
    return {
      groups, byBarangaySummary, summary: [
        { label: "Agricultural Jobs", value: agri, percentage: employed.length ? shareOf(agri, employed.length) : null, percentageLabel: "Agricultural jobs ÷ employed persons aged 15+" },
        { label: "Non-Agricultural Jobs", value: nonAgri, percentage: employed.length ? shareOf(nonAgri, employed.length) : null, percentageLabel: "Non-agricultural jobs ÷ employed persons aged 15+" },
        { label: "Not Stated", value: notStated, percentage: employed.length ? shareOf(notStated, employed.length) : null, percentageLabel: "Not stated occupation/industry ÷ employed persons aged 15+" },
        { label: "Total Employed (15+)", value: employed.length },
        { label: "Agricultural Employment Rate vs Labor Force", value: labor ? `${agri.toLocaleString()} / ${labor.toLocaleString()}` : "N/A", percentage: labor ? shareOf(agri, labor) : null, percentageLabel: "Agricultural employed ÷ labor-force population aged 15+" },
        { label: "No. of Barangay", value: barangays.length },
      ],
      columns: [
        { key: "_full_name", label: "Full Name" }, { key: "area_name", label: "Barangay" }, { key: "a03_sex", label: "Sex" }, { key: "a05_age", label: "Age" },
        { key: "job_type", label: "Job Type" }, { key: "occupation", label: "Occupation" }, { key: "industry", label: "Industry" },
      ],
      title: `Agricultural vs Non-Agricultural Employment by Barangay — CBMS ${year}`,
      subtitle: "Persons aged 15+ classified from employment status, occupation, and industry fields. Agricultural jobs are identified from normalized farmer/agricultural indicators and agriculture-related occupation/industry text.",
      note: `Method: Agricultural job classification uses normalized e17_farmer plus agriculture-related occupation/industry terms; agricultural employment rate = agricultural employed ÷ labor-force population aged 15+ × 100. Source: Municipal Planning and Development Office · CBMS ${year} dataset · Municipality of Mutia, Zamboanga del Norte`,
    };
  }, [mode, year, ds.persons, ds.households, barangays, householdInfo, personByHousehold]);

  const sortedBarangays = useMemo(() => Array.from(model.groups.keys()).sort(sortNamesAZ), [model.groups]);
  const detailGroups = useMemo(() => {
    return new Map(sortedBarangays.map((b) => [b, (model.groups.get(b) || []).slice().sort((a,b) => sortNamesAZ(a._full_name || a._household_head || "", b._full_name || b._household_head || ""))]));
  }, [model.groups, sortedBarangays]);
  const exportPayload: GroupedExportPayload = {
    title: model.title, subtitle: model.subtitle, columns: model.columns as ExportColumn[], rows: Array.from(detailGroups.values()).flat(),
    summary: model.summary as SectorSummaryItem[], barangaySummaryColumns: Object.keys(model.byBarangaySummary[0] || {}).map((key) => ({ key, label: key.replace(/_/g," ").replace(/\b\w/g,(c)=>c.toUpperCase()) })),
    barangaySummaryRows: model.byBarangaySummary, groups: sortedBarangays.map((b) => ({ title: b, rows: detailGroups.get(b) || [] })), note: model.note, dataYear: year,
  };

  return <div className="space-y-6">
    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Agriculture & Rural Livelihood</div><h2 className="mt-1 font-display text-lg font-semibold">{model.title.replace(` — CBMS ${year}`, "")}</h2><p className="mt-1 text-sm text-muted-foreground">{model.subtitle}</p></div>
        <SectorExportActions title={model.title} subtitle={model.subtitle} columns={model.columns as ExportColumn[]} rows={exportPayload.rows} summary={model.summary as SectorSummaryItem[]} groups={detailGroups} exportDetailColumns={model.columns as ExportColumn[]} />
      </div>
      <div className="sector-summary-table-wrap"><table className="w-full border-collapse text-sm"><thead className="bg-secondary/70"><tr><th className="border-b border-border px-4 py-2.5 text-left font-semibold">Indicator</th><th className="border-b border-border px-4 py-2.5 text-right font-semibold">Count / Value</th><th className="border-b border-border px-4 py-2.5 text-right font-semibold">Percentage Rate (%Rate) / Population (%Population)</th><th className="hidden border-b border-border px-4 py-2.5 text-left font-semibold md:table-cell">Method / Interpretation</th></tr></thead><tbody>{(model.summary as SectorSummaryItem[]).map((item) => <tr key={item.label} className="border-b border-border/60 last:border-0"><td className="px-4 py-2.5 font-semibold">{item.label}</td><td className="px-4 py-2.5 text-right font-black tabular-nums">{typeof item.value === "number" ? item.value.toLocaleString() : String(item.value)}</td><td className="px-4 py-2.5 text-right">{item.percentage == null ? "—" : <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black text-primary">{item.percentage.toFixed(2)}%</span>}</td><td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">{item.percentageLabel || "—"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]"><div className="border-b border-border p-4"><h3 className="font-display text-base font-bold">By Barangay Summary</h3><p className="text-xs text-muted-foreground">Barangays are sorted A–Z. Numeric rates use the denominator stated in the column label and method note.</p></div><DataTable rows={model.byBarangaySummary} columns={Object.keys(model.byBarangaySummary[0] || {}).map((key) => ({ key, label: key.replace(/_/g," ").replace(/\b\w/g,(c)=>c.toUpperCase()) }))} searchable pageSize={50} hideExport /></section>

    <div className="space-y-5">
      {sortedBarangays.map((b) => <BarangayNameTable key={b} barangay={b} rows={detailGroups.get(b) || []} columns={model.columns} entityLabel={mode === "farming_households" ? "Person(s) in farming/non-farming households" : mode === "agri_employment" ? "Employed person(s)" : "Farming household(s)"} onSelect={(mode === "farming_households" || mode === "agri_employment") ? onSelect : undefined} />)}
    </div>
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">{model.note}</div>
  </div>;
}

function IncomeByBarangay({ mode }: { mode: "households" | "persons" }) {
  const year = getActiveYear();
  const globalBarangay = getActiveBarangay();
  const ds = getYearDatasets(year);
  const incomeOf = (h: any) => {
    const n = Number(h?.h06_total_family_income);
    return Number.isFinite(n) ? n : null;
  };
  const households = useMemo(() => ds.households.filter((h: any) => !globalBarangay || h.area_name === globalBarangay), [ds.households, globalBarangay]);
  const hhMap = useMemo(() => new Map(ds.households.map((h: any) => [householdKey(h), h])), [ds.households]);
  const reported = useMemo(() => households.filter((h: any) => incomeOf(h) !== null), [households]);
  const low20 = useMemo(() => reported.filter((h: any) => incomeOf(h)! < 20000), [reported]);
  const low15 = useMemo(() => reported.filter((h: any) => incomeOf(h)! < 15000), [reported]);

  const headMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of ds.persons) {
      const key = householdKey(p);
      if (!map.has(key) && (p.a02_relation_to_hh_head === "Head" || p.line_number === 1)) map.set(key, p);
    }
    return map;
  }, [ds.persons]);

  const personRows = useMemo(() => {
    return ds.persons
      .filter((p: any) => !globalBarangay || p.area_name === globalBarangay)
      .map((p: any) => {
        const h = hhMap.get(householdKey(p)) as any;
        const head = headMap.get(householdKey(p));
        const income = incomeOf(h);
        return {
          ...p,
          _full_name: getPersonFullName(p),
          _household_head: head ? getPersonFullName(head) : "Household head not stated",
          _purok: h?.address_sitio_purok ?? p.address_sitio_purok ?? "Not stated",
          _household_income: income,
          _income_status: income === null ? "Not reported" : income < 15000 ? "Below ₱15,000" : income < 20000 ? "₱15,000–19,999" : "₱20,000 and above",
          _income_year: year,
          _individual_daily_pay: p.e20_basic_pay_per_day ?? null,
        };
      })
      .filter((p: any) => p._household_income !== null)
      .sort((a: any, b: any) => {
        const ba = String(a.area_name || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b.area_name || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true });
        if (ba !== 0) return ba;
        return String(a._full_name || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b._full_name || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true });
      });
  }, [ds.persons, hhMap, headMap, globalBarangay, year]);

  const grouped = useMemo(() => {
    const source = mode === "households" ? low20 : personRows.filter((p: any) => p._household_income < 20000);
    const map = new Map<string, any[]>();
    for (const row of source) {
      const b = row.area_name || "Not Stated";
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(row);
    }
    for (const rows of map.values()) rows.sort((a: any, b: any) => String(a._full_name || a._household_head || a._household_label || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b._full_name || b._household_head || b._household_label || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true }));
    return new Map(Array.from(map.entries()).sort(([a], [b]) => a.replace(/[^a-z0-9]/gi, "").localeCompare(b.replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true })));
  }, [mode, low20, personRows]);

  const allPersonGrouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of personRows) { const b = row.area_name || "Not Stated"; if (!map.has(b)) map.set(b, []); map.get(b)!.push(row); }
    for (const rows of map.values()) rows.sort((a: any, b: any) => String(a._full_name || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b._full_name || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true }));
    return new Map(Array.from(map.entries()).sort(([a], [b]) => a.replace(/[^a-z0-9]/gi, "").localeCompare(b.replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true })));
  }, [personRows]);

  const summaryRows = useMemo(() => Array.from(grouped.entries()).map(([barangay, rows]) => {
    if (mode === "households") {
      const below15 = rows.filter((h: any) => incomeOf(h)! < 15000).length;
      const reportedHere = reported.filter((h: any) => (h.area_name || "Not Stated") === barangay).length;
      return { barangay, below15, below20: rows.length, reported: reportedHere, share: reportedHere ? `${(rows.length / reportedHere * 100).toFixed(1)}%` : "N/A" };
    }
    const below15 = rows.filter((p: any) => p._household_income < 15000).length;
    const totalPersonsHere = ds.persons.filter((p: any) => (!globalBarangay || p.area_name === globalBarangay) && (p.area_name || "Not Stated") === barangay).length;
    return { barangay, below15, below20: rows.length, persons: totalPersonsHere, share: totalPersonsHere ? `${(rows.length / totalPersonsHere * 100).toFixed(1)}%` : "N/A" };
  }).sort((a, b) => String(a.barangay || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b.barangay || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true })), [grouped, mode, reported, ds.persons, globalBarangay]);

  const summary = mode === "households"
    ? [
        { label: "Reported household income", value: reported.length, percentage: reported.length ? 100 : null, percentageLabel: "Reported-income household base" },
        { label: "Households below ₱15,000", value: low15.length, percentage: shareOf(low15.length, reported.length), percentageLabel: "of households with reported income" },
        { label: "Households below ₱20,000", value: low20.length, percentage: shareOf(low20.length, reported.length), percentageLabel: "of households with reported income" },
        { label: "Below ₱20,000 rate", value: reported.length ? `${(low20.length / reported.length * 100).toFixed(1)}%` : "N/A", percentage: shareOf(low20.length, reported.length), percentageLabel: "Low-income share of reported households" },
      ]
    : [
        { label: "Persons linked to reported HH income", value: personRows.length, percentage: personRows.length ? 100 : null, percentageLabel: "Reported-income person base" },
        { label: "Persons in HH below ₱15,000", value: personRows.filter((p: any) => p._household_income < 15000).length, percentage: shareOf(personRows.filter((p: any) => p._household_income < 15000).length, personRows.length), percentageLabel: "of persons linked to reported HH income" },
        { label: "Persons in HH below ₱20,000", value: personRows.filter((p: any) => p._household_income < 20000).length, percentage: shareOf(personRows.filter((p: any) => p._household_income < 20000).length, personRows.length), percentageLabel: "of persons linked to reported HH income" },
        { label: "Barangays", value: grouped.size },
      ];


  const personColumns = [
    { key: "_full_name", label: "Full Name" },
    { key: "a03_sex", label: "Sex" },
    { key: "a05_age", label: "Age" },
    { key: "area_name", label: "Barangay" },
    { key: "_purok", label: "Purok / Sitio" },
    { key: "_household_head", label: "Household Head" },
    { key: "husn", label: "HUSN" },
    { key: "_household_income", label: "Household Income" },
    { key: "_income_status", label: "Income Bracket" },
    { key: "_individual_daily_pay", label: year === 2022 ? "Basic Pay / Day (2022)" : "Individual Pay" },
  ];

  const householdColumns = [
    { key: "_household_label", label: "Household" },
    { key: "_household_head", label: "Household Head" },
    { key: "area_name", label: "Barangay" },
    { key: "address_sitio_purok", label: "Purok / Sitio" },
    { key: "husn", label: "HUSN" },
    { key: "hsn", label: "HSN" },
    { key: "hh_size", label: "HH Size" },
    { key: "_income", label: "Household Income" },
    { key: "_income_status", label: "Income Bracket" },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Community priority income view</div>
            <h2 className="mt-1 font-display text-xl font-bold">{mode === "households" ? "Households Below ₱20,000" : "People Living in Households Below ₱20,000"}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              {mode === "households"
                ? "Use this as a practical planning roster. Each row is a household with a reported H06 Total Family Income below ₱20,000, grouped by barangay."
                : "CBMS records household income, not a verified income value for every individual. This roster links each person's name to their household's reported income so outreach lists remain transparent and defensible."}
            </p>
          </div>
          <div className="rounded-xl bg-background px-4 py-3 text-right shadow-sm"><div className="text-[10px] uppercase text-muted-foreground">Workspace</div><div className="font-bold">CBMS {year}</div><div className="text-[11px] text-muted-foreground">{globalBarangay || "All Barangays"}</div></div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold">Complete income report</div><div className="text-xs text-muted-foreground">Includes the summary, every barangay, and the underlying priority records.</div></div>
        <SectorExportActions
          title={`${year} ${mode === "households" ? "LOW-INCOME HOUSEHOLDS" : "PERSONS IN LOW-INCOME HOUSEHOLDS"}`}
          subtitle={`H06 Total Family Income below ₱20,000 · CBMS ${year}`}
          columns={mode === "households" ? [
            { key: "barangay", label: "Barangay" },
            { key: "below15", label: "Below ₱15,000" },
            { key: "below20", label: "Below ₱20,000" },
            { key: "reported", label: "Reported Income" },
            { key: "share", label: "% Below ₱20k" },
          ] : [
            { key: "barangay", label: "Barangay" },
            { key: "below15", label: "Persons < ₱15k HH" },
            { key: "below20", label: "Persons < ₱20k HH" },
            { key: "persons", label: "Total Persons" },
            { key: "share", label: "% of Persons" },
          ]}
          rows={summaryRows}
          summary={summary}
          exportDetailColumns={mode === "households" ? householdColumns : personColumns}
          groups={new Map(Array.from(grouped.entries()).map(([b, list]) => [b, mode === "households" ? list.map((h:any) => ({ ...h, _income: incomeOf(h), _household_label: `Household ${h.husn || "—"}`, _household_head: headMap.get(householdKey(h)) ? getPersonFullName(headMap.get(householdKey(h))) : "Head not stated", _income_status: incomeOf(h)! < 15000 ? "Below ₱15,000" : "₱15,000–19,999" })) : list]))}
        />
      </section>

      <DataTable
        title={`${year} ${mode === "households" ? "LOW-INCOME HOUSEHOLDS" : "PERSONS IN LOW-INCOME HOUSEHOLDS"} — by Barangay`}
        subtitle={mode === "households" ? `H06 Total Family Income below ₱20,000 · ${year} household data` : `Persons linked to households with H06 Total Family Income below ₱20,000 · ${year} data`}
        rows={summaryRows}
        columns={mode === "households" ? [
          { key: "barangay", label: "Barangay" }, { key: "below15", label: "Below ₱15,000" }, { key: "below20", label: "Below ₱20,000" }, { key: "reported", label: "Reported Income" }, { key: "share", label: "% Below ₱20k" },
        ] : [
          { key: "barangay", label: "Barangay" }, { key: "below15", label: "Persons < ₱15k HH" }, { key: "below20", label: "Persons < ₱20k HH" }, { key: "persons", label: "Total Persons" }, { key: "share", label: "% of Persons" },
        ]}
        summary={summary}
        searchable={false}
        hideExport
        pageSize={100}
      />

      {Array.from(grouped.entries()).map(([barangay, rows]) => (
        <DataTable
          key={`priority-${barangay}`}
          title={`${barangay} — ${mode === "households" ? "Low-income households" : "Priority persons below ₱20,000 HH income"}`}
          subtitle={`${rows.length.toLocaleString()} record(s) · household income below ₱20,000`}
          rows={mode === "households" ? rows.map((h: any) => ({ ...h, _income: incomeOf(h), _household_label: `Household ${h.husn || "—"}`, _household_head: headMap.get(householdKey(h)) ? getPersonFullName(headMap.get(householdKey(h))) : "Head not stated", _income_status: incomeOf(h)! < 15000 ? "Below ₱15,000" : "₱15,000–19,999" })) : rows}
          columns={mode === "households" ? householdColumns : personColumns}
          pageSize={25}
          emptyText="No reported low-income records in this barangay."
          hideExport
        />
      ))}

      {mode === "persons" && Array.from(allPersonGrouped.entries()).map(([barangay, rows]) => (
        <DataTable
          key={`all-${barangay}`}
          title={`${barangay} — All persons with reported household income`}
          subtitle={`${rows.length.toLocaleString()} person(s) · includes the income bracket for each household`}
          rows={rows}
          columns={personColumns}
          pageSize={25}
          emptyText="No persons with reported household income."
          hideExport
        />
      ))}

      {!grouped.size && <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">No reported household income records match the current year/barangay.</div>}
    </div>
  );
}

function VerifyPanel({ tab, brgy, rows, summary }: { tab: string; brgy: string; rows: any[]; summary?: any[] }) {
  const [result, setResult] = useState<ReturnType<typeof verifySector> | null>(null);
  const run = () => setResult(verifySector(tab, brgy, rows, summary));
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={run}>
          <CheckCircle2 className="h-4 w-4" /> Verify Counts vs Exports
        </Button>
        <span className="text-xs text-muted-foreground">
          Re-counts this roster independently from the raw data and confirms the on-screen TOTAL + summary match what CSV/Excel/PDF will contain.
        </span>
      </div>
      {result && <VerifyResultCard result={result} />}
    </div>
  );
}


function baseColumnsFor(tab: TabId) {
  const ident = [
    { key: "_full_name", label: "Full Name" },
    { key: "a03_sex", label: "Sex" },
    { key: "a05_age", label: "Age" },
    { key: "area_name", label: "Barangay" },
    { key: "_purok", label: "Purok / Sitio" },
    { key: "_address", label: "Address" },
    { key: "_hh_head", label: "Household Head" },
    { key: "husn", label: "HUSN" },
  ];
  const livelihood = [
    { key: "e01_employment_status", label: "Employment" },
    { key: "e08_class_of_worker", label: "Class of Worker" },
    { key: "e05_occupation_group", label: "Occupation" },
  ];
  if (tab === "pwd") {
    return [
      ...ident,
      { key: "b10_pwd", label: "Self-PWD" },
      { key: "b11_with_pwd_id", label: "PWD ID" },
      { key: "b19_ssdi", label: "Disability Type (SSDI)" },
      ...livelihood,
    ];
  }
  if (tab === "fourps") {
    return [
      ...ident,
      { key: "a02_relation_to_hh_head", label: "Relation" },
      { key: "_hh.m05_a_4ps", label: "HH 4Ps" } as any,
      { key: "_hh.m06_a_benefit_4ps", label: "Received Benefit" } as any,
      ...livelihood,
    ];
  }
  if (tab === "not_fourps") {
    return [
      ...ident,
      { key: "_hh.hh_size", label: "HH Size" } as any,
      { key: "_hh.m05_a_4ps", label: "HH 4Ps" } as any,
      { key: "_hh.m05_d_food_stamp", label: "HH Food Stamp" } as any,
      ...livelihood,
    ];
  }
  if (tab === "food_stamp") {
    return [
      ...ident,
      { key: "a02_relation_to_hh_head", label: "Relation" },
      { key: "_hh.m05_d_food_stamp", label: "HH Enrolled" } as any,
      { key: "_hh.m06_d_benefit_food_stamp", label: "Received Benefit" } as any,
      ...livelihood,
    ];
  }
  if (tab === "senior") {
    return [
      ...ident,
      { key: "b07_senior_citizen_id", label: "Sr. ID" },
      { key: "a07_marital_status", label: "Civil Status" },
      ...livelihood,
    ];
  }
  if (tab === "solo_parent") {
    return [...ident, { key: "b06_solo_parent_id", label: "Solo Parent ID" }, { key: "a07_marital_status", label: "Civil Status" }, ...livelihood];
  }
  return [...ident, { key: "_hh.m05_b_socpen", label: "HH SocPen" } as any, ...livelihood];
}
function FoodHouseholdByBarangay({ mode }: { mode: "under_three" | "skipped" }) {
  const year = getActiveYear();
  const globalBarangay = getActiveBarangay();
  const ds = getYearDatasets(year);
  const headByHousehold = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of ds.persons) {
      const key = householdKey(p);
      const isHead = p?.a02_relation_to_hh_head === "Head" || Number(p?.line_number) === 1;
      if (isHead || !map.has(key)) map.set(key, p);
    }
    return map;
  }, [ds.persons, year]);

  const sourceRows = useMemo(() => {
    return ds.households
      .filter((h:any) => !globalBarangay || h.area_name === globalBarangay)
      .filter((h:any) => mode === "skipped" ? h.g04_skipped_meal === "Yes" : isUnderThreeMeals(h));
  }, [ds.households, globalBarangay, mode, year]);

  const enrichedRows = useMemo(() => sourceRows.map((h:any) => {
    const head = headByHousehold.get(hhKeySafe(h));
    const info = getMealFrequency(h);
    return {
      ...h,
      _full_name: head ? (getPersonFullName(head) || "Not Stated") : "Not Stated",
      _food_frequency: mode === "skipped" ? (h.g04_skipped_meal || "Yes") : info.label,
      _food_frequency_source: mode === "skipped" ? "CBMS skipped-meal response" : (info.source || "Explicit meal-frequency field"),
    };
  }), [sourceRows, headByHousehold, mode]);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const b of getSectorBarangays(year)) m.set(b, []);
    for (const h of enrichedRows) {
      const b = txt(h.area_name);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(h);
    }
    return m;
  }, [enrichedRows, year]);
  const rows = useMemo(() => Array.from(groups.entries()).map(([barangay, list]) => ({
    barangay,
    households: list.length,
    share: sourceRows.length ? `${(list.length / sourceRows.length * 100).toFixed(2)}%` : "0%",
  })), [groups, sourceRows.length]);
  const total = sourceRows.length;
  const columns: ExportColumn[] = [
    { key: "_full_name", label: "Household Head" },
    { key: "area_name", label: "Barangay" },
    { key: "husn", label: "HUSN" },
    { key: "_food_frequency", label: mode === "skipped" ? "Skipped a Meal" : "Meals per Day" },
  ];
  const detailGroups = useMemo(() => new Map(Array.from(groups.entries()).map(([b, list]) => [
    b,
    list.map((h:any) => ({ ...h, area_name: b })),
  ])), [groups]);
  const summary: SectorSummaryItem[] = [
    { label: mode === "skipped" ? "Households that skipped a meal" : "Households eating less than 3 meals/day", value: total, percentage: total ? 100 : null, percentageLabel: mode === "skipped" ? "Households with a reported skipped meal" : "Explicitly identified as 1 or 2 meals/day / below 3 meals/day" },
    { label: "Barangays covered", value: groups.size },
  ];
  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Utensils className="h-5 w-5" /></div>
        <div>
          <h2 className="font-display text-xl font-bold">Households — {mode === "skipped" ? "Skipped a Meal" : "Eating Less Than 3 Meals a Day"}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {mode === "skipped"
              ? "Households whose food-security response reports that a household member skipped a meal."
              : "Only households with an explicit meal-frequency / meal-adequacy value showing 1 meal/day, 2 meals/day, or below 3 meals/day are included. CBMS I02 food-consumption-expenditure frequency is intentionally not used for this indicator."}
          </p>
        </div>
      </div>
    </section>
    <SectorSummaryTable
      title={`Households — ${mode === "skipped" ? "Skipped a Meal" : "Eating Less Than 3 Meals a Day"} by Barangay`}
      subtitle={`CBMS ${year}`}
      summary={summary}
      exportRows={rows}
      exportColumns={[{key:"barangay",label:"Barangay"},{key:"households",label:"Households"},{key:"share",label:"Share of matched households"}]}
      exportTitle={`Households — ${mode === "skipped" ? "Skipped a Meal" : "Eating Less Than 3 Meals a Day"} by Barangay`}
      exportSubtitle={`CBMS ${year} · Household-head list`}
      exportGroups={detailGroups}
      exportDetailColumns={columns}
    />
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([b,list]) => <DataTable key={b} title={`Barangay ${b}`} subtitle={`${list.length.toLocaleString()} household(s)`} rows={list} columns={columns} pageSize={25} hideExport emptyText="No matching households. Only explicit meals-per-day responses are counted for this report; the CBMS I02 food-consumption-frequency field is not interpreted as meals per day." />)}
    </div>
  </div>;
}

function hhKeySafe(h: any) {
  return householdKey(h);
}

// ── Generic livelihood / education views by barangay ───────────────────────
function GenericByBarangay({ def, onSelect }: { def: GenericDef; onSelect: (p: any) => void }) {
  const result = useMemo(() => {
    const all = getEnrichedPersons();
    const groups = new Map<string, any[]>();
    const totals = new Map<string, number>();

    for (const p of all) {
      const b = txt(p.area_name);
      totals.set(b, (totals.get(b) || 0) + 1);
      const row = {
        ...p,
        _full_name: p._full_name || NS,
        a03_sex: txt(p.a03_sex),
        a05_age: p.a05_age ?? NS,
        _category: def.mode === "distribution" ? def.categoryOf!(p) : "",
      };
      for (const c of def.extra) row[c.key] = txt((p as any)[c.key]);
      if (def.mode === "flag" && !def.match!(p)) continue;
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b)!.push(row);
    }

    const barangayNames = getSectorBarangays();
    for (const b of barangayNames) {
      if (!totals.has(b)) totals.set(b, 0);
      if (!groups.has(b)) groups.set(b, []);
    }

    const personColumns = [
      { key: "_full_name", label: "Full Name" },
      { key: "a03_sex", label: "Sex" },
      { key: "a05_age", label: "Age" },
      ...def.extra,
      { key: "_purok", label: "Purok / Sitio" },
    ];

    if (def.mode === "flag") {
      const count = barangayNames.reduce((n, b) => n + (groups.get(b)?.length || 0), 0);
      const population = barangayNames.reduce((n, b) => n + (totals.get(b) || 0), 0);
      return {
        groups,
        personColumns,
        summary: [
          { label: def.countLabel || "Count", value: count, percentage: shareOf(count, population), percentageLabel: `${pctText(shareOf(count, population))} of total population` },
          { label: genericComplementLabel(def), value: Math.max(0, population - count), percentage: shareOf(Math.max(0, population - count), population), percentageLabel: `${pctText(shareOf(Math.max(0, population - count), population))} of total population` },
          { label: "Total Population", value: population, percentage: population > 0 ? 100 : null, percentageLabel: population > 0 ? "100% population base" : "No population recorded" },
          { label: "No. of Barangay", value: barangayNames.length },
        ],
        summaryTotal: count,
      };
    }

    const categoryTotals = new Map<string, number>();
    for (const b of barangayNames) {
      for (const row of groups.get(b) || []) {
        const category = row._category || NS;
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
      }
    }
    const total = Array.from(categoryTotals.values()).reduce((a, b) => a + b, 0);
    const summary = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value, percentage: shareOf(value, total), percentageLabel: `${pctText(shareOf(value, total))} of classified population` }));
    return { groups, personColumns, summary, summaryTotal: total };
  }, [def]);

  const { groups, personColumns, summary, summaryTotal } = result as any;
  const sortedBarangays = useMemo(
    () => Array.from((groups as Map<string, any[]>).keys()).sort(sortNamesAZ),
    [groups],
  );

  return (
    <div className="space-y-6">
      <GroupVerifyPanel
        label={def.title}
        groups={groups as Map<string, any[]>}
        summaryTotal={summaryTotal}
        overallTotal={summaryTotal}
      />

      <SectorSummaryTable
        title={def.title}
        subtitle={def.subtitle}
        summary={summary}
        exportRows={Array.from((groups as Map<string, any[]>).values()).flat()}
        exportColumns={personColumns}
        exportTitle={`${def.title} — Complete Roster`}
        exportSubtitle={def.subtitle}
        exportGroups={groups as Map<string, any[]>}
        exportDetailColumns={personColumns as ExportColumn[]}
      />

      <div className="space-y-5">
        {sortedBarangays.map((b) => {
          const rows = (groups.get(b) || []) as any[];
          return (
            <BarangayNameTable
              key={b}
              barangay={b}
              rows={rows}
              columns={personColumns}
              entityLabel={def.countLabel || (def.mode === "distribution" ? "Person(s)" : "Person(s)")}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

type PrintableModel = GroupedExportPayload & { totalRecords: number; groupCount: number };

function buildSectorExportModel({
  title, subtitle, columns, rows, summary, groups, exportDetailColumns, includeBarangay = true,
}: {
  title: string; subtitle?: string; columns: ExportColumn[]; rows: any[]; summary?: SectorSummaryItem[]; groups?: Map<string, any[]>; exportDetailColumns?: ExportColumn[]; includeBarangay?: boolean;
}): PrintableModel {
  if (!groups) return { title, subtitle, columns, rows, summary, totalRecords: rows.length, groupCount: 0 };
  const summaryCols = columns.slice();
  const baseCols = (exportDetailColumns || columns).slice();
  const hasBarangay = baseCols.some((c) => c.key === "area_name" || c.key === "barangay");
  const groupList = Array.from(groups.entries()).filter(([name]) => String(name).trim()).sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true }));
  const suppliedSummaryRows = rows.filter((r) => Object.prototype.hasOwnProperty.call(r, "barangay"));
  const barangaySummaryRows = suppliedSummaryRows.length ? suppliedSummaryRows : groupList.map(([barangay, list]) => ({ barangay, records: list.length }));
  const barangaySummaryColumns: ExportColumn[] = suppliedSummaryRows.length ? summaryCols : [{ key: "barangay", label: "Barangay" }, { key: "records", label: "Records" }];
  const detailGroups = groupList.map(([barangay, list]) => ({ title: String(barangay), rows: list.map((r) => ({ ...r, ...(hasBarangay || !includeBarangay ? {} : { barangay }) })) }));
  const detailRows = detailGroups.flatMap((g) => g.rows);
  return { title, subtitle, columns: baseCols, rows: rows.length ? rows : detailRows, summary, barangaySummaryRows, barangaySummaryColumns, groups: detailGroups, totalRecords: detailRows.length, groupCount: detailGroups.length };
}

function SectorExportActions({
  title, subtitle, columns, rows, summary, groups, exportDetailColumns, includeBarangay = true,
}: {
  title: string; subtitle?: string; columns: ExportColumn[]; rows: any[]; summary?: SectorSummaryItem[]; groups?: Map<string, any[]>; exportDetailColumns?: ExportColumn[]; includeBarangay?: boolean;
}) {
  const exportModel = useMemo(() => buildSectorExportModel({ title, subtitle, columns, rows, summary, groups, exportDetailColumns, includeBarangay }), [title, subtitle, columns, rows, summary, groups, exportDetailColumns, includeBarangay]);
  const exportPayload: GroupedExportPayload = {
    title,
    subtitle,
    columns: exportModel.columns,
    rows: exportModel.rows,
    summary: exportModel.summary,
    barangaySummaryColumns: exportModel.barangaySummaryColumns,
    barangaySummaryRows: exportModel.barangaySummaryRows,
    groups: exportModel.groups,
    note: `Complete CBMS sector report · ${subtitle || "All Barangays"}`,
    dataYear: getActiveYear(),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => printPayload(exportPayload)} title={`Print complete ${title} report`}>
        <Printer className="h-4 w-4" /> Print
      </Button>
      <Button size="sm" variant="outline" onClick={() => void exportPDF(exportPayload)} title={`Download complete ${title} report`}>
        <Download className="h-4 w-4" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => void exportDOCX(exportPayload)}>
        <Download className="h-4 w-4" /> Word
      </Button>
    </div>
  );
}

function SectorSummaryTable({
  title, subtitle, summary, exportRows, exportColumns, exportTitle, exportSubtitle, exportGroups, exportDetailColumns,
}: {
  title: string;
  subtitle?: string;
  summary: SectorSummaryItem[];
  exportRows?: any[];
  exportColumns?: { key: string; label: string }[];
  exportTitle?: string;
  exportSubtitle?: string;
  exportGroups?: Map<string, any[]>;
  exportDetailColumns?: ExportColumn[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {exportColumns && (Boolean(exportRows?.length) || Boolean(exportGroups)) && (
          <SectorExportActions
            title={exportTitle || title}
            subtitle={exportSubtitle || subtitle}
            columns={exportColumns}
            rows={exportRows ?? []}
            summary={summary}
            groups={exportGroups}
            exportDetailColumns={exportDetailColumns}
          />
        )}
      </div>
      <div className="sector-summary-table-wrap">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-secondary/70">
            <tr>
              <th className="border-b border-border px-4 py-2.5 text-left font-semibold">Indicator</th>
              <th className="border-b border-border px-4 py-2.5 text-right font-semibold">Count / Value</th>
              <th className="border-b border-border px-4 py-2.5 text-right font-semibold">Percentage Rate (%Rate) / Population (%Population)</th>
              <th className="hidden border-b border-border px-4 py-2.5 text-left font-semibold md:table-cell">Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((item) => (
              <tr key={item.label} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 font-semibold">{item.label}</td>
                <td className="px-4 py-2.5 text-right font-black tabular-nums">
                  {typeof item.value === "number" ? item.value.toLocaleString() : String(item.value)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {item.percentage != null ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black tabular-nums text-primary">{item.percentage.toFixed(1)}%</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">{item.percentageLabel || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BarangayNameTable({
  barangay, rows, columns, entityLabel, onSelect,
}: {
  barangay: string;
  rows: any[];
  columns: any[];
  entityLabel: string;
  onSelect?: (p: any) => void;
}) {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => String(a._full_name || "").replace(/[^a-z0-9]/gi, "").localeCompare(String(b._full_name || "").replace(/[^a-z0-9]/gi, ""), undefined, { sensitivity: "base", numeric: true })),
    [rows],
  );
  const countText = `${rows.length.toLocaleString()} ${entityLabel}${rows.length === 1 ? "" : entityLabel.endsWith("s") ? "" : "s"} in this barangay`;

  return (
    <DataTable
      title={`Barangay ${barangay}`}
      subtitle={countText}
      rows={sortedRows}
      columns={columns}
      searchable={true}
      pageSize={25}
      onRowClick={onSelect}
      emptyText="No matching persons in this barangay."
      hideExport
    />
  );
}
