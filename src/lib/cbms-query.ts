// Smart natural-language query engine for CBMS Person records.
// Returns a filtered list with the columns most relevant to the query.
import { barangays } from "@/data/cbms";
import { getEnrichedPersons, isMember, assessLowIncome } from "./cbms-recognition";

export type Person = Record<string, any>;

export interface QueryResult {
  title: string;
  subtitle: string;
  rows: Person[];
  columns: { key: string; label: string }[];
  total: number;
  matchedFilters: string[];
}

const DEFAULT_COLS = [
  { key: "_full_name", label: "Full Name" },
  { key: "a05_age", label: "Age" },
  { key: "a03_sex", label: "Sex" },
  { key: "a07_marital_status", label: "Civil Status" },
  { key: "area_name", label: "Barangay" },
  { key: "_purok", label: "Purok / Sitio" },
  { key: "_address", label: "Address" },
  { key: "_hh_head", label: "Household Head" },
  { key: "e08_class_of_worker", label: "Class of Worker" },
];

function parseAgeRange(q: string): [number, number] | null {
  const m = q.match(/(\d{1,3})\s*[-–to]+\s*(\d{1,3})/);
  if (m) return [parseInt(m[1]), parseInt(m[2])];
  const lt = q.match(/(?:under|below|less than)\s*(\d{1,3})/);
  if (lt) return [0, parseInt(lt[1]) - 1];
  const ge = q.match(/(?:over|above|at least|older than|\bge\b)\s*(\d{1,3})/);
  if (ge) return [parseInt(ge[1]), 120];
  const eq = q.match(/\bage\s*(\d{1,3})\b/);
  if (eq) return [parseInt(eq[1]), parseInt(eq[1])];
  return null;
}

function findBarangay(q: string): string | null {
  const lower = q.toLowerCase();
  for (const b of barangays) {
    if (lower.includes(b.area_name.toLowerCase())) return b.area_name;
  }
  return null;
}

const NAME_STOPWORDS = new Set([
  "in","of","at","the","and","or","with","a","an","by","for","to","on","from",
  "years","year","old","male","female","men","women","man","woman","boy","boys","girl","girls",
  "child","children","senior","seniors","citizen","citizens","pwd","disability","disabilities",
  "solo","parent","parents","pregnant","lactating","employed","unemployed","underemployed",
  "farmer","farmers","fisherfolk","fisher","fishermen","tvet","student","students","school",
  "widow","widowed","separated","married","single","4ps","pantawid","food","stamp","fsp",
  "socpen","pension","philhealth","sss","gsis","beneficiaries","beneficiary","member","members",
  "youth","infant","infants","toddler","toddlers","elderly","under","below","over","above",
  "less","than","least","ge","age","graduates","graduate","currently","attending","not",
  "low","income","poor","poverty","indigent","earner",
]);

export const normName = (s: string) =>
  s.toLowerCase().replace(/[^a-zñ\s'-]/g, " ").replace(/\s+/g, " ").trim();

export function extractNameTokens(query: string, brgy?: string | null): string[] {
  const q = normName(query);
  if (!q) return [];
  return q
    .split(" ")
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t) && (!brgy || !brgy.toLowerCase().includes(t)));
}

