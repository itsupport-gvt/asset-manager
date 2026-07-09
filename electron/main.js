'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path  = require('path');
const fs    = require('fs');
const net   = require('net');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
const msal   = require('@azure/msal-node');

// ── Paths ─────────────────────────────────────────────────────────────────────
const APP_DATA_DIR = path.join(app.getPath('appData'), 'AssetManager');
const CONFIG_FILE  = path.join(APP_DATA_DIR, 'config.json');
const ENV_FILE     = path.join(APP_DATA_DIR, '.env');
const BACKEND_DIR  = app.isPackaged
  ? path.join(process.resourcesPath, 'backend')
  : path.join(__dirname, '..', 'backend');
const BACKEND_EXE  = app.isPackaged
  ? path.join(BACKEND_DIR, 'asset-backend.exe')
  : null;  // dev mode: backend runs separately

// ── Ensure AppData dir ───────────────────────────────────────────────────────
if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow   = null;
let splashWindow = null;
let setupWindow  = null;
let backendProc  = null;
let backendPort  = 8000;

// Per-launch secret token — passed to backend via env var, exposed via IPC
const APP_SECRET_TOKEN = crypto.randomBytes(32).toString('hex');

// MSAL state
const MSAL_CACHE_FILE = path.join(APP_DATA_DIR, 'msal-cache.bin');
let _msalApp     = null;
let _msalAccount = null;
let _msIdToken   = null;

// Auto-sync state — Electron-driven loop that calls the local backend's
// /api/sync/push and /api/sync/pull every AUTO_SYNC_INTERVAL_MS.
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // 60 minutes
let _autoSyncTimer = null;

// Default Auth Client ID — read from env or baked-in build config
let _DEFAULT_AUTH_CLIENT_ID = (process.env.ASSET_AUTH_CLIENT_ID || '').trim();
if (!_DEFAULT_AUTH_CLIENT_ID) {
  try {
    const buildCfg = require('./build-config.json');
    _DEFAULT_AUTH_CLIENT_ID = (buildCfg.authClientId || '').trim();
  } catch { /* build-config.json not present — ok in local dev */ }
}

// Bootstrap SharePoint path (bootstrap.json stores the file URL for new installs)
const BOOTSTRAP_PATH = '/sites/root/drive/root:/Asset%20Manager/bootstrap.json';

// UI settings (theme, etc.)
const UI_SETTINGS_FILE = path.join(APP_DATA_DIR, 'ui-settings.json');

function readUiSettings() {
  try { return JSON.parse(fs.readFileSync(UI_SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}
function writeUiSettings(patch) {
  const current = readUiSettings();
  const merged  = { ...current, ...patch };
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(UI_SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
}

// ── MSAL helpers ──────────────────────────────────────────────────────────────

function _createMsalCachePlugin() {
  return {
    beforeCacheAccess: async (ctx) => {
      try {
        if (!fs.existsSync(MSAL_CACHE_FILE)) return;
        const raw  = fs.readFileSync(MSAL_CACHE_FILE);
        const text = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(raw)
          : raw.toString('utf-8');
        ctx.tokenCache.deserialize(text);
      } catch { /* first run or corrupted — start fresh */ }
    },
    afterCacheAccess: async (ctx) => {
      if (!ctx.cacheHasChanged) return;
      try {
        const text = ctx.tokenCache.serialize();
        const data = safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(text)
          : Buffer.from(text, 'utf-8');
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        fs.writeFileSync(MSAL_CACHE_FILE, data);
      } catch (e) { console.error('[msal] cache write error:', e.message); }
    },
  };
}

function initMsal(config) {
  const authClientId = (config && config.AUTH_CLIENT_ID) || _DEFAULT_AUTH_CLIENT_ID;
  if (!authClientId) { _msalApp = null; return; }
  // Always use 'organizations' (multi-tenant) — tenant is discovered from the ID token.
  const authority = 'https://login.microsoftonline.com/organizations';
  _msalApp = new msal.PublicClientApplication({
    auth: { clientId: authClientId, authority },
    cache: { cachePlugin: _createMsalCachePlugin() },
    system: { loggerOptions: { logLevel: msal.LogLevel.Warning, piiLoggingEnabled: false } },
  });
  console.log(`[msal] initialised clientId=${authClientId.slice(0,8)}…`);
}

const _MSAL_SCOPES  = ['openid', 'profile', 'email', 'offline_access'];
const _GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite.All', 'Sites.ReadWrite.All'];
const _ALL_SCOPES   = [..._MSAL_SCOPES, ..._GRAPH_SCOPES];

async function msAcquireSilent() {
  if (!_msalApp) return null;
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts();
    if (!accounts || accounts.length === 0) return null;
    if (!_msalAccount && accounts.length > 1) return null;
    const account = _msalAccount || accounts[0];
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('silent acquire timeout')), 5000)
    );
    const result  = await Promise.race([
      _msalApp.acquireTokenSilent({ scopes: _MSAL_SCOPES, account }),
      timeout,
    ]);
    _msalAccount  = result.account;
    _msIdToken    = result.idToken;
    return result;
  } catch (e) { console.error('[msal] silent acquire failed:', e.message); return null; }
}

