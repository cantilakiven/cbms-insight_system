import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import { getActiveYear, getAvailableBarangays, getDataVersion, getYearDatasets, municipality, subscribeData } from "@/data/cbms";
import { MapPin, Printer, FileSpreadsheet, FileText, FileType2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportDOCX, exportPDF, exportXLSX, printPayload } from "@/lib/cbms-export";


export const Route = createFileRoute("/barangays")({
  component: BarangaysPage,
});

function BarangaysPage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const year = getActiveYear();
  const datasets = getYearDatasets(year);
  const barangays = getAvailableBarangays(year);
  const stats = useMemo(() => {
    const isYes = (v: any) => v === "Yes" || v === "YES" || v === 1 || v === "1" || v === true;
    const is4PsHousehold = (h: any) => [h?.m05_a_4ps, h?.m06_a_benefit_4ps, h?.fourps, h?.four_ps].some(isYes);
    return barangays.slice().sort((a, b) => String(a.area_name || "").localeCompare(String(b.area_name || ""))).map((b) => {
      const persons = datasets.persons.filter((p) => p.area_code === b.area_code);
      const households = datasets.households.filter((h) => h.area_code === b.area_code);
      return {
        ...b,
        persons: persons.length,
        households: households.length,
        male: persons.filter((p) => p.a03_sex === "Male").length,
        female: persons.filter((p) => p.a03_sex === "Female").length,
        children: persons.filter((p) => typeof p.a05_age === "number" && p.a05_age <= 17).length,
        seniors: persons.filter((p) => typeof p.a05_age === "number" && p.a05_age >= 60).length,
        pwd: persons.filter((p) => p.b10_pwd === "Yes").length,
        fourPs: households.filter(is4PsHousehold).length,
        farmers: persons.filter((p) => p.e17_farmer === "Yes").length,
        noElec: households.filter((h) => h.o11_electricity === "No").length,
        overcrowded: households.filter((h) => h.overcrowding_status === "Overcrowded").length,
      };
    });
  }, [version, year, barangays.length, datasets.persons.length, datasets.households.length]);

  const totals = stats.reduce(
    (acc, b) => ({
      persons: acc.persons + b.persons,
      households: acc.households + b.households,
      male: acc.male + b.male,
      female: acc.female + b.female,
      children: acc.children + b.children,
      seniors: acc.seniors + b.seniors,
      pwd: acc.pwd + b.pwd,
      fourPs: acc.fourPs + b.fourPs,
      farmers: acc.farmers + b.farmers,
      noElec: acc.noElec + b.noElec,
      overcrowded: acc.overcrowded + b.overcrowded,
    }),
    { persons: 0, households: 0, male: 0, female: 0, children: 0, seniors: 0, pwd: 0, fourPs: 0, farmers: 0, noElec: 0, overcrowded: 0 },
  );

  const columns = [
    { key: "area_name", label: "Barangay" },
    { key: "persons", label: "Population" },
    { key: "households", label: "Households" },
    { key: "male", label: "Male" },
    { key: "female", label: "Female" },
    { key: "children", label: "Children 0–17" },
    { key: "seniors", label: "Seniors 60+" },
    { key: "pwd", label: "PWD" },
    { key: "fourPs", label: "4Ps HH" },
    { key: "farmers", label: "Farmers" },
    { key: "noElec", label: "No Elec." },
    { key: "overcrowded", label: "Overcrowded HH" },
  ];

  const exportRows = [
    ...stats.map((s) => Object.fromEntries(columns.map((c) => [c.key, (s as any)[c.key]]))),
    { area_name: "TOTAL", ...totals },
  ];

  const payload = {
    title: `Barangay Population & Household Summary — ${municipality}`,
    subtitle: `${barangays.length} barangays · ${totals.persons.toLocaleString()} persons · ${totals.households.toLocaleString()} households`,
    columns,
    rows: exportRows,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Barangay Profiles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CBMS {year} · {barangays.length} barangays · {totals.persons.toLocaleString()} persons · {totals.households.toLocaleString()} households.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => printPayload(payload)}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(payload)}>
            <FileText className="mr-1.5 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportXLSX(payload)}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDOCX(payload)}>
            <FileType2 className="mr-1.5 h-4 w-4" /> Word
          </Button>
        </div>
      </div>

      {/* Printable summary table */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] print:border-0 print:bg-transparent print:p-0 print:shadow-none">
        <div className="mb-3 hidden print:block">
          <h2 className="text-lg font-bold">{payload.title}</h2>
          <p className="text-xs text-muted-foreground">{payload.subtitle}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-2 font-semibold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.area_code} className="border-b border-border/60 hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-2 py-1.5 ${c.key === "area_name" ? "font-medium" : "tabular-nums"}`}>
                      {c.key === "area_name" ? (s as any)[c.key] : ((s as any)[c.key] || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-foreground bg-muted/40 font-bold">
                <td className="px-2 py-2">TOTAL</td>
                {columns.slice(1).map((c) => (
                  <td key={c.key} className="px-2 py-2 tabular-nums">
                    {(totals as any)[c.key].toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Source: CBMS {year} · Philippine Statistics Authority.
        </p>
      </section>

      {/* Card grid (hidden when printing) */}
      <div className="grid gap-4 print:hidden sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((b) => (
          <div key={b.area_code} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-elevated)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold leading-tight">{b.area_name}</h3>
                <p className="text-xs text-muted-foreground">{b.area_code}</p>
              </div>
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <MapPin className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Population" value={b.persons} />
              <Stat label="Households" value={b.households} />
              <Stat label="Seniors" value={b.seniors} />
              <Stat label="PWD" value={b.pwd} />
              <Stat label="4Ps HH" value={b.fourPs} />
              <Stat label="Farmers" value={b.farmers} />
              <Stat label="Overcrowded" value={b.overcrowded} tone="destructive" />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/persons" search={{ q: b.area_name }} className="flex-1 rounded-md bg-secondary py-1.5 text-center text-xs font-medium hover:bg-muted">
                View Persons
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const cls = tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <div className={`font-bold ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
