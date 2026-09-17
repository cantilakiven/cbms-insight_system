import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileBarChart,
  HeartHandshake,
  Home,
  MapPin,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  getActiveBarangay,
  getActiveYear,
  getAvailableBarangays,
  getDataVersion,
  getYearDatasets,
  getYearIncomeSummary,
  getSourceWatermark,
  subscribeData,
} from "@/data/cbms";

export const Route = createFileRoute("/")({ component: Dashboard });

const pct = (n: number, d: number) => d ? `${(n / d * 100).toFixed(1)}%` : "N/A";

function Dashboard() {
  const version = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  void version;
  const year = getActiveYear();
  const brgy = getActiveBarangay();
  const ds = getYearDatasets(year);
  const income = useMemo(() => getYearIncomeSummary(year), [year, ds.households.length, ds.persons.length]);
  const persons = useMemo(() => ds.persons.filter((p) => !brgy || p.area_name === brgy), [ds.persons, brgy]);
  const households = useMemo(() => ds.households.filter((h) => !brgy || h.area_name === brgy), [ds.households, brgy]);
  const barangayCount = getAvailableBarangays(year).length;
  const male = persons.filter((p) => p.a03_sex === "Male").length;
  const female = persons.filter((p) => p.a03_sex === "Female").length;
  const lowIncome = households.filter((h) => Number.isFinite(Number(h.h06_total_family_income)) && Number(h.h06_total_family_income) < 20000).length;
  const averageHouseholdSize = households.length ? households.reduce((s, h) => s + Number(h.hh_size || 0), 0) / households.length : 0;

  const metrics = [
    { label: "Population", value: persons.length, sub: `${male.toLocaleString()} male · ${female.toLocaleString()} female`, icon: Users },
    { label: "Households", value: households.length, sub: `${averageHouseholdSize ? averageHouseholdSize.toFixed(1) : "N/A"} average members`, icon: Home },
    { label: "Low-income households", value: lowIncome, sub: `${pct(lowIncome, households.filter(h => Number.isFinite(Number(h.h06_total_family_income))).length)} of reported income`, icon: WalletCards },
    { label: "Barangays", value: barangayCount, sub: brgy ? `Filtered to ${brgy}` : "Area-wide", icon: MapPin },
  ];

  const actions = [
    { title: "Compare 2022 & 2024", description: "Review changes across both CBMS years in one workspace.", to: "/comparative", icon: BarChart3 },
    { title: "Generate reports", description: "Open statistical reports for either 2022 or 2024.", to: "/reports", icon: FileBarChart },
    { title: "Validate the data", description: "Check completeness and export consistency before reporting.", to: "/validation", icon: ShieldCheck },
    { title: "Explore sectors", description: "Open community rosters for priority sectors and programs.", to: "/sectors", icon: HeartHandshake },
  ];

  return (
    <div className="dashboard-page space-y-5">
      <section className="dashboard-hero-compact overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="dashboard-hero-copy">
          <div className="dashboard-eyebrow">
            <span className="dashboard-status-dot" />
            Community Data & Insights
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="dashboard-chip">Selected Local Area</span>
            <span className="dashboard-chip">CBMS {year}</span>
            <span className="dashboard-chip">{getSourceWatermark(year)}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight text-foreground md:text-[2.6rem]">
            Community-Based Monitoring System
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Community data for planning, reporting, analysis and evidence-based decision-making.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link to="/comparative" className="dashboard-primary-action">
              <BarChart3 className="h-4 w-4" /> Compare 2022 & 2024
            </Link>
            <Link to="/reports" className="dashboard-secondary-action">
              <FileBarChart className="h-4 w-4" /> View reports
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-photo-wrap dashboard-hero-visual">
          <div className="dashboard-visual-grid" />
          <div className="dashboard-visual-glow dashboard-visual-glow-a" />
          <div className="dashboard-visual-glow dashboard-visual-glow-b" />
          {/* <div className="dashboard-visual-card">
            <img src="/cbms-insights-logo.png" alt="CBMS Insights" className="h-20 w-20 rounded-2xl bg-white/95 p-2 shadow-2xl" />
            <div className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/70">CBMS Insights</div>
            <div className="mt-1 text-lg font-black text-white">Data → Insight → Action</div>
            <div className="mt-1 text-xs leading-5 text-white/70">Analyze authorized CBMS datasets with a local-first, privacy-conscious workflow.</div>
          </div> */}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="dashboard-metric rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">{m.label}</div>
                <span className="dashboard-metric-icon"><Icon className="h-4 w-4" /></span>
              </div>
              <div className="mt-2 text-[1.65rem] font-black tracking-tight sm:text-2xl">{m.value.toLocaleString()}</div>
              <div className="mt-1 text-[10px] leading-4 text-muted-foreground">{m.sub}</div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <div className="dashboard-panel rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-section-label">Quick access</p>
              <h2 className="mt-1 text-lg font-black">Common data tasks</h2>
            </div>
            <span className="dashboard-head-note">Selected year: {year}</span>
          </div>
          <div className="mt-4 grid gap-2.5 md:grid-cols-2">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} to={item.to} className="dashboard-action-card group">
                  <span className="dashboard-action-icon"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-bold">
                      {item.title}
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                    </span>
                    <span className="mt-1 block text-[11px] leading-4.5 text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="dashboard-panel rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          <p className="dashboard-section-label">Income snapshot</p>
          <h2 className="mt-1 text-lg font-black">Household income indicators</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Reported total family income for CBMS {year}.</p>
          <div className="mt-5 space-y-4">
            <IncomeLine label="Below ₱15,000" value={income.below15} total={income.reportedHouseholds} tone="warning" />
            <IncomeLine label="Below ₱20,000" value={income.below20} total={income.reportedHouseholds} tone="success" />
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/35 p-3 text-[10px] leading-4.5 text-muted-foreground">
            <strong className="text-foreground">Data note:</strong> figures refer to household-reported total family income.
          </div>
        </div>
      </section>
    </div>
  );
}

function IncomeLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: "warning" | "success" }) {
  const percent = total ? value / total * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{label}</span><span className="font-black">{value.toLocaleString()}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone === "warning" ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <div className="mt-1 text-right text-[9px] text-muted-foreground">{total ? `${percent.toFixed(1)}% of reported households` : "No reported income"}</div>
    </div>
  );
}
