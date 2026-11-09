const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  request: (r) => ipcRenderer.invoke("provider:request", r),
  key: (provider, value) => ipcRenderer.invoke("provider:key", provider, value),
  speak: (text) => ipcRenderer.invoke("speech", text),
  update: (action) => ipcRenderer.invoke("update", action),
});
