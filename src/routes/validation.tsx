import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { municipality, getDataVersion, getYearDatasets, subscribeData, type DataYear } from "@/data/cbms";
import { Button } from "@/components/ui/button";
import {
  RULES, type RuleId, getRuleChoice, setRuleChoice, resetRuleChoices,
  subscribeRuleChanges, listSector,
} from "@/lib/cbms-recognition";
import { CheckCircle2, AlertTriangle, Info, RotateCcw, FileText, FileType2, Printer } from "lucide-react";
import { exportDOCX, exportPDF, printPayload, type GroupedExportPayload } from "@/lib/cbms-export";

export const Route = createFileRoute("/validation")({
  component: ValidationPage,
});

// Fields we expect on each record type (samples — extendable)
const PERSON_FIELDS = [
  "a01_first_name", "a01_last_name", "a03_sex", "a05_age", "a07_marital_status",
  "area_name", "husn", "b10_pwd", "b07_senior_citizen_id", "b05_solo_parent",
  "e01_employment_status",
];
const HH_FIELDS = [
  "area_name", "husn", "hh_size", "m05_a_4ps", "m05_d_food_stamp", "m05_b_socpen",
  "n02_drinking_water", "n08_toilet_facility", "o11_electricity",
];

interface FieldStat { field: string; total: number; missing: number; types: string[]; sampleValues: string[]; }

function audit(rows: any[], fields: string[]): FieldStat[] {
  return fields.map((f) => {
    let missing = 0;
    const types = new Set<string>();
    const samples = new Set<string>();
    for (const r of rows) {
      const v = r[f];
      if (v === null || v === undefined || v === "") { missing++; continue; }
      types.add(typeof v);
      if (samples.size < 4) samples.add(String(v).slice(0, 24));
    }
    return { field: f, total: rows.length, missing, types: [...types], sampleValues: [...samples] };
  });
}

