import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, LockKeyhole, CheckCircle2, RefreshCw, DownloadCloud } from "lucide-react";
import logo from "@/assets/cbms-insights-logo.png";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [configured, setConfigured] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [appVersion, setAppVersion] = useState("—");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const state = await (window as any).electronStore?.getAuthState?.();
      setConfigured(Boolean(state?.configured));
      const version = await (window as any).electronApp?.getVersion?.();
      if (version) setAppVersion(version);
    })();
  }, []);

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateMessage("");
    try {
      const result = await (window as any).electronUpdater?.checkForUpdates?.();
      if (!result?.ok) {
        setUpdateMessage(result?.message || "Update checks are available in the installed desktop application.");
      } else if (result.state === "up-to-date") {
        setUpdateMessage(`You are using the latest installed version (${result.currentVersion || appVersion}).`);
      } else if (result.state === "available") {
        setUpdateMessage(`A newer version (${result.version}) is available. Downloading in the background.`);
      } else {
        setUpdateMessage(`Update check completed for version ${result.currentVersion || appVersion}.`);
      }
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : "Unable to check for updates.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const save = async () => {
    setMessage("");
    if (!/^\d{6}$/.test(newPin)) return setMessage("Enter a new 6-digit PIN using numbers only.");
    if (newPin !== confirmPin) return setMessage("The new PIN and confirmation do not match.");
    if (configured && !/^\d{6}$/.test(currentPin)) return setMessage("Enter your current 6-digit PIN first.");
    setSaving(true);
    try {
      const result = await (window as any).electronStore?.setLoginPin?.(newPin, currentPin);
      if (!result?.ok) return setMessage(result?.error || "Unable to save PIN.");
      setConfigured(true); setCurrentPin(""); setNewPin(""); setConfirmPin("");
      setMessage("PIN updated successfully. The new PIN is required the next time the system starts.");
    } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-3xl space-y-6">
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-4">
        <img src={logo} alt="CBMS Insights" className="h-14 w-14 rounded-2xl border border-border bg-background p-2" />
        <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">System security</div><h1 className="mt-1 font-display text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Protect access to this CBMS desktop system with a private 6-digit PIN.</p></div>
      </div>
    </section>
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div><div><h2 className="font-display text-lg font-bold">Login PIN</h2><p className="text-sm text-muted-foreground">{configured ? "A login PIN is active. Enter the current PIN to change it." : "No login PIN is set yet. Set one to enable the secure login screen."}</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {configured && <label className="text-sm font-semibold">Current PIN<input value={currentPin} onChange={e=>setCurrentPin(e.target.value.replace(/\D/g, "").slice(0,6))} inputMode="numeric" maxLength={6} type="password" placeholder="••••••" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary/30" /></label>}
        <label className="text-sm font-semibold">New 6-digit PIN<input value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g, "").slice(0,6))} inputMode="numeric" maxLength={6} type="password" placeholder="••••••" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary/30" /></label>
        <label className="text-sm font-semibold">Confirm PIN<input value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g, "").slice(0,6))} inputMode="numeric" maxLength={6} type="password" placeholder="••••••" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary/30" /></label>
      </div>
      <button onClick={() => void save()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><KeyRound className="h-4 w-4" />{saving ? "Saving…" : configured ? "Change PIN" : "Set PIN"}</button>
      {message && <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{message}</span></div>}
    </section>
    <section className="rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground"><div className="flex items-center gap-2 font-bold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Security behavior</div><p className="mt-2">The PIN is stored as a salted, memory-hard hash in the application's local settings. The raw PIN is never written to disk. After a PIN is configured, every fresh application launch shows only the secure PIN login screen.</p></section>
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Update center</div>
          <h2 className="mt-1 font-display text-lg font-bold">CBMS Insights {appVersion !== "—" ? `v${appVersion}` : ""}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the packaged desktop application to check GitHub for a newer release. Development mode does not install updates.</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><DownloadCloud className="h-5 w-5" /></div>
      </div>
      <button type="button" onClick={() => void checkForUpdates()} disabled={checkingUpdate} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${checkingUpdate ? "animate-spin" : ""}`} />
        {checkingUpdate ? "Checking…" : "Check for updates"}
      </button>
      {updateMessage && <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground">{updateMessage}</div>}
    </section>
    <section className="rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Credits</div>
      <div className="mt-2 font-semibold text-foreground">Developed by Kiven Cantila</div>
      <a className="mt-1 inline-flex text-primary hover:underline" href="https://www.facebook.com/hello.kwekwe" target="_blank" rel="noreferrer">facebook.com/hello.kwekwe</a>
      <div className="mt-3 grid gap-1.5 text-xs">
        <div><span className="font-semibold text-foreground">UI/UX Designer:</span> Clifford Kevin Bohol</div>
        <div><span className="font-semibold text-foreground">Tester:</span> Fredrich Cabasag</div>
      </div>
    </section>
  </div>;
}
