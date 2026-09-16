const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { fork } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const crypto = require("crypto");

let serverProcess = null;

// ── Persistent Storage (AppData/Roaming/MutiaLytics) ────
// Fixed app name so the data folder is always the same across versions/builds.
app.setName("MutiaLytics");
try {
  app.setPath("userData", path.join(app.getPath("appData"), "MutiaLytics"));
} catch (err) {
  console.error("Failed to set userData path:", err);
}

function getSaveFolder() {
  const saveFolder = path.join(app.getPath("userData"), "saves");
  if (!fs.existsSync(saveFolder)) {
    fs.mkdirSync(saveFolder, { recursive: true });
  }
  return saveFolder;
}

function getLogFilePath() {
  return path.join(getSaveFolder(), "export-log.json");
}

function getSettingsFilePath() {
  return path.join(getSaveFolder(), "settings.json");
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, "utf-8");
    if (!data.trim()) return fallback;
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read", filePath, err);
    return fallback;
  }
}

function writeJsonFileAtomic(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

// ── Local authentication security ───────────────────────
// The PIN is only 6 digits (1,000,000 possible values), so the strongest practical
// design is: OS-protected application key + AES-256-GCM at rest + memory-hard scrypt
// verification + strict persistent online lockout.
const AUTH_SCRYPT = { N: 131072, r: 8, p: 1, keylen: 32 };
const MAX_WRONG_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 60 * 1000; // 10 hours
const AUTH_BLOB_VERSION = 2;

function getSettings() {
  return readJsonFile(getSettingsFilePath(), {}) || {};
}

function saveSettings(settings) {
  writeJsonFileAtomic(getSettingsFilePath(), settings || {});
}

function getLegacyAuth(settings) {
  const auth = settings?.auth;
  return auth && typeof auth === "object" ? auth : {};
}

function getAuthKeyFilePath() {
  return path.join(getSaveFolder(), "auth.key");
}

function isSafeStorageAvailable() {
  try {
    const { safeStorage } = require("electron");
    return app.isReady() && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function getStoredAuthKeyCandidates() {
  const settings = getSettings();
  const candidates = [];
  const seen = new Set();

  const add = (key) => {
    if (!Buffer.isBuffer(key) || key.length !== 32) return;
    const id = key.toString("hex");
    if (seen.has(id)) return;
    seen.add(id);
    candidates.push(key);
  };

  // Preferred: OS-protected key (Electron safeStorage / Windows DPAPI).
  if (settings.authKey && typeof settings.authKey === "string" && isSafeStorageAvailable()) {
    try {
      const { safeStorage } = require("electron");
      const keyB64 = safeStorage.decryptString(Buffer.from(settings.authKey, "base64"));
      add(Buffer.from(keyB64, "base64"));
    } catch (err) {
      console.warn("Unable to decrypt OS-protected authentication key; trying fallback key.", err);
    }
  }

  // Development fallback: preserve a stable key across electron:dev restarts.
  const keyPath = getAuthKeyFilePath();
  try {
    if (fs.existsSync(keyPath)) {
      add(Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64"));
    }
  } catch (err) {
    console.error("Failed to read persistent authentication key:", err);
  }

  return candidates;
}

function getOrCreateProtectedKey({ allowCreate = true } = {}) {
  const settings = getSettings();
  const candidates = getStoredAuthKeyCandidates();
  if (candidates.length) return candidates[0];
  if (!allowCreate) return null;

  const key = crypto.randomBytes(32);
  const keyPath = getAuthKeyFilePath();
  try {
    fs.writeFileSync(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.error("Failed to persist authentication key:", err);
  }

  if (isSafeStorageAvailable()) {
    try {
      const { safeStorage } = require("electron");
      settings.authKey = safeStorage.encryptString(key.toString("base64")).toString("base64");
      saveSettings(settings);
    } catch (err) {
      console.warn("Failed to OS-protect authentication key; persistent key file will be used.", err);
    }
  }
  return key;
}

function decryptAuthBlob(blob) {
  if (typeof blob !== "string" || !blob) return null;
  try {
    const packed = Buffer.from(blob, "base64");
    if (packed.length < 1 + 12 + 16 || packed[0] !== AUTH_BLOB_VERSION) return null;
    const iv = packed.subarray(1, 13);
    const tag = packed.subarray(13, 29);
    const ciphertext = packed.subarray(29);

    // Critical recovery behavior: try every recoverable key before declaring the
    // authentication record unreadable. This handles upgrades from older builds
    // where the OS-protected key and dev fallback key could temporarily differ.
    for (const key of getStoredAuthKeyCandidates()) {
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
        const record = JSON.parse(plain);
        if (record && typeof record === "object") return record;
      } catch {
        // Try the next recoverable key.
      }
    }

    return null;
  } catch {
    return null;
  }
}

function encryptAuthRecord(record) {
  const key = getOrCreateProtectedKey({ allowCreate: true });
  if (!key) throw new Error("Authentication encryption key is unavailable.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([AUTH_BLOB_VERSION]), iv, tag, ciphertext]).toString("base64");
}

function migrateLegacyAuth(settings) {
  const legacy = getLegacyAuth(settings);
  if (!legacy.salt || !legacy.hash) return null;
  const record = {
    salt: legacy.salt,
    hash: legacy.hash,
    updatedAt: legacy.updatedAt || new Date().toISOString(),
    failedAttempts: 0,
    lockedUntil: 0,
  };
  settings.authBlob = encryptAuthRecord(record);
  delete settings.auth;
  saveSettings(settings);
  return record;
}

function getAuthRecord() {
  const settings = getSettings();
  if (settings.authBlob) {
    const record = decryptAuthBlob(settings.authBlob);
    return record || null;
  }
  return migrateLegacyAuth(settings) || {};
}

function saveAuthRecord(record) {
  const settings = getSettings();
  settings.authBlob = encryptAuthRecord(record);
  delete settings.auth;
  saveSettings(settings);
}

function hashPin(pin, saltHex) {
  return crypto.scryptSync(String(pin), Buffer.from(saltHex, "hex"), AUTH_SCRYPT.keylen, {
    N: AUTH_SCRYPT.N,
    r: AUTH_SCRYPT.r,
    p: AUTH_SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  }).toString("hex");
}

function verifyPin(pin, auth) {
  if (!auth || !auth.salt || !auth.hash) return false;
  try {
    const candidate = Buffer.from(hashPin(pin, auth.salt), "hex");
    const expected = Buffer.from(auth.hash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch { return false; }
}

ipcMain.handle("get-export-log", () => {
  const entries = readJsonFile(getLogFilePath(), []);
  return Array.isArray(entries) ? entries : [];
});

ipcMain.handle("save-export-log", (_, entries, replace) => {
  try {
    const list = Array.isArray(entries) ? entries : [];
    if (replace) {
      writeJsonFileAtomic(getLogFilePath(), list);
      return true;
    }
    // Merge with whatever is already on disk so no logged export is ever lost.
    const existing = readJsonFile(getLogFilePath(), []);
    const byId = new Map();
    for (const e of [...(Array.isArray(existing) ? existing : []), ...list]) {
      if (e && e.id) byId.set(e.id, e);
    }
    const merged = Array.from(byId.values())
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, 5000);
    writeJsonFileAtomic(getLogFilePath(), merged);
    return true;
  } catch (err) {
    console.error("Failed to save log:", err);
    return false;
  }
});

ipcMain.handle("delete-export-log", () => {
  try {
    writeJsonFileAtomic(getLogFilePath(), []);
    return true;
  } catch (err) {
    console.error("Failed to clear log:", err);
    return false;
  }
});

ipcMain.handle("get-setting", (_, key) => {
  const settings = readJsonFile(getSettingsFilePath(), {});
  return settings && typeof settings === "object" ? settings[key] ?? null : null;
});

ipcMain.handle("get-auth-state", () => {
  const settings = getSettings();
  const auth = getAuthRecord();
  const now = Date.now();
  if (settings.authBlob && !auth) {
    return {
      configured: true,
      valid: false,
      storageError: true,
      error: "The saved authentication record could not be decrypted. The system is refusing access rather than disabling the PIN."
    };
  }
  const lockedUntil = Number(auth.lockedUntil || 0);
  return {
    configured: Boolean(auth.salt && auth.hash),
    updatedAt: auth.updatedAt || null,
    failedAttempts: Number(auth.failedAttempts || 0),
    lockedUntil: lockedUntil > now ? lockedUntil : 0,
    lockoutActive: lockedUntil > now,
    remainingMs: lockedUntil > now ? lockedUntil - now : 0,
    maxWrongAttempts: MAX_WRONG_ATTEMPTS,
    lockoutHours: 10,
  };
});

ipcMain.handle("set-login-pin", (_, pin, currentPin) => {
  const nextPin = String(pin || "");
  const settings = getSettings();
  const existing = getAuthRecord();
  if (settings.authBlob && !existing) {
    return { ok: false, error: "The existing security record cannot be decrypted. Refusing to replace it automatically." };
  }
  if (!/^\d{6}$/.test(nextPin)) return { ok: false, error: "PIN must be exactly 6 digits." };
  const now = Date.now();
  if (existing.salt && existing.hash) {
    if (Number(existing.lockedUntil || 0) > now) {
      return { ok: false, error: "PIN changes are locked until the security lockout ends.", lockedUntil: existing.lockedUntil };
    }
    if (!verifyPin(String(currentPin || ""), existing)) {
      return { ok: false, error: "Current PIN is incorrect." };
    }
  }
  const salt = crypto.randomBytes(16).toString("hex");
  saveAuthRecord({
    salt,
    hash: hashPin(nextPin, salt),
    updatedAt: new Date().toISOString(),
    failedAttempts: 0,
    lockedUntil: 0,
  });
  return { ok: true };
});

ipcMain.handle("verify-login-pin", (_, pin) => {
  const settings = getSettings();
  const auth = getAuthRecord();
  if (settings.authBlob && !auth) {
    return { configured: true, valid: false, storageError: true, error: "The saved security record cannot be decrypted. Access is blocked." };
  }
  if (!auth.salt || !auth.hash) return { configured: false, valid: true };
  const now = Date.now();
  const lockedUntil = Number(auth.lockedUntil || 0);
  if (lockedUntil > now) {
    return {
      configured: true,
      valid: false,
      locked: true,
      lockedUntil,
      remainingMs: lockedUntil - now,
      failedAttempts: MAX_WRONG_ATTEMPTS,
      attemptsRemaining: 0,
    };
  }

  // Clear an expired lockout before accepting a new attempt.
  if (lockedUntil > 0) {
    auth.lockedUntil = 0;
    auth.failedAttempts = 0;
    saveAuthRecord(auth);
  }

  const valid = /^\d{6}$/.test(String(pin || "")) && verifyPin(String(pin || ""), auth);
  if (valid) {
    auth.failedAttempts = 0;
    auth.lockedUntil = 0;
    saveAuthRecord(auth);
    return { configured: true, valid: true, failedAttempts: 0, attemptsRemaining: MAX_WRONG_ATTEMPTS };
  }

  auth.failedAttempts = Number(auth.failedAttempts || 0) + 1;
  if (auth.failedAttempts >= MAX_WRONG_ATTEMPTS) {
    auth.lockedUntil = now + LOCKOUT_MS;
    saveAuthRecord(auth);
    return {
      configured: true,
      valid: false,
      locked: true,
      lockedUntil: auth.lockedUntil,
      remainingMs: LOCKOUT_MS,
      failedAttempts: MAX_WRONG_ATTEMPTS,
      attemptsRemaining: 0,
    };
  }

  saveAuthRecord(auth);
  return {
    configured: true,
    valid: false,
    locked: false,
    failedAttempts: auth.failedAttempts,
    attemptsRemaining: MAX_WRONG_ATTEMPTS - auth.failedAttempts,
  };
});

ipcMain.handle("save-setting", (_, key, value) => {
  try {
    const settings = readJsonFile(getSettingsFilePath(), {}) || {};
    settings[key] = value;
    writeJsonFileAtomic(getSettingsFilePath(), settings);
    return true;
  } catch (err) {
    console.error("Failed to save setting:", err);
    return false;
  }
});

ipcMain.handle("get-user-data-path", () => app.getPath("userData"));
ipcMain.handle("get-export-log-path", () => getLogFilePath());
ipcMain.handle("get-download-path", (_, filename) => path.join(app.getPath("downloads"), path.basename(String(filename || "export"))));
ipcMain.handle("save-export-file", async (event, payload) => {
  try {
    const filename = path.basename(String(payload?.filename || "export"));
    const data = payload?.data;
    if (!data) return { canceled: true };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(parent || undefined, {
      title: "Save exported file",
      defaultPath: path.join(app.getPath("downloads"), filename),
      buttonLabel: "Save",
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const buffer = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
    fs.writeFileSync(result.filePath, buffer);
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    console.error("Failed to save export file:", err);
    return { canceled: false, error: err instanceof Error ? err.message : "Unable to save file." };
  }
});
ipcMain.handle("get-printers", async (event) => {
  try {
    const printers = await event.sender.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName,
      description: printer.description || "",
      status: printer.status,
      isDefault: Boolean(printer.isDefault),
    })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));
  } catch (err) {
    console.error("Failed to get printers:", err);
    return [];
  }
});

ipcMain.handle("print-html", async (event, payload) => {
  const rawHtml = payload && typeof payload.html === "string" ? payload.html : "";
  const printerName = payload && typeof payload.printerName === "string" ? payload.printerName : "";
  const options = payload && payload.options && typeof payload.options === "object" ? payload.options : {};
  const paperSizes = {
    folio: { width: 215900, height: 330200 },
    a4: { width: 210000, height: 297000 },
    letter: { width: 215900, height: 279400 },
    legal: { width: 215900, height: 355600 },
    a3: { width: 297000, height: 420000 },
  };
  const requestedPaper = typeof options.paperSize === "string" && paperSizes[options.paperSize] ? options.paperSize : "folio";
  const requestedOrientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const baseSize = paperSizes[requestedPaper];
  // Keep the physical media definition in its native (portrait) dimensions
  // and let Electron/Chromium apply the orientation explicitly. Several
  // Windows printer drivers interpret a swapped custom media size as a
  // portrait sheet even when the page content is visually landscape. Using the
  // native media size + `landscape: true` gives the driver one unambiguous
  // orientation instruction.
  // Windows printer drivers are more reliable when landscape is represented by
  // the actual rotated custom media dimensions instead of relying on Electron's boolean landscape flag. Portrait keeps the native paper dimensions.
  const landscape = requestedOrientation === "landscape";
  const pageSize = landscape
    ? { width: baseSize.height, height: baseSize.width }
    : { width: baseSize.width, height: baseSize.height };
  const orientedWidthMm = pageSize.width / 1000;
  const orientedHeightMm = pageSize.height / 1000;
  const html = rawHtml.replace(/<\/head>/i, `<style data-cbms-electron-print>@page{size:${orientedWidthMm}mm ${orientedHeightMm}mm;margin:0}.print-page{width:${orientedWidthMm}mm!important;min-width:${orientedWidthMm}mm!important;height:${orientedHeightMm}mm!important;min-height:${orientedHeightMm}mm!important}</style></head>`);
  if (!html) return { ok: false, error: "No printable report content was supplied." };

  const parent = BrowserWindow.fromWebContents(event.sender);
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    parent: parent || undefined,
    modal: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      // Use the native Windows print dialog. Landscape is represented by
      // rotated custom media dimensions and an explicit false landscape flag,
      // preventing drivers from applying a second rotation back to portrait.
      printWindow.webContents.print({
        silent: false,
        deviceName: printerName || undefined,
        printBackground: true,
        color: true,
        landscape: false,
        pageSize,
        margins: { marginType: "none" },
      }, (success, failureReason) => {
        if (!printWindow.isDestroyed()) printWindow.close();
        resolve(success ? { ok: true } : { ok: false, error: failureReason || "Printing was cancelled or failed." });
      });
    });
  } catch (err) {
    if (!printWindow.isDestroyed()) printWindow.close();
    console.error("Print failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Printing failed." };
  }
});

ipcMain.handle("debug-read-file", (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error("debug-read-file failed:", err);
    return null;
  }
});
// ────────────────────────────────────────────────────────


function tryPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => resolve(null));
    srv.listen(port, "127.0.0.1", () => {
      const actual = srv.address().port;
      srv.close(() => resolve(actual));
    });
  });
}

// Prefer a fixed port so the app origin (and its localStorage) stays stable between launches.
async function getFreePort() {
  const preferred = await tryPort(43117);
  if (preferred) return preferred;
  const any = await tryPort(0);
  if (any) return any;
  throw new Error("No free port available");
}



function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, () => {
        req.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Server did not start in time"));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function startServer() {
  const candidates = [
    path.join(process.resourcesPath || "", ".output", "server", "index.mjs"),
    path.join(process.resourcesPath || "", "app", ".output", "server", "index.mjs"),
    path.join(__dirname, ".output", "server", "index.mjs"),
    path.join(__dirname, "..", ".output", "server", "index.mjs"),
  ];

  const serverEntry = candidates.find((c) => c && fs.existsSync(c));
  if (!serverEntry) {
    throw new Error(`Build output not found at any candidate path.`);
  }

  const port = await getFreePort();

  serverProcess = fork(serverEntry, [], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  return url;
}

let updaterInterval = null;

function sendUpdaterEvent(channel, payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send(channel, payload); } catch {}
    }
  }
}

ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) return { ok: false, packaged: false, message: "Updates are available only in the packaged desktop application." };
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo || null;
    if (info && info.version && info.version !== app.getVersion()) {
      sendUpdaterEvent("updater-status", { state: "available", version: info.version, currentVersion: app.getVersion() });
      return { ok: true, state: "available", version: info.version, currentVersion: app.getVersion() };
    }
    sendUpdaterEvent("updater-status", { state: "up-to-date", currentVersion: app.getVersion() });
    return { ok: true, state: "up-to-date", currentVersion: app.getVersion() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to check for updates.";
    sendUpdaterEvent("updater-status", { state: "error", message });
    return { ok: false, state: "error", message };
  }
});

