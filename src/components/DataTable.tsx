import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, FileType2, Printer } from "lucide-react";
import { exportCSV, exportDOCX, exportPDF, exportXLSX, printPayload, type ExportColumn, type SummaryItem } from "@/lib/cbms-export";
import { getActiveYear, getSourceWatermark } from "@/data/cbms";

interface Props<T extends Record<string, any>> {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ExportColumn[];
  searchable?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  summary?: SummaryItem[];
  hideExport?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  title, subtitle, rows, columns,
  searchable = true, pageSize = 25, onRowClick, emptyText = "No records", summary, hideExport = false,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const lower = q.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => String(getPath(r, c.key) ?? "").toLowerCase().includes(lower))
    );
  }, [q, rows, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, totalPages);
  const slice = filtered.slice((cur - 1) * pageSize, cur * pageSize);

  const payload = { title, subtitle, columns, rows: filtered, note: getSourceWatermark(getActiveYear()), summary };

  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <Input
              placeholder="Filter table…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="h-9 w-full sm:w-56"
            />
          )}
          {!hideExport && <>
            <Button size="sm" variant="outline" onClick={() => exportCSV(payload)} title="Export CSV">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportXLSX(payload)} title="Export Excel">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportPDF(payload)} title="Export PDF">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportDOCX(payload)} title="Export Word">
              <FileType2 className="h-4 w-4" /> Word
            </Button>
            <Button size="sm" variant="outline" onClick={() => printPayload(payload)} title="Print report">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>}
        </div>
      </header>

      {summary && summary.length > 0 && (
        <div className="sector-summary-strip border-b border-border bg-muted/25 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Summary &amp; useful rates</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Percentages use the correct population or reporting denominator for this filter.</div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((s) => (
              <div key={s.label} className="sector-summary-card rounded-xl border border-border bg-background px-3 py-2.5">
                <div className="text-[10px] font-semibold leading-4 text-muted-foreground">{s.label}</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <span className="text-lg font-black tabular-nums text-foreground">{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</span>
                  {s.percentage != null && (
                    <span className="sector-summary-percent rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-primary">{s.percentage.toFixed(1)}%</span>
                  )}
                </div>
                {s.percentage != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, s.percentage))}%` }} />
                  </div>
                )}
                {s.percentageLabel && <div className="mt-1 text-[9px] leading-4 text-muted-foreground">{s.percentageLabel}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="border-b border-border px-3 py-2 text-left font-semibold text-secondary-foreground whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            )}
            {slice.map((r, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-b border-border/60 transition hover:bg-muted/60 ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-foreground/90">
                    {formatCell(getPath(r, c.key))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="sticky bottom-0 bg-secondary/90 backdrop-blur">
              <tr>
                <td colSpan={columns.length} className="border-t-2 border-border px-3 py-2 text-left text-xs font-semibold text-secondary-foreground">
                  TOTAL: {filtered.length.toLocaleString()} record(s)
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>


      <footer className="flex flex-col gap-3 border-t border-border p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Showing <span className="font-semibold text-foreground">{slice.length}</span> of{" "}
          <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> records
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Prev</Button>
          <span>Page {cur} / {totalPages}</span>
          <Button size="sm" variant="ghost" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>Next</Button>
        </div>
      </footer>
      <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] italic text-muted-foreground">
        {getSourceWatermark(getActiveYear())}
      </div>
    </section>
  );
}

export function getPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  if (path in obj) return obj[path];
  return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
}

function formatCell(v: any) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (v === "Yes") return <span className="rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">Yes</span>;
  if (v === "No") return <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">No</span>;
  return String(v);
}
