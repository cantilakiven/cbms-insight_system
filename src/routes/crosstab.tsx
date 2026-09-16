import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { barangays } from "@/data/cbms";
import { DataTable } from "@/components/DataTable";
import { PersonModal } from "@/components/CBMSModals";
import { Button } from "@/components/ui/button";
import { exportCSV, exportDOCX, exportPDF, exportXLSX, printPayload } from "@/lib/cbms-export";
import { SOURCE_NOTE } from "@/lib/cbms-labels";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { RULES, type RuleId, listSector, getEnrichedPersons } from "@/lib/cbms-recognition";

export const Route = createFileRoute("/crosstab")({
  component: CrosstabPage,
});

type DimId = string;
interface Dim {
  id: DimId;
  label: string;
  /** returns category for a person (already enriched with _hh) */
  bucket: (p: any) => string;
}

const DIMS: Dim[] = [
  { id: "barangay", label: "Barangay", bucket: (p) => p.area_name || "—" },
  { id: "sex", label: "Sex", bucket: (p) => p.a03_sex || "—" },
  {
    id: "age_group",
    label: "Age group",
    bucket: (p) => {
      const a = p.a05_age;
      if (typeof a !== "number") return "—";
      if (a <= 5) return "0–5";
      if (a <= 14) return "6–14";
      if (a <= 17) return "15–17";
      if (a <= 30) return "18–30";
      if (a <= 59) return "31–59";
      return "60+";
    },
  },
  { id: "civil", label: "Civil status", bucket: (p) => p.a07_marital_status || "—" },
  { id: "education", label: "Educational level", bucket: (p) => p.a11_hgc_level || "—" },
  { id: "employment", label: "Employment status", bucket: (p) => p.e01_employment_status || "—" },
  { id: "water", label: "HH drinking water source", bucket: (p) => p._hh?.n02_drinking_water || "—" },
  { id: "toilet", label: "HH toilet facility", bucket: (p) => p._hh?.n08_toilet_facility || "—" },
  { id: "electricity", label: "HH electricity", bucket: (p) => p._hh?.o11_electricity || "—" },
  { id: "roof", label: "HH roof material", bucket: (p) => p._hh?.o03_roof || "—" },
  { id: "walls", label: "HH wall material", bucket: (p) => p._hh?.o04_outer_walls || "—" },
  { id: "tenure", label: "HH tenure", bucket: (p) => p._hh?.o09_tenure || "—" },
  { id: "internet", label: "HH internet", bucket: (p) => p._hh?.k01_internet_access || "—" },
];

const FILTERS: { id: "all" | RuleId; label: string }[] = [
  { id: "all", label: "All persons" },
  ...RULES.map((r) => ({ id: r.id, label: r.title })),
];

