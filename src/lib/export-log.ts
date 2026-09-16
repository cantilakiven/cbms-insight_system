const LS_KEY = "lmdas.export_log.v1";
const CUSTOM_EVENT_KEY = "export-log-updated";

export interface ExportLogEntry {
  id: string;
  timestamp: string;
  filename: string;
  innerFile: string;
  format: "CSV" | "XLSX" | "PDF" | "DOCX" | "HTML";
  savedPath?: string;
  encryption?: "AES-256" | "AES-256-GCM";
  title: string;
  rowCount: number;
  password: string;
  bytes: number;
  user?: string;
}

declare global {
  interface Window {
    electronStore?: {
      getDownloadPath?: (filename: string) => Promise<string>;
      saveExportFile?: (filename: string, data: ArrayBuffer) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      getUserDataPath?: () => Promise<string>;
    };
    electronLog?: {
      getLog: () => Promise<ExportLogEntry[]>;
      saveLog: (entries: ExportLogEntry[], replace?: boolean) => Promise<boolean>;
      clearLog?: () => Promise<boolean>;
      getLogPath?: () => Promise<string>;
    };
  }
}

const listeners = new Set<() => void>();
let cachedLog: ExportLogEntry[] | null = null;
let isLoaded = false;
void isLoaded;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function notify() {
  listeners.forEach((fn) => fn());
  if (isClient()) {
    window.dispatchEvent(new Event(CUSTOM_EVENT_KEY));
  }
}

/** Wait briefly for the Electron preload bridge to appear (it may attach after hydration). */
async function waitForBridge(timeoutMs = 4000): Promise<void> {
  if (!isClient()) return;
  const isElectron = /electron/i.test(navigator.userAgent);
  if (!isElectron) return;
  const start = Date.now();
  while (!window.electronLog && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function initStore() {
  if (!isClient()) return;

  await waitForBridge();

  // Read entries from both Electron-backed disk and localStorage backup (if any).
  let diskEntries: ExportLogEntry[] = [];
  if (window.electronLog) {
    try {
      const data = await window.electronLog.getLog();
      diskEntries = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('export-log: failed reading from electronLog:', err);
      diskEntries = [];
    }
  }

  let lsEntries: ExportLogEntry[] = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    lsEntries = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    lsEntries = [];
  }

  // Merge diskEntries, lsEntries, and any in-memory cachedLog (added before init)
  // into a deduplicated list keyed by id, preferring the most recent timestamp.
  const byId = new Map<string, ExportLogEntry>();
  const addList = (list: ExportLogEntry[] | null | undefined) => {
    if (!list) return;
    for (const e of list) {
      if (!e || !e.id) continue;
      const existing = byId.get(e.id);
      if (!existing) {
        byId.set(e.id, e);
      } else if (e.timestamp && existing.timestamp && e.timestamp > existing.timestamp) {
        byId.set(e.id, e);
      }
    }
  };

  // Order of adding sets precedence when timestamps are equal; add disk, then local, then in-memory
  addList(diskEntries);
  addList(lsEntries);
  addList(cachedLog || []);

  const combined = Array.from(byId.values())
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 500);
  cachedLog = combined;

  // Persist merged result to both Electron disk and localStorage backup.
  try {
    await saveToDisk(cachedLog);
  } catch (err) {
    console.error('export-log: saveToDisk failed during init merge:', err);
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cachedLog));
  } catch {}

  isLoaded = true;
  notify();
}

let initPromise: Promise<void> | null = null;

/** Ensures the log has been loaded from disk at least once. */
export function ensureExportLogLoaded(): Promise<void> {
  if (!isClient()) return Promise.resolve();
  if (!initPromise) initPromise = initStore();
  return initPromise;
}

/** Re-reads the on-disk log and merges it into memory (used when the window regains focus). */
export async function reloadExportLog(): Promise<void> {
  if (!isClient()) return;
  initPromise = initStore();
  await initPromise;
}

if (isClient()) {
  ensureExportLogLoaded();
  // Keep the log fresh when the desktop window is re-focused or restored.
  window.addEventListener("focus", () => { reloadExportLog(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadExportLog();
  });
}


async function saveToDisk(entries: ExportLogEntry[], replace = false) {
  // Persist to Electron-backed storage if available, otherwise fallback to localStorage.
  if (!isClient()) return;

  if (!window.electronLog) await waitForBridge(2000);

  if (window.electronLog) {
    try {
      await window.electronLog.saveLog(entries, replace);
    } catch (err) {
      // Swallow errors to avoid breaking the UI; best-effort persistence.
      console.error("Failed to persist export log via electronLog:", err);
    }
  }

  // Always keep a localStorage backup so restarts remain resilient even if
  // the Electron disk write/read has issues on some environments.
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error("Failed to persist export log to localStorage:", err);
  }
}

