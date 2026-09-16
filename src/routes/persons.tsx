import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileArchive, Search, X } from "lucide-react";
import { smartQuery, extractNameTokens } from "@/lib/cbms-query";
import { getEnrichedPersons } from "@/lib/cbms-recognition";
import { exportCSV, exportDOCX, exportPDF, exportXLSX, printPayload } from "@/lib/cbms-export";


function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!text) return <>—</>;
  const escaped = tokens.filter((t) => t && t.length >= 2).map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"));
  if (!escaped.length) return <>{text}</>;
  // Match token + rest of the word so "del" highlights the whole "Dela".
  const re = new RegExp(`((?:${escaped.join("|")})[A-Za-zÑñ'-]*)`, "ig");
  const parts = text.split(re);
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const isMatch = (p: string) => {
    const lp = p.toLowerCase();
    return lowerTokens.some((t) => lp === t || lp.startsWith(t));
  };
  return (
    <>
      {parts.map((part, i) =>
        part && isMatch(part)
          ? <mark key={i} className="rounded bg-yellow-200 px-0.5 font-semibold text-foreground dark:bg-yellow-500/40">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}
import { DataTable } from "@/components/DataTable";
import { PersonModal } from "@/components/CBMSModals";

const schema = z.object({ q: z.string().catch("").default("") });

export const Route = createFileRoute("/persons")({
  validateSearch: schema,
  component: PersonsPage,
});

function PersonsPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [showSugg, setShowSugg] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  // Debounce live typing → recompute results without form submit
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 180);
    return () => clearTimeout(t);
  }, [text]);

  // Keep URL in sync (debounced) so the search is shareable / bookmarkable.
  // Wrapped in a microtask so unrelated interactions (like opening the modal)
  // don't get blocked by a router navigation on the same tick.
  useEffect(() => {
    if (debounced !== q) queueMicrotask(() => navigate({ search: { q: debounced }, replace: true }));
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => smartQuery(debounced), [debounced]);
  const hlTokens = useMemo(() => extractNameTokens(debounced), [debounced]);

  // Top suggestions for quick name-jump (first 8 ranked matches)
  const suggestions = useMemo(() => {
    if (!text.trim() || text.trim().length < 2) return [];
    return result.rows.slice(0, 8);
  }, [text, result.rows]);

  // Stable handlers so DataTable / row clicks don't cause cascading re-renders
  // that used to make the person modal feel sluggish (~8s on slower machines).
  const openPerson = useCallback((p: any) => setSelected(p), []);
  const closePerson = useCallback(() => setSelected(null), []);

  // Full-basic-details export payload (used by the three export buttons).
  const allPersonsPayload = useMemo(() => {
    const rows = getEnrichedPersons().slice().sort((a, b) => {
      const ba = String(a.area_name || "").localeCompare(String(b.area_name || ""));
      if (ba !== 0) return ba;
      return String(a._full_name || "").localeCompare(String(b._full_name || ""));
    });
    const columns = [
      { key: "_full_name", label: "Full Name" },
      { key: "a05_age", label: "Age" },
      { key: "a03_sex", label: "Sex" },
      { key: "a07_marital_status", label: "Civil Status" },
      { key: "area_name", label: "Barangay" },
      { key: "_purok", label: "Purok / Sitio" },
      { key: "_address", label: "Address" },
      { key: "_hh_head", label: "Household Head" },
      { key: "a02_relation_to_hh_head", label: "Relation" },
      { key: "a11_hgc_level", label: "Education Level" },
      { key: "e01_employment_status", label: "Employment" },
      { key: "e05_occupation_group", label: "Occupation" },
      { key: "b10_pwd", label: "PWD" },
      { key: "b05_solo_parent", label: "Solo Parent" },
      { key: "husn", label: "HUSN" },
      { key: "hsn", label: "HSN" },
      { key: "line_number", label: "Line #" },
    ];
    const bySex = rows.reduce<Record<string, number>>((a, p) => {
      const k = p.a03_sex || "Unspecified"; a[k] = (a[k] || 0) + 1; return a;
    }, {});
    const summary = [
      { label: "Total Persons", value: rows.length },
      { label: "Male", value: bySex.Male || 0 },
      { label: "Female", value: bySex.Female || 0 },
      { label: "Household Heads", value: rows.filter((p) => p.a02_relation_to_hh_head === "Head" || p.line_number === 1).length },
    ];
    return {
      title: "All Persons Basic Details",
      subtitle: `Complete personal roster (${rows.length.toLocaleString()} records)`,
      columns, rows, summary,
    };
  }, []);



  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Person Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live search — type a <strong>full name</strong>, a sector, age range, or community indicator.
          Results update as you type. Examples: <em>"Juan Dela Cruz"</em>, <em>"senior citizens"</em>,{" "}
          <em>"0-5 years old"</em>, <em>"PWD seniors"</em>, <em>"low income Poblacion"</em>.
        </p>
      </div>

      <div className="relative">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={text}
              onChange={(e) => { setText(e.target.value); setShowSugg(true); }}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowSugg(false); setText(""); } }}
              placeholder="Search persons by name, sector, age, sex, barangay…"
              className="h-11 pl-9 pr-9 text-base"
              autoComplete="off"
            />
            {text && (
              <button
                type="button"
                onClick={() => setText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="button" onClick={() => setShowSugg(false)} className="h-11 px-6">Search</Button>
        </div>

        {showSugg && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-popover shadow-lg sm:right-[6.5rem]">
            <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top {suggestions.length} match{suggestions.length === 1 ? "" : "es"} · {result.rows.length.toLocaleString()} total
            </div>
            {suggestions.map((p, i) => (
              <button
                key={`${p.area_code}-${p.husn}-${p.hsn}-${p.line_number}-${i}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); openPerson(p); setShowSugg(false); }}
                className="flex w-full items-start gap-3 border-b border-border/40 px-3 py-2 text-left text-sm transition hover:bg-muted/70"
              >
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {p._full_name ? <Highlight text={p._full_name} tokens={hlTokens} /> : "(no name)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.a03_sex || "—"} · Age {p.a05_age ?? "—"} ·{" "}
                    <Highlight text={p.area_name || "—"} tokens={hlTokens} />
                    {p._purok ? <> · <Highlight text={p._purok} tokens={hlTokens} /></> : ""}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">HUSN {p.husn ?? "—"}</div>
              </button>
            ))}
          </div>
        )}
      </div>




      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <FileArchive className="h-4 w-4 text-primary" /> Export Every Person — Basic Details
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete personal roster with full name, age, sex, civil status, barangay, purok, address,
              household head, education, employment, and sector flags. Delivered inside an AES-256
              password-protected ZIP; password is stored in the <a href="/export-log" className="underline">Export Log</a>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => exportCSV(allPersonsPayload)}>All Persons · CSV</Button>
            <Button size="sm" variant="outline" onClick={() => exportXLSX(allPersonsPayload)}>All Persons · Excel</Button>
            <Button size="sm" variant="outline" onClick={() => exportPDF(allPersonsPayload)}>All Persons · PDF</Button><Button size="sm" variant="outline" onClick={() => exportDOCX(allPersonsPayload)}>All Persons · Word</Button><Button size="sm" variant="outline" onClick={() => printPayload(allPersonsPayload)}>All Persons · Print</Button>
          </div>
        </div>
      </div>

      <DataTable
        title={result.title}
        subtitle={result.subtitle}
        rows={result.rows}
        columns={result.columns}
        onRowClick={openPerson}
        emptyText="No matching persons. Try a different name or keyword."
      />

      <PersonModal person={selected} onClose={closePerson} />

    </div>
  );
}
