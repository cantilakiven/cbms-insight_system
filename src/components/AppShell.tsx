import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Database,
  FileBarChart,
  Grid3x3,
  HeartHandshake,
  Home,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Upload,
  Users,
  Settings,
  X,
  Baby,
  BookOpen,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { municipality } from "@/data/cbms";
import { DataGate } from "./DataGate";
import logo from "@/assets/mutia-logo.png";
import { ThemeToggle } from "./ThemeToggle";
import { ExportPasswordModal, PrintPreviewModal } from "./ExportTools";
import {
  getSourceWatermark,
  getActiveYear,
  getActiveBarangay,
  subscribeData,
  getDataVersion,
  getAvailableYears,
  getAvailableBarangays,
  setActiveYear,
  setActiveBarangay,
} from "@/data/cbms";

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: any }[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/comparative", label: "Comparative Analysis", icon: BarChart3 },
    ],
  },
  {
    label: "Community Data",
    items: [
      { to: "/persons", label: "Person Search", icon: Users },
      { to: "/households", label: "Households", icon: Home },
      { to: "/barangays", label: "Barangays", icon: MapPin },
      { to: "/demographics", label: "Demographics", icon: Baby },
      { to: "/sectors", label: "Sector Rosters", icon: HeartHandshake },
    ],
  },
  {
    label: "Analysis & Reports",
    items: [
      { to: "/crosstab", label: "Cross-tabulation", icon: Grid3x3 },
      { to: "/reports", label: "Statistical Reports", icon: FileBarChart },
      { to: "/compendium", label: "Report Compendium", icon: BookOpen },
      { to: "/validation", label: "Data Validation", icon: ShieldCheck },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/inspector", label: "Dataset Inspector", icon: Database },
      { to: "/export-log", label: "Export Log", icon: KeyRound },
      { to: "/import", label: "Import Data", icon: Upload },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

type NavItem = { to: string; label: string; icon: any };
const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/comparative": "Comparative Analysis",
  "/persons": "Person Search",
  "/households": "Households",
  "/barangays": "Barangays",
  "/demographics": "Demographics",
  "/sectors": "Sector Rosters",
  "/crosstab": "Cross-tabulation",
  "/reports": "Statistical Reports",
  "/compendium": "Report Compendium",
  "/validation": "Data Validation",
  "/inspector": "Dataset Inspector",
  "/export-log": "Export Log",
  "/import": "Import Data",
  "/settings": "Settings",
  "/troubleshooting": "Troubleshooting",
};

export function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("mutialytics.sidebar.collapsed") === "1"; } catch { return false; }
  });
  const [searchValue, setSearchValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const dataVersion = useSyncExternalStore(subscribeData, getDataVersion, () => 0);
  const activeYear = getActiveYear();
  const activeBarangay = getActiveBarangay();
  const availableYears = getAvailableYears();
  const availableBarangays = getAvailableBarangays(activeYear);

  const pageTitle = PAGE_TITLES[loc.pathname] ?? "Municipal Information System";
  const suggestions = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return ALL_NAV_ITEMS.slice(0, 6);
    return ALL_NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6);
  }, [searchValue]);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setSearchValue("");
  }, [loc.pathname]);

  useEffect(() => {
    try { localStorage.setItem("mutialytics.sidebar.collapsed", sidebarCollapsed ? "1" : "0"); } catch {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".app-global-search input");
        input?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isActive = (to: string) => loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));

  const submitSearch = () => {
    const target = suggestions[0];
    if (!target) return;
    navigate({ to: target.to });
    setSearchValue("");
    setSearchOpen(false);
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-shell min-h-screen bg-background">
      <ExportPasswordModal />
      <PrintPreviewModal />
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col lg:flex ${sidebarCollapsed ? "app-sidebar-collapsed w-[68px]" : "w-[224px]"}`}>
        <SidebarBrand collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
        <SidebarNavigation isActive={isActive} onNavigate={closeMobile} collapsed={sidebarCollapsed} />
        <SidebarAccount collapsed={sidebarCollapsed} />
      </aside>

      <div
        className={`app-mobile-drawer-backdrop lg:hidden ${mobileOpen ? "is-open" : ""}`}
        onClick={closeMobile}
      />
      <aside className={`app-mobile-drawer lg:hidden ${mobileOpen ? "is-open" : ""}`} aria-hidden={!mobileOpen}>
        <SidebarBrand mobile />
        <SidebarNavigation isActive={isActive} onNavigate={closeMobile} />
        <SidebarAccount />
      </aside>

      <header className="app-topbar sticky top-0 z-30">
        <div className="app-topbar-inner">
          <div className="app-topbar-leading">
            <button
              className="app-mobile-menu lg:hidden"
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <div className="app-breadcrumbs">
              <span className="app-breadcrumb-muted">Mutia</span>
              <span className="app-breadcrumb-slash">/</span>
              <span className="app-breadcrumb-current">{pageTitle}</span>
            </div>
          </div>

          <div className="app-search-wrap">
            <form
              className="app-global-search"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
              <input
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search modules, reports, people…"
                aria-label="Global search"
              />
              <kbd className="app-search-kbd">Ctrl K</kbd>
            </form>
            {searchOpen && suggestions.length > 0 && (
              <div className="app-search-results">
                <div className="app-search-results-label">Navigate</div>
                {suggestions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      type="button"
                      className="app-search-result"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigate({ to: item.to })}
                    >
                      <span className="app-search-result-icon"><Icon className="h-3.5 w-3.5" /></span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="app-topbar-actions">
            <div className="app-year-switch topbar-year-switch hidden md:flex" aria-label="CBMS dataset year">
              <CalendarDays className="app-year-switch-icon" />
              {([2022, 2024] as const).map((year) => {
                const enabled = availableYears.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={activeYear === year}
                    className={`app-year-button ${activeYear === year ? "is-active" : ""} ${!enabled ? "is-disabled" : ""}`}
                    onClick={() => enabled && setActiveYear(year)}
                    title={enabled ? `Use CBMS ${year} dataset` : `CBMS ${year} dataset is unavailable`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>

            <div className="app-context-control app-barangay-control hidden 2xl:flex">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                aria-label="Active barangay"
                value={activeBarangay}
                onChange={(event) => setActiveBarangay(event.target.value)}
              >
                <option value="">All Barangays</option>
                {availableBarangays.map((barangay) => (
                  <option key={barangay.area_code} value={barangay.area_name}>{barangay.area_name}</option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </div>

            <ThemeToggle />
          </div>
        </div>

        <div className="app-mobile-context lg:hidden">
          <div className="app-mobile-context-item app-mobile-year-item">
            <span>Dataset</span>
            <div className="app-year-switch app-mobile-year-switch" aria-label="CBMS dataset year">
              {([2022, 2024] as const).map((year) => {
                const enabled = availableYears.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={activeYear === year}
                    className={`app-year-button ${activeYear === year ? "is-active" : ""} ${!enabled ? "is-disabled" : ""}`}
                    onClick={() => enabled && setActiveYear(year)}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="app-mobile-context-item app-mobile-context-grow">
            <span>Barangay</span>
            <select aria-label="Barangay view" value={activeBarangay} onChange={(event) => setActiveBarangay(event.target.value)}>
              <option value="">All Barangays</option>
              {availableBarangays.map((barangay) => <option key={barangay.area_code} value={barangay.area_name}>{barangay.area_name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className={`app-main ${sidebarCollapsed ? "app-main-sidebar-collapsed" : ""}`}>
        <div className="page-container mx-auto max-w-[1700px] px-5 py-5 sm:px-7 lg:px-9 lg:py-7 2xl:px-12">
          <DataGate>
            <div key={dataVersion}><Outlet /></div>
            {loc.pathname !== "/comparative" && (
              <div className="app-main-footer">
                <span>{getSourceWatermark(activeYear)}</span>
                <span>Municipal Community-Based Monitoring System · Offline-ready</span>
              </div>
            )}
          </DataGate>
        </div>
      </main>
    </div>
  );
}

function SidebarBrand({ mobile = false, collapsed = false, onToggle }: { mobile?: boolean; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className={`app-brand ${mobile ? "is-mobile" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      <img alt="Bayan ng Mutia seal" className="app-brand-seal" src={logo} />
      {!collapsed && <div className="min-w-0">
        <div className="app-brand-kicker">Municipal Government</div>
        <div className="app-brand-title">Mutia</div>
        <div className="app-brand-subtitle">Community-Based Monitoring System</div>
      </div>}
      {!mobile && onToggle && <button type="button" onClick={onToggle} className="app-sidebar-collapse-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</button>}
    </div>
  );
}

function SidebarNavigation({
  isActive,
  onNavigate,
  collapsed = false,
}: {
  isActive: (to: string) => boolean;
  onNavigate: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav className={`app-nav flex-1 overflow-y-auto px-2.5 py-3 ${collapsed ? "is-collapsed" : ""}`} aria-label="Primary navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="app-nav-group">
          {!collapsed && <div className="app-nav-label">{group.label}</div>}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`app-nav-item ${active ? "is-active" : ""}`}
                >
                  <span className="app-nav-icon"><Icon className="h-[15px] w-[15px]" strokeWidth={1.7} /></span>
                  <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarAccount({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="app-sidebar-account">
      <div className="app-account-avatar">MO</div>
      {!collapsed && <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold">Municipal Office</div>
        <div className="truncate text-[9px] text-sidebar-foreground/45">Data &amp; Planning</div>
      </div>}
      <div className="app-account-status" title="Local app ready"><Activity className="h-3 w-3" /></div>
    </div>
  );
}
