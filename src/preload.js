const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  autoDetect: () => ipcRenderer.invoke('auto-detect'),
  getGameflow: () => ipcRenderer.invoke('get-gameflow'),
  setVisibility: (shouldShow) => ipcRenderer.send('set-window-visibility', shouldShow),
  openGraph: () => ipcRenderer.send('open-graph'),
  closeGraph: () => ipcRenderer.send('close-graph'),
  minimizeGraph: () => ipcRenderer.send('minimize-graph'),
  maximizeGraph: () => ipcRenderer.send('maximize-graph')
});