export function smartQuery(query: string): QueryResult {
  const q = query.trim();
  const lower = q.toLowerCase();
  const filters: string[] = [];
  let rows: Person[] = getEnrichedPersons();

  // Sex
  if (/\b(male|men|man|boys?)\b/.test(lower) && !/female/.test(lower)) {
    rows = rows.filter((p) => p.a03_sex === "Male");
    filters.push("Male");
  }
  if (/\b(female|women|woman|girls?)\b/.test(lower)) {
    rows = rows.filter((p) => p.a03_sex === "Female");
    filters.push("Female");
  }

  // Age
  const range = parseAgeRange(lower);
  if (range) {
    rows = rows.filter((p) => typeof p.a05_age === "number" && p.a05_age >= range[0] && p.a05_age <= range[1]);
    filters.push(`Age ${range[0]}–${range[1]}`);
  }

  // Senior citizens
  if (/senior\s*citizen/.test(lower) || lower.includes("elderly")) {
    rows = rows.filter((p) => typeof p.a05_age === "number" && p.a05_age >= 60);
    filters.push("Senior Citizens (60+)");
  }
  if (/\bchildren?\b/.test(lower) && !range) {
    rows = rows.filter((p) => typeof p.a05_age === "number" && p.a05_age <= 17);
    filters.push("Children (0–17)");
  }
  if (/\binfants?\b|\btoddlers?\b/.test(lower)) {
    rows = rows.filter((p) => typeof p.a05_age === "number" && p.a05_age <= 5);
    filters.push("Ages 0–5");
  }
  if (/youth/.test(lower)) {
    rows = rows.filter((p) => typeof p.a05_age === "number" && p.a05_age >= 15 && p.a05_age <= 30);
    filters.push("Youth (15–30)");
  }

  // PWD (uses recognition rule)
  if (/\bpwd\b|disabilit/.test(lower)) {
    rows = rows.filter((p) => isMember("pwd", p));
    filters.push("Persons with Disability");
  }

  // Solo parents
  if (/solo\s*parent/.test(lower)) {
    rows = rows.filter((p) => p.b05_solo_parent === "Yes");
    filters.push("Solo Parents");
  }

  // Pregnant / lactating
  if (/pregnan/.test(lower)) {
    rows = rows.filter((p) => p.b08_currently_pregnant === "Yes");
    filters.push("Currently Pregnant");
  }
  if (/lactating/.test(lower)) {
    rows = rows.filter((p) => p.b09_lactating_mother === "Yes");
    filters.push("Lactating Mothers");
  }

  // Employment
  if (/unemploye/.test(lower)) {
    rows = rows.filter((p) => p.e01_employment_status === "Unemployed");
    filters.push("Unemployed");
  } else if (/\bemploye/.test(lower) && !/under|un/.test(lower)) {
    rows = rows.filter((p) => p.e01_employment_status === "Employed");
    filters.push("Employed");
  }
  if (/underemploye/.test(lower)) {
    rows = rows.filter((p) => p.e01_underemployment_status === "Underemployed");
    filters.push("Underemployed");
  }

  // Sectors
  if (/\bfarmers?\b|farming/.test(lower)) {
    rows = rows.filter((p) => p.e17_farmer === "Yes");
    filters.push("Farmers");
  }
  if (/fisherfolk|fisher(men)?/.test(lower)) {
    rows = rows.filter((p) => p.e18_fisherfolk === "Yes");
    filters.push("Fisherfolk");
  }

  // Education
  if (/\btvet\b|technical[- ]vocational/.test(lower)) {
    rows = rows.filter((p) => p.d07_tvet_graduate === "Yes" || p.d08_tvet_currently_attending === "Yes");
    filters.push("TVET");
  }
  if (/students?|attending school|in school/.test(lower)) {
    rows = rows.filter((p) => p.d01_currently_attending_school === "Yes");
    filters.push("Students");
  }
  if (/out[- ]of[- ]school|not attending school|not in school/.test(lower)) {
    rows = rows.filter((p) => p.d01_currently_attending_school === "No" && typeof p.a05_age === "number" && p.a05_age >= 5 && p.a05_age <= 24);
    filters.push("Out-of-School Youth (5–24)");
  }

  // Civil status
  if (/widow/.test(lower)) {
    rows = rows.filter((p) => p.a07_marital_status === "Widowed");
    filters.push("Widowed");
  }
  if (/separated/.test(lower)) {
    rows = rows.filter((p) => p.a07_marital_status === "Separated");
    filters.push("Separated");
  }
  if (/married/.test(lower)) {
    rows = rows.filter((p) => p.a07_marital_status === "Married");
    filters.push("Married");
  }
  if (/single|never married/.test(lower)) {
    rows = rows.filter((p) => p.a07_marital_status === "Single");
    filters.push("Single");
  }

  // Social protection (4Ps & food stamp use inclusive household indicators
  // so quick-search always returns EVERY 4Ps beneficiary regardless of the
  // stricter rule override an operator may have set on Sector Rosters).
  const isYes = (v: any) => v === "Yes" || v === 1 || v === "1" || v === true;
  if (/4\s*p[s']?|pantawid/.test(lower)) {
    rows = rows.filter((p) => isYes(p._hh?.m05_a_4ps) || isYes(p._hh?.m06_a_benefit_4ps));
    filters.push("4Ps Beneficiaries");
  }
  if (/food\s*stamp|food\s*ramp|fsp\b/.test(lower)) {
    rows = rows.filter((p) => isYes(p._hh?.m05_d_food_stamp) || isYes(p._hh?.m06_d_benefit_food_stamp));
    filters.push("Food Stamp Members");
  }

  if (/socpen|social pension/.test(lower)) {
    rows = rows.filter((p) => isMember("socpen", p));
    filters.push("Social Pension");
  }
  if (/philhealth/.test(lower)) {
    rows = rows.filter((p) => p.m01_c_philhealth === "Yes");
    filters.push("PhilHealth Members");
  }
  if (/\bsss\b/.test(lower)) {
    rows = rows.filter((p) => p.m01_a_sss === "Yes");
    filters.push("SSS Members");
  }
  if (/\bgsis\b/.test(lower)) {
    rows = rows.filter((p) => p.m01_b_gsis === "Yes");
    filters.push("GSIS Members");
  }

  // Low-income (composite signal — see assessLowIncome)
  let lowIncomeMode = false;
  if (/low[- ]?income|\bpoor\b|poverty|indigent|low earner/.test(lower)) {
    rows = rows
      .map((p) => ({ p, a: assessLowIncome(p) }))
      .filter((x) => x.a.isLow)
      .sort((a, b) => b.a.score - a.a.score)
      .map((x) => ({ ...x.p, _li_score: x.a.score, _li_reasons: x.a.reasons.join("; ") }));
    filters.push("Low-Income (verified signals)");
    lowIncomeMode = true;
  }

  // Barangay filter
  const brgy = findBarangay(q);
  if (brgy) {
    rows = rows.filter((p) => p.area_name === brgy);
    filters.push(`Barangay ${brgy}`);
  }

  // Full-name search — runs whenever the query has alphabetic tokens that
  // don't correspond to recognised keywords. Scores rows so the most relevant
  // names rank first; ignores token order; tolerates middle-name/initial gaps.
  const queryNorm = normName(lower);
  const nameTokens = extractNameTokens(lower, brgy);


  if (nameTokens.length > 0) {
    const escape = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const scored = rows
      .map((p) => {
        const name = normName(String(p._full_name ?? ""));
        if (!name) return { p, score: 0 };
        const nameWords = name.split(" ");
        let score = 0;
        let matched = 0;
        for (const t of nameTokens) {
          let tScore = 0;
          // exact whole-word match
          if (nameWords.includes(t)) tScore += 6;
          // word-start prefix (e.g. "del" matches "dela")
          else if (nameWords.some((w) => w.startsWith(t))) tScore += 4;
          // substring anywhere
          else if (name.includes(t)) tScore += 2;
          if (tScore > 0) { matched++; score += tScore; }
        }
        // Exact / prefix bonuses on the full string
        if (name === queryNorm) score += 25;
        else if (name.startsWith(queryNorm)) score += 8;
        // Require at least one token to match. Demote partial matches when
        // the user typed multiple tokens but only some hit (so close matches
        // still appear, but better ones rank higher).
        if (matched === 0) return { p, score: 0 };
        if (matched < nameTokens.length) score = Math.max(1, score - (nameTokens.length - matched) * 3);
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      rows = scored.map((x) => x.p);
      filters.push(`Name: "${nameTokens.join(" ")}"`);
    }
  }

  // Build dynamic columns based on filters detected
  const cols = [...DEFAULT_COLS];
  if (lowIncomeMode) {
    cols.push(
      { key: "e01_employment_status", label: "Employment" },
      { key: "e08_class_of_worker", label: "Class of Worker" },
      { key: "m05_a_4ps", label: "4Ps" },
      { key: "_li_score", label: "Signals" },
      { key: "_li_reasons", label: "Why flagged" },
    );
  }
  if (filters.some((f) => /Farmer|Fisher/.test(f))) {
    cols.push({ key: "e05_psoc", label: "Occupation" });
  }
  if (filters.some((f) => /Employ|Unemploy|Underemploy/.test(f))) {
    cols.push({ key: "e01_employment_status", label: "Employment" }, { key: "e05_occupation_group", label: "Occupation Group" });
  }
  if (filters.some((f) => /TVET/.test(f))) {
    cols.push({ key: "d07_tvet_graduate", label: "TVET Grad" });
  }
  if (filters.some((f) => /PWD|Disabil/.test(f))) {
    cols.push({ key: "b11_with_pwd_id", label: "PWD ID" });
  }
  if (filters.some((f) => /Senior/.test(f))) {
    cols.push({ key: "b07_senior_citizen_id", label: "Sr. ID" });
  }
  if (filters.some((f) => /4Ps|Pension|PhilHealth|SSS|GSIS/.test(f))) {
    cols.push({ key: "m05_a_4ps", label: "4Ps" }, { key: "m01_c_philhealth", label: "PhilHealth" });
  }
  if (filters.some((f) => /Student|School/.test(f))) {
    cols.push({ key: "a11_hgc_level", label: "Education Level" });
  }

  const title = filters.length
    ? `List of ${filters.join(" • ")}`
    : q
      ? `Search Results for “${q}”`
      : "All Persons";

  return {
    title,
    subtitle: `${rows.length.toLocaleString()} record(s) found${filters.length ? "" : " — refine your search to narrow down"}`,
    rows,
    columns: cols,
    total: rows.length,
    matchedFilters: filters,
  };
}

export const QUICK_SEARCHES = [
  "Low income",
  "0-5 years old",
  "Senior citizens",
  "PWD",
  "Solo parents",
  "4Ps beneficiaries",
  "Food stamp members",
  "Farmers",
  "Fisherfolk",
  "Unemployed",
  "Underemployed",
  "TVET graduates",
  "Out of school youth",
  "Pregnant women",
  "Widowed females",
];
