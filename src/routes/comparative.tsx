import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import { BarChart3, CheckCircle2, Database, Download, FileCheck2, Home, MapPin, ShieldCheck, Users, WalletCards } from "lucide-react";
import {
  getActiveBarangay,
  getDataVersion,
  getHouseholdIncome,
  getSourceWatermark,
  getYearDataHealth,
  DATASET_LABELS,
  getYearDatasets,
  subscribeData,
} from "@/data/cbms";
import { exportDOCX, exportPDF, printPayload } from "@/lib/cbms-export";

export const Route = createFileRoute("/comparative")({ component: ComparativePage });

const n = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
const fmt = (v: number) => Math.round(v).toLocaleString();
const percent = (a: number, b: number) => b === 0 ? (a === 0 ? "0.0%" : "N/A") : `${((a - b) / b * 100).toFixed(1)}%`;
const yes = (v: any) => v === "Yes" || v === 1 || v === "1" || v === true;

function scoped(ds: any, barangay: string) {
  return {
    persons: ds.persons.filter((p: any) => !barangay || p.area_name === barangay),
    households: ds.households.filter((h: any) => !barangay || h.area_name === barangay),
  };
}

function incomeSummary(ds: any, barangay: string) {
  const { households } = scoped(ds, barangay);
  const reported = households.filter((h: any) => getHouseholdIncome(h) !== null);
  if (!reported.length) return { reportedHouseholds: 0, below15: null as number | null, below20: null as number | null };
  const below15 = reported.filter((h: any) => getHouseholdIncome(h)! < 15000).length;
  const below20 = reported.filter((h: any) => getHouseholdIncome(h)! < 20000).length;
  return { reportedHouseholds: reported.length, below15, below20 };
}

function countYes(rows: any[], key: string): number | null {
  const defined = rows.filter((r) => r?.[key] !== null && r?.[key] !== undefined && r?.[key] !== "");
  if (!defined.length) return null;
  return defined.filter((r) => yes(r[key])).length;
}

function countLabel(rows: any[], key: string, value: string): number | null {
  const defined = rows.filter((r) => r?.[key] !== null && r?.[key] !== undefined && r?.[key] !== "");
  if (!defined.length) return null;
  return defined.filter((r) => String(r[key]).toLowerCase() === value.toLowerCase()).length;
}

