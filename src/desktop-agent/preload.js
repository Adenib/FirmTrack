const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('firmtrack', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  getQueueLength: () => ipcRenderer.invoke('get-queue-length'),
})
