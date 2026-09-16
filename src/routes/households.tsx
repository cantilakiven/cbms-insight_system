import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import { getActiveYear, getAvailableBarangays, getDataVersion, getYearDatasets, getPersonFullName, householdKey, subscribeData, getHouseholdIncome } from "@/data/cbms";
import { DataTable } from "@/components/DataTable";
import { HouseholdModal } from "@/components/CBMSModals";
import { isUnderThreeMeals, getMealFrequency } from "@/lib/food-frequency";
import { Search, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/households")({
  component: HouseholdsPage,
});

const yes = (v: any) => v === "Yes" || v === "YES" || v === 1 || v === "1" || v === true;
const is4Ps = (h: any) => [h?.m05_a_4ps, h?.m06_a_benefit_4ps, h?.fourps, h?.four_ps].some(yes);

function matchesHouseholdSearch(h: any, query: string) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return [h._head_name, h.husn, h.area_name, h.address_sitio_purok, h._meal_frequency]
    .some((v) => String(v ?? "").toLowerCase().includes(needle));
}

const FILTERS = [
  { key: "all", label: "All", fn: (_h: any) => true },
  { key: "fourps", label: "4Ps", fn: is4Ps },
  { key: "low_income", label: "Income < ₱20k", fn: (h: any) => { const n = getHouseholdIncome(h); return n !== null && n < 20000; } },
  { key: "under3", label: "Food <3 meals/day", fn: isUnderThreeMeals },
  { key: "overcrowded", label: "Overcrowded", fn: (h: any) => /overcrowded/i.test(String(h.overcrowding_status ?? "")) },
  { key: "no_elec", label: "No electricity", fn: (h: any) => String(h.o11_electricity ?? "").toLowerCase() === "no" },
  { key: "no_internet", label: "No internet", fn: (h: any) => !yes(h.k01_internet_access) },
  { key: "wood_cook", label: "Wood cooking", fn: (h: any) => /wood/i.test(String(h.o13_fuel_for_cooking ?? "")) },
  { key: "no_toilet", label: "Unimproved toilet", fn: (h: any) => /unimproved|no facility|none/i.test(String(h.n08_toilet_facility ?? h.n08_service_level_toilet_facility ?? "")) },
] as const;

type FilterKey = typeof FILTERS[number]["key"];

function HouseholdsPage() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const year = getActiveYear();
  const ds = getYearDatasets(year);
  const barangayOptions = getAvailableBarangays(year);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [brgy, setBrgy] = useState<string>("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const headByHousehold = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of ds.persons) {
      const key = householdKey(p);
      const head = p?.a02_relation_to_hh_head === "Head" || Number(p?.line_number) === 1;
      if (head || !map.has(key)) map.set(key, p);
    }
    return map;
  }, [ds.persons, year]);

  const decorated = useMemo(() => ds.households.map((h: any) => {
    const head = headByHousehold.get(householdKey(h));
    const info = getMealFrequency(h);
    return {
      ...h,
      _head_name: head ? (getPersonFullName(head) || "Not Stated") : "Not Stated",
      _meal_frequency: info.label,
    };
  }), [ds.households, headByHousehold]);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return decorated
      .filter((h) => (!brgy || h.area_name === brgy) && f.fn(h) && matchesHouseholdSearch(h, q))
      .slice()
      .sort((a, b) => {
        const barangay = String(a.area_name || "").localeCompare(String(b.area_name || ""), undefined, { sensitivity: "base" });
        if (barangay !== 0) return barangay;
        const head = String(a._head_name || "Not Stated").localeCompare(String(b._head_name || "Not Stated"), undefined, { sensitivity: "base" });
        if (head !== 0) return head;
        return String(a.husn ?? "").localeCompare(String(b.husn ?? ""), undefined, { numeric: true });
      });
  }, [decorated, filter, brgy, q]);

  const counts = useMemo(() => {
    const base = decorated.filter((h) => !brgy || h.area_name === brgy).filter((h) => matchesHouseholdSearch(h, q));
    return Object.fromEntries(FILTERS.map((f) => [f.key, base.filter(f.fn).length])) as Record<FilterKey, number>;
  }, [decorated, brgy, q]);

  const barangayGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const name = String(row.area_name || "Not Stated");
      const bucket = groups.get(name) || [];
      bucket.push(row);
      groups.set(name, bucket);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rows]);

  const cols = [
    { key: "_head_name", label: "Household Head" },
    { key: "husn", label: "HUSN" },
    { key: "area_name", label: "Barangay" },
    { key: "address_sitio_purok", label: "Sitio/Purok" },
    { key: "hh_size", label: "Size" },
    { key: "number_of_males", label: "M" },
    { key: "number_of_females", label: "F" },
    { key: "overcrowding_status", label: "Overcrowding" },
    { key: "o11_electricity", label: "Electricity" },
    { key: "k01_internet_access", label: "Internet" },
    { key: "o13_fuel_for_cooking", label: "Cooking Fuel" },
    { key: "n08_service_level_toilet_facility", label: "Toilet" },
  ];

  const activeLabel = FILTERS.find((x) => x.key === filter)?.label || "All";
  const title = `Households by Barangay${brgy ? ` · ${brgy}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Households</h1>
        <p className="mt-1 text-sm text-muted-foreground">CBMS {year} · Households are arranged by Barangay A–Z, then household head A–Z. Search, filter, and click a row for the complete household record.</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search head name, HUSN, barangay…" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-primary" />
          </div>
          <select value={brgy} onChange={(e) => setBrgy(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">All barangays</option>
            {barangayOptions.map((b: any) => <option key={b.area_code || b.area_name} value={b.area_name}>{b.area_name}</option>)}
          </select>
          {(q || brgy || filter !== "all") && (
            <button type="button" onClick={() => { setQ(""); setBrgy(""); setFilter("all"); }} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
              <RotateCcw className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>
              {f.label} <span className={filter === f.key ? "opacity-80" : "opacity-60"}>({(counts[f.key] || 0).toLocaleString()})</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] print:hidden">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Barangay Household Directory</h2>
            <p className="text-xs text-muted-foreground">Formal index arranged alphabetically from A–Z.</p>
          </div>
          <div className="text-xs font-semibold text-muted-foreground">{barangayGroups.length} barangay(s)</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {barangayGroups.map(([name, group]) => (
            <button
              key={name}
              type="button"
              onClick={() => setBrgy(name === "Not Stated" ? "" : name)}
              className={`rounded-xl border px-3 py-2.5 text-left transition hover:bg-muted ${brgy === name ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            >
              <div className="font-semibold text-foreground">{name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{group.length.toLocaleString()} household record(s)</div>
            </button>
          ))}
        </div>
      </section>

      <DataTable title={title} subtitle={`${rows.length.toLocaleString()} matching household record(s) · sorted Barangay A–Z, household head A–Z · ${ds.households.length.toLocaleString()} total in CBMS ${year}`} rows={rows} columns={cols} onRowClick={(r) => setSelected(r)} />

      <HouseholdModal household={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
