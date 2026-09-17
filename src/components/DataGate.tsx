import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearData,
  dataLoadedAt,
  datasets,
  detectedFiles,
  getDataVersion,
  getImportReport,
  importFiles,
  invalidFiles,
  isDataLoaded,
  loadFromCache,
  repairedFiles,

  subscribeData,
  type ImportReport,
  type LoadProgress,
} from "@/data/cbms";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderOpen,
  FileCheck2,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

export function useDataVersion() {
  return useSyncExternalStore(subscribeData, getDataVersion, () => 0);
}



/** Renders children only once CBMS JSON files have been imported. */
export function DataGate({ children }: { children: React.ReactNode }) {
  const version = useDataVersion();
  const [booting, setBooting] = useState(true);
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  useEffect(() => {
    let alive = true;
    loadFromCache((p) => {
      if (alive) setProgress(p);
    })
      .catch(() => false)
      .finally(() => {
        if (alive) { setBooting(false); setProgress(null); }
      });
    return () => { alive = false; };
  }, []);

  if (booting) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">{progress?.step || "Loading your CBMS datasets…"}</p>
        {progress && (
          <div className="w-full space-y-1">
            <Progress value={progress.percent} className="h-2" />
            <p className="text-center text-xs">
              {progress.percent}% · {progress.rows.toLocaleString()} records
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!isDataLoaded()) return <ImportPanel />;

  // `key` forces a fresh render of every page after a re-import.
  return <div key={version}>{children}</div>;
}

const PHASES: { key: LoadProgress["phase"]; label: string }[] = [
  { key: "saving", label: "Saving files to this computer" },
  { key: "parsing", label: "Parsing & indexing JSON (chunked)" },
  { key: "indexing", label: "Building indexes + validation report" },
  { key: "done", label: "Finished" },
];

export function ImportPanel({ compact = false }: { compact?: boolean }) {
  const version = useDataVersion();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(() => getImportReport());
  const fileRef = useRef<HTMLInputElement>(null);
  const file2022Ref = useRef<HTMLInputElement>(null);
  const file2024Ref = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setReport(getImportReport());
  }, [version]);

  const run = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files as any as File[]).filter((f) => f.name.toLowerCase().endsWith(".json"));
    if (!list.length) return;
    setBusy(true);
    setReport(null);
    try {
      await importFiles(list, setProgress);
      setReport(getImportReport());
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const loaded = isDataLoaded();
  const totalRecords = Object.values(datasets).reduce((s, r) => s + r.length, 0);


  const activePhaseIndex = progress ? PHASES.findIndex((p) => p.key === progress.phase) : -1;

  return (
    <section className="mx-auto max-w-3xl space-y-5" data-v={version}>
      {!compact && (
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold">Import CBMS Data</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            CBMS 2022 and 2024 are not bundled with the application. Choose the year folder from your computer to import its JSON files. Files are read one at a time and parsed in chunks, then
            stored locally so they remain available after you close the app. This keeps memory usage
            controlled and avoids bundling the large JSON into the JavaScript module graph.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">22</div>
            <div><h2 className="font-display font-semibold">CBMS 2022</h2><p className="text-xs text-muted-foreground">Legacy local-area folder</p></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Choose the complete 2022 folder. The system converts the legacy structure automatically.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold">24</div>
            <div><h2 className="font-display font-semibold">CBMS 2024</h2><p className="text-xs text-muted-foreground">Normalized JSON folder</p></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Choose the complete 2024 folder. JSON files are recognized automatically.</p>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void run(e.dataTransfer?.files ?? null); }}
        className={`rounded-2xl border-2 border-dashed p-5 transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => file2022Ref.current?.click()} disabled={busy} className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left transition hover:border-primary hover:bg-primary/10 disabled:opacity-50">
            <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">22</span><FileCheck2 className="h-5 w-5 text-primary" /></div>
            <h3 className="mt-3 font-display font-bold">Import CBMS 2022</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the entire 2022 CBMS folder. The app merges overlapping A/B/C snapshots, removes duplicate household keys, and preserves the best available fields.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary"><FolderOpen className="h-3.5 w-3.5" /> Choose 2022 Folder</span>
          </button>
          <button type="button" onClick={() => file2024Ref.current?.click()} disabled={busy} className="rounded-2xl border border-success/30 bg-success/5 p-5 text-left transition hover:border-success hover:bg-success/10 disabled:opacity-50">
            <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-sm font-black text-success-foreground">24</span><FileCheck2 className="h-5 w-5 text-success" /></div>
            <h3 className="mt-3 font-display font-bold">Import CBMS 2024</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the entire 2024 folder. The app recognizes Persons, Households, Barangays, Interviews, TVET and child mortality files.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-success"><FolderOpen className="h-3.5 w-3.5" /> Choose 2024 Folder</span>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => dirRef.current?.click()} disabled={busy}><FolderOpen className="mr-2 h-4 w-4" /> Choose a mixed folder</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>Auto-detect mixed JSON files</Button>
          {loaded && <Button variant="ghost" onClick={() => void loadFromCache(setProgress)} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" /> Reload saved data</Button>}
          {loaded && <Button variant="ghost" onClick={() => void clearData()} disabled={busy}><Trash2 className="mr-2 h-4 w-4" /> Clear all imported data</Button>}
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground">You can also drag a folder here, or use the dedicated year-folder buttons above. Importing another year does not delete the year already stored.</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void run(e.target.files)}
        />
        <input ref={file2022Ref} type="file" multiple className="hidden"
          webkitdirectory="true" directory="true" onChange={(e) => void run(e.target.files)} />
        <input ref={file2024Ref} type="file" multiple className="hidden"
          webkitdirectory="true" directory="true" onChange={(e) => void run(e.target.files)} />
        <input
          ref={dirRef}
          type="file"
          multiple
          webkitdirectory="true"
          directory="true"
          className="hidden"
          onChange={(e) => void run(e.target.files)}
        />

        {progress && (
          <div className="mt-5 space-y-3 text-left">
            <Progress value={progress.percent} className="h-2.5" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2 font-medium text-foreground">
                {progress.phase !== "done" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {progress.step}
              </span>
              <span>
                {progress.percent}% · {progress.rows.toLocaleString()} records
                {progress.total ? ` · file ${Math.min((progress.index ?? 0) + 1, progress.total)}/${progress.total}` : ""}
              </span>
            </div>
            <ol className="space-y-1 text-xs">
              {PHASES.map((p, i) => {
                const state = i < activePhaseIndex ? "done" : i === activePhaseIndex ? "active" : "todo";
                return (
                  <li key={p.key} className="flex items-center gap-2">
                    {state === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : state === "active" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-border" />
                    )}
                    <span className={state === "todo" ? "text-muted-foreground" : "text-foreground"}>{p.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {busy && !progress && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Working…
          </div>
        )}
      </div>

 {loaded && (
        <p className="text-center text-xs text-muted-foreground">
          {totalRecords.toLocaleString()} records loaded from {detectedFiles.length} file(s)
          {dataLoadedAt ? ` · ${dataLoadedAt.toLocaleString()}` : ""}
        </p>
      )}

      {report && <ImportReportCard report={report} />}

      {repairedFiles.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-primary" /> {repairedFiles.length} file(s) had invalid JSON syntax
            and were auto-corrected — all records were loaded
          </p>
          <ul className="mt-2 space-y-1">
            {repairedFiles.map((f) => (
              <li key={f.filename}>
                <span className="font-mono">{f.filename}</span> — {f.rows.toLocaleString()} records ·{" "}
                {f.repairs.join("; ") || "structural fixes"}
              </li>
            ))}
          </ul>
        </div>
      )}


      {invalidFiles.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-xs">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" /> {invalidFiles.length} file(s) could not be parsed
          </p>
          <ul className="mt-2 space-y-2">
            {invalidFiles.map((f) => (
              <li key={f.filename}>
                <span className="font-mono">{f.filename}</span>
                {f.line ? ` — line ${f.line}, column ${f.column}` : ""}: {f.reason}
                {f.snippet && <div className="mt-1 font-mono text-muted-foreground">near: {f.snippet}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Post-import data validation report. */
export function ImportReportCard({ report }: { report: ImportReport }) {
  const n = report.normalized;
  const j = report.joins;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-base font-semibold">Data Validation Report</h2>
        <p className="text-xs text-muted-foreground">
          Generated {new Date(report.at).toLocaleString()} · {report.filesProcessed} file(s) ·{" "}
          {(report.bytesProcessed / 1024 / 1024).toFixed(1)} MB · {report.durationMs.toLocaleString()} ms ·{" "}
          {report.totalRecords.toLocaleString()} records
        </p>
      </div>

      {/* Record counts per dataset */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Dataset</th>
              <th className="px-2 py-1.5 font-semibold">File(s)</th>
              <th className="px-2 py-1.5 text-right font-semibold">Records</th>
              <th className="px-2 py-1.5 font-semibold">Fields with missing values</th>
            </tr>
          </thead>
          <tbody>
            {report.datasets.map((d) => (
              <tr key={d.key} className="border-b border-border/60 align-top">
                <td className="px-2 py-1.5 font-medium">{d.label}</td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{d.files.join(", ") || "—"}</td>
                <td className="px-2 py-1.5 text-right">{d.records.toLocaleString()}</td>
                <td className="px-2 py-1.5">
                  {d.fields.length === 0 ? (
                    <span className="text-success">All checked fields complete</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {d.fields
                        .slice(0, 6)
                        .map(
                          (f) =>
                            `${f.field} (${f.missing.toLocaleString()} / ${((f.missing / Math.max(1, f.total)) * 100).toFixed(1)}%)`,
                        )
                        .join(" · ")}
                      {d.fields.length > 6 ? ` · +${d.fields.length - 6} more` : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Normalization + joins */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Values normalized during load
          </p>
          <ul className="space-y-1 text-xs">
            <li>NULL / N/A / blank values normalized: <b>{n.nulls.toLocaleString()}</b></li>
            <li>Whitespace trimmed: <b>{n.trimmedStrings.toLocaleString()}</b></li>
            <li>Employment status corrected (e.g. “Umployed” → “Unemployed”): <b>{n.employmentStatus.toLocaleString()}</b></li>
            <li>Underemployment status corrected: <b>{n.underemploymentStatus.toLocaleString()}</b></li>
          </ul>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Record integrity
          </p>
          <ul className="space-y-1 text-xs">
            <li>Persons with no matching household: <b className={j.personsWithoutHousehold ? "text-warning" : ""}>{j.personsWithoutHousehold.toLocaleString()}</b></li>
            <li>Households with no person records: <b className={j.householdsWithoutPersons ? "text-warning" : ""}>{j.householdsWithoutPersons.toLocaleString()}</b></li>
            <li>Persons missing a first/last name: <b>{j.personsMissingName.toLocaleString()}</b></li>
            <li>Persons missing age: <b>{j.personsMissingAge.toLocaleString()}</b></li>
            <li>Duplicate person keys: <b>{j.duplicatePersonKeys.toLocaleString()}</b></li>
          </ul>
        </div>
      </div>

      {report.unrecognizedFiles.length > 0 && (
        <p className="text-xs text-warning">
          Unrecognized file name(s), not loaded: {report.unrecognizedFiles.join(", ")}
        </p>
      )}
    </div>
  );
}