async function msAcquireInteractive() {
  if (!_msalApp) throw new Error('Auth not configured');
  const result = await _msalApp.acquireTokenInteractive({
    scopes: _ALL_SCOPES,
    redirectUri: 'http://localhost',
    openBrowser: async (url) => { await shell.openExternal(url); },
    successTemplate: '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#188038">Login successful!</h2><p>You can close this tab and return to Asset Manager.</p></body></html>',
    errorTemplate:   '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#d93025">Login failed</h2><p>{error}</p></body></html>',
  });
  _msalAccount = result.account;
  _msIdToken   = result.idToken;
  return result;
}

async function msAcquireGraphToken({ allowInteractive = true } = {}) {
  if (!_msalApp) return null;
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts();
    if (accounts && accounts.length > 0 && (_msalAccount || accounts.length === 1)) {
      const account = _msalAccount || accounts[0];
      const result  = await _msalApp.acquireTokenSilent({ scopes: _GRAPH_SCOPES, account });
      if (result && result.accessToken) return result.accessToken;
    }
  } catch (e) { console.error('[msal] silent graph token failed:', e.message); }
  if (!allowInteractive) return null;
  try {
    const result = await _msalApp.acquireTokenInteractive({
      scopes: _GRAPH_SCOPES, redirectUri: 'http://localhost',
      openBrowser: async (url) => { await shell.openExternal(url); },
      successTemplate: '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#188038">SharePoint access granted</h2><p>You can close this tab and return to Asset Manager.</p></body></html>',
      errorTemplate:   '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#d93025">Consent failed</h2><p>{error}</p></body></html>',
    });
    if (result && result.account) _msalAccount = result.account;
    return result ? result.accessToken : null;
  } catch (e) { console.error('[msal] interactive graph token failed:', e.message); return null; }
}

function _msUserFromResult(result) {
  if (!result) return null;
  return {
    name:  result.account.name             || '',
    email: result.account.username         || '',
    oid:   result.account.localAccountId   || '',
    token: result.idToken                  || '',
  };
}

// ── Bootstrap helpers ─────────────────────────────────────────────────────────