function metricStats(ds: any, barangay: string) {
  const { persons: p, households: h } = scoped(ds, barangay);
  const income = h.filter((x: any) => getHouseholdIncome(x) !== null);
  const employed = countLabel(p, "e01_employment_status", "Employed");
  const unemployed = countLabel(p, "e01_employment_status", "Unemployed");
  const laborDefined = p.filter((x: any) => x.e01_labor_force_participation !== null && x.e01_labor_force_participation !== undefined && x.e01_labor_force_participation !== "");
  const lf = laborDefined.length ? laborDefined.filter((x: any) => String(x.e01_labor_force_participation).toLowerCase() === "in the labor force").length : null;
  const under = countLabel(p, "e01_underemployment_status", "Underemployed");
  const age = (lo: number, hi: number) => { const defined = p.filter((x: any) => Number.isFinite(Number(x.a05_age))); return defined.length ? defined.filter((x: any) => n(x.a05_age) >= lo && n(x.a05_age) <= hi).length : null; };
  const fourPsDefined = h.filter((x: any) => x.m05_a_4ps !== null && x.m05_a_4ps !== undefined && x.m05_a_4ps !== "" || x.m06_a_benefit_4ps !== null && x.m06_a_benefit_4ps !== undefined && x.m06_a_benefit_4ps !== "");
  const fourPs = fourPsDefined.length ? fourPsDefined.filter((x: any) => yes(x.m05_a_4ps) || yes(x.m06_a_benefit_4ps)).length : null;
  const socpen = (() => { const defined = h.filter((x: any) => x.m05_b_socpen !== null && x.m05_b_socpen !== undefined && x.m05_b_socpen !== "" || x.m06_b_benefit_socpen !== null && x.m06_b_benefit_socpen !== undefined && x.m06_b_benefit_socpen !== ""); return defined.length ? defined.filter((x: any) => yes(x.m05_b_socpen) || yes(x.m06_b_benefit_socpen)).length : null; })();
  const reportedSchool = countYes(p, "d01_currently_attending_school");
  return {
    population: p.length, households: h.length,
    male: countLabel(p, "a03_sex", "Male"), female: countLabel(p, "a03_sex", "Female"),
    children: age(0, 14), youth: age(15, 24), workingAge: age(15, 59), seniors: age(60, 200),
    pwd: countYes(p, "b10_pwd"),
    soloParent: countYes(p, "b05_solo_parent") ?? countYes(p, "b06_solo_parent_id"),
    pregnant: countYes(p, "b08_currently_pregnant"), lactating: countYes(p, "b09_lactating_mother"),
    employed, unemployed, laborForce: lf ?? (employed !== null && unemployed !== null ? employed + unemployed : null), underemployed: under,
    farmers: countYes(p, "e17_farmer"), fisherfolk: countYes(p, "e18_fisherfolk"),
    attendingSchool: reportedSchool, literate: countYes(p, "a10_simple_literacy"), tvet: (() => { const a = countYes(p, "d07_tvet_graduate"); const b = countYes(p, "d08_tvet_currently_attending"); return a === null && b === null ? null : (a || 0) + (b || 0); })(),
    fourPs, socpen, philhealth: countYes(h, "m01_c_philhealth"), bankAccount: (() => { const vals = h.filter((x: any) => ["i01_a_bank_account","i01_b_digital_bank_account","i01_c_emoney_or_cash_card"].some(k => x[k] !== null && x[k] !== undefined && x[k] !== "")); return vals.length ? vals.filter((x: any) => [x.i01_a_bank_account,x.i01_b_digital_bank_account,x.i01_c_emoney_or_cash_card].some(yes)).length : null; })(),
    internet: countYes(h, "k01_internet_access"), electricity: countYes(h, "o11_electricity"),
    overcrowded: (() => { const vals = h.filter((x: any) => x.overcrowding_status !== null && x.overcrowding_status !== undefined && x.overcrowding_status !== ""); return vals.length ? vals.filter((x: any) => String(x.overcrowding_status).toLowerCase() === "overcrowded").length : null; })(),
    foodConcern: (() => { const vals = h.filter((x: any) => [x.g01_worried,x.g02_not_eaten_healthy,x.g03_ate_few_food,x.g04_skipped_meal,x.g05_ate_less,x.g06_ran_out_of_food,x.g07_hungry,x.g08_not_eaten_whole_day].some(v => v !== null && v !== undefined && v !== "")); return vals.length ? vals.filter((x: any) => [x.g01_worried,x.g02_not_eaten_healthy,x.g03_ate_few_food,x.g04_skipped_meal,x.g05_ate_less,x.g06_ran_out_of_food,x.g07_hungry,x.g08_not_eaten_whole_day].some(yes)).length : null; })(),
    low15: income.length ? income.filter((x: any) => getHouseholdIncome(x)! < 15000).length : null,
    low20: income.length ? income.filter((x: any) => getHouseholdIncome(x)! < 20000).length : null,
    incomeReported: income.length,
  };
}

type Indicator = { key: string; label: string; group: string; description: string; value: (s: ReturnType<typeof metricStats>) => number | null };