export function subscribeExportLog(fn: () => void): () => void {
  listeners.add(fn);

  if (!isClient()) return () => listeners.delete(fn);

  const handleCustomEvent = () => fn();
  window.addEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);

  return () => {
    listeners.delete(fn);
    window.removeEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);
  };
}

export function getExportLog(): ExportLogEntry[] {
  if (!isClient()) return [];
  if (cachedLog !== null) return cachedLog;

  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedLog = Array.isArray(parsed) ? parsed : [];
    return cachedLog;
  } catch {
    cachedLog = [];
    return cachedLog;
  }
}

export function addExportLog(entry: ExportLogEntry): void {
  if (!isClient()) return;

  const cur = getExportLog();
  const updated = [entry, ...cur].slice(0, 500);
  cachedLog = updated;

  saveToDisk(updated);
  notify();
}

export function clearExportLog(): void {
  if (!isClient()) return;

  cachedLog = [];
  saveToDisk([], true);
  notify();
}

export function deleteExportLogEntry(id: string): void {
  if (!isClient()) return;

  const cur = getExportLog().filter((e) => e.id !== id);
  cachedLog = cur;

  saveToDisk(cur, true);
  notify();
}

// ── Password Generation Helpers ───────────────────────────────
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*?-_=+";
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

function pick(chars: string, rand: Uint32Array, i: number): string {
  return chars[rand[i] % chars.length];
}

export function generatePassword(length = 16): string {
  const len = Math.max(12, length);
  const rand = new Uint32Array(len + 4);
  crypto.getRandomValues(rand);

  const out: string[] = [
    pick(UPPER, rand, 0),
    pick(LOWER, rand, 1),
    pick(DIGIT, rand, 2),
    pick(SYMBOL, rand, 3),
  ];

  for (let i = 4; i < len; i++) {
    out.push(pick(ALL, rand, i));
  }

  const shuffle = new Uint32Array(len);
  crypto.getRandomValues(shuffle);
  for (let i = out.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out.join("");
}

export function makeExportId(): string {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return `EXP-${Date.now().toString(36)}-${r[0].toString(36)}${r[1].toString(36)}`;
}

// ── Export the export log itself (CSV / JSON) ─────────────────────────────
export function exportExportLogCSV(): void {
  if (!isClient()) return;
  const rows = getExportLog();
  if (!rows || rows.length === 0) {
    try { window.alert("Export log is empty — nothing to export."); } catch {}
    return;
  }
  const cols = ["id", "timestamp", "filename", "innerFile", "format", "title", "rowCount", "password", "bytes", "savedPath", "encryption", "user"];
  const header = cols.map((c) => `"${c}"`).join(",");
  const body = rows.map((r) => cols.map((c) => `"${String((r as any)[c] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const csv = header + "\n" + body + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const name = `export-log_${new Date().toISOString().slice(0,10)}.csv`;
  void saveBlobWithPrompt(blob, name);
}

export function exportExportLogJSON(): void {
  if (!isClient()) return;
  const rows = getExportLog();
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const name = `export-log_${new Date().toISOString().slice(0,10)}.json`;
  void saveBlobWithPrompt(blob, name);
}

/** Returns the exact path where an Electron export would be saved if no dialog is shown. */
export async function getExpectedSavedPath(filename: string): Promise<string | undefined> {
  if (!isClient()) return undefined;
  try {
    const bridge = window.electronStore;
    if (bridge?.getDownloadPath) return await bridge.getDownloadPath(filename);
  } catch (err) {
    console.warn("export-log: unable to resolve default save path", err);
  }
  return undefined;
}

/** Save to a user-selected destination. Uses the native Electron dialog in the desktop app and
 * showSaveFilePicker where supported in a browser; anchor download is the final fallback. */
export async function saveBlobWithPrompt(blob: Blob, filename: string): Promise<string | undefined> {
  if (!isClient()) return undefined;
  try {
    const bridge = window.electronStore;
    if (bridge?.saveExportFile) {
      const result = await bridge.saveExportFile(filename, await blob.arrayBuffer());
      if (result?.canceled) return undefined;
      if (result?.error) throw new Error(result.error);
      return result?.filePath;
    }

    const picker = (window as any).showSaveFilePicker as undefined | ((options: any) => Promise<any>);
    if (picker) {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "Exported document", accept: { "application/octet-stream": ["." + filename.split(".").pop()] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name || filename;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  } catch (err) {
    // User cancellation should not be treated as a fatal export error.
    if (err && typeof err === "object" && "name" in err && (err as any).name === "AbortError") return undefined;
    console.error("failed to save export:", err);
    throw err;
  }
}

export function emitExportPassword(filename: string, password: string, format: string): void {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent("cbms-export-password", { detail: { filename, password, format } }));
}

export function emitPrintPreview(html: string, title: string): void {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent("cbms-print-preview", { detail: { html, title } }));
}
