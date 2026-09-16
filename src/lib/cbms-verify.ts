// Independent verification: re-counts 4Ps / Food Stamp heads from raw data
// using straight loops, then compares against the rows array shown on screen
// (which is the same array passed to the export). Guarantees export == screen.

import { datasets } from "@/data/cbms";

const yes = (v: any) => v === "Yes" || v === 1 || v === "1" || v === true;
const isHead = (p: any) =>
  p.a02_relation_to_hh_head === "Head" || p.line_number === 1;
const hhKey = (p: any) => `${p.area_code}-${p.husn}-${p.hsn}`;
const personKey = (p: any) => {
  const direct = String(p?.uuid || p?.id || "");
  if (direct) return direct;

  const area = String(p?.area_code ?? "");
  const husn = String(p?.husn ?? "");
  const hsn = String(p?.hsn ?? "");
  const line = String(p?.line_number ?? "");
  if (line) return `${area}-${husn}-${hsn}-${line}`;

  return `${area}-${husn}-${hsn}|${p?._full_name ?? ""}|${p?.a05_age ?? ""}|${p?.a03_sex ?? ""}`;
};

export interface VerifyResult {
  scope: string;
  expected: Record<string, number>;
  onScreen: { rows: number; summary: { label: string; value: number | string }[] };
  matches: boolean;
  mismatches: string[];
}

function recount(brgy: string) {
  const persons = datasets.persons || [];
  const households = datasets.households || [];
  const hhIdx = new Map<string, any>();
  for (const h of households) hhIdx.set(`${h.area_code}-${h.husn}-${h.hsn}`, h);

  const headsByHH = new Map<string, any>();
  for (const p of persons) {
    if (!isHead(p)) continue;
    if (brgy && p.area_name !== brgy) continue;
    const k = hhKey(p);
    if (!headsByHH.has(k)) headsByHH.set(k, p);
  }

  let fourps = 0, nonFourps = 0, fs = 0, nonFs = 0;
  for (const [k, p] of headsByHH) {
    const hh = hhIdx.get(k) || {};
    const is4 = yes(hh.m05_a_4ps) || yes(hh.m06_a_benefit_4ps);
    const isF = yes(hh.m05_d_food_stamp) || yes(hh.m06_d_benefit_food_stamp);
    if (is4) fourps++; else nonFourps++;
    if (isF) fs++; else nonFs++;
  }
  return {
    totalHeads: headsByHH.size,
    fourps,
    nonFourps,
    foodStamp: fs,
    nonFoodStamp: nonFs,
  };
}

