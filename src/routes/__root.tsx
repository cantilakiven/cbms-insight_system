import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import MonthlyCheckinModal from "@/components/MonthlyCheckinModal";
import { AppShell } from "@/components/AppShell";
import logo from "@/assets/cbms-insights-logo.png";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Community Data & Insights" },
      { name: "description", content: "CBMS-based community profiling, search and reports for LGUs and barangays." },
      { name: "author", content: "LMDAS" },
      { property: "og:title", content: "Community Data & Insights" },
      { property: "og:description", content: "CBMS-based community profiling for Philippine LGUs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function SecureLoginGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    void (async () => {
      const state = await (window as any).electronStore?.getAuthState?.();
      setConfigured(Boolean(state?.configured));
      setLockedUntil(Number(state?.lockedUntil || 0));
      setRemainingMs(Number(state?.remainingMs || 0));
      setAttemptsRemaining(Number(state?.attemptsRemaining ?? 3));
      if (state?.storageError) setStorageError(String(state?.error || "Security storage could not be verified."));
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, lockedUntil - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) {
        setLockedUntil(0);
        setAttemptsRemaining(3);
        setError("");
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  if (checking) return <div className="min-h-screen grid place-items-center bg-background"><div className="text-sm text-muted-foreground">Securing system…</div></div>;

  if (storageError) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 p-6 text-white">
      <main className="w-full max-w-lg rounded-[28px] border border-red-400/20 bg-slate-900 p-7 shadow-2xl">
        <div className="flex items-center gap-4"><img src={logo} alt="Selected Local Area" className="h-16 w-16 rounded-2xl bg-white p-2" /><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">Security storage error</div><h1 className="mt-1 text-2xl font-black">Access blocked</h1></div></div>
        <p className="mt-5 text-sm leading-6 text-slate-300">{storageError}</p>
        <p className="mt-3 text-xs leading-5 text-slate-400">Close the application completely and start it again. The application will not open its data until the existing security record can be verified.</p>
      </main>
    </div>
  );
  if (!configured) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  const formatLockout = (ms: number) => {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  };

  const submit = async () => {
    setError("");
    if (!/^\d{6}$/.test(pin)) return setError("Enter your 6-digit PIN.");
    if (lockedUntil > Date.now()) {
      setError(`System locked. Try again in ${formatLockout(lockedUntil - Date.now())}.`);
      return;
    }
    const result = await (window as any).electronStore?.verifyLoginPin?.(pin);
    if (result?.storageError) {
      setStorageError(String(result?.error || "The saved security record cannot be decrypted."));
      setPin("");
      return;
    }
    if (result?.valid) {
      setUnlocked(true);
      setPin("");
      setAttemptsRemaining(3);
      setError("");
    } else if (result?.locked) {
      setPin("");
      setLockedUntil(Number(result.lockedUntil || 0));
      setRemainingMs(Number(result.remainingMs || 0));
      setAttemptsRemaining(0);
      setError(`Three consecutive incorrect PIN entries were detected. Access is locked for 10 hours.`);
    } else {
      setPin("");
      setAttemptsRemaining(Number(result?.attemptsRemaining ?? Math.max(0, 3 - Number(result?.failedAttempts || 0))));
      setError(`Incorrect PIN. ${Number(result?.attemptsRemaining ?? 0)} attempt${Number(result?.attemptsRemaining ?? 0) === 1 ? "" : "s"} remaining.`);
    }
  };

  return <div className="relative min-h-screen overflow-hidden bg-slate-950 p-6 grid place-items-center">
    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(2,12,27,.92),rgba(9,37,68,.78)_45%,rgba(2,12,27,.92))]" />
    <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:36px_36px]" />
    <main className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/25 bg-slate-950/70 p-7 shadow-[0_30px_100px_rgba(0,0,0,.45)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 rounded-[30px] ring-1 ring-inset ring-white/10" />
      <div className="relative flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/95 p-2 shadow-xl"><img src={logo} alt="Selected Local Area" className="h-full w-full rounded-xl object-contain" /></div>
        <div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Protected access</div><h1 className="mt-1 font-display text-2xl font-black text-white">CBMS Insights</h1><p className="text-xs text-slate-300">Community-Based Monitoring System</p></div>
      </div>
      <div className="relative mt-7 overflow-hidden rounded-2xl border border-white/15 bg-white/8 p-4">
        <div className="absolute -right-6 -top-8 h-20 w-20 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Secure system</div>
        <p className="mt-1 text-xs leading-5 text-slate-300">Enter the 6-digit security PIN configured in System Settings.</p>
      </div>
      <label className="relative mt-6 block text-sm font-bold text-white">
        Security PIN
        <div className="relative mt-2">
          <div className="grid grid-cols-6 gap-2 sm:gap-2.5" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={`grid aspect-square min-w-0 place-items-center rounded-xl border text-xl font-black transition sm:rounded-2xl sm:text-2xl ${
                  pin.length > index
                    ? "border-cyan-200/50 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,.12)]"
                    : "border-white/15 bg-black/25 text-slate-500"
                }`}
              >
                {pin.length > index ? "•" : ""}
              </div>
            ))}
          </div>
          <input
            autoFocus
            inputMode="numeric"
            aria-label="6-digit Security PIN"
            maxLength={6}
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            disabled={lockedUntil > Date.now()}
            className="absolute inset-0 h-full w-full cursor-text rounded-2xl opacity-0 outline-none"
          />
        </div>
        <div className="mt-2 text-[10px] font-medium text-slate-400">Six numeric digits required</div>
      </label>
      <button type="button" disabled={lockedUntil > Date.now()} onClick={()=>void submit()} className="relative mt-4 flex w-full disabled:cursor-not-allowed disabled:opacity-50 items-center justify-center gap-2 rounded-2xl border border-cyan-200/20 bg-cyan-500/90 px-4 py-3.5 text-sm font-black text-slate-950 shadow-xl shadow-cyan-950/30 transition hover:bg-cyan-300"><LockKeyhole className="h-4 w-4" /> Unlock Secure System</button>
      {lockedUntil > Date.now() ? (
        <div className="relative mt-4 rounded-2xl border border-red-300/20 bg-red-950/35 p-4 text-center">
          <div className="text-sm font-black text-red-200">Security lockout active</div>
          <div className="mt-1 font-mono text-xl font-black tracking-wide text-red-100">{formatLockout(remainingMs)}</div>
          <p className="mt-1 text-xs text-red-200/80">Three consecutive incorrect PIN entries trigger this 10-hour lockout.</p>
        </div>
      ) : (error || attemptsRemaining < 3) && <p className="relative mt-3 text-center text-sm font-semibold text-red-300">{error || `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`}</p>}
      <div className="relative mt-5 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" /> Local secure session <span className="mx-1 text-slate-600">•</span> Selected Local Area</div>
    </main>
  </div>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Prevent accidental dragging of internal links, text selections, images,
    // and other renderer elements that can expose the localhost app URL to the
    // user's browser. File drag-and-drop import remains available because this
    // only cancels the dragstart event, not dragover/drop.
    const stopRendererDrag = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("dragstart", stopRendererDrag, true);
    return () => document.removeEventListener("dragstart", stopRendererDrag, true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SecureLoginGate>
        <MonthlyCheckinModal />
        <AppShell />
      </SecureLoginGate>
    </QueryClientProvider>
  );
}