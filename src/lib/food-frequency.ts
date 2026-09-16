/**
 * Meal-frequency helpers.
 *
 * Important: CBMS 2022 I02 is a food-consumption-expenditure frequency field,
 * not a "meals eaten per day" field. This module therefore never interprets
 * I02 as meals/day. It looks only for explicit meal-frequency / meal-adequacy
 * fields (including equivalent labels preserved inside legacy_raw).
 */

export type MealFrequencyInfo = {
  mealsPerDay: number | null;
  label: string;
  source: string;
  underThree: boolean | null;
};

const EXCLUDED_KEYS = new Set([
  "i02_frequency_of_food_consumption",
  "I02_FREQUENCY_OF_FOOD_CONSUMPTION".toLowerCase(),
]);

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function yesValue(value: unknown) {
  const v = cleanText(value).toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

function noValue(value: unknown) {
  const v = cleanText(value).toLowerCase();
  return v === "no" || v === "n" || v === "false" || v === "0";
}

function parseExplicitMealValue(value: unknown, keyHint: string): MealFrequencyInfo | null {
  if (value === null || value === undefined || value === "") return null;
  const key = normalizeKey(keyHint);
  if (EXCLUDED_KEYS.has(key)) return null;

  const raw = cleanText(value);
  const lower = raw.toLowerCase();

  // Strong text signals.
  const lessThanThree = /(less|fewer|below|under)\s*(than\s*)?3\s*(full\s*)?(meals?|times?\b)/i.test(lower)
    || /not\s*(eating|eat)\s*3\s*(meals?|times?)/i.test(lower)
    || /only\s*[12]\s*(meals?|times?)\s*(a|per)\s*day/i.test(lower);
  if (lessThanThree) {
    const one = /\b(?:1|one)\s*(?:meal|time)s?\s*(?:a|per)\s*day\b/i.test(lower);
    const two = /\b(?:2|two)\s*(?:meal|time)s?\s*(?:a|per)\s*day\b/i.test(lower);
    const meals = one ? 1 : two ? 2 : null;
    return { mealsPerDay: meals, label: meals ? `${meals} meal${meals === 1 ? "" : "s"}/day` : "Less than 3 meals/day", source: keyHint, underThree: true };
  }

  const dayMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:meal|meals|time|times)\s*(?:a|per)\s*day\b/i);
  if (dayMatch) {
    const meals = Number(dayMatch[1]);
    if (Number.isFinite(meals) && meals >= 0 && meals <= 20) {
      return { mealsPerDay: meals, label: `${meals} meal${meals === 1 ? "" : "s"}/day`, source: keyHint, underThree: meals < 3 };
    }
  }

  // Numeric meal counts are accepted only when the field name itself clearly
  // describes meals/day/count/frequency. This prevents ambiguous codes from
  // being mistaken for meal counts.
  const numericKey = /(meal|meals).*(per|a|each).*day|meal.*(count|number|frequency)|number.*meals?|meals?_per_day|daily_meals?|food_frequency.*(day|meal|time)|frequency.*(food|meal).*(day|meal|time)/.test(key);
  if (numericKey && /^\d+(?:\.\d+)?$/.test(raw)) {
    const meals = Number(raw);
    if (Number.isFinite(meals) && meals >= 0 && meals <= 20) {
      return { mealsPerDay: meals, label: `${meals} meal${meals === 1 ? "" : "s"}/day`, source: keyHint, underThree: meals < 3 };
    }
  }

  // Yes/No fields specifically phrased as adequacy of 3 meals/day.
  const threeMealYesNo = /(three|3|at_?least_?3|3_?meals?|three_?meals?).*(meal|eat|eating)|(?:meal|eat|eating).*(three|3|at_?least_?3)/.test(key);
  if (threeMealYesNo && (yesValue(value) || noValue(value))) {
    const underThree = noValue(value);
    return { mealsPerDay: null, label: underThree ? "Less than 3 meals/day" : "3 or more meals/day", source: keyHint, underThree };
  }

  return null;
}

function walkExplicitFields(value: unknown, path: string, depth: number, out: MealFrequencyInfo[]) {
  if (depth > 4 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && i < 50; i++) walkExplicitFields(value[i], `${path}[${i}]`, depth + 1, out);
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeKey(key);
    if (EXCLUDED_KEYS.has(normalized)) {
      continue;
    }
    const candidate = parseExplicitMealValue(child, path ? `${path}.${key}` : key);
    if (candidate) out.push(candidate);
    if (child && typeof child === "object") walkExplicitFields(child, path ? `${path}.${key}` : key, depth + 1, out);
  }
}

export function getMealFrequency(household: any): MealFrequencyInfo {
  const candidates: [string, unknown][] = [];
  const direct = household && typeof household === "object" ? household : {};

  for (const [key, value] of Object.entries(direct)) {
    const normalized = normalizeKey(key);
    if (EXCLUDED_KEYS.has(normalized)) continue;
    if (/(meal|meals|eat|eating|food_frequency|food_adequacy|adequacy|sufficient_food|daily_food)/.test(normalized)) {
      candidates.push([key, value]);
    }
  }

  const matches: MealFrequencyInfo[] = [];
  for (const [key, value] of candidates) {
    const match = parseExplicitMealValue(value, key);
    if (match) matches.push(match);
  }

  const legacy = direct.legacy_raw;
  if (legacy && typeof legacy === "object") {
    walkExplicitFields(legacy, "legacy_raw", 0, matches);
  }

  // Prefer a concrete 1/2/3+ meals/day value over a broad yes/no field.
  const ranked = matches.sort((a, b) => {
    const concrete = (x: MealFrequencyInfo) => x.mealsPerDay === null ? 0 : 2;
    return concrete(b) - concrete(a);
  });
  return ranked[0] ?? { mealsPerDay: null, label: "Not stated", source: "", underThree: null };
}

export function isUnderThreeMeals(household: any) {
  const info = getMealFrequency(household);
  return info.underThree === true || (info.mealsPerDay !== null && info.mealsPerDay < 3);
}

export function mealFrequencyLabel(household: any) {
  return getMealFrequency(household).label;
}
