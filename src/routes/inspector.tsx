import { createFileRoute, Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { datasets, detectedFiles, dataLoadedAt, coverageLabel, getYearDatasets, getYearDataHealth, getActiveYear, getSourceWatermark, getImportReport, subscribeData, getDataVersion } from "@/data/cbms";
import { RULES, getRuleChoice, subscribeRuleChanges } from "@/lib/cbms-recognition";
import { CheckCircle2, AlertTriangle, FileJson, Clock, Database, Layers3, Search } from "lucide-react";

export const Route = createFileRoute("/inspector")({
  component: InspectorPage,
});

const DATASET_LABELS: Record<string, string> = {
  barangays: "Barangay records",
  barangayList: "Barangay / Purok list",
  households: "Household records",
  childMortality: "Child mortality records",
  interviews: "Interview records",
  persons: "Person records",
  personsTvet: "Person TVET records",
  unrecognized: "Unrecognized (skipped)",
};

function fieldPresence(rows: any[], field: string): { present: number; missing: number } {
  let missing = 0;
  for (const r of rows) {
    const v = field.startsWith("_hh.") ? undefined : r[field];
    if (v === null || v === undefined || v === "") missing++;
  }
  return { present: rows.length - missing, missing };
}

function InspectorPage() {
  useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  // re-render on rule change
  useSyncExternalStore(
    (cb) => subscribeRuleChanges(cb),
    () => RULES.map((r) => getRuleChoice(r.id)).join("|"),
    () => "ssr",
  );

  const health22 = getYearDataHealth(2022);
  const health24 = getYearDataHealth(2024);
  const runtimeTotal = health22.totalRecords + health24.totalRecords;
  const totalRecords = runtimeTotal || detectedFiles.reduce((a, f) => a + f.recordCount, 0);
  const recognized = detectedFiles.filter((f) => f.classifiedAs !== "unrecognized");
  const unrecognized = detectedFiles.filter((f) => f.classifiedAs === "unrecognized");
  const importReport = getImportReport();
  const reconstructedFiles = importReport?.datasets.reduce((n, d) => n + d.files.length, 0) || health22.files + health24.files;

  // schema mapping for the three priority sectors
  const focus = ["pwd", "fourps", "food_stamp"] as const;
  const legacy2022 = getYearDatasets(2022);
  const raw2022 = legacy2022.households.filter((h: any) => h.legacy_raw && typeof h.legacy_raw === "object");
  const legacySections = useLegacySections(raw2022);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dataset Inspector</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CBMS source records loaded for the Authorized CBMS Data Custodian, including the records loaded from each year and which fields are powering your
          PWD, 4Ps, and Food Stamp rosters.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<FileJson className="h-4 w-4 text-info" />} label="Detected files" value={detectedFiles.length || reconstructedFiles} />
        <Stat icon={<Database className="h-4 w-4 text-info" />} label="Total records loaded" value={totalRecords} />
        <Stat icon={<Clock className="h-4 w-4 text-info" />} label="Last loaded" value={dataLoadedAt ? dataLoadedAt.toLocaleString() : "—"} isText />
      </div>

      <section className="rounded-xl border border-primary/20 bg-primary/5 shadow-[var(--shadow-card)]">
        <header className="border-b border-primary/10 p-4"><h2 className="font-display text-lg font-semibold">Runtime datasets currently loaded</h2><p className="text-xs text-muted-foreground">These totals are read directly from the in-memory CBMS stores, so the inspector remains accurate even when the original file list is not persisted in the current renderer session.</p></header>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {[{year:2022,health:health22},{year:2024,health:health24}].map(({year,health})=><div key={year} className="rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between"><span className="font-black">CBMS {year}</span><span className="text-xs font-semibold text-muted-foreground">{health.files.toLocaleString()} file(s)</span></div><div className="mt-3 grid grid-cols-3 gap-2"><Stat icon={<Database className="h-4 w-4 text-primary" />} label="Persons" value={health.persons}/><Stat icon={<Database className="h-4 w-4 text-primary" />} label="Households" value={health.households}/><Stat icon={<MapIconShim />} label="Total records" value={health.totalRecords}/></div></div>)}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <header className="border-b border-border p-4">
          <h2 className="font-display text-lg font-semibold">Detected JSON files</h2>
          <p className="text-xs text-muted-foreground">
            Coverage: <span className="font-medium text-foreground">{coverageLabel}</span> ·
            Files are auto-loaded by filename pattern. Drop new JSONs into{" "}
            <span className="font-mono">src/data/cbms/</span> and the app reloads.
          </p>
        </header>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">File</th>
                <th className="px-3 py-2 text-left font-semibold">Classified as</th>
                <th className="px-3 py-2 text-right font-semibold">Records</th>
                <th className="px-3 py-2 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {recognized.map((f) => (
                <tr key={f.path} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{f.filename}</td>
                  <td className="px-3 py-2">{DATASET_LABELS[f.classifiedAs as string] || f.classifiedAs}</td>
                  <td className="px-3 py-2 text-right">{f.recordCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                  </td>
                </tr>
              ))}
              {unrecognized.map((f) => (
                <tr key={f.path} className="border-b border-border/60 bg-warning/5">
                  <td className="px-3 py-2 font-mono text-xs">{f.filename}</td>
                  <td className="px-3 py-2 text-muted-foreground">Unrecognized — rename to match a pattern</td>
                  <td className="px-3 py-2 text-right">{f.recordCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <AlertTriangle className="mx-auto h-4 w-4 text-warning" />
                  </td>
                </tr>
              ))}
              {detectedFiles.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">No JSON files detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 shadow-[var(--shadow-card)]">
        <header className="border-b border-primary/10 p-4">
          <div className="flex items-start gap-3">
            <Layers3 className="mt-0.5 h-5 w-5 text-primary" />
            <div><h2 className="font-display text-lg font-semibold">CBMS 2022 wide-data coverage</h2><p className="text-xs text-muted-foreground">The 2022 questionnaire contains many sections that do not have one-to-one 2024 fields. The importer keeps those original fields inside <span className="font-mono">legacy_raw</span> instead of discarding them.</p></div>
          </div>
        </header>
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Database className="h-4 w-4 text-primary" />} label="2022 households" value={legacy2022.households.length} />
            <Stat icon={<Database className="h-4 w-4 text-primary" />} label="2022 persons" value={legacy2022.persons.length} />
            <Stat icon={<Layers3 className="h-4 w-4 text-primary" />} label="Legacy sections found" value={legacySections.length} />
            <Stat icon={<Search className="h-4 w-4 text-primary" />} label="Active workspace" value={getActiveYear()} isText />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {legacySections.map((section) => <div key={section.name} className="rounded-xl border border-border bg-background p-3"><div className="flex items-center justify-between"><span className="font-mono text-xs font-bold">{section.name}</span><span className="text-[10px] text-muted-foreground">{section.fields} fields · {section.coverage}% rows</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${section.coverage}%` }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{section.sample.join(", ")}{section.sample.length >= 5 ? "…" : ""}</p></div>)}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">{getSourceWatermark(2022)} · These fields remain available for future local indicators even when the current dashboard does not yet have a dedicated card.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <header className="border-b border-border p-4">
          <h2 className="font-display text-lg font-semibold">Schema mapping — PWD / 4Ps / Food Stamp</h2>
          <p className="text-xs text-muted-foreground">
            These are the exact fields that drive each roster, given the recognition rule you've selected in{" "}
            <Link to="/validation" className="text-primary underline">Validation & Mapping</Link>.
          </p>
        </header>
        <div className="divide-y divide-border">
          {focus.map((id) => {
            const def = RULES.find((r) => r.id === id)!;
            const choice = getRuleChoice(id);
            const opt = def.options.find((o) => o.id === choice) || def.options[0];
            const sourceRows = def.level === "person" ? datasets.persons : datasets.households;
            const fieldStats = def.fields.map((f) => ({ field: f, ...fieldPresence(sourceRows, f) }));
            const anyMissing = fieldStats.some((f) => f.missing > 0);
            return (
              <div key={id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-semibold">{def.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Rule applied: <span className="font-medium text-foreground">{opt.label}</span> ·
                      Source: {def.level === "person" ? "Person record" : "Household record"}
                    </p>
                  </div>
                  {anyMissing ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> Some required fields are missing
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-xs font-semibold text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> All required fields present
                    </span>
                  )}
                </div>
                <div className="mt-3 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/60">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold">Field</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Present</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Missing</th>
                        <th className="px-2 py-1.5 text-right font-semibold">% Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldStats.map((s) => {
                        const total = s.present + s.missing;
                        const pct = total ? (s.missing / total) * 100 : 0;
                        return (
                          <tr key={s.field} className="border-b border-border/60">
                            <td className="px-2 py-1.5 font-mono">{s.field}</td>
                            <td className="px-2 py-1.5 text-right">{s.present.toLocaleString()}</td>
                            <td className={`px-2 py-1.5 text-right ${s.missing > 0 ? "text-warning font-medium" : ""}`}>
                              {s.missing.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 text-right">{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Open the rosters: <Link to="/sectors" className="text-primary underline">PWD / 4Ps / Food Stamp</Link> ·
        Configure rules: <Link to="/validation" className="text-primary underline">Validation & Mapping</Link>
      </div>
    </div>
  );
}

function useLegacySections(rows: any[]) {
  const sections = new Map<string, { fields: Set<string>; present: number }>();
  for (const row of rows) {
    const raw = row.legacy_raw || {};
    for (const [name, value] of Object.entries(raw)) {
      if (!sections.has(name)) sections.set(name, { fields: new Set(), present: 0 });
      const item = sections.get(name)!;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.keys(value as any).forEach((k) => item.fields.add(k));
        if (Object.values(value as any).some((v) => v !== null && v !== undefined && v !== "")) item.present++;
      } else if (value !== null && value !== undefined && value !== "") {
        item.fields.add(name);
        item.present++;
      }
    }
  }
  return Array.from(sections.entries()).map(([name, v]) => ({ name, fields: v.fields.size, coverage: rows.length ? Math.round(v.present / rows.length * 100) : 0, sample: Array.from(v.fields).slice(0, 5) })).sort((a,b) => b.fields - a.fields);
}

function MapIconShim(){ return <Layers3 className="h-4 w-4 text-primary" />; }

function Stat({ icon, label, value, isText }: { icon: React.ReactNode; label: string; value: number | string; isText?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-2 font-bold text-foreground ${isText ? "text-base" : "text-2xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
