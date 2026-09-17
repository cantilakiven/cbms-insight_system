import { createFileRoute } from "@tanstack/react-router";
import { invalidFiles } from "@/data/cbms";

export const Route = createFileRoute("/troubleshooting")({
  component: TroubleshootingPage,
});

interface Item {
  title: string;
  symptom: string;
  cause: string;
  fix: string[];
}

const ITEMS: Item[] = [
  {
    title: "CBMS 2022 appears as N/A in a comparison",
    symptom: "The 2022 side of Comparative Analysis or Reports shows N/A, zero rows, or is unavailable after reopening the application.",
    cause: "CBMS 2022 uses the legacy single-area JSON structure. The system converts it into the normalized runtime shape before analysis and keeps it separate from 2024.",
    fix: [
      "Open Import Data and choose `Load included CBMS 2022`.",
      "Or select your own 2022 `*_A.json` local-area export.",
      "Wait until the import validation report finishes, then reopen Comparative Analysis.",
      "Do not rename the 2022 file unless you are also using the Auto-detect importer.",
    ],
  },
  {
    title: "CBMS 2024 is missing from Comparative Analysis",
    symptom: "The 2024 cards initially show zero records or N/A when opening the comparative workspace.",
    cause: "The application intentionally loads the large 2024 JSON set on demand so first launch stays lighter on memory.",
    fix: [
      "Open Comparative Analysis and wait for `Loading the included CBMS 2024 dataset` to finish.",
      "For your own 2024 export, use Import Data and select all 2024 JSON files together.",
      "The app stores 2022 and 2024 separately, so importing one year will not overwrite the other.",
    ],
  },
  {
    title: "Comparative counts differ from a source export",
    symptom: "A figure in Comparative Analysis does not match a CBMS source report or a manually counted list.",
    cause: "The comparative page uses normalized fields and only compares indicators that can be mapped safely between 2022 and 2024. It also scopes records by the selected barangay filter.",
    fix: [
      "Confirm the comparison scope says `All Barangays` or the intended barangay.",
      "Open Data Validation for the same year and inspect field coverage and joins.",
      "Use Sector Rosters or Dataset Inspector when you need the underlying person/household rows.",
      "Treat `N/A` as unavailable data, not zero, when a source year does not contain an equivalent field.",
    ],
  },
  {
    title: "Node — FATAL ERROR: JavaScript heap out of memory (V8 mark-compact)",
    symptom:
      "During `npm run dev` or `npm run build`, the terminal prints “Ineffective mark-compacts near heap limit — Allocation failed - JavaScript heap out of memory” and the process crashes.",
    cause:
      "Node.js on Windows defaults to a ~2 GB V8 old-space heap. Vite dev/SSR + TanStack Start + large CBMS JSON datasets can exceed that ceiling, especially the first time each route is compiled. It is a memory ceiling, not a real bug in the app.",
    fix: [
      "# The dev/build scripts already set an 8 GB heap via cross-env:",
      "#   \"dev\":   \"cross-env NODE_OPTIONS=--max-old-space-size=8192 vite dev\"",
      "#   \"build\": \"cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build\"",
      "",
      "# 1) Make sure you are running the npm script, NOT `npx vite dev` directly:",
      "npm run dev",
      "",
      "# 2) If it still crashes, raise the ceiling (e.g. 12 GB) for one run:",
      "# Windows PowerShell:",
      '$env:NODE_OPTIONS="--max-old-space-size=12288"; npm run dev',
      "# Windows CMD:",
      "set NODE_OPTIONS=--max-old-space-size=12288 && npm run dev",
      "# macOS / Linux:",
      "NODE_OPTIONS=--max-old-space-size=12288 npm run dev",
      "",
      "# 3) Close other heavy apps (Chrome, Docker, Android Studio) to free RAM.",
      "# 4) Reboot to clear leaked Node processes:  taskkill /IM node.exe /F   (Windows)",
      "# 5) Delete the Vite cache and retry:",
      "# Windows PowerShell:",
      "Remove-Item -Recurse -Force node_modules\\.vite",
      "# macOS / Linux:",
      "rm -rf node_modules/.vite",
      "",
      "# 6) Still failing? Split very large JSON files in public/cbms-2024/ into",
      "#    smaller shards (the loader auto-merges every *.json in that folder).",
    ],
  },

  {
    title: "npm ERESOLVE — unable to resolve dependency tree",
    symptom:
      "npm error code ERESOLVE / peer zod@^3.23.8 from @tanstack/zod-adapter — Conflicting peer dependency.",
    cause:
      "A transitive package declares an older peer range (e.g. zod 3.x) while the project uses a newer major (zod 4.x). The packages are runtime-compatible but npm refuses to install by default.",
    fix: [
      "npm install --legacy-peer-deps",
      "# or use the bundled shortcut:",
      "npm run setup",
      "# then start the dev server:",
      "npm run dev",
    ],
  },
  {
    title: "Vite — Failed to parse JSON file, invalid JSON syntax at position -1",
    symptom:
      "The bundled CBMS loader reports that a JSON file is empty or malformed while reading public/cbms-2024/*.json.",
    cause:
      "One of the supplied JSON dataset files is empty or malformed. The CBMS importer needs a valid JSON array/object before it can normalize records.",
    fix: [
      "# Windows PowerShell — replace empty files with []:",
      'Get-ChildItem public\\cbms-2024\\*.json | Where-Object { $_.Length -eq 0 } | ForEach-Object { Set-Content $_.FullName "[]" }',
      "# macOS / Linux:",
      'for f in public/cbms-2024/*.json; do [ -s "$f" ] || echo "[]" > "$f"; done',
      "npm run dev",
    ],
  },
  {
    title: "One-shot install + run for VS Code",
    symptom: "You just cloned the project and want to bring it up in one command.",
    cause: "Two steps (install + dev) is easy to forget on a fresh machine.",
    fix: [
      "npm run start   # installs with --legacy-peer-deps, then runs vite dev",
      "# Then open the printed URL (default http://localhost:8080) in your browser.",
    ],
  },
  {
    title: "Port 8080 already in use",
    symptom: "Vite fails with EADDRINUSE or silently picks a different port.",
    cause: "Another process (often a leftover Node/Vite) is still bound to 8080.",
    fix: [
      "# Windows — find and kill the process on port 8080:",
      "netstat -ano | findstr :8080",
      "taskkill /PID <pid> /F",
      "# macOS / Linux:",
      "lsof -ti:8080 | xargs kill -9",
    ],
  },
  {
    title: "Stale node_modules after pulling new code",
    symptom:
      "Build/dev errors that reference packages that should exist, or 'Cannot find module' after switching branches.",
    cause: "node_modules is out of sync with package.json.",
    fix: [
      "# Windows PowerShell:",
      "Remove-Item -Recurse -Force node_modules, package-lock.json",
      "npm install --legacy-peer-deps",
      "# macOS / Linux:",
      "rm -rf node_modules package-lock.json && npm install --legacy-peer-deps",
    ],
  },
];

function TroubleshootingPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Troubleshooting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A practical help center for the CBMS 2022 and 2024 data model, importing, validation,
          comparative analysis, and common VS Code/dev-server problems.
        </p>
      </header>

      <section
        className={`rounded-xl border p-5 shadow-[var(--shadow-card)] ${
          invalidFiles.length
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card"
        }`}
      >
        <h2 className="font-display text-base font-semibold">
          JSON import validator{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (checks every file in <code>src/data/cbms/</code> at startup)
          </span>
        </h2>
        {invalidFiles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            All dataset files parsed successfully.
          </p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {invalidFiles.map((f) => (
              <li
                key={f.path}
                className="rounded-md border border-destructive/30 bg-background p-3"
              >
                <div className="font-mono text-xs font-semibold text-destructive">
                  {f.filename}
                  {f.line ? (
                    <span className="text-muted-foreground">
                      {" "}(line {f.line}, column {f.column}
                      {typeof f.position === "number" ? `, position ${f.position}` : ""})
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-foreground/90">{f.reason}</div>
                {f.snippet ? (
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed">
                    <code>{f.snippet}</code>
                  </pre>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Fix: open <code>{f.path.replace(/^\.\//, "src/data/cbms/")}</code> in VS Code,
                  jump to that line/column, and correct the JSON (or replace the whole file with{" "}
                  <code>[]</code> if you don&apos;t need it yet).
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>


      <div className="space-y-4">
        {ITEMS.map((it) => (
          <article
            key={it.title}
            className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <h2 className="font-display text-base font-semibold text-foreground">{it.title}</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
              <dt className="font-semibold text-muted-foreground">Symptom</dt>
              <dd className="text-foreground/90">{it.symptom}</dd>
              <dt className="font-semibold text-muted-foreground">Cause</dt>
              <dd className="text-foreground/90">{it.cause}</dd>
              <dt className="font-semibold text-muted-foreground">Fix</dt>
              <dd>
                <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-foreground">
                  <code>{it.fix.join("\n")}</code>
                </pre>
              </dd>
            </dl>
          </article>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Still stuck? Make sure Node.js 20+ is installed (<code>node -v</code>) and that you opened
        the project folder in VS Code (not a parent folder).
      </p>
    </div>
  );
}