export function verifySector(
  tab: string,
  brgy: string,
  rows: any[],
  summary?: { label: string; value: number | string }[],
): VerifyResult {
  const r = recount(brgy);
  const scope = `tab=${tab}${brgy ? ` • barangay=${brgy}` : " • all barangays"}`;
  const mismatches: string[] = [];
  let expectedRows = 0;
  let expected: Record<string, number> = {};

  if (tab === "fourps") {
    expectedRows = r.fourps;
    expected = { rows: r.fourps, pantawid_heads: r.fourps, non_pantawid_heads: r.nonFourps, total_heads: r.totalHeads };
  } else if (tab === "not_fourps") {
    expectedRows = r.nonFourps;
    expected = { rows: r.nonFourps, pantawid_heads: r.fourps, non_pantawid_heads: r.nonFourps, total_heads: r.totalHeads };
  } else if (tab === "food_stamp") {
    expectedRows = r.foodStamp;
    expected = { rows: r.foodStamp, food_stamp_heads: r.foodStamp, non_food_stamp_heads: r.nonFoodStamp, total_heads: r.totalHeads };
  } else {
    // Generic (non household-head) sector tabs: verify structural integrity of the
    // exact array that is rendered on-screen and handed to the CSV/Excel/PDF export.
    const seenPerson = new Set<string>();
    let dupPersons = 0, outOfScope = 0;
    for (const p of rows) {
      const k = personKey(p);
      if (seenPerson.has(k)) dupPersons++;
      seenPerson.add(k);
      if (brgy && p.area_name !== brgy) outOfScope++;
    }
    if (dupPersons) mismatches.push(`${dupPersons} duplicate person record(s) in rows`);
    if (outOfScope) mismatches.push(`${outOfScope} row(s) outside the selected barangay`);
    const totalFromSummary = (summary || []).find((s) => String(s.label).toUpperCase().includes("TOTAL"));
    if (totalFromSummary && Number(totalFromSummary.value) !== rows.length) {
      mismatches.push(`Summary "${totalFromSummary.label}"=${totalFromSummary.value} ≠ rows ${rows.length}`);
    }
    return {
      scope,
      expected: { rows: rows.length, unique_records: seenPerson.size },
      onScreen: { rows: rows.length, summary: summary || [] },
      matches: mismatches.length === 0,
      mismatches,
    };
  }


  if (rows.length !== expectedRows) {
    mismatches.push(`Row count mismatch: on-screen=${rows.length} vs recomputed=${expectedRows}`);
  }

  // Verify the rows are heads and de-duplicated by household
  const seen = new Set<string>();
  let dupes = 0, nonHeads = 0;
  for (const p of rows) {
    if (!isHead(p)) nonHeads++;
    const k = hhKey(p);
    if (seen.has(k)) dupes++;
    seen.add(k);
  }
  if (nonHeads) mismatches.push(`${nonHeads} row(s) are not household heads`);
  if (dupes) mismatches.push(`${dupes} duplicate household key(s) in rows`);

  // Verify summary numbers align with recount
  if (summary) {
    for (const s of summary) {
      const label = s.label.toLowerCase();
      const v = Number(s.value);
      if (label.includes("non-pantawid") && v !== r.nonFourps)
        mismatches.push(`Summary "${s.label}"=${v} ≠ recount ${r.nonFourps}`);
      else if (label.includes("pantawid") && !label.includes("non") && v !== r.fourps)
        mismatches.push(`Summary "${s.label}"=${v} ≠ recount ${r.fourps}`);
      else if (label.includes("non-food stamp") && v !== r.nonFoodStamp)
        mismatches.push(`Summary "${s.label}"=${v} ≠ recount ${r.nonFoodStamp}`);
      else if (label.includes("food stamp") && !label.includes("non") && v !== r.foodStamp)
        mismatches.push(`Summary "${s.label}"=${v} ≠ recount ${r.foodStamp}`);
      else if (label.includes("total") && v !== r.totalHeads)
        mismatches.push(`Summary "${s.label}"=${v} ≠ recount ${r.totalHeads}`);
    }
  }

  return {
    scope,
    expected,
    onScreen: { rows: rows.length, summary: summary || [] },
    matches: mismatches.length === 0,
    mismatches,
  };
}

// ── Verification for "by barangay" grouped views ─────────────────────────────
// Confirms the per-barangay person lists on screen add up to the TOTAL row and
// the summary block, i.e. exactly what the CSV/Excel/PDF export will contain.
export function verifyGroups(
  label: string,
  groups: Map<string, any[]>,
  summaryTotal: number | null,
  overallTotal: number | null,
): VerifyResult {
  const mismatches: string[] = [];
  let rows = 0;
  const seen = new Set<string>();
  let dupes = 0;
  for (const [b, list] of groups) {
    rows += list.length;
    for (const r of list) {
      const direct = String(r?.uuid || r?.id || r?._person_key || "");
      const line = String(r?.line_number ?? "");
      const stable = direct || (line
        ? `${r?.area_code ?? b}-${r?.husn ?? ""}-${r?.hsn ?? ""}-${line}`
        : `${r?.area_code ?? b}-${r?.husn ?? ""}-${r?.hsn ?? ""}|${r?._full_name ?? ""}|${r?.a05_age ?? ""}|${r?.a03_sex ?? ""}`);
      const k = `${b}|${stable}`;
      if (seen.has(k)) dupes++;
      seen.add(k);
    }
  }
  if (overallTotal !== null && overallTotal !== rows)
    mismatches.push(`Summary TOTAL row=${overallTotal} ≠ listed persons ${rows}`);
  if (summaryTotal !== null && summaryTotal !== rows)
    mismatches.push(`Summary block total=${summaryTotal} ≠ listed persons ${rows}`);
  if (dupes) mismatches.push(`${dupes} possible duplicate person row(s)`);
  return {
    scope: `${label} • ${groups.size} barangay(s)`,
    expected: {
      listed_persons: rows,
      barangays: groups.size,
      ...(overallTotal !== null ? { summary_total_row: overallTotal } : {}),
    },
    onScreen: { rows, summary: [] },
    matches: mismatches.length === 0,
    mismatches,
  };
}