function ValidationPage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const [year, setYear] = useState<DataYear>(2022);
  const yearDs = getYearDatasets(year);
  // re-render when rule overrides change
  useSyncExternalStore(
    (cb) => subscribeRuleChanges(cb),
    () => RULES.map((r) => getRuleChoice(r.id)).join("|"),
    () => "ssr",
  );
  const [tab, setTab] = useState<"rules" | "fields" | "joins">("rules");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Data Validation & Mapping</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect dataset health, see how many records are missing key fields, and confirm
          how your municipality wants to recognise PWDs, 4Ps, and food-stamp members. Choices
          here apply across the entire app (Sectors, Cross-tab, Search).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1">
            {[2022, 2024].map((y) => (
              <button key={y} onClick={() => setYear(y as DataYear)} className={`rounded-lg px-3 py-2 text-xs font-bold ${year === y ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>CBMS {y}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => exportValidationReport(year, "PDF")}><FileText className="h-4 w-4" /> Download Full Report</Button>
            <Button size="sm" variant="outline" onClick={() => exportValidationReport(year, "DOCX")}><FileType2 className="h-4 w-4" /> Word</Button>
            <Button size="sm" variant="outline" onClick={() => exportValidationReport(year, "PRINT")}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Validating CBMS {year}: {yearDs.persons.length.toLocaleString()} persons · {yearDs.households.length.toLocaleString()} households · {yearDs.barangays.length.toLocaleString()} barangay records.
          
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 w-fit">
        {(["rules", "fields", "joins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "rules" ? "Recognition Rules" : t === "fields" ? "Field Coverage" : "Joins & Integrity"}
          </button>
        ))}
      </div>

      {tab === "rules" && <RulesPanel />}
      {tab === "fields" && <FieldsPanel year={year} />}
      {tab === "joins" && <JoinsPanel year={year} />}
    </div>
  );
}

function RulesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => resetRuleChoices()}>
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {RULES.map((r) => {
          const current = getRuleChoice(r.id);
          const count = listSector(r.id).length;
          return (
            <article key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold">{r.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Source: {r.level === "person" ? "Person record" : "Joined from Household record"} ·
                    {" "}<span className="font-mono">{r.fields.join(", ")}</span>
                  </p>
                </div>
                <div className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary whitespace-nowrap">
                  {count.toLocaleString()} match
                </div>
              </header>
              <div className="mt-3 space-y-2">
                {r.options.map((o) => (
                  <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${
                    current === o.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}>
                    <input
                      type="radio"
                      name={r.id}
                      checked={current === o.id}
                      onChange={() => setRuleChoice(r.id as RuleId, o.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium">{o.label}</div>
                      {o.description && <div className="mt-0.5 text-xs text-muted-foreground">{o.description}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function FieldsPanel({ year }: { year: DataYear }) {
  const ds = getYearDatasets(year);
  const personStats = useMemo(() => audit(ds.persons, PERSON_FIELDS), [ds.persons.length, year]);
  const hhStats = useMemo(() => audit(ds.households, HH_FIELDS), [ds.households.length, year]);
  return (
    <div className="space-y-6">
      <FieldsTable title={`CBMS ${year} — Person record field coverage`} stats={personStats} />
      <FieldsTable title={`CBMS ${year} — Household record field coverage`} stats={hhStats} />
    </div>
  );
}

function FieldsTable({ title, stats }: { title: string; stats: FieldStat[] }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="border-b border-border p-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </header>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Field</th>
              <th className="px-3 py-2 text-right font-semibold">Present</th>
              <th className="px-3 py-2 text-right font-semibold">Missing</th>
              <th className="px-3 py-2 text-left font-semibold">Type(s)</th>
              <th className="px-3 py-2 text-left font-semibold">Sample values</th>
              <th className="px-3 py-2 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const pct = s.total ? (s.missing / s.total) * 100 : 0;
              const ok = pct === 0;
              const warn = pct > 0 && pct < 30;
              const bad = pct >= 30;
              return (
                <tr key={s.field} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{s.field}</td>
                  <td className="px-3 py-2 text-right">{(s.total - s.missing).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {s.missing.toLocaleString()} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{s.types.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.sampleValues.join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {ok && <CheckCircle2 className="mx-auto h-4 w-4 text-success" />}
                    {warn && <AlertTriangle className="mx-auto h-4 w-4 text-warning" />}
                    {bad && <AlertTriangle className="mx-auto h-4 w-4 text-destructive" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function JoinsPanel({ year }: { year: DataYear }) {
  const ds = getYearDatasets(year);
  const stats = useMemo(() => {
    const hhKeys = new Set(ds.households.map((h) => `${h.area_code}-${h.husn}-${h.hsn}`));
    let orphans = 0;
    for (const p of ds.persons) {
      if (!hhKeys.has(`${p.area_code}-${p.husn}-${p.hsn}`)) orphans++;
    }
    return { orphans, totalPersons: ds.persons.length, totalHH: ds.households.length };
  }, [ds.households.length, ds.persons.length, year]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Stat icon={<Info className="h-4 w-4 text-info" />} label={`CBMS ${year} persons`} value={stats.totalPersons} />
      <Stat icon={<Info className="h-4 w-4 text-info" />} label={`CBMS ${year} households`} value={stats.totalHH} />
      <Stat icon={stats.orphans === 0 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />} label="Persons without matching household" value={stats.orphans} tone={stats.orphans === 0 ? "success" : "destructive"} />
      <div className="lg:col-span-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Persons join to households on <span className="font-mono">area_code + husn + hsn</span>. Household-level rules (4Ps, food stamp, SocPen) require this join. This integrity check is explicitly scoped to CBMS {year}.
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "success" | "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

const PERSON_AUDIT = ["a01_first_name", "a01_last_name", "a03_sex", "a05_age", "a07_marital_status", "area_name", "husn", "b10_pwd", "b07_senior_citizen_id", "b05_solo_parent", "e01_employment_status"];
const HH_AUDIT = ["area_name", "husn", "hh_size", "m05_a_4ps", "m05_d_food_stamp", "m05_b_socpen", "n02_drinking_water", "n08_toilet_facility", "o11_electricity"];

function validationPayload(year: DataYear): GroupedExportPayload {
  const selected = getYearDatasets(year);
  const rulesRows = RULES.map((r) => {
    const choice = getRuleChoice(r.id);
    const opt = r.options.find((o) => o.id === choice) || r.options[0];
    return { section: "Recognition Rules", field: r.title, present: listSector(r.id).length, missing: "—", percent: "—", status: opt.label };
  });
  const personRows = PERSON_AUDIT.map((f) => {
    const s = statRow(selected.persons, f);
    return { section: "Person Field Coverage", field: s[0], present: Number(s[1].replace(/,/g, "")) || 0, missing: Number(s[2].replace(/,/g, "")) || 0, percent: s[3], status: s[4] };
  });
  const hhRows = HH_AUDIT.map((f) => {
    const s = statRow(selected.households, f);
    return { section: "Household Field Coverage", field: s[0], present: Number(s[1].replace(/,/g, "")) || 0, missing: Number(s[2].replace(/,/g, "")) || 0, percent: s[3], status: s[4] };
  });
  const hhKeys = new Set(selected.households.map((h) => `${h.area_code}-${h.husn}-${h.hsn}`));
  let orphans = 0;
  for (const p of selected.persons) if (!hhKeys.has(`${p.area_code}-${p.husn}-${p.hsn}`)) orphans++;
  const integrityRows = [
    { section: "Joins & Integrity", field: "Total persons", present: selected.persons.length, missing: 0, percent: "—", status: "Loaded" },
    { section: "Joins & Integrity", field: "Total households", present: selected.households.length, missing: 0, percent: "—", status: "Loaded" },
    { section: "Joins & Integrity", field: "Persons without matching household (orphans)", present: orphans, missing: 0, percent: "—", status: orphans === 0 ? "OK" : "Review" },
    { section: "Joins & Integrity", field: "Join key", present: "—", missing: "—", percent: "—", status: "area_code + husn + hsn" },
  ];
  return {
    title: `CBMS ${year} Data Validation & Mapping Report`,
    subtitle: `${municipality} · Recognition Rules, Field Coverage, and Joins & Integrity`,
    columns: [
      { key: "field", label: "Field / Metric" },
      { key: "present", label: "Present / Count" },
      { key: "missing", label: "Missing" },
      { key: "percent", label: "% Missing" },
      { key: "status", label: "Status / Rule" },
    ],
    rows: [...rulesRows, ...personRows, ...hhRows, ...integrityRows],
    groups: [
      { title: "Recognition Rules Applied", rows: rulesRows },
      { title: "Person Record — Field Coverage", rows: personRows },
      { title: "Household Record — Field Coverage", rows: hhRows },
      { title: "Joins & Integrity", rows: integrityRows },
    ],
    summary: [
      { label: "Persons", value: selected.persons.length },
      { label: "Households", value: selected.households.length },
      { label: "Barangay records", value: selected.barangays.length },
      { label: "Orphaned persons", value: orphans, percentage: selected.persons.length ? (orphans / selected.persons.length) * 100 : 0 },
    ],
    note: `CBMS ${year} validation dataset · ${municipality}`,
  };
}

function exportValidationReport(year: DataYear, mode: "PDF" | "DOCX" | "PRINT") {
  const payload = validationPayload(year);
  if (mode === "PDF") return void exportPDF(payload);
  if (mode === "DOCX") return void exportDOCX(payload);
  printPayload(payload);
}

function statRow(rows: any[], field: string): string[] {
  let missing = 0;
  for (const r of rows) {
    const v = r[field];
    if (v === null || v === undefined || v === "") missing++;
  }
  const present = rows.length - missing;
  const pct = rows.length ? (missing / rows.length) * 100 : 0;
  const status = pct === 0 ? "OK" : pct < 30 ? "WARN" : "MISSING";
  return [field, present.toLocaleString(), missing.toLocaleString(), `${pct.toFixed(1)}%`, status];
}
