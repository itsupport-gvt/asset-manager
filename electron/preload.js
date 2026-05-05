'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assetManager', {
  saveConfig:    (cfg) => ipcRenderer.invoke('save-config', cfg),
  getConfig:     ()    => ipcRenderer.invoke('get-config'),
  setupComplete: (cfg) => ipcRenderer.invoke('setup-complete', cfg),
  getPort:       ()    => ipcRenderer.invoke('get-port'),

  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  openSettings:    () => ipcRenderer.invoke('open-settings'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  showAbout:       () => ipcRenderer.invoke('show-about'),
  setTheme:        (t) => ipcRenderer.invoke('set-theme', t),
});
