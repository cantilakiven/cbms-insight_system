import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Trash2, Eye, EyeOff, ShieldAlert, FileArchive } from "lucide-react";
import {
  getExportLog,
  subscribeExportLog,
  clearExportLog,
  deleteExportLogEntry,
  type ExportLogEntry,
} from "@/lib/export-log";

export const Route = createFileRoute("/export-log")({
  component: ExportLogPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive space-y-2">
      <h2 className="font-bold text-lg">Error loading Export Log</h2>
      <pre className="mt-2 text-xs bg-muted p-4 rounded overflow-auto font-mono text-foreground">
        {error instanceof Error ? error.stack || error.message : String(error)}
      </pre>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Reload Page
      </Button>
    </div>
  ),
});

const EMPTY_LOG: ExportLogEntry[] = [];

function useLog(): ExportLogEntry[] {
  const getServerSnapshot = useCallback(() => EMPTY_LOG, []);
  return useSyncExternalStore(subscribeExportLog, getExportLog, getServerSnapshot);
}

function ExportLogPage() {
  const log = useLog();
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [revealAll, setRevealAll] = useState(false);
  const [formatFilter, setFormatFilter] = useState("ALL");

  useEffect(() => {
    setMounted(true);
  }, []);

  const safeLog = mounted ? log : EMPTY_LOG;

  const filtered = safeLog.filter((e) => {
    const l = q.toLowerCase();
    const matchesText = !l || (e.filename || "").toLowerCase().includes(l) || (e.title || "").toLowerCase().includes(l) || (e.format || "").toLowerCase().includes(l);
    const matchesFormat = formatFilter === "ALL" || e.format === formatFilter;
    return matchesText && matchesFormat;
  });

  const byFormat = safeLog.reduce<Record<string, number>>((acc, e) => {
    const fmt = e.format || "CSV";
    acc[fmt] = (acc[fmt] || 0) + 1;
    return acc;
  }, {});

  const copy = (t: string) => {
    try {
      navigator.clipboard.writeText(t);
    } catch {}
  };

  const mask = (p: string = "") => "•".repeat(Math.min(p.length || 8, 16));

  if (!mounted) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card border border-border" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Export Log &amp; Password Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protected exports are recorded here with the password and exact saved path. PDF/Word compendiums use AES-256 protected ZIP containers; interactive HTML compendiums use AES-256-GCM inside the HTML file. This log is stored locally on this computer only.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total exports" value={safeLog.length} />
        <Stat label="CSV files" value={byFormat.CSV || 0} />
        <Stat label="Excel files" value={byFormat.XLSX || 0} />
        <Stat label="PDF files" value={byFormat.PDF || 0} />
        <Stat label="Word files" value={byFormat.DOCX || 0} />
        <Stat label="HTML files" value={byFormat.HTML || 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search filename, report, or format…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full max-w-lg" />
        <select value={formatFilter} onChange={(e)=>setFormatFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold"><option value="ALL">All formats</option>{["PDF","DOCX","HTML","XLSX","CSV"].map(f=><option key={f} value={f}>{f}</option>)}</select>
        <Button variant="outline" size="sm" onClick={() => setRevealAll((v) => !v)}>
          {revealAll ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {revealAll ? "Hide all passwords" : "Reveal all passwords"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Delete ALL export log entries? This cannot be undone.")) clearExportLog();
          }}
        >
          <Trash2 className="h-4 w-4" /> Clear log
        </Button>

        {import.meta.env.DEV && (
<Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const userDataPath = (window as any).electronStore?.getUserDataPath ? await (window as any).electronStore.getUserDataPath() : null;
              const exportLogPath = (window as any).electronStore?.getExportLogPath ? await (window as any).electronStore.getExportLogPath() : null;
              const fileContents = (window as any).electronDebug?.readFile && exportLogPath ? await (window as any).electronDebug.readFile(exportLogPath) : null;
              const mainLog = (window as any).electronLog?.getLog ? await (window as any).electronLog.getLog() : null;
              alert(
                'Debug info:\n' +
                `userDataPath: ${userDataPath || 'n/a'}\n` +
                `exportLogPath: ${exportLogPath || 'n/a'}\n` +
                `file on disk: ${fileContents ? 'present' : 'missing'}\n` +
                `entries read via main: ${mainLog ? (mainLog.length || 0) : 'n/a'}\n` +
                `entries in renderer cache: ${safeLog.length}`
              );
            } catch (err) {
              console.error(err);
              alert('Failed to retrieve debug info. See console for details.');
            }
          }}
        >
          Debug
        </Button>
        )}
      </div>

      <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Security reminder
        </div>
        <p className="mt-1 text-muted-foreground">
          Never send the ZIP file and its password through the same channel (e.g., both by email).
          Prefer sending the file via one channel and the password via another (SMS, call, in person).
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground"><FileArchive className="mx-auto mb-2 h-8 w-8 opacity-50" />No matching exports. Try another search or format.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const visible = revealAll || reveal[e.id];
            const rowCount = typeof e.rowCount === "number" ? e.rowCount : 0;
            const bytes = typeof e.bytes === "number" ? e.bytes : 0;
            const dateStr = e.timestamp ? new Date(e.timestamp).toLocaleString() : "—";
            return <article key={e.id} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">{e.format || "CSV"}</span>{e.encryption&&<span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black text-success">{e.encryption}</span>}<span className="text-[11px] text-muted-foreground">{dateStr}</span></div><h3 className="mt-2 break-words text-sm font-black">{e.title || "Unnamed export"}</h3><div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{e.filename || "—"}</div></div>
                <div className="flex shrink-0 gap-1.5"><Button size="sm" variant="outline" onClick={()=>setReveal((s)=>({...s,[e.id]:!s[e.id]}))}>{visible?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}{visible?"Hide":"Show"}</Button><Button size="sm" onClick={()=>copy(e.password||"")}><Copy className="h-4 w-4"/> Copy password</Button><Button size="sm" variant="ghost" onClick={()=>{if(confirm(`Delete log entry for ${e.filename}?`)) deleteExportLogEntry(e.id)}} title="Delete entry"><Trash2 className="h-4 w-4 text-destructive"/></Button></div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 md:col-span-1"><div className="text-[10px] font-black uppercase tracking-wider text-primary">Password</div><div className="mt-2 break-all rounded-lg bg-background px-3 py-2 font-mono text-sm font-black">{visible?e.password:mask(e.password)}</div><Button className="mt-2 w-full" size="sm" onClick={()=>copy(e.password||"")}><Copy className="h-4 w-4"/> Copy password</Button></div>
                <div className="rounded-xl border border-border bg-muted/20 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Export details</div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><div className="text-muted-foreground">Rows</div><div className="font-bold">{rowCount.toLocaleString()}</div></div><div><div className="text-muted-foreground">Size</div><div className="font-bold">{(bytes/1024).toFixed(1)} KB</div></div></div></div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 md:col-span-1"><div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Saved location</div><div className="mt-2 break-all font-mono text-[11px] leading-5">{e.savedPath || "Browser-selected location"}</div></div>
              </div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-foreground">{(value || 0).toLocaleString()}</div>
    </div>
  );
}