const INDICATORS: Indicator[] = [
  { key: "population", label: "Population", group: "Population", description: "All person records", value: s => s.population },
  { key: "households", label: "Households", group: "Population", description: "Household records", value: s => s.households },
  { key: "male", label: "Male", group: "Population", description: "Male persons", value: s => s.male },
  { key: "female", label: "Female", group: "Population", description: "Female persons", value: s => s.female },
  { key: "children", label: "Children 0–14", group: "Age & vulnerability", description: "Children and young adolescents", value: s => s.children },
  { key: "youth", label: "Youth 15–24", group: "Age & vulnerability", description: "Youth population", value: s => s.youth },
  { key: "workingAge", label: "Working age 15–59", group: "Age & vulnerability", description: "Working-age population", value: s => s.workingAge },
  { key: "seniors", label: "Senior citizens 60+", group: "Age & vulnerability", description: "Older persons", value: s => s.seniors },
  { key: "pwd", label: "Persons with disability", group: "Age & vulnerability", description: "Persons flagged as PWD", value: s => s.pwd },
  { key: "soloParent", label: "Solo parents", group: "Age & vulnerability", description: "Solo parent indicators", value: s => s.soloParent },
  { key: "pregnant", label: "Pregnant persons", group: "Age & vulnerability", description: "Currently pregnant", value: s => s.pregnant },
  { key: "lactating", label: "Lactating mothers", group: "Age & vulnerability", description: "Currently lactating", value: s => s.lactating },
  { key: "employed", label: "Employed", group: "Work & livelihood", description: "Employment status", value: s => s.employed },
  { key: "unemployed", label: "Unemployed", group: "Work & livelihood", description: "Unemployment status", value: s => s.unemployed },
  { key: "laborForce", label: "Labor force", group: "Work & livelihood", description: "Persons in the labor force", value: s => s.laborForce },
  { key: "underemployed", label: "Underemployed", group: "Work & livelihood", description: "Underemployment indicator", value: s => s.underemployed },
  { key: "farmers", label: "Farmers", group: "Work & livelihood", description: "Farmer indicator", value: s => s.farmers },
  { key: "fisherfolk", label: "Fisherfolk", group: "Work & livelihood", description: "Fisherfolk indicator", value: s => s.fisherfolk },
  { key: "attendingSchool", label: "Currently attending school", group: "Education", description: "Current school attendance", value: s => s.attendingSchool },
  { key: "literate", label: "Simple literacy", group: "Education", description: "Simple literacy indicator", value: s => s.literate },
  { key: "tvet", label: "TVET graduate / attending", group: "Education", description: "TVET-related person records", value: s => s.tvet },
  { key: "fourPs", label: "4Ps households", group: "Social protection", description: "4Ps enrollment or benefit", value: s => s.fourPs },
  { key: "socpen", label: "Social pension households", group: "Social protection", description: "Social pension enrollment/benefit", value: s => s.socpen },
  { key: "philhealth", label: "PhilHealth persons", group: "Social protection", description: "PhilHealth indicator", value: s => s.philhealth },
  { key: "bankAccount", label: "Financial account households", group: "Household conditions", description: "Bank, digital or e-money account", value: s => s.bankAccount },
  { key: "internet", label: "Households with internet", group: "Household conditions", description: "Internet access", value: s => s.internet },
  { key: "electricity", label: "Households with electricity", group: "Household conditions", description: "Electricity availability", value: s => s.electricity },
  { key: "overcrowded", label: "Overcrowded households", group: "Household conditions", description: "Overcrowding status", value: s => s.overcrowded },
  { key: "foodConcern", label: "Food insecurity concern", group: "Household conditions", description: "At least one food-insecurity response", value: s => s.foodConcern },
  { key: "low15", label: "Household income < ₱15,000", group: "Income", description: "Reported H06 family income below ₱15,000", value: s => s.low15 },
  { key: "low20", label: "Household income < ₱20,000", group: "Income", description: "Reported H06 family income below ₱20,000", value: s => s.low20 },
  { key: "incomeReported", label: "Households with income reported", group: "Income", description: "Households with a numeric H06 income", value: s => s.incomeReported },
];

function Delta({ oldValue, newValue }: { oldValue: number | null; newValue: number | null }) {
  if (oldValue === null || newValue === null) return <span className="font-semibold text-muted-foreground">N/A — field not comparable</span>;
  const d = newValue - oldValue; const sign = d > 0 ? "+" : "";
  return <span className={`font-bold ${d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground"}`}>{sign}{fmt(d)} ({percent(newValue, oldValue)})</span>;
}

