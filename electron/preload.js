'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assetManager', {
  // Existing config / setup IPC
  saveConfig:    (cfg) => ipcRenderer.invoke('save-config', cfg),
  getConfig:     ()    => ipcRenderer.invoke('get-config'),
  setupComplete: (cfg) => ipcRenderer.invoke('setup-complete', cfg),
  getPort:       ()    => ipcRenderer.invoke('get-port'),

  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  openSettings:    () => ipcRenderer.invoke('open-settings'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  showAbout:       () => ipcRenderer.invoke('show-about'),

  // Theme
  setTheme: (t) => ipcRenderer.invoke('set-theme', t),
  getTheme: ()  => ipcRenderer.invoke('get-theme'),

  // Per-launch secret token
  getAppToken: () => ipcRenderer.invoke('get-app-token'),

  // Microsoft Entra ID user authentication (PKCE)
  initMsal:          (data) => ipcRenderer.invoke('init-msal', data),
  msLogin:           ()     => ipcRenderer.invoke('ms-login'),
  msLogout:          ()     => ipcRenderer.invoke('ms-logout'),
  getMsUser:         ()     => ipcRenderer.invoke('get-ms-user'),
  getMsToken:        ()     => ipcRenderer.invoke('get-ms-token'),
  getMsGraphToken:   ()     => ipcRenderer.invoke('get-ms-graph-token'),
  getCachedAccounts: ()     => ipcRenderer.invoke('get-cached-accounts'),
  selectAccount:     (id)   => ipcRenderer.invoke('select-account', id),

  // Bootstrap (SharePoint shared config)
  fetchBootstrap:  ()         => ipcRenderer.invoke('fetch-bootstrap'),
  uploadBootstrap: (data)     => ipcRenderer.invoke('upload-bootstrap', data),

  // Update events pushed from main process
  onUpdateAvailable:    (cb) => { ipcRenderer.on('update-available',         (_e, info) => cb(info)); },
  onUpdateNotAvailable: (cb) => { ipcRenderer.on('update-not-available',     () => cb()); },
  onUpdateProgress:     (cb) => { ipcRenderer.on('update-download-progress', (_e, info) => cb(info)); },
});
