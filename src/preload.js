const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  autoDetect: () => ipcRenderer.invoke('auto-detect'),
  getGameflow: () => ipcRenderer.invoke('get-gameflow')
});