function CompareRow({ item, a, b }: { item: Indicator; a: number | null; b: number | null }) {
  const max = Math.max(1, a ?? 0, b ?? 0);
  return <div className="rounded-xl border border-border/70 bg-background/40 p-3">
    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold">{item.label}</div><div className="text-[10px] text-muted-foreground">{item.description}</div></div><Delta oldValue={a} newValue={b} /></div>
    <div className="mt-3 grid grid-cols-[42px_1fr_64px] items-center gap-2 text-[11px]"><span className="font-bold text-muted-foreground">2022</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(a ?? 0) / max * 100}%` }} /></div><span className="text-right font-bold">{a === null ? "N/A" : fmt(a)}</span></div>
    <div className="mt-1.5 grid grid-cols-[42px_1fr_64px] items-center gap-2 text-[11px]"><span className="font-bold text-muted-foreground">2024</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${(b ?? 0) / max * 100}%` }} /></div><span className="text-right font-bold">{b === null ? "N/A" : fmt(b)}</span></div>
  </div>;
}

function AgePyramid({ ds, barangay, year }: { ds: any; barangay: string; year: number }) {
  const rows = useMemo(() => {
    const out: any[] = [];
    for (let start = 80; start >= 0; start -= 5) {
      const end = start === 80 ? 200 : start + 4;
      const people = ds.persons.filter((p: any) => { const age = Number(p.a05_age); return (!barangay || p.area_name === barangay) && Number.isFinite(age) && age >= start && age <= end; });
      out.push({ label: start === 80 ? "80+" : `${start}–${end}`, male: people.filter((p: any) => p.a03_sex === "Male").length, female: people.filter((p: any) => p.a03_sex === "Female").length });
    }
    return out;
  }, [ds.persons, barangay]);
  const max = Math.max(1, ...rows.flatMap(r => [r.male, r.female]));
  return <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h3 className="font-display font-bold">CBMS {year} age & sex pyramid</h3><p className="text-[11px] text-muted-foreground">Male left · Female right</p></div><Users className="h-4 w-4 text-primary" /></div><div className="mt-4 space-y-1">{rows.map(r => <div key={r.label} className="grid grid-cols-[1fr_44px_1fr] items-center gap-1"><div className="flex justify-end"><div className="h-3 rounded-l bg-primary/75" style={{ width: `${r.male / max * 100}%` }} /></div><span className="text-center text-[9px] text-muted-foreground">{r.label}</span><div><div className="h-3 rounded-r bg-success/75" style={{ width: `${r.female / max * 100}%` }} /></div></div>)}</div></div>;
}

