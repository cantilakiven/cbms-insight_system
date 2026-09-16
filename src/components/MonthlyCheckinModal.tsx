import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import logo from "@/assets/mutia-logo.png";

const INSTALL_KEY = "localdata.installed-at";
const ACK_KEY = "localdata.monthly-checkin.ack";
const PERIOD_DAYS = 30;

interface Store {
  getSetting: (key: string) => Promise<unknown>;
  saveSetting: (key: string, value: unknown) => Promise<unknown>;
}

function store(): Store | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronStore?: Store }).electronStore ?? null;
}

/**
 * Maintenance reminder shown 30 days after the software was installed
 * (and every 30 days after that). In the packaged Electron app the install
 * date lives in the app's user-data settings file so it survives reinstalling
 * the browser cache or clearing localStorage.
 */
export default function MonthlyCheckinModal() {
  const [state, setState] = useState<{ period: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const bridge = store();
      let installedAt = 0;

      // Desktop app: read the install date written at first launch.
      if (bridge) {
        try {
          const raw = await bridge.getSetting(INSTALL_KEY);
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed > 0) installedAt = parsed;
        } catch {}
      }

      if (!installedAt) {
        const raw = localStorage.getItem(INSTALL_KEY);
        const parsed = raw ? Number(raw) : NaN;
        installedAt = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
      }

      localStorage.setItem(INSTALL_KEY, String(installedAt));
      if (bridge) {
        try {
          await bridge.saveSetting(INSTALL_KEY, installedAt);
        } catch {}
      }

      const period = Math.floor((Date.now() - installedAt) / (PERIOD_DAYS * 86_400_000));
      if (cancelled || period < 1) return;

      let acked = localStorage.getItem(ACK_KEY);
      if (bridge && !acked) {
        try {
          const remote = await bridge.getSetting(ACK_KEY);
          if (remote != null) acked = String(remote);
        } catch {}
      }
      if (acked !== String(period)) setState({ period });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const acknowledge = () => {
    localStorage.setItem(ACK_KEY, String(state.period));
    store()
      ?.saveSetting(ACK_KEY, String(state.period))
      .catch(() => {});
    setState(null);
  };

  const monthsInUse = state.period;

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <img src={logo} alt="Municipality of Mutia seal" className="h-14 w-14 shrink-0" />
          <div>
            <h2 className="font-display text-lg font-semibold">Maintenance reminder</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Local Data — Local Municipal Data Analytics System
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4 text-warning" /> Please consult the developer
          </p>
          <p className="text-muted-foreground">
            This software has been installed and in use for{" "}
            <b className="text-foreground">
              {monthsInUse === 1 ? "30 days" : `${monthsInUse * PERIOD_DAYS} days`}
            </b>
            . This is a reminder for the developer,{" "}
            <b className="text-foreground">Kiven Cantila</b>, to maintain and check this software. Please
            coordinate with him for updates, data checks and continued maintenance. No other person is
            authorized to modify this system.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={acknowledge}>
            I understand
          </Button>
        </div>
      </div>
    </div>
  );
}