async function fetchBootstrap() {
  const token = await msAcquireGraphToken({ allowInteractive: false });
  if (!token) return null;
  try {
    const httpsMod = require('https');
    return await new Promise((resolve) => {
      const req = httpsMod.request({
        method: 'GET',
        hostname: 'graph.microsoft.com',
        path: `/v1.0${BOOTSTRAP_PATH}:/content`,
        headers: { Authorization: `Bearer ${token}` },
      }, (res) => {
        if (res.statusCode === 404) { resolve(null); res.resume(); return; }
        if (res.statusCode !== 200) {
          console.log(`[bootstrap] fetch returned ${res.statusCode}`);
          resolve(null); res.resume(); return;
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on('error', (e) => { console.log('[bootstrap] fetch error: ' + e.message); resolve(null); });
      req.end();
    });
  } catch (e) {
    console.log('[bootstrap] fetch threw: ' + e.message);
    return null;
  }
}

async function uploadBootstrap(bootstrap) {
  const token = await msAcquireGraphToken({ allowInteractive: true });
  if (!token) return { ok: false, error: 'No Graph token — sign in first' };
  try {
    const httpsMod = require('https');
    const payload  = Buffer.from(JSON.stringify(bootstrap, null, 2), 'utf-8');
    return await new Promise((resolve) => {
      const req = httpsMod.request({
        method: 'PUT',
        hostname: 'graph.microsoft.com',
        path: `/v1.0${BOOTSTRAP_PATH}:/content`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      }, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
          else { console.log(`[bootstrap] upload ${res.statusCode}: ${body}`); resolve({ ok: false, error: `HTTP ${res.statusCode}` }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.write(payload);
      req.end();
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Auto-sync loop ────────────────────────────────────────────────────────────

async function runAutoSync() {
  if (!_msalApp) return;  // auth not configured
  // Silent-only — never trigger interactive consent during background sync.
  const graphToken = await msAcquireGraphToken({ allowInteractive: false });
  if (!graphToken) {
    console.log('[autosync] skipped — no Graph token (silent acquire failed)');
    return;
  }
  const baseUrl = `http://127.0.0.1:${backendPort}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-App-Token': APP_SECRET_TOKEN,
    'X-MS-Graph-Token': graphToken,
    'Authorization': `Bearer ${_msIdToken || ''}`,
  };
  const httpMod = require('http');
  const postJson = (p) => new Promise((resolve) => {
    const req = httpMod.request(`${baseUrl}${p}`, { method: 'POST', headers, timeout: 120000 }, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end();
  });
  try {
    const push = await postJson('/api/sync/push');
    console.log(`[autosync] push HTTP ${push.status}`);
    const pull = await postJson('/api/sync/pull');
    console.log(`[autosync] pull HTTP ${pull.status}`);
  } catch (e) {
    console.log('[autosync] error: ' + e.message);
  }
}

function startAutoSync() {
  if (_autoSyncTimer) return;
  _autoSyncTimer = setInterval(() => {
    runAutoSync().catch((e) => console.log('[autosync] unhandled: ' + e.message));
  }, AUTO_SYNC_INTERVAL_MS);
  console.log(`[autosync] started (interval=${AUTO_SYNC_INTERVAL_MS / 1000}s)`);
}

function stopAutoSync() {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = null;
    console.log('[autosync] stopped');
  }
}

// ── Config helpers ────────────────────────────────────────────────────────────
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function writeEnvFromConfig(cfg) {
  const lines = [
    `SHAREPOINT_FILE_URL=${cfg.SHAREPOINT_FILE_URL || ''}`,
    `NGROK_URL=${cfg.NGROK_URL || ''}`,
    `AUTH_CLIENT_ID=${cfg.AUTH_CLIENT_ID || _DEFAULT_AUTH_CLIENT_ID || ''}`,
  ];
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf8');
}

// ── Port helpers ──────────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port);
  });
}

async function findFreePort(start = 8000) {
  for (let p = start; p < start + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  return start;
}

// ── Backend polling ───────────────────────────────────────────────────────────
function pollBackendReady(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (Date.now() - started > timeout) { reject(new Error('Backend timeout')); return; }
      const req = require('http').request({ hostname: '127.0.0.1', port, path: '/health', timeout: 1500 },
        (res) => { if (res.statusCode === 200) resolve(); else setTimeout(check, 500); });
      req.on('error', () => setTimeout(check, 500));
      req.end();
    };
    check();
  });
}

// ── Splash window ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360, height: 300,
    resizable: false, frame: false, center: true,
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Setup window ──────────────────────────────────────────────────────────────
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 560, height: 720,
    resizable: false, center: true,
    title: 'Asset Manager — Setup',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
}


// ── Spawn backend ─────────────────────────────────────────────────────────────
function spawnBackend(port) {
  if (!app.isPackaged || !BACKEND_EXE || !fs.existsSync(BACKEND_EXE)) {
    console.log('[Electron] Dev mode — backend not spawned (run uvicorn separately)');
    return;
  }

  const env = {
    ...process.env,
    PORT: String(port),
    ASSET_DATA_DIR: APP_DATA_DIR,
    PYTHONUNBUFFERED: '1',
    APP_SECRET_TOKEN: APP_SECRET_TOKEN,
  };

  // If syncFrontend() copied files, tell backend to serve from there
  const syncedStatic = path.join(APP_DATA_DIR, 'static');
  if (fs.existsSync(syncedStatic)) env.FRONTEND_STATIC_DIR = syncedStatic;

  backendProc = spawn(BACKEND_EXE, [], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProc.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProc.stderr.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProc.on('exit', (code) => {
    console.log(`[Electron] Backend exited with code ${code}`);
  });
}

// ── Kill backend ──────────────────────────────────────────────────────────────
function killBackend() {
  // Kill tracked PID first
  if (backendProc) {
    try { execSync(`taskkill /PID ${backendProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
    backendProc = null;
  }
  // Also kill by name — handles orphaned processes from failed/partial updates
  try { execSync('taskkill /IM asset-backend.exe /T /F', { stdio: 'ignore' }); } catch {}
}

// ── App menu (hidden — actions exposed via IPC instead) ───────────────────────
function buildMenu() {
  Menu.setApplicationMenu(null);
}

// ── Sync frontend from ASAR to userData ───────────────────────────────────────
// electron-updater always replaces the ASAR but may not replace the PyInstaller
// backend bundle if asset-backend.exe is locked. Copying from ASAR on every
// launch guarantees the frontend is always current, no matter which exe runs.
function copyDirFromAsar(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dst, item);
    try {
      if (fs.statSync(s).isDirectory()) copyDirFromAsar(s, d);
      else fs.writeFileSync(d, fs.readFileSync(s));
    } catch { /* skip unreadable entries */ }
  }
}

function syncFrontend() {
  if (!app.isPackaged) return;
  const src = path.join(app.getAppPath(), 'frontend-dist');
  const dst = path.join(APP_DATA_DIR, 'static');
  if (!fs.existsSync(src)) { console.log('[Electron] No frontend-dist in ASAR'); return; }
  try {
    if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
    copyDirFromAsar(src, dst);
    console.log('[Electron] Frontend synced from ASAR →', dst);
  } catch (e) { console.warn('[Electron] Frontend sync failed:', e.message); }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('save-config', (_, cfg) => {
  writeConfig(cfg);
  writeEnvFromConfig(cfg);
  return { ok: true };
});

ipcMain.handle('setup-complete', async (_, cfg) => {
  writeConfig(cfg);
  writeEnvFromConfig(cfg);
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.close(); setupWindow = null; }
  await launchApp();
});

ipcMain.handle('get-port', () => backendPort);

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-settings', () => {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
  } else {
    createSetupWindow();
  }
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest  = result && result.updateInfo && result.updateInfo.version;
    const current = app.getVersion();
    if (!latest || latest === current) {
      dialog.showMessageBox({ type: 'info', title: 'Up to date', message: `You are on the latest version (v${current}).` });
    }
  } catch {
    dialog.showMessageBox({ type: 'info', title: 'Update check failed', message: 'Could not reach the update server.', detail: 'Check your internet connection.' });
  }
});

ipcMain.handle('set-theme', (_, theme) => {
  writeUiSettings({ theme });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay({
      color:       theme === 'light' ? '#ffffff' : '#131316',
      symbolColor: theme === 'light' ? '#5f6368' : '#e8eaed',
      height: 56,
    });
  }
  return { ok: true };
});

ipcMain.handle('show-about', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Asset Manager',
    message: `Asset Manager  v${app.getVersion()}`,
    detail: 'Gravity BP — Asset tracking and report generation.',
  });
});

