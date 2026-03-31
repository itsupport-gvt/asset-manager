'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assetManager', {
  /** Save SharePoint / app credentials to config.json */
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  /** Read current config.json (returns null if not set) */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /** Signal that first-run setup is complete */
  setupComplete: (cfg) => ipcRenderer.invoke('setup-complete', cfg),

  /** Get the current backend port (for debugging) */
  getPort: () => ipcRenderer.invoke('get-port'),
});