function BarangayHeatmap({ ds23, ds24 }: { ds23: any; ds24: any }) {
  const rows = useMemo(() => {
    const count = (ds: any) => { const m = new Map<string, number>(); for (const p of ds.persons) m.set(p.area_name || "Not Stated", (m.get(p.area_name || "Not Stated") || 0) + 1); return m; };
    const a = count(ds23), b = count(ds24);
    return Array.from(new Set([...a.keys(), ...b.keys()])).map((barangay) => ({ barangay, a: a.get(barangay) || 0, b: b.get(barangay) || 0, d: (b.get(barangay) || 0) - (a.get(barangay) || 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  }, [ds23.persons, ds24.persons]);
  const max = Math.max(1, ...rows.map(r => Math.max(r.a, r.b)));
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /><div><h2 className="font-display text-lg font-bold">Barangay change map</h2><p className="text-xs text-muted-foreground">Sorted by the largest population change so planners can spot areas needing attention.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{rows.map(r => <div key={r.barangay} className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between text-sm"><span className="font-bold">{r.barangay}</span><span className={r.d > 0 ? "font-bold text-success" : r.d < 0 ? "font-bold text-destructive" : "text-muted-foreground"}>{r.d > 0 ? "+" : ""}{fmt(r.d)}</span></div><div className="mt-2 grid grid-cols-[42px_1fr_54px] items-center gap-2 text-[10px]"><span>2022</span><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${r.a / max * 100}%` }} /></div><span className="text-right">{fmt(r.a)}</span></div><div className="mt-1 grid grid-cols-[42px_1fr_54px] items-center gap-2 text-[10px]"><span>2024</span><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${r.b / max * 100}%` }} /></div><span className="text-right">{fmt(r.b)}</span></div></div>)}</div></section>;
}

function ComparativePage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const barangay = getActiveBarangay();
  const ds23 = getYearDatasets(2022);
  const ds24 = getYearDatasets(2024);
  const a = useMemo(() => metricStats(ds23, barangay), [ds23.persons.length, ds23.households.length, barangay]);
  const b = useMemo(() => metricStats(ds24, barangay), [ds24.persons.length, ds24.households.length, barangay]);
  const income23 = useMemo(() => incomeSummary(ds23, barangay), [ds23.households.length, barangay]);
  const income24 = useMemo(() => incomeSummary(ds24, barangay), [ds24.households.length, barangay]);
  const grouped = useMemo(() => Array.from(new Set(INDICATORS.map(i => i.group))), []);
  const rows = INDICATORS.map(item => { const oldValue = item.value(a); const newValue = item.value(b); return { indicator: item.label, y2022: oldValue, y2024: newValue, difference: oldValue === null || newValue === null ? null : newValue - oldValue }; });
  const payload = { title: "CBMS 2022–2024 Comparative Analysis", subtitle: barangay ? `Barangay: ${barangay}` : "Municipality-wide", columns: [{ key: "indicator", label: "Indicator" }, { key: "y2022", label: "2022" }, { key: "y2024", label: "2024" }, { key: "difference", label: "Difference" }], rows, note: getSourceWatermark("comparison") };
  const health23 = getYearDataHealth(2022);
  const health24 = getYearDataHealth(2024);
  const yearCoverage = [
    { year: 2022 as const, health: health23, tone: "primary" },
    { year: 2024 as const, health: health24, tone: "success" },
  ];
  const headline = [
    { label: "Population", a: a.population, b: b.population, icon: Users },
    { label: "Households", a: a.households, b: b.households, icon: Home },
    { label: "HH income < ₱20k", a: a.low20, b: b.low20, icon: WalletCards },
    { label: "PWD", a: a.pwd, b: b.pwd, icon: ShieldCheck },
  ];

  return <div className="space-y-7">
    <header className="overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary"><BarChart3 className="h-4 w-4" /> Decision dashboard</div><h1 className="mt-2 font-display text-3xl font-black">2022 vs 2024 Comparative Analysis</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">A municipality planning view that compares every common indicator we can safely normalize across both CBMS structures. Differences are shown numerically and visually; fields that do not exist in a year are not invented.</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">{barangay || "All Barangays"}</span><span className="rounded-full bg-muted px-3 py-1.5">{getSourceWatermark("comparison")}</span></div></div><div className="flex flex-wrap gap-2"><button onClick={() => exportPDF(payload)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> PDF</button><button onClick={() => exportDOCX(payload)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-bold"><Download className="h-4 w-4" /> Word</button><button onClick={() => printPayload(payload)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-bold">Print</button></div></div></header>

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-display text-lg font-bold">Both CBMS datasets are available here</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">This workspace is the single place for cross-year review. It brings the complete normalized dataset coverage for 2022 and 2024 into one view instead of making you switch between year workspaces.</p></div>
        <Database className="h-5 w-5 shrink-0 text-primary" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {yearCoverage.map(({ year, health }) => (
          <div key={year} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CBMS</div><div className="text-2xl font-black">{year}</div></div><div className="rounded-xl bg-background p-2"><FileCheck2 className="h-5 w-5 text-primary" /></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <CoverageStat label="Persons" value={health.persons} />
              <CoverageStat label="Households" value={health.households} />
              <CoverageStat label="Barangays" value={health.barangays} />
              <CoverageStat label="Files" value={health.files} />
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {health.totalRecords.toLocaleString()} normalized records available</div>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[620px] text-xs">
          <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Dataset</th><th className="px-3 py-2 text-right">2022</th><th className="px-3 py-2 text-right">2024</th></tr></thead>
          <tbody>
            {(Object.keys(DATASET_LABELS) as (keyof typeof DATASET_LABELS)[]).map((key) => {
              const left = getYearDatasets(2022)[key].length;
              const right = getYearDatasets(2024)[key].length;
              return <tr key={key} className="border-t border-border/60"><td className="px-3 py-2 font-medium">{DATASET_LABELS[key]}</td><td className="px-3 py-2 text-right">{left.toLocaleString()}</td><td className="px-3 py-2 text-right">{right.toLocaleString()}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{headline.map(({ label, a, b, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-3 text-3xl font-black">{b === null ? "N/A" : fmt(b)}</div><div className="mt-1 text-xs text-muted-foreground">2022: {a === null ? "N/A" : fmt(a)} · 2024: {b === null ? "N/A" : fmt(b)}</div><div className="mt-2 text-xs"><Delta oldValue={a} newValue={b} /></div></div>)}</section>

    <section className="grid gap-5 lg:grid-cols-3">
      <MetricBarChart title="Population composition" items={[
        { label: "Children 0–14", a: a.children, b: b.children },
        { label: "Youth 15–24", a: a.youth, b: b.youth },
        { label: "Working age 15–59", a: a.workingAge, b: b.workingAge },
        { label: "Seniors 60+", a: a.seniors, b: b.seniors },
      ]} />
      <MetricBarChart title="Work & livelihood" items={[
        { label: "Employed", a: a.employed, b: b.employed },
        { label: "Unemployed", a: a.unemployed, b: b.unemployed },
        { label: "Farmers", a: a.farmers, b: b.farmers },
        { label: "Fisherfolk", a: a.fisherfolk, b: b.fisherfolk },
      ]} />
      <MetricBarChart title="Protection & access" items={[
        { label: "PWD", a: a.pwd, b: b.pwd },
        { label: "Solo parents", a: a.soloParent, b: b.soloParent },
        { label: "4Ps", a: a.fourPs, b: b.fourPs },
        { label: "Social pension", a: a.socpen, b: b.socpen },
      ]} />
    </section>
    <ChangeRanking rows={rows.filter((r) => r.difference !== null)} />

    <section className="grid gap-5 lg:grid-cols-2">{grouped.map(group => <div key={group} className="rounded-2xl border border-border bg-card p-5"><div className="mb-4"><h2 className="font-display text-lg font-bold">{group}</h2><p className="text-[11px] text-muted-foreground">2022 and 2024 shown on the same scale for quick reading.</p></div><div className="space-y-3">{INDICATORS.filter(i => i.group === group).map(item => <CompareRow key={item.key} item={item} a={item.value(a)} b={item.value(b)} />)}</div></div>)}</section>

    <section className="grid gap-5 lg:grid-cols-2"><AgePyramid ds={ds23} barangay={barangay} year={2022} /><AgePyramid ds={ds24} barangay={barangay} year={2024} /></section>
    <BarangayHeatmap ds23={ds23} ds24={ds24} />

    <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" /><div><h2 className="font-display text-lg font-bold">Income shift</h2><p className="text-xs text-muted-foreground">Household-reported H06 Total Family Income. This is not individual salary.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><IncomeCompare label="Households below ₱15,000" a={income23.below15} b={income24.below15} totalA={income23.reportedHouseholds} totalB={income24.reportedHouseholds} /><IncomeCompare label="Households below ₱20,000" a={income23.below20} b={income24.below20} totalA={income23.reportedHouseholds} totalB={income24.reportedHouseholds} /></div></section>

    <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display text-lg font-bold">Complete machine-readable comparison</h2><div className="mt-4 overflow-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50 text-left text-xs"><tr><th className="px-3 py-2">Indicator</th><th className="px-3 py-2">2022</th><th className="px-3 py-2">2024</th><th className="px-3 py-2">Change</th></tr></thead><tbody>{rows.map(r => <tr key={r.indicator} className="border-t border-border/60"><td className="px-3 py-2 font-semibold">{r.indicator}</td><td className="px-3 py-2">{r.y2022 === null ? "N/A" : fmt(r.y2022)}</td><td className="px-3 py-2">{r.y2024 === null ? "N/A" : fmt(r.y2024)}</td><td className="px-3 py-2"><Delta oldValue={r.y2022} newValue={r.y2024} /></td></tr>)}</tbody></table></div></section>
    <footer className="flex flex-col gap-1 border-t border-border pt-4 text-center text-[11px] text-muted-foreground"><span className="font-semibold">{getSourceWatermark("comparison")}</span><span>Comparative figures are based only on fields that can be responsibly normalized between the two CBMS structures.</span></footer>
  </div>;
}

function MetricBarChart({ title, items }: { title: string; items: { label: string; a: number | null; b: number | null }[] }) {
  const max = Math.max(1, ...items.flatMap((x) => [x.a ?? 0, x.b ?? 0]));
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h3 className="font-display font-bold">{title}</h3><p className="text-[10px] text-muted-foreground">Grouped bars · 2022 vs 2024</p></div><BarChart3 className="h-4 w-4 text-primary" /></div><div className="mt-4 space-y-4">{items.map((item) => <div key={item.label}><div className="mb-1 flex items-center justify-between text-[10px]"><span className="font-semibold">{item.label}</span><span className="text-muted-foreground">{item.a === null ? "N/A" : fmt(item.a)} → {item.b === null ? "N/A" : fmt(item.b)}</span></div><div className="grid gap-1"><div className="flex items-center gap-2"><span className="w-7 text-[9px]">22</span><div className="h-2.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/75" style={{ width: `${((item.a ?? 0) / max) * 100}%` }} /></div></div><div className="flex items-center gap-2"><span className="w-7 text-[9px]">24</span><div className="h-2.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-success/75" style={{ width: `${((item.b ?? 0) / max) * 100}%` }} /></div></div></div></div>)}</div></section>;
}

function ChangeRanking({ rows }: { rows: { indicator: string; y2022: number | null; y2024: number | null; difference: number | null }[] }) {
  const ranked = [...rows].sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0)).slice(0, 10);
  const max = Math.max(1, ...ranked.map((r) => Math.abs(r.difference ?? 0)));
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Largest changes at a glance</h2><p className="text-xs text-muted-foreground">Diverging bars rank the indicators with the biggest absolute change.</p></div><BarChart3 className="h-5 w-5 text-primary" /></div><div className="mt-5 space-y-3">{ranked.map((r) => { const d=r.difference ?? 0; return <div key={r.indicator} className="grid grid-cols-[1fr_64px] items-center gap-3"><div><div className="text-xs font-semibold">{r.indicator}</div><div className="mt-1 h-2 rounded-full bg-muted"><div className={`h-full rounded-full ${d >= 0 ? "bg-success" : "bg-destructive"}`} style={{ width: `${Math.min(100, Math.abs(d) / max * 100)}%` }} /></div></div><div className={`text-right text-xs font-black ${d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground"}`}>{d > 0 ? "+" : ""}{fmt(d)}</div></div>; })}</div></section>;
}

function CoverageStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-background p-2.5"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 font-bold">{value.toLocaleString()}</div></div>;
}

function IncomeCompare({ label, a, b, totalA, totalB }: { label: string; a: number | null; b: number | null; totalA: number; totalB: number }) {
  const max = Math.max(1, a ?? 0, b ?? 0);
  const line = (year: string, value: number | null, total: number, tone: string) => <div className="mt-2 grid grid-cols-[42px_1fr_88px] items-center gap-2 text-[11px]"><span>{year}</span><div className="h-4 rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${(value ?? 0) / max * 100}%` }} /></div><span className="text-right font-bold">{value === null ? "N/A" : `${fmt(value)} (${total ? (value / total * 100).toFixed(1) : "N/A"}%)`}</span></div>;
  return <div className="rounded-2xl border border-border/70 p-4"><div className="flex justify-between text-sm font-bold"><span>{label}</span><Delta oldValue={a} newValue={b} /></div>{line("2022", a, totalA, "bg-primary/75")}{line("2024", b, totalB, "bg-success/75")}{a === null || b === null ? <p className="mt-3 text-[10px] text-muted-foreground">Income comparison is unavailable for a year with no reported H06 income field.</p> : null}</div>;
}