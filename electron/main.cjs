const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { Worker } = require("node:worker_threads");
const { autoUpdater } = require("electron-updater");
const entry = pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
let window,
  speechWorker,
  speaking = false,
  updateReady = false,
  available = false,
  updateBusy = false,
  updateMessage = "Check for updates to get started.";
const keyNames = new Set([
  "ollama",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "groq",
  "custom",
]);
function trusted(event) {
  const frameURL = new URL(event.senderFrame?.url || "about:blank");
  frameURL.hash = "";
  if (
    event.sender !== window?.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    frameURL.href !== entry
  )
    throw Error("Untrusted caller.");
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    trusted(event);
    return fn(...args);
  });
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  handle("provider:request", async (r) => {
    if (!r || !["GET", "POST"].includes(r.method) || typeof r.url !== "string")
      throw Error("Invalid provider request.");
    const url = new URL(r.url);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Only HTTPS provider endpoints are supported.");
    const allowed = [
      "content-type",
      "authorization",
      "x-api-key",
      "anthropic-version",
      "x-goog-api-key",
    ];
    if (
      !r.headers ||
      Object.entries(r.headers).some(
        ([k, v]) =>
          !allowed.includes(k.toLowerCase()) ||
          typeof v !== "string" ||
          v.length > 10000,
      )
    )
      throw Error("Invalid headers.");
    const body = r.body ? JSON.stringify(r.body) : undefined;
    if (body && body.length > 8000000) throw Error("Message is too large.");
    const res = await fetch(url, {
      method: r.method,
      headers: r.headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok)
      throw Error(
        `Provider returned ${res.status}. Check your API key, endpoint and selected model.`,
      );
    const text = await res.text();
    if (text.length > 5e6) throw Error("Provider response is too large.");
    return JSON.parse(text);
  });
  handle("provider:key", async (provider, value) => {
    if (
      !keyNames.has(provider) ||
      (value !== undefined &&
        (typeof value !== "string" || value.length > 10000))
    )
      throw Error("Invalid key request.");
    const file = path.join(app.getPath("userData"), `key-${provider}.bin`);
    if (value === "") {
      await fs.rm(file, { force: true });
      return "";
    }
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw Error(
        "Secure operating-system storage is unavailable. Use a session key.",
      );
    if (value !== undefined) {
      await fs.writeFile(file, safeStorage.encryptString(value), {
        mode: 0o600,
      });
      return "";
    }
    try {
      return safeStorage.decryptString(await fs.readFile(file));
    } catch (e) {
      if (e.code === "ENOENT") return "";
      throw Error("Saved key could not be decrypted. Enter it again.");
    }
  });
  handle("speech", async (text) => {
    if (speaking) throw Error("Speech is still being generated.");
    if (typeof text !== "string" || !text.trim() || text.length > 12000)
      throw Error("Speech supports up to 12,000 characters.");
    speaking = true;
    return new Promise((resolve, reject) => {
      speechWorker ||= new Worker(path.join(__dirname, "speech-worker.mjs"));
      const worker = speechWorker;
      const timer = setTimeout(() => {
        worker.terminate();
        speechWorker = null;
        finish(Error("Speech timed out."));
      }, 30000);
      function finish(err, result) {
        clearTimeout(timer);
        worker.removeAllListeners("message");
        worker.removeAllListeners("error");
        speaking = false;
        err ? reject(err) : resolve(result);
      }
      worker.once("message", (m) =>
        m.error ? finish(Error(m.error)) : finish(null, m.audio),
      );
      worker.once("error", () => {
        speechWorker = null;
        finish(Error("Speech worker failed."));
      });
      worker.postMessage(text);
    });
  });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("error", () => {
    updateBusy = false;
    updateMessage =
      "Update check/download failed. Check your connection and the published release assets.";
  });
  autoUpdater.on("update-available", () => {
    available = true;
    updateMessage = "An update is available. Choose Download update.";
  });
  autoUpdater.on("update-not-available", () => {
    available = false;
    updateMessage = "You are up to date.";
  });
  autoUpdater.on("update-downloaded", () => {
    updateReady = true;
    updateBusy = false;
    updateMessage = "Update downloaded. Choose Restart & install.";
  });
  handle("update", async (action) => {
    if (!app.isPackaged || process.platform !== "win32")
      return "Updates are available in installed Windows builds.";
    if (updateBusy) return "An update operation is already in progress.";
    if (action === "check") {
      updateBusy = true;
      try {
        await autoUpdater.checkForUpdates();
        return updateMessage;
      } finally {
        updateBusy = false;
      }
    }
    if (action === "download") {
      if (!available) return "Check for updates first.";
      updateBusy = true;
      try {
        await autoUpdater.downloadUpdate();
        return updateMessage;
      } finally {
        updateBusy = false;
      }
    }
    if (action === "install") {
      if (!updateReady) return "No downloaded update is ready.";
      setImmediate(() => autoUpdater.quitAndInstall());
      return "Restarting…";
    }
    throw Error("Unknown update action.");
  });
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 650,
    title: "PrimeLedger",
    backgroundColor: "#f7f8f5",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== entry) event.preventDefault();
  });
  window.loadFile(path.join(__dirname, "../dist/index.html"));
  if (app.isPackaged && process.platform === "win32")
    window.webContents.once("did-finish-load", () => {
      autoUpdater.checkForUpdates().catch(() => {});
    });
  if (process.env.PRIMELEDGER_SMOKE === "1") {
    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript(
          `(async()=>{let attempts=0;while(!document.querySelector('.brand')){if(++attempts>200)throw Error('Renderer readiness timeout');await new Promise(r=>setTimeout(r,50));}document.querySelector('.brand').click();await new Promise(r=>setTimeout(r,50));if(location.href.endsWith('#'))throw Error('Logo navigation changed the document URL');location.hash='smoke';await new Promise(r=>setTimeout(r,50));const voice=await window.desktop.speak('PrimeLedger is ready.');await new Promise((resolve,reject)=>{const audio=new Audio('data:audio/wav;base64,'+voice);audio.onloadeddata=resolve;audio.onerror=()=>reject(Error('Speech WAV could not load'));setTimeout(()=>reject(Error('Audio load timeout')),10000);audio.load();});return {title:document.title,bytes:voice.length,headings:document.body.innerText.includes('A clearer picture.')};})()`,
        );
        console.log(JSON.stringify(result));
        app.exit(result.headings && result.bytes > 1000 ? 0 : 1);
      } catch (e) {
        console.error(e.message);
        app.exit(1);
      }
    });
  }
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => speechWorker?.terminate());
