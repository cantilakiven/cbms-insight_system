import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CalendarRange, CalendarCheck2, FileBarChart } from "lucide-react";
import { getDataVersion, getYearDatasets, subscribeData, type DataYear } from "@/data/cbms";
import { DataTable } from "@/components/DataTable";
import { REPORTS, frequency } from "@/lib/cbms-report-defs";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  const [year, setYear] = useState<DataYear>(2022);
  const [active, setActive] = useState<string>(REPORTS[0].id);
  const report = REPORTS.find((r) => r.id === active)!;
  const ds = getYearDatasets(year);

  const result = useMemo(() => {
    const data = report.source === "households" ? ds.households : ds.persons;
    return frequency(data, report);
  }, [report, ds.households, ds.persons, version]);

  const rows = [...result.rows];
  rows.push({ category: "TOTAL", count: result.total, percent: "100.00%" });

  const datasetCounts = {
    persons: ds.persons.length,
    households: ds.households.length,
    barangays: ds.barangays.length,
    interviews: ds.interviews.length,
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary"><FileBarChart className="h-4 w-4" /> Statistical reporting</div>
            <h1 className="mt-2 font-display text-2xl font-bold">CBMS Statistical Reports</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Generate the same report families for 2022 or 2024 without leaving the Reports page. The year selection is independent from the sidebar workspace so the result is always obvious.</p>
          </div>
          <div className="flex rounded-xl bg-muted p-1" aria-label="Report year">
            {[2022, 2024].map((y) => (
              <button key={y} onClick={() => setYear(y as DataYear)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${year === y ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {y === 2022 ? <CalendarRange className="h-4 w-4" /> : <CalendarCheck2 className="h-4 w-4" />}
                CBMS {y}
              </button>
            ))}
          </div>
        </div>
      </header>

      

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(datasetCounts).map(([label, count]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-xl font-black">{count.toLocaleString()}</div></div>)}
      </section>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-xl border border-border bg-card p-2">
          <div className="mb-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{year} report families</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {REPORTS.map((r) => (
              <button key={r.id} onClick={() => setActive(r.id)} className={`block w-full rounded-md px-3 py-2 text-left text-xs leading-tight transition ${active === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {r.title}
              </button>
            ))}
          </div>
        </aside>
        <DataTable
          title={`${report.title} — CBMS ${year}`}
          subtitle={`Total: ${result.total.toLocaleString()} ${report.source === "households" ? "households" : "persons"}`}
          rows={rows}
          columns={[{ key: "category", label: "Category" }, { key: "count", label: "Count" }, { key: "percent", label: "Share" }]}
          searchable={false}
          pageSize={50}
        />
      </div>

      <footer className="border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
        CBMS {year} report · {datasetCounts.persons.toLocaleString()} persons · {datasetCounts.households.toLocaleString()} households · Generated from the normalized local dataset.
      </footer>
    </div>
  );
}