function CrosstabPage() {
  const [filter, setFilter] = useState<"all" | RuleId>("pwd");
  const [rowDim, setRowDim] = useState<DimId>("barangay");
  const [colDim, setColDim] = useState<DimId>("age_group");
  const [drill, setDrill] = useState<{ row: string; col: string } | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const universe = useMemo(() => (filter === "all" ? getEnrichedPersons() : listSector(filter)), [filter]);
  const rd = DIMS.find((d) => d.id === rowDim)!;
  const cd = DIMS.find((d) => d.id === colDim)!;

  const { matrix, rowKeys, colKeys, rowTotals, colTotals, grand } = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    const cset = new Set<string>();
    for (const p of universe) {
      const r = rd.bucket(p);
      const c = cd.bucket(p);
      cset.add(c);
      const inner = m.get(r) || new Map();
      inner.set(c, (inner.get(c) || 0) + 1);
      m.set(r, inner);
    }
    const rowKeys = Array.from(m.keys()).sort();
    const colKeys = Array.from(cset).sort();
    const rowTotals = new Map<string, number>();
    const colTotals = new Map<string, number>();
    let grand = 0;
    for (const r of rowKeys) {
      let rt = 0;
      for (const c of colKeys) {
        const v = m.get(r)?.get(c) || 0;
        rt += v;
        colTotals.set(c, (colTotals.get(c) || 0) + v);
      }
      rowTotals.set(r, rt);
      grand += rt;
    }
    return { matrix: m, rowKeys, colKeys, rowTotals, colTotals, grand };
  }, [universe, rd, cd]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    return universe.filter((p) => rd.bucket(p) === drill.row && cd.bucket(p) === drill.col);
  }, [drill, universe, rd, cd]);

  const filterLabel = FILTERS.find((f) => f.id === filter)!.label;
  const title = `Cross-tabulation: ${filterLabel} by ${rd.label} × ${cd.label}`;

  // Build export payload from matrix
  const exportColumns = [{ key: "row", label: rd.label }, ...colKeys.map((c) => ({ key: c, label: c })), { key: "_total", label: "Total" }];
  const exportRows = rowKeys.map((r) => {
    const row: any = { row: r };
    for (const c of colKeys) row[c] = matrix.get(r)?.get(c) || 0;
    row._total = rowTotals.get(r) || 0;
    return row;
  });
  const totalRow: any = { row: "TOTAL" };
  for (const c of colKeys) totalRow[c] = colTotals.get(c) || 0;
  totalRow._total = grand;
  exportRows.push(totalRow);

  const payload = { title, subtitle: `Total: ${grand.toLocaleString()} persons`, columns: exportColumns, rows: exportRows, note: SOURCE_NOTE };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Cross-tabulation Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build any 2-dimensional matrix and click a cell to drill into the underlying names.
          Export the matrix or the drill-down list with the PSA source note.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <Field label="Population filter">
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Rows">
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={rowDim} onChange={(e) => setRowDim(e.target.value)}>
            {DIMS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Columns">
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={colDim} onChange={(e) => setColDim(e.target.value)}>
            {DIMS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <header className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">Total: {grand.toLocaleString()} persons. Click any cell to drill down.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => exportCSV(payload)}><Download className="h-4 w-4" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => exportXLSX(payload)}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="outline" onClick={() => exportPDF(payload)}><FileText className="h-4 w-4" /> PDF</Button><Button size="sm" variant="outline" onClick={() => exportDOCX(payload)}><FileText className="h-4 w-4" /> Word</Button><Button size="sm" variant="outline" onClick={() => printPayload(payload)}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </header>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
              <tr>
                <th className="border-b border-border px-3 py-2 text-left font-semibold">{rd.label}</th>
                {colKeys.map((c) => (
                  <th key={c} className="border-b border-border px-3 py-2 text-right font-semibold">{c}</th>
                ))}
                <th className="border-b border-border px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rowKeys.map((r) => (
                <tr key={r} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium">{r}</td>
                  {colKeys.map((c) => {
                    const v = matrix.get(r)?.get(c) || 0;
                    return (
                      <td key={c} className="px-3 py-2 text-right">
                        {v > 0 ? (
                          <button onClick={() => setDrill({ row: r, col: c })} className="rounded px-1.5 py-0.5 text-primary hover:bg-primary/10 hover:underline">
                            {v}
                          </button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold">{rowTotals.get(r)?.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-3 py-2">Total</td>
                {colKeys.map((c) => <td key={c} className="px-3 py-2 text-right">{(colTotals.get(c) || 0).toLocaleString()}</td>)}
                <td className="px-3 py-2 text-right">{grand.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] italic text-muted-foreground">{SOURCE_NOTE}</div>
      </section>

      {drill && (
        <DataTable
          title={`Drill-down — ${filterLabel}: ${rd.label} = "${drill.row}" × ${cd.label} = "${drill.col}"`}
          subtitle={`Cell total: ${drillRows.length.toLocaleString()} person(s) · Row total (${drill.row}): ${(rowTotals.get(drill.row) || 0).toLocaleString()} · Column total (${drill.col}): ${(colTotals.get(drill.col) || 0).toLocaleString()} · Grand total: ${grand.toLocaleString()}`}
          rows={drillRows}
          columns={[
            { key: "_full_name", label: "Full Name" },
            { key: "a03_sex", label: "Sex" },
            { key: "a05_age", label: "Age" },
            { key: "area_name", label: "Barangay" },
            { key: "_purok", label: "Purok / Sitio" },
            { key: "_address", label: "Address" },
            { key: "_hh_head", label: "Household Head" },
            { key: "husn", label: "HUSN" },
            { key: "a07_marital_status", label: "Civil Status" },
            { key: "e01_employment_status", label: "Employment" },
            { key: "e08_class_of_worker", label: "Class of Worker" },
            { key: "e05_occupation_group", label: "Occupation" },
          ]}
          onRowClick={(r) => setSelected(r)}
        />
      )}

      <PersonModal person={selected} onClose={() => setSelected(null)} />

      <p className="text-xs text-muted-foreground">
        Tip: change recognition rules (e.g., who counts as PWD) in{" "}
        <Link to="/validation" className="text-primary underline">Data Validation & Mapping</Link>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