ipcMain.handle('get-app-token', () => APP_SECRET_TOKEN);
ipcMain.handle('get-theme', () => readUiSettings().theme || 'dark');

ipcMain.handle('fetch-bootstrap', async () => {
  return await fetchBootstrap();
});

ipcMain.handle('upload-bootstrap', async (_, bootstrap) => {
  return await uploadBootstrap(bootstrap);
});

ipcMain.handle('init-msal', (_, { authClientId }) => {
  if (!authClientId) return { ok: false, error: 'Auth Client ID required' };
  initMsal({ AUTH_CLIENT_ID: authClientId, SHAREPOINT_TENANT_ID: '' });
  return { ok: _msalApp !== null };
});

ipcMain.handle('ms-login', async () => {
  try {
    const result = await msAcquireInteractive();
    return { ok: true, user: _msUserFromResult(result) };
  } catch (e) {
    console.error('[msal] login error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ms-logout', async () => {
  _msalAccount = null;
  _msIdToken   = null;
  try { if (fs.existsSync(MSAL_CACHE_FILE)) fs.unlinkSync(MSAL_CACHE_FILE); } catch {}
  return { ok: true };
});

ipcMain.handle('get-ms-user', async () => {
  if (!_msalAccount) {
    const result = await msAcquireSilent();
    if (result) return _msUserFromResult(result);
    return null;
  }
  return _msIdToken ? {
    name:  _msalAccount.name             || '',
    email: _msalAccount.username         || '',
    oid:   _msalAccount.localAccountId   || '',
    token: _msIdToken,
  } : null;
});

ipcMain.handle('get-ms-token', async () => {
  const result = await msAcquireSilent();
  return result ? result.idToken : null;
});

ipcMain.handle('get-ms-graph-token', async () => {
  return await msAcquireGraphToken();
});

ipcMain.handle('get-cached-accounts', async () => {
  if (!_msalApp) return [];
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts();
    return (accounts || []).map(a => ({
      homeAccountId: a.homeAccountId,
      name:  a.name     || '',
      email: a.username || '',
    }));
  } catch { return []; }
});

ipcMain.handle('select-account', async (_, homeAccountId) => {
  if (!_msalApp) return { ok: false, error: 'Auth not configured' };
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts();
    const account  = (accounts || []).find(a => a.homeAccountId === homeAccountId);
    if (!account) return { ok: false, error: 'Account not found' };
    const result = await _msalApp.acquireTokenSilent({ scopes: _MSAL_SCOPES, account });
    _msalAccount = result.account;
    _msIdToken   = result.idToken;
    return { ok: true, user: _msUserFromResult(result) };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── Main launch sequence ──────────────────────────────────────────────────────
async function launchApp(initialPath = '') {
  try { execSync('taskkill /IM asset-backend.exe /T /F', { stdio: 'ignore' }); } catch {}
  syncFrontend();

  createSplash();

  try {
    backendPort = await findFreePort(8000);
    const cfg = readConfig();
    if (cfg) {
      writeEnvFromConfig(cfg);
      initMsal(cfg);
    }
    spawnBackend(backendPort);

    // In dev mode the backend is already running on 8000
    const targetPort = app.isPackaged ? backendPort : 8000;
    await pollBackendReady(targetPort, 30000);

    const url = `http://127.0.0.1:${targetPort}${initialPath}`;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(url);
    } else {
      mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        minWidth: 960, minHeight: 600,
        title: 'Asset Manager',
        show: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color:       readUiSettings().theme === 'light' ? '#ffffff' : '#131316',
          symbolColor: readUiSettings().theme === 'light' ? '#5f6368' : '#e8eaed',
          height: 56,
        },
        webPreferences: {
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js'),
        },
      });
      mainWindow.loadURL(url);
      mainWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
        mainWindow.show();
        mainWindow.focus();
      });
      mainWindow.on('closed', () => { mainWindow = null; });
      mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
        shell.openExternal(u);
        return { action: 'deny' };
      });
    }

    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
    startAutoSync();
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch (err) {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    dialog.showErrorBox('Asset Manager — Startup Error', String(err));
    app.quit();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  let cfg = readConfig();

  if (!cfg || !cfg.SHAREPOINT_FILE_URL) {
    // First run (or missing FILE_URL) — try bootstrap from SharePoint before
    // showing the onboarding page.
    if (_DEFAULT_AUTH_CLIENT_ID) {
      initMsal({ AUTH_CLIENT_ID: _DEFAULT_AUTH_CLIENT_ID });
      // Attempt silent sign-in in case this user has a cached session.
      const silent = await msAcquireSilent();
      if (silent) {
        console.log('[bootstrap] silent acquire succeeded — fetching bootstrap.json');
        const bs = await fetchBootstrap();
        if (bs && bs.fileUrl) {
          cfg = { SHAREPOINT_FILE_URL: bs.fileUrl, AUTH_CLIENT_ID: _DEFAULT_AUTH_CLIENT_ID, NGROK_URL: '' };
          writeConfig(cfg);
          console.log('[bootstrap] config auto-written from SharePoint bootstrap');
        }
      }
    }

    if (!cfg || !cfg.SHAREPOINT_FILE_URL) {
      // Bootstrap not found — write a minimal env so the backend can start,
      // then load the onboarding React page.
      const minimal = { SHAREPOINT_FILE_URL: '', AUTH_CLIENT_ID: _DEFAULT_AUTH_CLIENT_ID, NGROK_URL: '' };
      writeEnvFromConfig(minimal);
      await launchApp('/onboarding');
      return;
    }
  }

  await launchApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopAutoSync();
  killBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) launchApp();
});

// ── Auto-updater events ───────────────────────────────────────────────────────
autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', { version: info.version });
  }
});
autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('update-downloaded', () => {
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Restart Now', 'Later'],
    message: 'Update downloaded. Restart to apply?',
  });
  if (choice === 0) {
    // Kill backend BEFORE quitAndInstall so Windows fully releases the exe
    // file handle before the NSIS installer tries to overwrite it.
    killBackend();
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 2000);
  }
});
