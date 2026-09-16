import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, LockKeyhole, CheckCircle2 } from "lucide-react";
import logo from "@/assets/mutia-logo.png";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [configured, setConfigured] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const state = await (window as any).electronStore?.getAuthState?.();
      setConfigured(Boolean(state?.configured));
    })();
  }, []);

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
        <img src={logo} alt="Municipality of Mutia" className="h-14 w-14 rounded-2xl border border-border bg-background p-2" />
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
  </div>;
}