async function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    minWidth: 380,
    title: "MutiaLytics - CBMS Insights",
    backgroundColor: "#0f1a17",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "src", "assets", "favicon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"), // Changed to preload.cjs
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const url = await startServer();
  await win.loadURL(url);
  // Launch maximized to the Windows work area (taskbar remains visible);
  // this is intentionally not Electron's exclusive fullscreen mode.
  win.maximize();
  win.show();
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterEvent("updater-status", { state: "checking", currentVersion: app.getVersion() });
  });
  autoUpdater.on("update-available", (info) => {
    sendUpdaterEvent("updater-status", {
      state: "available",
      version: info?.version || "unknown",
      currentVersion: app.getVersion(),
    });
  });
  autoUpdater.on("update-not-available", () => {
    sendUpdaterEvent("updater-status", { state: "up-to-date", currentVersion: app.getVersion() });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent("updater-status", {
      state: "downloading",
      percent: Number.isFinite(progress?.percent) ? Math.round(progress.percent) : 0,
      version: autoUpdater?.updateInfo?.version || "",
      currentVersion: app.getVersion(),
    });
  });
  autoUpdater.on("update-downloaded", async (info) => {
    sendUpdaterEvent("updater-status", {
      state: "downloaded",
      version: info?.version || "unknown",
      currentVersion: app.getVersion(),
    });
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "MutiaLytics Update Ready",
      message: `MutiaLytics ${info?.version || "new"} is ready to install.`,
      detail: "The update has finished downloading. Restart now to apply it, or choose Later to install automatically the next time the application closes.",
    });
    if (result.response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  autoUpdater.on("error", (err) => {
    sendUpdaterEvent("updater-status", { state: "error", message: err?.message || "Update check failed." });
    console.error("MutiaLytics auto-update error:", err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error("Initial update check failed:", err));
  }, 10000);
  updaterInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error("Scheduled update check failed:", err));
  }, 30 * 60 * 1000);
}

app.whenReady().then(() => {
  getLogFilePath(); // Forces the saves folder to create immediately on startup
  createWindow();
  configureAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("quit", () => {
  if (serverProcess) serverProcess.kill();
});
