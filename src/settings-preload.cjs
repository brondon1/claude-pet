/**
 * 设置窗口的预加载：只暴露读 / 存设置。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s),
  openFile: () => ipcRenderer.invoke('settings:open-file'),
});
