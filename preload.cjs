const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronLog", {
  getLog: () => ipcRenderer.invoke("get-export-log"),
  saveLog: (entries, replace) => ipcRenderer.invoke("save-export-log", entries, replace === true),
  clearLog: () => ipcRenderer.invoke("delete-export-log"),
  getLogPath: () => ipcRenderer.invoke("get-export-log-path"),
});

contextBridge.exposeInMainWorld("electronStore", {
  getSetting: (key) => ipcRenderer.invoke("get-setting", key),
  saveSetting: (key, value) => ipcRenderer.invoke("save-setting", key, value),
  getAuthState: () => ipcRenderer.invoke("get-auth-state"),
  setLoginPin: (pin, currentPin) => ipcRenderer.invoke("set-login-pin", pin, currentPin),
  verifyLoginPin: (pin) => ipcRenderer.invoke("verify-login-pin", pin),
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
  getExportLogPath: () => ipcRenderer.invoke("get-export-log-path"),
  getDownloadPath: (filename) => ipcRenderer.invoke("get-download-path", filename),
  saveExportFile: (filename, data) => ipcRenderer.invoke("save-export-file", { filename, data }),
});

contextBridge.exposeInMainWorld("electronDebug", {
  readFile: (path) => ipcRenderer.invoke("debug-read-file", path),
});


contextBridge.exposeInMainWorld("electronPrint", {
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printHtml: (html, printerName, options) => ipcRenderer.invoke("print-html", { html, printerName: printerName || "", options: options || {} }),
});

contextBridge.exposeInMainWorld("electronApp", {
  getVersion: () => ipcRenderer.invoke("get-app-version"),
});

contextBridge.exposeInMainWorld("electronUpdater", {
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  onStatus: (callback) => {
    const handler = (_, payload) => callback?.(payload);
    ipcRenderer.on("updater-status", handler);
    return () => ipcRenderer.removeListener("updater-status", handler);
  },
});
