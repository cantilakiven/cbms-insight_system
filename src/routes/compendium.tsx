import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BookOpen, Printer, FileDown, CalendarRange, CalendarCheck2, ListOrdered, ChevronDown, FileText, FileType2, MousePointerClick, CheckSquare, Square, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  getActiveBarangay,
  getAvailableBarangays,
  getAvailableYears,
  getDataVersion,
  getYearDatasets,
  subscribeData,
  type DataYear,
} from "@/data/cbms";
import {
  SECTION_CATALOG,
  buildBook,
  downloadBookHtml,
  downloadBookPdf,
  downloadBookWord,
  printBook,
  type BookSectionId,
} from "@/lib/cbms-compendium";
import { exportCSV, exportXLSX } from "@/lib/cbms-export";

export const Route = createFileRoute("/compendium")({ component: CompendiumPage });

function CompendiumPage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const years = getAvailableYears();
  const [year, setYear] = useState<DataYear>(years[0] ?? 2024);
  const [barangay, setBarangay] = useState<string>(getActiveBarangay());
  const [selected, setSelected] = useState<BookSectionId[]>(SECTION_CATALOG.map((s) => s.id));
  const [includeNames, setIncludeNames] = useState(true);


  const ds = getYearDatasets(year);
  const barangayOptions = getAvailableBarangays(year);
  const [book, setBook] = useState<ReturnType<typeof buildBook> | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildPhase, setBuildPhase] = useState("Preparing CBMS report");

  useEffect(() => {
    let alive = true;
    setBook(null);
    setBuilding(true);
    setBuildPhase("Preparing CBMS report");
    const phaseTimer = window.setInterval(() => {
      setBuildPhase((current) => current === "Preparing CBMS report" ? "Calculating CBMS tables" : current === "Calculating CBMS tables" ? "Building comparative graphs" : current === "Building comparative graphs" ? "Assembling the report book" : "Preparing CBMS report");
    }, 700);
    const run = () => {
      if (!alive) return;
      const next = buildBook({ year, barangay, sections: selected, includeNameLists: includeNames });
      if (alive) { setBook(next); setBuilding(false); setBuildPhase("Compendium ready"); }
    };
    const ric = (window as any).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 900 }) : window.setTimeout(run, 60);
    return () => { alive = false; window.clearInterval(phaseTimer); if (ric) (window as any).cancelIdleCallback?.(id); else window.clearTimeout(id); };
  }, [year, barangay, selected, includeNames, ds.persons.length, ds.households.length, version]);

  const tableCount = book?.sections.reduce((n, s) => n + s.tables.length, 0) ?? 0;
  const rowCount = book?.sections.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows.length, 0), 0) ?? 0;

  const toggle = (id: BookSectionId) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const run = async (fn: () => void | Promise<void>) => {
    setBuilding(true);
    try { await fn(); } finally { setBuilding(false); }
  };

  const downloadAllExcel = () => { if (!book) return; return run(async () => {
      for (const section of book.sections) {
        for (const table of section.tables) {
          await exportXLSX({
            title: table.title,
            subtitle: `${book.subtitle} · ${section.title}`,
            columns: table.columns,
            rows: table.rows,
            note: table.note,
            dataYear: year,
          });
        }
      }
    }); }

  const downloadAllCsv = () => { if (!book) return; return run(async () => {
      for (const section of book.sections) {
        for (const table of section.tables) {
          await exportCSV({ title: table.title, columns: table.columns, rows: table.rows, note: table.note, dataYear: year });
        }
      }
    }); }

  if (!book) {
    return <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/.12),transparent_38%)]" />
        <div className="relative flex flex-col items-center text-center sm:flex-row sm:text-left">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-sm">
            <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/10" />
            <LoaderCircle className="relative h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="mt-4 sm:ml-5 sm:mt-0">
            <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary sm:justify-start"><ShieldCheck className="h-3.5 w-3.5" /> Secure report preparation</div>
            <h1 className="mt-1 font-display text-2xl font-black">Preparing Report Compendium</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">The report engine is preparing the selected CBMS year without blocking the rest of the application.</p>
          </div>
        </div>
        <div className="relative mt-7 overflow-hidden rounded-full bg-muted h-2.5">
          <div className="h-full w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
        <div className="relative mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{buildPhase}</span><span className="font-mono">CBMS {year}</span></div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
          {['Core reports','Sector tables','Comparative graphs'].map((label,i)=><div key={label} className="rounded-xl border border-border bg-muted/25 p-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${i===0?'animate-pulse bg-emerald-500':i===1?'animate-pulse bg-amber-500':'animate-pulse bg-primary'}`}/><span className="text-xs font-bold">{label}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-3/5 animate-pulse rounded-full bg-primary/50" /></div></div>)}
        </div>
      </section>
    </div>;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              <BookOpen className="h-4 w-4" /> Downloadable report book
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold">Report Compendium</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              One complete document that gathers the dashboard indicators, demographics, barangay profiles, sector
              counts by barangay and every statistical report for a single CBMS year. The sector chapter includes
              the household-head list for households explicitly identified as eating less than 3 meals a day.
              Exported PDF/Word files are AES-256 protected and the HTML file has its own AES-256-GCM password gate.
            </p>
          </div>
          <div className="flex rounded-xl bg-muted p-1" aria-label="Compendium year">
            {[2022, 2024].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y as DataYear)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${year === y ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {y === 2022 ? <CalendarRange className="h-4 w-4" /> : <CalendarCheck2 className="h-4 w-4" />}
                CBMS {y}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Coverage
            <select
              value={barangay}
              onChange={(e) => setBarangay(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground"
            >
              <option value="">All barangays (area-wide)</option>
              {barangayOptions.map((b: any) => (
                <option key={b.area_code || b.area_name} value={b.area_name}>{b.area_name}</option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="font-bold uppercase tracking-wide text-muted-foreground">This book contains</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {book.sections.length} parts · {tableCount} tables · {rowCount.toLocaleString()} rows
            </div>
            <div className="mt-1 text-muted-foreground">
              CBMS {year}: {ds.persons.length.toLocaleString()} persons · {ds.households.length.toLocaleString()} households
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-bold uppercase tracking-wide text-muted-foreground">Include complete sector rosters</span>
              <span className="mt-1 block text-muted-foreground">
                Adds the complete sector rosters. Every sector gets a Summary table, a By Barangay Summary table, and
                one detailed table per barangay with Full Name, Sex, Age, Status, and the relevant sector ID/status field.
              </span>
            </span>
          </label>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-lg font-bold">Build your book</h2>
              <p className="text-xs text-muted-foreground">Use the dropdown groups for long report categories. Detailed rosters are enabled by default.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(SECTION_CATALOG.map((s) => s.id))} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"><CheckSquare className="h-4 w-4" /> Select all</button>
            <button type="button" onClick={() => setSelected([])} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"><Square className="h-4 w-4" /> Clear</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["Core CBMS reports", SECTION_CATALOG.slice(0, 3)],
            ["Sector & statistical reports", SECTION_CATALOG.slice(3)],
          ].map(([group, items]) => (
            <details key={String(group)} open className="group overflow-hidden rounded-xl border border-border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />{String(group)}</span>
                <span className="text-xs font-semibold text-muted-foreground">{(items as any[]).filter((x) => selected.includes(x.id)).length}/{(items as any[]).length} selected</span>
              </summary>
              <div className="divide-y divide-border">
                {(items as any[]).map((item) => {
                  const checked = selected.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(item.id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${checked ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{checked ? "✓" : ""}</span>
                      <span className="min-w-0"><span className="block text-sm font-bold">{item.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4 text-primary" /> Include complete sector rosters and household-income names</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Adds Summary, Summary by Barangay, and A-Z detailed name tables for every sector. It also adds the 2022/2024 Household Income Below ₱20,000 report, household-head names, and persons living in qualifying households.</span>
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold"><FileDown className="h-4 w-4 text-primary" /> Generate Compendium</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button disabled={!selected.length || building} onClick={() => run(() => downloadBookHtml(book))} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"><FileText className="h-4 w-4" /> HTML · AES-256</button>
          <button disabled={!selected.length || building} onClick={() => run(() => downloadBookPdf(book))} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-bold transition hover:bg-muted disabled:opacity-50"><FileDown className="h-4 w-4" /> PDF · AES-256</button>
          <button disabled={!selected.length || building} onClick={() => run(() => downloadBookWord(book))} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-bold transition hover:bg-muted disabled:opacity-50"><FileType2 className="h-4 w-4" /> Word · AES-256</button>
          <button disabled={!selected.length || building} onClick={() => printBook(book)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-bold transition hover:bg-muted disabled:opacity-50"><Printer className="h-4 w-4" /> Print / Save as PDF</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3 text-xs"><span className="font-bold">HTML:</span> AES-256-GCM password gate; 3 wrong attempts triggers a 5-hour lockout.</div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs"><span className="font-bold">PDF:</span> AES-256 protected ZIP containing the complete clickable-TOC PDF.</div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs"><span className="font-bold">Word:</span> AES-256 protected ZIP containing the complete Word compendium.</div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-4 w-4" /> {building ? "Generating your compendium… please wait." : `Ready: ${book.sections.length} parts · ${tableCount} tables · ${rowCount.toLocaleString()} rows`}</div>
        {building && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 animate-pulse rounded-full bg-primary" /></div>}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground"><span className="font-bold text-foreground">Table of contents preview:</span> the generated HTML, PDF and Word files use the same hierarchical Part → Category → Summary / By Barangay → Detail structure.</div>
        {book.sections.map((s, si) => (
          <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Part {si + 1}</div>
            <h3 className="font-display text-lg font-bold">{s.title}</h3>
            {s.intro && <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.intro}</p>}
            <ul className="mt-3 divide-y divide-border text-sm">
              {s.tables.map((t, ti) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="mr-2 text-xs font-bold text-muted-foreground">{si + 1}.{ti + 1}</span>
                    {t.title}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{t.rows.length.toLocaleString()} rows</span>
                    <button
                      onClick={() => run(() => exportXLSX({ title: t.title, subtitle: book.subtitle, columns: t.columns, rows: t.rows, note: t.note, dataYear: year }))}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold transition hover:bg-muted"
                    >
                      Excel
                    </button>
                    <button
                      onClick={() => run(() => exportCSV({ title: t.title, columns: t.columns, rows: t.rows, note: t.note, dataYear: year }))}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold transition hover:bg-muted"
                    >
                      CSV
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <footer className="border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
        Source: AUTHORIZED CBMS DATA
      </footer>
    </div>
  );
}
